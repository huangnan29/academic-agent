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
import type { LiteratureRecord, ManuscriptSection } from '../shared/contracts'
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
import { useAppearanceControls } from './hooks/useAppearanceControls'
import { useChatActions } from './hooks/useChatActions'
import { useLiteratureActions } from './hooks/useLiteratureActions'
import { useManuscriptActions } from './hooks/useManuscriptActions'
import { usePermissionActions } from './hooks/usePermissionActions'
import { useProjectActions } from './hooks/useProjectActions'
import { useWorkspaceRuntime } from './hooks/useWorkspaceRuntime'
import { appearanceVariables } from './lib/appearance'
import { appIconUrl } from './lib/assets'
import { projectStatusLabels } from './lib/labels'
import {
  type RightTab,
  type Route,
  type SettingsSection,
} from './lib/ui'
import { LibraryPage } from './pages/LibraryPage'
import { SettingsPage } from './pages/SettingsPage'
import { SkillsPage } from './pages/SkillsPage'

type CenterMode = 'chat' | 'manuscript'

export function App() {
  const {
    workspace,
    setWorkspace,
    loading,
    activeRunId,
    setActiveRunId,
    sectionGenerationCandidate,
    setSectionGenerationCandidate,
    refreshWorkspace,
    toast,
    setToast,
    showToast,
  } = useWorkspaceRuntime()
  const [route, setRoute] = useState<Route>('workspace')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general')
  const [centerMode, setCenterMode] = useState<CenterMode>('chat')
  const [rightTab, setRightTab] = useState<RightTab>('literature')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [rightOpen, setRightOpen] = useState(true)
  const [selectedSectionId, setSelectedSectionId] = useState<string>()
  const [selectedLiterature, setSelectedLiterature] = useState<LiteratureRecord>()
  const settingsReturnRouteRef = useRef<Route>('workspace')

  useEffect(() => {
    if (route !== 'settings') settingsReturnRouteRef.current = route
  }, [route])

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

  const {
    prefersDark,
    sidebarWidth,
    setSidebarWidth,
    rightPanelWidth,
    setRightPanelWidth,
    setSidebarPreferences,
    updateAppearance,
    importAppearanceTheme,
    copyAppearanceTheme,
  } = useAppearanceControls({ workspace, setWorkspace, showToast })

  const manuscriptResetRef = useRef<() => void>(() => undefined)
  const projectActions = useProjectActions({
    workspace,
    setWorkspace,
    refreshWorkspace,
    activeProject,
    conversation,
    setRoute,
    setCenterMode,
    showToast,
    onProjectDeleted: () => manuscriptResetRef.current(),
  })

  const {
    activeProviderId,
    activeModel,
    exporting,
    newProjectOpen,
    setNewProjectOpen,
    creatingProject,
    projectPendingDeletionId,
    setProjectPendingDeletionId,
    deletingProject,
    choosingFolder,
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
  } = projectActions

  const manuscriptActions = useManuscriptActions({
    workspace,
    setWorkspace,
    refreshWorkspace,
    activeProject,
    selectedSection,
    selectedSectionId,
    setSelectedSectionId,
    activeProviderId,
    activeModel,
    sectionGenerationCandidate,
    setSectionGenerationCandidate,
    setCenterMode,
    setRightTab,
    setRightOpen,
    showToast,
  })
  manuscriptResetRef.current = () => {
    setSelectedSectionId(undefined)
    setSelectedLiterature(undefined)
    manuscriptActions.setSectionDraft('')
    manuscriptActions.setEditingSection(false)
  }

  const {
    editingSection,
    setEditingSection,
    sectionDraft,
    setSectionDraft,
    savingSection,
    selectingSectionVersionId,
    generatingOutline,
    regenerateOutlineOpen,
    setRegenerateOutlineOpen,
    selectSection,
    saveSection,
    selectSectionVersion,
    generateSection,
    generateOutline,
  } = manuscriptActions

  const {
    permissionCenterOpen,
    setPermissionCenterOpen,
    systemPermissions,
    permissionBusy,
    refreshSystemPermissions,
    requestFullAccess,
    requestConversationAccessMode,
    openSystemPermissionSettings,
    enableFullAccess,
    requestMicrophone,
  } = usePermissionActions({ conversation, updateConversation, showToast })

  const {
    toggleLiterature,
    removeLiteratureFromProject,
    deleteLiterature,
    addMessageLiterature,
  } = useLiteratureActions({
    setWorkspace,
    refreshWorkspace,
    activeProject,
    selectedLiterature,
    setSelectedLiterature,
    setRightTab,
    setRightOpen,
    showToast,
  })

  const { sendMessage, cancelRun } = useChatActions({
    workspace,
    setWorkspace,
    activeProject,
    conversation,
    activeProviderId,
    activeModel,
    activeRunId,
    setActiveRunId,
    centerMode,
    setCenterMode,
    showToast,
  })

  const projectPendingDeletion = workspace.projects.find((item) => item.id === projectPendingDeletionId)

  const openSettings = (section: SettingsSection = 'general') => {
    setSettingsSection(section)
    setRoute('settings')
  }

  const closeSettings = () => {
    setRoute(settingsReturnRouteRef.current === 'settings' ? 'workspace' : settingsReturnRouteRef.current)
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
            onRequestMicrophone={requestMicrophone}
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
