import type { LiteratureRecord } from '../../shared/contracts'
import { demoLiterature } from './fixtures'
import { clone, flattenOutline, makeId, mutate, now, readState } from './state'

function normalizeFallbackLiteratureTitle(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '')
  return normalized || value.normalize('NFKC').toLocaleLowerCase().trim()
}

export const literatureApi: Window['paperAgent']['literature'] = {
  async search(input) {
    const query = input.query.trim().toLowerCase()
    const matches = demoLiterature.filter((item) =>
      [item.title, item.abstract, ...item.authors].filter(Boolean).join(' ').toLowerCase().includes(query),
    )
    const results = (matches.length > 0 ? matches : demoLiterature).slice(0, input.limit ?? 20).map((item) => ({
      ...item,
      id: input.projectId ? `${item.id}-${input.projectId}` : item.id,
      projectId: input.projectId,
      included: false,
      updatedAt: now(),
    }))
    mutate((draft) => {
      const ids = new Set(results.map((item) => item.id))
      draft.literature = [...draft.literature.filter((item) => !ids.has(item.id)), ...results]
    })
    return clone(results)
  },
  async toggle(projectId, literatureId, included) {
    let updated: LiteratureRecord | undefined
    mutate((draft) => {
      const target = draft.literature.find((item) => item.id === literatureId)
      if (target) {
        target.projectId = projectId
        target.included = included
        target.updatedAt = now()
        updated = target
      }
    })
    if (!updated) throw new Error('未找到文献记录')
    return clone(updated)
  },
  async setProject(input) {
    let updated: LiteratureRecord | undefined
    mutate((draft) => {
      const target = draft.literature.find((item) => (
        item.id === input.literatureId
        && (
          input.sourceProjectId === undefined
          || (input.sourceProjectId === null ? item.projectId === undefined : item.projectId === input.sourceProjectId)
        )
      ))
      if (!target) return
      if (input.targetProjectId && !draft.projects.some((project) => project.id === input.targetProjectId)) {
        throw new Error('目标项目不存在')
      }
      target.projectId = input.targetProjectId
      target.included = false
      target.updatedAt = now()
      updated = target
    })
    if (!updated) throw new Error('未找到文献记录')
    return clone(updated)
  },
  async delete(input) {
    let removed = false
    mutate((draft) => {
      const index = draft.literature.findIndex((item) => (
        item.id === input.literatureId
        && (
          input.sourceProjectId === undefined
          || (input.sourceProjectId === null ? item.projectId === undefined : item.projectId === input.sourceProjectId)
        )
      ))
      if (index < 0) return
      const record = draft.literature[index]
      const referenced = Boolean(record.projectId) && (
        draft.citations.some((citation) => citation.projectId === record.projectId && citation.literatureId === record.id)
        || flattenOutline(draft.outlines[record.projectId!] ?? []).some((node) => node.citationIds.includes(record.id))
        || draft.sections.some((section) => (
          section.projectId === record.projectId
          && (
            section.content.includes(`【文献:${record.id}】`)
            || section.content.includes(`【文献：${record.id}】`)
            || section.content.includes(`[cite:${record.id}]`)
            || section.content.includes(`[@${record.id}]`)
          )
        ))
      )
      if (referenced) throw new Error('该文献仍被大纲或正文引用，请先移除对应引用后再删除。')
      draft.literature.splice(index, 1)
      removed = true
    })
    if (!removed) throw new Error('未找到文献记录')
  },
  async addFromMessage(input) {
    const added: LiteratureRecord[] = []
    mutate((draft) => {
      const message = draft.messages.find((item) => item.id === input.messageId && item.role === 'assistant')
      if (!message) throw new Error('未找到助手消息')
      for (const candidateId of [...new Set(input.candidateIds)]) {
        const candidate = message.literatureCandidates?.find((item) => item.id === candidateId)
        if (!candidate) throw new Error('所选文献不属于这条消息')
        const existing = draft.literature.find((item) => (
          item.projectId === message.projectId
          && normalizeFallbackLiteratureTitle(item.title) === normalizeFallbackLiteratureTitle(candidate.title)
        ))
        if (existing) {
          added.push(existing)
          continue
        }
        const timestamp = now()
        const record: LiteratureRecord = {
          ...candidate,
          id: makeId('literature'),
          projectId: message.projectId,
          included: false,
          origin: 'demo',
          verificationStatus: 'demo',
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        draft.literature.push(record)
        added.push(record)
      }
    })
    return clone(added)
  },
}
