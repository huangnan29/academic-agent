import { randomUUID } from 'node:crypto'

import type { McpServerConfig, McpServerInput } from '../../../shared/contracts.js'

import { cloneBoundedJson } from './bounded-json.js'
import { discover as discoverCapabilities, fetchResources, fetchTools } from './discovery.js'
import { McpManagerError } from './errors.js'
import {
  describeConnectionError,
  describeOperationError,
  redactDiagnostic,
} from './redaction.js'
import { closeRuntime, createRuntime } from './transport.js'
import type {
  ManagedConnection,
  McpManagerOptions,
  McpResourceReadResult,
  McpResourceSummary,
  McpToolCallResult,
  McpToolSummary,
} from './types.js'
import {
  boundedPositiveInteger,
  cloneConfig,
  cloneTransport,
  isPlainRecord,
  publicConfig,
  restoreMaskedValues,
  transportFingerprint,
  validateInput,
  validateOperationText,
} from './validation.js'
import {
  DEFAULT_MAX_CALL_ARGUMENTS_BYTES,
  DEFAULT_MAX_LIST_PAGES,
  DEFAULT_MAX_RESULT_BYTES,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from './constants.js'

export { McpManagerError }
export type {
  McpManagerOptions,
  McpResourceReadResult,
  McpToolCallResult,
} from './types.js'

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
    const runtime = createRuntime(config)

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
      await closeRuntime(runtime, this.requestTimeoutMs).catch(() => undefined)
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
      await closeRuntime(runtime, this.requestTimeoutMs)
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
      const tools = await fetchTools(runtime.client, this.discoveryOptions())
      await this.patchConfig(serverId, { tools, lastError: undefined })
      return tools.map((tool) => ({ ...tool }))
    } catch (error) {
      throw await this.capabilityError(serverId, error)
    }
  }

  async listResources(serverId: string): Promise<McpResourceSummary[]> {
    const runtime = this.requireConnection(serverId)
    try {
      const resources = await fetchResources(runtime.client, this.discoveryOptions())
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

  private discoveryOptions(): { maxListPages: number; requestTimeoutMs: number } {
    return {
      maxListPages: this.maxListPages,
      requestTimeoutMs: this.requestTimeoutMs,
    }
  }

  private async discover(client: ManagedConnection['client']) {
    return discoverCapabilities(client, this.discoveryOptions())
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
    const runtime = createRuntime(config)
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
      await closeRuntime(runtime, this.requestTimeoutMs).catch(() => undefined)
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
