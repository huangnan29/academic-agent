// 研究树与平铺对话列表，统一承载项目和对话的拖拽排序。
import { type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import type { WorkspaceState } from '../../../shared/contracts'
import type { Route } from '../../lib/ui'
import { moveIdBefore } from '../../lib/conversation'
import { FlatConversationRow } from './ConversationRow'
import { ProjectRow } from './ProjectRow'
import type {
  SidebarConversations,
  SidebarDerivedData,
  SidebarDragState,
} from './types'

export function ProjectTree({
  workspace,
  activeProjectId,
  route,
  derived,
  openProjectMenuId,
  setOpenProjectMenuId,
  dragged,
  setDragged,
  projectMenuRefs,
  projectMenuTriggerRefs,
  onMenuKeyDown,
  onProject,
  onConversation,
  onCreateConversation,
  onPinProject,
  onSetPreferences,
  onDeleteProject,
  onRevealProject,
  onOpenConversationMenu,
}: {
  workspace: WorkspaceState
  activeProjectId?: string
  route: Route
  derived: SidebarDerivedData
  openProjectMenuId?: string
  setOpenProjectMenuId: (projectId: string | undefined) => void
  dragged?: SidebarDragState
  setDragged: (dragged: SidebarDragState | undefined) => void
  projectMenuRefs: { current: Record<string, HTMLDivElement | null> }
  projectMenuTriggerRefs: { current: Record<string, HTMLButtonElement | null> }
  onMenuKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
  onProject: (projectId: string) => void
  onConversation: (projectId: string, conversationId: string) => void
  onCreateConversation: (projectId: string) => void
  onPinProject: (projectId: string, pinned: boolean) => void
  onSetPreferences: (input: import('../../../shared/contracts').SidebarPreferencesInput) => void
  onDeleteProject: (projectId: string) => void
  onRevealProject: (projectId: string) => void
  onOpenConversationMenu: (event: ReactMouseEvent, projectId: string, conversationId: string) => void
}) {
  const {
    viewMode,
    chatSort,
    expandedIds,
    projectById,
    sortedProjects,
    flatConversations,
    sortConversations,
  } = derived

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

  const reorderConversations = (items: SidebarConversations, targetId: string) => {
    if (dragged?.kind !== 'conversation') return
    onSetPreferences({ conversationOrder: moveIdBefore(items.map((item) => item.id), dragged.id, targetId) })
    setDragged(undefined)
  }

  return (
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
            <ProjectRow
              key={project.id}
              project={project}
              active={active}
              route={route}
              expanded={expanded}
              menuOpen={menuOpen}
              projectConversations={projectConversations}
              manualSort={chatSort === 'manual'}
              onCloseProjectMenu={() => setOpenProjectMenuId(undefined)}
              onToggleProject={toggleProject}
              onProject={onProject}
              onCreateConversation={onCreateConversation}
              onToggleProjectMenu={setOpenProjectMenuId}
              onPinProject={onPinProject}
              onRevealProject={onRevealProject}
              onDeleteProject={onDeleteProject}
              projectMenuRef={(element) => { projectMenuRefs.current[project.id] = element }}
              projectMenuTriggerRef={(element) => { projectMenuTriggerRefs.current[project.id] = element }}
              onMenuKeyDown={onMenuKeyDown}
              onConversation={onConversation}
              onOpenConversationMenu={onOpenConversationMenu}
              onSetDragged={setDragged}
              onReorderProjects={reorderProjects}
              onReorderConversations={reorderConversations}
            />
          )
        }) : (
          <div className="flat-conversation-list" aria-label="全部研究对话">
            {flatConversations.map((conversation) => {
              const project = projectById.get(conversation.projectId)
              if (!project) return null
              const selected = project.id === activeProjectId && project.activeConversationId === conversation.id && route === 'workspace'
              return (
                <FlatConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  project={project}
                  selected={selected}
                  manualSort={chatSort === 'manual'}
                  conversationItems={flatConversations}
                  onConversation={onConversation}
                  onOpenConversationMenu={onOpenConversationMenu}
                  onSetDragged={setDragged}
                  onReorderConversations={reorderConversations}
                />
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
