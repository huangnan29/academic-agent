// 研究区整理菜单：显示方式、排序规则、归档过滤与默认目录设置。
import {
  Archive,
  Check,
  FolderOpen,
  LayoutList,
  ListTree,
  LoaderCircle,
  SlidersHorizontal,
} from 'lucide-react'
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import type { SidebarChatSort, SidebarPreferencesInput, SidebarViewMode } from '../../../shared/contracts'

export function OrganizeMenu({
  menuRef,
  viewMode,
  chatSort,
  showArchived,
  researchFolderLabel,
  choosingFolder,
  onSetPreferences,
  onClose,
  onChooseFolder,
  onKeyDown,
}: {
  menuRef: RefObject<HTMLDivElement | null>
  viewMode: SidebarViewMode
  chatSort: SidebarChatSort
  showArchived: boolean
  researchFolderLabel: string
  choosingFolder: boolean
  onSetPreferences: (input: SidebarPreferencesInput) => void
  onClose: () => void
  onChooseFolder: () => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
}) {
  return (
    <div
      ref={menuRef}
      className="sidebar-organize-menu"
      role="menu"
      aria-label="整理侧边栏"
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onClose()
      }}
    >
      <span className="menu-heading">整理侧边栏</span>
      <button type="button" role="menuitemradio" aria-checked={viewMode === 'projects'} onClick={() => onSetPreferences({ viewMode: 'projects' })}>
        <Check size={14} className={viewMode === 'projects' ? '' : 'is-placeholder'} />
        <ListTree size={15} /> <span>按项目</span>
      </button>
      <button type="button" role="menuitemradio" aria-checked={viewMode === 'list'} onClick={() => onSetPreferences({ viewMode: 'list' })}>
        <Check size={14} className={viewMode === 'list' ? '' : 'is-placeholder'} />
        <LayoutList size={15} /> <span>在一个列表中</span>
      </button>
      <span className="menu-heading">聊天排序方式</span>
      {([
        ['priority', '优先级'],
        ['recent', '最近更新'],
        ['manual', '手动排序'],
      ] as const).map(([value, label]) => (
        <button key={value} type="button" role="menuitemradio" aria-checked={chatSort === value} onClick={() => onSetPreferences({ chatSort: value })}>
          <Check size={14} className={chatSort === value ? '' : 'is-placeholder'} />
          <SlidersHorizontal size={15} /> <span>{label}</span>
        </button>
      ))}
      <div className="menu-separator" />
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={showArchived}
        onClick={() => onSetPreferences({ showArchived: !showArchived })}
      >
        <Check size={14} className={showArchived ? '' : 'is-placeholder'} />
        <Archive size={15} /> <span>显示已归档对话</span>
      </button>
      <div className="menu-separator" />
      <button className="sidebar-menu-folder-action" type="button" role="menuitem" onClick={() => { onClose(); onChooseFolder() }} disabled={choosingFolder} title={researchFolderLabel}>
        {choosingFolder ? <LoaderCircle size={15} className="spin" /> : <FolderOpen size={15} />}
        <span>设置默认研究文件夹</span>
      </button>
    </div>
  )
}
