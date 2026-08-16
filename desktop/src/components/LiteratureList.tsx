// 文献列表：纳入 / 移出 / 删除操作；从 App.tsx 抽出。
import { BookOpen, Check, FileText, Folder, FolderX, LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { LiteratureRecord, WorkspaceState } from '../../shared/contracts'
import { verificationLabels } from '../lib/labels'
import { EmptyState, StatusBadge } from './common'
import { DeleteLiteratureDialog } from './dialogs'

export function LiteratureList({
  records,
  projects = [],
  activeProjectId,
  compact = false,
  showProject = false,
  onToggle,
  onRemove,
  onDelete,
  onOpen,
}: {
  records: LiteratureRecord[]
  projects?: WorkspaceState['projects']
  activeProjectId?: string
  compact?: boolean
  showProject?: boolean
  onToggle: (record: LiteratureRecord, projectId: string) => Promise<void>
  onRemove?: (record: LiteratureRecord) => Promise<void>
  onDelete?: (record: LiteratureRecord) => Promise<void>
  onOpen: (record: LiteratureRecord) => void
}) {
  const [busyAction, setBusyAction] = useState<string>()
  const [pendingDeletion, setPendingDeletion] = useState<LiteratureRecord>()
  if (records.length === 0) {
    return <EmptyState icon={BookOpen} title="尚无文献" description="发起检索后，候选文献及其核验状态会显示在这里。" />
  }

  return (
    <>
    <div className={`literature-list${compact ? ' is-compact' : ''}`}>
      {records.map((record) => {
        const owner = projects.find((project) => project.id === record.projectId)
        const targetProjectId = record.projectId ?? activeProjectId
        const recordKey = `${record.projectId ?? 'unclassified'}:${record.id}`
        const toggleBusy = busyAction === `toggle:${recordKey}`
        const removeBusy = busyAction === `remove:${recordKey}`
        const deleteBusy = busyAction === `delete:${recordKey}`
        const canInclude = Boolean(targetProjectId) && record.origin !== 'demo'
        return (
        <article key={recordKey} className={`literature-item${record.included ? ' is-included' : ''}`}>
          <button type="button" className="literature-main" onClick={() => onOpen(record)}>
            <span className="literature-icon">
              <FileText size={16} />
            </span>
            <span className="literature-copy">
              <strong>{record.title}</strong>
              <span>{record.authors.join('、') || '作者未知'}{record.year ? ` · ${record.year}` : ''}</span>
              <small>{record.venue || record.source.toUpperCase()}</small>
              {showProject && (
                <small className="literature-project-label"><Folder size={11} /> {owner?.title ?? '未分类'}</small>
              )}
            </span>
          </button>
          <div className="literature-foot">
            <StatusBadge status={record.verificationStatus}>{verificationLabels[record.verificationStatus]}</StatusBadge>
            <div className="literature-actions">
              <button
                type="button"
                className={record.included ? 'include-button is-included' : 'include-button'}
                disabled={!canInclude || toggleBusy || removeBusy || deleteBusy}
                title={!targetProjectId ? '请先选择目标项目' : record.origin === 'demo' ? '演示文献不可用于正式写作' : undefined}
                aria-label={targetProjectId ? `${record.included ? '取消纳入' : '纳入'}《${record.title}》` : `《${record.title}》尚未选择项目`}
                onClick={async () => {
                  if (!targetProjectId) return
                  setBusyAction(`toggle:${recordKey}`)
                  try { await onToggle(record, targetProjectId) } finally { setBusyAction(undefined) }
                }}
              >
                {toggleBusy ? <LoaderCircle size={13} className="spin" /> : record.included ? <Check size={13} /> : <Plus size={13} />}
                {toggleBusy ? '处理中' : record.included ? '取消纳入' : '纳入项目'}
              </button>
              {record.projectId && onRemove && (
                <button
                  type="button"
                  className="remove-literature-button"
                  disabled={toggleBusy || removeBusy || deleteBusy}
                  aria-label={`将《${record.title}》移出项目`}
                  title="移出项目但保留在全部文献中"
                  onClick={async () => {
                    setBusyAction(`remove:${recordKey}`)
                    try { await onRemove(record) } finally { setBusyAction(undefined) }
                  }}
                >
                  {removeBusy ? <LoaderCircle size={13} className="spin" /> : <FolderX size={13} />}
                  {removeBusy ? '移出中' : '移出项目'}
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  className="delete-literature-button"
                  disabled={toggleBusy || removeBusy || deleteBusy}
                  aria-label={`删除文献《${record.title}》`}
                  title="从本机文献库永久删除"
                  onClick={() => setPendingDeletion(record)}
                >
                  <Trash2 size={13} />
                  删除
                </button>
              )}
            </div>
          </div>
        </article>
        )
      })}
    </div>
    <DeleteLiteratureDialog
      record={pendingDeletion}
      busy={Boolean(pendingDeletion && busyAction === `delete:${pendingDeletion.projectId ?? 'unclassified'}:${pendingDeletion.id}`)}
      onClose={() => !busyAction && setPendingDeletion(undefined)}
      onConfirm={async () => {
        if (!pendingDeletion || !onDelete) return
        const action = `delete:${pendingDeletion.projectId ?? 'unclassified'}:${pendingDeletion.id}`
        setBusyAction(action)
        try {
          await onDelete(pendingDeletion)
          setPendingDeletion(undefined)
        } finally {
          setBusyAction(undefined)
        }
      }}
    />
    </>
  )
}
