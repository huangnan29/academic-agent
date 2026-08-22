import type {
  ChatContextReference,
  ChatStartInput,
  McpToolCallResult,
  WorkspaceState,
} from '../../../shared/contracts'
import {
  DEFAULT_ARXIV_MCP_SERVER_ID,
  DEFAULT_ARXIV_MCP_TOOL_NAME,
} from '../../../shared/defaultMcp'
import { executeArxivSearchWithRetry, planArxivSearchQueries } from '../arxivSearch'
import type { ChatMcpToolPlan } from '../chatCoordinator'
import type { ConfigurationService } from '../configuration'
import { sanitizeMcpText } from '../../services/pipeline'
import type { IpcDependencies } from './types'

interface PreparedSlashToolInput {
  input: ChatStartInput
  argumentTextByReference: Map<string, string>
}

export function prepareSlashToolReferences(
  state: WorkspaceState,
  input: ChatStartInput,
): PreparedSlashToolInput {
  const references = [...(input.contextReferences ?? [])]
  const argumentTextByReference = new Map<string, string>()
  const direct = /^\/([A-Za-z0-9_.:-]+)(?:\s+([\s\S]*))?$/.exec(input.content.trim())

  if (direct) {
    const requestedToolName = direct[1]
    const selectedMatches = references
      .filter((reference): reference is Extract<ChatContextReference, { kind: 'mcp-tool' }> => (
        reference.kind === 'mcp-tool'
        && matchesRequestedSlashTool(reference.serverId, reference.toolName, requestedToolName)
      ))
      .flatMap((reference) => {
        const server = state.mcpServers.find((item) => item.id === reference.serverId && item.enabled)
        const tool = server?.tools.find((item) => item.name === reference.toolName)
        return server && tool ? [{ server, tool }] : []
      })
    const discoveredMatches = state.mcpServers
      .filter((server) => server.enabled)
      .flatMap((server) => server.tools
        .filter((tool) => matchesRequestedSlashTool(server.id, tool.name, requestedToolName))
        .map((tool) => ({ server, tool })))
    const matches = selectedMatches.length > 0 ? [selectedMatches[selectedMatches.length - 1]] : discoveredMatches
    if (matches.length === 0) throw new Error(`没有找到已启用的 MCP 工具 /${requestedToolName}。`)
    if (matches.length > 1) throw new Error(`多个 MCP 服务提供 /${requestedToolName}，请从“/”菜单选择具体服务。`)
    const match = matches[0]
    const reference: ChatContextReference = {
      kind: 'mcp-tool',
      serverId: match.server.id,
      toolName: match.tool.name,
    }
    if (selectedMatches.length > 1) {
      for (let index = references.length - 1; index >= 0; index -= 1) {
        const item = references[index]
        if (
          item.kind === 'mcp-tool'
          && matchesRequestedSlashTool(item.serverId, item.toolName, requestedToolName)
          && referenceIdentity(item) !== referenceIdentity(reference)
        ) references.splice(index, 1)
      }
    }
    if (!references.some((item) => referenceIdentity(item) === referenceIdentity(reference))) {
      references.push(reference)
    }
    argumentTextByReference.set(referenceIdentity(reference), direct[2]?.trim() ?? '')
  }

  return {
    input: { ...input, contextReferences: references },
    argumentTextByReference,
  }
}

export function buildSlashMcpPlans(
  state: WorkspaceState,
  input: ChatStartInput,
  argumentTextByReference: Map<string, string>,
  configuration: ConfigurationService,
  callTool: IpcDependencies['callMcpTool'],
): ChatMcpToolPlan[] {
  const toolReferences = (input.contextReferences ?? [])
    .filter((reference): reference is Extract<ChatContextReference, { kind: 'mcp-tool' }> => reference.kind === 'mcp-tool')
  const unique = new Map(toolReferences.map((reference) => [referenceIdentity(reference), reference]))
  if (unique.size > 3) throw new Error('单条消息最多执行 3 个 MCP 工具。')

  const plans: ChatMcpToolPlan[] = []
  for (const reference of unique.values()) {
    const server = configuration.resolvedMcpServer(reference.serverId)
    if (!server.enabled) throw new Error(`MCP 服务 ${server.name} 已停用。`)
    const tool = server.tools.find((item) => item.name === reference.toolName)
    if (!tool) throw new Error(`MCP 工具 ${reference.toolName} 不存在，请先重新测试服务。`)
    const argumentText = argumentTextByReference.get(referenceIdentity(reference)) ?? input.content.trim()
    const originalArguments = buildSlashToolArguments(server.id, tool.name, tool.inputSchema, argumentText)
    let resolvedArguments = originalArguments
    plans.push({
      serverId: server.id,
      serverName: server.name,
      toolName: tool.name,
      get arguments() {
        return resolvedArguments
      },
      async execute(signal) {
        let result: McpToolCallResult
        if (
          server.id === DEFAULT_ARXIV_MCP_SERVER_ID
          && (tool.name === 'search_papers' || tool.name === 'semantic_search')
          && typeof originalArguments.query === 'string'
        ) {
          const profile = state.providers.find((item) => item.id === input.providerId && item.enabled)
          const project = state.projects.find((item) => item.id === input.projectId)
          if (!profile) throw new Error('无法使用当前模型规划 arXiv 英文检索式。')
          const queries = await planArxivSearchQueries({
            request: originalArguments.query,
            projectTitle: project?.title,
            projectBrief: project
              ? [
                  project.brief.paperType,
                  project.brief.discipline,
                  project.brief.requirements,
                  project.brief.keywords.join('、'),
                ].filter(Boolean).join('；')
              : undefined,
            profile,
            apiKey: configuration.providerSecret(profile.id),
            model: input.model,
            signal,
          })
          const attempted = await executeArxivSearchWithRetry(
            originalArguments,
            queries,
            (arguments_) => callTool(server, tool.name, arguments_, signal),
            (arguments_) => {
              // 在真实外部调用前更新 getter，失败或取消时审计也能读取本次英文查询。
              resolvedArguments = arguments_
            },
          )
          resolvedArguments = attempted.arguments
          result = attempted.result
        } else {
          result = await callTool(server, tool.name, originalArguments, signal)
        }
        if (result.isError) {
          throw new Error(`${server.name} / ${tool.name} 返回错误：${mcpResultSummary(result)}`)
        }
        return result
      },
    })
  }
  return plans
}

function buildSlashToolArguments(
  serverId: string,
  toolName: string,
  inputSchema: Record<string, unknown> | undefined,
  argumentText: string,
): Record<string, unknown> {
  const trimmed = argumentText.trim()
  if (trimmed.startsWith('{')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      throw new Error(`/${toolName} 后的 JSON 参数无法解析。`)
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`/${toolName} 的 JSON 参数必须是对象。`)
    }
    const arguments_ = parsed as Record<string, unknown>
    return serverId === DEFAULT_ARXIV_MCP_SERVER_ID && toolName === 'search_papers'
      ? validateArxivSearchArguments(arguments_)
      : arguments_
  }

  if (serverId === DEFAULT_ARXIV_MCP_SERVER_ID) {
    if (toolName === 'search_papers' || toolName === 'semantic_search') {
      if (!trimmed) throw new Error(`请在 /${toolName} 后输入检索词。`)
      return { query: trimmed, max_results: extractRequestedPaperCount(trimmed) ?? 5 }
    }
    if (toolName === 'download_paper' || toolName === 'read_paper' || toolName === 'citation_graph') {
      const paperId = extractArxivPaperId(trimmed)
      if (!paperId) throw new Error(`请在 /${toolName} 后输入 arXiv 论文 ID。`)
      return { paper_id: paperId }
    }
    if (toolName === 'get_abstract' || toolName === 'get_paper_latex' || toolName === 'list_paper_latex_sections') {
      const paperId = extractArxivPaperId(trimmed)
      if (!paperId) throw new Error(`请在 /${toolName} 后输入 arXiv 论文 ID。`)
      return { paper_id: paperId }
    }
    if (toolName === 'list_papers') return {}
    if (toolName === 'watch_topic') {
      if (!trimmed) throw new Error('请在 /watch_topic 后输入关注主题。')
      return { topic: trimmed, max_results: 10 }
    }
    if (toolName === 'check_alerts') return trimmed ? { topic: trimmed } : {}
    if (toolName === 'reindex') return {}
  }

  const properties = inputSchema?.properties
  const propertyMap = properties && typeof properties === 'object' && !Array.isArray(properties)
    ? properties as Record<string, unknown>
    : {}
  const required = Array.isArray(inputSchema?.required)
    ? inputSchema.required.filter((item): item is string => typeof item === 'string')
    : []
  if (required.length === 0 && !trimmed) return {}
  const preferred = ['query', 'topic', 'text', 'prompt', 'paper_id']
    .find((name) => name in propertyMap && (required.length === 0 || required.includes(name)))
  const soleRequired = required.length === 1 ? required[0] : undefined
  const argumentName = preferred ?? soleRequired
  if (argumentName && trimmed) {
    return { [argumentName]: argumentName === 'paper_id' ? extractArxivPaperId(trimmed) ?? trimmed : trimmed }
  }
  throw new Error(`/${toolName} 需要结构化参数，请在命令后输入 JSON 对象。`)
}

function extractArxivPaperId(value: string): string | undefined {
  return value.match(/(?:arxiv:\s*|arxiv\.org\/(?:abs|pdf)\/)?(\d{4}\.\d{4,5}(?:v\d+)?)/i)?.[1]
}

function matchesRequestedSlashTool(serverId: string, actualName: string, requestedName: string): boolean {
  if (actualName.toLocaleLowerCase() === requestedName.toLocaleLowerCase()) return true
  return serverId === DEFAULT_ARXIV_MCP_SERVER_ID
    && requestedName.toLocaleLowerCase() === 'paper_search'
    && actualName === DEFAULT_ARXIV_MCP_TOOL_NAME
}

function extractRequestedPaperCount(value: string): number | undefined {
  const matched = /(?:搜索|检索|查找|找)?\s*(\d+)\s*篇/u.exec(value)
  if (!matched) return undefined
  return Math.min(50, Math.max(1, Number(matched[1])))
}

function validateArxivSearchArguments(arguments_: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set(['query', 'max_results', 'date_from', 'date_to', 'categories', 'sort_by'])
  const unknown = Object.keys(arguments_).find((key) => !allowed.has(key))
  if (unknown) throw new Error(`/search_papers 不支持参数 ${unknown}。`)
  if (typeof arguments_.query !== 'string' || !arguments_.query.trim()) {
    throw new Error('/search_papers 的 query 必须是非空字符串。')
  }
  if (
    arguments_.max_results !== undefined
    && (
      typeof arguments_.max_results !== 'number'
      || !Number.isInteger(arguments_.max_results)
      || arguments_.max_results < 1
      || arguments_.max_results > 50
    )
  ) throw new Error('/search_papers 的 max_results 必须是 1–50 的整数。')
  for (const field of ['date_from', 'date_to'] as const) {
    const value = arguments_[field]
    if (value !== undefined && (typeof value !== 'string' || !isValidIsoDate(value))) {
      throw new Error(`/search_papers 的 ${field} 必须使用 YYYY-MM-DD。`)
    }
  }
  if (
    arguments_.categories !== undefined
    && (!Array.isArray(arguments_.categories) || !arguments_.categories.every((item) => typeof item === 'string' && item.trim()))
  ) throw new Error('/search_papers 的 categories 必须是非空字符串数组。')
  if (arguments_.sort_by !== undefined && arguments_.sort_by !== 'relevance' && arguments_.sort_by !== 'date') {
    throw new Error('/search_papers 的 sort_by 只能是 relevance 或 date。')
  }
  return {
    ...arguments_,
    query: arguments_.query.trim(),
    max_results: arguments_.max_results ?? 5,
  }
}

function isValidIsoDate(value: string): boolean {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value)
  if (!matched) return false
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

function referenceIdentity(reference: ChatContextReference): string {
  if (reference.kind === 'skill') return `skill:${reference.skillId}`
  if (reference.kind === 'mcp-tool') return `mcp-tool:${reference.serverId}:${reference.toolName}`
  return `mcp:${reference.serverId}`
}

function mcpResultSummary(result: McpToolCallResult): string {
  const text = result.content
    .map((item) => item && typeof item === 'object' && !Array.isArray(item)
      ? (item as Record<string, unknown>).text
      : undefined)
    .find((item): item is string => typeof item === 'string' && Boolean(item.trim()))
  return sanitizeMcpText(text ?? '工具未提供详细错误').replace(/\s+/g, ' ').slice(0, 500)
}
