// 侧栏拆分组件共用的类型契约，避免各组件重复声明 Sidebar 的回调形状。
import type {
  ConversationUpdateInput,
  SidebarChatSort,
  SidebarPreferencesInput,
  SidebarViewMode,
  WorkspaceState,
} from '../../../shared/contracts'
import type { Route, SettingsSection } from '../../lib/ui'

export interface SidebarProps {
  workspace: WorkspaceState
  activeProjectId?: string
  route: Route
  collapsed: boolean
  onToggle: () => void
  onRoute: (route: Route) => void
  onOpenSettings: (section: SettingsSection) => void
  onProject: (projectId: string) => void
  onConversation: (projectId: string, conversationId: string) => void
  onCreateConversation: (projectId: string) => void
  onUpdateConversation: (input: ConversationUpdateInput) => Promise<void>
  onMoveConversation: (conversationId: string, targetProjectId: string) => Promise<void>
  onCopyConversationId: (conversationId: string) => Promise<void>
  onPinProject: (projectId: string, pinned: boolean) => void
  onSetPreferences: (input: SidebarPreferencesInput) => void
  onCreate: () => void
  onChooseFolder: () => void
  onDeleteProject: (projectId: string) => void
  onRevealProject: (projectId: string) => void
  sidebarWidth: number
  onSidebarWidthChange: (width: number) => void
  onSidebarWidthCommit: (width: number) => void
  choosingFolder: boolean
}

export interface ConversationMenuState {
  projectId: string
  conversationId: string
  x: number
  y: number
}

export type SidebarDragState = { kind: 'project' | 'conversation'; id: string }

export type SidebarConversations = WorkspaceState['conversations']
export type SidebarProjects = WorkspaceState['projects']
export type SidebarProject = SidebarProjects[number]

export interface SidebarDerivedData {
  viewMode: SidebarViewMode
  chatSort: SidebarChatSort
  showArchived: boolean
  expandedIds: Set<string>
  projectById: Map<string, SidebarProject>
  sortedProjects: SidebarProjects
  flatConversations: SidebarConversations
  sortConversations: (items: SidebarConversations) => SidebarConversations
}
