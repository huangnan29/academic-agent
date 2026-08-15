import { createHash } from 'node:crypto'
import type {
  ChatMessage,
  McpToolCallResult,
  MessageLiteratureCandidate,
  WorkspaceState,
} from '../../shared/contracts'

export type ParsedMcpLiteratureCandidate = Omit<MessageLiteratureCandidate, 'id' | 'source'>

/**
 * 只从 MCP 的结构化字段或可解析 JSON 文本中提取文献元数据。
 * 纯文本和模型正文不会进入这里，避免把模型编写的标题误当成真实文献。
 */
export function extractMcpLiteratureCandidates(
  result: McpToolCallResult,
): ParsedMcpLiteratureCandidate[] {
  const values: unknown[] = []
  if (result.structuredContent) values.push(result.structuredContent)
  for (const block of result.content ?? []) {
    if (!block || typeof block !== 'object') continue
    const record = block as Record<string, unknown>
    if (record.type !== 'text' || typeof record.text !== 'string') continue
    try {
      values.push(JSON.parse(record.text) as unknown)
    } catch {
      // 纯文本没有稳定书目结构，不自动写入文献候选。
    }
  }

  const records: Record<string, unknown>[] = []
  const collect = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(collect)
      return
    }
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    const nested = ['results', 'items', 'papers', 'works', 'data']
      .map((key) => record[key])
      .find(Array.isArray)
    if (nested) {
      collect(nested)
      return
    }
    records.push(record)
  }
  values.forEach(collect)

  const normalized = records
    .map((record) => {
      const title = stringValue(record.title, record.display_name, record.name)
      if (!title) return undefined
      const rawAuthors = record.authors ?? record.author
      const authors = Array.isArray(rawAuthors)
        ? rawAuthors
            .map((author) =>
              typeof author === 'string'
                ? author
                : author && typeof author === 'object'
                  ? stringValue((author as Record<string, unknown>).name, (author as Record<string, unknown>).display_name)
                  : undefined,
            )
            .filter((author): author is string => Boolean(author))
        : typeof rawAuthors === 'string'
          ? rawAuthors.split(/[;,，；]/).map((item) => item.trim()).filter(Boolean)
          : []
      const yearValue = parseMcpYear(record.year ?? record.publication_year ?? record.published)
      const resourceUri = stringValue(record.resource_uri)
      const referenceIds = normalizeReferenceIds([
        record.id,
        record.arxiv_id,
        record.paper_id,
        record.doi,
        resourceUri,
        stringValue(record.url, record.landing_page_url),
      ])
      return {
        title: title.slice(0, 1_000),
        authors: authors.slice(0, 100),
        year: yearValue,
        venue: (stringValue(record.venue, record.journal, record.publisher)
          ?? (resourceUri?.startsWith('arxiv://') ? 'arXiv' : undefined))?.slice(0, 500),
        abstract: stringValue(record.abstract, record.summary)?.slice(0, 20_000),
        doi: normalizeMcpDoi(record.doi)?.slice(0, 300),
        url: safeHttpUrl(stringValue(record.url, record.landing_page_url)),
        referenceIds,
      }
    })
    .filter((record): record is NonNullable<typeof record> => Boolean(record))

  const seen = new Set<string>()
  return normalized.filter((record) => {
    // structuredContent 与 JSON 文本可能承载同一批结果；优先按 DOI，否则按标题和年份去重。
    const identity = record.doi
      ? `doi:${record.doi}`
      : `title:${normalizeMcpTitle(record.title)}|year:${record.year ?? 'unknown'}`
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  }).slice(0, 50)
}

/**
 * 从同项目、已经完成且未截断的 MCP 审计证据中解析旧消息引用。
 * 只接受严格的【文献:ID】与结果中的明确 ID 精确匹配，不依据模型正文猜测书目信息。
 */
export function resolveHistoricalMessageLiteratureCandidates(
  state: WorkspaceState,
  message: Pick<ChatMessage, 'id' | 'projectId' | 'runId' | 'content' | 'createdAt'>,
): MessageLiteratureCandidate[] {
  const citedIds = [...message.content.matchAll(/【文献\s*[:：]\s*([^】]+)】/gu)]
    .map((match) => normalizeReferenceId(match[1]))
    .filter((value): value is string => Boolean(value))
  if (citedIds.length === 0) return []

  const runs = state.runs
    .filter((run) => run.projectId === message.projectId && run.createdAt <= message.createdAt)
    .sort((left, right) => {
      if (left.id === message.runId) return -1
      if (right.id === message.runId) return 1
      return right.createdAt.localeCompare(left.createdAt)
    })

  const evidenceCandidates: Array<{
    candidate: ParsedMcpLiteratureCandidate
    provenance: NonNullable<MessageLiteratureCandidate['provenance']>
  }> = []
  for (const run of runs) {
    for (const step of run.steps) {
      const evidence = step.evidence
      if (
        !evidence
        || evidence.kind !== 'mcp-tool'
        || evidence.truncated
        || !['completed', 'warning'].includes(step.status)
      ) continue
      const result = parseAuditResult(evidence.resultJson)
      if (!result) continue
      for (const candidate of extractMcpLiteratureCandidates(result)) {
        if (!candidate.referenceIds?.length) continue
        evidenceCandidates.push({
          candidate,
          provenance: {
            runId: run.id,
            stepId: step.id,
            serverId: evidence.serverId,
            toolName: evidence.toolName,
            resultSha256: evidence.resultSha256,
          },
        })
      }
    }
  }

  const resolved: MessageLiteratureCandidate[] = []
  for (const citedId of [...new Set(citedIds)].slice(0, 50)) {
    const matches = evidenceCandidates.filter(({ candidate }) => (
      candidate.referenceIds?.some((value) => normalizeReferenceId(value) === citedId)
    ))
    if (matches.length === 0) continue
    const identities = new Set(matches.map(({ candidate }) => candidateIdentity(candidate)))
    if (identities.size !== 1) continue
    const match = matches[0]
    resolved.push({
      id: historicalCandidateId(message.id, match.provenance.stepId, citedId),
      ...match.candidate,
      provenance: match.provenance,
      source: 'mcp',
    })
  }
  return resolved
}

function parseAuditResult(value: string): McpToolCallResult | undefined {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (!Array.isArray(parsed.content)) return undefined
    return {
      content: parsed.content,
      structuredContent: parsed.structuredContent && typeof parsed.structuredContent === 'object'
        ? parsed.structuredContent as Record<string, unknown>
        : undefined,
      isError: parsed.isError === true,
    }
  } catch {
    return undefined
  }
}

function candidateIdentity(candidate: ParsedMcpLiteratureCandidate): string {
  return candidate.doi
    ? `doi:${candidate.doi}`
    : `title:${normalizeMcpTitle(candidate.title)}|year:${candidate.year ?? 'unknown'}`
}

function historicalCandidateId(messageId: string, stepId: string, citedId: string): string {
  const digest = createHash('sha256').update(`${messageId}\0${stepId}\0${citedId}`).digest('hex')
  return `historical-${digest.slice(0, 40)}`
}

function normalizeReferenceIds(values: unknown[]): string[] {
  return [...new Set(values
    .map((value) => normalizeReferenceId(typeof value === 'string' ? value : undefined))
    .filter((value): value is string => Boolean(value)))]
}

function normalizeReferenceId(value: string | undefined): string | undefined {
  if (!value) return undefined
  let normalized = value.normalize('NFKC').trim()
  normalized = normalized
    .replace(/^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\//i, '')
    .replace(/^arxiv:\/\//i, '')
    .replace(/^arxiv\s*:\s*/i, '')
    .replace(/\.pdf$/i, '')
    .replace(/v\d+$/i, '')
    .replace(/^doi\s*:\s*/i, '')
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .split(/[?#]/, 1)[0]
    .replace(/[\s.,;:]+$/g, '')
    .trim()
    .toLocaleLowerCase()
  if (!normalized || normalized === 'arxiv编号') return undefined
  return normalized
}

function parseMcpYear(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (Number.isInteger(numeric) && numeric >= 1000 && numeric <= 3000) return numeric
  if (typeof value !== 'string') return undefined
  const match = value.trim().match(/^(\d{4})/)
  if (!match) return undefined
  const year = Number(match[1])
  return year >= 1000 && year <= 3000 ? year : undefined
}

function normalizeMcpDoi(value: unknown): string | undefined {
  return stringValue(value)
    ?.normalize('NFKC')
    .replace(/^doi:\s*/i, '')
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .split(/[?#]/, 1)[0]
    .replace(/[\s.,;:]+$/g, '')
    .trim()
    .toLocaleLowerCase() || undefined
}

function normalizeMcpTitle(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '')
  return normalized || value.normalize('NFKC').toLocaleLowerCase().trim()
}

function stringValue(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && Boolean(value.trim()))?.trim()
}

function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}
