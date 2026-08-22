import type { Conversation, Project } from '../../shared/contracts'
import {
  clone,
  makeId,
  mutate,
  now,
  readState,
  restoreActiveModelIfNeeded,
} from './state'

export const projectApi: Window['paperAgent']['project'] = {
  async create(brief) {
    const projectId = makeId('project')
    const conversationId = makeId('conversation')
    const createdAt = now()
    const project: Project = {
      id: projectId,
      title: brief.title,
      status: 'draft',
      brief,
      activeConversationId: conversationId,
      pinned: false,
      manualOrder: Math.min(0, ...readState().projects.map((item) => item.manualOrder ?? 0)) - 1,
      origin: 'demo',
      verificationStatus: 'demo',
      createdAt,
      updatedAt: createdAt,
    }
    const conversation: Conversation = {
      id: conversationId,
      projectId,
      title: brief.title,
      messageIds: [],
      manualOrder: 0,
      origin: 'demo',
      verificationStatus: 'demo',
      createdAt,
      updatedAt: createdAt,
    }
    mutate((draft) => {
      draft.projects.unshift(project)
      draft.conversations.unshift(conversation)
      draft.outlines[projectId] = []
      draft.settings.activeProjectId = projectId
      draft.settings.sidebarExpandedProjectIds = [
        projectId,
        ...(draft.settings.sidebarExpandedProjectIds ?? []).filter((id) => id !== projectId),
      ]
      draft.settings.demoMode = true
      restoreActiveModelIfNeeded(draft)
    })
    return clone(project)
  },
  async setActive(projectId) {
    const next = mutate((draft) => {
      draft.settings.activeProjectId = projectId
      const project = draft.projects.find((item) => item.id === projectId)
      if (project) draft.settings.demoMode = project.origin === 'demo'
      restoreActiveModelIfNeeded(draft)
    })
    return clone(next)
  },
  async setPinned(projectId, pinned) {
    const next = mutate((draft) => {
      const project = draft.projects.find((item) => item.id === projectId)
      if (!project) throw new Error('项目不存在或已经被移除')
      project.pinned = pinned
    })
    return clone(next)
  },
  async delete(projectId) {
    const next = mutate((draft) => {
      const project = draft.projects.find((item) => item.id === projectId)
      if (!project) throw new Error('项目不存在或已经被移除')
      if (
        draft.runs.some(
          (run) => run.projectId === projectId && ['queued', 'running'].includes(run.status),
        )
      ) {
        throw new Error('当前研究仍有任务运行，请停止生成后再删除')
      }
      const conversationIds = new Set(
        draft.conversations
          .filter((item) => item.projectId === projectId)
          .map((item) => item.id),
      )
      const sectionIds = new Set(
        draft.sections.filter((item) => item.projectId === projectId).map((item) => item.id),
      )
      draft.projects = draft.projects.filter((item) => item.id !== projectId)
      draft.conversations = draft.conversations.filter((item) => item.projectId !== projectId)
      draft.attachments = draft.attachments.filter(
        (item) => item.projectId !== projectId && !conversationIds.has(item.conversationId),
      )
      draft.messages = draft.messages.filter(
        (item) => item.projectId !== projectId && !conversationIds.has(item.conversationId),
      )
      draft.literature = draft.literature.filter((item) => item.projectId !== projectId)
      draft.sections = draft.sections.filter((item) => item.projectId !== projectId)
      draft.sectionVersions = draft.sectionVersions.filter((item) => item.projectId !== projectId)
      draft.citations = draft.citations.filter(
        (item) => item.projectId !== projectId && !sectionIds.has(item.sectionId),
      )
      draft.runs = draft.runs.filter((item) => item.projectId !== projectId)
      draft.artifacts = draft.artifacts.filter((item) => item.projectId !== projectId)
      delete draft.outlines[projectId]
      delete draft.outlineArchitectures?.[projectId]
      delete draft.outlineQualityReports?.[projectId]
      draft.settings.sidebarExpandedProjectIds = (
        draft.settings.sidebarExpandedProjectIds ?? []
      ).filter((id) => id !== projectId)
      if (draft.settings.activeProjectId === projectId) {
        const fallback = draft.projects.find((item) => item.origin !== 'demo') ?? draft.projects[0]
        draft.settings.activeProjectId = fallback?.id
        draft.settings.demoMode = fallback?.origin === 'demo'
      }
      restoreActiveModelIfNeeded(draft)
    })
    return clone(next)
  },
  async chooseFolder() {
    const next = mutate((draft) => {
      draft.settings.researchRootPath = '浏览器演示/学术 Agent'
    })
    return clone(next)
  },
  async revealFolder(projectId) {
    const project = readState().projects.find((item) => item.id === projectId)
    if (!project) throw new Error('项目不存在或已经被移除')
    throw new Error('浏览器演示无法打开 Finder，请使用桌面应用。')
  },
}
