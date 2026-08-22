// 左侧栏拖拽、键盘微调与默认宽度恢复。
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from '../../lib/ui'

export function useSidebarResize(
  sidebarWidth: number,
  onSidebarWidthChange: (width: number) => void,
  onSidebarWidthCommit: (width: number) => void,
) {
  const resizeStateRef = useRef<{ pointerId: number; startX: number; startWidth: number } | undefined>(undefined)
  const latestSidebarWidthRef = useRef(sidebarWidth)

  useEffect(() => {
    latestSidebarWidthRef.current = sidebarWidth
  }, [sidebarWidth])

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    resizeStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: sidebarWidth,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const moveSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = resizeStateRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    const next = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, resize.startWidth + event.clientX - resize.startX))
    latestSidebarWidthRef.current = Math.round(next)
    onSidebarWidthChange(latestSidebarWidthRef.current)
  }

  const finishSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = resizeStateRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    resizeStateRef.current = undefined
    event.currentTarget.releasePointerCapture(event.pointerId)
    onSidebarWidthCommit(latestSidebarWidthRef.current)
  }

  const resetSidebarWidth = () => {
    latestSidebarWidthRef.current = DEFAULT_SIDEBAR_WIDTH
    onSidebarWidthChange(DEFAULT_SIDEBAR_WIDTH)
    onSidebarWidthCommit(DEFAULT_SIDEBAR_WIDTH)
  }

  const handleSidebarResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home'
      ? DEFAULT_SIDEBAR_WIDTH
      : Math.max(
          MIN_SIDEBAR_WIDTH,
          Math.min(MAX_SIDEBAR_WIDTH, sidebarWidth + (event.key === 'ArrowRight' ? 12 : -12)),
        )
    latestSidebarWidthRef.current = next
    onSidebarWidthChange(next)
    onSidebarWidthCommit(next)
  }

  return {
    startSidebarResize,
    moveSidebarResize,
    finishSidebarResize,
    resetSidebarWidth,
    handleSidebarResizeKeyDown,
  }
}
