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
}

export interface Conversation extends BaseEntity {
  projectId: string
  title: string
  messageIds: string[]
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'
export type MessageStatus = 'streaming' | 'completed' | 'cancelled' | 'error'

export interface ChatMessage extends BaseEntity {
  projectId: string
  conversationId: string
  role: MessageRole
  content: string
  status: MessageStatus
  providerId?: string
  model?: string
  contextScope?: 'project' | 'manuscript' | 'section' | 'selection'
  runId?: string
  error?: string
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

export interface OutlineNode {
  id: string
  title: string
  level: 1 | 2 | 3
  objective: string
  targetWords: number
  citationIds: string[]
  children: OutlineNode[]
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
  /**
   * 当前小节从哪一条父章节正文中拆分得到。
   * 父章节仍是完整主稿；带此字段的小节只是可单独查看和编辑的同步视图。
   */
  derivedFromSectionId?: string
  /** 生成当前同步视图时对应的父章节版本，用于判断是否需要刷新。 */
  derivedFromVersion?: number
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
  tools: Array<{ name: string; description?: string }>
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

export interface WorkspaceState {
  schemaVersion: number
  projects: Project[]
  conversations: Conversation[]
  messages: ChatMessage[]
  providers: ProviderProfile[]
  literature: LiteratureRecord[]
  outlines: Record<string, OutlineNode[]>
  sections: ManuscriptSection[]
  citations: CitationEvidence[]
  runs: AgentRun[]
  mcpServers: McpServerConfig[]
  artifacts: Artifact[]
  settings: {
    activeProjectId?: string
    activeProviderId?: string
    activeModel?: string
    /** 后续新建研究的根目录；未设置时使用系统“文稿/学术 Agent”。 */
    researchRootPath?: string
    demoMode: boolean
  }
}

export interface ChatStartInput {
  projectId: string
  conversationId: string
  content: string
  providerId: string
  model: string
  contextScope: 'project' | 'manuscript' | 'section' | 'selection'
  selectedText?: string
}

export type ChatStreamEvent =
  | { runId: string; type: 'started'; message: ChatMessage }
  | { runId: string; type: 'text-delta'; delta: string }
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
}

export type ExportFormat = 'md' | 'docx'
