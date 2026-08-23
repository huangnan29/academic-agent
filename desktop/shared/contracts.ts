export type Origin = 'demo' | 'live' | 'cached'

export type VerificationStatus =
  | 'verified-metadata'
  | 'abstract-only'
  | 'unverified'
  | 'unavailable'
  | 'demo'

export type ProjectStatus =
  | 'draft'
  | 'researching'
  | 'outline-review'
  | 'writing'
  | 'reviewing'
  | 'completed'
  | 'stopped'

export interface BaseEntity {
  id: string
  origin: Origin
  verificationStatus: VerificationStatus
  createdAt: string
  updatedAt: string
}

export interface ResearchBrief {
  title: string
  paperType: string
  discipline: string
  language: 'zh-CN' | 'en'
  targetWords: number
  requirements: string
  keywords: string[]
}

export interface Project extends BaseEntity {
  title: string
  status: ProjectStatus
  brief: ResearchBrief
  activeConversationId: string
  activeSectionId?: string
  /** 用户可选的研究资料目录；未设置时继续使用应用默认本机目录。 */
  researchFolderPath?: string
  /** Codex 式侧栏中的项目置顶状态。 */
  pinned?: boolean
  /** 用户选择手动排序时使用的稳定顺序。 */
  manualOrder?: number
}

export interface Conversation extends BaseEntity {
  projectId: string
  title: string
  messageIds: string[]
  /** 对话可独立于所属研究置顶。 */
  pinned?: boolean
  /** 归档后默认从侧栏隐藏，但仍保留全部消息。 */
  archived?: boolean
  /** 用户手动标记的未读状态。 */
  unread?: boolean
  /** 用户选择手动排序时使用的稳定顺序。 */
  manualOrder?: number
  /** 对话持续追踪的目标，仅作用于本应用当前对话。 */
  goal?: string
  /** 计划模式只输出分析与步骤，不把计划描述成已经执行。 */
  planMode?: boolean
  /** 当前对话的本机操作授权策略；默认必须先询问用户。 */
  accessMode?: ConversationAccessMode
}

export type ConversationAccessMode = 'ask' | 'full'

export type SystemPermissionStatus =
  | 'granted'
  | 'denied'
  | 'not-determined'
  | 'restricted'
  | 'unknown'
  | 'unsupported'

export type SystemPermissionKind =
  | 'accessibility'
  | 'full-disk-access'
  | 'screen-recording'
  | 'microphone'

export interface SystemPermissionSnapshot {
  platform: 'macos' | 'unsupported'
  accessibility: SystemPermissionStatus
  fullDiskAccess: SystemPermissionStatus
  screenRecording: SystemPermissionStatus
  microphone: SystemPermissionStatus
  /** 完全访问只在应用确实拥有辅助功能和完全磁盘访问后才能启用。 */
  fullAccessReady: boolean
  checkedAt: string
}

export type VoiceRecognitionAuthorization =
  | 'authorized'
  | 'denied'
  | 'not-determined'
  | 'restricted'
  | 'unsupported'
  | 'unknown'

export interface VoiceRecognitionStatus {
  available: boolean
  authorization: VoiceRecognitionAuthorization
  locale: string
  onDevice: boolean
  message?: string
}

export interface VoiceInputStartResult {
  sessionId: string
}

export type VoiceInputEvent =
  | { sessionId: string; type: 'started'; onDevice: boolean }
  | { sessionId: string; type: 'result'; transcript: string; final: boolean }
  | { sessionId: string; type: 'error'; code: string; message: string }
  | { sessionId: string; type: 'ended' }

export interface ConversationUpdateInput {
  conversationId: string
  title?: string
  pinned?: boolean
  archived?: boolean
  unread?: boolean
  goal?: string
  planMode?: boolean
  accessMode?: ConversationAccessMode
}

export interface ConversationAttachment extends BaseEntity {
  projectId: string
  conversationId: string
  name: string
  path: string
  kind: 'file' | 'folder'
  extractedText: string
  fileCount: number
  byteCount: number
  warning?: string
}

export type SidebarViewMode = 'projects' | 'list'
export type SidebarChatSort = 'priority' | 'recent' | 'manual'

export type AppearanceTheme = 'system' | 'light' | 'dark'
export type AppearanceUiFont = 'system' | 'inter' | 'serif' | 'monospace'
export type AppearanceDockIcon = 'academic' | 'assistant'
export type AppearanceReducedMotion = 'system' | 'on' | 'off'
export type AppearanceDiffStyle = 'color' | 'symbol'

export interface AppearancePalette {
  accent: string
  background: string
  foreground: string
}

/**
 * 应用外观仅保存受控的枚举、颜色与数值，不接收 CSS、资源路径或可执行内容。
 * 主进程与浏览器后备层共用同一份默认值，保证旧工作区升级后表现一致。
 */
export interface AppearanceSettings {
  theme: AppearanceTheme
  palettes: {
    light: AppearancePalette
    dark: AppearancePalette
  }
  uiFont: AppearanceUiFont
  translucentSidebar: boolean
  contrast: number
  pointerCursor: boolean
  dockIcon: AppearanceDockIcon
  reducedMotion: AppearanceReducedMotion
  uiFontSize: number
  diffStyle: AppearanceDiffStyle
  fontSmoothing: boolean
}

export type AppearanceSettingsInput = Omit<Partial<AppearanceSettings>, 'palettes'> & {
  palettes?: {
    light?: Partial<AppearancePalette>
    dark?: Partial<AppearancePalette>
  }
}

/** 复制与导入使用带版本号的纯 JSON 文档，便于以后安全迁移。 */
export interface AppearanceThemeDocument {
  version: 1
  presetName?: string
  palettes: AppearanceSettings['palettes']
  uiFont: AppearanceUiFont
  translucentSidebar: boolean
  contrast: number
}

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  theme: 'system',
  palettes: {
    light: {
      accent: '#c43d1a',
      background: '#ffffff',
      foreground: '#24201f',
    },
    dark: {
      accent: '#e8785c',
      background: '#1e1e1e',
      foreground: '#f1efee',
    },
  },
  uiFont: 'system',
  translucentSidebar: false,
  contrast: 50,
  pointerCursor: false,
  dockIcon: 'academic',
  reducedMotion: 'system',
  uiFontSize: 14,
  diffStyle: 'color',
  fontSmoothing: true,
}

export interface SidebarPreferencesInput {
  viewMode?: SidebarViewMode
  chatSort?: SidebarChatSort
  expandedProjectIds?: string[]
  showArchived?: boolean
  sidebarWidth?: number
  rightPanelWidth?: number
  projectOrder?: string[]
  conversationOrder?: string[]
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'
export type MessageStatus = 'streaming' | 'completed' | 'cancelled' | 'error'

/**
 * 输入框通过“/”显式附加的应用内上下文引用。
 * 渲染层只提交稳定 ID；主进程会从最新工作区解析名称和内容，避免伪造 Skill 或 MCP 能力。
 */
export type ChatContextReference =
  | { kind: 'skill'; skillId: string }
  | { kind: 'mcp'; serverId: string }
  | { kind: 'mcp-tool'; serverId: string; toolName: string }

export interface ChatMessage extends BaseEntity {
  projectId: string
  conversationId: string
  role: MessageRole
  content: string
  /** 仅保存模型服务明确返回的 reasoning/thinking 流，不由应用模拟。 */
  reasoningContent?: string
  status: MessageStatus
  providerId?: string
  model?: string
  contextScope?: 'project' | 'manuscript' | 'section' | 'selection'
  contextReferences?: ChatContextReference[]
  /** 本轮真实 MCP 返回且可由用户加入右侧文献栏的结构化文献候选。 */
  literatureCandidates?: MessageLiteratureCandidate[]
  runId?: string
  error?: string
}

/**
 * 助手消息绑定的文献候选只来自真实 MCP 结构化返回，不从模型正文猜测。
 * 用户点击添加后，主进程会再次按消息和项目归属校验再写入文献库。
 */
export interface MessageLiteratureCandidate {
  id: string
  title: string
  authors: string[]
  year?: number
  venue?: string
  abstract?: string
  doi?: string
  url?: string
  /** MCP 结果中的明确标识（如 arXiv ID 或 DOI），用于与正文引用精确核对。 */
  referenceIds?: string[]
  /** 候选对应的本机 MCP 审计记录；不包含凭证或原始请求头。 */
  provenance?: {
    runId: string
    stepId: string
    serverId: string
    toolName: string
    resultSha256: string
  }
  source: 'mcp'
}

export interface LiteratureAddFromMessageInput {
  messageId: string
  candidateIds: string[]
}

/** 把文献移入某个研究分类，或移回全局“未分类”；移动不会删除书目数据。 */
export interface LiteratureSetProjectInput {
  literatureId: string
  /** null 明确表示当前记录位于“未分类”，undefined 仅供旧调用兼容。 */
  sourceProjectId?: string | null
  targetProjectId?: string
}

/** 从本机文献库永久删除一条记录；主进程仍会阻止删除正在被引用的文献。 */
export interface LiteratureDeleteInput {
  literatureId: string
  /** null 明确表示当前记录位于“未分类”，undefined 仅供旧调用兼容。 */
  sourceProjectId?: string | null
}

export type ProviderProtocol = 'openai-compatible' | 'anthropic'

export interface ProviderProfile extends BaseEntity {
  name: string
  protocol: ProviderProtocol
  baseUrl: string
  models: string[]
  defaultModel: string
  enabled: boolean
  hasCredential: boolean
  lastHealth?: 'untested' | 'checking' | 'connected' | 'failed'
  lastError?: string
}

export interface ProviderInput {
  id?: string
  name: string
  protocol: ProviderProtocol
  baseUrl: string
  apiKey?: string
  models: string[]
  defaultModel: string
  enabled: boolean
}

/** 应用内 Skill 的字段上限，原生端与演示后备层共用。 */
export const SKILL_LIMITS = {
  name: 80,
  description: 1_000,
  instructions: 20_000,
  prompt: 24_000,
  enabledCount: 32,
} as const

/**
 * 仅保存在本应用工作区中的用户指令。
 * Skill 不包含文件路径、启动命令或系统目录，因此不会读取系统 Skill。
 */
export interface SkillDefinition extends BaseEntity {
  name: string
  description: string
  instructions: string
  enabled: boolean
}

export interface SkillInput {
  id?: string
  name: string
  description: string
  instructions: string
  enabled: boolean
}

export interface LiteratureRecord extends BaseEntity {
  projectId?: string
  title: string
  authors: string[]
  year?: number
  venue?: string
  abstract?: string
  doi?: string
  url?: string
  source: 'openalex' | 'crossref' | 'mcp' | 'manual' | 'demo'
  included: boolean
}

export interface LiteratureSearchInput {
  projectId?: string
  query: string
  limit?: number
  mcp?: {
    serverId: string
    toolName: string
    queryArgument?: string
  }
}

/** 论文所属的主学科族，用于选择结构模式而不是直接决定章节标题。 */
export type DisciplineFamily =
  | 'literature-language'
  | 'science'
  | 'engineering'
  | 'law'
  | 'design-art'
  | 'management-economics'
  | 'education'
  | 'medicine-health'
  | 'interdisciplinary'
  | 'unknown'

/** 可复用的论文结构模式；学科与模式是多对多关系。 */
export type PaperStructurePattern =
  | 'empirical-imrad'
  | 'system-engineering'
  | 'thematic-review'
  | 'theoretical-normative'
  | 'case-study'
  | 'policy-management'

export type OutlineEvidenceNeed = 'literature' | 'project-data' | 'case-material' | 'analysis'
export type OutlineContentForm = 'prose' | 'table' | 'diagram' | 'formula' | 'code'

/** 正文生成时识别的章节职责；无法可靠判断时使用 general-analysis。 */
export type SectionProfile =
  | 'abstract'
  | 'introduction'
  | 'literature-review'
  | 'method-design'
  | 'result-implementation'
  | 'discussion-conclusion'
  | 'general-analysis'

/** 单次生成可组合的内置优化策略；首批由章节类型自动选择。 */
export type SectionOptimizationStrategy =
  | 'evidence-first'
  | 'argument-deepening'
  | 'natural-academic'
  | 'concise'

export type SectionGenerationMode = 'initial' | 'revise' | 'rewrite'
export type SectionContentForm = Exclude<OutlineContentForm, 'prose'>

/** 为后续重新生成面板预留的窄化契约；当前首次生成全部字段均可缺省。 */
export interface SectionGenerationOptions {
  mode?: SectionGenerationMode
  profile?: SectionProfile
  strategyIds?: SectionOptimizationStrategy[]
  contentForms?: SectionContentForm[]
  customInstructions?: string
}

/** 大纲生成前的结构决策快照，供界面解释和后续章节生成复用。 */
export interface OutlineArchitecture {
  projectId: string
  disciplineFamily: DisciplineFamily
  disciplineLabel: string
  researchDirection: string
  researchObject: string
  researchAction: string
  scope: string
  pattern: PaperStructurePattern
  confidence: number
  alternatives: PaperStructurePattern[]
  rationale: string
  researchQuestions: string[]
  narrativeFlow: string[]
  totalTargetWords: number
  dataAvailable: boolean
  generatedAt: string
}

export interface OutlineQualityIssue {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
  nodeId?: string
}

/** 三级大纲的确定性质量检查结果，不使用模型自评分。 */
export interface OutlineQualityReport {
  passed: boolean
  score: number
  issues: OutlineQualityIssue[]
  metrics: {
    rootCount: number
    nodeCount: number
    leafCount: number
    targetWords: number
    allocatedWords: number
    allocationRatio: number
    citationCount: number
  }
}

export interface OutlineNode {
  id: string
  title: string
  level: 1 | 2 | 3
  objective: string
  targetWords: number
  citationIds: string[]
  children: OutlineNode[]
  /** 当前节点回答哪些研究问题；旧工作区可缺省。 */
  servesResearchQuestions?: string[]
  /** 本节点在整篇论文论证链中的作用。 */
  role?: string
  /** 需要在正文中完成的关键主张，而不是预设结论。 */
  keyClaims?: string[]
  /** 完成该节点所需的证据类型。 */
  evidenceNeeds?: OutlineEvidenceNeed[]
  /** 适合该节点的内容形态，仅作生成建议。 */
  contentForms?: OutlineContentForm[]
  /** 与下一节点之间的衔接说明。 */
  transition?: string
}

export interface ManuscriptSection extends BaseEntity {
  projectId: string
  outlineNodeId: string
  title: string
  level: 1 | 2 | 3
  content: string
  status: 'pending' | 'generating' | 'draft' | 'verified' | 'error'
  wordCount: number
  version: number
  /** 当前正文对应的历史版本；正文偏离快照时会清空。 */
  activeGenerationVersionId?: string
  /** 最近一次模型生成所使用的提供商与模型，仅用于本机过程追溯。 */
  generationProviderId?: string
  generationModel?: string
  /** 仅保存模型服务明确返回的章节推理流，不由应用模拟。 */
  reasoningContent?: string
  /** 当前请求是否显式要求提供商开启 Thinking。 */
  thinkingRequested?: boolean
  /** 最近一次生成识别出的章节职责和实际采用策略。 */
  generationProfile?: SectionProfile
  generationMode?: SectionGenerationMode
  generationStrategyIds?: SectionOptimizationStrategy[]
  generationContentForms?: SectionContentForm[]
  generationCustomInstructions?: string
  /** 章节生成失败时保留可读错误；已经收到的正文片段不会被清空。 */
  generationError?: string
  /**
   * 当前小节从哪一条父章节正文中拆分得到。
   * 父章节仍是完整主稿；带此字段的小节只是可单独查看和编辑的同步视图。
   */
  derivedFromSectionId?: string
  /** 生成当前同步视图时对应的父章节版本，用于判断是否需要刷新。 */
  derivedFromVersion?: number
}

export interface ManuscriptSectionVersion extends BaseEntity {
  projectId: string
  sectionId: string
  /** 面向用户的连续编号，从 1 开始。 */
  number: number
  source: 'generated' | 'saved' | 'migrated' | 'partial' | 'derived'
  content: string
  wordCount: number
  status: 'draft' | 'verified' | 'error'
  reasoningContent?: string
  generationProviderId?: string
  generationModel?: string
  thinkingRequested?: boolean
  generationProfile?: SectionProfile
  generationMode?: SectionGenerationMode
  generationStrategyIds?: SectionOptimizationStrategy[]
  generationContentForms?: SectionContentForm[]
  generationCustomInstructions?: string
}

export interface CitationEvidence extends BaseEntity {
  projectId: string
  sectionId: string
  marker: string
  literatureId?: string
  claim: string
  status: 'mapped' | 'unmapped' | 'needs-review'
}

export interface AgentStep {
  id: string
  label: string
  detail: string
  status: 'pending' | 'running' | 'completed' | 'warning' | 'error' | 'stopped'
  startedAt?: string
  completedAt?: string
  /** MCP 工具的有界、脱敏审计证据；不包含传输层凭证。 */
  evidence?: {
    kind: 'mcp-tool'
    serverId: string
    toolName: string
    argumentsJson: string
    resultJson: string
    resultSha256: string
    truncated: boolean
  }
}

export interface AgentRun extends BaseEntity {
  projectId: string
  kind: 'research' | 'outline' | 'write' | 'review' | 'chat' | 'export'
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'error'
  steps: AgentStep[]
  error?: string
}

export type McpTransportConfig =
  | {
      type: 'stdio'
      command: string
      args: string[]
      cwd?: string
      env?: Record<string, string>
    }
  | {
      type: 'streamable-http'
      url: string
      headers?: Record<string, string>
    }

export interface McpServerConfig extends BaseEntity {
  name: string
  transport: McpTransportConfig
  enabled: boolean
  status: 'disconnected' | 'connecting' | 'connected' | 'failed'
  tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>
  resources: Array<{ uri: string; name: string; description?: string }>
  lastError?: string
}

export interface McpServerInput {
  id?: string
  name: string
  transport: McpTransportConfig
  enabled: boolean
}

export interface McpToolCallResult {
  content: unknown[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
  _meta?: Record<string, unknown>
}

export interface McpResourceReadResult {
  contents: Array<
    | { uri: string; text: string; mimeType?: string; _meta?: Record<string, unknown> }
    | { uri: string; blob: string; mimeType?: string; _meta?: Record<string, unknown> }
  >
  _meta?: Record<string, unknown>
}

export interface Artifact extends BaseEntity {
  projectId: string
  name: string
  format: 'md' | 'docx'
  path: string
  size: number
}

export interface WorkspaceSettings {
  activeProjectId?: string
  activeProviderId?: string
  activeModel?: string
  /** 后续新建研究的根目录；未设置时使用系统“文稿/学术 Agent”。 */
  researchRootPath?: string
  /** 左侧栏按项目树或单一对话列表显示。 */
  sidebarViewMode?: SidebarViewMode
  /** 对话与项目的排序规则。 */
  sidebarChatSort?: SidebarChatSort
  /** 独立持久化每个项目的展开状态，不与当前项目绑定。 */
  sidebarExpandedProjectIds?: string[]
  /** 是否在侧栏中显示已经归档的对话。 */
  sidebarShowArchived?: boolean
  /** 展开状态下由用户拖动保存的侧栏宽度。 */
  sidebarWidth?: number
  /** 展开状态下由用户拖动保存的右侧学术工作台宽度。 */
  rightPanelWidth?: number
  /** Codex 式外观与偏好设置；旧工作区由仓储层自动补齐默认值。 */
  appearance: AppearanceSettings
  demoMode: boolean
}

export interface WorkspaceState {
  schemaVersion: number
  projects: Project[]
  conversations: Conversation[]
  attachments: ConversationAttachment[]
  messages: ChatMessage[]
  providers: ProviderProfile[]
  literature: LiteratureRecord[]
  outlines: Record<string, OutlineNode[]>
  /** 按项目保存最近一次大纲结构决策；旧工作区由仓储层补空对象。 */
  outlineArchitectures?: Record<string, OutlineArchitecture>
  /** 按项目保存最近一次确定性大纲质量检查。 */
  outlineQualityReports?: Record<string, OutlineQualityReport>
  sections: ManuscriptSection[]
  sectionVersions: ManuscriptSectionVersion[]
  citations: CitationEvidence[]
  runs: AgentRun[]
  mcpServers: McpServerConfig[]
  skills: SkillDefinition[]
  artifacts: Artifact[]
  settings: WorkspaceSettings
}

export interface ChatStartInput {
  projectId: string
  conversationId: string
  content: string
  providerId: string
  model: string
  contextScope: 'project' | 'manuscript' | 'section' | 'selection'
  selectedText?: string
  contextReferences?: ChatContextReference[]
}

export type ChatStreamEvent =
  | { runId: string; type: 'started'; message: ChatMessage }
  | { runId: string; type: 'text-delta'; delta: string }
  | { runId: string; type: 'reasoning-delta'; delta: string }
  | { runId: string; type: 'step'; step: AgentStep }
  | { runId: string; type: 'completed'; message: ChatMessage }
  | { runId: string; type: 'cancelled'; message: ChatMessage }
  | { runId: string; type: 'error'; message: string }

export interface OutlineGenerateInput {
  projectId: string
  providerId: string
  model: string
}

export interface SectionGenerateInput {
  projectId: string
  sectionId: string
  providerId: string
  model: string
  options?: SectionGenerationOptions
}

export interface SectionGenerationPreviewInput {
  projectId: string
  sectionId: string
  options?: SectionGenerationOptions
}

/** 重新生成面板展示的确定性计划，不包含模型 Thinking 或未核验推断。 */
export interface SectionGenerationPreview {
  profile: SectionProfile
  profileLabel: string
  profileSummary: string
  mode: SectionGenerationMode
  strategyIds: SectionOptimizationStrategy[]
  defaultStrategyIds: SectionOptimizationStrategy[]
  availableContentForms: SectionContentForm[]
  selectedContentForms: SectionContentForm[]
  unsupportedContentForms: SectionContentForm[]
  dataBoundary: string
  currentWordCount: number
  includedLiteratureCount: number
  generatedSectionCount: number
}

export interface SectionVersionSelectInput {
  sectionId: string
  versionId: string
}

export type SectionStreamEvent =
  | {
      runId: string
      sectionId: string
      type: 'started'
      providerId: string
      providerName: string
      model: string
      thinkingRequested: boolean
    }
  | { runId: string; sectionId: string; type: 'text-delta'; delta: string }
  | { runId: string; sectionId: string; type: 'reasoning-delta'; delta: string }
  | { runId: string; sectionId: string; type: 'completed'; section: ManuscriptSection }
  | { runId: string; sectionId: string; type: 'error'; message: string; section: ManuscriptSection }

export type ExportFormat = 'md' | 'docx'
