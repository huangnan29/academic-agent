import type { WorkspaceState } from '../../../shared/contracts'
import { createExportDocumentModel, formatReference } from './document-model'

export function buildMarkdown(state: WorkspaceState, projectId: string): string {
  const document = createExportDocumentModel(state, projectId)
  const blocks: string[] = [`# ${document.project.title}`]

  for (const section of document.sections) {
    blocks.push(`${'#'.repeat(section.level + 1)} ${section.title}\n\n${section.content}`)
  }

  if (document.references.length > 0) {
    blocks.push(
      [
        '## 参考文献',
        '',
        ...document.references.map(formatReference),
        '',
        '> 核验说明：文献元数据核验不等于正文观点已得到全文核验；“仅摘要可用”和“未核验”条目需要人工复核。',
      ].join('\n'),
    )
  }

  if (document.unresolvedMarkers.length > 0) {
    blocks.push(
      [
        '## 导出核验提示',
        '',
        `以下引用标记尚未映射，不能视为已核验引用：${document.unresolvedMarkers.join('、')}`,
      ].join('\n'),
    )
  }

  return `${blocks.join('\n\n').trim()}\n`
}
