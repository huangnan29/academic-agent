// 应用根组件：负责工作区数据加载、全局状态编排与路由切换；
// 界面块（侧栏、聊天、文稿、设置等）已拆分到 components/ 与 pages/，共享工具在 lib/。
import {
  CircleAlert,
  CircleCheck,
  Download,
  FileText,
  LoaderCircle,
  MessageSquareText,
  PanelLeftClose,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  X,
} from 'lucide-react'
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import type {
  AppearanceSettingsInput,
  ChatContextReference,
  ChatMessage,
  ConversationAccessMode,
  ConversationUpdateInput,
  LiteratureRecord,
  ManuscriptSection,
  ResearchBrief,
  SidebarPreferencesInput,
  SystemPermissionKind,
  SystemPermissionSnapshot,
  WorkspaceState,
} from '../shared/contracts'
import { DEFAULT_APPEARANCE_SETTINGS } from '../shared/contracts'
import { ChatView } from './components/ChatView'
import { Composer } from './components/Composer'
import { IconButton } from './components/common'
import { DeleteProjectDialog, NewProjectDialog, RegenerateOutlineDialog } from './components/dialogs'
import { ManuscriptView } from './components/ManuscriptView'
import { RightWorkspace } from './components/RightWorkspace'
import { SettingsSidebar } from './components/SettingsSidebar'
import { Sidebar } from './components/Sidebar'
import { SystemPermissionDialog } from './components/SystemPermissionDialog'
import { isNativeBridge, paperAgent } from './fallback'
import { appearanceVariables } from './lib/appearance'
import { appIconUrl } from './lib/assets'
import { projectStatusLabels } from './lib/labels'
import {
  DEFAULT_RIGHT_PANEL_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
  type RightTab,
  type Route,
  type SettingsSection,
} from './lib/ui'
import { LibraryPage } from './pages/LibraryPage'
import { SettingsPage } from './pages/SettingsPage'
import { SkillsPage } from './pages/SkillsPage'

type CenterMode = 'chat' | 'manuscript'
type SectionGenerationCandidate = {
  sectionId: string
  content: string
  reasoningContent: string
  providerId: string
  model: string
  thinkingRequested: boolean
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
  outlineArchitectures: {},
  outlineQualityReports: {},
  sections: [],
  sectionVersions: [],
  citations: [],
  runs: [],
  mcpServers: [],
  skills: [],
  artifacts: [],
  settings: { appearance: DEFAULT_APPEARANCE_SETTINGS, demoMode: false },
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
  const [selectingSectionVersionId, setSelectingSectionVersionId] = useState<string>()
  const [sectionGenerationCandidate, setSectionGenerationCandidate] = useState<SectionGenerationCandidate>()
  const [generatingOutline, setGeneratingOutline] = useState(false)
  const [regenerateOutlineOpen, setRegenerateOutlineOpen] = useState(false)
  const [exporting, setExporting] = useState<'md' | 'docx'>()
  const [permissionCenterOpen, setPermissionCenterOpen] = useState(false)
  const [systemPermissions, setSystemPermissions] = useState<SystemPermissionSnapshot>()
  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  const [permissionBusy, setPermissionBusy] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' }>()
  const settingsReturnRouteRef = useRef<Route>('workspace')

  const refreshWorkspace = async () => {
    const next = await paperAgent.workspace.get()
    setWorkspace(next)
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
      if (event.type === 'started') {
        setSectionGenerationCandidate({
          sectionId: event.sectionId,
          content: '',
          reasoningContent: '',
          providerId: event.providerId,
          model: event.model,
          thinkingRequested: event.thinkingRequested,
        })
      } else if (event.type === 'text-delta') {
        setSectionGenerationCandidate((current) => current?.sectionId === event.sectionId
          ? { ...current, content: `${current.content}${event.delta}` }
          : current)
      } else if (event.type === 'reasoning-delta') {
        setSectionGenerationCandidate((current) => current?.sectionId === event.sectionId
          ? { ...current, reasoningContent: `${current.reasoningContent}${event.delta}` }
          : current)
      } else {
        setSectionGenerationCandidate((current) => current?.sectionId === event.sectionId ? undefined : current)
      }
      setWorkspace((current) => {
        const next = structuredClone(current)
        const index = next.sections.findIndex((section) => section.id === event.sectionId)
        if (index < 0) return current
        const section = next.sections[index]
        if (event.type === 'started') {
          section.status = 'generating'
          section.generationError = undefined
          section.generationProviderId = event.providerId
          section.generationModel = event.model
          section.thinkingRequested = event.thinkingRequested
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
  // 右侧文献栏和消息“已添加”状态必须严格限定当前项目，不能被其他项目的同题文献污染。
  const projectLiterature = workspace.literature.filter((item) => item.projectId === activeProject?.id)
  const outline = activeProject ? workspace.outlines[activeProject.id] ?? [] : []
  const outlineArchitecture = activeProject
    ? workspace.outlineArchitectures?.[activeProject.id]
    : undefined
  const outlineQualityReport = activeProject
    ? workspace.outlineQualityReports?.[activeProject.id]
    : undefined
  const sections = workspace.sections.filter((item) => item.projectId === activeProject?.id)
  const projectSectionVersions = workspace.sectionVersions.filter((item) => item.projectId === activeProject?.id)
  const selectedSection = sections.find((item) => item.id === selectedSectionId) ?? sections.find((item) => item.id === activeProject?.activeSectionId) ?? sections[0]
  const displaySection: ManuscriptSection | undefined = selectedSection && sectionGenerationCandidate?.sectionId === selectedSection.id
    ? {
        ...selectedSection,
        content: sectionGenerationCandidate.content,
        reasoningContent: sectionGenerationCandidate.reasoningContent || undefined,
        status: 'generating',
        wordCount: sectionGenerationCandidate.content.replace(/\s+/g, '').length,
        activeGenerationVersionId: undefined,
        generationError: undefined,
        generationProviderId: sectionGenerationCandidate.providerId,
        generationModel: sectionGenerationCandidate.model,
        thinkingRequested: sectionGenerationCandidate.thinkingRequested,
      }
    : selectedSection
  const selectedSectionVersions = workspace.sectionVersions.filter((item) => item.sectionId === selectedSection?.id)
  const activeRun = workspace.runs.filter((item) => item.projectId === activeProject?.id).at(-1)
  const artifacts = workspace.artifacts.filter((item) => item.projectId === activeProject?.id)
  const projectPendingDeletion = workspace.projects.find((item) => item.id === projectPendingDeletionId)

  useEffect(() => {
    if (selectedSection && selectedSection.id !== selectedSectionId) setSelectedSectionId(selectedSection.id)
  }, [selectedSection?.id])

  useEffect(() => {
    setSectionDraft(selectedSection?.content ?? '')
    setEditingSection(false)
    setSelectingSectionVersionId(undefined)
  }, [selectedSection?.activeGenerationVersionId, selectedSection?.id])

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
    setSelectingSectionVersionId(undefined)
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

  const toggleLiterature = async (record: LiteratureRecord, projectId?: string) => {
    const targetProjectId = projectId ?? activeProject?.id
    if (!targetProjectId) return
    try {
      await paperAgent.literature.toggle(targetProjectId, record.id, !record.included)
      await refreshWorkspace()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '更新文献失败', 'error')
    }
  }

  const removeLiteratureFromProject = async (record: LiteratureRecord) => {
    try {
      await paperAgent.literature.setProject({
        literatureId: record.id,
        sourceProjectId: record.projectId ?? null,
      })
      await refreshWorkspace()
      showToast('已移出项目，文献仍保留在“全部文献”中')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '移出项目失败', 'error')
    }
  }

  const deleteLiterature = async (record: LiteratureRecord) => {
    try {
      await paperAgent.literature.delete({
        literatureId: record.id,
        sourceProjectId: record.projectId ?? null,
      })
      if (selectedLiterature?.id === record.id && selectedLiterature?.projectId === record.projectId) {
        setSelectedLiterature(undefined)
      }
      await refreshWorkspace()
      showToast('文献已从本机文献库删除')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除文献失败', 'error')
      throw error
    }
  }

  const addMessageLiterature = async (messageId: string, candidateId: string) => {
    try {
      const records = await paperAgent.literature.addFromMessage({
        messageId,
        candidateIds: [candidateId],
      })
      setWorkspace((current) => {
        const ids = new Set(records.map((record) => record.id))
        return {
          ...current,
          literature: [
            ...current.literature.filter((record) => !ids.has(record.id)),
            ...records,
          ],
        }
      })
      setRightTab('literature')
      setRightOpen(true)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '添加文献失败', 'error')
      throw error
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

  const selectSectionVersion = async (versionId: string) => {
    if (!selectedSection || selectingSectionVersionId) return
    const sectionId = selectedSection.id
    setSelectingSectionVersionId(versionId)
    try {
      await paperAgent.section.selectVersion(sectionId, versionId)
      await refreshWorkspace()
      setEditingSection(false)
      showToast('已切换章节版本')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '切换章节版本失败', 'error')
    } finally {
      setSelectingSectionVersionId(undefined)
    }
  }

  const generateSection = async () => {
    if (!activeProject || !selectedSection) return
    if (sectionGenerationCandidate) {
      showToast('已有章节正在生成，请等待完成后再开始下一章', 'error')
      return
    }
    if (!activeProviderId || !activeModel) {
      showToast('请先配置并选择可用模型', 'error')
      return
    }
    const sectionId = selectedSection.id
    setSectionGenerationCandidate({
      sectionId,
      content: '',
      reasoningContent: '',
      providerId: activeProviderId,
      model: activeModel,
      thinkingRequested: false,
    })
    setWorkspace((current) => {
      const next = structuredClone(current)
      const section = next.sections.find((item) => item.id === sectionId)
      if (section) {
        section.status = 'generating'
        section.generationError = undefined
        section.generationProviderId = activeProviderId
        section.generationModel = activeModel
      }
      return next
    })
    try {
      await paperAgent.section.generate({ projectId: activeProject.id, sectionId, providerId: activeProviderId, model: activeModel })
      await refreshWorkspace()
      setSectionGenerationCandidate((current) => current?.sectionId === sectionId ? undefined : current)
      showToast('章节草稿已生成')
    } catch (error) {
      await refreshWorkspace().catch(() => undefined)
      setSectionGenerationCandidate((current) => current?.sectionId === sectionId ? undefined : current)
      showToast('章节生成中断，已保留模型返回的正文片段', 'error')
    }
  }

  const generateOutline = async () => {
    if (!activeProject) return
    if (generatingOutline) return
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
                    <ChatView
                      messages={messages}
                      projectTitle={activeProject.title}
                      literature={projectLiterature}
                      onAddLiterature={addMessageLiterature}
                      onShowLiterature={() => { setRightTab('literature'); setRightOpen(true) }}
                    />
                  ) : (
                    <ManuscriptView
                      section={displaySection}
                      sectionVersions={selectedSectionVersions}
                      generationProviderName={workspace.providers.find((provider) => provider.id === displaySection?.generationProviderId)?.name}
                      canGenerateOutline={Boolean(activeProviderId && activeModel)}
                      generatingOutline={generatingOutline}
                      isEditing={editingSection}
                      draft={sectionDraft}
                      saving={savingSection}
                      selectingVersionId={selectingSectionVersionId}
                      onDraft={setSectionDraft}
                      onEdit={() => setEditingSection(true)}
                      onSave={saveSection}
                      onGenerate={generateSection}
                      onSelectVersion={selectSectionVersion}
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
                  mcpServers={isNativeBridge ? workspace.mcpServers : []}
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
                onToast={showToast}
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
              outlineArchitecture={outlineArchitecture}
              outlineQualityReport={outlineQualityReport}
              sections={sections}
              sectionVersions={projectSectionVersions}
              selectedSectionId={selectedSection?.id}
              runSteps={activeRun?.steps ?? []}
              artifacts={artifacts}
              activeProjectId={activeProject.id}
              onToggleLiterature={toggleLiterature}
              onRemoveLiterature={removeLiteratureFromProject}
              onDeleteLiterature={deleteLiterature}
              onOpenLiterature={(record) => { setSelectedLiterature(record); setRoute('library') }}
              onSelectSection={selectSection}
              onReveal={(path) => paperAgent.export.reveal(path)}
              canGenerateOutline={Boolean(activeProviderId && activeModel)}
              generatingOutline={generatingOutline}
              onGenerateOutline={generateOutline}
              onRequestRegenerateOutline={() => setRegenerateOutlineOpen(true)}
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
            onRefreshPermissions={refreshSystemPermissions}
            onToast={showToast}
            onManagePermissions={() => {
              setPermissionCenterOpen(true)
              void refreshSystemPermissions()
            }}
            onRequestMicrophone={async () => {
              setPermissionBusy(true)
              try {
                const next = await paperAgent.systemPermissions.requestMicrophone()
                setSystemPermissions(next)
                return next
              } finally {
                setPermissionBusy(false)
              }
            }}
            onOpenSystemSettings={openSystemPermissionSettings}
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
      <RegenerateOutlineDialog
        open={regenerateOutlineOpen}
        busy={generatingOutline}
        onClose={() => !generatingOutline && setRegenerateOutlineOpen(false)}
        onConfirm={() => {
          setRegenerateOutlineOpen(false)
          void generateOutline()
        }}
      />
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
