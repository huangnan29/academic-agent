// 对话级访问权限选择器（默认权限 / 完全访问）；从 App.tsx 抽出。
import { Check, ChevronDown, ChevronRight, CircleAlert, Settings, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ConversationAccessMode } from '../../shared/contracts'

export function AccessPicker({
  mode,
  disabled,
  onSelect,
  onManage,
}: {
  mode: ConversationAccessMode
  disabled: boolean
  onSelect: (mode: ConversationAccessMode) => Promise<void>
  onManage: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const select = async (nextMode: ConversationAccessMode) => {
    if (busy) return
    if (nextMode === mode) {
      setOpen(false)
      if (nextMode === 'full') onManage()
      return
    }
    setBusy(true)
    try {
      await onSelect(nextMode)
      setOpen(false)
    } catch {
      // 上层统一显示错误提示。
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="access-picker" ref={rootRef}>
      <button
        type="button"
        className={`access-picker-trigger${mode === 'full' ? ' is-full' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
      >
        {mode === 'full' ? <ShieldCheck size={14} /> : <CircleAlert size={14} />}
        <span>{mode === 'full' ? '完全访问权限' : '默认权限'}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="access-picker-menu" role="menu" aria-label="选择访问权限">
          <span className="access-picker-heading">访问权限</span>
          <button type="button" role="menuitemradio" aria-checked={mode === 'ask'} onClick={() => void select('ask')}>
            <CircleAlert size={17} />
            <span><strong>默认权限</strong><small>执行本机、MCP 或外部操作前询问</small></span>
            {mode === 'ask' && <Check size={15} />}
          </button>
          <button type="button" role="menuitemradio" aria-checked={mode === 'full'} onClick={() => void select('full')}>
            <ShieldCheck size={17} />
            <span><strong>完全访问权限</strong><small>需通过 macOS 辅助功能与磁盘访问授权</small></span>
            {mode === 'full' && <Check size={15} />}
          </button>
          <button type="button" className="access-picker-manage" role="menuitem" onClick={() => { setOpen(false); onManage() }}>
            <Settings size={16} />
            <span><strong>管理 macOS 权限</strong><small>查看真实授权状态并重新检测</small></span>
            <ChevronRight size={15} />
          </button>
          <p>完全访问不等同于管理员或 root 权限，也不会绕过 macOS 的系统保护。</p>
        </div>
      )}
    </div>
  )
}
