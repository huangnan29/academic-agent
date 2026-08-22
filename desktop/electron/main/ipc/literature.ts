import { randomUUID } from 'node:crypto'
import { IPC } from '../../../shared/ipc'
import {
  DEFAULT_ARXIV_MCP_SERVER_ID,
  DEFAULT_ARXIV_MCP_TOOL_NAME,
} from '../../../shared/defaultMcp'
import type { LiteratureRecord } from '../../../shared/contracts'
import { extractMcpLiteratureCandidates } from '../mcpLiterature'
import { toUserMessage } from '../errors'
import {
  literatureAddFromMessageSchema,
  literatureDeleteSchema,
  literatureSearchSchema,
  literatureSetProjectSchema,
} from '../schemas'
import { createRun, assertId } from './common'
import { handle } from './runtime'
import type { IpcDependencies, RegisterIpcHandler } from './types'

export function registerLiteratureHandlers(
  dependencies: IpcDependencies,
  register: RegisterIpcHandler = handle,
): void {
  const { repository, configuration, literature } = dependencies

  register(IPC.literatureSearch, async (_event, payload: unknown) => {
    const input = literatureSearchSchema.parse(payload)
    const run = input.projectId
      ? createRun(input.projectId, 'research', '检索公开文献', `正在检索“${input.query}”`)
      : undefined
    if (run) await repository.saveRun(run)
    try {
      const records = input.mcp
        ? await searchLiteratureWithMcp(dependencies, configuration, input)
        : await literature.search(input)
      const saved = await repository.addLiterature(records, input.projectId)
      if (run) {
        await repository.updateRun(run.id, {
          status: 'completed',
          verificationStatus: 'verified-metadata',
          steps: [{
            ...run.steps[0],
            detail: `${input.mcp ? 'MCP 文献工具' : 'OpenAlex / Crossref'} 返回并归一化后共 ${saved.length} 条记录`,
            status: 'completed',
            completedAt: new Date().toISOString(),
          }],
        })
      }
      return saved
    } catch (error) {
      if (run) {
        const message = toUserMessage(error, '公开文献检索失败。')
        await repository.updateRun(run.id, {
          status: 'error',
          error: message,
          steps: [{
            ...run.steps[0],
            detail: message,
            status: 'error',
            completedAt: new Date().toISOString(),
          }],
        })
      }
      throw error
    }
  })

  register(
    IPC.literatureToggle,
    async (_event, projectId: unknown, literatureId: unknown, included: unknown) => {
      assertId(projectId, '项目')
      assertId(literatureId, '文献')
      if (typeof included !== 'boolean') throw new Error('文献选择状态无效。')
      return repository.toggleLiterature(projectId, literatureId, included)
    },
  )

  register(IPC.literatureAddFromMessage, async (_event, payload: unknown) => {
    const input = literatureAddFromMessageSchema.parse(payload)
    return repository.addLiteratureFromMessage(input.messageId, input.candidateIds)
  })

  register(IPC.literatureSetProject, async (_event, payload: unknown) => {
    const input = literatureSetProjectSchema.parse(payload)
    return repository.setLiteratureProject(
      input.literatureId,
      input.sourceProjectId,
      input.targetProjectId,
    )
  })

  register(IPC.literatureDelete, async (_event, payload: unknown) => {
    const input = literatureDeleteSchema.parse(payload)
    return repository.deleteLiterature(input.literatureId, input.sourceProjectId)
  })
}

async function searchLiteratureWithMcp(
  dependencies: IpcDependencies,
  configuration: IpcDependencies['configuration'],
  input: ReturnType<typeof literatureSearchSchema.parse>,
): Promise<LiteratureRecord[]> {
  if (!input.mcp) return []
  const server = configuration.resolvedMcpServer(input.mcp.serverId)
  if (!server.enabled) throw new Error('所选 MCP 服务尚未启用。')
  const resultLimit = Math.min(20, Math.max(1, input.limit ?? 20))
  const isBuiltInArxivSearch = server.id === DEFAULT_ARXIV_MCP_SERVER_ID
    && input.mcp.toolName === DEFAULT_ARXIV_MCP_TOOL_NAME
  const result = await dependencies.callMcpTool(
    server,
    input.mcp.toolName,
    {
      [input.mcp.queryArgument ?? 'query']: input.query,
      // arXiv MCP 使用 max_results；其他通用文献 MCP 延续 limit 参数。
      [isBuiltInArxivSearch ? 'max_results' : 'limit']: resultLimit,
    },
  )
  const candidates = extractMcpLiteratureCandidates(result)
  if (candidates.length === 0) {
    throw new Error('MCP 工具未返回可识别的文献记录。')
  }
  const timestamp = new Date().toISOString()
  return candidates.slice(0, input.limit ?? 20).map((candidate) => ({
    id: randomUUID(),
    projectId: input.projectId,
    title: candidate.title,
    authors: candidate.authors,
    year: candidate.year,
    venue: candidate.venue,
    abstract: candidate.abstract,
    doi: candidate.doi,
    url: candidate.url,
    source: 'mcp',
    included: false,
    origin: 'live',
    // 第三方工具返回值仍需用户复核，不能冒充元数据已经核验。
    verificationStatus: 'unverified',
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
}
