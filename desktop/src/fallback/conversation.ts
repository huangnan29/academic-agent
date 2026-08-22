import type { Conversation } from '../../shared/contracts'
import {
  clone,
  makeId,
  mutate,
  now,
  readState,
} from './state'

export const conversationApi: Window['paperAgent']['conversation'] = {
  async create(projectId) {
    const next = mutate((draft) => {
      const project = draft.projects.find((item) => item.id === projectId)
      if (!project) throw new Error('项目不存在或已经被移除')
      const projectConversations = draft.conversations.filter((item) => item.projectId === projectId)
      const timestamp = now()
      const conversation: Conversation = {
        id: makeId('conversation'),
        projectId,
        title: projectConversations.length === 0 ? '新对话' : `新对话 ${projectConversations.length + 1}`,
        messageIds: [],
        manualOrder: Math.min(0, ...projectConversations.map((item) => item.manualOrder ?? 0)) - 1,
        origin: project.origin,
        verificationStatus: project.verificationStatus,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      draft.conversations.unshift(conversation)
      project.activeConversationId = conversation.id
      project.updatedAt = timestamp
      draft.settings.activeProjectId = project.id
      draft.settings.sidebarExpandedProjectIds = [
        project.id,
        ...(draft.settings.sidebarExpandedProjectIds ?? []).filter((id) => id !== project.id),
      ]
    })
    return clone(next)
  },
  async setActive(projectId, conversationId) {
    const next = mutate((draft) => {
      const project = draft.projects.find((item) => item.id === projectId)
      const conversation = draft.conversations.find(
        (item) => item.id === conversationId && item.projectId === projectId,
      )
      if (!project || !conversation) throw new Error('对话不存在或不属于该项目')
      project.activeConversationId = conversation.id
      conversation.unread = false
      draft.settings.activeProjectId = project.id
    })
    return clone(next)
  },
  async update(input) {
    const next = mutate((draft) => {
      const conversation = draft.conversations.find((item) => item.id === input.conversationId)
      if (!conversation) throw new Error('对话不存在或已经被移除')
      const project = draft.projects.find((item) => item.id === conversation.projectId)
      if (!project) throw new Error('对话所属研究不存在')
      if (input.archived === true) {
        const runIds = new Set(
          draft.messages
            .filter((message) => message.conversationId === conversation.id)
            .map((message) => message.runId)
            .filter((runId): runId is string => Boolean(runId)),
        )
        if (draft.runs.some((run) => runIds.has(run.id) && ['queued', 'running'].includes(run.status))) {
          throw new Error('该对话仍在生成内容，请先停止后再归档')
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
          let fallback = draft.conversations.find(
            (item) => item.projectId === project.id && item.id !== conversation.id && !item.archived,
          )
          if (!fallback) {
            const timestamp = now()
            fallback = {
              id: makeId('conversation'),
              projectId: project.id,
              title: '新对话',
              messageIds: [],
              pinned: false,
              archived: false,
              unread: false,
              manualOrder: 0,
              origin: project.origin,
              verificationStatus: project.verificationStatus,
              createdAt: timestamp,
              updatedAt: timestamp,
            }
            draft.conversations.unshift(fallback)
          }
          project.activeConversationId = fallback.id
        }
      }
    })
    return clone(next)
  },
  async move(conversationId, targetProjectId) {
    const next = mutate((draft) => {
      const conversation = draft.conversations.find((item) => item.id === conversationId)
      const targetProject = draft.projects.find((item) => item.id === targetProjectId)
      if (!conversation || !targetProject) throw new Error('对话或目标研究不存在')
      const sourceProject = draft.projects.find((item) => item.id === conversation.projectId)
      if (!sourceProject) throw new Error('对话所属研究不存在')
      if (sourceProject.id === targetProject.id) return
      if (sourceProject.origin !== targetProject.origin) throw new Error('演示研究与真实研究之间不能移动对话')
      if (sourceProject.activeConversationId === conversation.id) {
        let fallback = draft.conversations.find(
          (item) => item.projectId === sourceProject.id && item.id !== conversation.id && !item.archived,
        )
        if (!fallback) {
          const timestamp = now()
          fallback = {
            id: makeId('conversation'),
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
          draft.conversations.unshift(fallback)
        }
        sourceProject.activeConversationId = fallback.id
      }
      conversation.projectId = targetProject.id
      conversation.archived = false
      draft.messages.forEach((message) => {
        if (message.conversationId === conversation.id) message.projectId = targetProject.id
      })
      draft.attachments.forEach((attachment) => {
        if (attachment.conversationId === conversation.id) attachment.projectId = targetProject.id
      })
      targetProject.activeConversationId = conversation.id
      draft.settings.activeProjectId = targetProject.id
      draft.settings.sidebarExpandedProjectIds = [
        targetProject.id,
        ...(draft.settings.sidebarExpandedProjectIds ?? []).filter((id) => id !== targetProject.id),
      ]
    })
    return clone(next)
  },
  async copyId(conversationId) {
    const conversation = readState().conversations.find((item) => item.id === conversationId)
    if (!conversation) throw new Error('对话不存在或已经被移除')
    await navigator.clipboard.writeText(conversation.id)
  },
  async chooseAttachments() {
    throw new Error('浏览器演示无法读取本机文件，请使用桌面应用。')
  },
  async removeAttachment(attachmentId) {
    const next = mutate((draft) => {
      if (!draft.attachments.some((item) => item.id === attachmentId)) {
        throw new Error('附件不存在或已经移除')
      }
      draft.attachments = draft.attachments.filter((item) => item.id !== attachmentId)
    })
    return clone(next)
  },
}
