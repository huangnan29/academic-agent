// 侧栏项目、对话的视图状态与排序规则。
import { useMemo } from 'react'
import type { WorkspaceState } from '../../../shared/contracts'
import type { SidebarDerivedData } from './types'

export function useSidebarDerivedData(workspace: WorkspaceState): SidebarDerivedData {
  const viewMode = workspace.settings.sidebarViewMode ?? 'projects'
  const chatSort = workspace.settings.sidebarChatSort ?? 'priority'
  const showArchived = workspace.settings.sidebarShowArchived === true

  return useMemo(() => {
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

    return {
      viewMode,
      chatSort,
      showArchived,
      expandedIds,
      projectById,
      sortedProjects,
      flatConversations: sortConversations(workspace.conversations),
      sortConversations,
    }
  }, [chatSort, showArchived, viewMode, workspace])
}
