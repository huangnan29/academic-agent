import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { McpManager } from '../../electron/services/mcp/index'
import { WorkspaceRepository } from '../../electron/services/storage/workspaceRepository'
import {
  DEFAULT_ARXIV_MCP_SERVER_ID,
  DEFAULT_ARXIV_MCP_TOOL_NAME,
} from '../../shared/defaultMcp'

async function main(): Promise<void> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'academic-agent-arxiv-mcp-'))
  const repository = new WorkspaceRepository(join(temporaryDirectory, 'workspace.json'))
  const manager = new McpManager([], { requestTimeoutMs: 60_000, maxListPages: 20 })

  try {
    await repository.initialize()
    const seeded = repository
      .snapshot()
      .mcpServers.find((server) => server.id === DEFAULT_ARXIV_MCP_SERVER_ID)
    if (!seeded) throw new Error('新工作区没有内置 arXiv MCP。')
    if (!seeded.enabled) throw new Error('内置 arXiv MCP 没有默认启用。')
    if (seeded.transport.type !== 'stdio') throw new Error('内置 arXiv MCP 不是 stdio 配置。')
    if (seeded.transport.command !== 'uvx' || seeded.transport.args[0] !== 'arxiv-mcp-server') {
      throw new Error('内置 arXiv MCP 启动命令与上游官方配置不一致。')
    }

    await manager.saveConfig({
      id: seeded.id,
      name: seeded.name,
      transport: seeded.transport,
      enabled: seeded.enabled,
    })
    const tested = await manager.test(seeded.id)
    if (!tested.tools.some((tool) => tool.name === DEFAULT_ARXIV_MCP_TOOL_NAME)) {
      throw new Error('arXiv MCP 未发现 search_papers 工具。')
    }

    const result = await manager.callTool(seeded.id, DEFAULT_ARXIV_MCP_TOOL_NAME, {
      query: 'ti:"retrieval augmented generation"',
      max_results: 1,
    })
    const textBlock = result.content.find(
      (block): block is { type: 'text'; text: string } =>
        block.type === 'text' && typeof block.text === 'string',
    )
    if (!textBlock) throw new Error('arXiv MCP 检索没有返回文本结果。')
    const parsed = JSON.parse(textBlock.text) as {
      total_results?: number
      papers?: Array<{ id?: string; title?: string; published?: string }>
    }
    const paper = parsed.papers?.[0]
    if (!paper?.id || !paper.title) throw new Error('arXiv MCP 返回结果缺少论文 ID 或标题。')

    const educationResult = await manager.callTool(seeded.id, DEFAULT_ARXIV_MCP_TOOL_NAME, {
      query: '"generative artificial intelligence" AND education',
      max_results: 5,
    })
    const educationText = educationResult.content.find(
      (block): block is { type: 'text'; text: string } =>
        block.type === 'text' && typeof block.text === 'string',
    )
    if (!educationText) throw new Error('生成式人工智能教育主题没有返回文本结果。')
    const educationParsed = JSON.parse(educationText.text) as {
      total_results?: number
      papers?: Array<{ id?: string; title?: string }>
    }
    if (!educationParsed.papers?.length) throw new Error('英文教育主题查询仍然返回 0 条。')

    console.log(JSON.stringify({
      ok: true,
      serverId: seeded.id,
      command: [seeded.transport.command, ...seeded.transport.args],
      discoveredToolCount: tested.tools.length,
      searchTool: DEFAULT_ARXIV_MCP_TOOL_NAME,
      result: {
        id: paper.id,
        title: paper.title,
        published: paper.published,
      },
      educationTopic: {
        totalResults: educationParsed.total_results,
        returned: educationParsed.papers.length,
        first: educationParsed.papers[0],
      },
    }, null, 2))
  } finally {
    await manager.disconnectAll().catch(() => undefined)
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
