// 应用级确认弹窗：重新生成大纲、删除文献、删除项目、新建项目；从 App.tsx 抽出。
import {
  CircleAlert,
  ExternalLink,
  FilePenLine,
  FolderOpen,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { LiteratureRecord, ResearchBrief, WorkspaceState } from '../../shared/contracts'
import { IconButton } from './common'

export function RegenerateOutlineDialog({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const busyRef = useRef(busy)
  const onCloseRef = useRef(onClose)
  busyRef.current = busy
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusFrame = window.requestAnimationFrame(() => cancelButtonRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!busyRef.current) {
          event.preventDefault()
          onCloseRef.current()
        }
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="modal regenerate-outline-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="regenerate-outline-title"
        aria-describedby="regenerate-outline-description"
      >
        <header className="modal-header">
          <div>
            <span className="modal-icon"><RefreshCw size={18} /></span>
            <div>
              <h2 id="regenerate-outline-title">重新生成论文大纲？</h2>
              <p id="regenerate-outline-description">当前大纲将交由模型重新规划，生成后会替换现有的大纲结构。</p>
            </div>
          </div>
          <IconButton icon={X} label="关闭" onClick={onClose} disabled={busy} />
        </header>
        <div className="regenerate-outline-body">
          <div className="regenerate-outline-warning">
            <CircleAlert size={17} aria-hidden="true" />
            <div>
              <strong>已有章节正文会受到保护</strong>
              <p>已有正文的章节及其层级会保留，模型只重新规划可安全替换的未生成部分；若模型无法保持这些章节，应用会拒绝替换，旧大纲不变。</p>
            </div>
          </div>
          <p className="regenerate-outline-note">重新生成可能带来不同的章节组织方式；确认前请先检查当前项目是否已有正文。</p>
        </div>
        <footer className="modal-footer">
          <button ref={cancelButtonRef} type="button" className="secondary-button" onClick={onClose} disabled={busy}>取消</button>
          <button type="button" className="primary-button compact" onClick={onConfirm} disabled={busy} aria-busy={busy}>
            {busy ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}
            {busy ? '正在生成大纲' : '确认重新生成'}
          </button>
        </footer>
      </section>
    </div>
  )
}

export function DeleteLiteratureDialog({
  record,
  busy,
  onClose,
  onConfirm,
}: {
  record?: LiteratureRecord
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const busyRef = useRef(busy)
  const onCloseRef = useRef(onClose)
  busyRef.current = busy
  onCloseRef.current = onClose

  useEffect(() => {
    if (!record) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusFrame = window.requestAnimationFrame(() => cancelButtonRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault()
        onCloseRef.current()
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [],
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [record?.id])

  if (!record) return null
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="modal delete-project-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-literature-title"
        aria-describedby="delete-literature-description"
      >
        <header className="modal-header">
          <div>
            <span className="modal-icon is-danger"><Trash2 size={18} /></span>
            <div>
              <h2 id="delete-literature-title">删除这篇文献？</h2>
              <p id="delete-literature-description">“{record.title}”将从本机文献库永久删除，且无法撤销。</p>
            </div>
          </div>
          <IconButton icon={X} label="关闭" onClick={onClose} disabled={busy} />
        </header>
        <div className="delete-project-body">
          <div className="delete-project-impact">
            <strong>将从应用内删除</strong>
            <p>书目信息、摘要、核验状态和项目归属记录。</p>
          </div>
          <div className="delete-project-preserved">
            <ExternalLink size={17} aria-hidden="true" />
            <div>
              <strong>原始论文不受影响</strong>
              <p>不会删除在线论文、已经导出的文稿或研究文件夹；正在被正文引用的文献会被阻止删除。</p>
            </div>
          </div>
        </div>
        <footer className="modal-footer delete-project-footer">
          <button ref={cancelButtonRef} type="button" className="secondary-button" onClick={onClose} disabled={busy}>取消</button>
          <button type="button" className="danger-button" onClick={onConfirm} disabled={busy} aria-busy={busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}
            {busy ? '正在删除' : '永久删除'}
          </button>
        </footer>
      </section>
    </div>
  )
}

export function DeleteProjectDialog({
  project,
  busy,
  onClose,
  onConfirm,
}: {
  project?: WorkspaceState['projects'][number]
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const busyRef = useRef(busy)
  const onCloseRef = useRef(onClose)
  busyRef.current = busy
  onCloseRef.current = onClose

  useEffect(() => {
    if (!project) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusFrame = window.requestAnimationFrame(() => cancelButtonRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!busyRef.current) {
          event.preventDefault()
          onCloseRef.current()
        }
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [project?.id])

  if (!project) return null

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="modal delete-project-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-project-title"
        aria-describedby="delete-project-description"
      >
        <header className="modal-header">
          <div>
            <span className="modal-icon is-danger"><Trash2 size={18} /></span>
            <div>
              <h2 id="delete-project-title">删除“{project.title}”？</h2>
              <p id="delete-project-description">此操作会清理学术 Agent 内与该研究关联的数据，且无法撤销。</p>
            </div>
          </div>
          <IconButton icon={X} label="关闭" onClick={onClose} disabled={busy} />
        </header>
        <div className="delete-project-body">
          <div className="delete-project-impact">
            <strong>将从应用内删除</strong>
            <p>对话、已纳入文献、大纲、章节和过程记录。</p>
          </div>
          <div className="delete-project-preserved">
            <FolderOpen size={17} aria-hidden="true" />
            <div>
              <strong>磁盘文件保持不变</strong>
              <p>不会删除研究文件夹，也不会删除已经导出的 Markdown、Word 等文件。</p>
            </div>
          </div>
        </div>
        <footer className="modal-footer delete-project-footer">
          <button ref={cancelButtonRef} type="button" className="secondary-button" onClick={onClose} disabled={busy}>取消</button>
          <button type="button" className="danger-button" onClick={onConfirm} disabled={busy} aria-busy={busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}
            {busy ? '正在删除' : '删除项目'}
          </button>
        </footer>
      </section>
    </div>
  )
}

export function NewProjectDialog({ open, busy, onClose, onCreate }: { open: boolean; busy: boolean; onClose: () => void; onCreate: (brief: ResearchBrief) => void }) {
  const dialogRef = useRef<HTMLElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const [form, setForm] = useState({
    title: '',
    paperType: '课程论文',
    discipline: '教育学',
    language: 'zh-CN' as 'zh-CN' | 'en',
    targetWords: 8000,
    requirements: '',
    keywords: '',
  })

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} tabIndex={-1} className="modal new-project-modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
        <header className="modal-header">
          <div>
            <span className="modal-icon"><FilePenLine size={18} /></span>
            <div>
              <h2 id="new-project-title">新建研究项目</h2>
              <p>先明确研究边界，后续检索、写作和引用核验都将围绕这些要求进行。</p>
            </div>
          </div>
          <IconButton icon={X} label="关闭" onClick={onClose} />
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onCreate({
              title: form.title.trim(),
              paperType: form.paperType.trim(),
              discipline: form.discipline.trim(),
              language: form.language,
              targetWords: Number(form.targetWords),
              requirements: form.requirements.trim(),
              keywords: form.keywords.split(/[，,]/).map((item) => item.trim()).filter(Boolean),
            })
          }}
        >
          <label className="field full-field">
            <span>研究题目 <b>必填</b></span>
            <input required autoFocus value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：生成式 AI 赋能高校写作教学研究" />
          </label>
          <div className="form-grid">
            <label className="field">
              <span>论文类型</span>
              <select value={form.paperType} onChange={(event) => setForm({ ...form, paperType: event.target.value })}>
                <option>课程论文</option>
                <option>毕业论文</option>
                <option>学术报告</option>
                <option>文献综述</option>
              </select>
            </label>
            <label className="field">
              <span>学科方向</span>
              <input value={form.discipline} onChange={(event) => setForm({ ...form, discipline: event.target.value })} />
            </label>
            <label className="field">
              <span>写作语言</span>
              <select value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value as 'zh-CN' | 'en' })}>
                <option value="zh-CN">简体中文</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="field">
              <span>目标字数</span>
              <input type="number" min={1000} max={100000} step={500} value={form.targetWords} onChange={(event) => setForm({ ...form, targetWords: Number(event.target.value) })} />
            </label>
          </div>
          <label className="field full-field">
            <span>关键词</span>
            <input value={form.keywords} onChange={(event) => setForm({ ...form, keywords: event.target.value })} placeholder="使用逗号分隔，例如：生成式人工智能，高校写作" />
          </label>
          <label className="field full-field">
            <span>补充要求</span>
            <textarea value={form.requirements} onChange={(event) => setForm({ ...form, requirements: event.target.value })} placeholder="研究范围、结构要求、引用规范或希望重点回答的问题…" />
          </label>
          <div className="form-note">
            <ShieldCheck size={16} />
            <span>默认优先使用可核验来源。无法核验的书目信息和主张会明确标记。</span>
          </div>
          <footer className="modal-footer">
            <button type="button" className="secondary-button" onClick={onClose}>取消</button>
            <button type="submit" className="primary-button" disabled={busy || !form.title.trim()}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}
              {busy ? '正在创建' : '创建研究项目'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
