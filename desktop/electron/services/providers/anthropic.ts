import type { ProviderProfile } from '../../../shared/contracts'
import type {
  ProviderAdapter,
  ProviderAdapterOptions,
  ProviderChatMessage,
  ProviderConnectionResult,
  ProviderStreamEvent,
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

interface AnthropicEvent {
  type?: string
  message?: {
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  delta?: {
    type?: string
    text?: string
    thinking?: string
    partial_json?: string
    stop_reason?: string | null
  }
  content_block?: {
    type?: string
    name?: string
  }
  usage?: { input_tokens?: number; output_tokens?: number }
  error?: { message?: string; type?: string }
}

export class AnthropicProvider implements ProviderAdapter {
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
      const response = await fetch(resolveProviderUrl(this.profile.baseUrl, 'v1/messages'), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: this.profile.defaultModel,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
        signal: request.signal,
      })

      if (!response.ok) {
        const detail = await readSafeErrorBody(response, this.apiKey, this.maxErrorBodyBytes)
        if (response.status === 400 && /max[_ -]?tokens|token/i.test(detail)) {
          return {
            ok: true,
            latencyMs: Date.now() - startedAt,
            models: [this.profile.defaultModel],
            message: 'Anthropic 服务可访问，模型参数由服务端校验。',
          }
        }
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
        message: 'Anthropic 服务连接成功。',
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
    const { system, conversation } = normalizeAnthropicMessages(messages)
    let activeToolName: string | undefined
    let emittedFinish = false

    try {
      const response = await fetch(resolveProviderUrl(this.profile.baseUrl, 'v1/messages'), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model,
          max_tokens: 8_192,
          stream: true,
          ...(system ? { system } : {}),
          messages: conversation,
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
        let payload: AnthropicEvent
        try {
          payload = JSON.parse(event.data) as AnthropicEvent
        } catch (cause) {
          throw new ProviderRequestError('Anthropic 返回了无法解析的流式数据。', {
            code: 'INVALID_STREAM_JSON',
            cause,
          })
        }

        if (payload.type === 'error' || event.event === 'error') {
          throw new ProviderRequestError(payload.error?.message || 'Anthropic 服务返回错误。', {
            code: payload.error?.type || 'PROVIDER_ERROR',
          })
        }

        if (payload.type === 'message_start' && payload.message?.usage) {
          yield {
            type: 'usage',
            usage: { inputTokens: payload.message.usage.input_tokens },
          }
        }

        if (payload.type === 'content_block_start' && payload.content_block?.type === 'tool_use') {
          activeToolName = payload.content_block.name
          yield { type: 'tool-call', name: activeToolName }
        }

        if (payload.type === 'content_block_delta') {
          if (payload.delta?.type === 'text_delta' && payload.delta.text) {
            yield { type: 'text-delta', delta: payload.delta.text }
          }
          if (payload.delta?.type === 'thinking_delta' && payload.delta.thinking) {
            yield { type: 'reasoning-delta', delta: payload.delta.thinking }
          }
          if (payload.delta?.type === 'input_json_delta' && payload.delta.partial_json) {
            yield {
              type: 'tool-call',
              name: activeToolName,
              argumentsDelta: payload.delta.partial_json,
            }
          }
        }

        if (payload.type === 'message_delta') {
          if (payload.usage) {
            yield {
              type: 'usage',
              usage: {
                inputTokens: payload.usage.input_tokens,
                outputTokens: payload.usage.output_tokens,
              },
            }
          }
          if (payload.delta?.stop_reason) {
            emittedFinish = true
            yield { type: 'finish', reason: payload.delta.stop_reason }
          }
        }

        if (payload.type === 'message_stop') {
          if (!emittedFinish) yield { type: 'finish' }
          return
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
      'anthropic-version': '2023-06-01',
    }
    if (this.apiKey) headers['x-api-key'] = this.apiKey
    return headers
  }
}

function normalizeAnthropicMessages(messages: ProviderChatMessage[]): {
  system: string
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>
} {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')

  const rawConversation = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: message.content,
    }))

  // Anthropic 不接受连续的同角色消息，合并后也能减少无效上下文。
  const conversation: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const message of rawConversation) {
    const previous = conversation.at(-1)
    if (previous?.role === message.role) {
      previous.content += `\n\n${message.content}`
    } else {
      conversation.push({ ...message })
    }
  }

  if (conversation.length === 0) {
    conversation.push({ role: 'user', content: '请根据系统要求继续。' })
  }
  if (conversation[0]?.role === 'assistant') {
    conversation.unshift({ role: 'user', content: '请继续。' })
  }

  return { system, conversation }
}
