import {
  Activity,
  ArrowUp,
  Archive,
  ArchiveRestore,
  BookOpen,
  Bot,
  BrainCircuit,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Clock3,
  Copy,
  Command,
  Database,
  Download,
  ExternalLink,
  FilePenLine,
  FileText,
  Files,
  Folder,
  FolderInput,
  FolderOpen,
  GripVertical,
  GitBranch,
  KeyRound,
  Library,
  ListChecks,
  ListTree,
  Lightbulb,
  LayoutList,
  LoaderCircle,
  MessageSquareText,
  MessageSquarePlus,
  Mail,
  MailOpen,
  Mic,
  Monitor,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  PencilLine,
  Pin,
  PinOff,
  PlugZap,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Target,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  FormEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type {
  AgentStep,
  AppearanceSettings,
  AppearanceSettingsInput,
  ChatContextReference,
  ChatMessage,
  Conversation,
  ConversationAccessMode,
  ConversationAttachment,
  ConversationUpdateInput,
  LiteratureRecord,
  McpServerConfig,
  ManuscriptSection,
  OutlineNode,
  ProviderProtocol,
  ProviderProfile,
  ResearchBrief,
  SidebarPreferencesInput,
  SkillDefinition,
  SkillInput,
  SystemPermissionKind,
  SystemPermissionSnapshot,
  WorkspaceState,
} from '../shared/contracts'
import { DEFAULT_APPEARANCE_SETTINGS, SKILL_LIMITS } from '../shared/contracts'
import {
  DEFAULT_ARXIV_MCP_SERVER_ID,
  DEFAULT_ARXIV_MCP_TOOL_NAME,
} from '../shared/defaultMcp'
import { isNativeBridge, paperAgent } from './fallback'
import { AppearanceSettingsPage } from './AppearanceSettingsPage'
import { OutlineTree } from './OutlineTree'

type Route = 'workspace' | 'library' | 'skills' | 'settings'
type CenterMode = 'chat' | 'manuscript'
type RightTab = 'literature' | 'drafts' | 'process'
type SettingsTab = 'providers' | 'mcp' | 'local'
type SettingsSection =
  | 'general'
  | 'appearance'
  | 'voice'
  | 'configuration'
  | 'personalization'
  | 'shortcuts'
  | 'app-snapshot'
  | 'browser'
  | 'computer-control'
  | 'hooks'
  | 'connections'
  | 'git'
  | 'environment'
  | 'worktrees'
  | 'archived'

const appIconUrl = new URL('../build/icon.png', import.meta.url).href
const darkDockIconUrl = new URL('../build/dock-icon-dark.png', import.meta.url).href

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
  attachments: [],
  messages: [],
  providers: [],
  literature: [],
  outlines: {},
  sections: [],
  citations: [],
  runs: [],
  mcpServers: [],
  skills: [],
  artifacts: [],
  settings: { appearance: DEFAULT_APPEARANCE_SETTINGS, demoMode: false },
}

const appearanceFontFamilies: Record<AppearanceSettings['uiFont'], string> = {
  system: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif',
  inter: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
  serif: '"New York", "Songti SC", "STSong", serif',
  monospace: '"SFMono-Regular", "SF Mono", Menlo, Monaco, monospace',
}

function appearanceVariables(appearance: AppearanceSettings, prefersDark: boolean): CSSProperties {
  const effectiveTheme = appearance.theme === 'system' ? (prefersDark ? 'dark' : 'light') : appearance.theme
  const palette = appearance.palettes[effectiveTheme]
  const contrastRatio = appearance.contrast / 100
  const surfaceMix = 2 + contrastRatio * 4
  const strongMix = 5 + contrastRatio * 7
  const hoverMix = 8 + contrastRatio * 9
  const borderMix = 12 + contrastRatio * 16
  return {
    '--background': palette.background,
    '--text': palette.foreground,
    '--brand': palette.accent,
    '--surface': `color-mix(in srgb, ${palette.background} ${100 - surfaceMix}%, ${palette.foreground})`,
    '--surface-strong': `color-mix(in srgb, ${palette.background} ${100 - strongMix}%, ${palette.foreground})`,
    '--surface-hover': `color-mix(in srgb, ${palette.background} ${100 - hoverMix}%, ${palette.foreground})`,
    '--border': `color-mix(in srgb, ${palette.background} ${100 - borderMix}%, ${palette.foreground})`,
    '--border-strong': `color-mix(in srgb, ${palette.background} ${Math.max(45, 74 - contrastRatio * 24)}%, ${palette.foreground})`,
    '--ui-font-family': appearanceFontFamilies[appearance.uiFont],
    '--ui-font-scale': appearance.uiFontSize / 14,
    '--appearance-contrast': appearance.contrast,
  } as CSSProperties
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

type ManuscriptDiffLine = { kind: 'same' | 'added' | 'removed'; text: string }

/** 编辑时生成有界的逐行差异，避免大稿件让渲染线程承担无上限计算。 */
function buildManuscriptDiff(original: string, next: string): ManuscriptDiffLine[] {
  const left = original.split('\n').slice(0, 240)
  const right = next.split('\n').slice(0, 240)
  const table = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1))
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const lines: ManuscriptDiffLine[] = []
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      lines.push({ kind: 'same', text: left[i] })
      i += 1
      j += 1
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      lines.push({ kind: 'removed', text: left[i++] })
    } else {
      lines.push({ kind: 'added', text: right[j++] })
    }
  }
  while (i < left.length) lines.push({ kind: 'removed', text: left[i++] })
  while (j < right.length) lines.push({ kind: 'added', text: right[j++] })
  return lines
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

function conversationDisplayTitle(title: string, projectTitle: string): string {
  return ['新的研究任务', projectTitle].includes(title) ? '研究对话' : title
}

function moveIdBefore(ids: string[], draggedId: string, targetId: string): string[] {
  if (draggedId === targetId) return ids
  const next = ids.filter((id) => id !== draggedId)
  const index = next.indexOf(targetId)
  next.splice(index < 0 ? next.length : index, 0, draggedId)
  return next
}

interface ConversationMenuState {
  projectId: string
  conversationId: string
  x: number
  y: number
}

const DEFAULT_SIDEBAR_WIDTH = 280
const DEFAULT_RIGHT_PANEL_WIDTH = 380
const MIN_SIDEBAR_WIDTH = 240
const MAX_SIDEBAR_WIDTH = 520

interface SettingsNavigationItem {
  id: SettingsSection
  label: string
  keywords: string
  icon: LucideIcon
}

const settingsNavigationGroups: Array<{ label: string; items: SettingsNavigationItem[] }> = [
  {
    label: '个人',
    items: [
      { id: 'general', label: '常规', keywords: '权限 文件夹 语言 本机', icon: Settings },
      { id: 'appearance', label: '外观', keywords: '主题 浅色 深色 界面', icon: Sparkles },
      { id: 'voice', label: '语音输入', keywords: '麦克风 语音 听写', icon: Mic },
      { id: 'configuration', label: '配置', keywords: '模型 提供商 API MCP 本地数据', icon: SlidersHorizontal },
      { id: 'personalization', label: '个性化', keywords: 'Skills 写作习惯 指令', icon: Bot },
      { id: 'shortcuts', label: '键盘快捷键', keywords: '快捷键 Command 键盘', icon: Command },
    ],
  },
  {
    label: '集成',
    items: [
      { id: 'app-snapshot', label: '应用快照', keywords: '双 Command 截图 快照', icon: Camera },
      { id: 'browser', label: '浏览器', keywords: '网页 浏览器 控制', icon: ExternalLink },
      { id: 'computer-control', label: '电脑控制', keywords: '桌面 电脑 辅助功能', icon: Monitor },
    ],
  },
  {
    label: '编码',
    items: [
      { id: 'hooks', label: '钩子', keywords: 'Hooks 自动化', icon: PlugZap },
      { id: 'connections', label: '连接', keywords: '远程 服务 连接', icon: ExternalLink },
      { id: 'git', label: 'Git', keywords: '仓库 版本 分支', icon: GitBranch },
      { id: 'environment', label: '环境', keywords: '环境变量 运行环境', icon: Database },
      { id: 'worktrees', label: 'Worktrees', keywords: '工作树 分支 目录', icon: FolderOpen },
    ],
  },
  {
    label: '已归档',
    items: [
      { id: 'archived', label: '已归档的对话', keywords: '恢复 聊天 对话 归档', icon: Archive },
    ],
  },
]

function SettingsSidebar({
  activeSection,
  onSection,
  onBack,
  sidebarWidth,
  onSidebarWidthChange,
  onSidebarWidthCommit,
}: {
  activeSection: SettingsSection
  onSection: (section: SettingsSection) => void
  onBack: () => void
  sidebarWidth: number
  onSidebarWidthChange: (width: number) => void
  onSidebarWidthCommit: (width: number) => void
}) {
  const [query, setQuery] = useState('')
  const resizeStateRef = useRef<{ pointerId: number; startX: number; startWidth: number } | undefined>(undefined)
  const latestWidthRef = useRef(sidebarWidth)
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const visibleGroups = settingsNavigationGroups
    .map((group) => ({
      ...group,
      items: normalizedQuery
        ? group.items.filter((item) => `${item.label} ${item.keywords}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
        : group.items,
    }))
    .filter((group) => group.items.length > 0)

  useEffect(() => {
    latestWidthRef.current = sidebarWidth
  }, [sidebarWidth])

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    resizeStateRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: sidebarWidth }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const moveResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = resizeStateRef.current
    if (!state || state.pointerId !== event.pointerId) return
    const next = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, state.startWidth + event.clientX - state.startX))
    latestWidthRef.current = Math.round(next)
    onSidebarWidthChange(latestWidthRef.current)
  }

  const finishResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = resizeStateRef.current
    if (!state || state.pointerId !== event.pointerId) return
    resizeStateRef.current = undefined
    event.currentTarget.releasePointerCapture(event.pointerId)
    onSidebarWidthCommit(latestWidthRef.current)
  }

  return (
    <aside className="settings-sidebar" aria-label="设置导航">
      <div className="settings-sidebar-titlebar window-drag-region">
        <button type="button" className="settings-back-button no-drag" onClick={onBack}>
          <ChevronLeft size={15} aria-hidden="true" />
          <span>返回应用</span>
        </button>
      </div>
      <div className="settings-sidebar-body">
        <label className="settings-search">
          <Search size={15} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索设置…" aria-label="搜索设置" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="清空搜索"><X size={14} /></button>}
        </label>
        <nav className="settings-navigation">
          {visibleGroups.map((group) => (
            <section key={group.label} className="settings-navigation-group">
              <h2>{group.label}</h2>
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={activeSection === item.id ? 'is-active' : ''}
                    onClick={() => onSection(item.id)}
                    aria-current={activeSection === item.id ? 'page' : undefined}
                  >
                    <Icon size={15} aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </section>
          ))}
          {visibleGroups.length === 0 && <p className="settings-search-empty">没有匹配的设置</p>}
        </nav>
      </div>
      <div
        className="sidebar-resizer"
        role="separator"
        aria-label="调整设置侧栏宽度"
        aria-orientation="vertical"
        aria-valuemin={MIN_SIDEBAR_WIDTH}
        aria-valuemax={MAX_SIDEBAR_WIDTH}
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
        onDoubleClick={() => {
          latestWidthRef.current = DEFAULT_SIDEBAR_WIDTH
          onSidebarWidthChange(DEFAULT_SIDEBAR_WIDTH)
          onSidebarWidthCommit(DEFAULT_SIDEBAR_WIDTH)
        }}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return
          event.preventDefault()
          const next = event.key === 'Home'
            ? DEFAULT_SIDEBAR_WIDTH
            : Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, sidebarWidth + (event.key === 'ArrowRight' ? 12 : -12)))
          latestWidthRef.current = next
          onSidebarWidthChange(next)
          onSidebarWidthCommit(next)
        }}
      />
    </aside>
  )
}

function Sidebar({
  workspace,
  activeProjectId,
  route,
  collapsed,
  onToggle,
  onRoute,
  onOpenSettings,
  onProject,
  onConversation,
  onCreateConversation,
  onUpdateConversation,
  onMoveConversation,
  onCopyConversationId,
  onPinProject,
  onSetPreferences,
  onCreate,
  onChooseFolder,
  onDeleteProject,
  onRevealProject,
  sidebarWidth,
  onSidebarWidthChange,
  onSidebarWidthCommit,
  choosingFolder,
}: {
  workspace: WorkspaceState
  activeProjectId?: string
  route: Route
  collapsed: boolean
  onToggle: () => void
  onRoute: (route: Route) => void
  onOpenSettings: (section: SettingsSection) => void
  onProject: (projectId: string) => void
  onConversation: (projectId: string, conversationId: string) => void
  onCreateConversation: (projectId: string) => void
  onUpdateConversation: (input: ConversationUpdateInput) => Promise<void>
  onMoveConversation: (conversationId: string, targetProjectId: string) => Promise<void>
  onCopyConversationId: (conversationId: string) => Promise<void>
  onPinProject: (projectId: string, pinned: boolean) => void
  onSetPreferences: (input: SidebarPreferencesInput) => void
  onCreate: () => void
  onChooseFolder: () => void
  onDeleteProject: (projectId: string) => void
  onRevealProject: (projectId: string) => void
  sidebarWidth: number
  onSidebarWidthChange: (width: number) => void
  onSidebarWidthCommit: (width: number) => void
  choosingFolder: boolean
}) {
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string>()
  const [organizeMenuOpen, setOrganizeMenuOpen] = useState(false)
  const [dragged, setDragged] = useState<{ kind: 'project' | 'conversation'; id: string }>()
  const [conversationMenu, setConversationMenu] = useState<ConversationMenuState>()
  const [moveMenuOpen, setMoveMenuOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<Conversation>()
  const [renameDraft, setRenameDraft] = useState('')
  const [renaming, setRenaming] = useState(false)
  const projectMenuRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const projectMenuTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const organizeMenuRef = useRef<HTMLDivElement | null>(null)
  const organizeTriggerRef = useRef<HTMLButtonElement | null>(null)
  const conversationMenuRef = useRef<HTMLDivElement | null>(null)
  const resizeStateRef = useRef<{ pointerId: number; startX: number; startWidth: number } | undefined>(undefined)
  const latestSidebarWidthRef = useRef(sidebarWidth)
  const viewMode = workspace.settings.sidebarViewMode ?? 'projects'
  const chatSort = workspace.settings.sidebarChatSort ?? 'priority'
  const showArchived = workspace.settings.sidebarShowArchived === true
  const expandedIds = new Set(workspace.settings.sidebarExpandedProjectIds ?? [])
  const projectById = new Map(workspace.projects.map((project) => [project.id, project]))
  const activityAt = (projectId: string) => {
    const project = projectById.get(projectId)
    const latestConversation = workspace.conversations
      .filter((conversation) => conversation.projectId === projectId)
      .reduce((latest, item) => item.updatedAt > latest ? item.updatedAt : latest, '')
    return latestConversation > (project?.updatedAt ?? '') ? latestConversation : (project?.updatedAt ?? '')
  }
  const sortedProjects = [...workspace.projects].sort((left, right) => {
    if (chatSort === 'manual') return (left.manualOrder ?? 0) - (right.manualOrder ?? 0)
    if (chatSort === 'priority' && Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1
    return activityAt(right.id).localeCompare(activityAt(left.id))
  })
  const sortConversations = (items: WorkspaceState['conversations']) => [...items]
    .filter((item) => showArchived || !item.archived)
    .sort((left, right) => {
    if (chatSort === 'manual') return (left.manualOrder ?? 0) - (right.manualOrder ?? 0)
    if (chatSort === 'priority') {
      const leftPinned = Boolean(left.pinned || projectById.get(left.projectId)?.pinned)
      const rightPinned = Boolean(right.pinned || projectById.get(right.projectId)?.pinned)
      if (leftPinned !== rightPinned) return leftPinned ? -1 : 1
    }
    return right.updatedAt.localeCompare(left.updatedAt)
  })
  const flatConversations = sortConversations(workspace.conversations)
  const researchFolderLabel = workspace.settings.researchRootPath
    ? `设置默认研究文件夹。当前目录：${workspace.settings.researchRootPath}`
    : '设置默认研究文件夹。未设置时使用“文稿/学术 Agent”'

  useEffect(() => {
    latestSidebarWidthRef.current = sidebarWidth
  }, [sidebarWidth])

  useEffect(() => {
    if (!openProjectMenuId) return
    projectMenuRefs.current[openProjectMenuId]?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [openProjectMenuId])

  useEffect(() => {
    if (!organizeMenuOpen) return
    organizeMenuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [organizeMenuOpen])

  useEffect(() => {
    if (!openProjectMenuId && !organizeMenuOpen) return
    const closeMenu = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (openProjectMenuId) projectMenuTriggerRefs.current[openProjectMenuId]?.focus()
      if (organizeMenuOpen) organizeTriggerRef.current?.focus()
      setOpenProjectMenuId(undefined)
      setOrganizeMenuOpen(false)
    }
    document.addEventListener('keydown', closeMenu)
    return () => document.removeEventListener('keydown', closeMenu)
  }, [openProjectMenuId, organizeMenuOpen])

  useEffect(() => {
    if (!conversationMenu) return
    const close = (event: MouseEvent) => {
      if (!conversationMenuRef.current?.contains(event.target as Node)) {
        setConversationMenu(undefined)
        setMoveMenuOpen(false)
      }
    }
    const closeWithKeyboard = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConversationMenu(undefined)
        setMoveMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', closeWithKeyboard)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', closeWithKeyboard)
    }
  }, [conversationMenu])

  const openConversationMenu = (
    event: React.MouseEvent,
    projectId: string,
    conversationId: string,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    setOpenProjectMenuId(undefined)
    setOrganizeMenuOpen(false)
    setMoveMenuOpen(false)
    setConversationMenu({
      projectId,
      conversationId,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 244)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 390)),
    })
  }

  const runConversationAction = async (action: () => Promise<void>) => {
    setConversationMenu(undefined)
    setMoveMenuOpen(false)
    try {
      await action()
    } catch {
      // 具体错误已经由上层操作统一显示为提示。
    }
  }

  const beginRename = (conversation: Conversation) => {
    setConversationMenu(undefined)
    setMoveMenuOpen(false)
    setRenameTarget(conversation)
    setRenameDraft(conversationDisplayTitle(conversation.title, projectById.get(conversation.projectId)?.title ?? ''))
  }

  const submitRename = async (event: FormEvent) => {
    event.preventDefault()
    if (!renameTarget || !renameDraft.trim()) return
    setRenaming(true)
    try {
      await onUpdateConversation({ conversationId: renameTarget.id, title: renameDraft.trim() })
      setRenameTarget(undefined)
    } catch {
      // 保留输入框，用户可直接修正后重试。
    } finally {
      setRenaming(false)
    }
  }

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (collapsed) return
    resizeStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: sidebarWidth,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const moveSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = resizeStateRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    const next = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, resize.startWidth + event.clientX - resize.startX))
    latestSidebarWidthRef.current = Math.round(next)
    onSidebarWidthChange(latestSidebarWidthRef.current)
  }

  const finishSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = resizeStateRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    resizeStateRef.current = undefined
    event.currentTarget.releasePointerCapture(event.pointerId)
    onSidebarWidthCommit(latestSidebarWidthRef.current)
  }

  const toggleProject = (projectId: string) => {
    const next = new Set(expandedIds)
    if (next.has(projectId)) next.delete(projectId)
    else next.add(projectId)
    onSetPreferences({ expandedProjectIds: [...next] })
  }

  const reorderProjects = (targetId: string) => {
    if (dragged?.kind !== 'project') return
    onSetPreferences({ projectOrder: moveIdBefore(sortedProjects.map((item) => item.id), dragged.id, targetId) })
    setDragged(undefined)
  }

  const reorderConversations = (items: WorkspaceState['conversations'], targetId: string) => {
    if (dragged?.kind !== 'conversation') return
    onSetPreferences({ conversationOrder: moveIdBefore(items.map((item) => item.id), dragged.id, targetId) })
    setDragged(undefined)
  }

  const menuKeyNavigation = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return
    event.preventDefault()
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]')]
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const direction = event.key === 'ArrowDown' ? 1 : -1
    buttons[(currentIndex + direction + buttons.length) % buttons.length]?.focus()
  }

  const menuConversation = conversationMenu
    ? workspace.conversations.find((item) => item.id === conversationMenu.conversationId)
    : undefined
  const menuProject = menuConversation ? projectById.get(menuConversation.projectId) : undefined
  const moveTargets = menuProject
    ? workspace.projects.filter((project) => project.id !== menuProject.id && project.origin === menuProject.origin)
    : []

  return (
    <>
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
          <button type="button" className={route === 'skills' ? 'is-active' : ''} onClick={() => onRoute('skills')} title="Skills">
            <Sparkles size={17} aria-hidden="true" />
            {!collapsed && <span>Skills</span>}
          </button>
          <button type="button" className={route === 'library' ? 'is-active' : ''} onClick={() => onRoute('library')} title="文献库">
            <Library size={17} aria-hidden="true" />
            {!collapsed && <span>文献库</span>}
          </button>
          <button type="button" onClick={() => onOpenSettings('configuration')} title="模型与 MCP">
            <PlugZap size={17} aria-hidden="true" />
            {!collapsed && <span>模型与 MCP</span>}
          </button>
        </nav>

        {!collapsed && (
          <>
            <section className="sidebar-section">
              <div className="sidebar-section-title">
                <span>研究</span>
                <div className="sidebar-section-actions">
                  <button
                    ref={organizeTriggerRef}
                    type="button"
                    aria-label="整理侧边栏"
                    title="整理侧边栏"
                    aria-haspopup="menu"
                    aria-expanded={organizeMenuOpen}
                    onClick={() => {
                      setOpenProjectMenuId(undefined)
                      setOrganizeMenuOpen((current) => !current)
                    }}
                  >
                    <MoreHorizontal size={15} aria-hidden="true" />
                  </button>
                  <button type="button" aria-label="新建研究" title="新建研究" onClick={onCreate}>
                    <Plus size={15} aria-hidden="true" />
                  </button>
                </div>
                {organizeMenuOpen && (
                  <div
                    ref={organizeMenuRef}
                    className="sidebar-organize-menu"
                    role="menu"
                    aria-label="整理侧边栏"
                    onKeyDown={menuKeyNavigation}
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOrganizeMenuOpen(false)
                    }}
                  >
                    <span className="menu-heading">整理侧边栏</span>
                    <button type="button" role="menuitemradio" aria-checked={viewMode === 'projects'} onClick={() => onSetPreferences({ viewMode: 'projects' })}>
                      <Check size={14} className={viewMode === 'projects' ? '' : 'is-placeholder'} />
                      <ListTree size={15} /> <span>按项目</span>
                    </button>
                    <button type="button" role="menuitemradio" aria-checked={viewMode === 'list'} onClick={() => onSetPreferences({ viewMode: 'list' })}>
                      <Check size={14} className={viewMode === 'list' ? '' : 'is-placeholder'} />
                      <LayoutList size={15} /> <span>在一个列表中</span>
                    </button>
                    <span className="menu-heading">聊天排序方式</span>
                    {([
                      ['priority', '优先级'],
                      ['recent', '最近更新'],
                      ['manual', '手动排序'],
                    ] as const).map(([value, label]) => (
                      <button key={value} type="button" role="menuitemradio" aria-checked={chatSort === value} onClick={() => onSetPreferences({ chatSort: value })}>
                        <Check size={14} className={chatSort === value ? '' : 'is-placeholder'} />
                        <SlidersHorizontal size={15} /> <span>{label}</span>
                      </button>
                    ))}
                    <div className="menu-separator" />
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={showArchived}
                      onClick={() => onSetPreferences({ showArchived: !showArchived })}
                    >
                      <Check size={14} className={showArchived ? '' : 'is-placeholder'} />
                      <Archive size={15} /> <span>显示已归档对话</span>
                    </button>
                    <div className="menu-separator" />
                    <button className="sidebar-menu-folder-action" type="button" role="menuitem" onClick={() => { setOrganizeMenuOpen(false); onChooseFolder() }} disabled={choosingFolder} title={researchFolderLabel}>
                      {choosingFolder ? <LoaderCircle size={15} className="spin" /> : <FolderOpen size={15} />}
                      <span>设置默认研究文件夹</span>
                    </button>
                  </div>
                )}
              </div>
              <div className="research-tree">
                {workspace.projects.length === 0 ? (
                  <p className="sidebar-empty">尚未创建研究</p>
                ) : (
                  viewMode === 'projects' ? sortedProjects.map((project) => {
                    const menuOpen = openProjectMenuId === project.id
                    const active = project.id === activeProjectId
                    const expanded = expandedIds.has(project.id)
                    const projectConversations = sortConversations(
                      workspace.conversations.filter((conversation) => conversation.projectId === project.id),
                    )
                    return (
                      <div
                        key={project.id}
                        className={`research-group${active ? ' is-active' : ''}${active && route === 'workspace' ? ' is-current' : ''}${menuOpen ? ' is-menu-open' : ''}`}
                        onBlur={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            setOpenProjectMenuId(undefined)
                          }
                        }}
                        draggable={chatSort === 'manual'}
                        onDragStart={() => setDragged({ kind: 'project', id: project.id })}
                        onDragOver={(event) => { if (chatSort === 'manual') event.preventDefault() }}
                        onDrop={() => reorderProjects(project.id)}
                      >
                        <div className="research-group-header">
                          <button
                            type="button"
                            className="research-folder-button"
                            onClick={() => {
                              setOpenProjectMenuId(undefined)
                              if (!active || route !== 'workspace') onProject(project.id)
                              toggleProject(project.id)
                            }}
                            title={project.title}
                            aria-expanded={expanded}
                            aria-controls={`research-conversations-${project.id}`}
                          >
                            <ChevronRight size={12} className={`research-disclosure${expanded ? ' is-expanded' : ''}`} aria-hidden="true" />
                            {expanded ? <FolderOpen size={16} aria-hidden="true" /> : <Folder size={16} aria-hidden="true" />}
                            <span>{project.title}</span>
                            {project.pinned && <Pin size={11} className="project-pinned-mark" aria-label="已置顶" />}
                          </button>
                          <button
                            type="button"
                            className="project-new-conversation"
                            aria-label={`在“${project.title}”中新建对话`}
                            title="新建对话"
                            onClick={() => onCreateConversation(project.id)}
                          >
                            <MessageSquarePlus size={15} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="project-list-more"
                            ref={(element) => { projectMenuTriggerRefs.current[project.id] = element }}
                            aria-label={`管理研究：${project.title}`}
                            title="研究操作"
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            aria-controls={menuOpen ? `project-menu-${project.id}` : undefined}
                            onClick={() => setOpenProjectMenuId(menuOpen ? undefined : project.id)}
                          >
                            <MoreHorizontal size={15} aria-hidden="true" />
                          </button>
                        </div>
                        {menuOpen && (
                          <div
                            id={`project-menu-${project.id}`}
                            className="project-list-menu"
                            role="menu"
                            aria-label={`${project.title}的研究操作`}
                            ref={(element) => { projectMenuRefs.current[project.id] = element }}
                            onKeyDown={menuKeyNavigation}
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenProjectMenuId(undefined)
                                onPinProject(project.id, !project.pinned)
                              }}
                            >
                              {project.pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}
                              {project.pinned ? '取消置顶项目' : '置顶项目'}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenProjectMenuId(undefined)
                                onRevealProject(project.id)
                              }}
                            >
                              <FolderOpen size={14} aria-hidden="true" />
                              在 Finder 中显示
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenProjectMenuId(undefined)
                                onDeleteProject(project.id)
                              }}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                              删除研究
                            </button>
                          </div>
                        )}
                        {expanded && (
                          <div
                            id={`research-conversations-${project.id}`}
                            className="research-conversations"
                            aria-label={`${project.title}的对话`}
                          >
                            {projectConversations.length === 0 ? (
                              <span className="research-conversation-empty">尚无对话</span>
                            ) : (
                              projectConversations.map((conversation) => {
                                const selected = active && route === 'workspace' && project.activeConversationId === conversation.id
                                const title = conversationDisplayTitle(conversation.title, project.title)
                                return (
                                  <div
                                    key={conversation.id}
                                    className={`research-conversation-row${selected ? ' is-active' : ''}${conversation.archived ? ' is-archived' : ''}`}
                                    onContextMenu={(event) => openConversationMenu(event, project.id, conversation.id)}
                                  >
                                    <button
                                      type="button"
                                      className={`research-conversation${selected ? ' is-active' : ''}${chatSort === 'manual' ? ' is-draggable' : ''}`}
                                      onClick={() => onConversation(project.id, conversation.id)}
                                      title={title}
                                      aria-current={selected ? 'page' : undefined}
                                      draggable={chatSort === 'manual'}
                                      onDragStart={(event) => { event.stopPropagation(); setDragged({ kind: 'conversation', id: conversation.id }) }}
                                      onDragOver={(event) => { if (chatSort === 'manual') event.preventDefault() }}
                                      onDrop={(event) => { event.stopPropagation(); reorderConversations(projectConversations, conversation.id) }}
                                    >
                                      {chatSort === 'manual' && <GripVertical size={12} className="conversation-drag-handle" aria-hidden="true" />}
                                      {conversation.unread && <span className="conversation-unread-dot" aria-label="未读" />}
                                      <span>{title}</span>
                                      {conversation.pinned && <Pin size={11} className="conversation-pinned-mark" aria-label="已置顶" />}
                                      <small aria-label={`${conversation.messageIds.length} 条消息`}>{conversation.messageIds.length || ''}</small>
                                    </button>
                                    <button
                                      type="button"
                                      className="conversation-more"
                                      aria-label={`管理对话：${title}`}
                                      title="对话操作"
                                      aria-haspopup="menu"
                                      onClick={(event) => openConversationMenu(event, project.id, conversation.id)}
                                    >
                                      <MoreHorizontal size={14} aria-hidden="true" />
                                    </button>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        )}
                      </div>
                    )
                  }) : (
                    <div className="flat-conversation-list" aria-label="全部研究对话">
                      {flatConversations.map((conversation) => {
                        const project = projectById.get(conversation.projectId)
                        if (!project) return null
                        const selected = project.id === activeProjectId && project.activeConversationId === conversation.id && route === 'workspace'
                        const title = conversationDisplayTitle(conversation.title, project.title)
                        return (
                          <div
                            key={conversation.id}
                            className={`flat-conversation-row${selected ? ' is-active' : ''}${conversation.archived ? ' is-archived' : ''}`}
                            onContextMenu={(event) => openConversationMenu(event, project.id, conversation.id)}
                          >
                            <button
                              type="button"
                              className={`flat-conversation${selected ? ' is-active' : ''}${chatSort === 'manual' ? ' is-draggable' : ''}`}
                              onClick={() => onConversation(project.id, conversation.id)}
                              draggable={chatSort === 'manual'}
                              onDragStart={() => setDragged({ kind: 'conversation', id: conversation.id })}
                              onDragOver={(event) => { if (chatSort === 'manual') event.preventDefault() }}
                              onDrop={() => reorderConversations(flatConversations, conversation.id)}
                            >
                              {chatSort === 'manual' && <GripVertical size={12} className="conversation-drag-handle" aria-hidden="true" />}
                              {conversation.unread && <span className="conversation-unread-dot" aria-label="未读" />}
                              <span><strong>{title}</strong><small>{project.title}</small></span>
                              {(conversation.pinned || project.pinned) && <Pin size={11} aria-label={conversation.pinned ? '对话已置顶' : '所属项目已置顶'} />}
                            </button>
                            <button
                              type="button"
                              className="conversation-more"
                              aria-label={`管理对话：${title}`}
                              title="对话操作"
                              aria-haspopup="menu"
                              onClick={(event) => openConversationMenu(event, project.id, conversation.id)}
                            >
                              <MoreHorizontal size={14} aria-hidden="true" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )
                )}
              </div>
            </section>
          </>
        )}
      </div>

      <div className="sidebar-footer">
        <button type="button" onClick={() => onOpenSettings('general')} title="设置">
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
      {!collapsed && (
        <div
          className="sidebar-resizer"
          role="separator"
          aria-label="调整左侧栏宽度"
          aria-orientation="vertical"
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={MAX_SIDEBAR_WIDTH}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onPointerDown={startSidebarResize}
          onPointerMove={moveSidebarResize}
          onPointerUp={finishSidebarResize}
          onPointerCancel={finishSidebarResize}
          onDoubleClick={() => {
            latestSidebarWidthRef.current = DEFAULT_SIDEBAR_WIDTH
            onSidebarWidthChange(DEFAULT_SIDEBAR_WIDTH)
            onSidebarWidthCommit(DEFAULT_SIDEBAR_WIDTH)
          }}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return
            event.preventDefault()
            const next = event.key === 'Home'
              ? DEFAULT_SIDEBAR_WIDTH
              : Math.max(
                  MIN_SIDEBAR_WIDTH,
                  Math.min(MAX_SIDEBAR_WIDTH, sidebarWidth + (event.key === 'ArrowRight' ? 12 : -12)),
                )
            latestSidebarWidthRef.current = next
            onSidebarWidthChange(next)
            onSidebarWidthCommit(next)
          }}
        />
      )}
    </aside>

    {conversationMenu && menuConversation && menuProject && (
      <div
        ref={conversationMenuRef}
        className="conversation-context-menu"
        role="menu"
        aria-label={`${conversationDisplayTitle(menuConversation.title, menuProject.title)}的对话操作`}
        style={{ left: conversationMenu.x, top: conversationMenu.y }}
        onKeyDown={menuKeyNavigation}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => runConversationAction(() => onUpdateConversation({
            conversationId: menuConversation.id,
            pinned: !menuConversation.pinned,
          }))}
        >
          {menuConversation.pinned ? <PinOff size={16} /> : <Pin size={16} />}
          {menuConversation.pinned ? '取消置顶聊天' : '置顶聊天'}
        </button>
        <div className="conversation-move-entry">
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={moveMenuOpen}
            disabled={moveTargets.length === 0}
            onClick={() => setMoveMenuOpen((current) => !current)}
          >
            <FolderInput size={16} />
            移至研究
            <ChevronRight size={15} className="menu-trailing-icon" />
          </button>
          {moveMenuOpen && (
            <div className="conversation-move-submenu" role="menu" aria-label="选择目标研究">
              {moveTargets.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  role="menuitem"
                  onClick={() => runConversationAction(() => onMoveConversation(menuConversation.id, project.id))}
                >
                  <Folder size={15} />
                  <span>{project.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" role="menuitem" onClick={() => beginRename(menuConversation)}>
          <PencilLine size={16} />
          重命名聊天
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => runConversationAction(() => onUpdateConversation({
            conversationId: menuConversation.id,
            archived: !menuConversation.archived,
          }))}
        >
          {menuConversation.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          {menuConversation.archived ? '取消归档聊天' : '归档聊天'}
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => runConversationAction(() => onUpdateConversation({
            conversationId: menuConversation.id,
            unread: !menuConversation.unread,
          }))}
        >
          {menuConversation.unread ? <MailOpen size={16} /> : <Mail size={16} />}
          {menuConversation.unread ? '标记为已读' : '标记为未读'}
        </button>
        <div className="menu-separator" />
        <button type="button" role="menuitem" onClick={() => runConversationAction(async () => onRevealProject(menuProject.id))}>
          <FolderOpen size={16} />
          在 Finder 中显示
        </button>
        <button type="button" role="menuitem" onClick={() => runConversationAction(() => onCopyConversationId(menuConversation.id))}>
          <Copy size={16} />
          复制会话 ID
        </button>
        <div className="menu-separator" />
        <button type="button" role="menuitem" onClick={() => runConversationAction(async () => onCreateConversation(menuProject.id))}>
          <MessageSquarePlus size={16} />
          在新对话中继续
        </button>
      </div>
    )}

    {renameTarget && (
      <div className="modal-backdrop conversation-rename-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget && !renaming) setRenameTarget(undefined)
      }}>
        <form className="conversation-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="conversation-rename-title" onSubmit={submitRename}>
          <div className="modal-header">
            <div>
              <span className="modal-icon"><PencilLine size={18} /></span>
              <div>
                <h2 id="conversation-rename-title">重命名聊天</h2>
                <p>只修改侧栏显示名称，不会改变已有消息或研究资料。</p>
              </div>
            </div>
            <IconButton icon={X} label="关闭" disabled={renaming} onClick={() => setRenameTarget(undefined)} />
          </div>
          <label>
            <span>聊天名称</span>
            <input
              autoFocus
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              maxLength={120}
              required
            />
          </label>
          <div className="conversation-rename-actions">
            <button type="button" className="secondary-button" disabled={renaming} onClick={() => setRenameTarget(undefined)}>取消</button>
            <button type="submit" className="primary-button compact" disabled={renaming || !renameDraft.trim()}>
              {renaming ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
              保存名称
            </button>
          </div>
        </form>
      </div>
    )}
    </>
  )
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

function ThinkingBlock({ content, streaming }: { content: string; streaming: boolean }) {
  const [open, setOpen] = useState(streaming)

  useEffect(() => {
    if (streaming) setOpen(true)
  }, [streaming])

  if (!content.trim()) return null
  return (
    <details className={`thinking-block${streaming ? ' is-streaming' : ''}`} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <BrainCircuit size={15} />
        <span>{streaming ? '正在思考' : '思考过程'}</span>
        {streaming && <LoaderCircle size={13} className="spin" />}
        <ChevronRight size={14} className="thinking-chevron" />
      </summary>
      <div className="thinking-content">{content}</div>
    </details>
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
            {message.role === 'assistant' && message.reasoningContent && (
              <ThinkingBlock content={message.reasoningContent} streaming={message.status === 'streaming'} />
            )}
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
  generationProviderName,
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
  generationProviderName?: string
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
  const streamTailRef = useRef<HTMLSpanElement>(null)
  const manuscriptDiff = useMemo(
    () => isEditing && section ? buildManuscriptDiff(section.content, draft) : [],
    [draft, isEditing, section?.content],
  )
  const changedLines = manuscriptDiff.filter((line) => line.kind !== 'same')

  useEffect(() => {
    if (section?.status !== 'generating') return
    streamTailRef.current?.scrollIntoView({ block: 'nearest' })
  }, [section?.content, section?.reasoningContent, section?.status])

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

  const generating = section.status === 'generating'
  const thinkingState = section.reasoningContent
    ? (generating ? 'Thinking 正在输出' : 'Thinking 已返回')
    : section.thinkingRequested
      ? 'Thinking 已请求'
      : undefined

  return (
    <div className="manuscript-view">
      <div className="manuscript-toolbar">
        <div>
          <span>第 {section.version} 版</span>
          <span>{section.wordCount.toLocaleString('zh-CN')} 字</span>
          <StatusBadge status={section.status}>{sectionStatusLabel(section)}</StatusBadge>
          {section.generationModel && (
            <span className="section-generation-model">
              <BrainCircuit size={12} /> {generationProviderName ? `${generationProviderName} · ` : ''}{section.generationModel}
              {thinkingState ? ` · ${thinkingState}` : ''}
            </span>
          )}
        </div>
        <div className="toolbar-actions">
          {['pending', 'error'].includes(section.status) && (
            <button type="button" className="secondary-button" onClick={onGenerate}>
              <FilePenLine size={15} /> {section.status === 'error' ? '重新生成' : '生成本章'}
            </button>
          )}
          {generating ? (
            <span className="section-streaming-label"><LoaderCircle size={14} className="spin" /> 正在流式生成</span>
          ) : isEditing ? (
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
        {section.generationError && (
          <div className="section-generation-error" role="alert"><CircleAlert size={16} /><span><strong>章节生成中断</strong><small>{section.generationError} 已收到的正文片段已经保留，可重新生成或手工编辑。</small></span></div>
        )}
        {section.reasoningContent && (
          <div className="section-thinking-wrap"><ThinkingBlock content={section.reasoningContent} streaming={generating} /></div>
        )}
        {isEditing ? (
          <div className="manuscript-editor-stack">
            <textarea value={draft} onChange={(event) => onDraft(event.target.value)} aria-label="编辑当前章节" autoFocus />
            {changedLines.length > 0 && (
              <details className="manuscript-diff" open>
                <summary>本次修改 · 新增 {changedLines.filter((line) => line.kind === 'added').length} 行 · 删除 {changedLines.filter((line) => line.kind === 'removed').length} 行</summary>
                <div className="manuscript-diff-lines" aria-label="当前章节未保存的逐行差异">
                  {changedLines.slice(0, 120).map((line, index) => (
                    <div className={`is-${line.kind}`} key={`${line.kind}-${index}-${line.text}`}>
                      <span aria-hidden="true">{line.kind === 'added' ? '+' : '−'}</span>
                      <code>{line.text || ' '}</code>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        ) : section.content || generating ? (
          <div className={`section-streaming-content${generating ? ' is-generating' : ''}`}>
            {section.content ? <MarkdownMessage content={section.content} /> : (
              <div className="section-stream-waiting"><LoaderCircle size={17} className="spin" /><span>{section.thinkingRequested ? '模型正在思考并准备章节结构…' : '模型正在准备章节内容…'}</span></div>
            )}
            {generating && <span ref={streamTailRef} className="section-stream-caret" aria-label="正文正在生成" />}
          </div>
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
          <strong>{activeModel ?? '选择模型'}</strong>
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

function AccessPicker({
  mode,
  disabled,
  onSelect,
  onManage,
}: {
  mode: ConversationAccessMode
  disabled: boolean
  onSelect: (mode: ConversationAccessMode) => Promise<void>
  onManage: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const select = async (nextMode: ConversationAccessMode) => {
    if (busy) return
    if (nextMode === mode) {
      setOpen(false)
      if (nextMode === 'full') onManage()
      return
    }
    setBusy(true)
    try {
      await onSelect(nextMode)
      setOpen(false)
    } catch {
      // 上层统一显示错误提示。
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="access-picker" ref={rootRef}>
      <button
        type="button"
        className={`access-picker-trigger${mode === 'full' ? ' is-full' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
      >
        {mode === 'full' ? <ShieldCheck size={14} /> : <CircleAlert size={14} />}
        <span>{mode === 'full' ? '完全访问权限' : '默认权限'}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="access-picker-menu" role="menu" aria-label="选择访问权限">
          <span className="access-picker-heading">访问权限</span>
          <button type="button" role="menuitemradio" aria-checked={mode === 'ask'} onClick={() => void select('ask')}>
            <CircleAlert size={17} />
            <span><strong>默认权限</strong><small>执行本机、MCP 或外部操作前询问</small></span>
            {mode === 'ask' && <Check size={15} />}
          </button>
          <button type="button" role="menuitemradio" aria-checked={mode === 'full'} onClick={() => void select('full')}>
            <ShieldCheck size={17} />
            <span><strong>完全访问权限</strong><small>需通过 macOS 辅助功能与磁盘访问授权</small></span>
            {mode === 'full' && <Check size={15} />}
          </button>
          <button type="button" className="access-picker-manage" role="menuitem" onClick={() => { setOpen(false); onManage() }}>
            <Settings size={16} />
            <span><strong>管理 macOS 权限</strong><small>查看真实授权状态并重新检测</small></span>
            <ChevronRight size={15} />
          </button>
          <p>完全访问不等同于管理员或 root 权限，也不会绕过 macOS 的系统保护。</p>
        </div>
      )}
    </div>
  )
}

const permissionStatusLabels: Record<SystemPermissionSnapshot['accessibility'], string> = {
  granted: '已授权',
  denied: '未授权',
  'not-determined': '尚未询问',
  restricted: '受系统限制',
  unknown: '无法确认',
  unsupported: '当前环境不支持',
}

function SystemPermissionDialog({
  open,
  snapshot,
  busy,
  onClose,
  onRequest,
  onRefresh,
  onOpenSettings,
  onEnable,
}: {
  open: boolean
  snapshot?: SystemPermissionSnapshot
  busy: boolean
  onClose: () => void
  onRequest: () => void
  onRefresh: () => void
  onOpenSettings: (kind: SystemPermissionKind) => void
  onEnable: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus())
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, busy, onClose])

  if (!open) return null
  const platformSupported = snapshot?.platform !== 'unsupported'
  const rows: Array<{
    kind: SystemPermissionKind
    title: string
    detail: string
    status: SystemPermissionSnapshot['accessibility']
    required: boolean
  }> = [
    {
      kind: 'accessibility',
      title: '辅助功能',
      detail: '允许学术 Agent 在用户明确发起操作时控制其他应用界面。',
      status: snapshot?.accessibility ?? 'unknown',
      required: true,
    },
    {
      kind: 'full-disk-access',
      title: '完全磁盘访问',
      detail: '允许访问受 macOS 隐私保护的文件位置；只能由你在系统设置中授予。',
      status: snapshot?.fullDiskAccess ?? 'unknown',
      required: true,
    },
    {
      kind: 'screen-recording',
      title: '屏幕录制',
      detail: '仅在后续需要读取屏幕内容时使用，不影响当前完全访问模式。',
      status: snapshot?.screenRecording ?? 'unknown',
      required: false,
    },
  ]

  return (
    <div className="modal-backdrop system-permission-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section ref={dialogRef} tabIndex={-1} className="modal system-permission-modal" role="dialog" aria-modal="true" aria-labelledby="system-permission-title">
        <header className="modal-header">
          <div>
            <span className="modal-icon"><ShieldCheck size={18} /></span>
            <div>
              <h2 id="system-permission-title">macOS 系统权限</h2>
              <p>应用只读取真实系统状态；没有授权时不会把对话标记为完全访问。</p>
            </div>
          </div>
          <IconButton icon={X} label="关闭系统权限" onClick={onClose} disabled={busy} />
        </header>
        <div className="system-permission-body">
          {!platformSupported && (
            <div className="system-permission-warning"><CircleAlert size={17} /><span>浏览器演示不能申请 macOS 权限，请在桌面应用中使用。</span></div>
          )}
          <div className="system-permission-list">
            {rows.map((row) => (
              <div className="system-permission-row" key={row.kind}>
                <span className={`system-permission-state is-${row.status}`} aria-hidden="true">
                  {row.status === 'granted' ? <Check size={15} /> : <CircleAlert size={15} />}
                </span>
                <span>
                  <strong>{row.title}{row.required ? ' · 必需' : ' · 可选'}</strong>
                  <small>{row.detail}</small>
                </span>
                <span className={`system-permission-label is-${row.status}`}>{permissionStatusLabels[row.status]}</span>
                {row.kind === 'accessibility' && row.status !== 'granted' ? (
                  <button type="button" className="secondary-button compact" onClick={onRequest} disabled={busy || !platformSupported}>申请</button>
                ) : (
                  <button type="button" className="secondary-button compact" onClick={() => onOpenSettings(row.kind)} disabled={busy || !platformSupported}>系统设置</button>
                )}
              </div>
            ))}
          </div>
          <div className={`system-permission-summary${snapshot?.fullAccessReady ? ' is-ready' : ''}`}>
            {snapshot?.fullAccessReady ? <CircleCheck size={18} /> : <CircleAlert size={18} />}
            <span>
              <strong>{snapshot?.fullAccessReady ? '真实授权已经满足' : '完全访问尚未启用'}</strong>
              <small>{snapshot?.fullAccessReady ? '可以为当前对话启用完全访问。' : '请完成两项必需权限，然后返回应用重新检测。更改完全磁盘访问后，macOS 可能要求重启应用。'}</small>
            </span>
          </div>
        </div>
        <footer className="modal-footer system-permission-footer">
          <button type="button" className="secondary-button" onClick={onRefresh} disabled={busy || !platformSupported}>
            {busy ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />} 重新检测
          </button>
          <span />
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>关闭</button>
          <button type="button" className="primary-button compact" onClick={onEnable} disabled={busy || !snapshot?.fullAccessReady}>启用完全访问</button>
        </footer>
      </section>
    </div>
  )
}

function Composer({
  providers,
  activeProviderId,
  activeModel,
  conversation,
  attachments,
  skills,
  mcpServers,
  running,
  contextLabel,
  onSelectModel,
  onSend,
  onCancel,
  onSettings,
  onUpdateConversation,
  onChooseAttachments,
  onRemoveAttachment,
  onRequestAccessMode,
  onManagePermissions,
}: {
  providers: ProviderProfile[]
  activeProviderId?: string
  activeModel?: string
  conversation?: Conversation
  attachments: ConversationAttachment[]
  skills: SkillDefinition[]
  mcpServers: McpServerConfig[]
  running: boolean
  contextLabel: string
  onSelectModel: (providerId: string, model: string) => void
  onSend: (content: string, contextReferences: ChatContextReference[]) => Promise<boolean>
  onCancel: () => void
  onSettings: () => void
  onUpdateConversation: (input: ConversationUpdateInput) => Promise<void>
  onChooseAttachments: () => Promise<void>
  onRemoveAttachment: (attachmentId: string) => Promise<void>
  onRequestAccessMode: (mode: ConversationAccessMode) => Promise<void>
  onManagePermissions: () => void
}) {
  const [value, setValue] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const [selectedReferences, setSelectedReferences] = useState<ChatContextReference[]>([])
  const [slashSelection, setSlashSelection] = useState(0)
  const [slashDismissedValue, setSlashDismissedValue] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [goalOpen, setGoalOpen] = useState(false)
  const [goalDraft, setGoalDraft] = useState(conversation?.goal ?? '')
  const [updatingMode, setUpdatingMode] = useState(false)
  const composingRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const interactionLocked = running || submitting
  const canSend = Boolean(value.trim() && activeProviderId && activeModel && !interactionLocked)
  const accessMode: ConversationAccessMode = conversation?.accessMode === 'full' ? 'full' : 'ask'

  type SlashItem = {
    key: string
    label: string
    description: string
    searchText: string
    reference: ChatContextReference
    kind: 'skill' | 'mcp'
    status?: McpServerConfig['status']
    toolCount?: number
  }

  const slashItems = useMemo<SlashItem[]>(() => [
    ...skills
      .filter((skill) => skill.enabled)
      .map((skill) => ({
        key: `skill:${skill.id}`,
        label: skill.name,
        description: skill.description || '应用内 Skill',
        searchText: `${skill.name} ${skill.description}`.toLocaleLowerCase(),
        reference: { kind: 'skill' as const, skillId: skill.id },
        kind: 'skill' as const,
      })),
    ...mcpServers
      .filter((server) => server.enabled)
      .map((server) => ({
        key: `mcp:${server.id}`,
        label: server.name,
        description: server.status === 'connected'
          ? `${server.tools.length} 个可用工具`
          : server.status === 'failed'
            ? '连接失败'
            : server.status === 'connecting'
              ? '正在连接'
              : '尚未连接',
        searchText: `${server.name} ${server.tools.map((tool) => `${tool.name} ${tool.description ?? ''}`).join(' ')}`.toLocaleLowerCase(),
        reference: { kind: 'mcp' as const, serverId: server.id },
        kind: 'mcp' as const,
        status: server.status,
        toolCount: server.tools.length,
      })),
  ], [mcpServers, skills])

  const slashMatch = useMemo(() => {
    const beforeCursor = value.slice(0, cursorPosition)
    const match = /(?:^|\s)\/([^\s/]*)$/.exec(beforeCursor)
    if (!match) return undefined
    const slashIndex = match.index + (match[0].startsWith('/') ? 0 : 1)
    let tokenEnd = cursorPosition
    while (tokenEnd < value.length && !/\s/.test(value[tokenEnd])) tokenEnd += 1
    return { query: match[1], slashIndex, tokenEnd }
  }, [cursorPosition, value])

  const filteredSlashItems = useMemo(() => {
    const query = slashMatch?.query.trim().toLocaleLowerCase() ?? ''
    return query ? slashItems.filter((item) => item.searchText.includes(query)) : slashItems
  }, [slashItems, slashMatch?.query])
  const slashMenuOpen = Boolean(slashMatch && slashDismissedValue !== value && !interactionLocked)

  const referenceKey = (reference: ChatContextReference) => reference.kind === 'skill'
    ? `skill:${reference.skillId}`
    : `mcp:${reference.serverId}`

  const referenceLabel = (reference: ChatContextReference) => {
    const item = slashItems.find((candidate) => candidate.key === referenceKey(reference))
    return item?.label ?? (reference.kind === 'skill' ? '已选择的 Skill' : '已选择的 MCP')
  }

  useEffect(() => {
    setGoalDraft(conversation?.goal ?? '')
    setGoalOpen(false)
    setAddMenuOpen(false)
  }, [conversation?.id, conversation?.goal])

  useEffect(() => {
    setValue('')
    setCursorPosition(0)
    setSelectedReferences([])
    setSlashDismissedValue(undefined)
  }, [conversation?.id])

  useEffect(() => {
    setSlashSelection(0)
  }, [slashMatch?.query, filteredSlashItems.length])

  useEffect(() => {
    if (!slashMenuOpen) return
    document.getElementById(`composer-slash-option-${slashSelection}`)?.scrollIntoView({ block: 'nearest' })
  }, [slashMenuOpen, slashSelection])

  useEffect(() => {
    if (!addMenuOpen) return
    const close = (event: PointerEvent) => {
      if (!addMenuRef.current?.contains(event.target as Node)) setAddMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAddMenuOpen(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [addMenuOpen])

  const removeSlashQuery = () => {
    if (!slashMatch) return
    const nextValue = `${value.slice(0, slashMatch.slashIndex)}${value.slice(slashMatch.tokenEnd)}`
    const nextCursor = slashMatch.slashIndex
    setValue(nextValue)
    setCursorPosition(nextCursor)
    setSlashDismissedValue(undefined)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const selectSlashItem = (item: SlashItem) => {
    const exists = selectedReferences.some((reference) => referenceKey(reference) === item.key)
    if (!exists && selectedReferences.length >= 12) return
    if (!exists) setSelectedReferences((current) => [...current, item.reference])
    removeSlashQuery()
  }

  const submit = async () => {
    if (!canSend) return
    const content = value.trim()
    const contextReferences = [...selectedReferences]
    setValue('')
    setCursorPosition(0)
    setSlashDismissedValue(undefined)
    setSubmitting(true)
    try {
      const sent = await onSend(content, contextReferences)
      if (sent) {
        setSelectedReferences([])
      } else {
        setValue(content)
        setCursorPosition(content.length)
        requestAnimationFrame(() => {
          textareaRef.current?.focus()
          textareaRef.current?.setSelectionRange(content.length, content.length)
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  const togglePlanMode = async () => {
    if (!conversation || updatingMode) return
    setUpdatingMode(true)
    try {
      await onUpdateConversation({
        conversationId: conversation.id,
        planMode: !conversation.planMode,
      })
      setAddMenuOpen(false)
    } catch {
      // 上层统一显示错误提示。
    } finally {
      setUpdatingMode(false)
    }
  }

  const saveGoal = async () => {
    if (!conversation || updatingMode) return
    setUpdatingMode(true)
    try {
      await onUpdateConversation({ conversationId: conversation.id, goal: goalDraft })
      setGoalOpen(false)
    } catch {
      // 上层统一显示错误提示。
    } finally {
      setUpdatingMode(false)
    }
  }

  return (
    <div className="composer-wrap">
      <div className="composer">
        {slashMenuOpen && (
          <div className="composer-slash-menu" id="composer-slash-menu" role="listbox" aria-label="添加 Skill 或 MCP 服务">
            <div className="composer-slash-header">
              <span>添加到本次对话</span>
              <kbd>/</kbd>
            </div>
            {filteredSlashItems.length === 0 ? (
              <div className="composer-slash-empty">没有匹配的已启用 Skill 或 MCP 服务</div>
            ) : (
              <div className="composer-slash-options">
                {(['skill', 'mcp'] as const).map((kind) => {
                  const group = filteredSlashItems.filter((item) => item.kind === kind)
                  if (group.length === 0) return null
                  return (
                    <div className="composer-slash-group" key={kind} role="group" aria-label={kind === 'skill' ? 'Skills' : 'MCP 服务'}>
                      <span className="composer-slash-group-label">{kind === 'skill' ? 'Skills' : 'MCP 服务'}</span>
                      {group.map((item) => {
                        const index = filteredSlashItems.findIndex((candidate) => candidate.key === item.key)
                        const selected = index === slashSelection
                        const alreadyAdded = selectedReferences.some((reference) => referenceKey(reference) === item.key)
                        const unavailable = selectedReferences.length >= 12 && !alreadyAdded
                        return (
                          <button
                            type="button"
                            id={`composer-slash-option-${index}`}
                            className={selected ? 'is-selected' : ''}
                            role="option"
                            aria-selected={selected}
                            aria-disabled={unavailable}
                            key={item.key}
                            onMouseEnter={() => setSlashSelection(index)}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectSlashItem(item)}
                          >
                            <span className={`composer-slash-icon is-${item.kind}`} aria-hidden="true">
                              {item.kind === 'skill' ? <Sparkles size={15} /> : <PlugZap size={15} />}
                            </span>
                            <span className="composer-slash-copy">
                              <strong>{item.label}</strong>
                              <small>{item.description}</small>
                            </span>
                            {alreadyAdded ? (
                              <span className="composer-slash-state"><Check size={13} /> 已添加</span>
                            ) : item.kind === 'mcp' ? (
                              <span className={`composer-slash-state is-${item.status}`}>{item.toolCount} 工具</span>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
            <div className="composer-slash-footer">
              <span>{selectedReferences.length}/12 已添加</span>
              <span><kbd>↑↓</kbd> 选择 <kbd>Enter</kbd> 添加 <kbd>Esc</kbd> 关闭</span>
            </div>
          </div>
        )}
        {attachments.length > 0 && (
          <div className="composer-attachments" aria-label="当前对话附件">
            {attachments.map((attachment) => (
              <span className={`composer-attachment${attachment.warning ? ' has-warning' : ''}`} key={attachment.id} title={attachment.warning ?? attachment.path}>
                {attachment.kind === 'folder' ? <FolderOpen size={14} /> : <Paperclip size={14} />}
                <span>{attachment.name}</span>
                <button type="button" onClick={() => onRemoveAttachment(attachment.id)} aria-label={`移除附件 ${attachment.name}`}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        {selectedReferences.length > 0 && (
          <div className="composer-context-references" aria-label="本次对话附加能力">
            {selectedReferences.map((reference) => (
              <span className={`composer-reference-chip is-${reference.kind}`} key={referenceKey(reference)}>
                {reference.kind === 'skill' ? <Sparkles size={13} /> : <PlugZap size={13} />}
                <span>{referenceLabel(reference)}</span>
                <button
                  type="button"
                  onClick={() => setSelectedReferences((current) => current.filter((item) => referenceKey(item) !== referenceKey(reference)))}
                  aria-label={`移除 ${referenceLabel(reference)}`}
                  disabled={interactionLocked}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setCursorPosition(event.target.selectionStart)
            setSlashDismissedValue(undefined)
          }}
          onSelect={(event) => setCursorPosition(event.currentTarget.selectionStart)}
          onInput={(event) => {
            event.currentTarget.style.height = 'auto'
            event.currentTarget.style.height = `${Math.min(180, Math.max(82, event.currentTarget.scrollHeight))}px`
          }}
          onCompositionStart={() => {
            composingRef.current = true
          }}
          onCompositionEnd={() => {
            composingRef.current = false
          }}
          onKeyDown={(event) => {
            if (composingRef.current) return
            if (slashMenuOpen) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                if (filteredSlashItems.length > 0) {
                  const direction = event.key === 'ArrowDown' ? 1 : -1
                  setSlashSelection((current) => (current + direction + filteredSlashItems.length) % filteredSlashItems.length)
                }
                return
              }
              if ((event.key === 'Enter' || event.key === 'Tab') && filteredSlashItems[slashSelection]) {
                event.preventDefault()
                selectSlashItem(filteredSlashItems[slashSelection])
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setSlashDismissedValue(value)
                return
              }
            }
            if (event.key === 'Enter' && !event.shiftKey && !composingRef.current) {
              event.preventDefault()
              void submit()
            }
          }}
          placeholder="描述研究任务，或围绕当前文稿继续对话…"
          aria-label="向论文研究 Agent 提问"
          disabled={interactionLocked}
          aria-expanded={slashMenuOpen}
          aria-haspopup="listbox"
          aria-controls={slashMenuOpen ? 'composer-slash-menu' : undefined}
          aria-activedescendant={slashMenuOpen && filteredSlashItems[slashSelection] ? `composer-slash-option-${slashSelection}` : undefined}
          aria-autocomplete="list"
        />
        <div className="composer-toolbar">
          <div className="composer-tools">
            <div className="composer-add" ref={addMenuRef}>
              <IconButton
                icon={Plus}
                label="添加"
                active={addMenuOpen}
                onClick={() => setAddMenuOpen((current) => !current)}
              />
              {addMenuOpen && (
                <div className="composer-add-menu" role="menu">
                  <span className="composer-menu-heading">添加</span>
                  <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); void onChooseAttachments() }}>
                    <Paperclip size={17} />
                    <span><strong>文件和文件夹</strong><small>加入当前对话上下文</small></span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setGoalDraft(conversation?.goal ?? ''); setGoalOpen(true); setAddMenuOpen(false) }} disabled={!conversation}>
                    <Target size={17} />
                    <span><strong>目标</strong><small>{conversation?.goal ? '修改持续追踪的目标' : '设置要持续追踪的目标'}</small></span>
                  </button>
                  <button type="button" role="menuitemcheckbox" aria-checked={conversation?.planMode === true} onClick={() => void togglePlanMode()} disabled={!conversation || updatingMode}>
                    <Lightbulb size={17} />
                    <span><strong>计划模式</strong><small>{conversation?.planMode ? '已开启，点击关闭' : '先分析并形成步骤'}</small></span>
                    {conversation?.planMode && <Check size={15} />}
                  </button>
                </div>
              )}
            </div>
            <AccessPicker
              mode={accessMode}
              disabled={!conversation || updatingMode}
              onSelect={onRequestAccessMode}
              onManage={onManagePermissions}
            />
            <span className="composer-context-chip">{contextLabel}</span>
            {conversation?.planMode && <span className="composer-mode-chip"><Lightbulb size={13} /> 计划</span>}
            {conversation?.goal && <button type="button" className="composer-goal-chip" onClick={() => setGoalOpen(true)} title={conversation.goal}><Target size={13} /> 目标</button>}
          </div>
          <div className="composer-status">
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
            {running ? (
              <button type="button" className="send-button is-stop" onClick={onCancel} aria-label="停止生成">
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button type="button" className="send-button" onClick={() => void submit()} disabled={!canSend} aria-label="发送消息">
                <ArrowUp size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
      {goalOpen && (
        <div className="composer-goal-dialog" role="dialog" aria-modal="true" aria-label="设置对话目标">
          <div>
            <Target size={18} />
            <span><strong>对话目标</strong><small>保存后会持续加入当前对话的模型上下文。</small></span>
            <IconButton icon={X} label="关闭目标设置" onClick={() => setGoalOpen(false)} />
          </div>
          <textarea value={goalDraft} onChange={(event) => setGoalDraft(event.target.value)} maxLength={2000} placeholder="例如：完成一篇证据可追溯的中文教育学论文，并逐章核验引用。" autoFocus />
          <div className="composer-goal-actions">
            <span>{goalDraft.length}/2000</span>
            <button type="button" className="secondary-button" onClick={() => setGoalDraft('')} disabled={updatingMode}>清除</button>
            <button type="button" className="primary-button compact" onClick={() => void saveGoal()} disabled={updatingMode}>保存目标</button>
          </div>
        </div>
      )}
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

const sectionStatusLabels: Record<ManuscriptSection['status'], string> = {
  pending: '待生成',
  generating: '生成中',
  draft: '草稿',
  verified: '已核验',
  error: '生成失败',
}

function sectionStatusLabel(section: ManuscriptSection): string {
  if (section.derivedFromSectionId && ['draft', 'verified'].includes(section.status)) {
    return section.status === 'verified' ? '随父章节同步 · 已核验' : '已随父章节生成'
  }
  return sectionStatusLabels[section.status]
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
  width,
  onWidthChange,
  onWidthCommit,
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
  width: number
  onWidthChange: (width: number) => void
  onWidthCommit: (width: number) => void
}) {
  const outlineNodes = outline ?? []
  const outlineSummary = summarizeOutline(outlineNodes)
  const widthRef = useRef(width)

  useEffect(() => {
    widthRef.current = width
  }, [width])

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = widthRef.current
    const handleMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.max(320, Math.min(620, Math.round(startWidth + startX - moveEvent.clientX)))
      widthRef.current = nextWidth
      onWidthChange(nextWidth)
    }
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      document.body.classList.remove('is-resizing-panel')
      onWidthCommit(widthRef.current)
    }
    document.body.classList.add('is-resizing-panel')
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  return (
    <aside className="right-workspace">
      <div
        className="right-resizer"
        role="separator"
        aria-label="调整学术工作台宽度"
        aria-orientation="vertical"
        aria-valuemin={320}
        aria-valuemax={620}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={startResize}
        onDoubleClick={() => {
          widthRef.current = DEFAULT_RIGHT_PANEL_WIDTH
          onWidthChange(DEFAULT_RIGHT_PANEL_WIDTH)
          onWidthCommit(DEFAULT_RIGHT_PANEL_WIDTH)
        }}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return
          event.preventDefault()
          const nextWidth = event.key === 'Home'
            ? DEFAULT_RIGHT_PANEL_WIDTH
            : Math.max(320, Math.min(620, widthRef.current + (event.key === 'ArrowLeft' ? 16 : -16)))
          widthRef.current = nextWidth
          onWidthChange(nextWidth)
          onWidthCommit(nextWidth)
        }}
      />
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
              <OutlineTree
                nodes={outlineNodes}
                sections={sections}
                selectedSectionId={selectedSectionId}
                onSelectSection={onSelectSection}
              />
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
  const mcpSources = workspace.mcpServers
    .filter((server) => server.enabled && server.tools.length > 0)
    .flatMap((server) =>
      server.tools
        .filter((tool) => /search|literature|papers/i.test(tool.name))
        .map((tool) => ({
          key: `mcp:${server.id}:${tool.name}`,
          label: server.id === DEFAULT_ARXIV_MCP_SERVER_ID
            && tool.name === DEFAULT_ARXIV_MCP_TOOL_NAME
            ? 'arXiv MCP（默认）'
            : `${server.name} / ${tool.name}`,
          serverId: server.id,
          toolName: tool.name,
        })),
    )
  const defaultArxivSource = mcpSources.find(
    (source) => source.serverId === DEFAULT_ARXIV_MCP_SERVER_ID
      && source.toolName === DEFAULT_ARXIV_MCP_TOOL_NAME,
  )
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<LiteratureRecord | undefined>(initialSelected)
  const [filter, setFilter] = useState<'all' | 'included' | 'verified' | 'pending'>('all')
  const [sourceKey, setSourceKey] = useState(defaultArxivSource?.key ?? 'public')
  const sourceInitializedRef = useRef(Boolean(defaultArxivSource))

  useEffect(() => {
    if (initialSelected) setSelected(initialSelected)
  }, [initialSelected?.id])

  useEffect(() => {
    if (sourceInitializedRef.current || !defaultArxivSource) return
    sourceInitializedRef.current = true
    setSourceKey(defaultArxivSource.key)
  }, [defaultArxivSource?.key])

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
            <span>敏感环境变量和请求头由安装版写入系统安全存储；再次编辑时仅回显掩码值。这里的服务只属于学术 Agent，不读取系统或其他应用的 MCP 配置。</span>
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

function ConfigurationSettings({
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

const settingsSectionDescriptions: Record<Exclude<SettingsSection, 'configuration' | 'archived'>, { title: string; eyebrow: string; description: string }> = {
  general: { title: '常规', eyebrow: '个人', description: '管理应用权限、本机研究目录和当前工作区状态。' },
  appearance: { title: '外观', eyebrow: '个人', description: '调整学术 Agent 的显示方式与阅读密度。' },
  voice: { title: '语音输入', eyebrow: '个人', description: '管理麦克风输入和语音转写入口。' },
  personalization: { title: '个性化', eyebrow: '个人', description: '通过应用内 Skills 固定你的研究方法、写作习惯和输出偏好。' },
  shortcuts: { title: '键盘快捷键', eyebrow: '个人', description: '查看当前工作区已经支持的键盘操作。' },
  'app-snapshot': { title: '应用快照', eyebrow: '集成', description: '规划通过连续按两次 Command 捕获当前应用画面并加入对话。' },
  browser: { title: '浏览器', eyebrow: '集成', description: '为研究任务连接受控的网页浏览能力。' },
  'computer-control': { title: '电脑控制', eyebrow: '集成', description: '为用户明确发起的任务连接本机应用操作能力。' },
  hooks: { title: '钩子', eyebrow: '编码', description: '在研究任务关键阶段触发应用内自动化。' },
  connections: { title: '连接', eyebrow: '编码', description: '管理后续可用于隔离执行的远程或本机连接。' },
  git: { title: 'Git', eyebrow: '编码', description: '管理研究项目与版本仓库之间的连接方式。' },
  environment: { title: '环境', eyebrow: '编码', description: '查看后续任务执行环境与变量隔离策略。' },
  worktrees: { title: 'Worktrees', eyebrow: '编码', description: '为并行研究或代码任务规划独立工作树。' },
}

function SettingsSectionHeader({ section }: { section: Exclude<SettingsSection, 'configuration' | 'archived'> }) {
  const metadata = settingsSectionDescriptions[section]
  return (
    <header className="settings-hub-header">
      <span>{metadata.eyebrow}</span>
      <h1>{metadata.title}</h1>
      <p>{metadata.description}</p>
    </header>
  )
}

function PlannedSetting({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon
  title: string
  description: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="settings-card-row">
      <span className="settings-card-icon"><Icon size={17} aria-hidden="true" /></span>
      <span className="settings-card-copy"><strong>{title}</strong><small>{description}</small></span>
      <span className="settings-planned-badge">计划中</span>
      <button type="button" className="secondary-button compact" onClick={onAction}>{actionLabel}</button>
    </div>
  )
}

function SettingsPage({
  section,
  workspace,
  systemPermissions,
  choosingFolder,
  onRefresh,
  onToast,
  onManagePermissions,
  onChooseFolder,
  onOpenSkills,
  onAppearanceChange,
  onAppearanceImport,
  onAppearanceCopy,
  onRestoreConversation,
  onRestoreAndOpen,
}: {
  section: SettingsSection
  workspace: WorkspaceState
  systemPermissions?: SystemPermissionSnapshot
  choosingFolder: boolean
  onRefresh: () => Promise<void>
  onToast: (message: string, tone?: 'success' | 'error') => void
  onManagePermissions: () => void
  onChooseFolder: () => void
  onOpenSkills: () => void
  onAppearanceChange: (input: AppearanceSettingsInput) => Promise<void>
  onAppearanceImport: () => Promise<void>
  onAppearanceCopy: () => Promise<void>
  onRestoreConversation: (conversationId: string) => Promise<void>
  onRestoreAndOpen: (projectId: string, conversationId: string) => Promise<void>
}) {
  if (section === 'configuration') {
    return <ConfigurationSettings workspace={workspace} onRefresh={onRefresh} onToast={onToast} />
  }

  if (section === 'appearance') {
    return (
      <AppearanceSettingsPage
        appearance={workspace.settings.appearance}
        appIconUrl={appIconUrl}
        darkDockIconUrl={darkDockIconUrl}
        onChange={onAppearanceChange}
        onImport={onAppearanceImport}
        onCopy={onAppearanceCopy}
        onToast={onToast}
      />
    )
  }

  if (section === 'archived') {
    const archivedConversations = [...workspace.conversations]
      .filter((conversation) => conversation.archived)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    const projectById = new Map(workspace.projects.map((project) => [project.id, project]))
    return (
      <section className="settings-hub-page archived-settings-page">
        <header className="settings-hub-header">
          <span>已归档</span>
          <h1>已归档的对话</h1>
          <p>从侧栏归档的对话会保留全部消息和项目关联，可在这里恢复。</p>
        </header>
        <div className="settings-content-column">
          {archivedConversations.length === 0 ? (
            <div className="settings-empty-state"><Archive size={24} /><strong>没有已归档的对话</strong><small>对话菜单中的“归档聊天”会把内容移动到这里。</small></div>
          ) : (
            <section className="settings-card archived-conversation-list" aria-label="已归档的对话">
              {archivedConversations.map((conversation) => {
                const project = projectById.get(conversation.projectId)
                return (
                  <article className="archived-conversation-row" key={conversation.id}>
                    <span className="settings-card-icon"><Archive size={16} /></span>
                    <span className="settings-card-copy">
                      <strong>{conversationDisplayTitle(conversation.title, project?.title ?? '')}</strong>
                      <small>{project?.title ?? '原研究已移除'} · {conversation.messageIds.length} 条消息 · {formatTime(conversation.updatedAt)}</small>
                    </span>
                    <button type="button" className="secondary-button compact" onClick={() => { void onRestoreConversation(conversation.id) }}><ArchiveRestore size={14} /> 恢复</button>
                    {project && <button type="button" className="primary-button compact" onClick={() => { void onRestoreAndOpen(project.id, conversation.id) }}>恢复并打开</button>}
                  </article>
                )
              })}
            </section>
          )}
        </div>
      </section>
    )
  }

  if (section === 'general') {
    const accessReady = systemPermissions?.fullAccessReady === true
    return (
      <section className="settings-hub-page">
        <SettingsSectionHeader section="general" />
        <div className="settings-content-column">
          <h2>权限</h2>
          <section className="settings-card">
            <div className="settings-card-row">
              <span className="settings-card-icon"><ShieldCheck size={17} /></span>
              <span className="settings-card-copy"><strong>系统操作权限</strong><small>辅助功能与完全磁盘访问均由 macOS 授予，应用不会绕过系统确认。</small></span>
              <StatusBadge status={accessReady ? 'connected' : 'failed'}>{accessReady ? '已满足' : '需要检查'}</StatusBadge>
              <button type="button" className="secondary-button compact" onClick={onManagePermissions}>管理权限</button>
            </div>
          </section>
          <h2>常规</h2>
          <section className="settings-card">
            <div className="settings-card-row">
              <span className="settings-card-icon"><FolderOpen size={17} /></span>
              <span className="settings-card-copy"><strong>默认研究文件夹</strong><small>{workspace.settings.researchRootPath || '未设置时使用“文稿/学术 Agent”'}</small></span>
              <button type="button" className="secondary-button compact" onClick={onChooseFolder} disabled={choosingFolder}>{choosingFolder ? <LoaderCircle size={14} className="spin" /> : <FolderOpen size={14} />} 选择</button>
            </div>
            <div className="settings-card-row">
              <span className="settings-card-icon"><Database size={17} /></span>
              <span className="settings-card-copy"><strong>本机优先存储</strong><small>{workspace.projects.length} 个研究 · {workspace.conversations.length} 个对话 · 数据默认不上传到学术 Agent 服务器。</small></span>
              <StatusBadge status="connected">已启用</StatusBadge>
            </div>
          </section>
        </div>
      </section>
    )
  }

  if (section === 'personalization') {
    return (
      <section className="settings-hub-page">
        <SettingsSectionHeader section="personalization" />
        <div className="settings-content-column">
          <h2>应用内个性化</h2>
          <section className="settings-card">
            <div className="settings-card-row">
              <span className="settings-card-icon"><Sparkles size={17} /></span>
              <span className="settings-card-copy"><strong>Skills</strong><small>{workspace.skills.filter((skill) => skill.enabled).length} 个已启用；只读取学术 Agent 自己维护的 Skills。</small></span>
              <button type="button" className="primary-button compact" onClick={onOpenSkills}>管理 Skills</button>
            </div>
          </section>
        </div>
      </section>
    )
  }

  if (section === 'shortcuts') {
    const shortcuts = [
      ['发送消息', 'Enter'],
      ['输入框换行', 'Shift', 'Enter'],
      ['关闭菜单或弹窗', 'Esc'],
      ['微调已聚焦的侧栏宽度', '←', '→'],
      ['恢复侧栏默认宽度', 'Home'],
    ]
    return (
      <section className="settings-hub-page">
        <SettingsSectionHeader section="shortcuts" />
        <div className="settings-content-column"><h2>当前快捷键</h2><section className="settings-card shortcut-list">
          {shortcuts.map(([label, ...keys]) => <div className="settings-card-row" key={label}><span className="settings-card-copy"><strong>{label}</strong></span><span className="shortcut-keys">{keys.map((key) => <kbd key={key}>{key}</kbd>)}</span></div>)}
        </section></div>
      </section>
    )
  }

  const plannedAction = (name: string) => onToast(`${name}入口已经建立，系统能力将在后续版本接入`)
  const plannedContent: Record<Exclude<SettingsSection, 'general' | 'appearance' | 'configuration' | 'personalization' | 'shortcuts' | 'archived'>, Array<[LucideIcon, string, string]>> = {
    voice: [[Mic, '语音转写', '入口已保留；麦克风授权、录音与本机转写尚未接入。']],
    'app-snapshot': [[Camera, '连续按两次 Command', '计划捕获当前应用窗口并作为本轮对话附件；当前不会监听全局键盘或截取屏幕。']],
    browser: [[ExternalLink, '受控浏览器', '计划由用户明确启动网页研究任务；当前不会读取浏览器历史或标签页。']],
    'computer-control': [[Monitor, '电脑控制', '计划复用真实 macOS 权限中心；当前不会自动点击、输入或控制其他应用。']],
    hooks: [[PlugZap, '任务钩子', '计划为检索完成、提纲完成和导出完成等阶段提供应用内触发器。']],
    connections: [[ExternalLink, '执行连接', '计划管理隔离的本机与远程执行连接，不读取系统或 Codex 的连接配置。']],
    git: [[GitBranch, 'Git 仓库', '计划让研究项目选择性连接仓库；当前不会修改任何仓库。']],
    environment: [[Database, '任务环境', '计划显示可用运行环境与显式环境变量，不读取系统敏感变量。']],
    worktrees: [[FolderOpen, '独立工作树', '计划为并行任务创建受控工作树；当前不会创建或删除目录。']],
  }
  const plannedItems = plannedContent[section]
  return (
    <section className="settings-hub-page">
      <SettingsSectionHeader section={section} />
      <div className="settings-content-column">
        {section === 'app-snapshot' && <div className="snapshot-shortcut-preview" aria-label="连续按两次 Command"><kbd>⌘</kbd><span>再按一次</span><kbd>⌘</kbd></div>}
        <h2>{['appearance', 'voice'].includes(section) ? '设置' : '能力'}</h2>
        <section className="settings-card">
          {plannedItems.map(([Icon, title, description]) => (
            <PlannedSetting key={title} icon={Icon} title={title} description={description} actionLabel="查看状态" onAction={() => plannedAction(title)} />
          ))}
        </section>
        <div className="settings-boundary-note"><CircleAlert size={16} /><span>这是可操作的设置入口，不代表系统能力已经启用。接入完成前，应用不会静默申请权限或执行相关操作。</span></div>
      </div>
    </section>
  )
}

function emptySkillInput(): SkillInput {
  return {
    name: '',
    description: '',
    instructions: '',
    enabled: true,
  }
}

function SkillsPage({
  skills,
  onRefresh,
  onToast,
}: {
  skills: SkillDefinition[]
  onRefresh: () => Promise<void>
  onToast: (message: string, tone?: 'success' | 'error') => void
}) {
  const [selectedId, setSelectedId] = useState<string>('new')
  const [form, setForm] = useState<SkillInput>(emptySkillInput)
  const [busy, setBusy] = useState<'save' | 'delete'>()
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const selected = skills.find((skill) => skill.id === selectedId)
  const enabledCount = skills.filter((skill) => skill.enabled).length

  useEffect(() => {
    if (!selected) {
      if (selectedId !== 'new' && skills.length > 0) {
        setSelectedId(skills[0].id)
      } else if (selectedId === 'new' && skills.length === 0) {
        setSelectedId('new')
        setForm(emptySkillInput())
      }
      return
    }
    setForm({
      id: selected.id,
      name: selected.name,
      description: selected.description,
      instructions: selected.instructions,
      enabled: selected.enabled,
    })
  }, [selectedId, selected, skills])

  const startNew = () => {
    setSelectedId('new')
    setForm(emptySkillInput())
    setDeleteConfirmOpen(false)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!form.name.trim() || !form.instructions.trim()) {
      onToast('请填写 Skill 名称和指令', 'error')
      return
    }
    setBusy('save')
    try {
      const saved = await paperAgent.skill.save({
        ...form,
        name: form.name.trim(),
        description: form.description.trim(),
        instructions: form.instructions.trim(),
      })
      setSelectedId(saved.id)
      await onRefresh()
      onToast(form.id ? 'Skill 已更新' : 'Skill 已添加')
    } catch (error) {
      onToast(error instanceof Error ? error.message : '保存 Skill 失败', 'error')
    } finally {
      setBusy(undefined)
    }
  }

  const remove = async () => {
    if (!selected) return
    setBusy('delete')
    try {
      await paperAgent.skill.delete(selected.id)
      const nextSkill = skills.find((skill) => skill.id !== selected.id)
      setSelectedId(nextSkill?.id ?? 'new')
      if (!nextSkill) setForm(emptySkillInput())
      await onRefresh()
      setDeleteConfirmOpen(false)
      onToast('Skill 已删除')
    } catch (error) {
      onToast(error instanceof Error ? error.message : '删除 Skill 失败', 'error')
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <section className="route-page skills-page">
      <header className="route-header skills-route-header">
        <div>
          <span className="route-kicker">应用内能力</span>
          <h1>Skills</h1>
          <p>把固定的研究方法、写作规范和输出偏好保存为可复用指令；启用后用于新的提纲、章节和对话请求。</p>
        </div>
        <span className="skills-count">{enabledCount} 个启用 · {skills.length} 个已添加</span>
      </header>

      <div className="settings-workbench skills-workbench">
        <aside className="settings-list skills-list" aria-label="应用内 Skills">
          <div className="settings-list-head">
            <strong>我的 Skills</strong>
            <IconButton icon={Plus} label="添加 Skill" onClick={startNew} />
          </div>
          {skills.length === 0 ? (
            <button type="button" className="skills-empty-list" onClick={startNew}>
              <Sparkles size={18} aria-hidden="true" />
              <span><strong>尚未添加 Skill</strong><small>从右侧创建第一条应用内指令</small></span>
            </button>
          ) : (
            skills.map((skill) => (
              <button
                type="button"
                className={`settings-row${selectedId === skill.id ? ' is-active' : ''}`}
                key={skill.id}
                onClick={() => {
                  setSelectedId(skill.id)
                  setDeleteConfirmOpen(false)
                }}
                aria-pressed={selectedId === skill.id}
              >
                <span className="settings-row-icon"><Sparkles size={16} aria-hidden="true" /></span>
                <span><strong>{skill.name}</strong><small>{skill.description || '未填写说明'}</small></span>
                <span className={`skill-enabled-state${skill.enabled ? ' is-enabled' : ''}`} aria-label={skill.enabled ? '已启用' : '未启用'}>
                  <CircleDot size={10} aria-hidden="true" />
                </span>
              </button>
            ))
          )}
        </aside>

        <main className="settings-detail skills-detail">
          <div className="settings-detail-head">
            <div>
              <h2>{selected ? `编辑 ${selected.name}` : '添加 Skill'}</h2>
              <p>Skill 是纯文本指令。应用只会在你主动发起生成或对话时，把启用项加入当前请求上下文。</p>
            </div>
          </div>

          <div className="skill-isolation-note" role="note">
            <ShieldCheck size={17} aria-hidden="true" />
            <span><strong>与系统配置完全隔离</strong><small>仅保存在学术 Agent 工作区，不读取 ~/.codex、系统 Skills、其他应用 Skills 或系统 MCP 配置。</small></span>
          </div>

          <form className="settings-form skills-form" onSubmit={submit}>
            <label className="field">
              <span>名称 <small>{form.name.length}/{SKILL_LIMITS.name}</small></span>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                maxLength={SKILL_LIMITS.name}
                placeholder="例如：中文学术写作规范"
                required
              />
            </label>
            <label className="field">
              <span>说明 <small>{form.description.length}/{SKILL_LIMITS.description}</small></span>
              <input
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                maxLength={SKILL_LIMITS.description}
                placeholder="说明这条 Skill 适合什么任务"
              />
            </label>
            <label className="field skill-instructions-field">
              <span>指令 <small>{form.instructions.length}/{SKILL_LIMITS.instructions}</small></span>
              <textarea
                value={form.instructions}
                onChange={(event) => setForm({ ...form, instructions: event.target.value })}
                maxLength={SKILL_LIMITS.instructions}
                placeholder={'写下希望 Agent 持续遵循的研究或写作规则。\n例如：章节先说明研究问题，再组织可核验文献证据；不把摘要信息表述为全文结论。'}
                required
              />
            </label>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
              />
              <span><strong>启用此 Skill</strong><small>关闭后仍保存在本机，但不会加入模型上下文</small></span>
            </label>
            <div className="settings-form-actions">
              {selected ? (
                deleteConfirmOpen ? (
                  <span className="skill-delete-confirm" role="group" aria-label={`确认删除 ${selected.name}`}>
                    <button type="button" className="secondary-button" onClick={() => setDeleteConfirmOpen(false)} disabled={Boolean(busy)}>取消</button>
                    <button type="button" className="danger-button" onClick={remove} disabled={Boolean(busy)}>
                      {busy === 'delete' ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />}
                      确认删除
                    </button>
                  </span>
                ) : (
                  <button type="button" className="danger-button" onClick={() => setDeleteConfirmOpen(true)} disabled={Boolean(busy)}>
                    <Trash2 size={15} /> 删除
                  </button>
                )
              ) : <span />}
              <span />
              <button type="button" className="secondary-button" onClick={startNew} disabled={Boolean(busy)}>清空</button>
              <button type="submit" className="primary-button compact" disabled={Boolean(busy)}>
                {busy === 'save' ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
                {selected ? '保存修改' : '添加 Skill'}
              </button>
            </div>
          </form>
        </main>
      </div>
    </section>
  )
}

export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(emptyWorkspace)
  const [loading, setLoading] = useState(true)
  const [route, setRoute] = useState<Route>('workspace')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general')
  const [centerMode, setCenterMode] = useState<CenterMode>('chat')
  const [rightTab, setRightTab] = useState<RightTab>('literature')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH)
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
  const [permissionCenterOpen, setPermissionCenterOpen] = useState(false)
  const [systemPermissions, setSystemPermissions] = useState<SystemPermissionSnapshot>()
  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  const [permissionBusy, setPermissionBusy] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' }>()
  const settingsReturnRouteRef = useRef<Route>('workspace')

  const refreshWorkspace = async () => {
    const next = await paperAgent.workspace.get()
    setWorkspace((current) => {
      for (const streamed of current.sections.filter((section) => section.status === 'generating')) {
        const persisted = next.sections.find((section) => section.id === streamed.id)
        if (!persisted || persisted.status !== 'generating') continue
        if (streamed.content.length > persisted.content.length) persisted.content = streamed.content
        if ((streamed.reasoningContent?.length ?? 0) > (persisted.reasoningContent?.length ?? 0)) {
          persisted.reasoningContent = streamed.reasoningContent
        }
        persisted.wordCount = Math.max(persisted.wordCount, streamed.wordCount)
        persisted.generationProviderId = streamed.generationProviderId
        persisted.generationModel = streamed.generationModel
        persisted.thinkingRequested = streamed.thinkingRequested
      }
      return next
    })
  }

  useEffect(() => {
    refreshWorkspace()
      .catch(() => setToast({ message: '无法读取本机工作区', tone: 'error' }))
      .finally(() => setLoading(false))
    paperAgent.systemPermissions.get()
      .then(setSystemPermissions)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setPrefersDark(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (typeof workspace.settings.sidebarWidth === 'number') {
      setSidebarWidth(workspace.settings.sidebarWidth)
    }
  }, [workspace.settings.sidebarWidth])

  useEffect(() => {
    if (typeof workspace.settings.rightPanelWidth === 'number') {
      setRightPanelWidth(workspace.settings.rightPanelWidth)
    }
  }, [workspace.settings.rightPanelWidth])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(undefined), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (route !== 'settings') settingsReturnRouteRef.current = route
  }, [route])

  useEffect(() => {
    const dispose = paperAgent.chat.onEvent((event) => {
      setWorkspace((current) => {
        const next = structuredClone(current)
        if (event.type === 'started') {
          if (!next.messages.some((message) => message.id === event.message.id)) next.messages.push(event.message)
        } else if (event.type === 'text-delta') {
          const message = next.messages.find((item) => item.runId === event.runId)
          if (message) message.content += event.delta
        } else if (event.type === 'reasoning-delta') {
          const message = next.messages.find((item) => item.runId === event.runId)
          if (message) message.reasoningContent = `${message.reasoningContent ?? ''}${event.delta}`
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
    const dispose = paperAgent.section.onEvent((event) => {
      setWorkspace((current) => {
        const next = structuredClone(current)
        const index = next.sections.findIndex((section) => section.id === event.sectionId)
        if (index < 0) return current
        const section = next.sections[index]
        if (event.type === 'started') {
          section.status = 'generating'
          section.content = ''
          section.wordCount = 0
          section.reasoningContent = undefined
          section.generationError = undefined
          section.generationProviderId = event.providerId
          section.generationModel = event.model
          section.thinkingRequested = event.thinkingRequested
        } else if (event.type === 'text-delta') {
          section.content += event.delta
          section.wordCount = section.content.replace(/\s+/g, '').length
        } else if (event.type === 'reasoning-delta') {
          section.reasoningContent = `${section.reasoningContent ?? ''}${event.delta}`
        } else if (event.type === 'completed' || event.type === 'error') {
          next.sections[index] = event.section
        }
        return next
      })
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

  const openSettings = (section: SettingsSection = 'general') => {
    setSettingsSection(section)
    setRoute('settings')
  }

  const closeSettings = () => {
    setRoute(settingsReturnRouteRef.current === 'settings' ? 'workspace' : settingsReturnRouteRef.current)
  }

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

  const selectConversation = async (projectId: string, conversationId: string) => {
    try {
      const next = await paperAgent.conversation.setActive(projectId, conversationId)
      setWorkspace(next)
      setRoute('workspace')
      setCenterMode('chat')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '切换对话失败', 'error')
    }
  }

  const createConversation = async (projectId: string) => {
    try {
      const next = await paperAgent.conversation.create(projectId)
      setWorkspace(next)
      setRoute('workspace')
      setCenterMode('chat')
      showToast('已在该研究中新建对话')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '新建对话失败', 'error')
    }
  }

  const updateConversation = async (input: ConversationUpdateInput) => {
    try {
      const next = await paperAgent.conversation.update(input)
      setWorkspace(next)
      if (input.archived === true) showToast('聊天已归档，可在“整理侧边栏”中重新显示')
      else if (input.archived === false) showToast('聊天已取消归档')
      else if (input.pinned === true) showToast('聊天已置顶')
      else if (input.pinned === false) showToast('已取消置顶聊天')
      else if (input.title !== undefined) showToast('聊天名称已更新')
      else if (input.goal !== undefined) showToast(input.goal.trim() ? '对话目标已更新' : '对话目标已清除')
      else if (input.planMode !== undefined) showToast(input.planMode ? '计划模式已开启' : '计划模式已关闭')
      else if (input.accessMode !== undefined) showToast(input.accessMode === 'full' ? '当前对话已切换为完全访问权限' : '当前对话已恢复默认权限')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '更新聊天失败', 'error')
      throw error
    }
  }

  const restoreConversation = async (conversationId: string) => {
    await updateConversation({ conversationId, archived: false })
  }

  const restoreAndOpenConversation = async (projectId: string, conversationId: string) => {
    try {
      await paperAgent.conversation.update({ conversationId, archived: false })
      const next = await paperAgent.conversation.setActive(projectId, conversationId)
      setWorkspace(next)
      setRoute('workspace')
      setCenterMode('chat')
      showToast('聊天已恢复并打开')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '恢复聊天失败', 'error')
      throw error
    }
  }

  const refreshSystemPermissions = async () => {
    setPermissionBusy(true)
    try {
      const next = await paperAgent.systemPermissions.get()
      setSystemPermissions(next)
      return next
    } catch (error) {
      showToast(error instanceof Error ? error.message : '无法读取 macOS 权限状态', 'error')
      throw error
    } finally {
      setPermissionBusy(false)
    }
  }

  const requestFullAccess = async () => {
    setPermissionCenterOpen(true)
    setPermissionBusy(true)
    try {
      const next = await paperAgent.systemPermissions.requestFullAccess()
      setSystemPermissions(next)
      if (next.platform === 'unsupported') {
        showToast('浏览器演示无法申请 macOS 权限，请使用桌面应用', 'error')
      } else if (next.fullAccessReady && conversation) {
        await updateConversation({ conversationId: conversation.id, accessMode: 'full' })
      } else {
        showToast('请在 macOS 系统设置完成必需授权，再返回重新检测', 'error')
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '申请 macOS 权限失败', 'error')
    } finally {
      setPermissionBusy(false)
    }
  }

  const requestConversationAccessMode = async (mode: ConversationAccessMode) => {
    if (!conversation) return
    if (mode === 'ask') {
      await updateConversation({ conversationId: conversation.id, accessMode: 'ask' })
      return
    }
    await requestFullAccess()
  }

  const openSystemPermissionSettings = async (kind: SystemPermissionKind) => {
    try {
      await paperAgent.systemPermissions.openSettings(kind)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '无法打开 macOS 系统设置', 'error')
    }
  }

  const enableFullAccess = async () => {
    if (!conversation) return
    const next = await refreshSystemPermissions()
    if (!next.fullAccessReady) {
      showToast('真实系统权限尚未满足，不能启用完全访问', 'error')
      return
    }
    await updateConversation({ conversationId: conversation.id, accessMode: 'full' })
    setPermissionCenterOpen(false)
  }

  const chooseConversationAttachments = async () => {
    if (!conversation) return
    try {
      const next = await paperAgent.conversation.chooseAttachments(conversation.id)
      setWorkspace(next)
      const count = next.attachments.filter((item) => item.conversationId === conversation.id).length
      showToast(count > 0 ? `当前对话已关联 ${count} 个附件` : '未选择附件')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '添加附件失败', 'error')
    }
  }

  const removeConversationAttachment = async (attachmentId: string) => {
    try {
      const next = await paperAgent.conversation.removeAttachment(attachmentId)
      setWorkspace(next)
      showToast('附件已从当前对话移除')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '移除附件失败', 'error')
    }
  }

  const moveConversation = async (conversationId: string, targetProjectId: string) => {
    try {
      const next = await paperAgent.conversation.move(conversationId, targetProjectId)
      setWorkspace(next)
      setRoute('workspace')
      setCenterMode('chat')
      showToast('聊天已移至目标研究')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '移动聊天失败', 'error')
      throw error
    }
  }

  const copyConversationId = async (conversationId: string) => {
    try {
      await paperAgent.conversation.copyId(conversationId)
      showToast('会话 ID 已复制')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '复制会话 ID 失败', 'error')
      throw error
    }
  }

  const setProjectPinned = async (projectId: string, pinned: boolean) => {
    try {
      const next = await paperAgent.project.setPinned(projectId, pinned)
      setWorkspace(next)
      showToast(pinned ? '项目已置顶' : '已取消置顶')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '更新项目置顶状态失败', 'error')
    }
  }

  const setSidebarPreferences = async (input: SidebarPreferencesInput) => {
    try {
      const next = await paperAgent.workspace.setSidebarPreferences(input)
      setWorkspace(next)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '更新侧边栏设置失败', 'error')
    }
  }

  const updateAppearance = async (input: AppearanceSettingsInput) => {
    const next = await paperAgent.appearance.update(input)
    setWorkspace(next)
  }

  const importAppearanceTheme = async () => {
    try {
      const before = JSON.stringify(workspace.settings.appearance)
      const next = await paperAgent.appearance.importTheme()
      setWorkspace(next)
      showToast(JSON.stringify(next.settings.appearance) === before ? '已取消导入' : '主题已导入并立即应用')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导入主题失败', 'error')
    }
  }

  const copyAppearanceTheme = async () => {
    try {
      await paperAgent.appearance.copyTheme()
      showToast('当前主题 JSON 已复制到剪贴板')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '复制主题失败', 'error')
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

  const revealResearchFolder = async (projectId: string) => {
    try {
      await paperAgent.project.revealFolder(projectId)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '无法在 Finder 中显示研究文件夹', 'error')
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

  const sendMessage = async (content: string, contextReferences: ChatContextReference[]): Promise<boolean> => {
    if (!activeProject || !conversation || !activeProviderId || !activeModel) return false
    const contextScope = centerMode === 'manuscript' ? 'section' : 'project'
    if (centerMode === 'manuscript') setCenterMode('chat')
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
      contextScope,
      contextReferences,
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
        contextScope,
        contextReferences,
      })
      setActiveRunId(result.runId)
      const persisted = await paperAgent.workspace.get()
      setWorkspace((current) => {
        const streamed = current.messages.find((item) => item.runId === result.runId)
        if (streamed) {
          const index = persisted.messages.findIndex((item) => item.runId === result.runId)
          if (index >= 0) {
            const persistedMessage = persisted.messages[index]
            if (streamed.content.length > persistedMessage.content.length) {
              persistedMessage.content = streamed.content
            }
            if ((streamed.reasoningContent?.length ?? 0) > (persistedMessage.reasoningContent?.length ?? 0)) {
              persistedMessage.reasoningContent = streamed.reasoningContent
            }
          }
        }
        return persisted
      })
      return true
    } catch (error) {
      setWorkspace((current) => ({ ...current, messages: current.messages.filter((item) => item.id !== optimistic.id) }))
      showToast(error instanceof Error ? error.message : '无法开始生成', 'error')
      return false
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
    const sectionId = selectedSection.id
    setWorkspace((current) => {
      const next = structuredClone(current)
      const section = next.sections.find((item) => item.id === sectionId)
      if (section) {
        section.status = 'generating'
        section.content = ''
        section.wordCount = 0
        section.reasoningContent = undefined
        section.generationError = undefined
        section.generationProviderId = activeProviderId
        section.generationModel = activeModel
      }
      return next
    })
    try {
      await paperAgent.section.generate({ projectId: activeProject.id, sectionId, providerId: activeProviderId, model: activeModel })
      await refreshWorkspace()
      showToast('章节草稿已生成')
    } catch (error) {
      await refreshWorkspace().catch(() => undefined)
      showToast('章节生成中断，已保留模型返回的正文片段', 'error')
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
    <main
      className={`app-shell${sidebarCollapsed && route !== 'settings' ? ' sidebar-collapsed' : ''}${rightOpen ? '' : ' right-collapsed'}${route === 'settings' ? ' settings-mode' : ''}`}
      data-theme={workspace.settings.appearance.theme === 'system' ? (prefersDark ? 'dark' : 'light') : workspace.settings.appearance.theme}
      data-pointer-cursor={workspace.settings.appearance.pointerCursor ? 'on' : 'off'}
      data-reduced-motion={workspace.settings.appearance.reducedMotion}
      data-font-smoothing={workspace.settings.appearance.fontSmoothing ? 'on' : 'off'}
      data-translucent-sidebar={workspace.settings.appearance.translucentSidebar ? 'on' : 'off'}
      data-diff-style={workspace.settings.appearance.diffStyle}
      style={{
        '--sidebar-width': `${sidebarWidth}px`,
        '--expanded-right-width': `${rightPanelWidth}px`,
        ...appearanceVariables(workspace.settings.appearance, prefersDark),
      } as CSSProperties}
    >
      {route === 'settings' ? (
        <SettingsSidebar
          activeSection={settingsSection}
          onSection={setSettingsSection}
          onBack={closeSettings}
          sidebarWidth={sidebarWidth}
          onSidebarWidthChange={setSidebarWidth}
          onSidebarWidthCommit={(width) => setSidebarPreferences({ sidebarWidth: width })}
        />
      ) : (
        <Sidebar
          workspace={workspace}
          activeProjectId={activeProject?.id}
          route={route}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((current) => !current)}
          onRoute={setRoute}
          onOpenSettings={openSettings}
          onProject={selectProject}
          onConversation={selectConversation}
          onCreateConversation={createConversation}
          onUpdateConversation={updateConversation}
          onMoveConversation={moveConversation}
          onCopyConversationId={copyConversationId}
          onPinProject={setProjectPinned}
          onSetPreferences={setSidebarPreferences}
          onCreate={() => setNewProjectOpen(true)}
          onChooseFolder={chooseResearchFolder}
          onDeleteProject={setProjectPendingDeletionId}
          onRevealProject={revealResearchFolder}
          sidebarWidth={sidebarWidth}
          onSidebarWidthChange={setSidebarWidth}
          onSidebarWidthCommit={(width) => setSidebarPreferences({ sidebarWidth: width })}
          choosingFolder={choosingFolder}
        />
      )}

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
              <div className={`center-body${centerMode === 'manuscript' ? ' is-manuscript' : ''}`}>
                <div className="center-scroll">
                  {centerMode === 'chat' ? (
                    <ChatView messages={messages} projectTitle={activeProject.title} onShowLiterature={() => { setRightTab('literature'); setRightOpen(true) }} />
                  ) : (
                    <ManuscriptView
                      section={selectedSection}
                      generationProviderName={workspace.providers.find((provider) => provider.id === selectedSection?.generationProviderId)?.name}
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
                      onConfigureModel={() => openSettings('configuration')}
                    />
                  )}
                </div>
                <Composer
                  providers={workspace.providers}
                  activeProviderId={activeProviderId}
                  activeModel={activeModel}
                  conversation={conversation}
                  attachments={workspace.attachments.filter((item) => item.conversationId === conversation?.id)}
                  skills={workspace.skills}
                  mcpServers={workspace.mcpServers}
                  running={Boolean(activeRunId)}
                  contextLabel={centerMode === 'manuscript' ? '当前章节与项目上下文' : '项目与稿件上下文'}
                  onSelectModel={selectModel}
                  onSend={sendMessage}
                  onCancel={cancelRun}
                  onSettings={() => openSettings('configuration')}
                  onUpdateConversation={updateConversation}
                  onChooseAttachments={chooseConversationAttachments}
                  onRemoveAttachment={removeConversationAttachment}
                  onRequestAccessMode={requestConversationAccessMode}
                  onManagePermissions={() => {
                    setPermissionCenterOpen(true)
                    void refreshSystemPermissions()
                  }}
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
              onConfigureModel={() => openSettings('configuration')}
              onRefresh={() => {
                refreshWorkspace().catch((error) => {
                  showToast(error instanceof Error ? error.message : '刷新工作台失败', 'error')
                })
              }}
              onCloseDrawer={() => setRightOpen(false)}
              width={rightPanelWidth}
              onWidthChange={setRightPanelWidth}
              onWidthCommit={(width) => setSidebarPreferences({ rightPanelWidth: width })}
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

      {route === 'skills' && (
        <div className="full-route-column">
          <div className="route-titlebar window-drag-region"><span>学术 Agent · Skills</span></div>
          <SkillsPage skills={workspace.skills} onRefresh={refreshWorkspace} onToast={showToast} />
        </div>
      )}

      {route === 'settings' && (
        <div className="full-route-column settings-route-column">
          <div className="route-titlebar window-drag-region"><span>学术 Agent · 设置</span></div>
          <SettingsPage
            section={settingsSection}
            workspace={workspace}
            systemPermissions={systemPermissions}
            choosingFolder={choosingFolder}
            onRefresh={refreshWorkspace}
            onToast={showToast}
            onManagePermissions={() => {
              setPermissionCenterOpen(true)
              void refreshSystemPermissions()
            }}
            onChooseFolder={chooseResearchFolder}
            onOpenSkills={() => setRoute('skills')}
            onAppearanceChange={updateAppearance}
            onAppearanceImport={importAppearanceTheme}
            onAppearanceCopy={copyAppearanceTheme}
            onRestoreConversation={restoreConversation}
            onRestoreAndOpen={restoreAndOpenConversation}
          />
        </div>
      )}

      <NewProjectDialog open={newProjectOpen} busy={creatingProject} onClose={() => setNewProjectOpen(false)} onCreate={createProject} />
      <DeleteProjectDialog
        project={projectPendingDeletion}
        busy={deletingProject}
        onClose={() => !deletingProject && setProjectPendingDeletionId(undefined)}
        onConfirm={deleteProject}
      />
      <SystemPermissionDialog
        open={permissionCenterOpen}
        snapshot={systemPermissions}
        busy={permissionBusy}
        onClose={() => setPermissionCenterOpen(false)}
        onRequest={() => { void requestFullAccess() }}
        onRefresh={() => { void refreshSystemPermissions().catch(() => undefined) }}
        onOpenSettings={(kind) => { void openSystemPermissionSettings(kind) }}
        onEnable={() => { void enableFullAccess().catch(() => undefined) }}
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
