import { useEffect, useState } from 'react'
import type {
  AppearanceSettingsInput,
  SidebarPreferencesInput,
  WorkspaceState,
} from '../../shared/contracts'
import { paperAgent } from '../fallback'
import { DEFAULT_RIGHT_PANEL_WIDTH, DEFAULT_SIDEBAR_WIDTH } from '../lib/ui'

type ShowToast = (message: string, tone?: 'success' | 'error') => void

export function useAppearanceControls({
  workspace,
  setWorkspace,
  showToast,
}: {
  workspace: WorkspaceState
  setWorkspace: (next: WorkspaceState | ((current: WorkspaceState) => WorkspaceState)) => void
  showToast: ShowToast
}) {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH)
  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)

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

  return {
    prefersDark,
    sidebarWidth,
    setSidebarWidth,
    rightPanelWidth,
    setRightPanelWidth,
    setSidebarPreferences,
    updateAppearance,
    importAppearanceTheme,
    copyAppearanceTheme,
  }
}
