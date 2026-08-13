const DEFAULT_TIMEOUT_MS = 600_000
const DEFAULT_ERROR_BODY_BYTES = 4_096
const MAX_SSE_BUFFER_BYTES = 1_048_576

export class ProviderRequestError extends Error {
  readonly status?: number
  readonly code?: string

  constructor(message: string, options?: { status?: number; code?: string; cause?: unknown }) {
    super(message, { cause: options?.cause })
    this.name = 'ProviderRequestError'
    this.status = options?.status
    this.code = options?.code
  }
}

export function normalizeBaseUrl(baseUrl: string): URL {
  const trimmed = baseUrl.trim()
  if (!trimmed) {
    throw new ProviderRequestError('服务地址不能为空。', { code: 'INVALID_BASE_URL' })
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch (cause) {
    throw new ProviderRequestError('服务地址格式无效。', {
      code: 'INVALID_BASE_URL',
      cause,
    })
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new ProviderRequestError('服务地址必须使用 HTTP(S)，且不能包含账号或密码。', {
      code: 'INVALID_BASE_URL',
    })
  }
  if (url.protocol === 'http:' && !isLoopbackHost(url.hostname)) {
    throw new ProviderRequestError('远程模型服务必须使用 HTTPS；HTTP 只允许本机服务。', {
      code: 'INSECURE_BASE_URL',
    })
  }

  url.hash = ''
  url.search = ''
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return url
}

function isLoopbackHost(hostname: string): boolean {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  return value === 'localhost' || value.endsWith('.localhost') || value === '::1' || /^127(?:\.\d{1,3}){3}$/.test(value)
}

export function resolveProviderUrl(baseUrl: string, resource: string): string {
  const base = normalizeBaseUrl(baseUrl)
  const normalizedResource = resource.replace(/^\/+/, '')
  const basePath = base.pathname.replace(/\/+$/, '')
  const resourceWithoutVersion = normalizedResource.replace(/^v1\//, '')

  // 用户通常会填写到 /v1；避免生成 /v1/v1/...。
  if (basePath.endsWith('/v1')) {
    base.pathname = `${basePath}/${resourceWithoutVersion}`
  } else {
    base.pathname = `${basePath}/${normalizedResource}`.replace(/\/{2,}/g, '/')
  }

  return base.toString()
}

export function redactSensitiveText(value: unknown, apiKey?: string): string {
  let text = value instanceof Error ? value.message : String(value ?? '')
  if (apiKey) {
    text = text.split(apiKey).join('[已脱敏]')
  }

  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [已脱敏]')
    .replace(/(x-api-key|api[-_ ]?key|authorization)(\s*[=:]\s*)[^\s,;"'}]+/gi, '$1$2[已脱敏]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, 'sk-[已脱敏]')
    .slice(0, 4_096)
}

export function requestSignal(
  parent: AbortSignal | undefined,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const abortFromParent = () => controller.abort(parent?.reason)

  if (parent?.aborted) {
    abortFromParent()
  } else {
    parent?.addEventListener('abort', abortFromParent, { once: true })
  }

  const timeout = setTimeout(() => {
    controller.abort(new ProviderRequestError('模型请求超时。', { code: 'TIMEOUT' }))
  }, Math.max(1_000, timeoutMs))

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout)
      parent?.removeEventListener('abort', abortFromParent)
    },
  }
}

export function toProviderError(
  error: unknown,
  apiKey?: string,
  signal?: AbortSignal,
): ProviderRequestError {
  if (signal?.aborted && signal.reason instanceof ProviderRequestError) return signal.reason
  if (error instanceof ProviderRequestError) {
    const safeMessage = redactSensitiveText(error.message, apiKey)
    if (safeMessage === error.message) return error
    return new ProviderRequestError(safeMessage, {
      status: error.status,
      code: error.code,
      cause: error,
    })
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ProviderRequestError('模型请求已取消。', { code: 'ABORTED', cause: error })
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return new ProviderRequestError('模型请求已取消。', { code: 'ABORTED', cause: error })
  }

  return new ProviderRequestError(redactSensitiveText(error, apiKey) || '模型服务请求失败。', {
    code: 'REQUEST_FAILED',
    cause: error,
  })
}

export async function readSafeErrorBody(
  response: Response,
  apiKey?: string,
  maxBytes = DEFAULT_ERROR_BODY_BYTES,
): Promise<string> {
  let body = ''
  try {
    if (response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const limit = Math.max(256, maxBytes)
      let received = 0
      try {
        while (received < limit) {
          const { done, value } = await reader.read()
          if (done) break
          const remaining = limit - received
          const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value
          received += chunk.byteLength
          body += decoder.decode(chunk, { stream: received < limit })
          if (value.byteLength > remaining) break
        }
        body += decoder.decode()
      } finally {
        await reader.cancel().catch(() => undefined)
        reader.releaseLock()
      }
    }
  } catch {
    // 响应体不可读时仅返回状态码，避免二次异常覆盖真实错误。
  }
  const cleanBody = redactSensitiveText(body, apiKey)
  return cleanBody ? `：${cleanBody}` : ''
}

export interface SseMessage {
  event?: string
  data: string
}

export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseMessage, void, void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel(signal.reason).catch(() => undefined)
        throw new ProviderRequestError('模型请求已取消。', { code: 'ABORTED' })
      }

      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      buffer = normalizeSseLineEndings(buffer)
      if (new TextEncoder().encode(buffer).byteLength > MAX_SSE_BUFFER_BYTES) {
        throw new ProviderRequestError('模型流式响应单个事件过大。', {
          code: 'STREAM_EVENT_TOO_LARGE',
        })
      }

      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const parsed = parseSseBlock(block)
        if (parsed) yield parsed
        boundary = buffer.indexOf('\n\n')
      }
    }

    buffer += decoder.decode()
    buffer = normalizeSseLineEndings(buffer, true)
    const parsed = parseSseBlock(buffer)
    if (parsed) yield parsed
  } finally {
    reader.releaseLock()
  }
}

function normalizeSseLineEndings(value: string, final = false): string {
  // 暂存分块末尾的 \r，避免下一块以 \n 开头时被错误识别成两个换行。
  const hasPendingCarriageReturn = !final && value.endsWith('\r')
  const stableValue = hasPendingCarriageReturn ? value.slice(0, -1) : value
  const normalized = stableValue.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return hasPendingCarriageReturn ? `${normalized}\r` : normalized
}

function parseSseBlock(block: string): SseMessage | undefined {
  let event: string | undefined
  const data: string[] = []

  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const field = separator >= 0 ? line.slice(0, separator) : line
    let value = separator >= 0 ? line.slice(separator + 1) : ''
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    if (field === 'data') data.push(value)
  }

  if (data.length === 0) return undefined
  return { event, data: data.join('\n') }
}

export function assertResponseBody(response: Response): ReadableStream<Uint8Array> {
  if (!response.body) {
    throw new ProviderRequestError('模型服务未返回可读取的响应流。', {
      status: response.status,
      code: 'EMPTY_STREAM',
    })
  }
  return response.body
}
