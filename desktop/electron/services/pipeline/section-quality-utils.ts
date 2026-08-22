import type { OutlineEvidenceNeed, SectionProfile } from '../../../shared/contracts'
import {
  GENERIC_ROLE_PATTERNS,
  PROFILE_RESPONSIBILITIES,
  type ParagraphInfo,
  type SectionQualityMetrics,
  type SectionQualityOptions,
  type SectionQualitySectionInput,
  type SectionQualityThresholds,
  type SentenceInfo,
} from './section-quality-types'

export function collectStyleMetrics(
  paragraphs: ParagraphInfo[],
  sentences: SentenceInfo[],
): SectionQualityMetrics {
  const sentenceLengths = sentences.map((sentence) => sentence.units)
  const mean = average(sentenceLengths)
  const standardDeviation = deviation(sentenceLengths, mean)
  const repeated = countRepeatedOpeningParagraphs(paragraphs)
  return {
    paragraphCount: paragraphs.length,
    sentenceCount: sentences.length,
    boilerplatePhraseCount: 0,
    boilerplatePhraseDensity: 0,
    repeatedParagraphOpeningCount: repeated,
    repeatedParagraphOpeningRatio: paragraphs.length ? repeated / paragraphs.length : 0,
    sentenceLengthMean: round(mean),
    sentenceLengthStdDev: round(standardDeviation),
    sentenceLengthCoefficient: mean > 0 ? round(standardDeviation / mean) : 0,
    responsibilityExpectedCount: 0,
    responsibilityCoveredCount: 0,
    responsibilityCoverage: 1,
    claimCount: 0,
    claimsWithEvidenceCount: 0,
    claimEvidenceCoverage: 1,
    crossSectionDuplicateCount: 0,
  }
}

export function collectParagraphs(content: string): ParagraphInfo[] {
  return content
    .split(/\n\s*\n+/)
    .map((part) => stripMarkdown(part).trim())
    .filter((part) => part && !/^#{1,6}\s/.test(part))
    .map((text) => ({
      text,
      normalized: normalizeForComparison(text),
      opening: paragraphOpening(text),
      units: textUnits(text),
    }))
    .filter((paragraph) => paragraph.units >= 12)
}

export function collectSentences(content: string): SentenceInfo[] {
  return content
    .split(/(?<=[。！？!?；;])\s*|\n+/)
    .map((sentence) => stripMarkdown(sentence).replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence && !/^#{1,6}\s/.test(sentence))
    .map((text) => ({ text, units: textUnits(text) }))
    .filter((sentence) => sentence.units >= 4)
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+]\s+|\d+(?:\.\d+)*[.)、]\s+)/gm, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[`*_~]/g, '')
}

export function normalizeForComparison(text: string): string {
  return compact(text)
    .replace(/文献[:：][^】]+/g, '')
    .replace(/cite:[^\]]+/gi, '')
}

export function paragraphOpening(text: string): string {
  const cleaned = text
    .replace(/^\s*(?:#{1,6}\s+)?(?:\d+(?:\.\d+)*[.)、]\s*|[一二三四五六七八九十]+[、.．]\s*)/, '')
    .replace(/^(?:首先|其次|再次|最后|此外|同时|总体而言|总的来说)[，,：:]\s*/, '')
  const tokens = cleaned.match(/[A-Za-z0-9]+|[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? []
  return tokens.slice(0, 10).join('').toLowerCase()
}

export function countRepeatedOpeningParagraphs(paragraphs: ParagraphInfo[]): number {
  const groups = groupBy(paragraphs, (paragraph) => paragraph.opening)
  return [...groups.values()]
    .filter((items) => items[0]?.opening.length >= 4 && items.length >= 2)
    .reduce((sum, items) => sum + items.length, 0)
}

export function inferClaimCandidates(sentences: string[]): string[] {
  return sentences
    .filter((sentence) => /研究表明|数据显示|结果表明|结果显示|说明|表明|意味着|因此|可见|发现|studies?\s+(?:show|find)|data\s+(?:show|indicate)|therefore|suggest|indicat|imply/i.test(sentence))
    .filter((sentence) => textUnits(sentence) >= 14)
    .slice(0, 12)
}

export function findClaimEvidence(
  claim: string,
  sentences: SentenceInfo[],
  needs: OutlineEvidenceNeed[],
): boolean {
  const claimTerms = claimTermsForMatching(claim)
  const ranked = sentences
    .map((sentence) => ({
      sentence,
      overlap: claimTerms.filter((term) => compact(sentence.text).includes(term)).length,
    }))
    .filter((item) => item.overlap > 0)
    .sort((left, right) => right.overlap - left.overlap)
  const relevant = ranked[0]?.sentence
  if (!relevant) return false
  return hasEvidenceForSentence(relevant.text, needs)
}

export function hasEvidenceForSentence(sentence: string, needs: OutlineEvidenceNeed[]): boolean {
  const citation = /【文献[:：][^】]+】|\[cite:[^\]]+\]|\[@[^\]]+\]/i.test(sentence)
  if (needs.includes('literature') && citation) return true
  if (needs.includes('project-data') && /数据|样本|实验|调查|测量|统计|记录|观测|dataset|sample|experiment|survey|measure|statistic|record|observation/i.test(sentence)) return true
  if (needs.includes('case-material') && /案例|材料|访谈|档案|记录|文本|case|material|interview|archive|record|text/i.test(sentence)) return true
  if (needs.includes('analysis') && /因此|说明|表明|意味着|由此|可见|分析|推断|therefore|indicat|suggest|imply|infer|analysis/i.test(sentence)) return true
  return false
}

export function resolveResponsibilityRules(
  profile?: SectionProfile,
  role?: string,
) {
  const rules = [...(profile ? PROFILE_RESPONSIBILITIES[profile] ?? [] : [])]
  if (role) {
    for (const item of GENERIC_ROLE_PATTERNS) {
      if (!item.keywords.test(role)) continue
      if (!rules.some((existing) => existing.label === item.rule.label)) rules.push(item.rule)
    }
  }
  return rules
}

export function findCrossSectionDuplicate(
  left: SectionQualitySectionInput,
  right: SectionQualitySectionInput,
  thresholds: SectionQualityThresholds,
): { similarity: number; excerpt: string } | undefined {
  const leftParagraphs = collectParagraphs(left.content)
  const rightParagraphs = collectParagraphs(right.content)
  for (const leftParagraph of leftParagraphs) {
    if (leftParagraph.units < thresholds.crossSectionMinimumParagraphUnits) continue
    for (const rightParagraph of rightParagraphs) {
      if (rightParagraph.units < thresholds.crossSectionMinimumParagraphUnits) continue
      const similarity = paragraphSimilarity(leftParagraph.normalized, rightParagraph.normalized)
      if (similarity >= thresholds.crossSectionSimilarity) return { similarity, excerpt: leftParagraph.text }
    }
  }
  return undefined
}

export function paragraphSimilarity(left: string, right: string): number {
  if (!left || !right) return 0
  if (left === right) return 1
  const leftBigrams = ngrams(left)
  const rightBigrams = ngrams(right)
  if (leftBigrams.size === 0 || rightBigrams.size === 0) return 0
  let intersection = 0
  for (const item of leftBigrams) if (rightBigrams.has(item)) intersection += 1
  return intersection / (leftBigrams.size + rightBigrams.size - intersection)
}

export function claimTermsForMatching(claim: string): string[] {
  const terms = new Set<string>()
  const chinese = claim.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]{2,}/g) ?? []
  for (const part of chinese) {
    for (let index = 0; index < part.length - 1; index += 1) terms.add(part.slice(index, index + 2))
  }
  const latin = claim.match(/[A-Za-z][A-Za-z0-9'-]{2,}/g) ?? []
  for (const word of latin) terms.add(word.toLowerCase())
  return [...terms].filter((term) => !COMMON_TERMS.has(term)).slice(0, 40)
}

const COMMON_TERMS = new Set(['研究', '本研', '本文', '可以', '进行', '通过', '对于', '以及', '相关', '问题', 'analysis', 'study', 'paper'])

export function evidenceNeedLabel(need: OutlineEvidenceNeed): string {
  return {
    literature: '文献',
    'project-data': '项目数据',
    'case-material': '案例材料',
    analysis: '分析推理',
  }[need]
}

export function textUnits(text: string): number {
  const chinese = text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g)?.length ?? 0
  const latin = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0
  return chinese + latin
}

export function compact(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/gi, '')
}

export function ngrams(text: string): Set<string> {
  const result = new Set<string>()
  for (let index = 0; index < text.length - 1; index += 1) result.add(text.slice(index, index + 2))
  return result
}

export function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const group = groups.get(key) ?? []
    group.push(item)
    groups.set(key, group)
  }
  return groups
}

export function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

export function deviation(values: number[], mean: number): number {
  if (!values.length) return 0
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
}

export function round(value: number): number {
  return Number(value.toFixed(3))
}

export function emptyMetrics(): SectionQualityMetrics {
  return {
    paragraphCount: 0,
    sentenceCount: 0,
    boilerplatePhraseCount: 0,
    boilerplatePhraseDensity: 0,
    repeatedParagraphOpeningCount: 0,
    repeatedParagraphOpeningRatio: 0,
    sentenceLengthMean: 0,
    sentenceLengthStdDev: 0,
    sentenceLengthCoefficient: 0,
    responsibilityExpectedCount: 0,
    responsibilityCoveredCount: 0,
    responsibilityCoverage: 1,
    claimCount: 0,
    claimsWithEvidenceCount: 0,
    claimEvidenceCoverage: 1,
    crossSectionDuplicateCount: 0,
  }
}

export function addMetrics(target: SectionQualityMetrics, source: SectionQualityMetrics): void {
  target.paragraphCount += source.paragraphCount
  target.sentenceCount += source.sentenceCount
  target.boilerplatePhraseCount += source.boilerplatePhraseCount
  target.boilerplatePhraseDensity += source.boilerplatePhraseDensity
  target.repeatedParagraphOpeningCount += source.repeatedParagraphOpeningCount
  target.repeatedParagraphOpeningRatio += source.repeatedParagraphOpeningRatio
  target.sentenceLengthMean += source.sentenceLengthMean
  target.sentenceLengthStdDev += source.sentenceLengthStdDev
  target.sentenceLengthCoefficient += source.sentenceLengthCoefficient
  target.responsibilityExpectedCount += source.responsibilityExpectedCount
  target.responsibilityCoveredCount += source.responsibilityCoveredCount
  target.responsibilityCoverage += source.responsibilityCoverage
  target.claimCount += source.claimCount
  target.claimsWithEvidenceCount += source.claimsWithEvidenceCount
  target.claimEvidenceCoverage += source.claimEvidenceCoverage
}

export function divideMetrics(metrics: SectionQualityMetrics, divisor: number): void {
  metrics.boilerplatePhraseDensity = round(metrics.boilerplatePhraseDensity / divisor)
  metrics.repeatedParagraphOpeningRatio = round(metrics.repeatedParagraphOpeningRatio / divisor)
  metrics.sentenceLengthMean = round(metrics.sentenceLengthMean / divisor)
  metrics.sentenceLengthStdDev = round(metrics.sentenceLengthStdDev / divisor)
  metrics.sentenceLengthCoefficient = round(metrics.sentenceLengthCoefficient / divisor)
  metrics.responsibilityCoverage = metrics.responsibilityExpectedCount
    ? round(metrics.responsibilityCoveredCount / metrics.responsibilityExpectedCount)
    : 1
  metrics.claimEvidenceCoverage = metrics.claimCount
    ? round(metrics.claimsWithEvidenceCount / metrics.claimCount)
    : 1
}
