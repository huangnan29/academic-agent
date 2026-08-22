// 研究区左侧栏：保留布局骨架，将项目树、菜单和调宽交互拆到 sidebar 子组件。
import {
  Database,
  FilePenLine,
  Library,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  PlugZap,
  Settings,
  Sparkles,
} from 'lucide-react'
import { ConversationContextMenu } from './sidebar/ConversationContextMenu'
import { ConversationRenameDialog } from './sidebar/ConversationRenameDialog'
import { OrganizeMenu } from './sidebar/OrganizeMenu'
import { ProjectTree } from './sidebar/ProjectTree'
import { SidebarResizer } from './sidebar/SidebarResizer'
import { useSidebarDerivedData } from './sidebar/useSidebarDerivedData'
import { useSidebarMenus } from './sidebar/useSidebarMenus'
import type { SidebarProps } from './sidebar/types'
import { IconButton } from './common'

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
}: SidebarProps) {
  const derived = useSidebarDerivedData(workspace)
  const menus = useSidebarMenus({
    projectById: derived.projectById,
    onUpdateConversation,
  })
  const researchFolderLabel = workspace.settings.researchRootPath
    ? `设置默认研究文件夹。当前目录：${workspace.settings.researchRootPath}`
    : '设置默认研究文件夹。未设置时使用“文稿/学术 Agent”'
  const menuConversation = menus.conversationMenu
    ? workspace.conversations.find((item) => item.id === menus.conversationMenu?.conversationId)
    : undefined
  const menuProject = menuConversation ? derived.projectById.get(menuConversation.projectId) : undefined
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
            <section className="sidebar-section">
              <div className="sidebar-section-title">
                <span>研究</span>
                <div className="sidebar-section-actions">
                  <button
                    ref={menus.organizeTriggerRef}
                    type="button"
                    aria-label="整理侧边栏"
                    title="整理侧边栏"
                    aria-haspopup="menu"
                    aria-expanded={menus.organizeMenuOpen}
                    onClick={() => {
                      menus.setOpenProjectMenuId(undefined)
                      menus.setOrganizeMenuOpen((current) => !current)
                    }}
                  >
                    <MoreHorizontal size={15} aria-hidden="true" />
                  </button>
                  <button type="button" aria-label="新建研究" title="新建研究" onClick={onCreate}>
                    <Plus size={15} aria-hidden="true" />
                  </button>
                </div>
                {menus.organizeMenuOpen && (
                  <OrganizeMenu
                    menuRef={menus.organizeMenuRef}
                    viewMode={derived.viewMode}
                    chatSort={derived.chatSort}
                    showArchived={derived.showArchived}
                    researchFolderLabel={researchFolderLabel}
                    choosingFolder={choosingFolder}
                    onSetPreferences={onSetPreferences}
                    onClose={() => menus.setOrganizeMenuOpen(false)}
                    onChooseFolder={onChooseFolder}
                    onKeyDown={menus.menuKeyNavigation}
                  />
                )}
              </div>
              <ProjectTree
                workspace={workspace}
                activeProjectId={activeProjectId}
                route={route}
                derived={derived}
                openProjectMenuId={menus.openProjectMenuId}
                setOpenProjectMenuId={menus.setOpenProjectMenuId}
                dragged={menus.dragged}
                setDragged={menus.setDragged}
                projectMenuRefs={menus.projectMenuRefs}
                projectMenuTriggerRefs={menus.projectMenuTriggerRefs}
                onMenuKeyDown={menus.menuKeyNavigation}
                onProject={onProject}
                onConversation={onConversation}
                onCreateConversation={onCreateConversation}
                onPinProject={onPinProject}
                onSetPreferences={onSetPreferences}
                onDeleteProject={onDeleteProject}
                onRevealProject={onRevealProject}
                onOpenConversationMenu={menus.openConversationMenu}
              />
            </section>
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
          <SidebarResizer
            sidebarWidth={sidebarWidth}
            onSidebarWidthChange={onSidebarWidthChange}
            onSidebarWidthCommit={onSidebarWidthCommit}
          />
        )}
      </aside>

      {menus.conversationMenu && menuConversation && menuProject && (
        <ConversationContextMenu
          menu={menus.conversationMenu}
          conversation={menuConversation}
          project={menuProject}
          moveTargets={moveTargets}
          moveMenuOpen={menus.moveMenuOpen}
          menuRef={menus.conversationMenuRef}
          onToggleMoveMenu={() => menus.setMoveMenuOpen((current) => !current)}
          onMenuKeyDown={menus.menuKeyNavigation}
          runConversationAction={menus.runConversationAction}
          beginRename={menus.beginRename}
          onUpdateConversation={onUpdateConversation}
          onMoveConversation={onMoveConversation}
          onRevealProject={onRevealProject}
          onCopyConversationId={onCopyConversationId}
          onCreateConversation={onCreateConversation}
        />
      )}

      {menus.renameTarget && (
        <ConversationRenameDialog
          renameTarget={menus.renameTarget}
          renameDraft={menus.renameDraft}
          renaming={menus.renaming}
          onRenameDraftChange={menus.setRenameDraft}
          onSubmit={menus.submitRename}
          onClose={() => menus.setRenameTarget(undefined)}
        />
      )}
    </>
  )
}
