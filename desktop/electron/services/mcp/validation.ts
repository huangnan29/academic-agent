import type {
  McpServerConfig,
  McpServerInput,
  McpTransportConfig,
} from '../../../shared/contracts.js'

import {
  MASKED_VALUE,
  SENSITIVE_NAME_PATTERN,
} from './constants.js'

export function cleanText(value: unknown, maxLength = 2_000): string | undefined {
  if (typeof value !== 'string') return undefined
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned.slice(0, maxLength) : undefined
}

export function cloneTransport(transport: McpTransportConfig): McpTransportConfig {
  if (transport.type === 'stdio') {
    return {
      type: 'stdio',
      command: transport.command,
      args: [...transport.args],
      cwd: transport.cwd,
      env: transport.env ? { ...transport.env } : undefined,
    }
  }

  return {
    type: 'streamable-http',
    url: transport.url,
    headers: transport.headers ? { ...transport.headers } : undefined,
  }
}

export function cloneConfig(config: McpServerConfig): McpServerConfig {
  return {
    ...config,
    transport: cloneTransport(config.transport),
    tools: config.tools.map((tool) => ({ ...tool })),
    resources: config.resources.map((resource) => ({ ...resource })),
  }
}

function publicTransport(transport: McpTransportConfig): McpTransportConfig {
  const cloned = cloneTransport(transport)
  if (cloned.type === 'stdio') {
    for (const key of Object.keys(cloned.env ?? {})) {
      if (SENSITIVE_NAME_PATTERN.test(key) && cloned.env) cloned.env[key] = MASKED_VALUE
    }
    return cloned
  }

  for (const key of Object.keys(cloned.headers ?? {})) {
    if (SENSITIVE_NAME_PATTERN.test(key) && cloned.headers) cloned.headers[key] = MASKED_VALUE
  }
  return cloned
}

export function publicConfig(config: McpServerConfig): McpServerConfig {
  return { ...cloneConfig(config), transport: publicTransport(config.transport) }
}

export function restoreMaskedValues(
  transport: McpTransportConfig,
  existing: McpTransportConfig | undefined,
): McpTransportConfig {
  const cloned = cloneTransport(transport)
  if (cloned.type === 'stdio') {
    const previous = existing?.type === 'stdio' ? existing.env ?? {} : {}
    for (const [key, value] of Object.entries(cloned.env ?? {})) {
      if (value === MASKED_VALUE) {
        if (previous[key] !== undefined && cloned.env) cloned.env[key] = previous[key]
        else if (cloned.env) delete cloned.env[key]
      }
    }
    return cloned
  }

  const previous = existing?.type === 'streamable-http' ? existing.headers ?? {} : {}
  for (const [key, value] of Object.entries(cloned.headers ?? {})) {
    if (value === MASKED_VALUE) {
      if (previous[key] !== undefined && cloned.headers) cloned.headers[key] = previous[key]
      else if (cloned.headers) delete cloned.headers[key]
    }
  }
  return cloned
}

function sortedRecord(record: Record<string, string> | undefined): Array<[string, string]> {
  return Object.entries(record ?? {}).sort(([left], [right]) => left.localeCompare(right))
}

export function transportFingerprint(transport: McpTransportConfig): string {
  if (transport.type === 'stdio') {
    return JSON.stringify({
      type: transport.type,
      command: transport.command,
      args: transport.args,
      cwd: transport.cwd,
      env: sortedRecord(transport.env),
    })
  }

  return JSON.stringify({
    type: transport.type,
    url: transport.url,
    headers: sortedRecord(transport.headers),
  })
}

function validateNoNullByte(value: string, label: string): void {
  if (value.includes('\0')) throw new TypeError(`${label} 不能包含空字符`)
}

function validateStdioTransport(
  transport: Extract<McpTransportConfig, { type: 'stdio' }>,
): McpTransportConfig {
  const command = transport.command.trim()
  if (!command) throw new TypeError('MCP stdio 启动命令不能为空')
  validateNoNullByte(command, 'MCP stdio 启动命令')

  if (!Array.isArray(transport.args) || transport.args.some((arg) => typeof arg !== 'string')) {
    throw new TypeError('MCP stdio 参数必须是字符串数组')
  }
  transport.args.forEach((arg, index) => {
    validateNoNullByte(arg, 'MCP stdio 参数')
    const previous = transport.args[index - 1] ?? ''
    const containsInlineSecret = /--?(?:authorization|api[-_]?key|token|secret|password|cookie|credential)=.+/i.test(arg)
    const followsSecretFlag = /--?(?:authorization|api[-_]?key|token|secret|password|cookie|credential)$/i.test(previous)
    if (containsInlineSecret || followsSecretFlag) {
      throw new TypeError('MCP stdio 凭证不能放在命令参数中，请改用环境变量')
    }
  })

  const cwd = transport.cwd?.trim() || undefined
  if (cwd) validateNoNullByte(cwd, 'MCP stdio 工作目录')

  let env: Record<string, string> | undefined
  if (transport.env) {
    env = {}
    for (const [key, value] of Object.entries(transport.env)) {
      if (!key || key.includes('=') || key.includes('\0')) {
        throw new TypeError(`MCP stdio 环境变量名无效：${key || '(空)'}`)
      }
      if (typeof value !== 'string') throw new TypeError(`环境变量 ${key} 的值必须是字符串`)
      validateNoNullByte(value, `环境变量 ${key}`)
      env[key] = value
    }
  }

  return { type: 'stdio', command, args: [...transport.args], cwd, env }
}

function isLoopbackHost(hostname: string): boolean {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  return value === 'localhost' || value.endsWith('.localhost') || value === '::1' || /^127(?:\.\d{1,3}){3}$/.test(value)
}

function validateHttpTransport(
  transport: Extract<McpTransportConfig, { type: 'streamable-http' }>,
): McpTransportConfig {
  let url: URL
  try {
    url = new URL(transport.url)
  } catch {
    throw new TypeError('MCP Streamable HTTP 地址无效')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('MCP Streamable HTTP 仅支持 http 或 https 地址')
  }
  if (url.protocol === 'http:' && !isLoopbackHost(url.hostname)) {
    throw new TypeError('远程 MCP 服务必须使用 HTTPS；HTTP 只允许本机回环地址')
  }
  if (url.username || url.password) {
    throw new TypeError('MCP 地址不能内嵌用户名或密码，请使用安全请求头配置凭证')
  }
  for (const [name, value] of url.searchParams) {
    if (value && SENSITIVE_NAME_PATTERN.test(name)) {
      throw new TypeError('MCP 地址不能在查询参数中携带凭证，请改用安全请求头')
    }
  }

  let headers: Record<string, string> | undefined
  if (transport.headers) {
    headers = {}
    for (const [rawName, rawValue] of Object.entries(transport.headers)) {
      const name = rawName.trim()
      if (!name) throw new TypeError('MCP 请求头名称不能为空')
      if (typeof rawValue !== 'string') throw new TypeError(`请求头 ${name} 的值必须是字符串`)
      if (/\r|\n/.test(name) || /\r|\n/.test(rawValue)) {
        throw new TypeError(`请求头 ${name} 包含非法换行符`)
      }
      try {
        new Headers({ [name]: rawValue })
      } catch {
        throw new TypeError(`请求头 ${name} 无效`)
      }
      headers[name] = rawValue
    }
  }

  return { type: 'streamable-http', url: url.toString(), headers }
}

export function validateInput(input: McpServerInput): McpServerInput {
  if (!input || typeof input !== 'object' || !input.transport) {
    throw new TypeError('MCP 服务配置不能为空')
  }
  const name = cleanText(input.name, 100)
  if (!name) throw new TypeError('MCP 服务名称不能为空')

  let transport: McpTransportConfig
  if (input.transport.type === 'stdio') {
    transport = validateStdioTransport(input.transport)
  } else if (input.transport.type === 'streamable-http') {
    transport = validateHttpTransport(input.transport)
  } else {
    throw new TypeError('不支持的 MCP 传输类型')
  }

  return {
    id: cleanText(input.id, 200),
    name,
    transport,
    enabled: Boolean(input.enabled),
  }
}

export function validateOperationText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') throw new TypeError(`${label}必须是字符串`)
  const normalized = value.trim()
  if (!normalized) throw new TypeError(`${label}不能为空`)
  if (normalized.length > maxLength) throw new TypeError(`${label}长度不能超过 ${maxLength} 个字符`)
  if (/[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new TypeError(`${label}不能包含控制字符`)
  }
  return normalized
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

export function boundedPositiveInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(1, Math.trunc(value as number)))
}
