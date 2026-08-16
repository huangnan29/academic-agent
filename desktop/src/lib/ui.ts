// 渲染层共享的路由、设置分区与布局常量；从 App.tsx 抽出，供各拆分组件复用。
export type Route = 'workspace' | 'library' | 'skills' | 'settings'
export type RightTab = 'literature' | 'drafts' | 'process'
export type SettingsSection =
  | 'general'
  | 'appearance'
  | 'voice'
  | 'configuration'
  | 'personalization'
  | 'shortcuts'
  | 'app-snapshot'
  | 'browser'
  | 'computer-control'
  | 'hooks'
  | 'connections'
  | 'git'
  | 'environment'
  | 'worktrees'
  | 'archived'

export const DEFAULT_SIDEBAR_WIDTH = 280
export const DEFAULT_RIGHT_PANEL_WIDTH = 380
export const MIN_SIDEBAR_WIDTH = 240
export const MAX_SIDEBAR_WIDTH = 520
