import { IPC } from '../../../shared/ipc'
import { toUserMessage } from '../errors'
import { mcpServerInputSchema } from '../schemas'
import { assertId } from './common'
import { handle } from './runtime'
import type { IpcDependencies, RegisterIpcHandler } from './types'

export function registerMcpHandlers(
  dependencies: IpcDependencies,
  register: RegisterIpcHandler = handle,
): void {
  const { repository, configuration } = dependencies

  register(IPC.mcpSave, async (_event, payload: unknown) => {
    return configuration.saveMcpServer(mcpServerInputSchema.parse(payload))
  })

  register(IPC.mcpDelete, async (_event, serverId: unknown) => {
    assertId(serverId, 'MCP 服务')
    await dependencies.disconnectMcp(serverId)
    await configuration.deleteMcpServer(serverId)
  })

  register(IPC.mcpTest, async (_event, serverId: unknown) => {
    assertId(serverId, 'MCP 服务')
    const stored = repository.getMcpServer(serverId)
    if (!stored) throw new Error('MCP 服务不存在。')
    await repository.saveMcpServer({
      ...stored,
      status: 'connecting',
      lastError: undefined,
      updatedAt: new Date().toISOString(),
    })
    try {
      const result = await dependencies.testMcp(configuration.resolvedMcpServer(serverId))
      return repository.saveMcpServer({
        ...stored,
        // test() 是一次性探测，完成后没有常驻连接。
        status: 'disconnected',
        tools: result.tools,
        resources: result.resources,
        lastError: undefined,
        verificationStatus: 'verified-metadata',
        updatedAt: new Date().toISOString(),
      })
    } catch (error) {
      const message = toUserMessage(error, 'MCP 服务连接失败。')
      await repository.saveMcpServer({
        ...stored,
        status: 'failed',
        lastError: message,
        updatedAt: new Date().toISOString(),
      })
      throw new Error(message)
    }
  })

  register(IPC.mcpCallTool, async (_event, serverId: unknown, name: unknown, args: unknown) => {
    assertId(serverId, 'MCP 服务')
    if (typeof name !== 'string' || !name.trim() || name.length > 256) {
      throw new Error('MCP 工具名称无效。')
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      throw new Error('MCP 工具参数必须是 JSON 对象。')
    }
    return dependencies.callMcpTool(
      configuration.resolvedMcpServer(serverId),
      name.trim(),
      args as Record<string, unknown>,
    )
  })

  register(IPC.mcpReadResource, async (_event, serverId: unknown, uri: unknown) => {
    assertId(serverId, 'MCP 服务')
    if (typeof uri !== 'string' || !uri.trim() || uri.length > 8_192) {
      throw new Error('MCP 资源 URI 无效。')
    }
    return dependencies.readMcpResource(
      configuration.resolvedMcpServer(serverId),
      uri.trim(),
    )
  })
}
