import { randomUUID } from 'node:crypto'
import type {
  ManuscriptSection,
  ManuscriptSectionVersion,
  ProviderProfile,
  WorkspaceState,
} from '../../../shared/contracts'
import { normalizeAppearanceSettings } from '../../../shared/appearance'
import { ensureDefaultArxivMcpServer, createDefaultArxivMcpServer } from '../../../shared/defaultMcp'
import { resolveHistoricalMessageLiteratureCandidates } from '../../main/mcpLiterature'

export const now = () => new Date().toISOString()

export function promoteProjectToLive(state: WorkspaceState, projectId: string): boolean {
  const project = state.projects.find((item) => item.id === projectId)
  if (!project || project.origin !== 'demo') return false
  const liveProviderIds = new Set(
    state.providers.filter((provider) => provider.origin !== 'demo').map((provider) => provider.id),
  )
  project.origin = 'live'
  project.verificationStatus = 'unverified'
  project.updatedAt = now()
  for (const conversation of state.conversations.filter((item) => item.projectId === projectId)) {
    const hasLiveMessages = state.messages.some((message) => (
      message.conversationId === conversation.id && message.origin !== 'demo'
    ))
    if (!hasLiveMessages) continue
    conversation.origin = 'live'
    conversation.verificationStatus = 'unverified'
    conversation.updatedAt = now()
  }
  for (const section of state.sections.filter((item) => item.projectId === projectId)) {
    if (!section.generationProviderId || !liveProviderIds.has(section.generationProviderId)) continue
    section.origin = 'live'
    section.verificationStatus = 'unverified'
  }
  if (state.settings.activeProjectId === projectId) state.settings.demoMode = false
  return true
}

/** 用户已经在演示项目中产生真实模型或真实文献活动时，将该项目安全升级为正式研究。 */
export function promoteConvertedDemoProjects(state: WorkspaceState): boolean {
  const liveProviderIds = new Set(
    state.providers.filter((provider) => provider.origin !== 'demo').map((provider) => provider.id),
  )
  let changed = false
  for (const project of state.projects) {
    if (project.origin !== 'demo') continue
    const hasLiveLiterature = state.literature.some(
      (record) => record.projectId === project.id && record.origin !== 'demo',
    )
    const hasLiveModelReply = state.messages.some(
      (message) => message.projectId === project.id
        && message.role === 'assistant'
        && message.status === 'completed'
        && Boolean(message.content.trim())
        && Boolean(message.providerId && liveProviderIds.has(message.providerId)),
    )
    const hasLiveSection = state.sections.some((section) => (
      section.projectId === project.id
      && Boolean(section.content.trim())
      && Boolean(section.generationProviderId && liveProviderIds.has(section.generationProviderId))
    ))
    if (hasLiveLiterature || hasLiveModelReply || hasLiveSection) {
      changed = promoteProjectToLive(state, project.id) || changed
    }
  }
  return changed
}

export function backfillHistoricalMessageLiteratureCandidates(state: WorkspaceState): boolean {
  let changed = false
  for (const message of state.messages) {
    if (message.role !== 'assistant') continue
    const resolved = resolveHistoricalMessageLiteratureCandidates(state, message)
    if (resolved.length === 0) continue
    const current = message.literatureCandidates ?? []
    const known = new Set(current.map((candidate) => candidate.id))
    const additions = resolved.filter((candidate) => !known.has(candidate.id))
    if (additions.length === 0) continue
    message.literatureCandidates = [...current, ...additions].slice(0, 50)
    changed = true
  }
  return changed
}

function sectionWordCount(content: string): number {
  return content.replace(/\s+/g, '').length
}

/**
 * 章节生成元数据在章节头和历史版本之间使用同一组可选字段。
 * 复制数组时创建副本，避免版本快照与当前章节共享可变引用。
 */
export type SectionGenerationMetadata = Pick<ManuscriptSection, 'reasoningContent'
  | 'generationProviderId'
  | 'generationModel'
  | 'thinkingRequested'
  | 'generationProfile'
  | 'generationMode'
  | 'generationStrategyIds'
  | 'generationContentForms'
  | 'generationCustomInstructions'>

export function copySectionGenerationMetadata(
  target: SectionGenerationMetadata,
  source: SectionGenerationMetadata,
): void {
  target.reasoningContent = source.reasoningContent
  target.generationProviderId = source.generationProviderId
  target.generationModel = source.generationModel
  target.thinkingRequested = source.thinkingRequested
  target.generationProfile = source.generationProfile
  target.generationMode = source.generationMode
  target.generationStrategyIds = source.generationStrategyIds
    ? [...source.generationStrategyIds]
    : undefined
  target.generationContentForms = source.generationContentForms
    ? [...source.generationContentForms]
    : undefined
  target.generationCustomInstructions = source.generationCustomInstructions
}

export function createSectionVersion(
  state: WorkspaceState,
  section: ManuscriptSection,
  source: ManuscriptSectionVersion['source'],
  timestamp: string,
  status: ManuscriptSectionVersion['status'] = section.status === 'verified' ? 'verified' : section.status === 'error' ? 'error' : 'draft',
): ManuscriptSectionVersion {
  const current = state.sectionVersions
    .filter((item) => item.sectionId === section.id)
    .sort((left, right) => right.number - left.number)[0]
  const version: ManuscriptSectionVersion = {
    id: randomUUID(),
    projectId: section.projectId,
    sectionId: section.id,
    number: (current?.number ?? 0) + 1,
    source,
    content: section.content,
    wordCount: sectionWordCount(section.content),
    status,
    reasoningContent: section.reasoningContent,
    generationProviderId: section.generationProviderId,
    generationModel: section.generationModel,
    thinkingRequested: section.thinkingRequested,
    generationProfile: section.generationProfile,
    generationMode: section.generationMode,
    generationStrategyIds: section.generationStrategyIds
      ? [...section.generationStrategyIds]
      : undefined,
    generationContentForms: section.generationContentForms
      ? [...section.generationContentForms]
      : undefined,
    generationCustomInstructions: section.generationCustomInstructions,
    origin: section.origin,
    verificationStatus: section.verificationStatus,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  state.sectionVersions.push(version)
  section.activeGenerationVersionId = version.id
  return version
}

function activeSectionVersion(
  state: WorkspaceState,
  section: ManuscriptSection,
): ManuscriptSectionVersion | undefined {
  return state.sectionVersions.find(
    (item) => item.id === section.activeGenerationVersionId && item.sectionId === section.id,
  )
}

export function preserveCurrentSectionVersion(
  state: WorkspaceState,
  section: ManuscriptSection,
  source: ManuscriptSectionVersion['source'],
  timestamp: string,
): ManuscriptSectionVersion | undefined {
  if (!section.content.trim()) return undefined
  const active = activeSectionVersion(state, section)
  if (active?.content === section.content) return active
  return createSectionVersion(state, section, source, timestamp)
}

function clearMismatchedActiveSectionVersions(state: WorkspaceState, projectId: string): void {
  for (const section of state.sections) {
    if (section.projectId !== projectId || !section.activeGenerationVersionId) continue
    const active = activeSectionVersion(state, section)
    if (!active || active.content !== section.content) section.activeGenerationVersionId = undefined
  }
}

export function preserveProjectSectionVersions(
  state: WorkspaceState,
  projectId: string,
): Map<string, string> {
  const previousContent = new Map<string, string>()
  for (const section of state.sections) {
    if (section.projectId !== projectId) continue
    previousContent.set(section.id, section.content)
    preserveCurrentSectionVersion(state, section, 'saved', section.updatedAt)
  }
  return previousContent
}

export function recordSynchronizedSectionVersions(
  state: WorkspaceState,
  projectId: string,
  targetSectionId: string,
  previousContent: Map<string, string>,
  timestamp: string,
): void {
  for (const section of state.sections) {
    if (
      section.projectId !== projectId
      || section.id === targetSectionId
      || previousContent.get(section.id) === section.content
    ) continue
    if (section.content.trim()) createSectionVersion(state, section, 'derived', timestamp)
    else section.activeGenerationVersionId = undefined
  }
  clearMismatchedActiveSectionVersions(state, projectId)
}

export function normalizeSectionVersions(state: WorkspaceState): void {
  const sectionsById = new Map(state.sections.map((section) => [section.id, section]))
  state.sectionVersions = state.sectionVersions
    .filter((item) => sectionsById.get(item.sectionId)?.projectId === item.projectId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))

  const grouped = new Map<string, ManuscriptSectionVersion[]>()
  for (const version of state.sectionVersions) {
    const list = grouped.get(version.sectionId) ?? []
    list.push(version)
    grouped.set(version.sectionId, list)
  }
  for (const versions of grouped.values()) {
    versions.sort((left, right) => left.number - right.number || left.createdAt.localeCompare(right.createdAt))
    versions.forEach((version, index) => { version.number = index + 1 })
  }

  for (const section of state.sections) {
    if (section.status === 'generating') {
      section.status = section.content.trim() ? 'draft' : 'pending'
      section.generationError = '上次章节生成因应用退出而中断，原稿已经保留。'
    }
    let versions = grouped.get(section.id) ?? []
    if (versions.length === 0 && section.content.trim()) {
      const migrated: ManuscriptSectionVersion = {
        id: `migrated-${section.id}`,
        projectId: section.projectId,
        sectionId: section.id,
        number: 1,
        source: 'migrated',
        content: section.content,
        wordCount: sectionWordCount(section.content),
        status: section.status === 'verified' ? 'verified' : section.status === 'error' ? 'error' : 'draft',
        reasoningContent: section.reasoningContent,
        generationProviderId: section.generationProviderId,
        generationModel: section.generationModel,
        thinkingRequested: section.thinkingRequested,
        generationProfile: section.generationProfile,
        generationMode: section.generationMode,
        generationStrategyIds: section.generationStrategyIds
          ? [...section.generationStrategyIds]
          : undefined,
        generationContentForms: section.generationContentForms
          ? [...section.generationContentForms]
          : undefined,
        generationCustomInstructions: section.generationCustomInstructions,
        origin: section.origin,
        verificationStatus: section.verificationStatus,
        createdAt: section.updatedAt,
        updatedAt: section.updatedAt,
      }
      state.sectionVersions.push(migrated)
      versions = [migrated]
    }
    const selected = versions.find((item) => item.id === section.activeGenerationVersionId)
      ?? [...versions].reverse().find((item) => item.content === section.content)
    section.activeGenerationVersionId = selected?.id
  }
}

export function isSelectableProvider(provider: ProviderProfile): boolean {
  return provider.enabled && (provider.origin === 'demo' || provider.lastHealth === 'connected')
}

function preferredModel(provider: ProviderProfile): string | undefined {
  if (provider.models.includes(provider.defaultModel)) return provider.defaultModel
  return provider.models[0]
}

/**
 * 当前模型属于整个工作区，而不是某一个项目。切换项目或章节时应保留有效选择；
 * 只有原选择已经不可用时，才回退到可连接的真实提供商或演示提供商。
 */
export function synchronizeActiveModelSelection(state: WorkspaceState): boolean {
  const previousProviderId = state.settings.activeProviderId
  const previousModel = state.settings.activeModel
  const available = state.providers.filter(isSelectableProvider)
  const current = available.find((provider) => provider.id === previousProviderId)
  const provider = current ?? available.find((item) => item.origin !== 'demo') ?? available[0]

  if (!provider) {
    state.settings.activeProviderId = undefined
    state.settings.activeModel = undefined
  } else {
    state.settings.activeProviderId = provider.id
    state.settings.activeModel =
      current && previousModel && provider.models.includes(previousModel)
        ? previousModel
        : preferredModel(provider)
  }

  return (
    previousProviderId !== state.settings.activeProviderId ||
    previousModel !== state.settings.activeModel
  )
}

export function demoState(): WorkspaceState {
  const timestamp = now()
  const projectId = 'demo-project'
  const conversationId = 'demo-conversation'

  return {
    schemaVersion: 1,
    projects: [
      {
        id: projectId,
        origin: 'demo',
        verificationStatus: 'demo',
        createdAt: timestamp,
        updatedAt: timestamp,
        title: '生成式 AI 赋能高校教学的作用机制研究',
        status: 'outline-review',
        activeConversationId: conversationId,
        brief: {
          title: '生成式 AI 赋能高校教学的作用机制研究',
          paperType: '本科毕业论文',
          discipline: '教育学',
          language: 'zh-CN',
          targetWords: 12000,
          requirements: '梳理作用机制、现实风险与治理建议，所有引用均需可追溯。',
          keywords: ['生成式人工智能', '高校教学', '作用机制'],
        },
      },
    ],
    conversations: [
      {
        id: conversationId,
        projectId,
        title: '研究方案与论文初稿',
        messageIds: ['demo-message-user', 'demo-message-assistant'],
        origin: 'demo',
        verificationStatus: 'demo',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    attachments: [],
    messages: [
      {
        id: 'demo-message-user',
        projectId,
        conversationId,
        role: 'user',
        content: '围绕生成式 AI 如何影响高校教学质量，先检索文献，再生成三级大纲。',
        status: 'completed',
        origin: 'demo',
        verificationStatus: 'demo',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'demo-message-assistant',
        projectId,
        conversationId,
        role: 'assistant',
        content:
          '已建立研究简报，并将问题拆分为教学支持、学习行为、教师角色和治理风险四条主线。右侧文献均为演示记录，不可用于正式引用；配置模型并发起真实检索后，我会替换为可追溯来源。',
        status: 'completed',
        origin: 'demo',
        verificationStatus: 'demo',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    providers: [],
    literature: [
      {
        id: 'demo-literature-1',
        projectId,
        title: '演示：生成式人工智能与高等教育研究综述',
        authors: ['演示作者'],
        year: 2025,
        venue: '演示来源',
        source: 'demo',
        included: false,
        origin: 'demo',
        verificationStatus: 'demo',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'demo-literature-2',
        projectId,
        title: '演示：高校教师采用生成式 AI 的影响因素',
        authors: ['演示作者'],
        year: 2024,
        venue: '演示来源',
        source: 'demo',
        included: false,
        origin: 'demo',
        verificationStatus: 'demo',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    outlines: {
      [projectId]: [
        {
          id: 'demo-outline-1',
          title: '第一章 绪论',
          level: 1,
          objective: '交代研究背景、问题和方法。',
          targetWords: 1800,
          citationIds: [],
          children: [
            {
              id: 'demo-outline-1-1',
              title: '1.1 研究背景与问题提出',
              level: 2,
              objective: '界定研究情境与核心问题。',
              targetWords: 700,
              citationIds: [],
              children: [
                {
                  id: 'demo-outline-1-1-1',
                  title: '1.1.1 生成式 AI 进入高校教学的现实背景',
                  level: 3,
                  objective: '梳理技术与教学场景变化。',
                  targetWords: 350,
                  citationIds: [],
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
    outlineArchitectures: {},
    outlineQualityReports: {},
    sections: [],
    sectionVersions: [],
    citations: [],
    runs: [],
    mcpServers: [createDefaultArxivMcpServer(timestamp)],
    skills: [],
    artifacts: [],
    settings: {
      activeProjectId: projectId,
      sidebarViewMode: 'projects',
      sidebarChatSort: 'priority',
      sidebarExpandedProjectIds: [projectId],
      appearance: normalizeAppearanceSettings(undefined),
      demoMode: true,
    },
  }
}

export function normalizeState(candidate: Partial<WorkspaceState>): WorkspaceState {
  const base = demoState()
  const normalized: WorkspaceState = {
    ...base,
    ...candidate,
    schemaVersion: 1,
    projects: (candidate.projects ?? base.projects).map((project, index) => ({
      ...project,
      pinned: project.pinned === true,
      manualOrder: typeof project.manualOrder === 'number' ? project.manualOrder : index,
    })),
    conversations: (candidate.conversations ?? base.conversations).map((conversation, index) => ({
      ...conversation,
      pinned: conversation.pinned === true,
      archived: conversation.archived === true,
      unread: conversation.unread === true,
      manualOrder: typeof conversation.manualOrder === 'number' ? conversation.manualOrder : index,
      goal: typeof conversation.goal === 'string' ? conversation.goal : undefined,
      planMode: conversation.planMode === true,
      accessMode: conversation.accessMode === 'full' ? 'full' : 'ask',
    })),
    attachments: Array.isArray(candidate.attachments) ? candidate.attachments : [],
    messages: candidate.messages ?? base.messages,
    providers: candidate.providers ?? [],
    literature: candidate.literature ?? base.literature,
    outlines: candidate.outlines ?? base.outlines,
    outlineArchitectures: candidate.outlineArchitectures ?? {},
    outlineQualityReports: candidate.outlineQualityReports ?? {},
    sections: candidate.sections ?? [],
    sectionVersions: Array.isArray(candidate.sectionVersions) ? candidate.sectionVersions : [],
    citations: candidate.citations ?? [],
    runs: candidate.runs ?? [],
    mcpServers: ensureDefaultArxivMcpServer(candidate.mcpServers ?? base.mcpServers, now()),
    skills: Array.isArray(candidate.skills) ? candidate.skills : [],
    artifacts: candidate.artifacts ?? [],
    settings: {
      ...base.settings,
      ...(candidate.settings ?? {}),
      appearance: normalizeAppearanceSettings(candidate.settings?.appearance),
    },
  }
  const activeProject = normalized.projects.find(
    (project) => project.id === normalized.settings.activeProjectId,
  )
  if (!activeProject) {
    const fallback = normalized.projects.find((project) => project.origin !== 'demo') ?? normalized.projects[0]
    normalized.settings.activeProjectId = fallback?.id
    normalized.settings.demoMode = fallback?.origin === 'demo'
  } else {
    normalized.settings.demoMode = activeProject.origin === 'demo'
  }
  normalized.settings.sidebarViewMode = normalized.settings.sidebarViewMode === 'list' ? 'list' : 'projects'
  normalized.settings.sidebarShowArchived = normalized.settings.sidebarShowArchived === true
  normalized.settings.sidebarWidth =
    typeof normalized.settings.sidebarWidth === 'number'
      ? Math.max(240, Math.min(520, Math.round(normalized.settings.sidebarWidth)))
      : undefined
  normalized.settings.rightPanelWidth =
    typeof normalized.settings.rightPanelWidth === 'number'
      ? Math.max(320, Math.min(620, Math.round(normalized.settings.rightPanelWidth)))
      : undefined
  normalized.settings.sidebarChatSort = ['priority', 'recent', 'manual'].includes(
    normalized.settings.sidebarChatSort ?? '',
  )
    ? normalized.settings.sidebarChatSort
    : 'priority'
  const knownProjectIds = new Set(normalized.projects.map((project) => project.id))
  normalized.settings.sidebarExpandedProjectIds = Array.isArray(
    normalized.settings.sidebarExpandedProjectIds,
  )
    ? [...new Set(normalized.settings.sidebarExpandedProjectIds)].filter((id) => knownProjectIds.has(id))
    : normalized.settings.activeProjectId
      ? [normalized.settings.activeProjectId]
      : []
  normalizeSectionVersions(normalized)
  return normalized
}

export const createLiveEntityBase = () => ({
  id: randomUUID(),
  origin: 'live' as const,
  verificationStatus: 'unverified' as const,
  createdAt: now(),
  updatedAt: now(),
})
