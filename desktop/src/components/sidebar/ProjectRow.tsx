// 项目树中的单个研究项目及其展开后的对话列表。
import {
  ChevronRight,
  Folder,
  FolderOpen,
  MessageSquarePlus,
  MoreHorizontal,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, RefCallback } from 'react'
import type { Route } from '../../lib/ui'
import { ProjectConversationRow } from './ConversationRow'
import type {
  SidebarConversations,
  SidebarDragState,
  SidebarProject,
} from './types'

export function ProjectRow({
  project,
  active,
  route,
  expanded,
  menuOpen,
  projectConversations,
  manualSort,
  onCloseProjectMenu,
  onToggleProject,
  onProject,
  onCreateConversation,
  onToggleProjectMenu,
  onPinProject,
  onRevealProject,
  onDeleteProject,
  projectMenuRef,
  projectMenuTriggerRef,
  onMenuKeyDown,
  onConversation,
  onOpenConversationMenu,
  onSetDragged,
  onReorderProjects,
  onReorderConversations,
}: {
  project: SidebarProject
  active: boolean
  route: Route
  expanded: boolean
  menuOpen: boolean
  projectConversations: SidebarConversations
  manualSort: boolean
  onCloseProjectMenu: () => void
  onToggleProject: (projectId: string) => void
  onProject: (projectId: string) => void
  onCreateConversation: (projectId: string) => void
  onToggleProjectMenu: (projectId: string | undefined) => void
  onPinProject: (projectId: string, pinned: boolean) => void
  onRevealProject: (projectId: string) => void
  onDeleteProject: (projectId: string) => void
  projectMenuRef: RefCallback<HTMLDivElement>
  projectMenuTriggerRef: RefCallback<HTMLButtonElement>
  onMenuKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
  onConversation: (projectId: string, conversationId: string) => void
  onOpenConversationMenu: (event: ReactMouseEvent, projectId: string, conversationId: string) => void
  onSetDragged: (dragged: SidebarDragState) => void
  onReorderProjects: (targetId: string) => void
  onReorderConversations: (items: SidebarConversations, targetId: string) => void
}) {
  return (
    <div
      className={`research-group${active ? ' is-active' : ''}${active && route === 'workspace' ? ' is-current' : ''}${menuOpen ? ' is-menu-open' : ''}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onCloseProjectMenu()
      }}
      draggable={manualSort}
      onDragStart={() => onSetDragged({ kind: 'project', id: project.id })}
      onDragOver={(event) => { if (manualSort) event.preventDefault() }}
      onDrop={() => onReorderProjects(project.id)}
    >
      <div className="research-group-header">
        <button
          type="button"
          className="research-folder-button"
          onClick={() => {
            onCloseProjectMenu()
            if (!active || route !== 'workspace') onProject(project.id)
            onToggleProject(project.id)
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
          ref={projectMenuTriggerRef}
          aria-label={`管理研究：${project.title}`}
          title="研究操作"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? `project-menu-${project.id}` : undefined}
          onClick={() => onToggleProjectMenu(menuOpen ? undefined : project.id)}
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
          ref={projectMenuRef}
          onKeyDown={onMenuKeyDown}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCloseProjectMenu()
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
              onCloseProjectMenu()
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
              onCloseProjectMenu()
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
              return (
                <ProjectConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  project={project}
                  selected={selected}
                  manualSort={manualSort}
                  projectConversations={projectConversations}
                  onConversation={onConversation}
                  onOpenConversationMenu={onOpenConversationMenu}
                  onSetDragged={onSetDragged}
                  onReorderConversations={onReorderConversations}
                />
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
