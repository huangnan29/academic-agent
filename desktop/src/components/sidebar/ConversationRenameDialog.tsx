// 对话重命名弹窗，只负责展示表单并转发提交状态。
import {
  LoaderCircle,
  PencilLine,
  Save,
  X,
} from 'lucide-react'
import type { FormEvent as ReactFormEvent } from 'react'
import type { Conversation } from '../../../shared/contracts'
import { IconButton } from '../common'

export function ConversationRenameDialog({
  renameTarget,
  renameDraft,
  renaming,
  onRenameDraftChange,
  onSubmit,
  onClose,
}: {
  renameTarget: Conversation
  renameDraft: string
  renaming: boolean
  onRenameDraftChange: (draft: string) => void
  onSubmit: (event: ReactFormEvent<HTMLFormElement>) => void
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop conversation-rename-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !renaming) onClose()
    }}>
      <form className="conversation-rename-dialog" role="dialog" aria-modal="true" aria-labelledby="conversation-rename-title" onSubmit={onSubmit}>
        <div className="modal-header">
          <div>
            <span className="modal-icon"><PencilLine size={18} /></span>
            <div>
              <h2 id="conversation-rename-title">重命名聊天</h2>
              <p>只修改侧栏显示名称，不会改变已有消息或研究资料。</p>
            </div>
          </div>
          <IconButton icon={X} label="关闭" disabled={renaming} onClick={onClose} />
        </div>
        <label>
          <span>聊天名称</span>
          <input
            autoFocus
            value={renameDraft}
            onChange={(event) => onRenameDraftChange(event.target.value)}
            maxLength={120}
            required
          />
        </label>
        <div className="conversation-rename-actions">
          <button type="button" className="secondary-button" disabled={renaming} onClick={onClose}>取消</button>
          <button type="submit" className="primary-button compact" disabled={renaming || !renameDraft.trim()}>
            {renaming ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
            保存名称
          </button>
        </div>
      </form>
    </div>
  )
}
