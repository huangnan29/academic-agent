import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type {
  CallToolResult,
  ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js'

import type {
  McpServerConfig,
  McpServerInput,
  McpTransportConfig,
} from '../../../shared/contracts.js'

type McpToolSummary = McpServerConfig['tools'][number]
type McpResourceSummary = McpServerConfig['resources'][number]
type SupportedTransport = StdioClientTransport | StreamableHTTPClientTransport

export type McpToolCallResult = CallToolResult
export type McpResourceReadResult = ReadResourceResult

export interface McpManagerOptions {
  requestTimeoutMs?: number
  maxListPages?: number
  maxCallArgumentsBytes?: number
  maxResultBytes?: number
  onConfigChange?: (config: McpServerConfig) => void | Promise<void>
  onConfigDelete?: (serverId: string) => void | Promise<void>
}

interface ManagedConnection {
  client: Client
  transport: SupportedTransport
  closing: boolean
  closed: boolean
  stderrText: string
}

interface DiscoveryResult {
  tools: McpToolSummary[]
  resources: McpResourceSummary[]
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
const DEFAULT_MAX_LIST_PAGES = 100
const DEFAULT_MAX_CALL_ARGUMENTS_BYTES = 256 * 1_024
const DEFAULT_MAX_RESULT_BYTES = 8 * 1_024 * 1_024
const MAX_JSON_DEPTH = 64
const MAX_STDERR_LENGTH = 4_000
const CLIENT_INFO = { name: 'aiwritepaper-agent', version: '0.2.0' }
const MASKED_VALUE = '••••••••'
const SENSITIVE_NAME_PATTERN = /authorization|(?:^|[-_])auth(?:$|[-_])|api[-_]?key|access[-_]?key|token|secret|password|cookie|credential/i

export class McpManagerError extends Error {
  readonly code: string
  readonly serverId?: string

  constructor(code: string, message: string, serverId?: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'McpManagerError'
    this.code = code
    this.serverId = serverId
  }
}

function cleanText(value: unknown, maxLength = 2_000): string | undefined {
  if (typeof value !== 'string') return undefined
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned.slice(0, maxLength) : undefined
}

function cloneTransport(transport: McpTransportConfig): McpTransportConfig {
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

function cloneConfig(config: McpServerConfig): McpServerConfig {
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

function publicConfig(config: McpServerConfig): McpServerConfig {
  return { ...cloneConfig(config), transport: publicTransport(config.transport) }
}

function restoreMaskedValues(
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

function transportFingerprint(transport: McpTransportConfig): string {
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

function validateStdioTransport(transport: Extract<McpTransportConfig, { type: 'stdio' }>): McpTransportConfig {
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

function isLoopbackHost(hostname: string): boolean {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  return value === 'localhost' || value.endsWith('.localhost') || value === '::1' || /^127(?:\.\d{1,3}){3}$/.test(value)
}

function validateInput(input: McpServerInput): McpServerInput {
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

function safeEndpoint(config: McpServerConfig): string {
  if (config.transport.type === 'stdio') return config.name
  try {
    const url = new URL(config.transport.url)
    url.search = ''
    url.hash = ''
    return `${url.origin}${url.pathname}`
  } catch {
    return config.name
  }
}

function secretValues(config: McpServerConfig): string[] {
  if (config.transport.type === 'stdio') {
    return Object.entries(config.transport.env ?? {})
      .filter(([name]) => SENSITIVE_NAME_PATTERN.test(name))
      .map(([, value]) => value)
      .filter((value) => value.length >= 4)
  }

  const values = Object.values(config.transport.headers ?? {}).filter((value) => value.length >= 4)
  try {
    const url = new URL(config.transport.url)
    for (const [name, value] of url.searchParams) {
      if (SENSITIVE_NAME_PATTERN.test(name) && value.length >= 4) {
        values.push(value)
      }
    }
  } catch {
    // 地址已在保存时校验；这里只做防御性处理。
  }
  return values
}

function redactDiagnostic(value: string, config: McpServerConfig): string {
  let result = value
  for (const secret of secretValues(config)) {
    result = result.split(secret).join('[已隐藏]')
  }

  if (config.transport.type === 'streamable-http') {
    result = result.split(config.transport.url).join(safeEndpoint(config))
  }

  return result
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [已隐藏]')
    .replace(/((?:api[-_ ]?key|token|secret|password|authorization)\s*[:=]\s*)[^\s,;]+/gi, '$1[已隐藏]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1_200)
}

function describeConnectionError(
  error: unknown,
  config: McpServerConfig,
  stderrText = '',
): string {
  const rawMessage = error instanceof Error ? error.message : '未知错误'
  const message = redactDiagnostic(rawMessage, config)
  const endpoint = safeEndpoint(config)
  let description: string

  if (/ENOENT|not found|cannot find/i.test(message)) {
    description = `无法启动 MCP 服务“${config.name}”：找不到启动命令`
  } else if (/timed?\s*out|timeout|RequestTimeout/i.test(message)) {
    description = `连接 MCP 服务“${config.name}”超时`
  } else if (/401|403|unauthorized|forbidden/i.test(message)) {
    description = `MCP 服务“${config.name}”拒绝访问，请检查凭证或权限`
  } else if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network/i.test(message)) {
    description = `无法连接 MCP 服务“${config.name}”（${endpoint}）：${message}`
  } else {
    description = `MCP 服务“${config.name}”连接失败：${message || '未知错误'}`
  }

  const stderr = redactDiagnostic(stderrText, config)
  return stderr ? `${description}；服务进程输出：${stderr}` : description
}

function describeOperationError(
  error: unknown,
  config: McpServerConfig,
  operation: string,
): string {
  const rawMessage = error instanceof Error ? error.message : ''
  const message = redactDiagnostic(rawMessage, config)

  if (/timed?\s*out|timeout|RequestTimeout|操作超过/i.test(message)) {
    return `${operation}超时，请稍后重试`
  }
  if (/401|403|unauthorized|forbidden/i.test(message)) {
    return `${operation}失败：服务拒绝访问，请检查凭证或权限`
  }
  if (/ECONNREFUSED/i.test(message)) {
    return `${operation}失败：无法连接 ${safeEndpoint(config)}`
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
    return `${operation}失败：无法解析服务地址 ${safeEndpoint(config)}`
  }
  if (/fetch failed|network|socket|connection.*closed|transport.*closed/i.test(message)) {
    return `${operation}失败：MCP 网络连接已中断`
  }
  if (/-32601|method not found|not supported/i.test(message)) {
    return `${operation}失败：MCP 服务未提供该能力`
  }
  if (/-32602|invalid params|invalid arguments/i.test(message)) {
    return `${operation}失败：MCP 服务拒绝了请求参数`
  }

  // 服务端异常可能回显工具参数或资源内容，因此未知错误不透传原始详情。
  return `${operation}失败：MCP 服务返回错误，原始详情已隐藏`
}

function validateOperationText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') throw new TypeError(`${label}必须是字符串`)
  const normalized = value.trim()
  if (!normalized) throw new TypeError(`${label}不能为空`)
  if (normalized.length > maxLength) throw new TypeError(`${label}长度不能超过 ${maxLength} 个字符`)
  if (/[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new TypeError(`${label}不能包含控制字符`)
  }
  return normalized
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

function formatByteLimit(bytes: number): string {
  if (bytes >= 1_024 * 1_024) return `${bytes / (1_024 * 1_024)} MiB`
  return `${Math.ceil(bytes / 1_024)} KiB`
}

function cloneBoundedJson<T>(
  value: unknown,
  label: string,
  maxBytes: number,
  serverId: string,
  invalidCode: string,
  tooLargeCode: string,
): T {
  let estimatedBytes = 0
  const ancestors = new WeakSet<object>()

  const addEstimatedBytes = (amount: number): void => {
    estimatedBytes += amount
    if (estimatedBytes > maxBytes) {
      throw new McpManagerError(
        tooLargeCode,
        `${label}超过安全上限 ${formatByteLimit(maxBytes)}`,
        serverId,
      )
    }
  }

  const inspect = (current: unknown, depth: number): void => {
    if (depth > MAX_JSON_DEPTH) {
      throw new McpManagerError(
        invalidCode,
        `${label}的嵌套层级超过 ${MAX_JSON_DEPTH} 层`,
        serverId,
      )
    }

    if (current === null) {
      addEstimatedBytes(4)
      return
    }
    if (typeof current === 'string') {
      addEstimatedBytes(Buffer.byteLength(current, 'utf8') + 2)
      return
    }
    if (typeof current === 'boolean') {
      addEstimatedBytes(current ? 4 : 5)
      return
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) {
        throw new McpManagerError(invalidCode, `${label}包含无效数字`, serverId)
      }
      addEstimatedBytes(32)
      return
    }
    if (typeof current !== 'object') {
      throw new McpManagerError(invalidCode, `${label}必须是可序列化 JSON`, serverId)
    }
    if (ancestors.has(current)) {
      throw new McpManagerError(invalidCode, `${label}不能包含循环引用`, serverId)
    }

    ancestors.add(current)
    try {
      if (Array.isArray(current)) {
        addEstimatedBytes(current.length + 2)
        for (const item of current) inspect(item, depth + 1)
        return
      }
      if (!isPlainRecord(current) || Object.getOwnPropertySymbols(current).length > 0) {
        throw new McpManagerError(invalidCode, `${label}必须由普通 JSON 对象组成`, serverId)
      }

      addEstimatedBytes(2)
      for (const [key, item] of Object.entries(current)) {
        addEstimatedBytes(Buffer.byteLength(key, 'utf8') + 4)
        inspect(item, depth + 1)
      }
    } finally {
      ancestors.delete(current)
    }
  }

  try {
    inspect(value, 0)
    const serialized = JSON.stringify(value)
    if (serialized === undefined) {
      throw new McpManagerError(invalidCode, `${label}必须是可序列化 JSON`, serverId)
    }
    if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
      throw new McpManagerError(
        tooLargeCode,
        `${label}超过安全上限 ${formatByteLimit(maxBytes)}`,
        serverId,
      )
    }
    return JSON.parse(serialized) as T
  } catch (error) {
    if (error instanceof McpManagerError) throw error
    // 不附带原始异常，避免 getter 或自定义对象把敏感内容带入错误链。
    throw new McpManagerError(invalidCode, `${label}必须是可序列化 JSON`, serverId)
  }
}

function cloneToolInputSchema(value: unknown): Record<string, unknown> | undefined {
  if (!isPlainRecord(value)) return undefined
  try {
    return cloneBoundedJson<Record<string, unknown>>(
      value,
      'MCP 工具输入结构',
      64 * 1_024,
      'discovery',
      'MCP_INVALID_TOOL_SCHEMA',
      'MCP_TOOL_SCHEMA_TOO_LARGE',
    )
  } catch {
    // 单个服务返回异常 schema 时仍保留工具名称与说明，但不允许自动推断参数。
    return undefined
  }
}

function boundedPositiveInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(1, Math.trunc(value as number)))
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`操作超过 ${timeoutMs} 毫秒`)), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export class McpManager {
  private readonly configs = new Map<string, McpServerConfig>()
  private readonly connections = new Map<string, ManagedConnection>()
  private readonly pendingConnections = new Map<string, Promise<McpServerConfig>>()
  private readonly requestTimeoutMs: number
  private readonly maxListPages: number
  private readonly maxCallArgumentsBytes: number
  private readonly maxResultBytes: number
  private readonly onConfigChange?: McpManagerOptions['onConfigChange']
  private readonly onConfigDelete?: McpManagerOptions['onConfigDelete']

  constructor(initialConfigs: McpServerConfig[] = [], options: McpManagerOptions = {}) {
    this.requestTimeoutMs = boundedPositiveInteger(
      options.requestTimeoutMs,
      DEFAULT_REQUEST_TIMEOUT_MS,
      120_000,
    )
    this.maxListPages = boundedPositiveInteger(
      options.maxListPages,
      DEFAULT_MAX_LIST_PAGES,
      1_000,
    )
    this.maxCallArgumentsBytes = boundedPositiveInteger(
      options.maxCallArgumentsBytes,
      DEFAULT_MAX_CALL_ARGUMENTS_BYTES,
      1_024 * 1_024,
    )
    this.maxResultBytes = boundedPositiveInteger(
      options.maxResultBytes,
      DEFAULT_MAX_RESULT_BYTES,
      32 * 1_024 * 1_024,
    )
    this.onConfigChange = options.onConfigChange
    this.onConfigDelete = options.onConfigDelete

    for (const config of initialConfigs) {
      const cloned = cloneConfig(config)
      cloned.status = 'disconnected'
      cloned.lastError = undefined
      this.configs.set(cloned.id, cloned)
    }
  }

  listConfigs(): McpServerConfig[] {
    return [...this.configs.values()].map(publicConfig)
  }

  getConfig(serverId: string): McpServerConfig | undefined {
    const config = this.configs.get(serverId)
    return config ? publicConfig(config) : undefined
  }

  async saveConfig(input: McpServerInput): Promise<McpServerConfig> {
    const validated = validateInput(input)
    const id = validated.id ?? randomUUID()
    const existing = this.configs.get(id)
    validated.transport = restoreMaskedValues(validated.transport, existing?.transport)

    const pending = this.pendingConnections.get(id)
    if (pending) await pending.catch(() => undefined)
    if (this.connections.has(id)) await this.disconnect(id)

    const now = new Date().toISOString()
    const transportChanged = existing
      ? transportFingerprint(existing.transport) !== transportFingerprint(validated.transport)
      : true
    const config: McpServerConfig = {
      id,
      origin: 'live',
      verificationStatus: transportChanged
        ? 'unverified'
        : (existing?.verificationStatus ?? 'unverified'),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      name: validated.name,
      transport: cloneTransport(validated.transport),
      enabled: validated.enabled,
      status: 'disconnected',
      tools: transportChanged ? [] : (existing?.tools.map((tool) => ({ ...tool })) ?? []),
      resources: transportChanged
        ? []
        : (existing?.resources.map((resource) => ({ ...resource })) ?? []),
      lastError: undefined,
    }

    return this.storeConfig(config)
  }

  async deleteConfig(serverId: string): Promise<void> {
    const pending = this.pendingConnections.get(serverId)
    if (pending) await pending.catch(() => undefined)
    if (this.connections.has(serverId)) await this.disconnect(serverId)
    if (!this.configs.delete(serverId)) return
    await this.onConfigDelete?.(serverId)
  }

  async test(serverId: string): Promise<McpServerConfig> {
    const pending = this.pendingConnections.get(serverId)
    if (pending) {
      await pending
      return this.refreshCapabilities(serverId)
    }
    if (this.connections.has(serverId)) return this.refreshCapabilities(serverId)

    const config = this.requireConfig(serverId)
    await this.patchConfig(serverId, { status: 'connecting', lastError: undefined })
    const runtime = this.createRuntime(config)

    try {
      await runtime.client.connect(runtime.transport, { timeout: this.requestTimeoutMs })
      const discovery = await this.discover(runtime.client)
      return await this.patchConfig(serverId, {
        status: 'disconnected',
        verificationStatus: 'verified-metadata',
        tools: discovery.tools,
        resources: discovery.resources,
        lastError: undefined,
      })
    } catch (error) {
      const message = describeConnectionError(error, config, runtime.stderrText)
      await this.patchConfig(serverId, {
        status: 'failed',
        verificationStatus: 'unverified',
        tools: [],
        resources: [],
        lastError: message,
      })
      throw new McpManagerError('MCP_TEST_FAILED', message, serverId, error)
    } finally {
      runtime.closing = true
      await this.closeRuntime(runtime).catch(() => undefined)
    }
  }

  async connect(serverId: string): Promise<McpServerConfig> {
    const active = this.connections.get(serverId)
    if (active && !active.closed) return publicConfig(this.requireConfig(serverId))

    const pending = this.pendingConnections.get(serverId)
    if (pending) return pending

    const operation = this.connectInternal(serverId)
    this.pendingConnections.set(serverId, operation)
    try {
      return await operation
    } finally {
      if (this.pendingConnections.get(serverId) === operation) {
        this.pendingConnections.delete(serverId)
      }
    }
  }

  async disconnect(serverId: string): Promise<McpServerConfig> {
    let config = this.requireConfig(serverId)
    const pending = this.pendingConnections.get(serverId)
    if (pending) {
      await pending.catch(() => undefined)
      config = this.requireConfig(serverId)
    }
    const runtime = this.connections.get(serverId)
    if (!runtime) {
      return this.patchConfig(serverId, { status: 'disconnected' })
    }

    runtime.closing = true
    this.connections.delete(serverId)
    try {
      await this.closeRuntime(runtime)
    } catch (error) {
      const message = describeConnectionError(error, config, runtime.stderrText)
      await this.patchConfig(serverId, { status: 'failed', lastError: message })
      throw new McpManagerError('MCP_DISCONNECT_FAILED', message, serverId, error)
    }

    return this.patchConfig(serverId, { status: 'disconnected', lastError: undefined })
  }

  async disconnectAll(): Promise<void> {
    if (this.pendingConnections.size > 0) {
      await Promise.allSettled([...this.pendingConnections.values()])
    }
    const serverIds = [...this.connections.keys()]
    const results = await Promise.allSettled(serverIds.map((serverId) => this.disconnect(serverId)))
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (failures.length > 0) {
      throw new McpManagerError(
        'MCP_DISCONNECT_ALL_FAILED',
        `已有 ${serverIds.length - failures.length} 个 MCP 连接关闭，${failures.length} 个连接关闭失败`,
      )
    }
  }

  async listTools(serverId: string): Promise<McpToolSummary[]> {
    const runtime = this.requireConnection(serverId)
    try {
      const tools = await this.fetchTools(runtime.client)
      await this.patchConfig(serverId, { tools, lastError: undefined })
      return tools.map((tool) => ({ ...tool }))
    } catch (error) {
      throw await this.capabilityError(serverId, error)
    }
  }

  async listResources(serverId: string): Promise<McpResourceSummary[]> {
    const runtime = this.requireConnection(serverId)
    try {
      const resources = await this.fetchResources(runtime.client)
      await this.patchConfig(serverId, { resources, lastError: undefined })
      return resources.map((resource) => ({ ...resource }))
    } catch (error) {
      throw await this.capabilityError(serverId, error)
    }
  }

  async callTool(
    serverId: string,
    name: string,
    args: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<McpToolCallResult> {
    const toolName = validateOperationText(name, 'MCP 工具名称', 256)
    if (!isPlainRecord(args)) {
      throw new McpManagerError(
        'MCP_INVALID_ARGUMENTS',
        'MCP 工具参数必须是 JSON 对象',
        serverId,
      )
    }
    const safeArguments = cloneBoundedJson<Record<string, unknown>>(
      args,
      'MCP 工具参数',
      this.maxCallArgumentsBytes,
      serverId,
      'MCP_INVALID_ARGUMENTS',
      'MCP_ARGUMENTS_TOO_LARGE',
    )
    const runtime = await this.ensureConnection(serverId)

    let result: unknown
    try {
      result = await runtime.client.callTool(
        { name: toolName, arguments: safeArguments },
        undefined,
        { timeout: this.requestTimeoutMs, signal },
      )
    } catch (error) {
      throw await this.operationError(
        serverId,
        error,
        'MCP_TOOL_CALL_FAILED',
        `调用 MCP 工具“${toolName}”`,
      )
    }

    try {
      const safeResult = cloneBoundedJson<McpToolCallResult>(
        result,
        'MCP 工具返回结果',
        this.maxResultBytes,
        serverId,
        'MCP_INVALID_RESULT',
        'MCP_RESULT_TOO_LARGE',
      )
      if (this.requireConfig(serverId).lastError) {
        await this.patchConfig(serverId, { lastError: undefined }).catch(() => undefined)
      }
      return safeResult
    } catch (error) {
      if (error instanceof McpManagerError) {
        await this.patchConfig(serverId, { lastError: error.message }).catch(() => undefined)
      }
      throw error
    }
  }

  async readResource(serverId: string, uri: string): Promise<McpResourceReadResult> {
    const resourceUri = validateOperationText(uri, 'MCP 资源 URI', 8_192)
    const runtime = await this.ensureConnection(serverId)

    let result: unknown
    try {
      result = await runtime.client.readResource(
        { uri: resourceUri },
        { timeout: this.requestTimeoutMs },
      )
    } catch (error) {
      throw await this.operationError(
        serverId,
        error,
        'MCP_RESOURCE_READ_FAILED',
        '读取 MCP 资源',
      )
    }

    try {
      const safeResult = cloneBoundedJson<McpResourceReadResult>(
        result,
        'MCP 资源返回结果',
        this.maxResultBytes,
        serverId,
        'MCP_INVALID_RESULT',
        'MCP_RESULT_TOO_LARGE',
      )
      if (this.requireConfig(serverId).lastError) {
        await this.patchConfig(serverId, { lastError: undefined }).catch(() => undefined)
      }
      return safeResult
    } catch (error) {
      if (error instanceof McpManagerError) {
        await this.patchConfig(serverId, { lastError: error.message }).catch(() => undefined)
      }
      throw error
    }
  }

  async refreshCapabilities(serverId: string): Promise<McpServerConfig> {
    const runtime = this.requireConnection(serverId)
    try {
      const discovery = await this.discover(runtime.client)
      return this.patchConfig(serverId, {
        status: 'connected',
        verificationStatus: 'verified-metadata',
        tools: discovery.tools,
        resources: discovery.resources,
        lastError: undefined,
      })
    } catch (error) {
      throw await this.capabilityError(serverId, error)
    }
  }

  private async ensureConnection(serverId: string): Promise<ManagedConnection> {
    const config = this.requireConfig(serverId)
    const active = this.connections.get(serverId)
    if (active && !active.closed) return active
    try {
      await this.connect(serverId)
    } catch (error) {
      const code = error instanceof McpManagerError ? error.code : 'MCP_CONNECT_FAILED'
      const message = error instanceof McpManagerError
        ? redactDiagnostic(error.message, config)
        : describeConnectionError(error, config)
      // 按需连接失败时只向调用方暴露已经脱敏的错误，不转发原始 cause。
      throw new McpManagerError(code, message, serverId)
    }
    return this.requireConnection(serverId)
  }

  private async operationError(
    serverId: string,
    error: unknown,
    code: string,
    operation: string,
  ): Promise<McpManagerError> {
    const config = this.requireConfig(serverId)
    const message = describeOperationError(error, config, operation)
    await this.patchConfig(serverId, { lastError: message }).catch(() => undefined)
    // 不保留原始 cause，防止上层日志输出服务端回显的参数或凭证。
    return new McpManagerError(code, message, serverId)
  }

  private async connectInternal(serverId: string): Promise<McpServerConfig> {
    const config = this.requireConfig(serverId)
    if (!config.enabled) {
      throw new McpManagerError('MCP_DISABLED', `MCP 服务“${config.name}”尚未启用`, serverId)
    }

    await this.patchConfig(serverId, { status: 'connecting', lastError: undefined })
    const runtime = this.createRuntime(config)
    this.attachRuntimeCallbacks(serverId, runtime)

    try {
      await runtime.client.connect(runtime.transport, { timeout: this.requestTimeoutMs })
      const discovery = await this.discover(runtime.client)
      if (runtime.closed) throw new Error('MCP 连接在初始化完成前已关闭')

      this.connections.set(serverId, runtime)
      const connectedConfig = await this.patchConfig(serverId, {
        status: 'connected',
        verificationStatus: 'verified-metadata',
        tools: discovery.tools,
        resources: discovery.resources,
        lastError: undefined,
      })
      if (runtime.closed || this.connections.get(serverId) !== runtime) {
        throw new Error('MCP 连接在初始化完成后立即关闭')
      }
      return connectedConfig
    } catch (error) {
      runtime.closing = true
      this.connections.delete(serverId)
      await this.closeRuntime(runtime).catch(() => undefined)
      const message = describeConnectionError(error, config, runtime.stderrText)
      await this.patchConfig(serverId, {
        status: 'failed',
        verificationStatus: 'unverified',
        tools: [],
        resources: [],
        lastError: message,
      })
      throw new McpManagerError('MCP_CONNECT_FAILED', message, serverId, error)
    }
  }

  private createRuntime(config: McpServerConfig): ManagedConnection {
    const client = new Client(CLIENT_INFO, { capabilities: {} })
    let transport: SupportedTransport

    if (config.transport.type === 'stdio') {
      const env = { ...getDefaultEnvironment(), ...(config.transport.env ?? {}) }
      // Finder 启动的应用通常没有交互式 Shell 的 PATH；补入 macOS 常见工具目录，
      // 使应用内置的 uvx MCP 与用户自行配置的本机工具都能被稳定找到。
      env.PATH = [
        join(homedir(), '.local', 'bin'),
        '/opt/homebrew/bin',
        '/usr/local/bin',
        env.PATH,
      ].filter(Boolean).join(delimiter)
      transport = new StdioClientTransport({
        command: config.transport.command,
        args: [...config.transport.args],
        cwd: config.transport.cwd,
        env,
        stderr: 'pipe',
      })
    } else {
      transport = new StreamableHTTPClientTransport(new URL(config.transport.url), {
        requestInit: {
          headers: config.transport.headers ? { ...config.transport.headers } : undefined,
        },
        reconnectionOptions: {
          maxReconnectionDelay: 10_000,
          initialReconnectionDelay: 500,
          reconnectionDelayGrowFactor: 1.5,
          maxRetries: 2,
        },
      })
    }

    const runtime: ManagedConnection = {
      client,
      transport,
      closing: false,
      closed: false,
      stderrText: '',
    }

    if (transport instanceof StdioClientTransport) {
      transport.stderr?.on('data', (chunk: unknown) => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
        runtime.stderrText = `${runtime.stderrText}${text}`.slice(-MAX_STDERR_LENGTH)
      })
    }

    return runtime
  }

  private attachRuntimeCallbacks(serverId: string, runtime: ManagedConnection): void {
    runtime.client.onclose = () => {
      runtime.closed = true
      if (runtime.closing || this.connections.get(serverId) !== runtime) return
      this.connections.delete(serverId)
      void this.patchConfig(serverId, {
        status: 'disconnected',
        lastError: 'MCP 连接已由服务端关闭',
      }).catch(() => undefined)
    }

    runtime.client.onerror = (error) => {
      if (runtime.closing || this.connections.get(serverId) !== runtime) return
      const config = this.configs.get(serverId)
      if (!config) return
      const message = describeConnectionError(error, config, runtime.stderrText)
      void this.patchConfig(serverId, { lastError: message }).catch(() => undefined)
    }
  }

  private async discover(client: Client): Promise<DiscoveryResult> {
    const capabilities = client.getServerCapabilities()
    const [tools, resources] = await Promise.all([
      capabilities?.tools ? this.fetchTools(client) : Promise.resolve([]),
      capabilities?.resources ? this.fetchResources(client) : Promise.resolve([]),
    ])
    return { tools, resources }
  }

  private async fetchTools(client: Client): Promise<McpToolSummary[]> {
    const tools = new Map<string, McpToolSummary>()
    const seenCursors = new Set<string>()
    let cursor: string | undefined

    for (let page = 0; page < this.maxListPages; page += 1) {
      const result = await client.listTools(
        cursor ? { cursor } : undefined,
        { timeout: this.requestTimeoutMs },
      )
      for (const tool of result.tools) {
        const name = cleanText(tool.name, 256)
        if (!name || tools.has(name)) continue
        tools.set(name, {
          name,
          description: cleanText(tool.description),
          inputSchema: cloneToolInputSchema(tool.inputSchema),
        })
      }

      if (!result.nextCursor) return [...tools.values()]
      if (seenCursors.has(result.nextCursor)) {
        throw new Error('MCP tools/list 返回了重复游标')
      }
      seenCursors.add(result.nextCursor)
      cursor = result.nextCursor
    }

    throw new Error(`MCP tools/list 超过 ${this.maxListPages} 页，已停止继续读取`)
  }

  private async fetchResources(client: Client): Promise<McpResourceSummary[]> {
    const resources = new Map<string, McpResourceSummary>()
    const seenCursors = new Set<string>()
    let cursor: string | undefined

    for (let page = 0; page < this.maxListPages; page += 1) {
      const result = await client.listResources(
        cursor ? { cursor } : undefined,
        { timeout: this.requestTimeoutMs },
      )
      for (const resource of result.resources) {
        const uri = cleanText(resource.uri, 4_096)
        const name = cleanText(resource.name, 512)
        if (!uri || !name || resources.has(uri)) continue
        resources.set(uri, { uri, name, description: cleanText(resource.description) })
      }

      if (!result.nextCursor) return [...resources.values()]
      if (seenCursors.has(result.nextCursor)) {
        throw new Error('MCP resources/list 返回了重复游标')
      }
      seenCursors.add(result.nextCursor)
      cursor = result.nextCursor
    }

    throw new Error(`MCP resources/list 超过 ${this.maxListPages} 页，已停止继续读取`)
  }

  private async closeRuntime(runtime: ManagedConnection): Promise<void> {
    runtime.closing = true
    let terminateError: unknown

    if (runtime.transport instanceof StreamableHTTPClientTransport) {
      try {
        await withTimeout(runtime.transport.terminateSession(), Math.min(3_000, this.requestTimeoutMs))
      } catch (error) {
        terminateError = error
      }
    }

    try {
      await runtime.client.close()
    } finally {
      runtime.closed = true
    }

    if (terminateError) throw terminateError
  }

  private requireConfig(serverId: string): McpServerConfig {
    const config = this.configs.get(serverId)
    if (!config) {
      throw new McpManagerError('MCP_NOT_FOUND', `未找到 MCP 服务配置：${serverId}`, serverId)
    }
    return config
  }

  private requireConnection(serverId: string): ManagedConnection {
    this.requireConfig(serverId)
    const runtime = this.connections.get(serverId)
    if (!runtime || runtime.closed) {
      throw new McpManagerError('MCP_NOT_CONNECTED', 'MCP 服务尚未连接', serverId)
    }
    return runtime
  }

  private async capabilityError(serverId: string, error: unknown): Promise<McpManagerError> {
    const config = this.requireConfig(serverId)
    const runtime = this.connections.get(serverId)
    const message = describeConnectionError(error, config, runtime?.stderrText ?? '')
    await this.patchConfig(serverId, { lastError: message })
    return new McpManagerError('MCP_CAPABILITY_LIST_FAILED', message, serverId, error)
  }

  private async storeConfig(config: McpServerConfig): Promise<McpServerConfig> {
    const stored = cloneConfig(config)
    this.configs.set(stored.id, stored)
    const visibleConfig = publicConfig(stored)
    await this.onConfigChange?.(visibleConfig)
    return publicConfig(stored)
  }

  private async patchConfig(
    serverId: string,
    patch: Partial<Pick<
      McpServerConfig,
      'status' | 'verificationStatus' | 'tools' | 'resources' | 'lastError'
    >>,
  ): Promise<McpServerConfig> {
    const current = this.requireConfig(serverId)
    return this.storeConfig({
      ...current,
      ...patch,
      transport: cloneTransport(current.transport),
      tools: (patch.tools ?? current.tools).map((tool) => ({ ...tool })),
      resources: (patch.resources ?? current.resources).map((resource) => ({ ...resource })),
      updatedAt: new Date().toISOString(),
    })
  }
}
