// 设置模式左侧导航；从 App.tsx 抽出。
import {
  Archive,
  Bot,
  Camera,
  ChevronLeft,
  Command,
  Database,
  ExternalLink,
  FolderOpen,
  GitBranch,
  Mic,
  Monitor,
  PlugZap,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  type SettingsSection,
} from '../lib/ui'

interface SettingsNavigationItem {
  id: SettingsSection
  label: string
  keywords: string
  icon: LucideIcon
}

const settingsNavigationGroups: Array<{ label: string; items: SettingsNavigationItem[] }> = [
  {
    label: '个人',
    items: [
      { id: 'general', label: '常规', keywords: '权限 文件夹 语言 本机', icon: Settings },
      { id: 'appearance', label: '外观', keywords: '主题 浅色 深色 界面', icon: Sparkles },
      { id: 'voice', label: '语音输入', keywords: '麦克风 语音 听写', icon: Mic },
      { id: 'configuration', label: '配置', keywords: '模型 提供商 API MCP 本地数据', icon: SlidersHorizontal },
      { id: 'personalization', label: '个性化', keywords: 'Skills 写作习惯 指令', icon: Bot },
      { id: 'shortcuts', label: '键盘快捷键', keywords: '快捷键 Command 键盘', icon: Command },
    ],
  },
  {
    label: '集成',
    items: [
      { id: 'app-snapshot', label: '应用快照', keywords: '双 Command 截图 快照', icon: Camera },
      { id: 'browser', label: '浏览器', keywords: '网页 浏览器 控制', icon: ExternalLink },
      { id: 'computer-control', label: '电脑控制', keywords: '桌面 电脑 辅助功能', icon: Monitor },
    ],
  },
  {
    label: '编码',
    items: [
      { id: 'hooks', label: '钩子', keywords: 'Hooks 自动化', icon: PlugZap },
      { id: 'connections', label: '连接', keywords: '远程 服务 连接', icon: ExternalLink },
      { id: 'git', label: 'Git', keywords: '仓库 版本 分支', icon: GitBranch },
      { id: 'environment', label: '环境', keywords: '环境变量 运行环境', icon: Database },
      { id: 'worktrees', label: 'Worktrees', keywords: '工作树 分支 目录', icon: FolderOpen },
    ],
  },
  {
    label: '已归档',
    items: [
      { id: 'archived', label: '已归档的对话', keywords: '恢复 聊天 对话 归档', icon: Archive },
    ],
  },
]

export function SettingsSidebar({
  activeSection,
  onSection,
  onBack,
  sidebarWidth,
  onSidebarWidthChange,
  onSidebarWidthCommit,
}: {
  activeSection: SettingsSection
  onSection: (section: SettingsSection) => void
  onBack: () => void
  sidebarWidth: number
  onSidebarWidthChange: (width: number) => void
  onSidebarWidthCommit: (width: number) => void
}) {
  const [query, setQuery] = useState('')
  const resizeStateRef = useRef<{ pointerId: number; startX: number; startWidth: number } | undefined>(undefined)
  const latestWidthRef = useRef(sidebarWidth)
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const visibleGroups = settingsNavigationGroups
    .map((group) => ({
      ...group,
      items: normalizedQuery
        ? group.items.filter((item) => `${item.label} ${item.keywords}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
        : group.items,
    }))
    .filter((group) => group.items.length > 0)

  useEffect(() => {
    latestWidthRef.current = sidebarWidth
  }, [sidebarWidth])

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    resizeStateRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: sidebarWidth }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const moveResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = resizeStateRef.current
    if (!state || state.pointerId !== event.pointerId) return
    const next = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, state.startWidth + event.clientX - state.startX))
    latestWidthRef.current = Math.round(next)
    onSidebarWidthChange(latestWidthRef.current)
  }

  const finishResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = resizeStateRef.current
    if (!state || state.pointerId !== event.pointerId) return
    resizeStateRef.current = undefined
    event.currentTarget.releasePointerCapture(event.pointerId)
    onSidebarWidthCommit(latestWidthRef.current)
  }

  return (
    <aside className="settings-sidebar" aria-label="设置导航">
      <div className="settings-sidebar-titlebar window-drag-region">
        <button type="button" className="settings-back-button no-drag" onClick={onBack}>
          <ChevronLeft size={15} aria-hidden="true" />
          <span>返回应用</span>
        </button>
      </div>
      <div className="settings-sidebar-body">
        <label className="settings-search">
          <Search size={15} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索设置…" aria-label="搜索设置" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="清空搜索"><X size={14} /></button>}
        </label>
        <nav className="settings-navigation">
          {visibleGroups.map((group) => (
            <section key={group.label} className="settings-navigation-group">
              <h2>{group.label}</h2>
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={activeSection === item.id ? 'is-active' : ''}
                    onClick={() => onSection(item.id)}
                    aria-current={activeSection === item.id ? 'page' : undefined}
                  >
                    <Icon size={15} aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </section>
          ))}
          {visibleGroups.length === 0 && <p className="settings-search-empty">没有匹配的设置</p>}
        </nav>
      </div>
      <div
        className="sidebar-resizer"
        role="separator"
        aria-label="调整设置侧栏宽度"
        aria-orientation="vertical"
        aria-valuemin={MIN_SIDEBAR_WIDTH}
        aria-valuemax={MAX_SIDEBAR_WIDTH}
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
        onDoubleClick={() => {
          latestWidthRef.current = DEFAULT_SIDEBAR_WIDTH
          onSidebarWidthChange(DEFAULT_SIDEBAR_WIDTH)
          onSidebarWidthCommit(DEFAULT_SIDEBAR_WIDTH)
        }}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return
          event.preventDefault()
          const next = event.key === 'Home'
            ? DEFAULT_SIDEBAR_WIDTH
            : Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, sidebarWidth + (event.key === 'ArrowRight' ? 12 : -12)))
          latestWidthRef.current = next
          onSidebarWidthChange(next)
          onSidebarWidthCommit(next)
        }}
      />
    </aside>
  )
}
