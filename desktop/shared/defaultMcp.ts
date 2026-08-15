import type { McpServerConfig } from './contracts'

/** 应用内置的 arXiv 文献检索服务；不会读取 Codex 或系统 MCP 配置。 */
export const DEFAULT_ARXIV_MCP_SERVER_ID = 'builtin-arxiv-mcp'
export const DEFAULT_ARXIV_MCP_TOOL_NAME = 'search_papers'

const DEFAULT_ARXIV_MCP_SEARCH_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'arXiv 检索式' },
    max_results: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
    date_from: { type: 'string', description: '起始日期 YYYY-MM-DD' },
    date_to: { type: 'string', description: '结束日期 YYYY-MM-DD' },
    categories: { type: 'array', items: { type: 'string' } },
    sort_by: { type: 'string', enum: ['relevance', 'date'], default: 'relevance' },
  },
  required: ['query'],
}

/** 旧工作区可能只保存了工具名称；为内置检索补齐稳定参数结构。 */
export function normalizeDefaultArxivTools(tools: McpServerConfig['tools']): McpServerConfig['tools'] {
  return tools.map((tool) => (
    tool.name === DEFAULT_ARXIV_MCP_TOOL_NAME && !tool.inputSchema
      ? { ...tool, inputSchema: DEFAULT_ARXIV_MCP_SEARCH_SCHEMA }
      : tool
  ))
}

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
        inputSchema: DEFAULT_ARXIV_MCP_SEARCH_SCHEMA,
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
  if (servers.some((server) => server.id === DEFAULT_ARXIV_MCP_SERVER_ID)) {
    return servers.map((server) => server.id === DEFAULT_ARXIV_MCP_SERVER_ID
      ? { ...server, tools: normalizeDefaultArxivTools(server.tools) }
      : server)
  }
  return [createDefaultArxivMcpServer(timestamp), ...servers]
}
