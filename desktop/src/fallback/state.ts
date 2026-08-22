import type {
  AgentRun,
  ChatMessage,
  Conversation,
  LiteratureRecord,
  ManuscriptSection,
  ManuscriptSectionVersion,
  OutlineNode,
  Project,
  ProviderProfile,
  WorkspaceState,
} from '../../shared/contracts'
import { normalizeAppearanceSettings } from '../../shared/appearance'
import { createDefaultArxivMcpServer, ensureDefaultArxivMcpServer } from '../../shared/defaultMcp'
import { saveSectionContentInState, synchronizeDerivedSections } from '../../shared/sectionContent'
import { demoLiterature, demoOutline } from './fixtures'

const STORAGE_KEY = 'aiwritepaper-browser-demo-v1'

export const now = () => new Date().toISOString()
export const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
export const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export function flattenOutline(nodes: OutlineNode[]): OutlineNode[] {
  return nodes.flatMap((node) => [node, ...flattenOutline(node.children)])
}

export function findOutlineNode(nodes: OutlineNode[], nodeId: string): OutlineNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node
    const child = findOutlineNode(node.children, nodeId)
    if (child) return child
  }
  return undefined
}

export function cloneOutlineWithFreshIds(nodes: OutlineNode[]): OutlineNode[] {
  return nodes.map((node) => ({
    ...node,
    id: makeId('outline'),
    citationIds: [...node.citationIds],
    children: cloneOutlineWithFreshIds(node.children),
  }))
}

export function createSectionsFromOutline(
  outline: OutlineNode[],
  projectId: string,
  useStableDemoIds = false,
): ManuscriptSection[] {
  return flattenOutline(outline).map((item, index) => {
    const hasIntro = useStableDemoIds && index === 0
    const createdAt = now()
    return {
      id: useStableDemoIds ? `section-${index + 1}` : makeId('section'),
      projectId,
      outlineNodeId: item.id,
      title: item.title,
      level: item.level,
      content: hasIntro
        ? `## ${item.title}\n\n生成式人工智能正在从单一的文本生成工具转变为写作过程中的认知协作者。对高校写作而言，真正值得讨论的并非“是否使用”，而是如何把即时反馈、材料组织与反思提示嵌入教学流程，同时保留学生对论证与证据的责任。\n\n本研究拟从学习支架、反馈效率和学术诚信三个维度分析其作用机制，并以可追溯引用作为基本质量边界。当前内容为浏览器演示稿，所列文献尚未连接真实门户，不可直接用于正式引用。`
        : '',
      status: hasIntro ? 'draft' : 'pending',
      wordCount: hasIntro ? 176 : 0,
      version: 1,
      origin: 'demo',
      verificationStatus: 'demo',
      createdAt,
      updatedAt: createdAt,
    }
  })
}

const demoSections: ManuscriptSection[] = createSectionsFromOutline(demoOutline, 'project-demo', true)

export function makeSectionVersion(
  state: WorkspaceState,
  section: ManuscriptSection,
  source: ManuscriptSectionVersion['source'],
): ManuscriptSectionVersion {
  const timestamp = now()
  const latestNumber = state.sectionVersions
    .filter((item) => item.sectionId === section.id)
    .reduce((maximum, item) => Math.max(maximum, item.number), 0)
  const version: ManuscriptSectionVersion = {
    id: makeId('section-version'),
    projectId: section.projectId,
    sectionId: section.id,
    number: latestNumber + 1,
    source,
    content: section.content,
    wordCount: section.content.replace(/\s+/g, '').length,
    status: source === 'partial' ? 'error' : section.status === 'verified' ? 'verified' : 'draft',
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

function normalizeFallbackSectionVersions(state: WorkspaceState): void {
  state.sectionVersions = Array.isArray(state.sectionVersions) ? state.sectionVersions : []
  for (const section of state.sections) {
    if (section.status === 'generating') {
      section.status = section.content.trim() ? 'draft' : 'pending'
      section.generationError = '上次演示生成已中断，原稿已经保留。'
    }
    const versions = state.sectionVersions.filter((item) => item.sectionId === section.id)
    if (versions.length === 0 && section.content.trim()) {
      const migrated = makeSectionVersion(state, section, 'migrated')
      migrated.createdAt = section.updatedAt
      migrated.updatedAt = section.updatedAt
    } else if (!versions.some((item) => item.id === section.activeGenerationVersionId)) {
      section.activeGenerationVersionId = [...versions].reverse().find((item) => item.content === section.content)?.id
    }
  }
}

export function preserveFallbackProjectVersions(state: WorkspaceState, projectId: string): Map<string, string> {
  const previous = new Map<string, string>()
  for (const section of state.sections) {
    if (section.projectId !== projectId) continue
    previous.set(section.id, section.content)
    const active = state.sectionVersions.find((item) => item.id === section.activeGenerationVersionId)
    if (section.content.trim() && active?.content !== section.content) makeSectionVersion(state, section, 'saved')
  }
  return previous
}

export function recordFallbackDerivedVersions(
  state: WorkspaceState,
  projectId: string,
  targetSectionId: string,
  previous: Map<string, string>,
): void {
  for (const section of state.sections) {
    if (
      section.projectId !== projectId
      || section.id === targetSectionId
      || previous.get(section.id) === section.content
    ) continue
    if (section.content.trim()) makeSectionVersion(state, section, 'derived')
    else section.activeGenerationVersionId = undefined
  }
}

const initialWorkspace = (): WorkspaceState => {
  const project: Project = {
    id: 'project-demo',
    title: '生成式 AI 赋能高校写作教学研究',
    status: 'outline-review',
    brief: {
      title: '生成式 AI 赋能高校写作教学研究',
      paperType: '课程论文',
      discipline: '教育学',
      language: 'zh-CN',
      targetWords: 8000,
      requirements: '分析作用机制、教学风险与治理路径，引用必须可追溯。',
      keywords: ['生成式人工智能', '高校写作', '人机协同', '学术诚信'],
    },
    activeConversationId: 'conversation-demo',
    activeSectionId: 'section-1',
    pinned: false,
    manualOrder: 0,
    origin: 'demo',
    verificationStatus: 'demo',
    createdAt: now(),
    updatedAt: now(),
  }

  const conversation: Conversation = {
    id: 'conversation-demo',
    projectId: project.id,
    title: '生成式 AI 赋能高校写作教学研究',
    messageIds: ['message-user-01', 'message-assistant-01'],
    manualOrder: 0,
    origin: 'demo',
    verificationStatus: 'demo',
    createdAt: now(),
    updatedAt: now(),
  }

  const messages: ChatMessage[] = [
    {
      id: 'message-user-01',
      projectId: project.id,
      conversationId: conversation.id,
      role: 'user',
      content: '请围绕生成式 AI 如何赋能高校写作教学，先检索文献并形成可继续修改的论文框架。',
      status: 'completed',
      contextScope: 'project',
      origin: 'demo',
      verificationStatus: 'demo',
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: 'message-assistant-01',
      projectId: project.id,
      conversationId: conversation.id,
      role: 'assistant',
      content:
        '我已把任务拆分为“检索—筛选—大纲—分章写作—引用核验”五个阶段。\n\n### 当前进展\n\n已形成 5 个一级章节，重点覆盖学习支架、反馈效率、写作主体性和学术诚信治理。右侧文献均为浏览器演示数据，尚未连接真实门户，因此不会被标记为已核验。\n\n下一步可以确认大纲，或告诉我需要调整的章节。',
      status: 'completed',
      providerId: 'provider-demo',
      model: 'demo-research-agent',
      contextScope: 'project',
      origin: 'demo',
      verificationStatus: 'demo',
      createdAt: now(),
      updatedAt: now(),
    },
  ]

  const provider: ProviderProfile = {
    id: 'provider-demo',
    name: '浏览器演示',
    protocol: 'openai-compatible',
    baseUrl: 'https://example.invalid/v1',
    models: ['demo-research-agent', 'demo-writing-agent'],
    defaultModel: 'demo-research-agent',
    enabled: true,
    hasCredential: true,
    lastHealth: 'connected',
    origin: 'demo',
    verificationStatus: 'demo',
    createdAt: now(),
    updatedAt: now(),
  }

  const run: AgentRun = {
    id: 'run-demo',
    projectId: project.id,
    kind: 'outline',
    status: 'completed',
    steps: [
      { id: 'step-1', label: '解析研究要求', detail: '识别题目、篇幅、学科与引用约束', status: 'completed' },
      { id: 'step-2', label: '检索候选文献', detail: '浏览器演示数据，未访问真实文献门户', status: 'warning' },
      { id: 'step-3', label: '形成论文大纲', detail: '已生成 5 个一级章节', status: 'completed' },
      { id: 'step-4', label: '等待大纲确认', detail: '确认后可按章节继续生成', status: 'running' },
    ],
    origin: 'demo',
    verificationStatus: 'demo',
    createdAt: now(),
    updatedAt: now(),
  }

  return {
    schemaVersion: 1,
    projects: [project],
    conversations: [conversation],
    attachments: [],
    messages,
    providers: [provider],
    literature: demoLiterature,
    outlines: { [project.id]: demoOutline },
    outlineArchitectures: {},
    outlineQualityReports: {},
    sections: demoSections,
    sectionVersions: [],
    citations: [],
    runs: [run],
    mcpServers: [
      createDefaultArxivMcpServer(now()),
      {
        id: 'mcp-demo',
        name: '公开文献门户（演示）',
        transport: { type: 'streamable-http', url: 'https://example.invalid/mcp' },
        enabled: false,
        status: 'disconnected',
        tools: [
          { name: 'search_literature', description: '按关键词检索公开文献' },
          { name: 'resolve_doi', description: '核验 DOI 与书目信息' },
        ],
        resources: [],
        origin: 'demo',
        verificationStatus: 'demo',
        createdAt: now(),
        updatedAt: now(),
      },
    ],
    skills: [],
    artifacts: [],
    settings: {
      activeProjectId: project.id,
      activeProviderId: provider.id,
      activeModel: provider.defaultModel,
      sidebarViewMode: 'projects',
      sidebarChatSort: 'priority',
      sidebarExpandedProjectIds: [project.id],
      appearance: normalizeAppearanceSettings(undefined),
      demoMode: true,
    },
  }
}

let memoryState: WorkspaceState | null = null

export function restoreActiveModelIfNeeded(state: WorkspaceState) {
  const selectedProvider = state.providers.find(
    (provider) =>
      provider.id === state.settings.activeProviderId &&
      provider.enabled &&
      provider.models.includes(state.settings.activeModel ?? ''),
  )
  if (selectedProvider) return

  const fallbackProvider =
    state.providers.find((provider) => provider.enabled && provider.lastHealth === 'connected') ??
    state.providers.find((provider) => provider.enabled)
  state.settings.activeProviderId = fallbackProvider?.id
  state.settings.activeModel = fallbackProvider?.models.includes(fallbackProvider.defaultModel)
    ? fallbackProvider.defaultModel
    : fallbackProvider?.models[0]
}

function migrateDefaultDemoOutline(state: WorkspaceState): WorkspaceState {
  const storedOutline = state.outlines['project-demo'] ?? []
  if (flattenOutline(storedOutline).some((node) => node.level === 3)) return state

  const demoProject = state.projects.find((project) => project.id === 'project-demo')
  if (!demoProject) return state

  const migrated = clone(state)
  migrated.outlines['project-demo'] = clone(demoOutline)
  migrated.sections = [
    ...migrated.sections.filter((section) => section.projectId !== 'project-demo'),
    ...clone(demoSections),
  ]
  migrated.sectionVersions = migrated.sectionVersions.filter((item) => item.projectId !== 'project-demo')
  const migratedProject = migrated.projects.find((project) => project.id === 'project-demo')
  if (migratedProject) migratedProject.activeSectionId = demoSections[0]?.id
  normalizeFallbackSectionVersions(migrated)
  return migrated
}

export function readState(): WorkspaceState {
  if (memoryState) return memoryState
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const parsed = stored ? (JSON.parse(stored) as WorkspaceState) : initialWorkspace()
    const normalized: WorkspaceState = {
      ...parsed,
      projects: (parsed.projects ?? []).map((project, index) => ({
        ...project,
        pinned: project.pinned === true,
        manualOrder: typeof project.manualOrder === 'number' ? project.manualOrder : index,
      })),
      conversations: (parsed.conversations ?? []).map((conversation, index) => ({
        ...conversation,
        pinned: conversation.pinned === true,
        archived: conversation.archived === true,
        unread: conversation.unread === true,
        manualOrder: typeof conversation.manualOrder === 'number' ? conversation.manualOrder : index,
        goal: typeof conversation.goal === 'string' ? conversation.goal : undefined,
        planMode: conversation.planMode === true,
        accessMode: conversation.accessMode === 'full' ? 'full' : 'ask',
      })),
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
      outlineArchitectures: parsed.outlineArchitectures ?? {},
      outlineQualityReports: parsed.outlineQualityReports ?? {},
      sectionVersions: Array.isArray(parsed.sectionVersions) ? parsed.sectionVersions : [],
      mcpServers: ensureDefaultArxivMcpServer(parsed.mcpServers ?? [], now()),
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      settings: {
        ...parsed.settings,
        appearance: normalizeAppearanceSettings(parsed.settings?.appearance),
        sidebarViewMode: parsed.settings?.sidebarViewMode === 'list' ? 'list' : 'projects',
        sidebarShowArchived: parsed.settings?.sidebarShowArchived === true,
        sidebarWidth: typeof parsed.settings?.sidebarWidth === 'number'
          ? Math.max(240, Math.min(520, Math.round(parsed.settings.sidebarWidth)))
          : undefined,
        rightPanelWidth: typeof parsed.settings?.rightPanelWidth === 'number'
          ? Math.max(320, Math.min(620, Math.round(parsed.settings.rightPanelWidth)))
          : undefined,
        sidebarChatSort: ['priority', 'recent', 'manual'].includes(
          parsed.settings?.sidebarChatSort ?? '',
        )
          ? parsed.settings.sidebarChatSort
          : 'priority',
        sidebarExpandedProjectIds: Array.isArray(parsed.settings?.sidebarExpandedProjectIds)
          ? parsed.settings.sidebarExpandedProjectIds.filter((id) =>
              (parsed.projects ?? []).some((project) => project.id === id),
            )
          : parsed.settings?.activeProjectId
            ? [parsed.settings.activeProjectId]
            : [],
      },
    }
    normalizeFallbackSectionVersions(normalized)
    memoryState = migrateDefaultDemoOutline(normalized)
    synchronizeDerivedSections(memoryState)
  } catch {
    memoryState = initialWorkspace()
    normalizeFallbackSectionVersions(memoryState)
  }
  return memoryState
}

function writeState(next: WorkspaceState) {
  memoryState = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 浏览器隐私模式下仅保留当前会话状态。
  }
}

export function mutate(mutator: (draft: WorkspaceState) => void): WorkspaceState {
  const draft = clone(readState())
  mutator(draft)
  writeState(draft)
  return draft
}
