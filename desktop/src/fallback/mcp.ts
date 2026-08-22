import { clone, makeId, mutate, now, readState } from './state'

export const mcpApi: Window['paperAgent']['mcp'] = {
  async save(input) {
    const id = input.id ?? makeId('mcp')
    const existing = readState().mcpServers.find((item) => item.id === id)
    const saved = {
      id,
      name: input.name,
      transport: input.transport,
      enabled: input.enabled,
      status: 'disconnected' as const,
      tools: existing?.tools ?? [],
      resources: existing?.resources ?? [],
      origin: 'demo' as const,
      verificationStatus: 'demo' as const,
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now(),
    }
    mutate((draft) => {
      const index = draft.mcpServers.findIndex((item) => item.id === id)
      if (index >= 0) draft.mcpServers[index] = saved
      else draft.mcpServers.push(saved)
    })
    return clone(saved)
  },
  async delete(serverId) {
    mutate((draft) => {
      draft.mcpServers = draft.mcpServers.filter((item) => item.id !== serverId)
    })
  },
  async test(serverId) {
    const next = mutate((draft) => {
      const server = draft.mcpServers.find((item) => item.id === serverId)
      if (server) {
        server.status = 'connected'
        server.tools = [
          { name: 'search_literature', description: '浏览器演示工具，未连接真实 MCP 服务' },
          { name: 'resolve_metadata', description: '浏览器演示工具，未连接真实 MCP 服务' },
        ]
      }
    })
    const server = next.mcpServers.find((item) => item.id === serverId)
    if (!server) throw new Error('未找到 MCP 服务')
    return clone(server)
  },
  async callTool(serverId, name, args) {
    const server = readState().mcpServers.find((item) => item.id === serverId)
    if (!server) throw new Error('未找到 MCP 服务')
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            demo: true,
            server: server.name,
            tool: name,
            arguments: args,
            message: '浏览器演示结果：未调用真实 MCP 工具。',
          }, null, 2),
        },
      ],
      structuredContent: {
        demo: true,
        message: '浏览器演示结果：未调用真实 MCP 工具。',
      },
    }
  },
  async readResource(serverId, uri) {
    const server = readState().mcpServers.find((item) => item.id === serverId)
    if (!server) throw new Error('未找到 MCP 服务')
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: `浏览器演示结果：未读取真实 MCP 资源。\n服务：${server.name}\n资源：${uri}`,
        },
      ],
    }
  },
}
