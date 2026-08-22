import type { ManuscriptSection } from '../../shared/contracts'
import { saveSectionContentInState } from '../../shared/sectionContent'
import { emitSection, subscribeSection } from './events'
import {
  clone,
  findOutlineNode,
  makeId,
  makeSectionVersion,
  mutate,
  now,
  preserveFallbackProjectVersions,
  readState,
  recordFallbackDerivedVersions,
  restoreActiveModelIfNeeded,
} from './state'

export const sectionApi: Window['paperAgent']['section'] = {
  async generate(input) {
    const outline = readState().outlines[input.projectId] ?? []
    const sourceSection = readState().sections.find(
      (item) => item.id === input.sectionId || item.outlineNodeId === input.sectionId,
    )
    const outlineNodeId = sourceSection?.outlineNodeId ?? input.sectionId
    const target = findOutlineNode(outline, outlineNodeId)
    const provider = readState().providers.find((item) => item.id === input.providerId)
    const runId = makeId('section-run')
    const fullContent = sourceSection
      ? `## ${sourceSection.title}\n\n这是根据当前大纲生成的浏览器演示章节。真实应用会使用所选模型和已纳入文献逐段写作，并在右侧标记引用证据的核验状态。\n\n当前结果未连接真实模型与文献门户，不可作为正式论文内容。`
      : target
        ? `## ${target.title}\n\n这是浏览器演示章节，尚未调用真实模型。`
        : ''
    mutate((draft) => {
      const existing = draft.sections.find(
        (item) => item.id === input.sectionId || item.outlineNodeId === input.sectionId,
      )
      if (existing) {
        preserveFallbackProjectVersions(draft, existing.projectId)
        existing.status = 'generating'
        existing.generationError = undefined
        existing.generationProviderId = input.providerId
        existing.generationModel = input.model
        existing.thinkingRequested = false
        existing.updatedAt = now()
      } else if (target) {
        draft.sections.push({
          id: makeId('section'),
          projectId: input.projectId,
          outlineNodeId,
          title: target.title,
          level: target.level,
          content: '',
          status: 'generating',
          wordCount: 0,
          version: 1,
          generationProviderId: input.providerId,
          generationModel: input.model,
          thinkingRequested: false,
          origin: 'demo',
          verificationStatus: 'demo',
          createdAt: now(),
          updatedAt: now(),
        })
      }
    })
    emitSection({
      runId,
      sectionId: sourceSection?.id ?? input.sectionId,
      type: 'started',
      providerId: input.providerId,
      providerName: provider?.name ?? '浏览器演示',
      model: input.model,
      thinkingRequested: false,
    })
    const deltas = fullContent.match(/.{1,5}/gs) ?? [fullContent]
    for (const delta of deltas) {
      await new Promise((resolve) => window.setTimeout(resolve, 24))
      emitSection({ runId, sectionId: sourceSection?.id ?? input.sectionId, type: 'text-delta', delta })
    }
    const completedState = mutate((draft) => {
      const existing = draft.sections.find((item) => item.id === (sourceSection?.id ?? input.sectionId))
      if (existing) {
        const previous = preserveFallbackProjectVersions(draft, existing.projectId)
        saveSectionContentInState(draft, existing.id, fullContent, now())
        existing.reasoningContent = undefined
        existing.generationProviderId = input.providerId
        existing.generationModel = input.model
        existing.thinkingRequested = false
        existing.generationError = undefined
        recordFallbackDerivedVersions(draft, existing.projectId, existing.id, previous)
        makeSectionVersion(draft, existing, 'generated')
      }
    })
    const completed = completedState.sections.find((item) => item.id === (sourceSection?.id ?? input.sectionId))
    if (completed) emitSection({ runId, sectionId: completed.id, type: 'completed', section: clone(completed) })
  },
  async save(sectionId, content) {
    mutate((draft) => {
      const section = draft.sections.find((item) => item.id === sectionId)
      if (!section) throw new Error('未找到对应章节')
      const previous = preserveFallbackProjectVersions(draft, section.projectId)
      const saved = saveSectionContentInState(draft, sectionId, content, now())
      recordFallbackDerivedVersions(draft, section.projectId, sectionId, previous)
      const active = draft.sectionVersions.find((item) => item.id === saved.activeGenerationVersionId)
      if (active?.content !== saved.content) makeSectionVersion(draft, saved, 'saved')
    })
  },
  async setActive(sectionId) {
    const next = mutate((draft) => {
      const section = draft.sections.find((item) => item.id === sectionId)
      if (!section) throw new Error('未找到对应章节')

      const project = draft.projects.find((item) => item.id === section.projectId)
      if (!project) throw new Error('未找到章节所属项目')

      project.activeSectionId = section.id
      project.updatedAt = now()
      draft.settings.activeProjectId = project.id
      draft.settings.demoMode = project.origin === 'demo'
      restoreActiveModelIfNeeded(draft)
    })
    return clone(next)
  },
  async selectVersion(sectionId, versionId) {
    let selected: ManuscriptSection | undefined
    mutate((draft) => {
      const section = draft.sections.find((item) => item.id === sectionId)
      const version = draft.sectionVersions.find((item) => item.id === versionId && item.sectionId === sectionId)
      if (!section || !version) throw new Error('未找到章节历史版本')
      if (section.status === 'generating') throw new Error('章节正在生成，暂时不能切换历史版本')
      const previous = preserveFallbackProjectVersions(draft, section.projectId)
      selected = saveSectionContentInState(draft, sectionId, version.content, now())
      selected.reasoningContent = version.reasoningContent
      selected.generationProviderId = version.generationProviderId
      selected.generationModel = version.generationModel
      selected.thinkingRequested = version.thinkingRequested
      selected.status = version.status
      selected.generationError = version.source === 'partial' ? '这是一次未完整生成的历史版本。' : undefined
      recordFallbackDerivedVersions(draft, section.projectId, sectionId, previous)
      selected.activeGenerationVersionId = version.id
    })
    if (!selected) throw new Error('未找到章节历史版本')
    return clone(selected)
  },
  onEvent: subscribeSection,
}
