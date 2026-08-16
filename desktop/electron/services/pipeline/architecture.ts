import type {
  DisciplineFamily,
  LiteratureRecord,
  OutlineArchitecture,
  OutlineNode,
  OutlineQualityIssue,
  OutlineQualityReport,
  PaperStructurePattern,
  ResearchBrief,
} from '../../../shared/contracts'

const now = () => new Date().toISOString()

interface DisciplineRule {
  family: DisciplineFamily
  label: string
  terms: string[]
}

const DISCIPLINE_RULES: DisciplineRule[] = [
  { family: 'literature-language', label: '文学 / 语言', terms: ['文学', '语言', '翻译', '小说', '诗歌', '戏剧', '叙事', '意象', '话语', '作品', '作家'] },
  { family: 'science', label: '理学', terms: ['理学', '数学', '物理', '化学', '生物', '地理', '材料', '模型', '机理', '催化'] },
  { family: 'engineering', label: '工学', terms: ['工学', '计算机', '软件', '系统', '平台', '算法', '机械', '电路', '控制', '工艺', '架构', '设计与实现'] },
  { family: 'law', label: '法学', terms: ['法学', '法律', '法治', '司法', '裁判', '规制', '权利', '义务', '法条', '制度'] },
  { family: 'design-art', label: '设计 / 艺术', terms: ['设计', '艺术', '视觉', '交互', '品牌', '空间', '产品', '原型', '审美', '创作'] },
  { family: 'management-economics', label: '管理 / 经济', terms: ['管理', '经济', '企业', '市场', '治理', '绩效', '供应链', '组织', '财务', '政策'] },
  { family: 'education', label: '教育', terms: ['教育', '教学', '课程', '学习', '教师', '学生', '高校', '课堂', '学校'] },
  { family: 'medicine-health', label: '医学 / 健康', terms: ['医学', '临床', '护理', '疾病', '患者', '药物', '公共卫生', '健康', '诊疗', '干预'] },
]

const PATTERN_FLOW: Record<PaperStructurePattern, string[]> = {
  'empirical-imrad': ['界定问题与假设', '说明对象、变量与方法', '呈现可核验结果', '解释结果与既有研究的关系', '总结边界与局限'],
  'system-engineering': ['识别使用场景与需求', '说明技术依据与总体架构', '展开模块或方案实现', '设计可复现验证', '总结限制与优化方向'],
  'thematic-review': ['限定综述范围', '按主题组织研究', '比较观点、方法与证据', '识别分歧和空白', '形成综合框架'],
  'theoretical-normative': ['界定概念与分析视角', '建立文本、理论或规范依据', '拆解核心争议', '完成分主题论证', '回答问题并说明边界'],
  'case-study': ['说明案例选择与边界', '建立分析框架', '整理案例材料', '解释关键机制或争议', '提出有限度的启示'],
  'policy-management': ['诊断现实问题', '建立理论或机制框架', '分析条件与影响路径', '比较可选方案', '提出实施建议与约束'],
}

export interface OutlineQualityOptions {
  brief?: ResearchBrief
  architecture?: OutlineArchitecture
  allowedCitationIds?: Iterable<string>
  evidence?: { hasRealData?: boolean }
}

export interface ResearchClassificationOptions {
  literature?: LiteratureRecord[]
  evidence?: { hasRealData?: boolean }
}

/**
 * 使用用户明确填写的学科优先、标题与研究动作校正的确定性路由。
 * 它只负责给模型提供结构约束，不把关键词命中冒充学科鉴定。
 */
export function analyzeOutlineArchitecture(
  brief: ResearchBrief,
  literature: LiteratureRecord[] = [],
): OutlineArchitecture {
  const explicit = normalizeText(brief.discipline)
  const title = normalizeText(brief.title)
  const context = normalizeText([
    brief.title,
    brief.discipline,
    brief.paperType,
    brief.requirements,
    ...brief.keywords,
    ...literature.slice(0, 20).map((item) => item.title),
  ].join(' '))
  const scored = DISCIPLINE_RULES.map((rule) => {
    const explicitHits = rule.terms.filter((term) => explicit.includes(normalizeText(term))).length
    const titleHits = rule.terms.filter((term) => title.includes(normalizeText(term))).length
    const contextHits = rule.terms.filter((term) => context.includes(normalizeText(term))).length
    return {
      ...rule,
      score: explicitHits * 7 + titleHits * 3 + contextHits,
      explicitHits,
      titleHits,
    }
  }).sort((a, b) => b.score - a.score)

  const primary = scored[0]
  const secondary = scored[1]
  const crossDisciplinary = /跨学科|交叉/.test(brief.discipline)
    || (primary?.score > 0 && secondary?.score > 0 && primary.score - secondary.score <= 2)
  const family: DisciplineFamily = crossDisciplinary
    ? 'interdisciplinary'
    : primary?.score > 0
      ? primary.family
      : 'unknown'
  const label = crossDisciplinary
    ? [primary?.label, secondary?.label].filter(Boolean).join(' × ') || '跨学科'
    : primary?.score > 0
      ? primary.label
      : brief.discipline.trim() || '待确认'
  const dataAvailable = inferDataAvailability(brief)
  const researchAction = inferResearchAction(context)
  const researchObject = inferResearchObject(brief.title, researchAction)
  const pattern = choosePattern(
    family,
    context,
    researchAction,
    dataAvailable,
    family === 'interdisciplinary' ? undefined : primary?.family,
  )
  const alternatives = chooseAlternatives(pattern, family, context, dataAvailable)
  const confidence = calculateConfidence({
    explicitHits: primary?.explicitHits ?? 0,
    titleHits: primary?.titleHits ?? 0,
    score: primary?.score ?? 0,
    secondScore: secondary?.score ?? 0,
    researchAction,
    family,
  })
  const researchDirection = brief.keywords.filter(Boolean).slice(0, 3).join('、')
    || researchObject
    || brief.title

  return {
    projectId: '',
    disciplineFamily: family,
    disciplineLabel: label,
    researchDirection,
    researchObject,
    researchAction,
    scope: inferScope(brief.title),
    pattern,
    confidence,
    alternatives,
    rationale: buildRationale(label, researchAction, pattern, dataAvailable, crossDisciplinary),
    researchQuestions: buildResearchQuestions(researchObject || brief.title, researchAction, pattern),
    narrativeFlow: PATTERN_FLOW[pattern],
    totalTargetWords: Math.max(1_000, Math.round(brief.targetWords || 8_000)),
    dataAvailable,
    generatedAt: now(),
  }
}

/** 固定验收和后续调用使用的语义化别名，并允许显式证据条件覆盖文本推断。 */
export function classifyResearchBrief(
  brief: ResearchBrief,
  options: ResearchClassificationOptions = {},
): OutlineArchitecture {
  const architecture = analyzeOutlineArchitecture(brief, options.literature ?? [])
  if (typeof options.evidence?.hasRealData !== 'boolean'
    || options.evidence.hasRealData === architecture.dataAvailable) {
    return architecture
  }
  const context = normalizeText([
    brief.title,
    brief.discipline,
    brief.paperType,
    brief.requirements,
    ...brief.keywords,
  ].join(' '))
  const primaryFamily = architecture.disciplineFamily === 'interdisciplinary'
    ? undefined
    : architecture.disciplineFamily
  const pattern = choosePattern(
    architecture.disciplineFamily,
    context,
    architecture.researchAction,
    options.evidence.hasRealData,
    primaryFamily,
  )
  return {
    ...architecture,
    pattern,
    alternatives: chooseAlternatives(pattern, architecture.disciplineFamily, context, options.evidence.hasRealData),
    narrativeFlow: PATTERN_FLOW[pattern],
    dataAvailable: options.evidence.hasRealData,
    rationale: buildRationale(
      architecture.disciplineLabel,
      architecture.researchAction,
      pattern,
      options.evidence.hasRealData,
      architecture.disciplineFamily === 'interdisciplinary',
    ),
  }
}

export function runOutlineQualityChecks(
  outline: OutlineNode[],
  options: OutlineQualityOptions = {},
): OutlineQualityReport {
  const issues: OutlineQualityIssue[] = []
  const flat = flattenOutline(outline)
  const leaves = flat.filter((node) => node.children.length === 0)
  const targetWords = options.architecture?.totalTargetWords
    ?? options.brief?.targetWords
    ?? outline.reduce((sum, node) => sum + node.targetWords, 0)
  const allocatedWords = outline.reduce((sum, node) => sum + node.targetWords, 0)
  const allocationRatio = targetWords > 0 ? allocatedWords / targetWords : 1
  const allowedCitationIds = options.allowedCitationIds
    ? new Set(options.allowedCitationIds)
    : undefined

  if (outline.length < 4 || outline.length > 8) {
    issues.push(issue('ROOT_COUNT_UNUSUAL', 'warning', `一级章节共 ${outline.length} 个，通常建议保持 4–8 个并按研究需要调整。`))
  }
  if (allocationRatio < 0.85 || allocationRatio > 1.15) {
    issues.push(issue('WORD_BUDGET_NOT_CLOSED', 'error', `一级章节预算合计 ${allocatedWords}，与全文目标 ${targetWords} 的偏差超过 15%。`))
  }

  const seenTitles = new Map<string, string>()
  for (const node of flat) {
    const normalizedTitle = normalizeOutlineTitle(node.title)
    const previous = seenTitles.get(normalizedTitle)
    if (previous && normalizedTitle.length >= 4) {
      issues.push(issue('DUPLICATE_OUTLINE_TITLE', 'error', `“${node.title}”与“${previous}”标题重复或仅编号不同。`, node.id))
    } else if (normalizedTitle) {
      seenTitles.set(normalizedTitle, node.title)
    }

    if (!isFrontMatterNode(node) && node.level < 3 && node.children.length === 0) {
      issues.push(issue('OUTLINE_DEPTH_INCOMPLETE', 'error', `“${node.title}”仍是正文主节点，但没有展开到三级论证单元。`, node.id))
    }
    if (node.children.length > 0) {
      const childWords = node.children.reduce((sum, child) => sum + child.targetWords, 0)
      const ratio = node.targetWords > 0 ? childWords / node.targetWords : 1
      if (ratio < 0.75 || ratio > 1.25) {
        issues.push(issue('WORD_BUDGET_NOT_CLOSED', 'error', `“${node.title}”的子节点预算 ${childWords} 与本节点 ${node.targetWords} 不闭合。`, node.id))
      }
    }
    if (allowedCitationIds) {
      for (const citationId of node.citationIds) {
        if (!allowedCitationIds.has(citationId)) {
          issues.push(issue('UNMAPPED_CITATION', 'error', `“${node.title}”引用了未纳入项目的文献 ID：${citationId}。`, node.id))
        }
      }
    }
  }

  const architecture = options.architecture
  const dataAvailable = options.evidence?.hasRealData
    ?? architecture?.dataAvailable
    ?? (options.brief ? inferDataAvailability(options.brief) : false)
  if (architecture) {
    if (architecture.pattern === 'empirical-imrad' && !dataAvailable) {
      issues.push(issue('PATTERN_MISMATCH', 'error', '当前没有真实项目数据，不能采用承诺实证结果的 IMRaD 结构。'))
    }
    if (architecture.pattern === 'system-engineering'
      && !['engineering', 'design-art', 'interdisciplinary'].includes(architecture.disciplineFamily)) {
      issues.push(issue('DISCIPLINE_PATTERN_MISMATCH', 'warning', '系统工程结构与当前专业类别匹配度较低，请复核结构选择。'))
    }
  }
  if (!dataAvailable) {
    for (const node of flat.filter((item) => (
      /实证结果|实验结果|回归结果|统计结果|统计检验|显著性|效果量|实测结论/.test(item.title)
      || ['result', 'results', 'empirical'].includes((item.role ?? '').toLowerCase())
      || item.evidenceNeeds?.includes('project-data')
    ))) {
      issues.push(issue('RESULT_WITHOUT_DATA', 'error', `“${node.title}”需要真实数据支撑，当前项目未声明可核验数据。`, node.id))
    }
  }

  const citationCount = flat.reduce((sum, node) => sum + node.citationIds.length, 0)
  const score = Math.max(0, Math.min(100, 100 - issues.reduce((sum, item) => (
    sum + (item.severity === 'error' ? 18 : item.severity === 'warning' ? 7 : 1)
  ), 0)))
  return {
    passed: !issues.some((item) => item.severity === 'error') && score >= 60,
    score,
    issues,
    metrics: {
      rootCount: outline.length,
      nodeCount: flat.length,
      leafCount: leaves.length,
      targetWords,
      allocatedWords,
      allocationRatio: Number(allocationRatio.toFixed(3)),
      citationCount,
    },
  }
}

function choosePattern(
  family: DisciplineFamily,
  context: string,
  action: string,
  dataAvailable: boolean,
  primaryFamily?: DisciplineFamily,
): PaperStructurePattern {
  if (/综述|研究进展|文献计量/.test(context)) return 'thematic-review'
  if (/案例|个案|典型/.test(context) && !/系统设计|设计与实现/.test(context)) return 'case-study'
  if (dataAvailable && /实验|实证|调查|问卷|统计|回归|测量|干预/.test(context)) return 'empirical-imrad'
  if (family === 'engineering' || primaryFamily === 'engineering') return 'system-engineering'
  if (/设计与实现|系统设计|平台设计|算法设计|架构设计/.test(context)) return 'system-engineering'
  if (family === 'design-art' && /交互|产品|视觉|空间|原型|方案/.test(context)) return 'system-engineering'
  if (family === 'literature-language' || family === 'law' || family === 'science' || family === 'medicine-health') return 'theoretical-normative'
  if (family === 'education' || family === 'management-economics' || family === 'interdisciplinary') {
    if (/治理|政策|机制|影响|路径|策略|优化|赋能/.test(context + action)) return 'policy-management'
  }
  return 'theoretical-normative'
}

function chooseAlternatives(
  selected: PaperStructurePattern,
  family: DisciplineFamily,
  context: string,
  dataAvailable: boolean,
): PaperStructurePattern[] {
  const candidates: PaperStructurePattern[] = []
  if (/案例|个案/.test(context)) candidates.push('case-study')
  if (/综述|研究进展/.test(context)) candidates.push('thematic-review')
  if (dataAvailable) candidates.push('empirical-imrad')
  if (['education', 'management-economics', 'interdisciplinary'].includes(family)) candidates.push('policy-management')
  if (['literature-language', 'law', 'science'].includes(family)) candidates.push('theoretical-normative')
  return [...new Set(candidates)].filter((item) => item !== selected).slice(0, 2)
}

function inferDataAvailability(brief: ResearchBrief): boolean {
  const text = `${brief.requirements} ${brief.keywords.join(' ')}`
  if (/没有|暂无|未提供|不得虚构|不能生成|缺少/.test(text)) return false
  return /已有|提供|包含|具备|真实|可核验/.test(text)
    && /样本|问卷|访谈|实验记录|测量数据|统计数据|监测数据|病例|测试数据|调查数据/.test(text)
}

function inferResearchAction(text: string): string {
  const actions = [
    '设计与实现', '实验研究', '实证研究', '比较研究', '案例分析', '机制分析',
    '规范分析', '理论分析', '文本阐释', '文献综述', '影响研究', '优化研究', '策略研究',
  ]
  return actions.find((item) => text.includes(item))
    ?? (/机制/.test(text) ? '机制分析' : /设计/.test(text) ? '设计研究' : '分析研究')
}

function inferResearchObject(title: string, action: string): string {
  return title
    .replace(/[：:——-].*$/, '')
    .replace(new RegExp(`${escapeRegExp(action)}研究?$`), '')
    .replace(/(的)?(作用机制|影响因素|设计与实现|比较|分析|研究)$/, '')
    .trim()
    .slice(0, 120)
}

function inferScope(title: string): string {
  const matches = title.match(/(?:面向|基于|在|以)([^：:，,。]{2,40})/)
  return matches?.[1]?.trim() ?? ''
}

function buildResearchQuestions(object: string, action: string, pattern: PaperStructurePattern): string[] {
  const subject = object || '研究对象'
  const common = [`${subject}所处的现实与理论问题是什么？`]
  if (pattern === 'system-engineering') return [...common, `如何形成满足核心需求的${subject}方案？`, '如何在不虚构结果的前提下验证方案的可用性与边界？']
  if (pattern === 'empirical-imrad') return [...common, `${subject}中的变量关系或差异如何被可靠测量？`, '可核验结果如何解释，适用边界是什么？']
  if (pattern === 'thematic-review') return [...common, '既有研究形成了哪些主题、分歧与方法路径？', '当前证据仍存在哪些空白，如何形成综合框架？']
  if (pattern === 'case-study') return [...common, '案例材料如何呈现关键机制或争议？', '案例结论可以在什么边界内提供启示？']
  if (pattern === 'policy-management') return [...common, `${action}涉及哪些条件、机制与影响路径？`, '可行方案如何实施，其风险与约束是什么？']
  return [...common, `${subject}应通过哪些概念、文本或规范关系展开论证？`, '不同观点如何比较，最终结论的边界是什么？']
}

function calculateConfidence(input: {
  explicitHits: number
  titleHits: number
  score: number
  secondScore: number
  researchAction: string
  family: DisciplineFamily
}): number {
  let value = 0.38
  if (input.explicitHits > 0) value += 0.25
  if (input.titleHits > 0) value += Math.min(0.18, input.titleHits * 0.06)
  if (input.score - input.secondScore >= 3) value += 0.1
  if (input.researchAction !== '分析研究') value += 0.08
  if (input.family === 'unknown') value -= 0.18
  if (input.family === 'interdisciplinary') value -= 0.05
  return Number(Math.max(0.2, Math.min(0.96, value)).toFixed(2))
}

function buildRationale(
  discipline: string,
  action: string,
  pattern: PaperStructurePattern,
  dataAvailable: boolean,
  crossDisciplinary: boolean,
): string {
  const dataBoundary = dataAvailable
    ? '项目要求声明存在可核验数据，仍须在正文中逐项核对来源。'
    : '当前未确认可核验实证数据，因此不预设样本、统计结果或效果结论。'
  return `依据${crossDisciplinary ? '交叉' : ''}专业类别“${discipline}”与研究动作“${action}”，选择 ${pattern} 结构。${dataBoundary}`
}

function flattenOutline(nodes: OutlineNode[]): OutlineNode[] {
  return nodes.flatMap((node) => [node, ...flattenOutline(node.children)])
}

function isFrontMatterNode(node: OutlineNode): boolean {
  return /^(摘要|abstract|关键词|参考文献|致谢|附录|结论|结语)$/i.test(normalizeOutlineTitle(node.title))
}

function normalizeOutlineTitle(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^(第[一二三四五六七八九十百]+章|\d+(?:\.\d+){0,2})[\s、.．-]*/u, '')
    .replace(/[\p{P}\p{S}\s]/gu, '')
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

function issue(code: string, severity: OutlineQualityIssue['severity'], message: string, nodeId?: string): OutlineQualityIssue {
  return { code, severity, message, nodeId }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
