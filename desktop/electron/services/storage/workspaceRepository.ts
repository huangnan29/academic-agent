import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  AgentRun,
  AppearanceSettingsInput,
  Artifact,
  ChatMessage,
  CitationEvidence,
  Conversation,
  ConversationAttachment,
  ConversationUpdateInput,
  LiteratureRecord,
  McpServerConfig,
  ManuscriptSection,
  ManuscriptSectionVersion,
  OutlineNode,
  Project,
  ProviderProfile,
  ResearchBrief,
  SidebarPreferencesInput,
  SkillDefinition,
  SkillInput,
  WorkspaceState,
} from '../../../shared/contracts'
import {
  mergeAppearanceSettings,
  normalizeAppearanceSettings,
} from '../../../shared/appearance'
import {
  saveSectionContentInState,
  synchronizeDerivedSections,
} from '../../../shared/sectionContent'
import {
  createDefaultArxivMcpServer,
  ensureDefaultArxivMcpServer,
} from '../../../shared/defaultMcp'
import { resolveHistoricalMessageLiteratureCandidates } from '../../main/mcpLiterature'
import { extractCitationIds } from '../pipeline'

const now = () => new Date().toISOString()

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

function promoteProjectToLive(state: WorkspaceState, projectId: string): boolean {
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
function promoteConvertedDemoProjects(state: WorkspaceState): boolean {
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

function backfillHistoricalMessageLiteratureCandidates(state: WorkspaceState): boolean {
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

function createSectionVersion(
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

function preserveCurrentSectionVersion(
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

function preserveProjectSectionVersions(
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

function recordSynchronizedSectionVersions(
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

function normalizeSectionVersions(state: WorkspaceState): void {
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

function isSelectableProvider(provider: ProviderProfile): boolean {
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
function synchronizeActiveModelSelection(state: WorkspaceState): boolean {
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

function demoState(): WorkspaceState {
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

function normalizeState(candidate: Partial<WorkspaceState>): WorkspaceState {
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

export class WorkspaceRepository {
  private state: WorkspaceState = demoState()
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<WorkspaceState>
      this.state = normalizeState(parsed)
      let changed = JSON.stringify(parsed) !== JSON.stringify(this.state)
      changed = synchronizeActiveModelSelection(this.state) || changed
      changed = promoteConvertedDemoProjects(this.state) || changed
      // 兼容旧版本：父章节已经包含子标题时，只回填对应的空白子章节。
      changed = synchronizeDerivedSections(this.state) || changed
      normalizeSectionVersions(this.state)
      changed = backfillHistoricalMessageLiteratureCandidates(this.state) || changed
      for (const run of this.state.runs) {
        if (run.status !== 'queued' && run.status !== 'running') continue
        run.status = 'cancelled'
        run.error = run.error ?? '上次会话已结束，未完成任务已停止。'
        run.updatedAt = now()
        for (const step of run.steps) {
          if (step.status !== 'running') continue
          step.status = 'stopped'
          step.completedAt = now()
        }
        changed = true
      }
      if (changed) await this.persist()
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
      this.state = demoState()
      await this.persist()
    }
  }

  snapshot(): WorkspaceState {
    return structuredClone(this.state)
  }

  private async persist(): Promise<void> {
    const serialized = `${JSON.stringify(this.state, null, 2)}\n`
    const temporary = `${this.filePath}.tmp`
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      await writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, this.filePath)
    })
    await this.writeQueue
  }

  private async mutate<T>(operation: (state: WorkspaceState) => T): Promise<T> {
    const result = operation(this.state)
    await this.persist()
    return structuredClone(result)
  }

  async createProject(brief: ResearchBrief): Promise<Project> {
    return this.mutate((state) => {
      const timestamp = now()
      const projectId = randomUUID()
      const conversationId = randomUUID()
      const project: Project = {
        id: projectId,
        title: brief.title,
        brief,
        status: 'draft',
        activeConversationId: conversationId,
        pinned: false,
        manualOrder: Math.min(0, ...state.projects.map((item) => item.manualOrder ?? 0)) - 1,
        origin: 'live',
        verificationStatus: 'unverified',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      const conversation: Conversation = {
        id: conversationId,
        projectId,
        title: '新的研究任务',
        messageIds: [],
        manualOrder: 0,
        origin: 'live',
        verificationStatus: 'unverified',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      state.projects.unshift(project)
      state.conversations.unshift(conversation)
      state.outlines[projectId] = []
      state.settings.activeProjectId = projectId
      state.settings.sidebarExpandedProjectIds = [
        projectId,
        ...(state.settings.sidebarExpandedProjectIds ?? []).filter((id) => id !== projectId),
      ]
      state.settings.demoMode = false
      synchronizeActiveModelSelection(state)
      return project
    })
  }

  async setActiveProject(projectId: string): Promise<WorkspaceState> {
    return this.mutate((state) => {
      const project = state.projects.find((item) => item.id === projectId)
      if (!project) {
        throw new Error('项目不存在或已经被移除。')
      }
      state.settings.activeProjectId = projectId
      state.settings.demoMode = project.origin === 'demo'
      synchronizeActiveModelSelection(state)
      return state
    })
  }

  async setProjectPinned(projectId: string, pinned: boolean): Promise<WorkspaceState> {
    return this.mutate((state) => {
      const project = state.projects.find((item) => item.id === projectId)
      if (!project) throw new Error('项目不存在或已经被移除。')
      project.pinned = pinned
      return state
    })
  }

  async createConversation(projectId: string): Promise<WorkspaceState> {
    return this.mutate((state) => {
      const project = state.projects.find((item) => item.id === projectId)
      if (!project) throw new Error('项目不存在或已经被移除。')
      const timestamp = now()
      const projectConversations = state.conversations.filter((item) => item.projectId === projectId)
      const conversation: Conversation = {
        id: randomUUID(),
        projectId,
        title: projectConversations.length === 0 ? '新对话' : `新对话 ${projectConversations.length + 1}`,
        messageIds: [],
        manualOrder: Math.min(0, ...projectConversations.map((item) => item.manualOrder ?? 0)) - 1,
        origin: project.origin,
        verificationStatus: project.verificationStatus,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      state.conversations.unshift(conversation)
      project.activeConversationId = conversation.id
      project.updatedAt = timestamp
      state.settings.activeProjectId = project.id
      state.settings.demoMode = project.origin === 'demo'
      state.settings.sidebarExpandedProjectIds = [
        project.id,
        ...(state.settings.sidebarExpandedProjectIds ?? []).filter((id) => id !== project.id),
      ]
      synchronizeActiveModelSelection(state)
      return state
    })
  }

  async setActiveConversation(projectId: string, conversationId: string): Promise<WorkspaceState> {
    return this.mutate((state) => {
      const project = state.projects.find((item) => item.id === projectId)
      const conversation = state.conversations.find(
        (item) => item.id === conversationId && item.projectId === projectId,
      )
      if (!project || !conversation) throw new Error('对话不存在或不属于该项目。')
      project.activeConversationId = conversation.id
      conversation.unread = false
      state.settings.activeProjectId = project.id
      state.settings.demoMode = project.origin === 'demo'
      synchronizeActiveModelSelection(state)
      return state
    })
  }

  async updateConversation(input: ConversationUpdateInput): Promise<WorkspaceState> {
    return this.mutate((state) => {
      const conversation = state.conversations.find((item) => item.id === input.conversationId)
      if (!conversation) throw new Error('对话不存在或已经被移除。')
      const project = state.projects.find((item) => item.id === conversation.projectId)
      if (!project) throw new Error('对话所属研究不存在。')

      if (input.archived === true) {
        const conversationRunIds = new Set(
          state.messages
            .filter((message) => message.conversationId === conversation.id)
            .map((message) => message.runId)
            .filter((runId): runId is string => Boolean(runId)),
        )
        if (state.runs.some((run) => conversationRunIds.has(run.id) && ['queued', 'running'].includes(run.status))) {
          throw new Error('该对话仍在生成内容，请先停止后再归档。')
        }
      }

      if (input.title !== undefined) conversation.title = input.title.trim()
      if (input.pinned !== undefined) conversation.pinned = input.pinned
      if (input.unread !== undefined) conversation.unread = input.unread
      if (input.goal !== undefined) conversation.goal = input.goal.trim() || undefined
      if (input.planMode !== undefined) conversation.planMode = input.planMode
      if (input.accessMode !== undefined) conversation.accessMode = input.accessMode
      if (input.archived !== undefined) {
        conversation.archived = input.archived
        if (input.archived && project.activeConversationId === conversation.id) {
          const fallback = state.conversations.find(
            (item) => item.projectId === project.id && item.id !== conversation.id && !item.archived,
          )
          if (fallback) {
            project.activeConversationId = fallback.id
          } else {
            const timestamp = now()
            const replacement: Conversation = {
              id: randomUUID(),
              projectId: project.id,
              title: '新对话',
              messageIds: [],
              pinned: false,
              archived: false,
              unread: false,
              manualOrder: Math.min(0, ...state.conversations
                .filter((item) => item.projectId === project.id)
                .map((item) => item.manualOrder ?? 0)) - 1,
              origin: project.origin,
              verificationStatus: project.verificationStatus,
              createdAt: timestamp,
              updatedAt: timestamp,
            }
            state.conversations.unshift(replacement)
            project.activeConversationId = replacement.id
          }
        }
      }
      return state
    })
  }

  async moveConversation(conversationId: string, targetProjectId: string): Promise<WorkspaceState> {
    return this.mutate((state) => {
      const conversation = state.conversations.find((item) => item.id === conversationId)
      const targetProject = state.projects.find((item) => item.id === targetProjectId)
      if (!conversation || !targetProject) throw new Error('对话或目标研究不存在。')
      const sourceProject = state.projects.find((item) => item.id === conversation.projectId)
      if (!sourceProject) throw new Error('对话所属研究不存在。')
      if (sourceProject.id === targetProject.id) return state
      if (sourceProject.origin !== targetProject.origin) {
        throw new Error('演示研究与真实研究之间不能移动对话。')
      }
      const conversationRunIds = new Set(
        state.messages
          .filter((message) => message.conversationId === conversation.id)
          .map((message) => message.runId)
          .filter((runId): runId is string => Boolean(runId)),
      )
      if (state.runs.some((run) => conversationRunIds.has(run.id) && ['queued', 'running'].includes(run.status))) {
        throw new Error('该对话仍在生成内容，请先停止后再移动。')
      }

      const timestamp = now()
      if (sourceProject.activeConversationId === conversation.id) {
        const fallback = state.conversations.find(
          (item) => item.projectId === sourceProject.id && item.id !== conversation.id && !item.archived,
        )
        if (fallback) {
          sourceProject.activeConversationId = fallback.id
        } else {
          const replacement: Conversation = {
            id: randomUUID(),
            projectId: sourceProject.id,
            title: '新对话',
            messageIds: [],
            pinned: false,
            archived: false,
            unread: false,
            manualOrder: 0,
            origin: sourceProject.origin,
            verificationStatus: sourceProject.verificationStatus,
            createdAt: timestamp,
            updatedAt: timestamp,
          }
          state.conversations.unshift(replacement)
          sourceProject.activeConversationId = replacement.id
        }
      }

      const targetConversations = state.conversations.filter((item) => item.projectId === targetProject.id)
      conversation.projectId = targetProject.id
      conversation.archived = false
      conversation.manualOrder = Math.min(0, ...targetConversations.map((item) => item.manualOrder ?? 0)) - 1
      const movedRunIds = new Set(
        state.messages
          .filter((message) => message.conversationId === conversation.id)
          .map((message) => message.runId)
          .filter((runId): runId is string => Boolean(runId)),
      )
      state.messages.forEach((message) => {
        if (message.conversationId === conversation.id) message.projectId = targetProject.id
      })
      state.attachments.forEach((attachment) => {
        if (attachment.conversationId === conversation.id) attachment.projectId = targetProject.id
      })
      state.runs.forEach((run) => {
        if (movedRunIds.has(run.id)) run.projectId = targetProject.id
      })
      sourceProject.updatedAt = timestamp
      targetProject.updatedAt = timestamp
      targetProject.activeConversationId = conversation.id
      state.settings.activeProjectId = targetProject.id
      state.settings.demoMode = targetProject.origin === 'demo'
      state.settings.sidebarExpandedProjectIds = [
        targetProject.id,
        ...(state.settings.sidebarExpandedProjectIds ?? []).filter((id) => id !== targetProject.id),
      ]
      synchronizeActiveModelSelection(state)
      return state
    })
  }

  async setSidebarPreferences(input: SidebarPreferencesInput): Promise<WorkspaceState> {
    return this.mutate((state) => {
      if (input.viewMode) state.settings.sidebarViewMode = input.viewMode
      if (input.chatSort) state.settings.sidebarChatSort = input.chatSort
      if (input.expandedProjectIds) {
        const known = new Set(state.projects.map((project) => project.id))
        state.settings.sidebarExpandedProjectIds = [...new Set(input.expandedProjectIds)].filter((id) => known.has(id))
      }
      if (input.showArchived !== undefined) state.settings.sidebarShowArchived = input.showArchived
      if (input.sidebarWidth !== undefined) state.settings.sidebarWidth = input.sidebarWidth
      if (input.rightPanelWidth !== undefined) state.settings.rightPanelWidth = input.rightPanelWidth
      if (input.projectOrder) {
        const order = new Map(input.projectOrder.map((id, index) => [id, index]))
        state.projects.forEach((project, index) => {
          project.manualOrder = order.get(project.id) ?? input.projectOrder!.length + index
        })
      }
      if (input.conversationOrder) {
        const order = new Map(input.conversationOrder.map((id, index) => [id, index]))
        state.conversations.forEach((conversation, index) => {
          conversation.manualOrder = order.get(conversation.id) ?? input.conversationOrder!.length + index
        })
      }
      return state
    })
  }

  async setAppearance(input: AppearanceSettingsInput): Promise<WorkspaceState> {
    return this.mutate((state) => {
      state.settings.appearance = mergeAppearanceSettings(state.settings.appearance, input)
      return state
    })
  }

  async deleteProject(projectId: string): Promise<WorkspaceState> {
    return this.mutate((state) => {
      const project = state.projects.find((item) => item.id === projectId)
      if (!project) throw new Error('项目不存在或已经被移除。')
      if (
        state.runs.some(
          (run) => run.projectId === projectId && ['queued', 'running'].includes(run.status),
        )
      ) {
        throw new Error('当前研究仍有任务运行，请停止生成后再删除。')
      }

      const conversationIds = new Set(
        state.conversations
          .filter((conversation) => conversation.projectId === projectId)
          .map((conversation) => conversation.id),
      )
      const sectionIds = new Set(
        state.sections
          .filter((section) => section.projectId === projectId)
          .map((section) => section.id),
      )

      state.projects = state.projects.filter((item) => item.id !== projectId)
      state.conversations = state.conversations.filter((item) => item.projectId !== projectId)
      state.attachments = state.attachments.filter(
        (item) => item.projectId !== projectId && !conversationIds.has(item.conversationId),
      )
      state.messages = state.messages.filter(
        (item) => item.projectId !== projectId && !conversationIds.has(item.conversationId),
      )
      state.literature = state.literature.filter((item) => item.projectId !== projectId)
      state.sections = state.sections.filter((item) => item.projectId !== projectId)
      state.sectionVersions = state.sectionVersions.filter((item) => item.projectId !== projectId)
      state.citations = state.citations.filter(
        (item) => item.projectId !== projectId && !sectionIds.has(item.sectionId),
      )
      state.runs = state.runs.filter((item) => item.projectId !== projectId)
      state.artifacts = state.artifacts.filter((item) => item.projectId !== projectId)
      delete state.outlines[projectId]
      state.settings.sidebarExpandedProjectIds = (
        state.settings.sidebarExpandedProjectIds ?? []
      ).filter((id) => id !== projectId)

      if (state.settings.activeProjectId === projectId) {
        const fallback = state.projects.find((item) => item.origin !== 'demo') ?? state.projects[0]
        state.settings.activeProjectId = fallback?.id
        state.settings.demoMode = fallback?.origin === 'demo'
      }
      synchronizeActiveModelSelection(state)
      return state
    })
  }

  async setProjectResearchFolder(projectId: string, folderPath: string): Promise<WorkspaceState> {
    return this.mutate((state) => {
      const project = state.projects.find((item) => item.id === projectId)
      if (!project) throw new Error('项目不存在或已经被移除。')
      project.researchFolderPath = folderPath
      project.updatedAt = now()
      return state
    })
  }

  async addConversationAttachments(
    conversationId: string,
    attachments: ConversationAttachment[],
  ): Promise<WorkspaceState> {
    return this.mutate((state) => {
      const conversation = state.conversations.find((item) => item.id === conversationId)
      if (!conversation) throw new Error('对话不存在或已经被移除。')
      const project = state.projects.find((item) => item.id === conversation.projectId)
      if (!project) throw new Error('对话所属研究不存在。')
      const existing = state.attachments.filter((item) => item.conversationId === conversationId)
      if (existing.length + attachments.length > 20) throw new Error('每个对话最多保留 20 个附件。')
      const existingPaths = new Set(existing.map((item) => item.path))
      state.attachments.push(...attachments.filter((item) => !existingPaths.has(item.path)))
      conversation.updatedAt = now()
      project.updatedAt = conversation.updatedAt
      return state
    })
  }

  async removeConversationAttachment(attachmentId: string): Promise<WorkspaceState> {
    return this.mutate((state) => {
      const attachment = state.attachments.find((item) => item.id === attachmentId)
      if (!attachment) throw new Error('附件不存在或已经移除。')
      state.attachments = state.attachments.filter((item) => item.id !== attachmentId)
      return state
    })
  }

  async setResearchRootPath(folderPath: string): Promise<WorkspaceState> {
    return this.mutate((state) => {
      state.settings.researchRootPath = folderPath
      return state
    })
  }

  async setActiveModel(providerId: string, model: string): Promise<WorkspaceState> {
    return this.mutate((state) => {
      const provider = state.providers.find(
        (item) => item.id === providerId && isSelectableProvider(item),
      )
      if (!provider) throw new Error('所选模型提供商尚未连接或已被停用。')
      if (!provider.models.includes(model)) throw new Error('所选模型不属于该提供商。')
      state.settings.activeProviderId = provider.id
      state.settings.activeModel = model
      return state
    })
  }

  async saveProvider(profile: ProviderProfile): Promise<ProviderProfile> {
    return this.mutate((state) => {
      const index = state.providers.findIndex((item) => item.id === profile.id)
      if (index >= 0) state.providers[index] = profile
      else state.providers.push(profile)
      synchronizeActiveModelSelection(state)
      return profile
    })
  }

  async deleteProvider(providerId: string): Promise<void> {
    await this.mutate((state) => {
      state.providers = state.providers.filter((item) => item.id !== providerId)
      synchronizeActiveModelSelection(state)
    })
  }

  async updateProviderHealth(
    providerId: string,
    health: ProviderProfile['lastHealth'],
    error?: string,
    models?: string[],
  ): Promise<ProviderProfile> {
    return this.mutate((state) => {
      const provider = state.providers.find((item) => item.id === providerId)
      if (!provider) throw new Error('模型提供商不存在。')
      provider.lastHealth = health
      provider.lastError = error
      if (models?.length) provider.models = [...new Set(models)]
      provider.updatedAt = now()
      synchronizeActiveModelSelection(state)
      return provider
    })
  }

  getProvider(providerId: string): ProviderProfile | undefined {
    const provider = this.state.providers.find((item) => item.id === providerId)
    return provider ? structuredClone(provider) : undefined
  }

  /** 用户明确调用真实模型后，将内置演示研究升级为可继续使用的正式研究。 */
  async promoteProjectForProvider(projectId: string, providerId: string): Promise<void> {
    const project = this.state.projects.find((item) => item.id === projectId)
    const provider = this.state.providers.find((item) => item.id === providerId)
    if (!project || !provider) throw new Error('项目或模型提供商不存在。')
    if (project.origin !== 'demo' || provider.origin === 'demo') return
    await this.mutate((state) => {
      promoteProjectToLive(state, projectId)
    })
  }

  async addLiterature(records: LiteratureRecord[], projectId?: string): Promise<LiteratureRecord[]> {
    return this.mutate((state) => {
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
    })
  }

  /**
   * 只允许把助手消息中由真实 MCP 结果保存的候选加入对应项目文献栏。
   * 渲染层不能提交标题、DOI 等任意元数据，避免伪造或跨项目写入。
   */
  async addLiteratureFromMessage(
    messageId: string,
    candidateIds: string[],
  ): Promise<LiteratureRecord[]> {
    return this.mutate((state) => {
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
    })
  }

  async toggleLiterature(
    projectId: string,
    literatureId: string,
    included: boolean,
  ): Promise<LiteratureRecord> {
    return this.mutate((state) => {
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
    })
  }

  async setLiteratureProject(
    literatureId: string,
    sourceProjectId?: string | null,
    targetProjectId?: string,
  ): Promise<LiteratureRecord> {
    return this.mutate((state) => {
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
    })
  }

  async deleteLiterature(
    literatureId: string,
    sourceProjectId?: string | null,
  ): Promise<void> {
    return this.mutate((state) => {
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
    })
  }

  async saveOutline(projectId: string, outline: OutlineNode[]): Promise<OutlineNode[]> {
    return this.mutate((state) => {
      const project = state.projects.find((item) => item.id === projectId)
      if (!project) throw new Error('项目不存在或已经被移除。')
      state.outlines[projectId] = outline
      project.status = 'outline-review'
      project.updatedAt = now()
      return outline
    })
  }

  async createSectionsFromOutline(
    projectId: string,
    outline: OutlineNode[],
  ): Promise<ManuscriptSection[]> {
    return this.mutate((state) => {
      if (!state.projects.some((project) => project.id === projectId)) {
        throw new Error('项目不存在或已经被移除。')
      }
      const timestamp = now()
      const flattened: OutlineNode[] = []
      const visit = (nodes: OutlineNode[]) => {
        for (const node of nodes) {
          flattened.push(node)
          visit(node.children)
        }
      }
      visit(outline)

      const existing = state.sections.filter((section) => section.projectId === projectId)
      const created = flattened.map((node) => {
        const current = existing.find((section) => section.outlineNodeId === node.id)
        if (current) return current
        const section: ManuscriptSection = {
          ...createLiveEntityBase(),
          projectId,
          outlineNodeId: node.id,
          title: node.title,
          level: node.level,
          content: '',
          status: 'pending',
          wordCount: 0,
          version: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        state.sections.push(section)
        return section
      })
      synchronizeDerivedSections(state, projectId, timestamp)
      return created
    })
  }

  async saveSection(sectionId: string, content: string): Promise<ManuscriptSection> {
    return this.mutate((state) => {
      const section = state.sections.find((item) => item.id === sectionId)
      if (!section) throw new Error('论文章节不存在。')
      if (section.status === 'generating') throw new Error('章节正在生成，请等待完成后再保存。')
      const timestamp = now()
      const previousContent = preserveProjectSectionVersions(state, section.projectId)
      const saved = saveSectionContentInState(state, sectionId, content, timestamp)
      recordSynchronizedSectionVersions(state, section.projectId, sectionId, previousContent, timestamp)
      preserveCurrentSectionVersion(state, saved, 'saved', timestamp)
      const project = state.projects.find((item) => item.id === section.projectId)
      if (project) {
        project.status = 'writing'
        project.activeSectionId = section.id
        project.updatedAt = timestamp
      }
      return saved
    })
  }

  async beginSectionGeneration(
    sectionId: string,
    metadata: Pick<ManuscriptSection, 'generationProviderId' | 'generationModel' | 'thinkingRequested'>,
  ): Promise<{ section: ManuscriptSection; baseVersion: number }> {
    return this.mutate((state) => {
      const section = state.sections.find((item) => item.id === sectionId)
      if (!section) throw new Error('论文章节不存在。')
      if (section.status === 'generating') throw new Error('该章节已经在生成中。')
      const timestamp = now()
      preserveProjectSectionVersions(state, section.projectId)
      const baseVersion = section.version
      Object.assign(section, metadata, {
        status: 'generating' as const,
        generationError: undefined,
        updatedAt: timestamp,
      })
      return { section, baseVersion }
    })
  }

  async commitSectionGeneration(
    sectionId: string,
    expectedVersion: number,
    content: string,
    metadata: Pick<ManuscriptSection, 'reasoningContent' | 'generationProviderId' | 'generationModel' | 'thinkingRequested'> & {
      source: 'generated' | 'partial'
      generationError?: string
    },
  ): Promise<ManuscriptSection> {
    return this.mutate((state) => {
      const section = state.sections.find((item) => item.id === sectionId)
      if (!section) throw new Error('论文章节不存在。')
      if (section.version !== expectedVersion || section.status !== 'generating') {
        throw new Error('章节在生成期间已经发生变化，新结果未覆盖当前稿。')
      }
      const timestamp = now()
      const previousContent = preserveProjectSectionVersions(state, section.projectId)
      const saved = saveSectionContentInState(state, sectionId, content, timestamp)
      Object.assign(saved, metadata, {
        status: metadata.source === 'partial' ? 'error' as const : 'draft' as const,
        updatedAt: timestamp,
      })
      const generatedWithLiveProvider = Boolean(
        metadata.generationProviderId
        && state.providers.some((provider) => (
          provider.id === metadata.generationProviderId && provider.origin !== 'demo'
        )),
      )
      if (generatedWithLiveProvider) {
        for (const projectSection of state.sections.filter((item) => item.projectId === section.projectId)) {
          if (
            projectSection.id !== saved.id
            && previousContent.get(projectSection.id) === projectSection.content
          ) continue
          projectSection.origin = 'live'
          projectSection.verificationStatus = 'unverified'
        }
      }
      recordSynchronizedSectionVersions(state, section.projectId, sectionId, previousContent, timestamp)
      createSectionVersion(
        state,
        saved,
        metadata.source,
        timestamp,
        metadata.source === 'partial' ? 'error' : 'draft',
      )
      const project = state.projects.find((item) => item.id === section.projectId)
      if (project) {
        project.status = 'writing'
        project.activeSectionId = section.id
        project.updatedAt = timestamp
      }
      return saved
    })
  }

  async failSectionGeneration(
    sectionId: string,
    expectedVersion: number,
    patch: Pick<ManuscriptSection, 'reasoningContent' | 'generationProviderId' | 'generationModel' | 'thinkingRequested' | 'generationError'>,
  ): Promise<ManuscriptSection> {
    return this.mutate((state) => {
      const section = state.sections.find((item) => item.id === sectionId)
      if (!section) throw new Error('论文章节不存在。')
      if (section.version !== expectedVersion || section.status !== 'generating') return section
      Object.assign(section, patch, { status: 'error' as const, updatedAt: now() })
      return section
    })
  }

  async selectSectionVersion(sectionId: string, versionId: string): Promise<ManuscriptSection> {
    return this.mutate((state) => {
      const section = state.sections.find((item) => item.id === sectionId)
      if (!section) throw new Error('论文章节不存在。')
      if (section.status === 'generating') throw new Error('章节正在生成，暂时不能切换历史版本。')
      const version = state.sectionVersions.find(
        (item) => item.id === versionId && item.sectionId === sectionId && item.projectId === section.projectId,
      )
      if (!version) throw new Error('章节历史版本不存在。')
      const timestamp = now()
      const previousContent = preserveProjectSectionVersions(state, section.projectId)
      const selected = saveSectionContentInState(state, sectionId, version.content, timestamp)
      Object.assign(selected, {
        status: version.status,
        reasoningContent: version.reasoningContent,
        generationProviderId: version.generationProviderId,
        generationModel: version.generationModel,
        thinkingRequested: version.thinkingRequested,
        generationError: version.source === 'partial' ? '这是一次未完整生成的历史版本。' : undefined,
        activeGenerationVersionId: version.id,
        updatedAt: timestamp,
      })
      recordSynchronizedSectionVersions(state, section.projectId, sectionId, previousContent, timestamp)
      selected.activeGenerationVersionId = version.id
      const project = state.projects.find((item) => item.id === section.projectId)
      if (project) {
        project.activeSectionId = section.id
        project.updatedAt = timestamp
      }
      return selected
    })
  }

  async setActiveSection(sectionId: string): Promise<WorkspaceState> {
    return this.mutate((state) => {
      const section = state.sections.find((item) => item.id === sectionId)
      if (!section) throw new Error('论文章节不存在。')
      const project = state.projects.find((item) => item.id === section.projectId)
      if (!project) throw new Error('章节对应的项目不存在或已经被移除。')
      project.activeSectionId = section.id
      project.updatedAt = now()
      state.settings.activeProjectId = project.id
      state.settings.demoMode = project.origin === 'demo'
      synchronizeActiveModelSelection(state)
      return state
    })
  }

  async updateSection(
    sectionId: string,
    patch: Partial<ManuscriptSection>,
  ): Promise<ManuscriptSection> {
    return this.mutate((state) => {
      const section = state.sections.find((item) => item.id === sectionId)
      if (!section) throw new Error('论文章节不存在。')
      Object.assign(section, patch, { updatedAt: now() })
      return section
    })
  }

  async appendMessage(message: ChatMessage): Promise<ChatMessage> {
    return this.mutate((state) => {
      const conversation = state.conversations.find(
        (item) => item.id === message.conversationId && item.projectId === message.projectId,
      )
      if (!conversation || !state.projects.some((project) => project.id === message.projectId)) {
        throw new Error('对话不存在或不属于当前项目。')
      }
      state.messages.push(message)
      conversation.messageIds.push(message.id)
      const timestamp = now()
      if (
        message.role === 'user' &&
        conversation.messageIds.length === 1 &&
        /^(新的研究任务|新对话(?:\s+\d+)?)$/.test(conversation.title)
      ) {
        conversation.title = message.content.trim().replace(/\s+/g, ' ').slice(0, 42) || conversation.title
      }
      conversation.updatedAt = timestamp
      const project = state.projects.find((item) => item.id === message.projectId)
      if (project) project.updatedAt = timestamp
      return message
    })
  }

  async updateMessage(messageId: string, patch: Partial<ChatMessage>): Promise<ChatMessage> {
    return this.mutate((state) => {
      const message = state.messages.find((item) => item.id === messageId)
      if (!message) throw new Error('消息不存在。')
      Object.assign(message, patch, { updatedAt: now() })
      return message
    })
  }

  async saveRun(run: AgentRun): Promise<AgentRun> {
    return this.mutate((state) => {
      if (!state.projects.some((project) => project.id === run.projectId)) {
        throw new Error('运行任务对应的项目不存在。')
      }
      const index = state.runs.findIndex((item) => item.id === run.id)
      if (index >= 0) state.runs[index] = run
      else state.runs.push(run)
      return run
    })
  }

  async updateRun(runId: string, patch: Partial<AgentRun>): Promise<AgentRun> {
    return this.mutate((state) => {
      const run = state.runs.find((item) => item.id === runId)
      if (!run) throw new Error('运行任务不存在。')
      Object.assign(run, patch, { id: run.id, projectId: run.projectId, updatedAt: now() })
      return run
    })
  }

  async replaceSectionCitations(
    sectionId: string,
    citations: CitationEvidence[],
  ): Promise<CitationEvidence[]> {
    return this.mutate((state) => {
      const section = state.sections.find((item) => item.id === sectionId)
      if (!section) throw new Error('论文章节不存在。')
      if (citations.some((item) => item.sectionId !== sectionId || item.projectId !== section.projectId)) {
        throw new Error('引用证据不属于当前章节。')
      }
      state.citations = [
        ...state.citations.filter((item) => item.sectionId !== sectionId),
        ...citations,
      ]
      return citations
    })
  }

  async saveMcpServer(server: McpServerConfig): Promise<McpServerConfig> {
    return this.mutate((state) => {
      const index = state.mcpServers.findIndex((item) => item.id === server.id)
      if (index >= 0) state.mcpServers[index] = server
      else state.mcpServers.push(server)
      return server
    })
  }

  async deleteMcpServer(serverId: string): Promise<void> {
    await this.mutate((state) => {
      state.mcpServers = state.mcpServers.filter((item) => item.id !== serverId)
    })
  }

  getMcpServer(serverId: string): McpServerConfig | undefined {
    const server = this.state.mcpServers.find((item) => item.id === serverId)
    return server ? structuredClone(server) : undefined
  }

  async saveSkill(input: SkillInput): Promise<SkillDefinition> {
    return this.mutate((state) => {
      const timestamp = now()
      const existing = input.id
        ? state.skills.find((item) => item.id === input.id)
        : undefined
      if (input.id && !existing) throw new Error('Skill 不存在或已经被移除。')

      const skill: SkillDefinition = {
        id: existing?.id ?? randomUUID(),
        name: input.name.trim(),
        description: input.description.trim(),
        instructions: input.instructions.trim(),
        enabled: input.enabled,
        origin: 'live',
        verificationStatus: 'unverified',
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      }
      const index = state.skills.findIndex((item) => item.id === skill.id)
      if (index >= 0) state.skills[index] = skill
      else state.skills.push(skill)
      return skill
    })
  }

  async deleteSkill(skillId: string): Promise<void> {
    await this.mutate((state) => {
      if (!state.skills.some((item) => item.id === skillId)) {
        throw new Error('Skill 不存在或已经被移除。')
      }
      state.skills = state.skills.filter((item) => item.id !== skillId)
    })
  }

  async saveArtifact(artifact: Artifact): Promise<Artifact> {
    return this.mutate((state) => {
      if (!state.projects.some((project) => project.id === artifact.projectId)) {
        throw new Error('导出产物对应的项目不存在。')
      }
      state.artifacts.unshift(artifact)
      return artifact
    })
  }
}

export const createLiveEntityBase = () => ({
  id: randomUUID(),
  origin: 'live' as const,
  verificationStatus: 'unverified' as const,
  createdAt: now(),
  updatedAt: now(),
})
