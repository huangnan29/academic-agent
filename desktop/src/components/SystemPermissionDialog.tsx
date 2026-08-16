// macOS 系统权限中心弹窗；从 App.tsx 抽出。
import { Check, CircleAlert, CircleCheck, LoaderCircle, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { SystemPermissionKind, SystemPermissionSnapshot } from '../../shared/contracts'
import { permissionStatusLabels } from '../lib/labels'
import { IconButton } from './common'

export function SystemPermissionDialog({
  open,
  snapshot,
  busy,
  onClose,
  onRequest,
  onRefresh,
  onOpenSettings,
  onEnable,
}: {
  open: boolean
  snapshot?: SystemPermissionSnapshot
  busy: boolean
  onClose: () => void
  onRequest: () => void
  onRefresh: () => void
  onOpenSettings: (kind: SystemPermissionKind) => void
  onEnable: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus())
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, busy, onClose])

  if (!open) return null
  const platformSupported = snapshot?.platform !== 'unsupported'
  const rows: Array<{
    kind: SystemPermissionKind
    title: string
    detail: string
    status: SystemPermissionSnapshot['accessibility']
    required: boolean
  }> = [
    {
      kind: 'accessibility',
      title: '辅助功能',
      detail: '允许学术 Agent 在用户明确发起操作时控制其他应用界面。',
      status: snapshot?.accessibility ?? 'unknown',
      required: true,
    },
    {
      kind: 'full-disk-access',
      title: '完全磁盘访问',
      detail: '允许访问受 macOS 隐私保护的文件位置；只能由你在系统设置中授予。',
      status: snapshot?.fullDiskAccess ?? 'unknown',
      required: true,
    },
    {
      kind: 'screen-recording',
      title: '屏幕录制',
      detail: '仅在后续需要读取屏幕内容时使用，不影响当前完全访问模式。',
      status: snapshot?.screenRecording ?? 'unknown',
      required: false,
    },
  ]

  return (
    <div className="modal-backdrop system-permission-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section ref={dialogRef} tabIndex={-1} className="modal system-permission-modal" role="dialog" aria-modal="true" aria-labelledby="system-permission-title">
        <header className="modal-header">
          <div>
            <span className="modal-icon"><ShieldCheck size={18} /></span>
            <div>
              <h2 id="system-permission-title">macOS 系统权限</h2>
              <p>应用只读取真实系统状态；没有授权时不会把对话标记为完全访问。</p>
            </div>
          </div>
          <IconButton icon={X} label="关闭系统权限" onClick={onClose} disabled={busy} />
        </header>
        <div className="system-permission-body">
          {!platformSupported && (
            <div className="system-permission-warning"><CircleAlert size={17} /><span>浏览器演示不能申请 macOS 权限，请在桌面应用中使用。</span></div>
          )}
          <div className="system-permission-list">
            {rows.map((row) => (
              <div className="system-permission-row" key={row.kind}>
                <span className={`system-permission-state is-${row.status}`} aria-hidden="true">
                  {row.status === 'granted' ? <Check size={15} /> : <CircleAlert size={15} />}
                </span>
                <span>
                  <strong>{row.title}{row.required ? ' · 必需' : ' · 可选'}</strong>
                  <small>{row.detail}</small>
                </span>
                <span className={`system-permission-label is-${row.status}`}>{permissionStatusLabels[row.status]}</span>
                {row.kind === 'accessibility' && row.status !== 'granted' ? (
                  <button type="button" className="secondary-button compact" onClick={onRequest} disabled={busy || !platformSupported}>申请</button>
                ) : (
                  <button type="button" className="secondary-button compact" onClick={() => onOpenSettings(row.kind)} disabled={busy || !platformSupported}>系统设置</button>
                )}
              </div>
            ))}
          </div>
          <div className={`system-permission-summary${snapshot?.fullAccessReady ? ' is-ready' : ''}`}>
            {snapshot?.fullAccessReady ? <CircleCheck size={18} /> : <CircleAlert size={18} />}
            <span>
              <strong>{snapshot?.fullAccessReady ? '真实授权已经满足' : '完全访问尚未启用'}</strong>
              <small>{snapshot?.fullAccessReady ? '可以为当前对话启用完全访问。' : '请完成两项必需权限，然后返回应用重新检测。更改完全磁盘访问后，macOS 可能要求重启应用。'}</small>
            </span>
          </div>
        </div>
        <footer className="modal-footer system-permission-footer">
          <button type="button" className="secondary-button" onClick={onRefresh} disabled={busy || !platformSupported}>
            {busy ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />} 重新检测
          </button>
          <span />
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>关闭</button>
          <button type="button" className="primary-button compact" onClick={onEnable} disabled={busy || !snapshot?.fullAccessReady}>启用完全访问</button>
        </footer>
      </section>
    </div>
  )
}
