// 研究区左侧栏：项目树、对话管理与拖拽排序；从 App.tsx 抽出。
import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronRight,
  Copy,
  Database,
  FilePenLine,
  Folder,
  FolderInput,
  FolderOpen,
  GripVertical,
  LayoutList,
  Library,
  ListTree,
  LoaderCircle,
  Mail,
  MailOpen,
  MessageSquarePlus,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PencilLine,
  Pin,
  PinOff,
  Plus,
  PlugZap,
  Save,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import {
  FormEvent,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type {
  Conversation,
  ConversationUpdateInput,
  SidebarPreferencesInput,
  WorkspaceState,
} from '../../shared/contracts'
import { conversationDisplayTitle, moveIdBefore } from '../lib/conversation'
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  type Route,
  type SettingsSection,
} from '../lib/ui'
import { IconButton } from './common'

interface ConversationMenuState {
  projectId: string
  conversationId: string
  x: number
  y: number
}

export function Sidebar({
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
