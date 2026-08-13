import type { McpServerConfig } from './contracts'

/** 应用内置的 arXiv 文献检索服务；不会读取 Codex 或系统 MCP 配置。 */
export const DEFAULT_ARXIV_MCP_SERVER_ID = 'builtin-arxiv-mcp'
export const DEFAULT_ARXIV_MCP_TOOL_NAME = 'search_papers'

export function createDefaultArxivMcpServer(timestamp: string): McpServerConfig {
  return {
    id: DEFAULT_ARXIV_MCP_SERVER_ID,
    name: 'arXiv MCP（内置）',
    transport: {
      type: 'stdio',
      command: 'uvx',
      args: ['arxiv-mcp-server'],
    },
    enabled: true,
    status: 'disconnected',
    tools: [
      {
        name: DEFAULT_ARXIV_MCP_TOOL_NAME,
        description: '通过 arXiv 官方 API 按关键词、分类和日期检索论文',
      },
    ],
    resources: [],
    origin: 'cached',
    verificationStatus: 'unverified',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

/** 旧工作区升级时补入内置配置；用户对现有配置的启用状态和命令修改保持不变。 */
export function ensureDefaultArxivMcpServer(
  servers: McpServerConfig[],
  timestamp: string,
): McpServerConfig[] {
  if (servers.some((server) => server.id === DEFAULT_ARXIV_MCP_SERVER_ID)) return servers
  return [createDefaultArxivMcpServer(timestamp), ...servers]
}
