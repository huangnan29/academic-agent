import { randomUUID } from 'node:crypto'
import type {
  Conversation,
  ConversationAttachment,
  ConversationUpdateInput,
  Project,
  ResearchBrief,
  SidebarPreferencesInput,
  WorkspaceState,
} from '../../../shared/contracts'
import { now, synchronizeActiveModelSelection } from './workspace-state'

export function createProject(state: WorkspaceState, brief: ResearchBrief): Project {
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
      state.outlineArchitectures ??= {}
      state.outlineQualityReports ??= {}
      delete state.outlineArchitectures[projectId]
      delete state.outlineQualityReports[projectId]
      state.settings.activeProjectId = projectId
      state.settings.sidebarExpandedProjectIds = [
        projectId,
        ...(state.settings.sidebarExpandedProjectIds ?? []).filter((id) => id !== projectId),
      ]
      state.settings.demoMode = false
      synchronizeActiveModelSelection(state)
      return project
}
export function setActiveProject(state: WorkspaceState, projectId: string): WorkspaceState {
      const project = state.projects.find((item) => item.id === projectId)
      if (!project) {
        throw new Error('项目不存在或已经被移除。')
      }
      state.settings.activeProjectId = projectId
      state.settings.demoMode = project.origin === 'demo'
      synchronizeActiveModelSelection(state)
      return state
}
export function setProjectPinned(state: WorkspaceState, projectId: string, pinned: boolean): WorkspaceState {
      const project = state.projects.find((item) => item.id === projectId)
      if (!project) throw new Error('项目不存在或已经被移除。')
      project.pinned = pinned
      return state
}
export function createConversation(state: WorkspaceState, projectId: string): WorkspaceState {
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
}
export function setActiveConversation(state: WorkspaceState, projectId: string, conversationId: string): WorkspaceState {
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
}
export function updateConversation(state: WorkspaceState, input: ConversationUpdateInput): WorkspaceState {
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
}
export function moveConversation(state: WorkspaceState, conversationId: string, targetProjectId: string): WorkspaceState {
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
}
export function setSidebarPreferences(state: WorkspaceState, input: SidebarPreferencesInput): WorkspaceState {
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
}
export function deleteProject(state: WorkspaceState, projectId: string): WorkspaceState {
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
      delete state.outlineArchitectures?.[projectId]
      delete state.outlineQualityReports?.[projectId]
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
}
export function setProjectResearchFolder(state: WorkspaceState, projectId: string, folderPath: string): WorkspaceState {
      const project = state.projects.find((item) => item.id === projectId)
      if (!project) throw new Error('项目不存在或已经被移除。')
      project.researchFolderPath = folderPath
      project.updatedAt = now()
      return state
}
export function addConversationAttachments(state: WorkspaceState, conversationId: string, attachments: ConversationAttachment[]): WorkspaceState {
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
}
export function removeConversationAttachment(state: WorkspaceState, attachmentId: string): WorkspaceState {
      const attachment = state.attachments.find((item) => item.id === attachmentId)
      if (!attachment) throw new Error('附件不存在或已经移除。')
      state.attachments = state.attachments.filter((item) => item.id !== attachmentId)
      return state
}
export function setResearchRootPath(state: WorkspaceState, folderPath: string): WorkspaceState {
      state.settings.researchRootPath = folderPath
      return state
}
