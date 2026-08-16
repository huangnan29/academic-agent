// 文献详情侧栏：书目信息、摘要与可用性检查；从 App.tsx 抽出。
import { BookOpen, CircleAlert, CircleCheck, ExternalLink, X } from 'lucide-react'
import type { LiteratureRecord, WorkspaceState } from '../../shared/contracts'
import { verificationLabels } from '../lib/labels'
import { EmptyState, IconButton, StatusBadge } from './common'

export function LiteratureDetail({
  record,
  project,
  citationCount = 0,
  onClose,
  onOpen,
}: {
  record?: LiteratureRecord
  project?: WorkspaceState['projects'][number]
  citationCount?: number
  onClose: () => void
  onOpen: (url: string) => void
}) {
  if (!record) {
    return (
      <aside className="detail-panel">
        <EmptyState icon={BookOpen} title="选择一条文献" description="这里会显示书目信息、摘要、来源链接和核验状态。" />
      </aside>
    )
  }

  return (
    <aside className="detail-panel">
      <div className="detail-panel-head">
        <strong>文献详情</strong>
        <IconButton icon={X} label="关闭详情" onClick={onClose} />
      </div>
      <div className="detail-panel-body">
        <StatusBadge status={record.verificationStatus}>{verificationLabels[record.verificationStatus]}</StatusBadge>
        <h2>{record.title}</h2>
        <dl className="metadata-list">
          <div><dt>所属项目</dt><dd>{project?.title ?? '未分类（仅保留在全部文献）'}</dd></div>
          <div><dt>作者</dt><dd>{record.authors.join('、') || '未知'}</dd></div>
          <div><dt>年份</dt><dd>{record.year ?? '未知'}</dd></div>
          <div><dt>期刊 / 来源</dt><dd>{record.venue || record.source.toUpperCase()}</dd></div>
          <div><dt>DOI</dt><dd>{record.doi || '未提供'}</dd></div>
        </dl>
        <section className="abstract-block">
          <h3>摘要</h3>
          <p>{record.abstract || '当前来源未返回摘要。'}</p>
        </section>
        <div className="evidence-checklist">
          <h3>可用性检查</h3>
          <p className={record.verificationStatus === 'verified-metadata' ? '' : 'is-warning'}>
            {record.verificationStatus === 'verified-metadata' ? <CircleCheck size={15} /> : <CircleAlert size={15} />}
            {record.verificationStatus === 'verified-metadata'
              ? '公开来源已返回书目信息'
              : '书目信息已收录，尚未由公开来源确认'}
          </p>
          <p className={record.abstract ? '' : 'is-warning'}>
            {record.abstract ? <CircleCheck size={15} /> : <CircleAlert size={15} />}
            {record.abstract ? '来源摘要已获取' : '当前来源未返回摘要'}
          </p>
          <p className={record.url ? '' : 'is-warning'}>
            {record.url ? <CircleCheck size={15} /> : <CircleAlert size={15} />}
            {record.url ? '原始来源链接已收录' : '缺少原始来源链接'}
          </p>
          <p className={citationCount > 0 ? 'is-warning' : 'is-muted'}>
            <CircleAlert size={15} />
            {citationCount > 0
              ? `已映射 ${citationCount} 处正文引用，仍需核对原文支持`
              : '尚未用于正文引用'}
          </p>
          <small className="evidence-boundary">
            当前检查只验证元数据、摘要、来源链接和引用映射；未取得可核对的全文证据时，不会自动判断该文献是否支持正文主张。
          </small>
        </div>
        {record.url && (
          <button type="button" className="secondary-button detail-link" onClick={() => onOpen(record.url!)}>
            <ExternalLink size={15} /> 打开原始来源
          </button>
        )}
      </div>
    </aside>
  )
}
