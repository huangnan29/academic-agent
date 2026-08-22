import { Target, X } from 'lucide-react'
import { IconButton } from '../common'

export function GoalDialog({
  goalDraft,
  updatingMode,
  onChange,
  onClose,
  onClear,
  onSave,
}: {
  goalDraft: string
  updatingMode: boolean
  onChange: (value: string) => void
  onClose: () => void
  onClear: () => void
  onSave: () => Promise<void>
}) {
  return (
    <div className="composer-goal-dialog" role="dialog" aria-modal="true" aria-label="设置对话目标">
      <div>
        <Target size={18} />
        <span><strong>对话目标</strong><small>保存后会持续加入当前对话的模型上下文。</small></span>
        <IconButton icon={X} label="关闭目标设置" onClick={onClose} />
      </div>
      <textarea value={goalDraft} onChange={(event) => onChange(event.target.value)} maxLength={2000} placeholder="例如：完成一篇证据可追溯的中文教育学论文，并逐章核验引用。" autoFocus />
      <div className="composer-goal-actions">
        <span>{goalDraft.length}/2000</span>
        <button type="button" className="secondary-button" onClick={onClear} disabled={updatingMode}>清除</button>
        <button type="button" className="primary-button compact" onClick={() => void onSave()} disabled={updatingMode}>保存目标</button>
      </div>
    </div>
  )
}
