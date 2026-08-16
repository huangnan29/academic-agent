// 时间与字节数展示格式化；从 App.tsx 抽出。
import type { ManuscriptSectionVersion } from '../../shared/contracts'

export function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
    date,
  )
}

export function formatSectionVersionMoment(version: ManuscriptSectionVersion): string {
  const time = formatTime(version.createdAt)
  if (version.source === 'partial' || version.status === 'error') return `未完成 · ${time}`
  if (version.source === 'derived') return `同步于 ${time}`
  if (version.source === 'saved' || version.source === 'migrated') return `保存于 ${time}`
  return `生成于 ${time}`
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
