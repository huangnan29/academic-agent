import type {
  ManuscriptSection,
  SectionContentForm,
  SectionGenerateInput,
  SectionGenerationMode,
  SectionGenerationOptions,
  SectionGenerationPreview,
  SectionGenerationPreviewInput,
  SectionOptimizationStrategy,
  SectionProfile,
} from '../../shared/contracts'
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

function generationMetadata(input: SectionGenerateInput): Pick<ManuscriptSection, 'generationProfile' | 'generationMode' | 'generationStrategyIds' | 'generationContentForms' | 'generationCustomInstructions'> {
  return {
    generationProfile: input.options?.profile,
    generationMode: input.options?.mode,
    generationStrategyIds: input.options?.strategyIds
      ? [...input.options.strategyIds]
      : undefined,
    generationContentForms: input.options?.contentForms
      ? [...input.options.contentForms]
      : undefined,
    generationCustomInstructions: input.options?.customInstructions,
  }
}

const PROFILE_LABELS: Record<SectionProfile, string> = {
  abstract: '摘要',
  introduction: '绪论 / 问题提出',
  'literature-review': '文献综述 / 理论基础',
  'method-design': '方法 / 研究设计',
  'result-implementation': '结果 / 系统实现',
  'discussion-conclusion': '讨论 / 结论',
  'general-analysis': '通用分析',
}

const PROFILE_SUMMARIES: Record<SectionProfile, string> = {
  abstract: '用最少篇幅交代研究问题、路径、可核验内容、结论边界和关键词。',
  introduction: '把现实情境收束为可回答的问题，交代缺口、目标、范围和全文推进路径。',
  'literature-review': '按主题、概念、方法或争点组织证据，比较观点和局限，定位本研究的分析位置。',
  'method-design': '交代对象、材料、条件、变量或模块、步骤和可复现边界，让方法服务于研究问题。',
  'result-implementation': '报告可核验的产物、观察、测量或实现证据，区分事实、分析和待验证事项。',
  'discussion-conclusion': '回答研究问题，解释结果与既有证据的关系，交代局限和可执行的后续方向。',
  'general-analysis': '围绕节点目标组织主张、证据、推理和边界，不套用章节模板。',
}

const DEFAULT_STRATEGIES: Record<SectionProfile, SectionOptimizationStrategy[]> = {
  abstract: ['concise', 'evidence-first'],
  introduction: ['evidence-first', 'natural-academic'],
  'literature-review': ['evidence-first', 'argument-deepening'],
  'method-design': ['evidence-first', 'concise'],
  'result-implementation': ['evidence-first', 'argument-deepening'],
  'discussion-conclusion': ['argument-deepening', 'natural-academic'],
  'general-analysis': ['evidence-first', 'natural-academic'],
}

const AVAILABLE_CONTENT_FORMS: Record<SectionProfile, SectionContentForm[]> = {
  abstract: [],
  introduction: ['diagram'],
  'literature-review': ['table', 'diagram'],
  'method-design': ['table', 'diagram', 'formula', 'code'],
  'result-implementation': ['table', 'diagram', 'formula', 'code'],
  'discussion-conclusion': ['table', 'diagram'],
  'general-analysis': ['table', 'diagram'],
}

function inferDemoProfile(title: string): SectionProfile {
  const normalized = title.toLocaleLowerCase('zh-CN')
  if (/摘要|abstract|summary/.test(normalized)) return 'abstract'
  if (/绪论|引言|导论|问题提出|研究背景|introduction|background/.test(normalized)) return 'introduction'
  if (/文献综述|研究综述|研究现状|理论基础|理论框架|相关工作|literature review|related work/.test(normalized)) {
    return 'literature-review'
  }
  if (/方法|研究设计|方法论|技术路线|系统设计|总体设计|详细设计|methodology|research design|architecture/.test(normalized)) {
    return 'method-design'
  }
  if (/结果|实验|测试|验证|实现|evaluation|results|experiments|implementation/.test(normalized)) {
    return 'result-implementation'
  }
  if (/讨论|结论|结语|局限|展望|建议|discussion|conclusion|limitations/.test(normalized)) {
    return 'discussion-conclusion'
  }
  return 'general-analysis'
}

function buildFallbackSectionPreview(
  state: ReturnType<typeof readState>,
  input: SectionGenerationPreviewInput,
): SectionGenerationPreview {
  const project = state.projects.find((item) => item.id === input.projectId)
  const sourceSection = state.sections.find((item) => (
    item.projectId === input.projectId
      && (item.id === input.sectionId || item.outlineNodeId === input.sectionId)
  ))
  if (!project || !sourceSection) throw new Error('项目或论文章节不存在。')

  const outline = state.outlines[input.projectId] ?? []
  const target = findOutlineNode(outline, sourceSection.outlineNodeId)
  const options: SectionGenerationOptions | undefined = input.options
  const profile = options?.profile ?? inferDemoProfile(sourceSection.title)
  const defaultStrategyIds = [...DEFAULT_STRATEGIES[profile]]
  const strategyIds = Array.from(new Set(options?.strategyIds ?? defaultStrategyIds)).slice(0, 2)
  const requestedForms = options?.contentForms
    ? Array.from(new Set(options.contentForms))
    : (target?.contentForms ?? []).filter(
        (form): form is SectionContentForm => form !== 'prose',
      )
  const availableContentForms = [...AVAILABLE_CONTENT_FORMS[profile]]
  const selectedContentForms = requestedForms.filter((form) => availableContentForms.includes(form))
  const unsupportedContentForms = requestedForms.filter((form) => !availableContentForms.includes(form))
  const mode: SectionGenerationMode = options?.mode
    ?? (sourceSection.content.trim() ? 'revise' : 'initial')

  return {
    profile,
    profileLabel: PROFILE_LABELS[profile],
    profileSummary: PROFILE_SUMMARIES[profile],
    mode,
    strategyIds,
    defaultStrategyIds,
    availableContentForms,
    selectedContentForms,
    unsupportedContentForms,
    dataBoundary: '浏览器演示预览只读取本机演示状态，不会调用真实模型或文献门户；演示稿与演示文献均不可直接作为正式论文证据。',
    currentWordCount: sourceSection.wordCount,
    includedLiteratureCount: state.literature.filter((item) => (
      item.projectId === input.projectId && item.included && item.origin !== 'demo'
    )).length,
    generatedSectionCount: state.sections.filter((item) => (
      item.projectId === input.projectId
      && !item.derivedFromSectionId
      && Boolean(item.content.trim())
    )).length,
  }
}

export const sectionApi: Window['paperAgent']['section'] = {
  async previewGeneration(input) {
    return clone(buildFallbackSectionPreview(readState(), input))
  },
  async generate(input) {
    const outline = readState().outlines[input.projectId] ?? []
    const sourceSection = readState().sections.find(
      (item) => item.id === input.sectionId || item.outlineNodeId === input.sectionId,
    )
    const outlineNodeId = sourceSection?.outlineNodeId ?? input.sectionId
    const target = findOutlineNode(outline, outlineNodeId)
    const provider = readState().providers.find((item) => item.id === input.providerId)
    const runId = makeId('section-run')
    const metadata = generationMetadata(input)
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
        Object.assign(existing, metadata)
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
          ...metadata,
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
        Object.assign(existing, metadata)
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
      selected.generationProfile = version.generationProfile
      selected.generationMode = version.generationMode
      selected.generationStrategyIds = version.generationStrategyIds
        ? [...version.generationStrategyIds]
        : undefined
      selected.generationContentForms = version.generationContentForms
        ? [...version.generationContentForms]
        : undefined
      selected.generationCustomInstructions = version.generationCustomInstructions
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
