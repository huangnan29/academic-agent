import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type {
  Conversation,
  ConversationAttachment,
  ConversationUpdateInput,
  Project,
  ResearchBrief,
  WorkspaceState,
} from '../../shared/contracts'
import { paperAgent } from '../fallback'
import type { Route } from '../lib/ui'

type CenterMode = 'chat' | 'manuscript'
type ShowToast = (message: string, tone?: 'success' | 'error') => void
type WorkspaceSetter = Dispatch<SetStateAction<WorkspaceState>>

export function useProjectActions({
  workspace,
  setWorkspace,
  refreshWorkspace,
  activeProject,
  conversation,
  setRoute,
  setCenterMode,
  showToast,
  onProjectDeleted,
}: {
  workspace: WorkspaceState
  setWorkspace: WorkspaceSetter
  refreshWorkspace: () => Promise<void>
  activeProject?: Project
  conversation?: Conversation
  setRoute: (route: Route) => void
  setCenterMode: (mode: CenterMode) => void
  showToast: ShowToast
  onProjectDeleted: () => void
}) {
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const [projectPendingDeletionId, setProjectPendingDeletionId] = useState<string>()
  const [deletingProject, setDeletingProject] = useState(false)
  const [choosingFolder, setChoosingFolder] = useState(false)
  const [activeProviderId, setActiveProviderId] = useState<string>()
  const [activeModel, setActiveModel] = useState<string>()
  const [exporting, setExporting] = useState<'md' | 'docx'>()

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

  const chooseConversationAttachments = async () => {
    if (!conversation) return
    try {
      const next = await paperAgent.conversation.chooseAttachments(conversation.id)
      setWorkspace(next)
      const count = next.attachments.filter((item: ConversationAttachment) => item.conversationId === conversation.id).length
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
      onProjectDeleted()
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

  return {
    newProjectOpen,
    setNewProjectOpen,
    creatingProject,
    projectPendingDeletionId,
    setProjectPendingDeletionId,
    deletingProject,
    choosingFolder,
    activeProviderId,
    activeModel,
    exporting,
    selectProject,
    selectConversation,
    createConversation,
    updateConversation,
    restoreConversation,
    restoreAndOpenConversation,
    chooseConversationAttachments,
    removeConversationAttachment,
    moveConversation,
    copyConversationId,
    setProjectPinned,
    createProject,
    chooseResearchFolder,
    revealResearchFolder,
    deleteProject,
    selectModel,
    exportProject,
  }
}
