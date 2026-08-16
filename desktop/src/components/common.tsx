// 跨页面复用的基础小组件；从 App.tsx 抽出。
import {
  BrainCircuit,
  ChevronRight,
  CircleDot,
  ListChecks,
  LoaderCircle,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function IconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  disabled = false,
  className = '',
}: {
  icon: LucideIcon
  label: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      className={`icon-button${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={17} aria-hidden="true" />
    </button>
  )
}

export function StatusBadge({ status, children }: { status: string; children: React.ReactNode }) {
  return (
    <span className={`status-badge status-${status}`}>
      <CircleDot size={11} aria-hidden="true" />
      {children}
    </span>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={22} aria-hidden="true" />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  )
}

export function GenerateOutlineAction({
  canGenerate,
  generating,
  onGenerate,
  onConfigureModel,
}: {
  canGenerate: boolean
  generating: boolean
  onGenerate: () => void
  onConfigureModel: () => void
}) {
  return (
    <div className="generate-outline-actions">
      <button type="button" className="primary-button compact" onClick={onGenerate} disabled={!canGenerate || generating}>
        {generating ? <LoaderCircle size={15} className="spin" /> : <ListChecks size={15} />}
        {generating ? '正在生成大纲' : '生成三级大纲'}
      </button>
      {!canGenerate && (
        <button type="button" className="inline-link" onClick={onConfigureModel}>
          请先配置可用模型
        </button>
      )}
    </div>
  )
}

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

export function ThinkingBlock({ content, streaming }: { content: string; streaming: boolean }) {
  const [open, setOpen] = useState(streaming)

  useEffect(() => {
    if (streaming) setOpen(true)
  }, [streaming])

  if (!content.trim()) return null
  return (
    <details className={`thinking-block${streaming ? ' is-streaming' : ''}`} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <BrainCircuit size={15} />
        <span>{streaming ? '正在思考' : '思考过程'}</span>
        {streaming && <LoaderCircle size={13} className="spin" />}
        <ChevronRight size={14} className="thinking-chevron" />
      </summary>
      <div className="thinking-content">{content}</div>
    </details>
  )
}
