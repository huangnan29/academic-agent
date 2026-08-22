import { randomUUID } from 'node:crypto'
import type {
  LiteratureRecord,
  OutlineNode,
  WorkspaceState,
} from '../../../shared/contracts'
import { extractCitationIds } from '../pipeline'
import { now, promoteProjectToLive } from './workspace-state'

function normalizeLiteratureTitle(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '')
  return normalized || value.normalize('NFKC').toLocaleLowerCase().trim()
}

function literatureVerificationRank(status: LiteratureRecord['verificationStatus']): number {
  if (status === 'verified-metadata') return 3
  if (status === 'abstract-only') return 2
  if (status === 'unverified') return 1
  return 0
}

/** 重复检索只允许更可信来源替换元数据；同级或更低可信来源只能补齐空字段。 */
function mergeLiteratureRecord(
  existing: LiteratureRecord,
  incoming: LiteratureRecord,
): LiteratureRecord {
  const incomingIsMoreTrusted = literatureVerificationRank(incoming.verificationStatus)
    > literatureVerificationRank(existing.verificationStatus)
  const merged = incomingIsMoreTrusted
    ? { ...existing, ...incoming }
    : {
        ...existing,
        authors: existing.authors.length > 0 ? existing.authors : incoming.authors,
        year: existing.year ?? incoming.year,
        venue: existing.venue || incoming.venue,
        abstract: existing.abstract || incoming.abstract,
        doi: existing.doi || incoming.doi,
        url: existing.url || incoming.url,
      }
  return {
    ...merged,
    id: existing.id,
    projectId: existing.projectId,
    included: existing.included,
    createdAt: existing.createdAt,
    updatedAt: now(),
  }
}

function outlineReferencesLiterature(nodes: OutlineNode[], literatureId: string): boolean {
  return nodes.some((node) => (
    node.citationIds.includes(literatureId)
    || outlineReferencesLiterature(node.children, literatureId)
  ))
}

function literatureIsReferenced(
  state: WorkspaceState,
  record: LiteratureRecord,
): boolean {
  if (!record.projectId) return false
  if (state.citations.some((citation) => (
    citation.projectId === record.projectId && citation.literatureId === record.id
  ))) return true
  if (outlineReferencesLiterature(state.outlines[record.projectId] ?? [], record.id)) return true
  return state.sections.some((section) => (
    section.projectId === record.projectId
    && extractCitationIds(section.content).includes(record.id)
  ))
}

export function addLiterature(state: WorkspaceState, records: LiteratureRecord[], projectId?: string): LiteratureRecord[] {
      if (projectId && !state.projects.some((project) => project.id === projectId)) {
        throw new Error('项目不存在或已经被移除。')
      }
      const incoming = records.map((record) => ({ ...record, projectId: projectId ?? record.projectId }))
      if (projectId && incoming.some((record) => record.origin !== 'demo')) {
        promoteProjectToLive(state, projectId)
      }
      const saved: LiteratureRecord[] = []
      for (const record of incoming) {
        const index = state.literature.findIndex(
          (item) =>
            item.projectId === record.projectId &&
            ((item.doi && record.doi && item.doi.toLowerCase() === record.doi.toLowerCase()) ||
              normalizeLiteratureTitle(item.title) === normalizeLiteratureTitle(record.title)),
        )
        if (index >= 0) {
          const existing = state.literature[index]
          state.literature[index] = mergeLiteratureRecord(existing, record)
          saved.push(state.literature[index])
        } else {
          const uniqueRecord = state.literature.some((item) => item.id === record.id)
            ? { ...record, id: randomUUID() }
            : record
          state.literature.push(uniqueRecord)
          saved.push(uniqueRecord)
        }
      }
      return saved
}
export function addLiteratureFromMessage(state: WorkspaceState, messageId: string, candidateIds: string[]): LiteratureRecord[] {
      const message = state.messages.find((item) => item.id === messageId && item.role === 'assistant')
      if (!message) throw new Error('助手消息不存在或已经被移除。')
      if (!state.projects.some((project) => project.id === message.projectId)) {
        throw new Error('消息所属项目不存在或已经被移除。')
      }

      const uniqueIds = [...new Set(candidateIds)]
      if (uniqueIds.length === 0 || uniqueIds.length > 50) {
        throw new Error('请选择 1–50 篇消息中的文献。')
      }
      const candidates = uniqueIds.map((candidateId) => {
        const candidate = message.literatureCandidates?.find((item) => item.id === candidateId)
        if (!candidate) throw new Error('所选文献不属于这条消息，请重新选择。')
        return candidate
      })
      promoteProjectToLive(state, message.projectId)

      const addedAt = now()
      return candidates.map((candidate) => {
        const existing = state.literature.find((item) => (
          item.projectId === message.projectId
          && (
            (item.doi && candidate.doi && item.doi.toLocaleLowerCase() === candidate.doi.toLocaleLowerCase())
            || normalizeLiteratureTitle(item.title) === normalizeLiteratureTitle(candidate.title)
          )
        ))
        if (existing) return existing

        const record: LiteratureRecord = {
          id: randomUUID(),
          projectId: message.projectId,
          title: candidate.title,
          authors: [...candidate.authors],
          year: candidate.year,
          venue: candidate.venue,
          abstract: candidate.abstract,
          doi: candidate.doi,
          url: candidate.url,
          source: 'mcp',
          included: false,
          origin: 'live',
          verificationStatus: 'unverified',
          createdAt: addedAt,
          updatedAt: addedAt,
        }
        state.literature.push(record)
        return record
      })
}
export function toggleLiterature(state: WorkspaceState, projectId: string, literatureId: string, included: boolean): LiteratureRecord {
      if (!state.projects.some((project) => project.id === projectId)) {
        throw new Error('项目不存在或已经被移除。')
      }
      const record = state.literature.find(
        (item) => item.id === literatureId && (!item.projectId || item.projectId === projectId),
      )
      if (!record) throw new Error('文献记录不存在。')
      if (included && record.origin === 'demo') {
        throw new Error('演示文献不可用于正式引用。')
      }
      if (!included && record.included && literatureIsReferenced(state, record)) {
        throw new Error('该文献仍被大纲或正文引用，不能取消纳入。请先移除对应引用。')
      }
      if (included && record.origin !== 'demo') promoteProjectToLive(state, projectId)
      record.projectId = projectId
      record.included = included
      record.updatedAt = now()
      return record
}
export function setLiteratureProject(state: WorkspaceState, literatureId: string, sourceProjectId?: string | null, targetProjectId?: string): LiteratureRecord {
      const record = state.literature.find((item) => (
        item.id === literatureId
        && (
          sourceProjectId === undefined
          || (sourceProjectId === null ? item.projectId === undefined : item.projectId === sourceProjectId)
        )
      ))
      if (!record) throw new Error('文献记录不存在。')
      if (targetProjectId && !state.projects.some((project) => project.id === targetProjectId)) {
        throw new Error('目标项目不存在或已经被移除。')
      }
      if (record.projectId !== targetProjectId && literatureIsReferenced(state, record)) {
        throw new Error('该文献仍被大纲或正文引用，请先移除对应引用后再移动。')
      }
      if (targetProjectId) {
        const duplicated = state.literature.find((item) => (
          item.id !== record.id
          && item.projectId === targetProjectId
          && (
            (item.doi && record.doi && item.doi.toLocaleLowerCase() === record.doi.toLocaleLowerCase())
            || normalizeLiteratureTitle(item.title) === normalizeLiteratureTitle(record.title)
          )
        ))
        if (duplicated) throw new Error('目标项目已经存在同一篇文献。')
        if (record.origin !== 'demo') promoteProjectToLive(state, targetProjectId)
      }
      record.projectId = targetProjectId
      record.included = false
      record.updatedAt = now()
      return record
}
export function deleteLiterature(state: WorkspaceState, literatureId: string, sourceProjectId?: string | null): void {
      const index = state.literature.findIndex((item) => (
        item.id === literatureId
        && (
          sourceProjectId === undefined
          || (sourceProjectId === null ? item.projectId === undefined : item.projectId === sourceProjectId)
        )
      ))
      if (index < 0) throw new Error('文献记录不存在。')
      const record = state.literature[index]
      if (literatureIsReferenced(state, record)) {
        throw new Error('该文献仍被大纲或正文引用，请先移除对应引用后再删除。')
      }
      state.literature.splice(index, 1)
}
