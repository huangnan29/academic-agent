import type {
  OutlineEvidenceNeed,
  SectionProfile,
} from '../../../shared/contracts'
import type { QualityIssue } from './quality'

/** 章节质量检查使用的最小章节形状，不直接依赖仓储。 */
export interface SectionQualitySectionInput {
  id: string
  projectId?: string
  title: string
  content: string
  derivedFromSectionId?: string
  profile?: SectionProfile
  role?: string
  keyClaims?: string[]
  evidenceNeeds?: OutlineEvidenceNeed[]
}

export interface SectionQualityThresholds {
  /** 套话命中次数 / 句子数；至少命中两次才提示。 */
  boilerplateDensity: number
  minimumBoilerplateMatches: number
  /** 同一段落开头至少出现多少次才提示。 */
  repeatedOpeningMinimum: number
  /** 句长变异系数低于此值，且句子数达到下限时提示。 */
  sentenceUniformityCoefficient: number
  sentenceUniformityMinimumSentences: number
  /** 跨章节段落使用的最小字符数和相似度阈值。 */
  crossSectionMinimumParagraphUnits: number
  crossSectionSimilarity: number
  /** 主张—证据覆盖低于此比例时提示。 */
  claimEvidenceCoverage: number
}

export const DEFAULT_SECTION_QUALITY_THRESHOLDS: SectionQualityThresholds = {
  boilerplateDensity: 0.12,
  minimumBoilerplateMatches: 2,
  repeatedOpeningMinimum: 2,
  sentenceUniformityCoefficient: 0.12,
  sentenceUniformityMinimumSentences: 6,
  crossSectionMinimumParagraphUnits: 60,
  crossSectionSimilarity: 0.82,
  claimEvidenceCoverage: 0.6,
}

export interface SectionQualityOptions {
  sectionId?: string
  projectId?: string
  sectionTitle?: string
  profile?: SectionProfile
  role?: string
  keyClaims?: string[]
  evidenceNeeds?: OutlineEvidenceNeed[]
  /** 仅在同一项目范围内传入主稿章节；函数仍会再次按项目和 derived 字段过滤。 */
  peerSections?: SectionQualitySectionInput[]
  thresholds?: Partial<SectionQualityThresholds>
  /** 项目级调用可关闭，避免把跨章节检查重复执行。默认开启。 */
  includeStyleChecks?: boolean
  includeCrossSectionChecks?: boolean
}

export interface SectionQualityMetrics {
  paragraphCount: number
  sentenceCount: number
  boilerplatePhraseCount: number
  boilerplatePhraseDensity: number
  repeatedParagraphOpeningCount: number
  repeatedParagraphOpeningRatio: number
  sentenceLengthMean: number
  sentenceLengthStdDev: number
  sentenceLengthCoefficient: number
  responsibilityExpectedCount: number
  responsibilityCoveredCount: number
  responsibilityCoverage: number
  claimCount: number
  claimsWithEvidenceCount: number
  claimEvidenceCoverage: number
  crossSectionDuplicateCount: number
}

export interface SectionQualityReport {
  issues: QualityIssue[]
  metrics: SectionQualityMetrics
}

export interface ParagraphInfo {
  text: string
  normalized: string
  opening: string
  units: number
}

export interface SentenceInfo {
  text: string
  units: number
}

export interface ResponsibilityRule {
  label: string
  patterns: RegExp[]
}

export interface ClaimEvidenceResult {
  claim: string
  covered: boolean
}

export const BOILERPLATE_PHRASES: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: '随着……不断发展', pattern: /随着[^。！？\n]{0,24}(?:不断|持续|快速|深入)?发展/gi },
  { label: '具有重要意义', pattern: /具有(?:重要|较大|深远)(?:的)?(?:理论和现实|现实和理论|实践|现实)?意义/gi },
  { label: '受到广泛关注', pattern: /受到(?:了)?(?:广泛|高度|越来越多的)?关注/gi },
  { label: '在当今……背景下', pattern: /在当今[^。！？\n]{0,24}(?:背景|时代|环境)下/gi },
  { label: '值得注意的是', pattern: /值得注意的是/gi },
  { label: '综上所述', pattern: /综上所述/gi },
  { label: '由此可见', pattern: /由此可见/gi },
  { label: '不难发现', pattern: /不难发现/gi },
  { label: '需要指出的是', pattern: /需要指出的是/gi },
  { label: '本文旨在', pattern: /本文(?:主要)?旨在/gi },
  { label: '本文将', pattern: /本文将(?:从|通过|围绕|对)/gi },
  { label: '发挥重要作用', pattern: /发挥(?:着)?(?:重要|关键|积极)(?:的)?作用/gi },
  { label: '提供有益参考', pattern: /提供(?:有益|有价值|一定的)?参考/gi },
  { label: 'in today’s context', pattern: /in\s+(?:today['’]s|the\s+current)\s+(?:context|era)/gi },
  { label: 'with the rapid development', pattern: /with\s+the\s+(?:rapid|continuous)\s+development/gi },
  { label: 'of great significance', pattern: /of\s+(?:great|major|important)\s+significance/gi },
  { label: 'it is worth noting', pattern: /it\s+is\s+worth\s+noting/gi },
  { label: 'in conclusion', pattern: /in\s+conclusion/gi },
  { label: 'this paper aims to', pattern: /this\s+paper\s+(?:mainly\s+)?aims?\s+to/gi },
  { label: 'plays an important role', pattern: /plays?\s+an?\s+(?:important|key|critical)\s+role/gi },
]

export const PROFILE_RESPONSIBILITIES: Partial<Record<SectionProfile, ResponsibilityRule[]>> = {
  abstract: [
    rule('研究对象与问题', /(?:本研究|本文|研究对象|研究问题|旨在|探讨|考察|aims?|investigat|examin)/i),
    rule('方法或材料', /(?:方法|采用|基于|数据|样本|资料|method|approach|data|sample|material)/i),
    rule('结果或核心内容', /(?:结果|发现|表明|显示|实现|验证|result|finding|show|indicat|achiev)/i),
    rule('结论与边界', /(?:结论|意义|局限|边界|建议|conclu|implicat|limitation|boundary)/i),
  ],
  introduction: [
    rule('研究背景或情境', /(?:背景|现状|情境|发展|背景下|background|context|current|development)/i),
    rule('问题或研究缺口', /(?:问题|不足|缺口|困境|争议|挑战|gap|problem|limitation|debate|challenge)/i),
    rule('研究目标或问题', /(?:目标|目的|问题|本文旨在|研究将|question|objective|aim|purpose)/i),
    rule('研究路径或贡献', /(?:方法|思路|结构|贡献|创新|路径|章节安排|approach|contribution|structure)/i),
  ],
  'literature-review': [
    rule('分类或主题组织', /(?:分类|主题|维度|脉络|类型|领域|theme|category|strand|dimension)/i),
    rule('观点或证据比较', /(?:比较|对比|异同|差异|一致|分歧|compare|contrast|difference|agreement|diverg)/i),
    rule('研究缺口或局限', /(?:不足|缺口|局限|空白|尚未|争议|gap|limitation|unresolved|debate)/i),
    rule('本研究定位或综合', /(?:本研究|本文|定位|框架|综合|启示|position|framework|synthesis|present study)/i),
  ],
  'method-design': [
    rule('对象、数据或条件', /(?:对象|样本|数据|材料|条件|场景|参数|object|sample|data|material|condition|parameter)/i),
    rule('步骤或设计过程', /(?:方法|步骤|流程|设计|过程|实施|method|procedure|process|design|implement)/i),
    rule('变量、模块或评价指标', /(?:变量|模块|指标|评价|测量|结构|variable|module|metric|measure|evaluation)/i),
    rule('可复现边界', /(?:复现|重复|限制|边界|假设|适用|reproduc|replic|limit|boundary|assumption)/i),
  ],
  'result-implementation': [
    rule('产出或观察结果', /(?:结果|产出|实现|观察|发现|现象|输出|result|output|implement|observ|finding)/i),
    rule('证据、指标或记录', /(?:数据|指标|测试|测量|统计|记录|证据|data|metric|test|measure|statistic|record|evidence)/i),
    rule('对照或验证', /(?:对照|比较|验证|评估|实验|baseline|compar|validat|evaluat|experiment)/i),
    rule('局部结论', /(?:说明|表明|意味着|可见|因此|结论|suggest|indicat|therefore|imply|conclusion)/i),
  ],
  'discussion-conclusion': [
    rule('回答研究问题', /(?:回答|回应|发现|结果表明|研究问题|answer|respond|finding|research question)/i),
    rule('解释机制或原因', /(?:原因|机制|解释|因为|由于|意味着|mechanism|explain|because|due to|imply)/i),
    rule('与既有研究或实践对照', /(?:既有研究|文献|比较|对照|实践|应用|prior research|literature|compare|practice|application)/i),
    rule('局限与适用边界', /(?:局限|限制|边界|条件|外推|适用|limitation|constraint|boundary|condition|generaliz)/i),
    rule('建议或后续方向', /(?:建议|展望|未来|后续|优化|recommend|future|further|improv)/i),
  ],
}

export const GENERIC_ROLE_PATTERNS: ReadonlyArray<{ keywords: RegExp; rule: ResponsibilityRule }> = [
  { keywords: /背景|情境|现状|background|context/i, rule: rule('背景或情境', /背景|情境|现状|发展|background|context|current|development/i) },
  { keywords: /问题|缺口|争议|problem|gap|debate/i, rule: rule('问题或缺口', /问题|不足|缺口|争议|挑战|problem|gap|debate|challenge/i) },
  { keywords: /方法|步骤|设计|method|procedure|design/i, rule: rule('方法或设计', /方法|步骤|流程|设计|实施|method|procedure|process|design|implement/i) },
  { keywords: /结果|实现|证据|result|implementation|evidence/i, rule: rule('结果或证据', /结果|实现|发现|数据|测试|证据|result|implement|data|test|evidence/i) },
  { keywords: /讨论|解释|机制|discussion|explain|mechanism/i, rule: rule('讨论或解释', /讨论|解释|原因|机制|意味着|discussion|explain|cause|mechanism|imply/i) },
  { keywords: /局限|边界|限制|limitation|boundary|constraint/i, rule: rule('局限或边界', /局限|边界|限制|条件|适用|limitation|boundary|constraint|condition/i) },
  { keywords: /建议|展望|未来|recommend|future|outlook/i, rule: rule('建议或后续方向', /建议|展望|未来|后续|recommend|future|outlook|further/i) },
]

function rule(label: string, pattern: RegExp): ResponsibilityRule {
  return { label, patterns: [pattern] }
}

export interface CrossSectionQualityOptions {
  projectId?: string
  currentSectionId?: string
  thresholds?: Partial<SectionQualityThresholds> | SectionQualityThresholds
}

export interface ProjectSectionQualityOptions {
  projectId?: string
  thresholds?: Partial<SectionQualityThresholds>
}

export interface ProjectSectionQualityReport {
  issues: QualityIssue[]
  metrics: SectionQualityMetrics
}
