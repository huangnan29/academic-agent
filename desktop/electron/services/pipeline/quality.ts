import type { WorkspaceState } from '../../../shared/contracts'

export type QualityIssueSeverity = 'error' | 'warning' | 'info'

export interface QualityIssue {
  code: string
  severity: QualityIssueSeverity
  message: string
  excerpt?: string
}

export interface QualityCheckOptions {
  targetWords?: number
  minimumLengthRatio?: number
  language?: 'zh-CN' | 'en'
  allowedCitationIds?: string[]
  requireCitations?: boolean
}

export interface QualityReport {
  passed: boolean
  score: number
  issues: QualityIssue[]
  metrics: {
    wordCount: number
    headingCount: number
    citationCount: number
    mappedCitationCount: number
    unmappedCitationCount: number
  }
}

export function runQualityChecks(
  content: string,
  options: QualityCheckOptions = {},
): QualityReport {
  const text = content.trim()
  const issues: QualityIssue[] = []
  const wordCount = countWords(text, options.language)
  const headings = text
    .split(/\r?\n/)
    .map((line) => /^(#{1,6})\s+/.exec(line)?.[1].length)
    .filter((level): level is number => typeof level === 'number')
  const citationIds = extractCitationIds(text)
  const allowedCitationIds = new Set(options.allowedCitationIds ?? [])
  const citationValidationEnabled = options.allowedCitationIds !== undefined
  const mappedCitationCount = citationIds.filter((id) => allowedCitationIds.has(id)).length
  const unmapped = [...new Set(citationIds.filter((id) => !allowedCitationIds.has(id)))]

  if (!text) {
    issues.push({ code: 'EMPTY_CONTENT', severity: 'error', message: '文稿内容为空。' })
  }

  if (options.targetWords && text) {
    const minimumRatio = options.minimumLengthRatio ?? 0.7
    if (wordCount < options.targetWords * minimumRatio) {
      issues.push({
        code: 'TOO_SHORT',
        severity: 'error',
        message: `当前约 ${wordCount} 字/词，低于目标篇幅 ${options.targetWords} 的 ${Math.round(minimumRatio * 100)}%。`,
      })
    } else if (wordCount > options.targetWords * 1.4) {
      issues.push({
        code: 'TOO_LONG',
        severity: 'warning',
        message: `当前约 ${wordCount} 字/词，明显超过目标篇幅 ${options.targetWords}。`,
      })
    }
  }

  for (let index = 1; index < headings.length; index += 1) {
    if (headings[index] - headings[index - 1] > 1) {
      issues.push({
        code: 'HEADING_LEVEL_JUMP',
        severity: 'warning',
        message: '文稿存在跳级标题，请检查章节层次。',
      })
      break
    }
  }

  const placeholderMatch = /(TODO|TBD|Lorem ipsum|\[待(?:补充|核验|引用)[^\]]*\]|【待(?:补充|核验|引用)[^】]*】|此处(?:补充|插入))/i.exec(text)
  if (placeholderMatch) {
    issues.push({
      code: 'PLACEHOLDER_FOUND',
      severity: 'error',
      message: '文稿仍包含待补充占位内容。',
      excerpt: placeholderMatch[0],
    })
  }

  if (unmapped.length > 0 && citationValidationEnabled) {
    issues.push({
      code: 'UNMAPPED_CITATION',
      severity: 'error',
      message: `发现未映射的文献 ID：${unmapped.slice(0, 8).join('、')}。`,
    })
  }

  if ((options.requireCitations || allowedCitationIds.size > 0) && citationIds.length === 0 && wordCount > 300) {
    issues.push({
      code: 'NO_TRACEABLE_CITATIONS',
      severity: 'warning',
      message: '文稿尚未包含可追溯的 `【文献:ID】` 引用标记。',
    })
  }

  const unsupportedClaim = findUnsupportedClaim(text)
  if (unsupportedClaim && citationIds.length === 0) {
    issues.push({
      code: 'CLAIM_WITHOUT_CITATION',
      severity: 'warning',
      message: '文稿含有“研究表明/数据显示”等证据性表述，但未发现可追溯引用。',
      excerpt: unsupportedClaim,
    })
  }

  const duplicate = findDuplicateParagraph(text)
  if (duplicate) {
    issues.push({
      code: 'DUPLICATE_PARAGRAPH',
      severity: 'warning',
      message: '文稿存在重复段落，请检查生成内容。',
      excerpt: duplicate.slice(0, 120),
    })
  }

  const score = Math.max(
    0,
    100 -
      issues.reduce((total, issue) => {
        if (issue.severity === 'error') return total + 25
        if (issue.severity === 'warning') return total + 10
        return total + 2
      }, 0),
  )

  return {
    passed: issues.every((issue) => issue.severity !== 'error'),
    score,
    issues,
    metrics: {
      wordCount,
      headingCount: headings.length,
      citationCount: citationIds.length,
      mappedCitationCount,
      unmappedCitationCount: unmapped.length,
    },
  }
}

export function runProjectQualityChecks(state: WorkspaceState, projectId: string): QualityReport {
  const project = state.projects.find((item) => item.id === projectId)
  if (!project) throw new Error('找不到要检查的论文项目。')
  const content = state.sections
    // 同步小节已经包含在父章节主稿中，不应再次计入篇幅和质量检查。
    .filter((section) => section.projectId === projectId && !section.derivedFromSectionId)
    // 项目标题在导出稿中占用一级标题，章节从二级标题开始，和 Markdown 导出保持一致。
    .map((section) => `${'#'.repeat(section.level + 1)} ${section.title}\n\n${section.content}`)
    .join('\n\n')
  const citationIds = state.literature
    .filter((item) => item.projectId === projectId && item.included)
    .map((item) => item.id)

  return runQualityChecks(content, {
    targetWords: project.brief.targetWords,
    language: project.brief.language,
    allowedCitationIds: citationIds,
    requireCitations: citationIds.length > 0,
  })
}

export function countWords(content: string, language?: 'zh-CN' | 'en'): number {
  const chineseCharacters = content.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g)?.length ?? 0
  const latinWords = content.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0
  if (language === 'en') return latinWords
  return chineseCharacters + latinWords
}

export function extractCitationIds(content: string): string[] {
  const ids: string[] = []
  const patterns = [
    /【文献[:：]\s*([^】]+)】/g,
    /\[cite:\s*([^\]]+)\]/gi,
    /\[@([^\]]+)\]/g,
  ]
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const id = match[1]?.trim()
      if (id) ids.push(id)
    }
  }
  return ids
}

function findUnsupportedClaim(content: string): string | undefined {
  return content
    .split(/(?<=[。！？.!?])\s*/)
    .find((sentence) => /(研究表明|数据显示|统计显示|实验(?:证明|表明)|调查发现|studies show|data (?:show|indicate))/i.test(sentence))
    ?.slice(0, 180)
}

function findDuplicateParagraph(content: string): string | undefined {
  const seen = new Set<string>()
  for (const paragraph of content.split(/\n\s*\n/)) {
    const normalized = paragraph.replace(/\s+/g, ' ').trim()
    if (normalized.length < 80 || normalized.startsWith('#')) continue
    if (seen.has(normalized)) return normalized
    seen.add(normalized)
  }
  return undefined
}
