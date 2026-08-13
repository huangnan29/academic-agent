import { createHash } from 'node:crypto'

import type {
  LiteratureRecord,
  LiteratureSearchInput,
} from '../../../shared/contracts.js'

export type LiteratureProvider = 'openalex' | 'crossref'

export interface LiteratureSearchIssue {
  source: LiteratureProvider
  message: string
  retryable: boolean
}

export interface LiteratureSearchResult {
  records: LiteratureRecord[]
  issues: LiteratureSearchIssue[]
}

export interface LiteratureServiceOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  crossrefMailto?: string
  onIssue?: (issue: LiteratureSearchIssue) => void
}

interface OpenAlexResponse {
  results?: OpenAlexWork[]
}

interface OpenAlexWork {
  id?: string
  doi?: string
  title?: string
  display_name?: string
  publication_year?: number
  authorships?: Array<{ author?: { display_name?: string } }>
  primary_location?: {
    landing_page_url?: string
    source?: { display_name?: string }
  }
  locations?: Array<{
    landing_page_url?: string
    source?: { display_name?: string }
  }>
  abstract_inverted_index?: Record<string, number[]>
}

interface CrossrefResponse {
  status?: string
  message?: {
    items?: CrossrefWork[]
  }
}

interface CrossrefDateParts {
  'date-parts'?: number[][]
}

interface CrossrefWork {
  DOI?: string
  URL?: string
  title?: string[]
  subtitle?: string[]
  author?: Array<{ given?: string; family?: string; name?: string }>
  issued?: CrossrefDateParts
  published?: CrossrefDateParts
  'published-print'?: CrossrefDateParts
  'published-online'?: CrossrefDateParts
  'container-title'?: string[]
  publisher?: string
  abstract?: string
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const DEFAULT_TIMEOUT_MS = 15_000
const MAX_ABSTRACT_LENGTH = 30_000
const CLIENT_USER_AGENT = 'Academic-Agent/0.2 (desktop literature search)'

class ProviderRequestError extends Error {
  readonly source: LiteratureProvider
  readonly retryable: boolean

  constructor(source: LiteratureProvider, message: string, retryable: boolean, cause?: unknown) {
    super(message, { cause })
    this.name = 'ProviderRequestError'
    this.source = source
    this.retryable = retryable
  }
}

export class LiteratureSearchError extends Error {
  readonly code = 'LITERATURE_SEARCH_FAILED'
  readonly issues: LiteratureSearchIssue[]

  constructor(issues: LiteratureSearchIssue[]) {
    super(issues.map((issue) => issue.message).join('；'))
    this.name = 'LiteratureSearchError'
    this.issues = issues
  }
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined

  const cleaned = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned || undefined
}

function firstText(values: unknown): string | undefined {
  if (!Array.isArray(values)) return undefined
  for (const value of values) {
    const cleaned = cleanText(value)
    if (cleaned) return cleaned
  }
  return undefined
}

function uniqueNames(values: Array<string | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const name = cleanText(value)
    if (!name) continue
    const key = name.normalize('NFKC').toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(name)
    if (result.length >= 100) break
  }

  return result
}

export function normalizeDoi(value: unknown): string | undefined {
  const doi = cleanText(value)
  if (!doi) return undefined

  const normalized = doi
    .replace(/^doi:\s*/i, '')
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .split(/[?#]/, 1)[0]
    .replace(/[\s.,;:]+$/g, '')
    .trim()
    .toLocaleLowerCase()

  return /^10\.\d{4,9}\/.+/.test(normalized) ? normalized : undefined
}

export function normalizeTitle(value: unknown): string {
  return (cleanText(value) ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '')
}

function safeHttpUrl(value: unknown): string | undefined {
  const cleaned = cleanText(value)
  if (!cleaned) return undefined

  try {
    const url = new URL(cleaned)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function normalizeYear(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined
  return value > 0 && value < 3000 ? value : undefined
}

function crossrefYear(work: CrossrefWork): number | undefined {
  const dates = [work.issued, work.published, work['published-print'], work['published-online']]
  for (const date of dates) {
    const year = normalizeYear(date?.['date-parts']?.[0]?.[0])
    if (year) return year
  }
  return undefined
}

function openAlexAbstract(index: unknown): string | undefined {
  if (!index || typeof index !== 'object' || Array.isArray(index)) return undefined

  const words: string[] = []
  let largestPosition = -1

  for (const [word, positions] of Object.entries(index as Record<string, unknown>)) {
    if (!Array.isArray(positions)) continue
    for (const position of positions) {
      if (!Number.isInteger(position) || position < 0 || position > 100_000) continue
      words[position] = word
      largestPosition = Math.max(largestPosition, position)
    }
  }

  if (largestPosition < 0) return undefined
  return cleanText(words.slice(0, largestPosition + 1).filter(Boolean).join(' '))?.slice(
    0,
    MAX_ABSTRACT_LENGTH,
  )
}

function makeRecordId(doi: string | undefined, title: string, sourceId?: string): string {
  const identity = doi
    ? `doi:${doi}`
    : `title:${normalizeTitle(title) || cleanText(sourceId) || title}`
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 24)
  return `lit_${digest}`
}

function normalizeOpenAlexWork(
  work: OpenAlexWork,
  projectId: string | undefined,
  now: string,
): LiteratureRecord | undefined {
  const title = cleanText(work.title) ?? cleanText(work.display_name)
  if (!title) return undefined

  const doi = normalizeDoi(work.doi)
  const fallbackLocation = work.locations?.find(
    (location) => location?.source?.display_name || location?.landing_page_url,
  )
  const sourceLocation = work.primary_location ?? fallbackLocation
  const url =
    safeHttpUrl(sourceLocation?.landing_page_url) ??
    (doi ? `https://doi.org/${doi}` : safeHttpUrl(work.id))

  return {
    id: makeRecordId(doi, title, work.id),
    origin: 'live',
    verificationStatus: 'verified-metadata',
    createdAt: now,
    updatedAt: now,
    projectId,
    title,
    authors: uniqueNames(
      (work.authorships ?? []).map((authorship) => authorship.author?.display_name),
    ),
    year: normalizeYear(work.publication_year),
    venue: cleanText(sourceLocation?.source?.display_name),
    abstract: openAlexAbstract(work.abstract_inverted_index),
    doi,
    url,
    source: 'openalex',
    included: false,
  }
}

function normalizeCrossrefWork(
  work: CrossrefWork,
  projectId: string | undefined,
  now: string,
): LiteratureRecord | undefined {
  const mainTitle = firstText(work.title)
  if (!mainTitle) return undefined

  const subtitle = firstText(work.subtitle)
  const title = subtitle && !normalizeTitle(mainTitle).includes(normalizeTitle(subtitle))
    ? `${mainTitle}: ${subtitle}`
    : mainTitle
  const doi = normalizeDoi(work.DOI)

  return {
    id: makeRecordId(doi, title, work.URL),
    origin: 'live',
    verificationStatus: 'verified-metadata',
    createdAt: now,
    updatedAt: now,
    projectId,
    title,
    authors: uniqueNames(
      (work.author ?? []).map((author) => {
        const explicitName = cleanText(author.name)
        if (explicitName) return explicitName
        return cleanText([author.given, author.family].filter(Boolean).join(' '))
      }),
    ),
    year: crossrefYear(work),
    venue: firstText(work['container-title']) ?? cleanText(work.publisher),
    abstract: cleanText(work.abstract)?.slice(0, MAX_ABSTRACT_LENGTH),
    doi,
    url: doi ? `https://doi.org/${doi}` : safeHttpUrl(work.URL),
    source: 'crossref',
    included: false,
  }
}

function recordQuality(record: LiteratureRecord): number {
  return (
    (record.doi ? 8 : 0) +
    Math.min(record.authors.length, 5) +
    (record.year ? 2 : 0) +
    (record.venue ? 2 : 0) +
    (record.abstract ? Math.min(record.abstract.length / 500, 5) : 0) +
    (record.url ? 1 : 0) +
    (record.source === 'crossref' ? 0.1 : 0)
  )
}

export function deduplicateLiterature(records: LiteratureRecord[]): LiteratureRecord[] {
  const unique: LiteratureRecord[] = []

  for (const record of records) {
    const doi = normalizeDoi(record.doi)
    const title = normalizeTitle(record.title)
    const duplicateIndex = unique.findIndex((candidate) => {
      const candidateDoi = normalizeDoi(candidate.doi)
      return Boolean((doi && candidateDoi === doi) || (title && normalizeTitle(candidate.title) === title))
    })

    if (duplicateIndex < 0) {
      unique.push(record)
      continue
    }

    // 不混合不同门户的字段，确保 source 始终对应整条记录的真实来源。
    if (recordQuality(record) > recordQuality(unique[duplicateIndex])) {
      unique[duplicateIndex] = record
    }
  }

  return unique
}

function issueFromError(source: LiteratureProvider, error: unknown): LiteratureSearchIssue {
  if (error instanceof ProviderRequestError) {
    return { source, message: error.message, retryable: error.retryable }
  }
  return {
    source,
    message: `${source === 'openalex' ? 'OpenAlex' : 'Crossref'} 检索失败：未知错误`,
    retryable: false,
  }
}

async function requestJson<T>(
  source: LiteratureProvider,
  url: URL,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const displayName = source === 'openalex' ? 'OpenAlex' : 'Crossref'

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': CLIENT_USER_AGENT,
      },
      redirect: 'follow',
      signal: controller.signal,
    })

    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500
      throw new ProviderRequestError(
        source,
        `${displayName} 检索失败：HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
        retryable,
      )
    }

    try {
      return (await response.json()) as T
    } catch (error) {
      throw new ProviderRequestError(source, `${displayName} 返回了无法解析的数据`, false, error)
    }
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error
    const timedOut = controller.signal.aborted
    throw new ProviderRequestError(
      source,
      timedOut
        ? `${displayName} 检索超时（${timeoutMs} 毫秒）`
        : `${displayName} 网络请求失败：${error instanceof Error ? error.message : '未知网络错误'}`,
      true,
      error,
    )
  } finally {
    clearTimeout(timeout)
  }
}

function boundedLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)))
}

function validateSearchInput(input: LiteratureSearchInput): { query: string; limit: number } {
  const query = cleanText(input.query)
  if (!query) throw new TypeError('文献检索词不能为空')
  if (query.length > 500) throw new TypeError('文献检索词不能超过 500 个字符')
  return { query, limit: boundedLimit(input.limit) }
}

export class LiteratureService {
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly crossrefMailto?: string
  private readonly onIssue?: (issue: LiteratureSearchIssue) => void
  private lastIssues: LiteratureSearchIssue[] = []

  constructor(options: LiteratureServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.timeoutMs = Math.max(1_000, Math.trunc(options.timeoutMs ?? DEFAULT_TIMEOUT_MS))
    this.crossrefMailto = cleanText(options.crossrefMailto)
    this.onIssue = options.onIssue
  }

  getLastIssues(): LiteratureSearchIssue[] {
    return this.lastIssues.map((issue) => ({ ...issue }))
  }

  async search(input: LiteratureSearchInput): Promise<LiteratureRecord[]> {
    const result = await this.searchDetailed(input)
    return result.records
  }

  async searchDetailed(input: LiteratureSearchInput): Promise<LiteratureSearchResult> {
    const { query, limit } = validateSearchInput(input)
    const now = new Date().toISOString()

    const requests = await Promise.allSettled([
      this.searchOpenAlex(query, limit, input.projectId, now),
      this.searchCrossref(query, limit, input.projectId, now),
    ])

    const providerRecords: LiteratureRecord[][] = [[], []]
    const issues: LiteratureSearchIssue[] = []
    const sources: LiteratureProvider[] = ['openalex', 'crossref']

    requests.forEach((request, index) => {
      if (request.status === 'fulfilled') {
        providerRecords[index] = request.value
        return
      }
      const issue = issueFromError(sources[index], request.reason)
      issues.push(issue)
      this.onIssue?.({ ...issue })
    })

    this.lastIssues = issues
    const records: LiteratureRecord[] = []
    const largestProviderResult = Math.max(...providerRecords.map((items) => items.length))
    for (let index = 0; index < largestProviderResult; index += 1) {
      for (const items of providerRecords) {
        if (items[index]) records.push(items[index])
      }
    }
    const uniqueRecords = deduplicateLiterature(records).slice(0, limit)
    if (uniqueRecords.length === 0 && issues.length > 0) {
      throw new LiteratureSearchError(issues)
    }

    return { records: uniqueRecords, issues: this.getLastIssues() }
  }

  private async searchOpenAlex(
    query: string,
    limit: number,
    projectId: string | undefined,
    now: string,
  ): Promise<LiteratureRecord[]> {
    const url = new URL('https://api.openalex.org/works')
    url.searchParams.set('search', query)
    url.searchParams.set('per_page', String(limit))

    const response = await requestJson<OpenAlexResponse>(
      'openalex',
      url,
      this.fetchImpl,
      this.timeoutMs,
    )
    if (!Array.isArray(response.results)) {
      throw new ProviderRequestError('openalex', 'OpenAlex 返回的数据缺少 results 列表', false)
    }

    return response.results
      .map((work) => normalizeOpenAlexWork(work, projectId, now))
      .filter((record): record is LiteratureRecord => Boolean(record))
  }

  private async searchCrossref(
    query: string,
    limit: number,
    projectId: string | undefined,
    now: string,
  ): Promise<LiteratureRecord[]> {
    const url = new URL('https://api.crossref.org/works')
    url.searchParams.set('query.bibliographic', query)
    url.searchParams.set('rows', String(limit))
    if (this.crossrefMailto) url.searchParams.set('mailto', this.crossrefMailto)

    const response = await requestJson<CrossrefResponse>(
      'crossref',
      url,
      this.fetchImpl,
      this.timeoutMs,
    )
    if (!Array.isArray(response.message?.items)) {
      throw new ProviderRequestError('crossref', 'Crossref 返回的数据缺少 message.items 列表', false)
    }

    return response.message.items
      .map((work) => normalizeCrossrefWork(work, projectId, now))
      .filter((record): record is LiteratureRecord => Boolean(record))
  }
}

export async function searchLiterature(
  input: LiteratureSearchInput,
): Promise<LiteratureRecord[]> {
  return new LiteratureService().search(input)
}
