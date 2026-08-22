// 侧栏宽度调节器，保留原有分隔线的无障碍属性与交互行为。
import {
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from '../../lib/ui'
import { useSidebarResize } from './useSidebarResize'

export function SidebarResizer({
  sidebarWidth,
  onSidebarWidthChange,
  onSidebarWidthCommit,
}: {
  sidebarWidth: number
  onSidebarWidthChange: (width: number) => void
  onSidebarWidthCommit: (width: number) => void
}) {
  const {
    startSidebarResize,
    moveSidebarResize,
    finishSidebarResize,
    resetSidebarWidth,
    handleSidebarResizeKeyDown,
  } = useSidebarResize(sidebarWidth, onSidebarWidthChange, onSidebarWidthCommit)

  return (
    <div
      className="sidebar-resizer"
      role="separator"
      aria-label="调整左侧栏宽度"
      aria-orientation="vertical"
      aria-valuemin={MIN_SIDEBAR_WIDTH}
      aria-valuemax={MAX_SIDEBAR_WIDTH}
      aria-valuenow={sidebarWidth}
      tabIndex={0}
      onPointerDown={startSidebarResize}
      onPointerMove={moveSidebarResize}
      onPointerUp={finishSidebarResize}
      onPointerCancel={finishSidebarResize}
      onDoubleClick={resetSidebarWidth}
      onKeyDown={handleSidebarResizeKeyDown}
    />
  )
}
