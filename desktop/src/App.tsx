import {
  Activity,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Clock3,
  Database,
  Download,
  ExternalLink,
  FileCheck2,
  FilePenLine,
  FileText,
  Files,
  Folder,
  FolderOpen,
  KeyRound,
  Library,
  ListChecks,
  LoaderCircle,
  MessageSquareText,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  PencilLine,
  PlugZap,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Square,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { FormEvent, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type {
  AgentStep,
  ChatMessage,
  LiteratureRecord,
  McpServerConfig,
  ManuscriptSection,
  OutlineNode,
  ProviderProtocol,
  ProviderProfile,
  ResearchBrief,
  WorkspaceState,
} from '../shared/contracts'
import { isNativeBridge, paperAgent } from './fallback'

type Route = 'workspace' | 'library' | 'settings'
type CenterMode = 'chat' | 'manuscript'
type RightTab = 'literature' | 'drafts' | 'process'
type SettingsTab = 'providers' | 'mcp' | 'local'

const appIconUrl = new URL('../build/icon.png', import.meta.url).href

const verificationLabels: Record<LiteratureRecord['verificationStatus'], string> = {
  'verified-metadata': '元数据已核验',
  'abstract-only': '仅检索到摘要',
  unverified: '尚未核验',
  unavailable: '来源不可访问',
  demo: '演示数据，不可引用',
}

const projectStatusLabels: Record<string, string> = {
  draft: '准备中',
  researching: '检索中',
  'outline-review': '待确认大纲',
  writing: '写作中',
  reviewing: '核验中',
  completed: '已完成',
  stopped: '已停止',
}

const emptyWorkspace: WorkspaceState = {
  schemaVersion: 1,
  projects: [],
  conversations: [],
  messages: [],
  providers: [],
  literature: [],
  outlines: {},
  sections: [],
  citations: [],
  runs: [],
  mcpServers: [],
  artifacts: [],
  settings: { demoMode: false },
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
    date,
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function IconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  disabled = false,
  className = '',
}: {
  icon: LucideIcon
  label: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      className={`icon-button${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={17} aria-hidden="true" />
    </button>
  )
}

function StatusBadge({ status, children }: { status: string; children: React.ReactNode }) {
  return (
    <span className={`status-badge status-${status}`}>
      <CircleDot size={11} aria-hidden="true" />
      {children}
    </span>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={22} aria-hidden="true" />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  )
}

function GenerateOutlineAction({
  canGenerate,
  generating,
  onGenerate,
  onConfigureModel,
}: {
  canGenerate: boolean
  generating: boolean
  onGenerate: () => void
  onConfigureModel: () => void
}) {
  return (
    <div className="generate-outline-actions">
      <button type="button" className="primary-button compact" onClick={onGenerate} disabled={!canGenerate || generating}>
        {generating ? <LoaderCircle size={15} className="spin" /> : <ListChecks size={15} />}
        {generating ? '正在生成大纲' : '生成三级大纲'}
      </button>
      {!canGenerate && (
        <button type="button" className="inline-link" onClick={onConfigureModel}>
          请先配置可用模型
        </button>
      )}
    </div>
  )
}

function Sidebar({
  workspace,
  activeProjectId,
  route,
  collapsed,
  onToggle,
  onRoute,
  onProject,
  onCreate,
  onChooseFolder,
  onDeleteProject,
  choosingFolder,
}: {
  workspace: WorkspaceState
  activeProjectId?: string
  route: Route
  collapsed: boolean
  onToggle: () => void
  onRoute: (route: Route) => void
  onProject: (projectId: string) => void
  onCreate: () => void
  onChooseFolder: () => void
  onDeleteProject: (projectId: string) => void
  choosingFolder: boolean
}) {
  const activeConversations = workspace.conversations.filter((item) => item.projectId === activeProjectId)
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string>()
  const researchFolderLabel = workspace.settings.researchRootPath
    ? `设置默认研究文件夹。当前目录：${workspace.settings.researchRootPath}。后续新建研究将保存到该目录`
    : '设置默认研究文件夹。未设置时使用“文稿/学术 Agent”，后续新建研究将保存到该目录'

  return (
    <aside className={`sidebar${collapsed ? ' is-collapsed' : ''}`}>
      <div className="sidebar-titlebar window-drag-region">
        <button type="button" className="brand-mark no-drag" aria-label="学术 Agent 工作区" onClick={() => onRoute('workspace')}>
          <FilePenLine size={16} aria-hidden="true" />
        </button>
        {!collapsed && <span className="brand-name">学术 Agent</span>}
        <div className="sidebar-title-action no-drag">
          <IconButton icon={collapsed ? PanelLeftOpen : PanelLeftClose} label={collapsed ? '展开侧栏' : '收起侧栏'} onClick={onToggle} />
        </div>
      </div>

      <div className="sidebar-scroll">
        <button type="button" className="new-research-button" onClick={onCreate} title="新建研究">
          <Plus size={17} aria-hidden="true" />
          {!collapsed && <span>新建研究</span>}
        </button>

        <nav className="primary-nav" aria-label="主导航">
          <button type="button" className={route === 'library' ? 'is-active' : ''} onClick={() => onRoute('library')} title="文献库">
            <Library size={17} aria-hidden="true" />
            {!collapsed && <span>文献库</span>}
          </button>
          <button type="button" className={route === 'settings' ? 'is-active' : ''} onClick={() => onRoute('settings')} title="模型与 MCP">
            <PlugZap size={17} aria-hidden="true" />
            {!collapsed && <span>模型与 MCP</span>}
          </button>
        </nav>

        {!collapsed && (
          <>
            <section className="sidebar-section">
              <div className="sidebar-section-title">
                <span>研究项目</span>
                <button
                  type="button"
                  aria-label={researchFolderLabel}
                  title={researchFolderLabel}
                  onClick={onChooseFolder}
                  disabled={choosingFolder}
                  aria-busy={choosingFolder}
                >
                  {choosingFolder ? <LoaderCircle size={14} className="spin" /> : <FolderOpen size={14} />}
                </button>
              </div>
              <div className="project-list">
                {workspace.projects.length === 0 ? (
                  <p className="sidebar-empty">尚未创建项目</p>
                ) : (
                  workspace.projects.map((project) => {
                    const menuOpen = openProjectMenuId === project.id
                    const selected = project.id === activeProjectId && route === 'workspace'
                    return (
                      <div
                        key={project.id}
                        className={`project-list-item${selected ? ' is-active' : ''}${menuOpen ? ' is-menu-open' : ''}`}
                        onBlur={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            setOpenProjectMenuId(undefined)
                          }
                        }}
                      >
                        <button
                          type="button"
                          className="project-list-main"
                          onClick={() => {
                            setOpenProjectMenuId(undefined)
                            onProject(project.id)
                          }}
                          title={project.title}
                          aria-current={selected ? 'page' : undefined}
                        >
                          <Folder size={15} aria-hidden="true" />
                          <span>{project.title}</span>
                        </button>
                        <button
                          type="button"
                          className="project-list-more"
                          aria-label={`管理项目：${project.title}`}
                          title="项目操作"
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          aria-controls={menuOpen ? `project-menu-${project.id}` : undefined}
                          onClick={() => setOpenProjectMenuId(menuOpen ? undefined : project.id)}
                        >
                          <MoreHorizontal size={15} aria-hidden="true" />
                        </button>
                        {menuOpen && (
                          <div id={`project-menu-${project.id}`} className="project-list-menu" role="menu" aria-label={`${project.title}的项目操作`}>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenProjectMenuId(undefined)
                                onDeleteProject(project.id)
                              }}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                              删除项目
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </section>

            <section className="sidebar-section conversation-section">
              <div className="sidebar-section-title">
                <span>对话</span>
                <MessageSquareText size={13} aria-hidden="true" />
              </div>
              <div className="sidebar-list">
                {activeConversations.map((conversation) => (
                  <button
                    type="button"
                    key={conversation.id}
                    className={conversation.id === workspace.projects.find((item) => item.id === activeProjectId)?.activeConversationId ? 'is-active' : ''}
                    onClick={() => onRoute('workspace')}
                    title={conversation.title}
                  >
                    <MessageSquareText size={14} aria-hidden="true" />
                    <span>{conversation.title}</span>
                    <small>{conversation.messageIds.length}</small>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      <div className="sidebar-footer">
        <button type="button" className={route === 'settings' ? 'is-active' : ''} onClick={() => onRoute('settings')} title="设置">
          <Settings size={17} aria-hidden="true" />
          {!collapsed && <span>设置</span>}
        </button>
        {!collapsed && (
          <span className="local-mode">
            <Database size={14} aria-hidden="true" />
            本机模式
          </span>
        )}
      </div>
    </aside>
  )
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

function ChatView({
  messages,
  projectTitle,
  onShowLiterature,
}: {
  messages: ChatMessage[]
  projectTitle: string
  onShowLiterature: () => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="chat-empty-wrap">
        <EmptyState
          icon={MessageSquareText}
          title="从研究要求开始"
          description={`围绕“${projectTitle}”提出任务。Agent 会保留项目、文献和文稿上下文。`}
        />
      </div>
    )
  }

  return (
    <div className="conversation-stream">
      {messages.map((message) => (
        <article key={message.id} className={`message message-${message.role}`}>
          <div className="message-avatar" aria-hidden="true">
            {message.role === 'user' ? '你' : <Bot size={17} />}
          </div>
          <div className="message-main">
            <div className="message-meta">
              <strong>{message.role === 'user' ? '你' : '学术 Agent'}</strong>
              <span>{formatTime(message.createdAt)}</span>
              {message.origin === 'demo' && <span className="demo-text">演示</span>}
            </div>
            <MarkdownMessage content={message.content || '正在生成…'} />
            {message.status === 'streaming' && (
              <span className="streaming-line">
                <LoaderCircle size={13} className="spin" /> 正在生成
              </span>
            )}
            {message.status === 'cancelled' && <StatusBadge status="stopped">已停止，已保留生成内容</StatusBadge>}
            {message.status === 'error' && <StatusBadge status="error">{message.error || '生成失败'}</StatusBadge>}
            {message.role === 'assistant' && message.status === 'completed' && (
              <div className="message-actions">
                <button type="button" onClick={onShowLiterature}>
                  <BookOpen size={14} /> 查看引用状态
                </button>
                <button
                  type="button"
                  disabled
                  aria-label="基于此回复修改，首版暂未开放"
                  title="首版暂未开放；请直接在下方输入修改要求"
                >
                  <PencilLine size={14} /> 基于此回复修改
                </button>
              </div>
            )}
          </div>
        </article>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

function ManuscriptView({
  section,
  canGenerateOutline,
  generatingOutline,
  isEditing,
  draft,
  saving,
  onDraft,
  onEdit,
  onSave,
  onGenerate,
  onGenerateOutline,
  onConfigureModel,
}: {
  section?: ManuscriptSection
  canGenerateOutline: boolean
  generatingOutline: boolean
  isEditing: boolean
  draft: string
  saving: boolean
  onDraft: (value: string) => void
  onEdit: () => void
  onSave: () => void
  onGenerate: () => void
  onGenerateOutline: () => void
  onConfigureModel: () => void
}) {
  if (!section) {
    return (
      <div className="document-empty-wrap">
        <EmptyState
          icon={FileText}
          title="尚未创建文稿章节"
          description="生成三级论文大纲后，系统会创建对应章节，并可从右侧“稿件”逐章写作。"
          action={
            <GenerateOutlineAction
              canGenerate={canGenerateOutline}
              generating={generatingOutline}
              onGenerate={onGenerateOutline}
              onConfigureModel={onConfigureModel}
            />
          }
        />
      </div>
    )
  }

  return (
    <div className="manuscript-view">
      <div className="manuscript-toolbar">
        <div>
          <span>第 {section.version} 版</span>
          <span>{section.wordCount.toLocaleString('zh-CN')} 字</span>
          <StatusBadge status={section.status}>{section.status === 'draft' ? '草稿' : section.status === 'verified' ? '已核验' : '待生成'}</StatusBadge>
        </div>
        <div className="toolbar-actions">
          {section.status === 'pending' && (
            <button type="button" className="secondary-button" onClick={onGenerate}>
              <FilePenLine size={15} /> 生成本章
            </button>
          )}
          {isEditing ? (
            <button type="button" className="primary-button compact" onClick={onSave} disabled={saving}>
              {saving ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
              {saving ? '保存中' : '保存修改'}
            </button>
          ) : (
            <button type="button" className="secondary-button" onClick={onEdit}>
              <PencilLine size={15} /> 编辑
            </button>
          )}
        </div>
      </div>
      <article className="manuscript-paper">
        {isEditing ? (
          <textarea value={draft} onChange={(event) => onDraft(event.target.value)} aria-label="编辑当前章节" autoFocus />
        ) : section.content ? (
          <MarkdownMessage content={section.content} />
        ) : (
          <EmptyState icon={FileText} title="本章尚未生成" description="生成后可在这里继续编辑，并围绕选中文本向 Agent 追问。" />
        )}
      </article>
    </div>
  )
}

function ModelPicker({
  providers,
  activeProviderId,
  activeModel,
  open,
  onToggle,
  onSelect,
  onSettings,
}: {
  providers: ProviderProfile[]
  activeProviderId?: string
  activeModel?: string
  open: boolean
  onToggle: () => void
  onSelect: (providerId: string, model: string) => void
  onSettings: () => void
}) {
  const provider = providers.find((item) => item.id === activeProviderId)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onToggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onToggle])

  return (
    <div className="model-picker">
      <button type="button" className="model-picker-trigger" onClick={onToggle} aria-expanded={open} aria-haspopup="menu">
        <span className={`connection-dot ${provider?.lastHealth === 'connected' ? 'is-connected' : ''}`} />
        <span className="model-picker-label">
          <small>{provider?.name ?? '尚未配置模型'}</small>
          <strong>{activeModel ?? '前往设置'}</strong>
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="model-menu" role="menu">
          <div className="model-menu-head">
            <strong>选择下一条消息使用的模型</strong>
            <button type="button" onClick={onToggle} aria-label="关闭模型菜单">
              <X size={15} />
            </button>
          </div>
          <div className="model-menu-list">
            {providers.filter((item) => item.enabled && (item.lastHealth === 'connected' || item.origin === 'demo')).map((item) => (
              <div className="model-provider-group" key={item.id} role="group" aria-label={item.name}>
                <span>{item.name}</span>
                {item.models.map((model) => {
                  const selected = item.id === activeProviderId && model === activeModel
                  return (
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      key={model}
                      className={selected ? 'is-selected' : ''}
                      onClick={() => onSelect(item.id, model)}
                    >
                      <Bot size={15} />
                      <span>{model}</span>
                      {selected && <Check size={15} />}
                    </button>
                  )
                })}
              </div>
            ))}
            {providers.filter((item) => item.enabled && (item.lastHealth === 'connected' || item.origin === 'demo')).length === 0 && <p className="menu-empty">没有已测试可用的模型</p>}
          </div>
          <button type="button" role="menuitem" className="model-settings-link" onClick={onSettings}>
            <Settings size={15} /> 管理模型提供商
          </button>
        </div>
      )}
    </div>
  )
}

function Composer({
  providers,
  activeProviderId,
  activeModel,
  running,
  contextLabel,
  onSelectModel,
  onSend,
  onCancel,
  onSettings,
}: {
  providers: ProviderProfile[]
  activeProviderId?: string
  activeModel?: string
  running: boolean
  contextLabel: string
  onSelectModel: (providerId: string, model: string) => void
  onSend: (content: string) => void
  onCancel: () => void
  onSettings: () => void
}) {
  const [value, setValue] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const composingRef = useRef(false)
  const canSend = Boolean(value.trim() && activeProviderId && activeModel && !running)

  const submit = () => {
    if (!canSend) return
    onSend(value.trim())
    setValue('')
  }

  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onCompositionStart={() => {
            composingRef.current = true
          }}
          onCompositionEnd={() => {
            composingRef.current = false
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !composingRef.current) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder="描述研究任务，或围绕当前文稿继续对话…"
          aria-label="向论文研究 Agent 提问"
          disabled={running}
        />
        <div className="composer-toolbar">
          <div className="composer-tools">
            <IconButton icon={Paperclip} label="添加附件（首版暂未开放）" disabled />
            <ModelPicker
              providers={providers}
              activeProviderId={activeProviderId}
              activeModel={activeModel}
              open={pickerOpen}
              onToggle={() => setPickerOpen((current) => !current)}
              onSelect={(providerId, model) => {
                onSelectModel(providerId, model)
                setPickerOpen(false)
              }}
              onSettings={() => {
                setPickerOpen(false)
                onSettings()
              }}
            />
          </div>
          <div className="composer-status">
            <span>{contextLabel}</span>
            {running ? (
              <button type="button" className="send-button is-stop" onClick={onCancel} aria-label="停止生成">
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button type="button" className="send-button" onClick={submit} disabled={!canSend} aria-label="发送消息">
                <Send size={17} />
              </button>
            )}
          </div>
        </div>
      </div>
      {!activeProviderId && (
        <button type="button" className="composer-hint" onClick={onSettings}>
          尚未配置可用模型，前往设置后即可开始生成
        </button>
      )}
    </div>
  )
}

function LiteratureList({
  records,
  activeProjectId,
  compact = false,
  onToggle,
  onOpen,
}: {
  records: LiteratureRecord[]
  activeProjectId?: string
  compact?: boolean
  onToggle: (record: LiteratureRecord) => void
  onOpen: (record: LiteratureRecord) => void
}) {
  if (records.length === 0) {
    return <EmptyState icon={BookOpen} title="尚无文献" description="发起检索后，候选文献及其核验状态会显示在这里。" />
  }

  return (
    <div className={`literature-list${compact ? ' is-compact' : ''}`}>
      {records.map((record) => (
        <article key={record.id} className={`literature-item${record.included ? ' is-included' : ''}`}>
          <button type="button" className="literature-main" onClick={() => onOpen(record)}>
            <span className="literature-icon">
              <FileText size={16} />
            </span>
            <span className="literature-copy">
              <strong>{record.title}</strong>
              <span>{record.authors.join('、') || '作者未知'}{record.year ? ` · ${record.year}` : ''}</span>
              <small>{record.venue || record.source.toUpperCase()}</small>
            </span>
          </button>
          <div className="literature-foot">
            <StatusBadge status={record.verificationStatus}>{verificationLabels[record.verificationStatus]}</StatusBadge>
            {activeProjectId && (
              <button type="button" className={record.included ? 'include-button is-included' : 'include-button'} onClick={() => onToggle(record)}>
                {record.included ? <Check size={13} /> : <Plus size={13} />}
                {record.included ? '已纳入' : '纳入项目'}
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}

const outlineLevelLabels: Record<1 | 2 | 3, string> = {
  1: '一级章节',
  2: '二级小节',
  3: '三级条目',
}

const sectionStatusLabels: Record<ManuscriptSection['status'], string> = {
  pending: '待生成',
  generating: '生成中',
  draft: '草稿',
  verified: '已核验',
  error: '生成失败',
}

function normalizeOutlineLevel(node: OutlineNode, depth: number): 1 | 2 | 3 {
  const level = Number(node.level) || depth
  return Math.min(3, Math.max(1, level)) as 1 | 2 | 3
}

function summarizeOutline(nodes: OutlineNode[]) {
  const summary = { 1: 0, 2: 0, 3: 0 }
  const visit = (items: OutlineNode[], depth: number) => {
    items.forEach((node) => {
      summary[normalizeOutlineLevel(node, depth)] += 1
      if (Array.isArray(node.children)) visit(node.children, depth + 1)
    })
  }
  visit(nodes, 1)
  return summary
}

function indexSectionsByOutlineNode(sections: ManuscriptSection[], selectedSectionId?: string) {
  const result = new Map<string, ManuscriptSection>()
  sections.forEach((section) => {
    if (!section.outlineNodeId) return
    const current = result.get(section.outlineNodeId)
    if (!current || section.id === selectedSectionId) {
      result.set(section.outlineNodeId, section)
      return
    }
    if (current.id === selectedSectionId) return
    if (
      section.version > current.version ||
      (section.version === current.version && section.updatedAt > current.updatedAt)
    ) {
      result.set(section.outlineNodeId, section)
    }
  })
  return result
}

function OutlineStatusIcon({ section }: { section?: ManuscriptSection }) {
  if (section?.status === 'verified') return <FileCheck2 size={15} aria-hidden="true" />
  if (section?.status === 'generating') return <LoaderCircle size={15} className="spin" aria-hidden="true" />
  if (section?.status === 'error') return <CircleAlert size={15} aria-hidden="true" />
  return <FileText size={15} aria-hidden="true" />
}

function OutlineTreeNodes({
  nodes,
  depth,
  path,
  sectionByNodeId,
  selectedSectionId,
  onSelectSection,
}: {
  nodes: OutlineNode[]
  depth: number
  path: string
  sectionByNodeId: Map<string, ManuscriptSection>
  selectedSectionId?: string
  onSelectSection: (section: ManuscriptSection) => void
}) {
  return (
    <>
      {nodes.map((node, index) => {
        const level = normalizeOutlineLevel(node, depth)
        const section = sectionByNodeId.get(node.id)
        const title = node.title?.trim() || '未命名大纲节点'
        const statusLabel = section ? sectionStatusLabels[section.status] : '尚未创建文稿'
        const targetWords = Number.isFinite(node.targetWords) && node.targetWords > 0
          ? `${node.targetWords.toLocaleString('zh-CN')} 字目标`
          : '未设置目标篇幅'
        const progressLabel = section?.wordCount
          ? `${section.wordCount.toLocaleString('zh-CN')} 字 · 第 ${Math.max(1, section.version)} 版`
          : targetWords
        const children = Array.isArray(node.children) ? node.children : []
        const nodePath = `${path}-${node.id || index}`
        const selected = section?.id === selectedSectionId

        return (
          <li className={`outline-tree-node is-level-${level}`} key={nodePath}>
            <button
              type="button"
              className={`outline-row is-level-${level}${selected ? ' is-active' : ''}`}
              onClick={() => section && onSelectSection(section)}
              disabled={!section}
              aria-current={selected ? 'true' : undefined}
              aria-label={`${outlineLevelLabels[level]}：${title}，${statusLabel}，${progressLabel}`}
              title={section ? title : `${title}（该节点尚未创建对应文稿）`}
            >
              <span className={`outline-state state-${section?.status ?? 'unavailable'}`}>
                <OutlineStatusIcon section={section} />
              </span>
              <span className="outline-copy">
                <strong>{title}</strong>
                <small>
                  <span className="outline-level-label">{outlineLevelLabels[level]}</span>
                  <span>{statusLabel} · {progressLabel}</span>
                </small>
              </span>
              <span className="outline-row-action" aria-hidden="true">
                {section ? <ChevronRight size={15} /> : <span>—</span>}
              </span>
            </button>
            {children.length > 0 && (
              <ol className="outline-tree-children">
                <OutlineTreeNodes
                  nodes={children}
                  depth={depth + 1}
                  path={nodePath}
                  sectionByNodeId={sectionByNodeId}
                  selectedSectionId={selectedSectionId}
                  onSelectSection={onSelectSection}
                />
              </ol>
            )}
          </li>
        )
      })}
    </>
  )
}

function RightWorkspace({
  tab,
  onTab,
  literature,
  outline,
  sections,
  selectedSectionId,
  runSteps,
  artifacts,
  activeProjectId,
  onToggleLiterature,
  onOpenLiterature,
  onSelectSection,
  onReveal,
  canGenerateOutline,
  generatingOutline,
  onGenerateOutline,
  onConfigureModel,
  onRefresh,
  onCloseDrawer,
}: {
  tab: RightTab
  onTab: (tab: RightTab) => void
  literature: LiteratureRecord[]
  outline: WorkspaceState['outlines'][string]
  sections: ManuscriptSection[]
  selectedSectionId?: string
  runSteps: AgentStep[]
  artifacts: WorkspaceState['artifacts']
  activeProjectId?: string
  onToggleLiterature: (record: LiteratureRecord) => void
  onOpenLiterature: (record: LiteratureRecord) => void
  onSelectSection: (section: ManuscriptSection) => void
  onReveal: (path: string) => void
  canGenerateOutline: boolean
  generatingOutline: boolean
  onGenerateOutline: () => void
  onConfigureModel: () => void
  onRefresh: () => void
  onCloseDrawer: () => void
}) {
  const outlineNodes = outline ?? []
  const outlineSummary = summarizeOutline(outlineNodes)
  const sectionByNodeId = indexSectionsByOutlineNode(sections, selectedSectionId)

  return (
    <aside className="right-workspace">
      <div className="right-titlebar">
        <strong>研究工作台</strong>
        <div className="right-title-actions">
          <IconButton icon={RefreshCw} label="刷新工作台" onClick={onRefresh} />
          <span className="drawer-close-action">
            <IconButton icon={PanelRightClose} label="关闭研究工作台抽屉" onClick={onCloseDrawer} />
          </span>
        </div>
      </div>
      <div className="right-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          id="right-tab-literature"
          aria-selected={tab === 'literature'}
          aria-controls="right-workspace-panel"
          className={tab === 'literature' ? 'is-active' : ''}
          onClick={() => onTab('literature')}
        >
          <BookOpen size={15} /> 文献
          <span>{literature.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="right-tab-drafts"
          aria-selected={tab === 'drafts'}
          aria-controls="right-workspace-panel"
          className={tab === 'drafts' ? 'is-active' : ''}
          onClick={() => onTab('drafts')}
        >
          <Files size={15} /> 稿件
          <span>{sections.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="right-tab-process"
          aria-selected={tab === 'process'}
          aria-controls="right-workspace-panel"
          className={tab === 'process' ? 'is-active' : ''}
          onClick={() => onTab('process')}
        >
          <Activity size={15} /> 过程
        </button>
      </div>
      <div
        className="right-content"
        role="tabpanel"
        id="right-workspace-panel"
        aria-labelledby={`right-tab-${tab}`}
      >
        {tab === 'literature' && (
          <>
            <div className="panel-summary">
              <div>
                <strong>{literature.filter((item) => item.included).length}</strong>
                <span>已纳入</span>
              </div>
              <div>
                <strong>{literature.filter((item) => item.verificationStatus === 'verified-metadata').length}</strong>
                <span>已核验</span>
              </div>
              <div>
                <strong>{literature.filter((item) => ['demo', 'unverified'].includes(item.verificationStatus)).length}</strong>
                <span>待核验</span>
              </div>
            </div>
            <LiteratureList
              records={literature}
              activeProjectId={activeProjectId}
              compact
              onToggle={onToggleLiterature}
              onOpen={onOpenLiterature}
            />
          </>
        )}

        {tab === 'drafts' && (
          <div className="draft-panel">
            <div className="panel-section-heading">
              <strong>论文大纲</strong>
              <span>{outlineSummary[1]} 章 · {outlineSummary[2]} 节 · {outlineSummary[3]} 目</span>
            </div>
            {outlineNodes.length === 0 && (
              <EmptyState
                icon={ListChecks}
                title="尚未生成大纲"
                description="基于研究要求与已纳入文献生成三级大纲。"
                action={
                  <GenerateOutlineAction
                    canGenerate={canGenerateOutline}
                    generating={generatingOutline}
                    onGenerate={onGenerateOutline}
                    onConfigureModel={onConfigureModel}
                  />
                }
              />
            )}
            {outlineNodes.length > 0 && (
              <ol className="outline-tree" aria-label="论文三级大纲">
                <OutlineTreeNodes
                  nodes={outlineNodes}
                  depth={1}
                  path="outline"
                  sectionByNodeId={sectionByNodeId}
                  selectedSectionId={selectedSectionId}
                  onSelectSection={onSelectSection}
                />
              </ol>
            )}
            <div className="panel-section-heading artifacts-heading">
              <strong>导出产物</strong>
              <span>{artifacts.length} 项</span>
            </div>
            {artifacts.length === 0 ? (
              <p className="inline-empty">完成文稿后，可在顶部导出 Markdown 或 Word 文档。</p>
            ) : (
              artifacts.map((artifact) => (
                <button type="button" className="artifact-row" key={artifact.id} onClick={() => onReveal(artifact.path)}>
                  <Download size={16} />
                  <span>
                    <strong>{artifact.name}</strong>
                    <small>{formatBytes(artifact.size)} · {artifact.format.toUpperCase()}</small>
                  </span>
                  <FolderOpen size={15} />
                </button>
              ))
            )}
          </div>
        )}

        {tab === 'process' && (
          <div className="process-panel">
            <div className="quality-note">
              <ShieldCheck size={17} />
              <div>
                <strong>证据优先</strong>
                <p>书目信息、摘要可用性与主张支持情况分别记录，不以总分掩盖未核验项。</p>
              </div>
            </div>
            {runSteps.length === 0 ? (
              <EmptyState icon={ListChecks} title="尚无执行过程" description="开始检索或生成后，可公开的 Agent 操作会显示在这里。" />
            ) : (
              <ol className="process-list">
                {runSteps.map((step) => (
                  <li key={step.id} className={`process-${step.status}`}>
                    <span className="process-icon">
                      {step.status === 'completed' ? <CircleCheck size={16} /> : step.status === 'running' ? <LoaderCircle size={16} className="spin" /> : step.status === 'warning' ? <CircleAlert size={16} /> : <Clock3 size={16} />}
                    </span>
                    <div>
                      <strong>{step.label}</strong>
                      <p>{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}

function DeleteProjectDialog({
  project,
  busy,
  onClose,
  onConfirm,
}: {
  project?: WorkspaceState['projects'][number]
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const busyRef = useRef(busy)
  const onCloseRef = useRef(onClose)
  busyRef.current = busy
  onCloseRef.current = onClose

  useEffect(() => {
    if (!project) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusFrame = window.requestAnimationFrame(() => cancelButtonRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!busyRef.current) {
          event.preventDefault()
          onCloseRef.current()
        }
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [project?.id])

  if (!project) return null

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="modal delete-project-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-project-title"
        aria-describedby="delete-project-description"
      >
        <header className="modal-header">
          <div>
            <span className="modal-icon is-danger"><Trash2 size={18} /></span>
            <div>
              <h2 id="delete-project-title">删除“{project.title}”？</h2>
              <p id="delete-project-description">此操作会清理学术 Agent 内与该研究关联的数据，且无法撤销。</p>
            </div>
          </div>
          <IconButton icon={X} label="关闭" onClick={onClose} disabled={busy} />
        </header>
        <div className="delete-project-body">
          <div className="delete-project-impact">
            <strong>将从应用内删除</strong>
            <p>对话、已纳入文献、大纲、章节和过程记录。</p>
          </div>
          <div className="delete-project-preserved">
            <FolderOpen size={17} aria-hidden="true" />
            <div>
              <strong>磁盘文件保持不变</strong>
              <p>不会删除研究文件夹，也不会删除已经导出的 Markdown、Word 等文件。</p>
            </div>
          </div>
        </div>
        <footer className="modal-footer delete-project-footer">
          <button ref={cancelButtonRef} type="button" className="secondary-button" onClick={onClose} disabled={busy}>取消</button>
          <button type="button" className="danger-button" onClick={onConfirm} disabled={busy} aria-busy={busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}
            {busy ? '正在删除' : '删除项目'}
          </button>
        </footer>
      </section>
    </div>
  )
}

function NewProjectDialog({ open, busy, onClose, onCreate }: { open: boolean; busy: boolean; onClose: () => void; onCreate: (brief: ResearchBrief) => void }) {
  const dialogRef = useRef<HTMLElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const [form, setForm] = useState({
    title: '',
    paperType: '课程论文',
    discipline: '教育学',
    language: 'zh-CN' as 'zh-CN' | 'en',
    targetWords: 8000,
    requirements: '',
    keywords: '',
  })

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} tabIndex={-1} className="modal new-project-modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
        <header className="modal-header">
          <div>
            <span className="modal-icon"><FilePenLine size={18} /></span>
            <div>
              <h2 id="new-project-title">新建研究项目</h2>
              <p>先明确研究边界，后续检索、写作和引用核验都将围绕这些要求进行。</p>
            </div>
          </div>
          <IconButton icon={X} label="关闭" onClick={onClose} />
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onCreate({
              title: form.title.trim(),
              paperType: form.paperType.trim(),
              discipline: form.discipline.trim(),
              language: form.language,
              targetWords: Number(form.targetWords),
              requirements: form.requirements.trim(),
              keywords: form.keywords.split(/[，,]/).map((item) => item.trim()).filter(Boolean),
            })
          }}
        >
          <label className="field full-field">
            <span>研究题目 <b>必填</b></span>
            <input required autoFocus value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：生成式 AI 赋能高校写作教学研究" />
          </label>
          <div className="form-grid">
            <label className="field">
              <span>论文类型</span>
              <select value={form.paperType} onChange={(event) => setForm({ ...form, paperType: event.target.value })}>
                <option>课程论文</option>
                <option>毕业论文</option>
                <option>学术报告</option>
                <option>文献综述</option>
              </select>
            </label>
            <label className="field">
              <span>学科方向</span>
              <input value={form.discipline} onChange={(event) => setForm({ ...form, discipline: event.target.value })} />
            </label>
            <label className="field">
              <span>写作语言</span>
              <select value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value as 'zh-CN' | 'en' })}>
                <option value="zh-CN">简体中文</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="field">
              <span>目标字数</span>
              <input type="number" min={1000} max={100000} step={500} value={form.targetWords} onChange={(event) => setForm({ ...form, targetWords: Number(event.target.value) })} />
            </label>
          </div>
          <label className="field full-field">
            <span>关键词</span>
            <input value={form.keywords} onChange={(event) => setForm({ ...form, keywords: event.target.value })} placeholder="使用逗号分隔，例如：生成式人工智能，高校写作" />
          </label>
          <label className="field full-field">
            <span>补充要求</span>
            <textarea value={form.requirements} onChange={(event) => setForm({ ...form, requirements: event.target.value })} placeholder="研究范围、结构要求、引用规范或希望重点回答的问题…" />
          </label>
          <div className="form-note">
            <ShieldCheck size={16} />
            <span>默认优先使用可核验来源。无法核验的书目信息和主张会明确标记。</span>
          </div>
          <footer className="modal-footer">
            <button type="button" className="secondary-button" onClick={onClose}>取消</button>
            <button type="submit" className="primary-button" disabled={busy || !form.title.trim()}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}
              {busy ? '正在创建' : '创建研究项目'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}

function LiteratureDetail({ record, onClose, onOpen }: { record?: LiteratureRecord; onClose: () => void; onOpen: (url: string) => void }) {
  if (!record) {
    return (
      <aside className="detail-panel">
        <EmptyState icon={BookOpen} title="选择一条文献" description="这里会显示书目信息、摘要、来源链接和核验状态。" />
      </aside>
    )
  }

  return (
    <aside className="detail-panel">
      <div className="detail-panel-head">
        <strong>文献详情</strong>
        <IconButton icon={X} label="关闭详情" onClick={onClose} />
      </div>
      <div className="detail-panel-body">
        <StatusBadge status={record.verificationStatus}>{verificationLabels[record.verificationStatus]}</StatusBadge>
        <h2>{record.title}</h2>
        <dl className="metadata-list">
          <div><dt>作者</dt><dd>{record.authors.join('、') || '未知'}</dd></div>
          <div><dt>年份</dt><dd>{record.year ?? '未知'}</dd></div>
          <div><dt>期刊 / 来源</dt><dd>{record.venue || record.source.toUpperCase()}</dd></div>
          <div><dt>DOI</dt><dd>{record.doi || '未提供'}</dd></div>
        </dl>
        <section className="abstract-block">
          <h3>摘要</h3>
          <p>{record.abstract || '当前来源未返回摘要。'}</p>
        </section>
        <div className="evidence-checklist">
          <h3>可用性检查</h3>
          <p><CircleCheck size={15} /> 书目信息已收录</p>
          <p className={record.abstract ? '' : 'is-muted'}>{record.abstract ? <CircleCheck size={15} /> : <CircleAlert size={15} />} {record.abstract ? '摘要可阅读' : '摘要不可用'}</p>
          <p className="is-muted"><CircleAlert size={15} /> 尚未判断是否支持当前正文主张</p>
        </div>
        {record.url && (
          <button type="button" className="secondary-button detail-link" onClick={() => onOpen(record.url!)}>
            <ExternalLink size={15} /> 打开原始来源
          </button>
        )}
      </div>
    </aside>
  )
}

function LibraryPage({
  workspace,
  activeProjectId,
  initialSelected,
  onRefresh,
  onToast,
}: {
  workspace: WorkspaceState
  activeProjectId?: string
  initialSelected?: LiteratureRecord
  onRefresh: () => Promise<void>
  onToast: (message: string, tone?: 'success' | 'error') => void
}) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<LiteratureRecord | undefined>(initialSelected)
  const [filter, setFilter] = useState<'all' | 'included' | 'verified' | 'pending'>('all')
  const [sourceKey, setSourceKey] = useState('public')

  const mcpSources = workspace.mcpServers
    .filter((server) => server.enabled && server.tools.length > 0)
    .flatMap((server) =>
      server.tools.map((tool, index) => ({
        key: `mcp:${server.id}:${index}`,
        label: `${server.name} / ${tool.name}`,
        serverId: server.id,
        toolName: tool.name,
      })),
    )

  useEffect(() => {
    if (initialSelected) setSelected(initialSelected)
  }, [initialSelected?.id])

  useEffect(() => {
    if (sourceKey !== 'public' && !mcpSources.some((source) => source.key === sourceKey)) {
      setSourceKey('public')
    }
  }, [sourceKey, mcpSources.map((source) => source.key).join('|')])

  const records = workspace.literature.filter((item) => {
    if (filter === 'included') return item.included
    if (filter === 'verified') return item.verificationStatus === 'verified-metadata'
    if (filter === 'pending') return item.verificationStatus !== 'verified-metadata'
    return true
  })

  const search = async (event: FormEvent) => {
    event.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    try {
      const mcpSource = mcpSources.find((source) => source.key === sourceKey)
      const results = await paperAgent.literature.search({
        projectId: activeProjectId,
        query: query.trim(),
        limit: 30,
        mcp: mcpSource
          ? {
              serverId: mcpSource.serverId,
              toolName: mcpSource.toolName,
              queryArgument: 'query',
            }
          : undefined,
      })
      await onRefresh()
      setSelected(results[0])
      onToast(`已通过${mcpSource ? mcpSource.label : ' OpenAlex + Crossref'}找到 ${results.length} 条候选文献`)
    } catch (error) {
      onToast(error instanceof Error ? error.message : '文献检索失败', 'error')
    } finally {
      setSearching(false)
    }
  }

  const toggle = async (record: LiteratureRecord) => {
    if (!activeProjectId) return
    try {
      await paperAgent.literature.toggle(activeProjectId, record.id, !record.included)
      await onRefresh()
    } catch (error) {
      onToast(error instanceof Error ? error.message : '更新文献失败', 'error')
    }
  }

  return (
    <section className="route-page library-page">
      <header className="route-header">
        <div>
          <span className="route-kicker">本机文献库</span>
          <h1>文献检索与证据核验</h1>
          <p>区分书目信息、摘要可用性和主张支持情况，避免把“检索到”误当作“可以引用”。</p>
        </div>
        {workspace.settings.demoMode && <StatusBadge status="demo">演示结果不可引用</StatusBadge>}
      </header>
      <form className="library-search" onSubmit={search}>
        <Search size={18} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入关键词、论文标题或 DOI" />
        <select
          className="library-source-select"
          value={sourceKey}
          onChange={(event) => setSourceKey(event.target.value)}
          aria-label="选择文献来源"
        >
          <option value="public">OpenAlex + Crossref</option>
          {mcpSources.map((source) => (
            <option key={source.key} value={source.key}>{source.label}</option>
          ))}
        </select>
        <button type="submit" className="primary-button compact" disabled={!query.trim() || searching}>
          {searching ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />}
          {searching ? '检索中' : '检索文献'}
        </button>
      </form>
      <div className="library-toolbar">
        <div className="filter-segment">
          {([
            ['all', '全部'],
            ['included', '已纳入'],
            ['verified', '已核验'],
            ['pending', '待核验'],
          ] as const).map(([value, label]) => (
            <button type="button" key={value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
        <span>{records.length} 条记录</span>
      </div>
      <div className="library-body">
        <main className="library-results">
          <LiteratureList records={records} activeProjectId={activeProjectId} onToggle={toggle} onOpen={setSelected} />
        </main>
        <LiteratureDetail record={selected} onClose={() => setSelected(undefined)} onOpen={(url) => paperAgent.external.open(url)} />
      </div>
    </section>
  )
}

function ProviderSettings({
  providers,
  onRefresh,
  onToast,
}: {
  providers: ProviderProfile[]
  onRefresh: () => Promise<void>
  onToast: (message: string, tone?: 'success' | 'error') => void
}) {
  const [selectedId, setSelectedId] = useState<string | 'new'>(providers[0]?.id ?? 'new')
  const selected = providers.find((item) => item.id === selectedId)
  const [form, setForm] = useState({
    name: '',
    protocol: 'openai-compatible' as ProviderProtocol,
    baseUrl: '',
    apiKey: '',
    models: '',
    defaultModel: '',
    enabled: true,
  })
  const [busy, setBusy] = useState<'save' | 'test' | ''>('')

  useEffect(() => {
    setForm(
      selected
        ? {
            name: selected.name,
            protocol: selected.protocol,
            baseUrl: selected.baseUrl,
            apiKey: '',
            models: selected.models.join(', '),
            defaultModel: selected.defaultModel,
            enabled: selected.enabled,
          }
        : {
            name: '',
            protocol: 'openai-compatible',
            baseUrl: '',
            apiKey: '',
            models: '',
            defaultModel: '',
            enabled: true,
          },
    )
  }, [selectedId, selected?.updatedAt])

  const save = async (event?: FormEvent) => {
    event?.preventDefault()
    const models = form.models.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean)
    if (!form.name.trim() || !form.baseUrl.trim() || models.length === 0) return undefined
    setBusy('save')
    try {
      const saved = await paperAgent.provider.save({
        id: selected?.id,
        name: form.name.trim(),
        protocol: form.protocol,
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey || undefined,
        models,
        defaultModel: form.defaultModel.trim() || models[0],
        enabled: form.enabled,
      })
      setSelectedId(saved.id)
      await onRefresh()
      onToast('模型提供商已保存')
      return saved
    } catch (error) {
      onToast(error instanceof Error ? error.message : '保存失败', 'error')
      return undefined
    } finally {
      setBusy('')
    }
  }

  const test = async () => {
    setBusy('test')
    try {
      const saved = selected ?? (await save())
      if (!saved) return
      const result = await paperAgent.provider.test(saved.id)
      await onRefresh()
      onToast(result.message, result.ok ? 'success' : 'error')
    } catch (error) {
      onToast(error instanceof Error ? error.message : '连接测试失败', 'error')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="settings-workbench">
      <aside className="settings-list">
        <div className="settings-list-head">
          <strong>模型提供商</strong>
          <IconButton icon={Plus} label="新增提供商" onClick={() => setSelectedId('new')} />
        </div>
        <button type="button" className={selectedId === 'new' ? 'settings-row is-active' : 'settings-row'} onClick={() => setSelectedId('new')}>
          <span className="settings-row-icon"><Plus size={15} /></span>
          <span><strong>添加提供商</strong><small>OpenAI 兼容或 Anthropic</small></span>
        </button>
        {providers.map((provider) => (
          <button type="button" key={provider.id} className={selectedId === provider.id ? 'settings-row is-active' : 'settings-row'} onClick={() => setSelectedId(provider.id)}>
            <span className="settings-row-icon"><Bot size={15} /></span>
            <span><strong>{provider.name}</strong><small>{provider.defaultModel}</small></span>
            <span className={`connection-dot ${provider.lastHealth === 'connected' ? 'is-connected' : provider.lastHealth === 'failed' ? 'is-failed' : ''}`} />
          </button>
        ))}
      </aside>
      <main className="settings-detail">
        <div className="settings-detail-head">
          <div>
            <h2>{selected ? selected.name : '添加模型提供商'}</h2>
            <p>配置仅保存在本机。API Key 由安装版写入系统安全存储，不会显示在页面或日志中。</p>
          </div>
          {selected && <StatusBadge status={selected.lastHealth ?? 'untested'}>{selected.lastHealth === 'connected' ? '连接正常' : selected.lastHealth === 'failed' ? '连接失败' : '尚未测试'}</StatusBadge>}
        </div>
        <form className="settings-form" onSubmit={save}>
          <label className="field"><span>配置名称</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：OpenAI、DeepSeek 或本地网关" /></label>
          <label className="field">
            <span>接口协议</span>
            <select
              value={form.protocol}
              onChange={(event) => setForm({ ...form, protocol: event.target.value as ProviderProtocol })}
            >
              <option value="openai-compatible">OpenAI 兼容接口</option>
              <option value="anthropic">Anthropic Messages API</option>
            </select>
          </label>
          <label className="field"><span>Base URL</span><input required value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} placeholder="https://api.example.com/v1" spellCheck={false} /></label>
          <label className="field"><span>API Key {selected?.hasCredential && <small>已安全保存，留空则保持不变</small>}</span><div className="input-with-icon"><KeyRound size={16} /><input type="password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder={selected?.hasCredential ? '••••••••••••••••' : '输入 API Key'} autoComplete="new-password" /></div></label>
          <label className="field"><span>模型列表</span><textarea required value={form.models} onChange={(event) => setForm({ ...form, models: event.target.value })} placeholder="gpt-5.4, deepseek-chat" /></label>
          <label className="field"><span>默认模型</span><input value={form.defaultModel} onChange={(event) => setForm({ ...form, defaultModel: event.target.value })} placeholder="留空则使用列表第一项" /></label>
          <label className="switch-row"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /><span><strong>启用此提供商</strong><small>启用后会出现在对话框左下角的模型选择器中</small></span></label>
          <div className="settings-form-actions">
            {selected && (
              <button type="button" className="danger-button" onClick={async () => {
                await paperAgent.provider.delete(selected.id)
                setSelectedId('new')
                await onRefresh()
                onToast('提供商已删除')
              }}><Trash2 size={15} /> 删除</button>
            )}
            <span />
            <button type="button" className="secondary-button" onClick={test} disabled={Boolean(busy)}>{busy === 'test' ? <LoaderCircle size={15} className="spin" /> : <Activity size={15} />} 测试连接</button>
            <button type="submit" className="primary-button compact" disabled={Boolean(busy)}>{busy === 'save' ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />} 保存配置</button>
          </div>
        </form>
      </main>
    </div>
  )
}

function CapabilityOutput({
  result,
}: {
  result: { text?: string; error?: string }
}) {
  const hasError = Boolean(result.error)
  return (
    <div className={`capability-output${hasError ? ' is-error' : ''}`} aria-live="polite">
      <div>
        {hasError ? <CircleAlert size={14} /> : <CircleCheck size={14} />}
        <strong>{hasError ? '调用失败' : '返回结果'}</strong>
      </div>
      <pre>{result.error ?? result.text ?? '没有返回内容'}</pre>
    </div>
  )
}

function McpSettings({
  servers,
  onRefresh,
  onToast,
}: {
  servers: McpServerConfig[]
  onRefresh: () => Promise<void>
  onToast: (message: string, tone?: 'success' | 'error') => void
}) {
  const [selectedId, setSelectedId] = useState<string | 'new'>(servers[0]?.id ?? 'new')
  const selected = servers.find((item) => item.id === selectedId)
  const [form, setForm] = useState({
    name: '',
    type: 'streamable-http' as 'stdio' | 'streamable-http',
    endpoint: '',
    args: '',
    env: '',
    headers: '',
    enabled: true,
  })
  const [busy, setBusy] = useState<'save' | 'test' | ''>('')
  const [activeToolName, setActiveToolName] = useState<string>()
  const [toolArgs, setToolArgs] = useState('{}')
  const [capabilityBusy, setCapabilityBusy] = useState<string>()
  const [capabilityResult, setCapabilityResult] = useState<{
    key: string
    text?: string
    error?: string
  }>()

  useEffect(() => {
    setForm(
      selected
        ? {
            name: selected.name,
            type: selected.transport.type,
            endpoint: selected.transport.type === 'stdio' ? selected.transport.command : selected.transport.url,
            args: selected.transport.type === 'stdio' ? selected.transport.args.join('\n') : '',
            env:
              selected.transport.type === 'stdio'
                ? Object.entries(selected.transport.env ?? {})
                    .map(([key, value]) => `${key}=${value}`)
                    .join('\n')
                : '',
            headers:
              selected.transport.type === 'streamable-http'
                ? Object.entries(selected.transport.headers ?? {})
                    .map(([key, value]) => `${key}: ${value}`)
                    .join('\n')
                : '',
            enabled: selected.enabled,
          }
        : {
            name: '',
            type: 'streamable-http',
            endpoint: '',
            args: '',
            env: '',
            headers: '',
            enabled: true,
          },
    )
    setActiveToolName(undefined)
    setToolArgs('{}')
    setCapabilityResult(undefined)
  }, [selectedId, selected?.updatedAt])

  const formatCapabilityResult = (value: unknown) => {
    if (typeof value === 'string') return value
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  const callTool = async (toolName: string) => {
    if (!selected) return
    let parsed: unknown
    try {
      parsed = JSON.parse(toolArgs)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('参数必须是 JSON 对象')
      }
    } catch (error) {
      setCapabilityResult({
        key: `tool:${toolName}`,
        error: error instanceof Error ? error.message : 'JSON 参数格式无效',
      })
      return
    }
    const key = `tool:${toolName}`
    setCapabilityBusy(key)
    setCapabilityResult(undefined)
    try {
      const result = await paperAgent.mcp.callTool(
        selected.id,
        toolName,
        parsed as Record<string, unknown>,
      )
      setCapabilityResult({ key, text: formatCapabilityResult(result) })
    } catch (error) {
      setCapabilityResult({
        key,
        error: error instanceof Error ? error.message : 'MCP 工具调用失败',
      })
    } finally {
      setCapabilityBusy(undefined)
    }
  }

  const readResource = async (uri: string) => {
    if (!selected) return
    const key = `resource:${uri}`
    setActiveToolName(undefined)
    setCapabilityBusy(key)
    setCapabilityResult(undefined)
    try {
      const result = await paperAgent.mcp.readResource(selected.id, uri)
      setCapabilityResult({ key, text: formatCapabilityResult(result) })
    } catch (error) {
      setCapabilityResult({
        key,
        error: error instanceof Error ? error.message : 'MCP 资源读取失败',
      })
    } finally {
      setCapabilityBusy(undefined)
    }
  }

  const save = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!form.name.trim() || !form.endpoint.trim()) return undefined
    let env: Record<string, string> | undefined
    let headers: Record<string, string> | undefined
    try {
      const parseLines = (value: string, kind: 'env' | 'header') => {
        const output: Record<string, string> = {}
        value.split('\n').forEach((rawLine, index) => {
          const line = rawLine.trim()
          if (!line) return
          const separator = kind === 'env' ? '=' : ':'
          const separatorIndex = line.indexOf(separator)
          if (separatorIndex <= 0) {
            throw new Error(
              kind === 'env'
                ? `环境变量第 ${index + 1} 行格式错误，应为 KEY=VALUE`
                : `请求头第 ${index + 1} 行格式错误，应为 名称: 值`,
            )
          }
          const key = line.slice(0, separatorIndex).trim()
          const itemValue = line.slice(separatorIndex + 1).trim()
          if (!key || !itemValue) {
            throw new Error(
              kind === 'env'
                ? `环境变量第 ${index + 1} 行的名称或值为空`
                : `请求头第 ${index + 1} 行的名称或值为空`,
            )
          }
          output[key] = itemValue
        })
        return Object.keys(output).length > 0 ? output : undefined
      }
      if (form.type === 'stdio') env = parseLines(form.env, 'env')
      else headers = parseLines(form.headers, 'header')
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'MCP 凭证格式错误', 'error')
      return undefined
    }
    setBusy('save')
    try {
      const saved = await paperAgent.mcp.save({
        id: selected?.id,
        name: form.name.trim(),
        enabled: form.enabled,
        transport:
          form.type === 'stdio'
            ? {
                type: 'stdio',
                command: form.endpoint.trim(),
                args: form.args.split('\n').map((item) => item.trim()).filter(Boolean),
                env,
              }
            : { type: 'streamable-http', url: form.endpoint.trim(), headers },
      })
      setSelectedId(saved.id)
      await onRefresh()
      onToast('MCP 服务已保存')
      return saved
    } catch (error) {
      onToast(error instanceof Error ? error.message : '保存失败', 'error')
      return undefined
    } finally {
      setBusy('')
    }
  }

  const test = async () => {
    const saved = await save()
    if (!saved) return
    setBusy('test')
    try {
      const tested = await paperAgent.mcp.test(saved.id)
      await onRefresh()
      const demoSuccess = tested.origin === 'demo' && !tested.lastError
      const ok = tested.verificationStatus === 'verified-metadata' && !tested.lastError
      onToast(
        demoSuccess
          ? '浏览器演示连接成功：未连接真实 MCP 服务，仅展示模拟能力。'
          : ok
            ? `连接成功，发现 ${tested.tools.length} 个工具`
            : tested.lastError || '连接测试未通过',
        demoSuccess || ok ? 'success' : 'error',
      )
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'MCP 连接失败', 'error')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="settings-workbench">
      <aside className="settings-list">
        <div className="settings-list-head"><strong>MCP 服务</strong><IconButton icon={Plus} label="新增 MCP" onClick={() => setSelectedId('new')} /></div>
        <button type="button" className={selectedId === 'new' ? 'settings-row is-active' : 'settings-row'} onClick={() => setSelectedId('new')}><span className="settings-row-icon"><Plus size={15} /></span><span><strong>添加 MCP 服务</strong><small>stdio 或 Streamable HTTP</small></span></button>
        {servers.map((server) => (
          <button type="button" key={server.id} className={selectedId === server.id ? 'settings-row is-active' : 'settings-row'} onClick={() => setSelectedId(server.id)}>
            <span className="settings-row-icon"><PlugZap size={15} /></span><span><strong>{server.name}</strong><small>{server.tools.length} 个工具 · {server.transport.type}</small></span><span className={`connection-dot ${server.status === 'connected' ? 'is-connected' : server.status === 'failed' ? 'is-failed' : ''}`} />
          </button>
        ))}
      </aside>
      <main className="settings-detail">
        <div className="settings-detail-head">
          <div><h2>{selected ? selected.name : '添加 MCP 服务'}</h2><p>连接低门槛文献门户或其他标准 MCP 服务。敏感环境变量不会在界面中回显。</p></div>
          {selected && <StatusBadge status={selected.status}>{selected.status === 'connected' ? '已连接' : selected.status === 'failed' ? '连接失败' : '未连接'}</StatusBadge>}
        </div>
        <form className="settings-form" onSubmit={save}>
          <label className="field"><span>服务名称</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：公开文献检索" /></label>
          <label className="field"><span>传输方式</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as 'stdio' | 'streamable-http' })}><option value="streamable-http">Streamable HTTP</option><option value="stdio">stdio（本机进程）</option></select></label>
          <label className="field"><span>{form.type === 'stdio' ? '命令' : '服务 URL'}</span><input required value={form.endpoint} onChange={(event) => setForm({ ...form, endpoint: event.target.value })} placeholder={form.type === 'stdio' ? '例如：npx' : 'https://example.com/mcp'} spellCheck={false} /></label>
          {form.type === 'stdio' && <label className="field"><span>参数 <small>每行一项</small></span><textarea value={form.args} onChange={(event) => setForm({ ...form, args: event.target.value })} placeholder={'-y\n@scope/literature-mcp'} /></label>}
          {form.type === 'stdio' ? (
            <label className="field">
              <span>环境变量 <small>每行 KEY=VALUE</small></span>
              <textarea
                value={form.env}
                onChange={(event) => setForm({ ...form, env: event.target.value })}
                placeholder={'SEMANTIC_SCHOLAR_API_KEY=••••••••\nLOG_LEVEL=info'}
                spellCheck={false}
              />
            </label>
          ) : (
            <label className="field">
              <span>请求头 <small>每行 名称: 值</small></span>
              <textarea
                value={form.headers}
                onChange={(event) => setForm({ ...form, headers: event.target.value })}
                placeholder={'Authorization: Bearer ••••••••\nX-Workspace: research'}
                spellCheck={false}
              />
            </label>
          )}
          <div className="credential-note">
            <ShieldCheck size={15} />
            <span>敏感环境变量和请求头由安装版写入系统安全存储；再次编辑时仅回显掩码值。</span>
          </div>
          <label className="switch-row"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /><span><strong>启用此服务</strong><small>Agent 只会调用已启用且连接正常的服务</small></span></label>
          {selected && (selected.tools.length > 0 || selected.resources.length > 0) && (
            <section className="capability-list">
              {selected.tools.length > 0 && (
                <>
                  <h3>可用工具</h3>
                  {selected.tools.map((tool) => {
                    const key = `tool:${tool.name}`
                    const isOpen = activeToolName === tool.name
                    return (
                      <div className="capability-item" key={tool.name}>
                        <span className="capability-icon"><PlugZap size={14} /></span>
                        <p><strong>{tool.name}</strong><small>{tool.description || '未提供描述'}</small></p>
                        <button
                          type="button"
                          className="capability-action"
                          onClick={() => {
                            setActiveToolName(isOpen ? undefined : tool.name)
                            setToolArgs('{}')
                            setCapabilityResult(undefined)
                          }}
                        >
                          {isOpen ? '收起' : '调用'}
                        </button>
                        {isOpen && (
                          <div className="capability-runner">
                            <label>
                              <span>JSON 参数</span>
                              <textarea
                                value={toolArgs}
                                onChange={(event) => setToolArgs(event.target.value)}
                                spellCheck={false}
                                aria-label={`${tool.name} 的 JSON 参数`}
                              />
                            </label>
                            <div className="capability-runner-actions">
                              <small>参数必须是 JSON 对象</small>
                              <button
                                type="button"
                                className="primary-button compact"
                                onClick={() => callTool(tool.name)}
                                disabled={Boolean(capabilityBusy)}
                              >
                                {capabilityBusy === key ? <LoaderCircle size={14} className="spin" /> : <PlugZap size={14} />}
                                执行工具
                              </button>
                            </div>
                            {capabilityResult?.key === key && (
                              <CapabilityOutput result={capabilityResult} />
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </>
              )}
              {selected.resources.length > 0 && (
                <>
                  <h3 className="capability-subheading">可用资源</h3>
                  {selected.resources.map((resource) => {
                    const key = `resource:${resource.uri}`
                    return (
                      <div className="capability-item" key={resource.uri}>
                        <span className="capability-icon"><Database size={14} /></span>
                        <p><strong>{resource.name}</strong><small>{resource.description || resource.uri}</small></p>
                        <button
                          type="button"
                          className="capability-action"
                          onClick={() => readResource(resource.uri)}
                          disabled={Boolean(capabilityBusy)}
                        >
                          {capabilityBusy === key ? <LoaderCircle size={14} className="spin" /> : null}
                          读取
                        </button>
                        {capabilityResult?.key === key && (
                          <div className="capability-inline-output">
                            <CapabilityOutput result={capabilityResult} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </>
              )}
            </section>
          )}
          <div className="settings-form-actions">
            {selected && <button type="button" className="danger-button" onClick={async () => { await paperAgent.mcp.delete(selected.id); setSelectedId('new'); await onRefresh(); onToast('MCP 服务已删除') }}><Trash2 size={15} /> 删除</button>}
            <span />
            <button type="button" className="secondary-button" onClick={test} disabled={Boolean(busy)}>{busy === 'test' ? <LoaderCircle size={15} className="spin" /> : <Activity size={15} />} 测试连接</button>
            <button type="submit" className="primary-button compact" disabled={Boolean(busy)}>{busy === 'save' ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />} 保存服务</button>
          </div>
        </form>
      </main>
    </div>
  )
}

function SettingsPage({
  workspace,
  onRefresh,
  onToast,
}: {
  workspace: WorkspaceState
  onRefresh: () => Promise<void>
  onToast: (message: string, tone?: 'success' | 'error') => void
}) {
  const [tab, setTab] = useState<SettingsTab>('providers')
  return (
    <section className="route-page settings-page">
      <header className="route-header settings-route-header">
        <div><span className="route-kicker">应用设置</span><h1>模型、工具与本地数据</h1><p>所有服务都由你主动配置；论文项目和过程数据默认保存在本机。</p></div>
      </header>
      <nav className="settings-tabs">
        <button type="button" className={tab === 'providers' ? 'is-active' : ''} onClick={() => setTab('providers')}><Bot size={16} /> 模型提供商</button>
        <button type="button" className={tab === 'mcp' ? 'is-active' : ''} onClick={() => setTab('mcp')}><PlugZap size={16} /> MCP 服务</button>
        <button type="button" className={tab === 'local' ? 'is-active' : ''} onClick={() => setTab('local')}><Database size={16} /> 本地数据</button>
      </nav>
      {tab === 'providers' && <ProviderSettings providers={workspace.providers} onRefresh={onRefresh} onToast={onToast} />}
      {tab === 'mcp' && <McpSettings servers={workspace.mcpServers} onRefresh={onRefresh} onToast={onToast} />}
      {tab === 'local' && (
        <div className="local-settings">
          <div className="local-setting-row"><span className="settings-row-icon"><Database size={17} /></span><div><strong>本机优先存储</strong><p>项目、对话、文稿和检索记录默认保存在当前 Mac，不自动上传到学术 Agent 服务器。</p></div><StatusBadge status="connected">已启用</StatusBadge></div>
          <div className="local-setting-row"><span className="settings-row-icon"><ShieldCheck size={17} /></span><div><strong>凭证安全存储</strong><p>安装版使用 macOS 系统安全存储保存 API Key；界面只显示是否已配置。</p></div><StatusBadge status={isNativeBridge ? 'connected' : 'demo'}>{isNativeBridge ? '系统安全存储' : '浏览器演示'}</StatusBadge></div>
          <div className="local-setting-row"><span className="settings-row-icon"><FolderOpen size={17} /></span><div><strong>项目数据</strong><p>{workspace.projects.length} 个项目 · {workspace.literature.length} 条文献记录 · {workspace.artifacts.length} 个导出产物</p></div></div>
        </div>
      )}
    </section>
  )
}

export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(emptyWorkspace)
  const [loading, setLoading] = useState(true)
  const [route, setRoute] = useState<Route>('workspace')
  const [centerMode, setCenterMode] = useState<CenterMode>('chat')
  const [rightTab, setRightTab] = useState<RightTab>('literature')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [rightOpen, setRightOpen] = useState(true)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const [projectPendingDeletionId, setProjectPendingDeletionId] = useState<string>()
  const [deletingProject, setDeletingProject] = useState(false)
  const [choosingFolder, setChoosingFolder] = useState(false)
  const [activeProviderId, setActiveProviderId] = useState<string>()
  const [activeModel, setActiveModel] = useState<string>()
  const [activeRunId, setActiveRunId] = useState<string>()
  const [selectedSectionId, setSelectedSectionId] = useState<string>()
  const [selectedLiterature, setSelectedLiterature] = useState<LiteratureRecord>()
  const [editingSection, setEditingSection] = useState(false)
  const [sectionDraft, setSectionDraft] = useState('')
  const [savingSection, setSavingSection] = useState(false)
  const [generatingOutline, setGeneratingOutline] = useState(false)
  const [exporting, setExporting] = useState<'md' | 'docx'>()
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' }>()

  const refreshWorkspace = async () => {
    const next = await paperAgent.workspace.get()
    setWorkspace(next)
  }

  useEffect(() => {
    refreshWorkspace()
      .catch(() => setToast({ message: '无法读取本机工作区', tone: 'error' }))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(undefined), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const dispose = paperAgent.chat.onEvent((event) => {
      setWorkspace((current) => {
        const next = structuredClone(current)
        if (event.type === 'started') {
          if (!next.messages.some((message) => message.id === event.message.id)) next.messages.push(event.message)
        } else if (event.type === 'text-delta') {
          const message = next.messages.find((item) => item.runId === event.runId)
          if (message) message.content += event.delta
        } else if (event.type === 'completed' || event.type === 'cancelled') {
          const index = next.messages.findIndex((item) => item.runId === event.runId)
          if (index >= 0) next.messages[index] = event.message
          else next.messages.push(event.message)
        }
        return next
      })
      if (event.type === 'completed' || event.type === 'cancelled' || event.type === 'error') {
        setActiveRunId(undefined)
        refreshWorkspace().catch(() => undefined)
      }
      if (event.type === 'error') setToast({ message: event.message, tone: 'error' })
    })
    return dispose
  }, [])

  useEffect(() => {
    const available = workspace.providers.filter(
      (item) => item.enabled && (item.lastHealth === 'connected' || item.origin === 'demo'),
    )
    const provider =
      available.find((item) => item.id === workspace.settings.activeProviderId) ??
      available.find((item) => item.origin !== 'demo') ??
      available[0]
    const persistedModel =
      provider?.id === workspace.settings.activeProviderId &&
      workspace.settings.activeModel &&
      provider.models.includes(workspace.settings.activeModel)
        ? workspace.settings.activeModel
        : undefined
    const fallbackModel = provider?.models.includes(provider.defaultModel)
      ? provider.defaultModel
      : provider?.models[0]
    setActiveProviderId(provider?.id)
    setActiveModel(persistedModel ?? fallbackModel)
  }, [workspace.providers, workspace.settings.activeProviderId, workspace.settings.activeModel])

  const activeProject = workspace.projects.find((item) => item.id === workspace.settings.activeProjectId) ?? workspace.projects[0]
  const conversation = workspace.conversations.find((item) => item.id === activeProject?.activeConversationId)
  const messages = workspace.messages
    .filter((item) => item.conversationId === conversation?.id && ['user', 'assistant'].includes(item.role))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const projectLiterature = workspace.literature.filter((item) => item.projectId === activeProject?.id || item.included)
  const outline = activeProject ? workspace.outlines[activeProject.id] ?? [] : []
  const sections = workspace.sections.filter((item) => item.projectId === activeProject?.id)
  const selectedSection = sections.find((item) => item.id === selectedSectionId) ?? sections.find((item) => item.id === activeProject?.activeSectionId) ?? sections[0]
  const activeRun = workspace.runs.filter((item) => item.projectId === activeProject?.id).at(-1)
  const artifacts = workspace.artifacts.filter((item) => item.projectId === activeProject?.id)
  const projectPendingDeletion = workspace.projects.find((item) => item.id === projectPendingDeletionId)

  useEffect(() => {
    if (selectedSection && selectedSection.id !== selectedSectionId) setSelectedSectionId(selectedSection.id)
  }, [selectedSection?.id])

  useEffect(() => {
    setSectionDraft(selectedSection?.content ?? '')
    setEditingSection(false)
  }, [selectedSection?.id])

  const showToast = (message: string, tone: 'success' | 'error' = 'success') => setToast({ message, tone })

  const selectProject = async (projectId: string) => {
    try {
      const next = await paperAgent.project.setActive(projectId)
      setWorkspace(next)
      setRoute('workspace')
      setCenterMode('chat')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '切换项目失败', 'error')
    }
  }

  const createProject = async (brief: ResearchBrief) => {
    setCreatingProject(true)
    try {
      const project = await paperAgent.project.create(brief)
      await paperAgent.project.setActive(project.id)
      await refreshWorkspace()
      setNewProjectOpen(false)
      setRoute('workspace')
      setCenterMode('chat')
      showToast('研究项目已创建')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建项目失败', 'error')
    } finally {
      setCreatingProject(false)
    }
  }

  const chooseResearchFolder = async () => {
    const previousPath = workspace.settings.researchRootPath
    setChoosingFolder(true)
    try {
      const next = await paperAgent.project.chooseFolder()
      setWorkspace(next)
      if (next.settings.researchRootPath && next.settings.researchRootPath !== previousPath) {
        showToast('默认研究文件夹已更新；后续新建研究将保存到该目录')
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '选择研究文件夹失败', 'error')
    } finally {
      setChoosingFolder(false)
    }
  }

  const deleteProject = async () => {
    if (!projectPendingDeletionId) return
    setDeletingProject(true)
    try {
      const next = await paperAgent.project.delete(projectPendingDeletionId)
      setWorkspace(next)
      setProjectPendingDeletionId(undefined)
      setSelectedSectionId(undefined)
      setSelectedLiterature(undefined)
      setSectionDraft('')
      setEditingSection(false)
      setRoute('workspace')
      setCenterMode('chat')
      showToast('研究项目已删除')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除项目失败', 'error')
    } finally {
      setDeletingProject(false)
    }
  }

  const selectModel = async (providerId: string, model: string) => {
    const previousProviderId = activeProviderId
    const previousModel = activeModel
    setActiveProviderId(providerId)
    setActiveModel(model)
    try {
      const next = await paperAgent.workspace.setActiveModel(providerId, model)
      setWorkspace(next)
    } catch (error) {
      setActiveProviderId(previousProviderId)
      setActiveModel(previousModel)
      showToast(error instanceof Error ? error.message : '切换模型失败', 'error')
    }
  }

  const selectSection = async (section: ManuscriptSection) => {
    const previousSectionId = selectedSection?.id
    setSelectedSectionId(section.id)
    setCenterMode('manuscript')
    try {
      const next = await paperAgent.section.setActive(section.id)
      setWorkspace(next)
    } catch (error) {
      setSelectedSectionId(previousSectionId)
      showToast(error instanceof Error ? error.message : '切换章节失败', 'error')
    }
  }

  const sendMessage = async (content: string) => {
    if (!activeProject || !conversation || !activeProviderId || !activeModel) return
    const activeProvider = workspace.providers.find((item) => item.id === activeProviderId)
    const usesDemoProvider = activeProvider?.origin === 'demo'
    const optimistic: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      projectId: activeProject.id,
      conversationId: conversation.id,
      role: 'user',
      content,
      status: 'completed',
      providerId: activeProviderId,
      model: activeModel,
      contextScope: centerMode === 'manuscript' ? 'section' : 'project',
      origin: usesDemoProvider ? 'demo' : 'live',
      verificationStatus: usesDemoProvider ? 'demo' : 'unverified',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setWorkspace((current) => ({ ...current, messages: [...current.messages, optimistic] }))
    try {
      const result = await paperAgent.chat.start({
        projectId: activeProject.id,
        conversationId: conversation.id,
        content,
        providerId: activeProviderId,
        model: activeModel,
        contextScope: centerMode === 'manuscript' ? 'section' : 'project',
      })
      setActiveRunId(result.runId)
      const persisted = await paperAgent.workspace.get()
      setWorkspace((current) => {
        const streamed = current.messages.find((item) => item.runId === result.runId)
        if (streamed) {
          const index = persisted.messages.findIndex((item) => item.runId === result.runId)
          if (index >= 0 && streamed.content.length > persisted.messages[index].content.length) {
            persisted.messages[index] = streamed
          }
        }
        return persisted
      })
    } catch (error) {
      setWorkspace((current) => ({ ...current, messages: current.messages.filter((item) => item.id !== optimistic.id) }))
      showToast(error instanceof Error ? error.message : '无法开始生成', 'error')
    }
  }

  const cancelRun = async () => {
    if (!activeRunId) return
    try {
      await paperAgent.chat.cancel(activeRunId)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '停止失败', 'error')
    }
  }

  const toggleLiterature = async (record: LiteratureRecord) => {
    if (!activeProject) return
    try {
      await paperAgent.literature.toggle(activeProject.id, record.id, !record.included)
      await refreshWorkspace()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '更新文献失败', 'error')
    }
  }

  const saveSection = async () => {
    if (!selectedSection) return
    setSavingSection(true)
    try {
      await paperAgent.section.save(selectedSection.id, sectionDraft)
      await refreshWorkspace()
      setEditingSection(false)
      showToast('章节已保存')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存章节失败', 'error')
    } finally {
      setSavingSection(false)
    }
  }

  const generateSection = async () => {
    if (!activeProject || !selectedSection || !activeProviderId || !activeModel) return
    try {
      await paperAgent.section.generate({ projectId: activeProject.id, sectionId: selectedSection.id, providerId: activeProviderId, model: activeModel })
      await refreshWorkspace()
      showToast('章节草稿已生成')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '章节生成失败', 'error')
    }
  }

  const generateOutline = async () => {
    if (!activeProject) return
    if (!activeProviderId || !activeModel) {
      showToast('请先配置并选择可用模型', 'error')
      return
    }
    setGeneratingOutline(true)
    try {
      const generated = await paperAgent.outline.generate({
        projectId: activeProject.id,
        providerId: activeProviderId,
        model: activeModel,
      })
      let next = await paperAgent.workspace.get()
      const firstSection = next.sections.find(
        (section) => section.projectId === activeProject.id,
      )
      if (firstSection) {
        next = await paperAgent.section.setActive(firstSection.id)
        setSelectedSectionId(firstSection.id)
      }
      setWorkspace(next)
      setCenterMode('manuscript')
      setRightTab('drafts')
      setRightOpen(true)
      showToast(`三级大纲已生成，共 ${generated.length} 个一级章节`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '大纲生成失败', 'error')
    } finally {
      setGeneratingOutline(false)
    }
  }

  const exportProject = async (format: 'md' | 'docx') => {
    if (!activeProject) return
    setExporting(format)
    try {
      const artifact = await paperAgent.export.project(activeProject.id, format)
      await refreshWorkspace()
      showToast(artifact ? `${artifact.name} 已生成` : workspace.settings.demoMode ? '浏览器演示文件已下载' : '导出已取消')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出失败', 'error')
    } finally {
      setExporting(undefined)
    }
  }

  if (loading) {
    return (
      <main className="loading-screen">
        <img className="loading-logo" src={appIconUrl} alt="学术 Agent" />
        <strong>正在打开学术 Agent</strong>
        <span>读取本机项目与配置…</span>
      </main>
    )
  }

  return (
    <main className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}${rightOpen ? '' : ' right-collapsed'}`}>
      <Sidebar
        workspace={workspace}
        activeProjectId={activeProject?.id}
        route={route}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((current) => !current)}
        onRoute={setRoute}
        onProject={selectProject}
        onCreate={() => setNewProjectOpen(true)}
        onChooseFolder={chooseResearchFolder}
        onDeleteProject={setProjectPendingDeletionId}
        choosingFolder={choosingFolder}
      />

      {route === 'workspace' && (
        <>
          <section className="center-workspace">
            <header className="workspace-header window-drag-region">
              <div className="workspace-title no-drag">
                <span>{activeProject ? `项目 · ${projectStatusLabels[activeProject.status] ?? activeProject.status}` : '研究工作台'}</span>
                <strong>{activeProject?.title ?? '尚未创建研究项目'}</strong>
              </div>
              <div className="workspace-header-actions no-drag">
                {activeProject && (
                  <div className="view-switcher">
                    <button type="button" className={centerMode === 'chat' ? 'is-active' : ''} onClick={() => setCenterMode('chat')}><MessageSquareText size={15} /> 对话</button>
                    <button type="button" className={centerMode === 'manuscript' ? 'is-active' : ''} onClick={() => setCenterMode('manuscript')}><FileText size={15} /> 文稿</button>
                  </div>
                )}
                <div className="export-actions" role="group" aria-label="导出文稿">
                  <button
                    type="button"
                    className="export-action-button"
                    disabled={!activeProject || Boolean(exporting)}
                    onClick={() => exportProject('md')}
                    aria-label="导出 Markdown"
                    title="导出 Markdown"
                    aria-busy={exporting === 'md'}
                  >
                    {exporting === 'md' ? <LoaderCircle size={15} className="spin" /> : <FileText size={15} />}
                  </button>
                  <button
                    type="button"
                    className="export-action-button"
                    disabled={!activeProject || Boolean(exporting)}
                    onClick={() => exportProject('docx')}
                    aria-label="导出 Word"
                    title="导出 Word"
                    aria-busy={exporting === 'docx'}
                  >
                    {exporting === 'docx' ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}
                  </button>
                </div>
                <IconButton className="header-panel-toggle" icon={rightOpen ? PanelRightClose : PanelRightOpen} label={rightOpen ? '收起研究工作台' : '展开研究工作台'} onClick={() => setRightOpen((current) => !current)} />
              </div>
            </header>

            {!activeProject ? (
              <div className="welcome-state">
                <img className="welcome-symbol" src={appIconUrl} alt="" />
                <h1>把检索、写作与引用核验放进同一个项目</h1>
                <p>创建研究项目后，Agent 会按阶段保留文献、论文大纲、章节和对话上下文。</p>
                <button type="button" className="primary-button" onClick={() => setNewProjectOpen(true)}><Plus size={16} /> 新建研究项目</button>
              </div>
            ) : (
              <div className="center-body">
                <div className="center-scroll">
                  {centerMode === 'chat' ? (
                    <ChatView messages={messages} projectTitle={activeProject.title} onShowLiterature={() => { setRightTab('literature'); setRightOpen(true) }} />
                  ) : (
                    <ManuscriptView
                      section={selectedSection}
                      canGenerateOutline={Boolean(activeProviderId && activeModel)}
                      generatingOutline={generatingOutline}
                      isEditing={editingSection}
                      draft={sectionDraft}
                      saving={savingSection}
                      onDraft={setSectionDraft}
                      onEdit={() => setEditingSection(true)}
                      onSave={saveSection}
                      onGenerate={generateSection}
                      onGenerateOutline={generateOutline}
                      onConfigureModel={() => setRoute('settings')}
                    />
                  )}
                </div>
                <Composer
                  providers={workspace.providers}
                  activeProviderId={activeProviderId}
                  activeModel={activeModel}
                  running={Boolean(activeRunId)}
                  contextLabel={centerMode === 'manuscript' ? '当前章节上下文' : '项目上下文'}
                  onSelectModel={selectModel}
                  onSend={sendMessage}
                  onCancel={cancelRun}
                  onSettings={() => setRoute('settings')}
                />
              </div>
            )}
          </section>

          {rightOpen && activeProject && (
            <RightWorkspace
              tab={rightTab}
              onTab={setRightTab}
              literature={projectLiterature}
              outline={outline}
              sections={sections}
              selectedSectionId={selectedSection?.id}
              runSteps={activeRun?.steps ?? []}
              artifacts={artifacts}
              activeProjectId={activeProject.id}
              onToggleLiterature={toggleLiterature}
              onOpenLiterature={(record) => { setSelectedLiterature(record); setRoute('library') }}
              onSelectSection={selectSection}
              onReveal={(path) => paperAgent.export.reveal(path)}
              canGenerateOutline={Boolean(activeProviderId && activeModel)}
              generatingOutline={generatingOutline}
              onGenerateOutline={generateOutline}
              onConfigureModel={() => setRoute('settings')}
              onRefresh={() => {
                refreshWorkspace().catch((error) => {
                  showToast(error instanceof Error ? error.message : '刷新工作台失败', 'error')
                })
              }}
              onCloseDrawer={() => setRightOpen(false)}
            />
          )}
        </>
      )}

      {route === 'library' && (
        <div className="full-route-column">
          <div className="route-titlebar window-drag-region">
            <span>学术 Agent · 文献库</span>
            <div className="no-drag"><IconButton icon={PanelLeftClose} label="切换侧栏" onClick={() => setSidebarCollapsed((current) => !current)} /></div>
          </div>
          <LibraryPage workspace={workspace} activeProjectId={activeProject?.id} initialSelected={selectedLiterature} onRefresh={refreshWorkspace} onToast={showToast} />
        </div>
      )}

      {route === 'settings' && (
        <div className="full-route-column">
          <div className="route-titlebar window-drag-region"><span>学术 Agent · 设置</span></div>
          <SettingsPage workspace={workspace} onRefresh={refreshWorkspace} onToast={showToast} />
        </div>
      )}

      <NewProjectDialog open={newProjectOpen} busy={creatingProject} onClose={() => setNewProjectOpen(false)} onCreate={createProject} />
      <DeleteProjectDialog
        project={projectPendingDeletion}
        busy={deletingProject}
        onClose={() => !deletingProject && setProjectPendingDeletionId(undefined)}
        onConfirm={deleteProject}
      />
      {toast && (
        <div className={`toast toast-${toast.tone}`} role="status">
          {toast.tone === 'success' ? <CircleCheck size={17} /> : <CircleAlert size={17} />}
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(undefined)} aria-label="关闭提示"><X size={15} /></button>
        </div>
      )}
      {(workspace.settings.demoMode || !isNativeBridge) && (
        <div className="demo-indicator" title="当前数据用于界面演示，不可用于正式引用">
          <CircleAlert size={13} /> {isNativeBridge ? '演示项目' : '浏览器演示'} · 数据不可引用
        </div>
      )}
    </main>
  )
}
