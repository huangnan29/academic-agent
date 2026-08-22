import { Check, Lightbulb, Paperclip, Plus, Target } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Conversation } from '../../../shared/contracts'
import { IconButton } from '../common'

export function ComposerAddMenu({
  conversation,
  open,
  updatingMode,
  onToggle,
  onClose,
  onChooseAttachments,
  onOpenGoal,
  onTogglePlanMode,
}: {
  conversation?: Conversation
  open: boolean
  updatingMode: boolean
  onToggle: () => void
  onClose: () => void
  onChooseAttachments: () => Promise<void>
  onOpenGoal: () => void
  onTogglePlanMode: () => Promise<void>
}) {
  const addMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!addMenuRef.current?.contains(event.target as Node)) onClose()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose, open])

  return (
    <div className="composer-add" ref={addMenuRef}>
      <IconButton
        icon={Plus}
        label="添加"
        active={open}
        onClick={onToggle}
      />
      {open && (
        <div className="composer-add-menu" role="menu">
          <span className="composer-menu-heading">添加</span>
          <button type="button" role="menuitem" onClick={() => { onClose(); void onChooseAttachments() }}>
            <Paperclip size={17} />
            <span><strong>文件和文件夹</strong><small>加入当前对话上下文</small></span>
          </button>
          <button type="button" role="menuitem" onClick={onOpenGoal} disabled={!conversation}>
            <Target size={17} />
            <span><strong>目标</strong><small>{conversation?.goal ? '修改持续追踪的目标' : '设置要持续追踪的目标'}</small></span>
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={conversation?.planMode === true} onClick={() => void onTogglePlanMode()} disabled={!conversation || updatingMode}>
            <Lightbulb size={17} />
            <span><strong>计划模式</strong><small>{conversation?.planMode ? '已开启，点击关闭' : '先分析并形成步骤'}</small></span>
            {conversation?.planMode && <Check size={15} />}
          </button>
        </div>
      )}
    </div>
  )
}
