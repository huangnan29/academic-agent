import type {
  DisciplineFamily,
  OutlineArchitecture,
  OutlineContentForm,
  OutlineEvidenceNeed,
  OutlineNode,
  PaperStructurePattern,
  ResearchBrief,
  SectionContentForm,
  SectionGenerationOptions,
  SectionOptimizationStrategy,
  SectionProfile,
} from '../../../shared/contracts'
import {
  CLASSIFIED_PROFILES,
  CONTENT_FORMS,
  DISCIPLINE_TERMS,
  PROFILE_DEFINITIONS,
  PROFILE_ORDER,
  PROFILE_TERMS,
  ROLE_TERMS,
  STRATEGIES,
  buildContentFormPurpose,
  disciplineRhetoricalMoves,
  getAvailableContentForms,
  isDataBearingProfile,
} from './section-profile-rules'

export { formatSectionGenerationPlan, formatSectionProfilePrompt } from './section-profile-format'

export type SectionEvidenceSource = 'literature' | 'project-data' | 'analysis' | 'missing'
export type SectionNodeSnapshot = Partial<OutlineNode> & { title: string }

export interface SectionProfileInput {
  title?: string
  objective?: string
  role?: string
  keyClaims?: string[]
  evidenceNeeds?: OutlineEvidenceNeed[]
  contentForms?: OutlineContentForm[]
  citationIds?: string[]
  parentTitle?: string
  parentTitles?: string[]
  childTitles?: string[]
  node?: SectionNodeSnapshot
  parent?: SectionNodeSnapshot | string
  ancestors?: Array<SectionNodeSnapshot | string>
  children?: Array<SectionNodeSnapshot | string>
  paperType?: string
  discipline?: string
  disciplineFamily?: DisciplineFamily
  pattern?: PaperStructurePattern
  researchAction?: string
  /** 三个别名都接受，优先使用调用方明确给出的布尔值。 */
  hasRealData?: boolean
  realDataAvailable?: boolean
  dataAvailable?: boolean
  evidence?: { hasRealData?: boolean; dataAvailable?: boolean }
  architecture?: Partial<OutlineArchitecture>
  brief?: Partial<ResearchBrief>
}

export type SectionProfileOptions = Pick<
  SectionGenerationOptions,
  'profile' | 'strategyIds' | 'contentForms'
>

export interface SectionProfileDefinition {
  profile: SectionProfile
  label: string
  summary: string
  rhetoricalMoves: string[]
  forbiddenClaims: string[]
  defaultStrategyIds: SectionOptimizationStrategy[]
  availableContentForms: SectionContentForm[]
}

export interface SectionEvidenceSlot {
  claim: string
  source: SectionEvidenceSource
  referenceIds: string[]
}

export interface SectionContentFormPlan {
  kind: SectionContentForm
  purpose: string
  dataAvailable: boolean
}

/**
 * 阶段 2 的纯规则计划；不调用模型、不读写工作区，可直接格式化后注入一次生成请求。
 * contentForms 是本次实际允许/选择的形态，availableContentForms 是当前学科下可用的形态全集。
 */
export interface SectionGenerationPlan {
  profile: SectionProfile
  profileLabel: string
  profileSummary: string
  disciplineFamily: DisciplineFamily
  dataAvailable: boolean
  dataAvailability: 'available' | 'unavailable' | 'unknown'
  rhetoricalMoves: string[]
  evidenceSlots: SectionEvidenceSlot[]
  contentForms: SectionContentFormPlan[]
  selectedContentForms: SectionContentForm[]
  availableContentForms: SectionContentForm[]
  forbiddenClaims: string[]
  strategyIds: SectionOptimizationStrategy[]
  defaultStrategyIds: SectionOptimizationStrategy[]
  unsupportedContentForms: SectionContentForm[]
  dataBoundary: string
}

export function getSectionProfileDefinition(
  profile: SectionProfile,
  disciplineFamily: DisciplineFamily = 'unknown',
): SectionProfileDefinition {
  const base = PROFILE_DEFINITIONS[isSectionProfile(profile) ? profile : 'general-analysis']
  const forbiddenClaims = [...base.forbiddenClaims]
  if (base.profile === 'result-implementation' && disciplineFamily === 'engineering') {
    forbiddenClaims.push('没有真实测试记录时，不得把代码、界面截图或设计指标写成系统已运行且性能达标。')
  }
  if (base.profile === 'result-implementation' && disciplineFamily === 'education') {
    forbiddenClaims.push('没有真实课堂、问卷或学习数据时，不得写出教学效果、满意度或学习增益。')
  }
  if (base.profile === 'result-implementation' && disciplineFamily === 'management-economics') {
    forbiddenClaims.push('没有真实组织或市场数据时，不得写出绩效提升、影响强度或政策成效。')
  }
  if (base.profile === 'result-implementation'
    && (disciplineFamily === 'literature-language' || disciplineFamily === 'law')) {
    forbiddenClaims.push('只能分析已提供的文本、法条、判例或案例材料，不得虚构文本细节、案件事实或裁判结论。')
  }
  return {
    ...base,
    rhetoricalMoves: [...base.rhetoricalMoves, ...disciplineRhetoricalMoves(base.profile, disciplineFamily)],
    forbiddenClaims: uniqueStrings(forbiddenClaims),
    defaultStrategyIds: [...base.defaultStrategyIds],
    availableContentForms: getAvailableContentForms(base.profile, disciplineFamily),
  }
}

export function listSectionProfileDefinitions(
  disciplineFamily: DisciplineFamily = 'unknown',
): SectionProfileDefinition[] {
  return PROFILE_ORDER.map((profile) => getSectionProfileDefinition(profile, disciplineFamily))
}

export function getDefaultSectionStrategies(
  profile: SectionProfile,
  disciplineFamily: DisciplineFamily = 'unknown',
): SectionOptimizationStrategy[] {
  return getSectionProfileDefinition(profile, disciplineFamily).defaultStrategyIds
}

export function getAvailableSectionContentForms(
  profile: SectionProfile,
  disciplineFamily: DisciplineFamily = 'unknown',
): SectionContentForm[] {
  return getSectionProfileDefinition(profile, disciplineFamily).availableContentForms
}

export function classifySectionProfile(input: SectionProfileInput): SectionProfile {
  const resolved = resolveSectionInput(input)
  const scores = new Map<SectionProfile, number>(PROFILE_ORDER.map((item) => [item, 0]))
  for (const profile of CLASSIFIED_PROFILES) {
    addScore(scores, profile, countTermHits(resolved.title, PROFILE_TERMS[profile]) * 16)
    addScore(scores, profile, countTermHits(resolved.parentText, PROFILE_TERMS[profile]) * 8)
    addScore(scores, profile, countTermHits(resolved.childText, PROFILE_TERMS[profile]) * 3)
    addScore(scores, profile, countTermHits(resolved.role, ROLE_TERMS[profile]) * 10)
    addScore(scores, profile, countTermHits(resolved.objective, PROFILE_TERMS[profile]) * 4)
    addScore(scores, profile, countTermHits(resolved.paperType, PROFILE_TERMS[profile]) * 5)
  }
  const context = [resolved.title, resolved.parentText, resolved.childText, resolved.role, resolved.objective].join(' ')
  const discipline = resolved.disciplineFamily
  if (resolved.evidenceNeeds.includes('project-data')) {
    addScore(scores, 'result-implementation', 7)
    addScore(scores, 'method-design', 3)
  }
  if (resolved.evidenceNeeds.includes('literature')) addScore(scores, 'literature-review', 5)
  if (resolved.evidenceNeeds.includes('case-material')) {
    addScore(scores, 'result-implementation', 3)
    addScore(scores, 'general-analysis', 1)
  }
  if (resolved.evidenceNeeds.includes('analysis')) {
    addScore(scores, 'discussion-conclusion', 2)
    addScore(scores, 'general-analysis', 1)
  }
  if (resolved.contentForms.includes('code') || resolved.contentForms.includes('formula')) {
    addScore(scores, 'method-design', discipline === 'engineering' ? 5 : 2)
    addScore(scores, 'result-implementation', discipline === 'engineering' ? 3 : 1)
  }
  if (resolved.pattern === 'thematic-review') addScore(scores, 'literature-review', 6)
  if (resolved.pattern === 'system-engineering') {
    addScore(scores, 'method-design', 4)
    if (/实现|implementation|测试|evaluation/.test(context)) addScore(scores, 'result-implementation', 4)
  }
  if (resolved.pattern === 'empirical-imrad') {
    addScore(scores, 'method-design', 2)
    addScore(scores, 'result-implementation', 5)
    addScore(scores, 'discussion-conclusion', 2)
  }
  if (resolved.pattern === 'policy-management') addScore(scores, 'discussion-conclusion', 2)
  if (discipline === 'engineering' && /设计|方法|架构|方案/.test(context)) addScore(scores, 'method-design', 5)
  if (discipline === 'engineering' && /实现|部署|测试|验证|性能/.test(context)) addScore(scores, 'result-implementation', 5)
  if ((discipline === 'education' || discipline === 'management-economics')
    && /机制|影响|政策|治理|教学效果/.test(context)) {
    addScore(scores, 'discussion-conclusion', 2)
  }
  if ((discipline === 'literature-language' || discipline === 'law')
    && /文本|法条|规范|判例|案例|争议/.test(context)) {
    addScore(scores, 'general-analysis', 2)
  }
  const best = [...CLASSIFIED_PROFILES]
    .sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0)
      || PROFILE_ORDER.indexOf(a) - PROFILE_ORDER.indexOf(b))[0]
  return best && (scores.get(best) ?? 0) > 0 ? best : 'general-analysis'
}

export const detectSectionProfile = classifySectionProfile

export function buildSectionGenerationPlan(
  input: SectionProfileInput,
  options: SectionProfileOptions = {},
): SectionGenerationPlan {
  const resolved = resolveSectionInput(input)
  const disciplineFamily = resolved.disciplineFamily
  const profile = isSectionProfile(options.profile) ? options.profile : classifySectionProfile(input)
  const definition = getSectionProfileDefinition(profile, disciplineFamily)
  const defaultStrategyIds = [...definition.defaultStrategyIds]
  const strategyIds = normalizeStrategies(options.strategyIds ?? defaultStrategyIds)
  const requestedContentForms = options.contentForms
    ?? resolved.contentForms.filter((form): form is SectionContentForm => CONTENT_FORMS.has(form as SectionContentForm))
  const selectedContentForms = uniqueContentForms(requestedContentForms)
  const availableContentForms = [...definition.availableContentForms]
  const unsupportedContentForms = selectedContentForms.filter((form) => !availableContentForms.includes(form))
  const usableContentForms = selectedContentForms.filter((form) => availableContentForms.includes(form))
  const dataAvailability = resolved.dataAvailability
  const dataAvailable = dataAvailability === 'available'
  const dataBoundary = buildDataBoundary(profile, dataAvailability)
  const forbiddenClaims = profile === 'result-implementation' && !dataAvailable
    ? uniqueStrings([...definition.forbiddenClaims, dataBoundary])
    : [...definition.forbiddenClaims]
  const contentForms = usableContentForms.map((kind) => ({
    kind,
    purpose: buildContentFormPurpose(kind, profile, disciplineFamily, dataAvailable),
    dataAvailable: dataAvailable || !isDataBearingProfile(profile),
  }))
  return {
    profile,
    profileLabel: definition.label,
    profileSummary: definition.summary,
    disciplineFamily,
    dataAvailable,
    dataAvailability,
    rhetoricalMoves: [...definition.rhetoricalMoves],
    evidenceSlots: buildEvidenceSlots(resolved, profile, dataAvailable),
    contentForms,
    selectedContentForms: usableContentForms,
    availableContentForms,
    forbiddenClaims,
    strategyIds,
    defaultStrategyIds,
    unsupportedContentForms,
    dataBoundary,
  }
}

export const createSectionGenerationPlan = buildSectionGenerationPlan

interface ResolvedSectionInput {
  title: string
  parentText: string
  childText: string
  role: string
  objective: string
  paperType: string
  discipline: string
  disciplineFamily: DisciplineFamily
  pattern?: PaperStructurePattern
  researchAction: string
  keyClaims: string[]
  evidenceNeeds: OutlineEvidenceNeed[]
  contentForms: OutlineContentForm[]
  citationIds: string[]
  dataAvailability: 'available' | 'unavailable' | 'unknown'
}

function resolveSectionInput(input: SectionProfileInput): ResolvedSectionInput {
  const node = input.node
  const title = (input.title ?? node?.title ?? input.brief?.title ?? '').trim() || '当前章节'
  const parentTitles = [
    ...(input.parentTitles ?? []),
    ...(input.parentTitle ? [input.parentTitle] : []),
    ...toTitles(input.parent),
    ...toTitles(input.ancestors),
  ]
  const childTitles = [
    ...(input.childTitles ?? []),
    ...toTitles(input.children),
    ...((node?.children ?? []).map((child) => child.title)),
  ]
  const evidenceNeeds = uniqueEvidenceNeeds(input.evidenceNeeds ?? node?.evidenceNeeds ?? [])
  const contentForms = uniqueOutlineContentForms(input.contentForms ?? node?.contentForms ?? [])
  const citationIds = uniqueStrings(input.citationIds ?? node?.citationIds ?? [])
  const discipline = input.discipline ?? input.brief?.discipline ?? ''
  const disciplineFamily = input.disciplineFamily
    ?? input.architecture?.disciplineFamily
    ?? inferDisciplineFamily(discipline, [title, ...parentTitles, ...childTitles].join(' '))
  return {
    title: normalizeText(title),
    parentText: normalizeText(parentTitles.join(' ')),
    childText: normalizeText(childTitles.join(' ')),
    role: normalizeText(input.role ?? node?.role ?? ''),
    objective: normalizeText(input.objective ?? node?.objective ?? ''),
    paperType: normalizeText(input.paperType ?? input.brief?.paperType ?? ''),
    discipline: normalizeText(discipline),
    disciplineFamily,
    pattern: input.pattern ?? input.architecture?.pattern,
    researchAction: normalizeText(input.researchAction ?? input.architecture?.researchAction ?? ''),
    keyClaims: uniqueStrings(input.keyClaims ?? node?.keyClaims ?? []),
    evidenceNeeds,
    contentForms,
    citationIds,
    dataAvailability: resolveDataAvailability(input),
  }
}

function resolveDataAvailability(input: SectionProfileInput): ResolvedSectionInput['dataAvailability'] {
  const explicit = [
    input.hasRealData,
    input.realDataAvailable,
    input.dataAvailable,
    input.evidence?.hasRealData,
    input.evidence?.dataAvailable,
    input.architecture?.dataAvailable,
  ].find((value): value is boolean => typeof value === 'boolean')
  if (typeof explicit === 'boolean') return explicit ? 'available' : 'unavailable'
  const requirement = `${input.brief?.requirements ?? ''} ${input.brief?.paperType ?? ''}`
  if (/没有真实数据|无真实数据|未提供数据|暂无数据|不得虚构数据|缺少数据/.test(requirement)) return 'unavailable'
  if (/已有真实数据|提供了数据|具备样本|已有样本|包含实验记录|包含问卷|包含访谈|可核验数据/.test(requirement)) return 'available'
  return 'unknown'
}

function inferDisciplineFamily(discipline: string, context: string): DisciplineFamily {
  const normalizedDiscipline = normalizeText(discipline)
  const candidates = (Object.keys(DISCIPLINE_TERMS) as DisciplineFamily[])
    .filter((family) => family !== 'unknown' && family !== 'interdisciplinary')
    .map((family) => ({
      family,
      score: countTermHits(normalizedDiscipline, DISCIPLINE_TERMS[family]) * 5
        + countTermHits(normalizeText(context), DISCIPLINE_TERMS[family]),
    }))
    .sort((a, b) => b.score - a.score)
  const primary = candidates[0]
  const secondary = candidates[1]
  if (primary && primary.score > 0 && secondary && secondary.score > 0 && primary.score - secondary.score <= 1) {
    return 'interdisciplinary'
  }
  return primary && primary.score > 0 ? primary.family : 'unknown'
}

function buildEvidenceSlots(
  input: ResolvedSectionInput,
  profile: SectionProfile,
  dataAvailable: boolean,
): SectionEvidenceSlot[] {
  const claims = input.keyClaims.length
    ? input.keyClaims
    : [defaultClaimForProfile(input.title, input.objective, profile)]
  return claims.map((claim, index) => {
    const source = chooseEvidenceSource(input, profile, dataAvailable, index)
    return { claim, source, referenceIds: source === 'literature' ? input.citationIds : [] }
  })
}

function chooseEvidenceSource(
  input: ResolvedSectionInput,
  profile: SectionProfile,
  dataAvailable: boolean,
  index: number,
): SectionEvidenceSource {
  const preferred = input.evidenceNeeds
  if (preferred.includes('project-data') || preferred.includes('case-material')) {
    if (dataAvailable) return 'project-data'
    if (profile === 'result-implementation' || index === 0) return 'missing'
  }
  if (preferred.includes('literature')) return input.citationIds.length ? 'literature' : 'missing'
  if (preferred.includes('analysis')) return 'analysis'
  if (profile === 'literature-review' || profile === 'introduction') {
    return input.citationIds.length ? 'literature' : 'missing'
  }
  if (profile === 'result-implementation' && !dataAvailable) return 'missing'
  return 'analysis'
}

function defaultClaimForProfile(title: string, objective: string, profile: SectionProfile): string {
  if (objective.trim()) return objective.trim()
  const labels: Record<SectionProfile, string> = {
    abstract: `摘要应概括“${title}”对应的研究问题、路径、可核验结论与边界。`,
    introduction: `“${title}”应将研究背景收束为明确的问题、目标和范围。`,
    'literature-review': `“${title}”应比较相关研究的主题、证据和分歧，并定位本研究位置。`,
    'method-design': `“${title}”应说明对象、材料、步骤或模块，以及方法能够回答的范围。`,
    'result-implementation': `“${title}”应报告已有产物或证据，并区分观察、分析和待验证事项。`,
    'discussion-conclusion': `“${title}”应回答研究问题，解释证据关系并说明局限。`,
    'general-analysis': `“${title}”应围绕节点目标提出可由证据支持的分析主张。`,
  }
  return labels[profile]
}

function buildDataBoundary(
  profile: SectionProfile,
  availability: ResolvedSectionInput['dataAvailability'],
): string {
  if (profile !== 'result-implementation') {
    if (availability === 'unavailable') return '当前未提供真实数据；所有涉及数据的表述必须降为证据缺口、分析框架或验证计划。'
    if (availability === 'unknown') return '真实数据条件未确认；不得把计划、推测或示例数字写成事实。'
    return '只使用已提供且可追溯的数据；文献或分析不能替代未提供的项目数据。'
  }
  if (availability === 'unavailable') {
    return '当前无真实项目数据：不得要求或生成实验、测试、问卷、访谈、样本、统计值、准确率、显著性、效果量、性能指标、成功率或“已验证/已部署”结论；只能写已有材料、设计产物、证据缺口和验证计划。'
  }
  if (availability === 'unknown') {
    return '真实项目数据尚未确认：按无数据处理，不得生成任何数字、样本、测试成功或已部署结论；收到可核验数据后再报告结果。'
  }
  return '结果数字、样本、指标和成功结论必须逐项对应已提供且可核验的数据、记录或产物。'
}

function toTitles(
  value: SectionProfileInput['parent'] | SectionProfileInput['ancestors'] | SectionProfileInput['children'],
): string[] {
  if (!value) return []
  const values = Array.isArray(value) ? value : [value]
  return values
    .map((item) => typeof item === 'string' ? item : item.title)
    .filter((title): title is string => Boolean(title?.trim()))
}

function normalizeText(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\u3000]+/g, ' ').trim()
}

function countTermHits(text: string, terms: string[]): number {
  return terms.reduce((count, term) => count + (text.includes(normalizeText(term)) ? 1 : 0), 0)
}

function addScore(scores: Map<SectionProfile, number>, profile: SectionProfile, amount: number): void {
  scores.set(profile, (scores.get(profile) ?? 0) + amount)
}

function normalizeStrategies(values: SectionOptimizationStrategy[]): SectionOptimizationStrategy[] {
  return uniqueStrings(values)
    .filter((value): value is SectionOptimizationStrategy => STRATEGIES.has(value as SectionOptimizationStrategy))
    .slice(0, 2)
}

function uniqueContentForms(values: SectionContentForm[]): SectionContentForm[] {
  return uniqueStrings(values)
    .filter((value): value is SectionContentForm => CONTENT_FORMS.has(value as SectionContentForm))
}

function uniqueOutlineContentForms(values: OutlineContentForm[]): OutlineContentForm[] {
  return uniqueStrings(values).filter((value): value is OutlineContentForm => (
    value === 'prose' || CONTENT_FORMS.has(value as SectionContentForm)
  ))
}

function uniqueEvidenceNeeds(values: OutlineEvidenceNeed[]): OutlineEvidenceNeed[] {
  return uniqueStrings(values).filter((value): value is OutlineEvidenceNeed => (
    value === 'literature' || value === 'project-data' || value === 'case-material' || value === 'analysis'
  ))
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function isSectionProfile(value: unknown): value is SectionProfile {
  return typeof value === 'string' && PROFILE_ORDER.includes(value as SectionProfile)
}
