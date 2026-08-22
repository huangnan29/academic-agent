import type { OutlineEvidenceNeed } from '../../../shared/contracts'
import type { QualityIssue } from './quality'
import {
  BOILERPLATE_PHRASES,
  DEFAULT_SECTION_QUALITY_THRESHOLDS,
  type ClaimEvidenceResult,
  type CrossSectionQualityOptions,
  type ParagraphInfo,
  type ProjectSectionQualityOptions,
  type ProjectSectionQualityReport,
  type SectionQualityMetrics,
  type SectionQualityOptions,
  type SectionQualityReport,
  type SectionQualitySectionInput,
  type SectionQualityThresholds,
  type SentenceInfo,
} from './section-quality-types'
import {
  addMetrics,
  collectParagraphs,
  collectSentences,
  collectStyleMetrics,
  divideMetrics,
  emptyMetrics,
  evidenceNeedLabel,
  findClaimEvidence,
  findCrossSectionDuplicate,
  groupBy,
  inferClaimCandidates,
  resolveResponsibilityRules,
  round,
} from './section-quality-utils'

// 保持阶段 2 的公开类型从 pipeline/section-quality.ts 暴露，调用方不需要知道内部拆分。
export { DEFAULT_SECTION_QUALITY_THRESHOLDS } from './section-quality-types'
export type {
  CrossSectionQualityOptions,
  ProjectSectionQualityOptions,
  ProjectSectionQualityReport,
  SectionQualityMetrics,
  SectionQualityOptions,
  SectionQualityReport,
  SectionQualitySectionInput,
  SectionQualityThresholds,
} from './section-quality-types'

/**
 * 对单个章节执行风格、职责和主张—证据检查。
 * 所有本模块产生的 issue 都是 warning，不参与保存阻断，也不代表 AIGC 检测。
 */
export function runSectionQualityChecks(
  content: string,
  options: SectionQualityOptions = {},
): SectionQualityReport {
  const thresholds = { ...DEFAULT_SECTION_QUALITY_THRESHOLDS, ...options.thresholds }
  const text = content.trim()
  const paragraphs = collectParagraphs(text)
  const sentences = collectSentences(text)
  const issues: QualityIssue[] = []
  const styleMetrics = collectStyleMetrics(paragraphs, sentences)

  if (options.includeStyleChecks !== false && text) {
    addBoilerplateIssue(issues, text, sentences, styleMetrics, thresholds)
    addRepeatedOpeningIssue(issues, paragraphs, styleMetrics, thresholds)
    addUniformSentenceIssue(issues, sentences, styleMetrics, thresholds)
  }

  const responsibility = checkResponsibilityCoverage(text, options)
  styleMetrics.responsibilityExpectedCount = responsibility.expectedCount
  styleMetrics.responsibilityCoveredCount = responsibility.coveredCount
  styleMetrics.responsibilityCoverage = responsibility.coverage
  if (responsibility.issue) issues.push(responsibility.issue)

  const evidence = checkClaimEvidenceCoverage(text, sentences, options, thresholds)
  styleMetrics.claimCount = evidence.results.length
  styleMetrics.claimsWithEvidenceCount = evidence.results.filter((item) => item.covered).length
  styleMetrics.claimEvidenceCoverage = evidence.coverage
  if (evidence.issue) issues.push(evidence.issue)

  if (options.includeCrossSectionChecks !== false && options.peerSections?.length) {
    const crossSectionIssues = runCrossSectionQualityChecks([
      {
        id: options.sectionId ?? 'current-section',
        projectId: options.projectId,
        title: options.sectionTitle ?? '当前章节',
        content: text,
        profile: options.profile,
        role: options.role,
        keyClaims: options.keyClaims,
        evidenceNeeds: options.evidenceNeeds,
      },
      ...options.peerSections,
    ], {
      projectId: options.projectId,
      currentSectionId: options.sectionId ?? 'current-section',
      thresholds,
    })
    styleMetrics.crossSectionDuplicateCount = crossSectionIssues.length
    issues.push(...crossSectionIssues)
  }

  return { issues, metrics: styleMetrics }
}

/** 风格检查的窄入口，适合正文流完成后不带章节元数据的检查。 */
export function runSectionStyleQualityChecks(
  content: string,
  thresholds?: Partial<SectionQualityThresholds>,
): SectionQualityReport {
  return runSectionQualityChecks(content, {
    thresholds,
    includeStyleChecks: true,
    includeCrossSectionChecks: false,
  })
}

/**
 * 比较同一项目的主稿章节。这里再次过滤 projectId 和 derivedFromSectionId，
 * 不能由调用方传入一个 derived 小节就绕过“只比较主稿”的边界。
 */
export function runCrossSectionQualityChecks(
  sections: SectionQualitySectionInput[],
  options: CrossSectionQualityOptions = {},
): QualityIssue[] {
  const thresholds = { ...DEFAULT_SECTION_QUALITY_THRESHOLDS, ...options.thresholds }
  const scoped = sections.filter((section) => (
    !section.derivedFromSectionId
    && (!options.projectId || section.projectId === options.projectId)
  ))
  const pairs: Array<[SectionQualitySectionInput, SectionQualitySectionInput]> = []
  if (options.currentSectionId) {
    const current = scoped.find((section) => section.id === options.currentSectionId)
    if (current) scoped.filter((section) => section.id !== current.id).forEach((section) => pairs.push([current, section]))
  } else {
    for (let leftIndex = 0; leftIndex < scoped.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < scoped.length; rightIndex += 1) {
        pairs.push([scoped[leftIndex], scoped[rightIndex]])
      }
    }
  }

  const issues: QualityIssue[] = []
  for (const [left, right] of pairs) {
    if (left.id === right.id) continue
    // 未带项目 ID 的对象无法证明属于同一个项目；项目级入口会始终传入 ID。
    if (!options.projectId && (!left.projectId || !right.projectId || left.projectId !== right.projectId)) continue
    const duplicate = findCrossSectionDuplicate(left, right, thresholds)
    if (!duplicate) continue
    issues.push({
      code: 'CROSS_SECTION_DUPLICATE',
      severity: 'warning',
      message: `“${left.title}”与“${right.title}”存在${duplicate.similarity >= 0.999 ? '相同' : '高度相似'}段落（相似度 ${Math.round(duplicate.similarity * 100)}%），请确认是否应合并或补充章节差异。`,
      excerpt: `${left.title} ↔ ${right.title}：${duplicate.excerpt.slice(0, 160)}`,
    })
  }
  return issues
}

/** 兼容“跨章节检查”直观命名的别名。 */
export const runCrossSectionChecks = runCrossSectionQualityChecks

/** 对项目主稿逐章检查并补充跨章节检查，derived 小节不会进入任一比较。 */
export function runProjectSectionQualityChecks(
  sections: SectionQualitySectionInput[],
  options: ProjectSectionQualityOptions = {},
): ProjectSectionQualityReport {
  const thresholds = { ...DEFAULT_SECTION_QUALITY_THRESHOLDS, ...options.thresholds }
  const scoped = sections.filter((section) => (
    !section.derivedFromSectionId
    && (!options.projectId || section.projectId === options.projectId)
  ))
  const issues: QualityIssue[] = []
  const aggregate = emptyMetrics()

  for (const section of scoped) {
    const report = runSectionQualityChecks(section.content, {
      sectionId: section.id,
      projectId: section.projectId,
      sectionTitle: section.title,
      profile: section.profile,
      role: section.role,
      keyClaims: section.keyClaims,
      evidenceNeeds: section.evidenceNeeds,
      thresholds,
      includeCrossSectionChecks: false,
    })
    issues.push(...report.issues)
    addMetrics(aggregate, report.metrics)
  }

  const crossIssues = runCrossSectionQualityChecks(scoped, {
    projectId: options.projectId,
    thresholds,
  })
  issues.push(...crossIssues)
  aggregate.crossSectionDuplicateCount = crossIssues.length
  if (scoped.length > 0) divideMetrics(aggregate, scoped.length)
  return { issues, metrics: aggregate }
}

function addBoilerplateIssue(
  issues: QualityIssue[],
  text: string,
  sentences: SentenceInfo[],
  metrics: SectionQualityMetrics,
  thresholds: SectionQualityThresholds,
): void {
  const hits: string[] = []
  let count = 0
  for (const phrase of BOILERPLATE_PHRASES) {
    const matches = text.match(phrase.pattern)?.length ?? 0
    if (matches > 0) {
      count += matches
      hits.push(`${phrase.label}×${matches}`)
    }
  }
  const density = sentences.length > 0 ? count / sentences.length : 0
  metrics.boilerplatePhraseCount = count
  metrics.boilerplatePhraseDensity = round(density)
  if (count < thresholds.minimumBoilerplateMatches || density < thresholds.boilerplateDensity) return
  issues.push({
    code: 'BOILERPLATE_DENSITY',
    severity: 'warning',
    message: `套话/空泛短语命中 ${count} 次，占约 ${Math.round(density * 100)}% 的句子（阈值 ${Math.round(thresholds.boilerplateDensity * 100)}%）；请优先替换为与本节对象、证据和判断直接相关的表述。`,
    excerpt: hits.slice(0, 4).join('、'),
  })
}

function addRepeatedOpeningIssue(
  issues: QualityIssue[],
  paragraphs: ParagraphInfo[],
  metrics: SectionQualityMetrics,
  thresholds: SectionQualityThresholds,
): void {
  const groups = groupBy(paragraphs, (paragraph) => paragraph.opening)
  const repeated = [...groups.entries()]
    .filter(([opening, items]) => opening.length >= 4 && items.length >= thresholds.repeatedOpeningMinimum)
    .sort((left, right) => right[1].length - left[1].length)
  if (repeated.length === 0) return
  const repeatedCount = repeated.reduce((sum, [, items]) => sum + items.length, 0)
  metrics.repeatedParagraphOpeningCount = repeatedCount
  metrics.repeatedParagraphOpeningRatio = paragraphs.length ? round(repeatedCount / paragraphs.length) : 0
  const examples = repeated.slice(0, 3).map(([opening, items]) => `“${opening}”×${items.length}`)
  issues.push({
    code: 'REPEATED_PARAGRAPH_OPENING',
    severity: 'warning',
    message: `有 ${repeated.length} 组段落使用相同或高度相近的开头（涉及 ${repeatedCount} 段）；建议调整段落进入方式，让每段先呈现本段判断或证据。`,
    excerpt: examples.join('；'),
  })
}

function addUniformSentenceIssue(
  issues: QualityIssue[],
  sentences: SentenceInfo[],
  metrics: SectionQualityMetrics,
  thresholds: SectionQualityThresholds,
): void {
  if (sentences.length < thresholds.sentenceUniformityMinimumSentences) return
  const lengths = sentences.map((sentence) => sentence.units)
  const mean = lengths.length ? lengths.reduce((sum, value) => sum + value, 0) / lengths.length : 0
  const standardDeviation = Math.sqrt(lengths.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, lengths.length))
  const coefficient = mean > 0 ? standardDeviation / mean : 0
  const range = lengths.length > 0 ? Math.max(...lengths) - Math.min(...lengths) : 0
  metrics.sentenceLengthMean = round(mean)
  metrics.sentenceLengthStdDev = round(standardDeviation)
  metrics.sentenceLengthCoefficient = round(coefficient)
  if (mean < 12 || coefficient > thresholds.sentenceUniformityCoefficient || range > mean * 0.5) return
  issues.push({
    code: 'UNIFORM_SENTENCE_LENGTH',
    severity: 'warning',
    message: `句长变异系数约 ${coefficient.toFixed(2)}，${sentences.length} 个句子的长度过度统一；建议让句式长短服务于定义、证据和小结，而不是机械保持同一节奏。`,
  })
}

function checkResponsibilityCoverage(
  text: string,
  options: SectionQualityOptions,
): { expectedCount: number; coveredCount: number; coverage: number; issue?: QualityIssue } {
  const rules = resolveResponsibilityRules(options.profile, options.role)
  if (rules.length === 0) return { expectedCount: 0, coveredCount: 0, coverage: 1 }
  const covered = rules.filter((item) => item.patterns.some((pattern) => pattern.test(text)))
  const coverage = covered.length / rules.length
  if (coverage >= 0.6) return { expectedCount: rules.length, coveredCount: covered.length, coverage: round(coverage) }
  const missing = rules.filter((item) => !covered.includes(item)).map((item) => item.label)
  const profileLabel = options.profile ? `章节类型 ${options.profile}` : '章节角色'
  return {
    expectedCount: rules.length,
    coveredCount: covered.length,
    coverage: round(coverage),
    issue: {
      code: 'SECTION_RESPONSIBILITY_GAP',
      severity: 'warning',
      message: `本节${profileLabel}的职责覆盖为 ${covered.length}/${rules.length}（${Math.round(coverage * 100)}%）；尚未明显覆盖：${missing.join('、')}。这是可解释的内容提醒，不是保存阻断或 AIGC 检测结论。`,
      excerpt: options.sectionTitle ? `章节：${options.sectionTitle}` : undefined,
    },
  }
}

function checkClaimEvidenceCoverage(
  text: string,
  sentences: SentenceInfo[],
  options: SectionQualityOptions,
  thresholds: SectionQualityThresholds,
): { results: ClaimEvidenceResult[]; coverage: number; issue?: QualityIssue } {
  const claims = [...new Set((options.keyClaims ?? []).map((claim) => claim.trim()).filter(Boolean))]
  const candidates = claims.length > 0 ? claims : inferClaimCandidates(sentences.map((sentence) => sentence.text))
  if (candidates.length === 0) return { results: [], coverage: 1 }
  const needs: OutlineEvidenceNeed[] = options.evidenceNeeds?.length ? [...options.evidenceNeeds] : ['literature']
  const results = candidates.map((claim) => ({ claim, covered: findClaimEvidence(claim, sentences, needs) }))
  const coveredCount = results.filter((item) => item.covered).length
  const coverage = coveredCount / results.length
  if (coverage >= thresholds.claimEvidenceCoverage) return { results, coverage: round(coverage) }
  const missingClaims = results.filter((item) => !item.covered).slice(0, 3).map((item) => item.claim)
  const evidenceLabel = needs.map((need) => evidenceNeedLabel(need)).join('、')
  return {
    results,
    coverage: round(coverage),
    issue: {
      code: 'CLAIM_EVIDENCE_COVERAGE',
      severity: 'warning',
      message: `本节主张—证据覆盖为 ${coveredCount}/${results.length}（${Math.round(coverage * 100)}%）；当前需要的依据类型为 ${evidenceLabel}。请逐项补充可追溯文献、项目材料或明确分析依据。该提示不等同于 AIGC 检测。`,
      excerpt: missingClaims.join('；').slice(0, 180),
    },
  }
}
