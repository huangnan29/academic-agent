import type { ProviderProfile } from '../../../shared/contracts'
import type {
  ProviderAdapter,
  ProviderAdapterOptions,
  ProviderChatMessage,
  ProviderConnectionResult,
  ProviderStreamEvent,
  ProviderUsage,
} from './types'
import {
  assertResponseBody,
  parseSseStream,
  ProviderRequestError,
  readSafeErrorBody,
  requestSignal,
  resolveProviderUrl,
  toProviderError,
} from './utils'

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string
      reasoning_content?: string
      reasoning?: string
      tool_calls?: Array<{
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  error?: { message?: string; code?: string }
}

export class OpenAICompatibleProvider implements ProviderAdapter {
  readonly profile: ProviderProfile
  private readonly apiKey?: string
  private readonly requestTimeoutMs?: number
  private readonly maxErrorBodyBytes?: number

  constructor(profile: ProviderProfile, apiKey?: string, options: ProviderAdapterOptions = {}) {
    this.profile = profile
    this.apiKey = apiKey?.trim() || undefined
    this.requestTimeoutMs = options.requestTimeoutMs
    this.maxErrorBodyBytes = options.maxErrorBodyBytes
  }

  async testConnection(signal?: AbortSignal): Promise<ProviderConnectionResult> {
    const startedAt = Date.now()
    const request = requestSignal(signal, Math.min(this.requestTimeoutMs ?? 15_000, 15_000))

    try {
      const response = await fetch(resolveProviderUrl(this.profile.baseUrl, 'v1/models'), {
        method: 'GET',
        headers: this.headers(),
        signal: request.signal,
      })

      if (!response.ok) {
        const detail = await readSafeErrorBody(response, this.apiKey, this.maxErrorBodyBytes)
        if ([404, 405, 501].includes(response.status)) {
          return this.probeChat(startedAt, request.signal)
        }
        return {
          ok: false,
          latencyMs: Date.now() - startedAt,
          models: [],
          message: `连接失败（HTTP ${response.status}）${detail}`,
        }
      }

      const payload = (await response.json().catch(() => ({}))) as {
        data?: Array<{ id?: unknown }>
      }
      const models = (payload.data ?? [])
        .map((item) => (typeof item.id === 'string' ? item.id : ''))
        .filter(Boolean)

      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        models,
        message: '模型服务连接成功。',
      }
    } catch (error) {
      const safeError = toProviderError(error, this.apiKey, request.signal)
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        models: [],
        message: safeError.message,
      }
    } finally {
      request.cleanup()
    }
  }

  private async probeChat(
    startedAt: number,
    signal: AbortSignal,
  ): Promise<ProviderConnectionResult> {
    const response = await fetch(resolveProviderUrl(this.profile.baseUrl, 'v1/chat/completions'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: this.profile.defaultModel,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
      signal,
    })
    if (!response.ok) {
      const detail = await readSafeErrorBody(response, this.apiKey, this.maxErrorBodyBytes)
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        models: [],
        message: `连接失败（HTTP ${response.status}）${detail}`,
      }
    }
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      models: [this.profile.defaultModel],
      message: '模型服务连接成功（聊天端点探测）。',
    }
  }

  async *streamChat(
    messages: ProviderChatMessage[],
    model = this.profile.defaultModel,
    signal?: AbortSignal,
  ): AsyncGenerator<ProviderStreamEvent, void, void> {
    if (!model.trim()) {
      throw new ProviderRequestError('尚未选择模型。', { code: 'MODEL_REQUIRED' })
    }
    if (messages.length === 0) {
      throw new ProviderRequestError('对话消息不能为空。', { code: 'MESSAGES_REQUIRED' })
    }

    const request = requestSignal(signal, this.requestTimeoutMs)
    let emittedFinish = false

    try {
      const response = await fetch(resolveProviderUrl(this.profile.baseUrl, 'v1/chat/completions'), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model,
          messages: messages.map(({ role, content }) => ({
            role: role === 'tool' ? 'user' : role,
            content,
          })),
          stream: true,
        }),
        signal: request.signal,
      })

      if (!response.ok) {
        const detail = await readSafeErrorBody(response, this.apiKey, this.maxErrorBodyBytes)
        throw new ProviderRequestError(`模型请求失败（HTTP ${response.status}）${detail}`, {
          status: response.status,
          code: 'HTTP_ERROR',
        })
      }

      for await (const event of parseSseStream(assertResponseBody(response), request.signal)) {
        if (event.data.trim() === '[DONE]') {
          if (!emittedFinish) yield { type: 'finish' }
          return
        }

        let chunk: OpenAIStreamChunk
        try {
          chunk = JSON.parse(event.data) as OpenAIStreamChunk
        } catch (cause) {
          throw new ProviderRequestError('模型服务返回了无法解析的流式数据。', {
            code: 'INVALID_STREAM_JSON',
            cause,
          })
        }

        if (chunk.error) {
          throw new ProviderRequestError(chunk.error.message || '模型服务返回错误。', {
            code: chunk.error.code || 'PROVIDER_ERROR',
          })
        }

        const usage = mapUsage(chunk.usage)
        if (usage) yield { type: 'usage', usage }

        for (const choice of chunk.choices ?? []) {
          const content = choice.delta?.content
          if (content) yield { type: 'text-delta', delta: content }

          const reasoning = choice.delta?.reasoning_content ?? choice.delta?.reasoning
          if (reasoning) yield { type: 'reasoning-delta', delta: reasoning }

          for (const toolCall of choice.delta?.tool_calls ?? []) {
            yield {
              type: 'tool-call',
              name: toolCall.function?.name,
              argumentsDelta: toolCall.function?.arguments,
            }
          }

          if (choice.finish_reason) {
            emittedFinish = true
            yield { type: 'finish', reason: choice.finish_reason }
          }
        }
      }

      if (!emittedFinish) yield { type: 'finish' }
    } catch (error) {
      throw toProviderError(error, this.apiKey, request.signal)
    } finally {
      request.cleanup()
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`
    return headers
  }
}

function mapUsage(usage: OpenAIStreamChunk['usage']): ProviderUsage | undefined {
  if (!usage) return undefined
  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  }
}
