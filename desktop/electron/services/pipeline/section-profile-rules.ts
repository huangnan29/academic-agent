import type {
  DisciplineFamily,
  SectionContentForm,
  SectionOptimizationStrategy,
  SectionProfile,
} from '../../../shared/contracts'
import type { SectionProfileDefinition } from './section-profile'

export const PROFILE_ORDER: SectionProfile[] = [
  'abstract',
  'introduction',
  'literature-review',
  'method-design',
  'result-implementation',
  'discussion-conclusion',
  'general-analysis',
]

export type ClassifiedSectionProfile = Exclude<SectionProfile, 'general-analysis'>
export const CLASSIFIED_PROFILES: ClassifiedSectionProfile[] = PROFILE_ORDER.filter(
  (profile): profile is ClassifiedSectionProfile => profile !== 'general-analysis',
)

export const PROFILE_DEFINITIONS: Record<SectionProfile, SectionProfileDefinition> = {
  abstract: {
    profile: 'abstract',
    label: '摘要',
    summary: '用最少篇幅交代研究问题、路径、可核验内容、结论边界和关键词。',
    rhetoricalMoves: [
      '先用一两句界定研究对象、问题和必要背景。',
      '说明实际采用的材料、方法或分析路径，不把计划写成已完成工作。',
      '概括已经由上下文证据支持的核心发现或论证结果；没有真实结果时明确标出证据边界。',
      '用与研究问题一一对应的句子收束结论，并保留适用范围和局限。',
    ],
    forbiddenClaims: [
      '不得虚构样本、实验、统计数值、效果量、案例事实或研究结论。',
      '不得把拟采用的方法、预期成果或研究计划写成已经完成。',
      '不得添加上下文没有提供的文献、DOI、页码或“首次/填补空白”等优先性判断。',
      '不得用大段宏大背景、意义口号或重复目录替代摘要信息。',
    ],
    defaultStrategyIds: ['concise', 'evidence-first'],
    availableContentForms: [],
  },
  introduction: {
    profile: 'introduction',
    label: '绪论 / 问题提出',
    summary: '把现实情境收束为可回答的问题，交代缺口、目标、范围和全文推进路径。',
    rhetoricalMoves: [
      '从研究对象所在的具体情境切入，说明问题为何值得研究。',
      '用已提供的文献或材料归纳现有认识及其不足，明确缺口而非笼统宣称空白。',
      '把研究缺口转译为研究问题、研究目标和范围边界。',
      '预告研究材料、方法与章节推进关系，使读者知道后文如何回答问题。',
    ],
    forbiddenClaims: [
      '不得在尚未展示证据前宣称研究对象普遍、必然或显著有效。',
      '不得把“缺少研究”写成绝对空白，除非有可核验的检索范围和证据。',
      '不得提前编造结果、样本、调查规模、案例事实或方法参数。',
      '不得用脱离题目的宏大意义替代明确的研究问题和范围。',
    ],
    defaultStrategyIds: ['evidence-first', 'natural-academic'],
    availableContentForms: ['diagram'],
  },
  'literature-review': {
    profile: 'literature-review',
    label: '文献综述 / 理论基础',
    summary: '按主题、概念、方法或争点组织证据，比较观点和局限，定位本研究的分析位置。',
    rhetoricalMoves: [
      '先限定文献范围、概念口径和分类维度，避免无边界罗列。',
      '围绕主题、理论关系或方法路径比较文献的共识、分歧与证据差异。',
      '说明不同观点适用的对象、条件和局限，而不是只复述每篇摘要。',
      '从比较结果推出仍待回答的问题，并明确本研究承接、修正或区分的位置。',
    ],
    forbiddenClaims: [
      '不得逐篇堆叠文献而不说明其关系、差异、证据等级或适用条件。',
      '不得把未纳入上下文的论文、作者观点、年份、DOI 或页码补写进正文。',
      '不得把少量文献的倾向概括为整个领域的共识或“普遍认为”。',
      '不得把研究缺口夸大为绝对空白，也不得预设本研究已经解决该缺口。',
    ],
    defaultStrategyIds: ['evidence-first', 'argument-deepening'],
    availableContentForms: ['table', 'diagram'],
  },
  'method-design': {
    profile: 'method-design',
    label: '方法 / 研究设计',
    summary: '交代对象、材料、条件、变量或模块、步骤和可复现边界，让方法服务于研究问题。',
    rhetoricalMoves: [
      '说明研究对象、材料来源、选择条件和方法选择理由。',
      '把研究问题映射到变量、分析维度、模块、接口或操作步骤。',
      '按可复现顺序交代实施流程、参数、判断标准和质量控制；缺失处明确待补。',
      '解释该设计能够回答什么、不能回答什么，并为结果或分析章节建立接口。',
    ],
    forbiddenClaims: [
      '不得在用户未提供时补造样本量、问卷、访谈、实验参数、材料来源或软件版本。',
      '不得把设计方案、伪代码、预期指标写成已经执行并验证成功。',
      '不得声称方法具有普遍可复现性，除非关键条件和证据已给出。',
      '不得为了凑篇幅添加与研究问题无关的工具清单或流程步骤。',
    ],
    defaultStrategyIds: ['evidence-first', 'concise'],
    availableContentForms: ['table', 'diagram', 'formula', 'code'],
  },
  'result-implementation': {
    profile: 'result-implementation',
    label: '结果 / 系统实现',
    summary: '报告可核验的产物、观察、测量或实现证据，区分事实、分析和待验证事项。',
    rhetoricalMoves: [
      '先说明本节报告的产物、观察或结果与研究问题的对应关系。',
      '逐项呈现来源明确的证据，并区分原始观察、计算/分析和解释性判断。',
      '在有对照条件时说明比较维度、评价标准和局部结论。',
      '收束到可支持的有限结论，并把未测量、未实现或需要复核的部分单独标明。',
    ],
    forbiddenClaims: [
      '不得生成用户未提供的实验、测试、问卷、访谈、样本、统计值、准确率、显著性、效果量、性能指标或成功率。',
      '不得把设计稿、代码片段、预期流程或验证计划写成已部署、已运行或已通过测试。',
      '不得从局部观察外推到总体、长期效果或因果关系。',
      '不得省略结果来源、对照条件、测量口径和不确定性。',
    ],
    defaultStrategyIds: ['evidence-first', 'argument-deepening'],
    availableContentForms: ['table', 'diagram', 'formula', 'code'],
  },
  'discussion-conclusion': {
    profile: 'discussion-conclusion',
    label: '讨论 / 结论',
    summary: '回答研究问题，解释结果与既有证据的关系，交代局限和可执行的后续方向。',
    rhetoricalMoves: [
      '按研究问题回收主要发现或论证结论，而不是重新铺陈全文背景。',
      '解释结果为何出现、与既有研究如何一致或冲突，并区分解释与事实。',
      '说明适用条件、材料边界、方法局限和可能的替代解释。',
      '提出与证据和限制相称的实践建议、理论含义或后续验证路径。',
    ],
    forbiddenClaims: [
      '不得把相关性、文本解释或局部观察直接写成普遍因果规律。',
      '不得重复摘要或结果段落，却把重复内容包装成新的证据。',
      '不得隐去样本、材料、法域、文本范围或方法限制后扩大结论。',
      '不得提出超出本研究证据和资源条件的确定性政策、产品或治理承诺。',
    ],
    defaultStrategyIds: ['argument-deepening', 'natural-academic'],
    availableContentForms: ['table', 'diagram'],
  },
  'general-analysis': {
    profile: 'general-analysis',
    label: '通用分析',
    summary: '在无法可靠归类时围绕节点目标组织主张、证据、推理和边界，不套用章节模板。',
    rhetoricalMoves: [
      '先界定本节点要解决的子问题、概念范围和分析对象。',
      '将每个关键主张绑定到可追溯文献、项目材料或明确的推理步骤。',
      '展开概念关系、条件、反例或替代解释，避免只给结论。',
      '以局部小结和边界说明衔接父节点及相邻子节点。',
    ],
    forbiddenClaims: [
      '不得在证据不足时声称事实、因果、普遍性、创新性或已验证状态。',
      '不得虚构文献、案例、数据、参数、代码运行结果或工具执行状态。',
      '不得用与节点目标无关的通用背景和重复总结填充篇幅。',
    ],
    defaultStrategyIds: ['evidence-first', 'natural-academic'],
    availableContentForms: ['table', 'diagram'],
  },
}

export const STRATEGIES = new Set<SectionOptimizationStrategy>([
  'evidence-first',
  'argument-deepening',
  'natural-academic',
  'concise',
])

export const CONTENT_FORMS = new Set<SectionContentForm>(['table', 'diagram', 'formula', 'code'])

export const PROFILE_TERMS: Record<Exclude<SectionProfile, 'general-analysis'>, string[]> = {
  abstract: ['摘要', '内容提要', '提要', 'abstract', 'executive summary', 'summary'],
  introduction: [
    '绪论', '引言', '导论', '问题提出', '研究背景', '研究概述', '研究缘起', 'introduction', 'background',
  ],
  'literature-review': [
    '文献综述', '研究综述', '研究现状', '理论基础', '理论框架', '概念界定', '相关工作', '文献回顾',
    'literature review', 'related work', 'theoretical framework', 'state of the art',
  ],
  'method-design': [
    '研究设计', '研究方法', '方法论', '方法', '研究对象与方法', '系统设计', '总体设计', '详细设计', '技术路线',
    '算法设计', '方案设计', 'methodology', 'methods', 'research design', 'system design', 'architecture',
  ],
  'result-implementation': [
    '研究结果', '实证结果', '实验结果', '测试结果', '调查结果', '分析结果', '结果与分析', '实验', '测试', '验证',
    '系统实现', '功能实现', '工程实现', '实现与测试', 'evaluation', 'results', 'experiments', 'implementation',
  ],
  'discussion-conclusion': [
    '讨论', '结论', '结语', '结论与展望', '讨论与结论', '启示', '局限', '不足与展望', '建议', 'discussion',
    'conclusion', 'implications', 'limitations', 'recommendations',
  ],
}

export const ROLE_TERMS: Record<Exclude<SectionProfile, 'general-analysis'>, string[]> = {
  abstract: ['摘要', 'abstract', '概括研究'],
  introduction: ['绪论', '引言', '问题提出', '研究背景', '研究目的', '研究意义', 'research gap', 'introduction'],
  'literature-review': ['综述', '理论基础', '理论框架', '研究现状', '文献', 'literature', 'related work'],
  'method-design': ['方法', '设计', '研究方案', '技术路线', 'method', 'design', 'materials'],
  'result-implementation': ['结果', '实现', '实验', '测试', '验证', 'evaluation', 'result', 'implementation'],
  'discussion-conclusion': ['讨论', '结论', '启示', '局限', '展望', 'discussion', 'conclusion', 'implication'],
}

export const DISCIPLINE_TERMS: Record<DisciplineFamily, string[]> = {
  'literature-language': ['文学', '语言', '翻译', '小说', '诗歌', '戏剧', '叙事', '意象', '文本', '作家', '作品'],
  science: ['理学', '数学', '物理', '化学', '生物', '模型', '机理', '实验'],
  engineering: ['工学', '计算机', '软件', '系统', '平台', '算法', '机械', '电路', '控制', '工艺', '架构'],
  law: ['法学', '法律', '法治', '司法', '裁判', '规制', '权利', '义务', '法条', '制度', '判例'],
  'design-art': ['设计', '艺术', '视觉', '交互', '品牌', '空间', '产品', '原型', '审美', '创作'],
  'management-economics': ['管理', '经济', '企业', '市场', '治理', '绩效', '组织', '财务', '政策'],
  education: ['教育', '教学', '课程', '学习', '教师', '学生', '高校', '课堂', '学校', '教育管理'],
  'medicine-health': ['医学', '临床', '护理', '疾病', '患者', '药物', '公共卫生', '健康', '诊疗'],
  interdisciplinary: ['跨学科', '交叉'],
  unknown: [],
}

export const PROFILE_FORM_DEFAULTS: Record<SectionProfile, SectionContentForm[]> = {
  abstract: [],
  introduction: ['diagram'],
  'literature-review': ['table', 'diagram'],
  'method-design': ['table', 'diagram', 'formula', 'code'],
  'result-implementation': ['table', 'diagram', 'formula', 'code'],
  'discussion-conclusion': ['table', 'diagram'],
  'general-analysis': ['table', 'diagram'],
}

export const BASE_CONTENT_FORM_PURPOSES: Record<SectionContentForm, string> = {
  table: '压缩比较维度、变量、模块、证据或限制，表内每一项都要能追溯到上下文。',
  diagram: '呈现概念关系、研究流程、系统结构或论证路径，不用图形替代必要解释。',
  formula: '表达变量、模型或计算关系；只有在符号、参数和来源可说明时使用。',
  code: '展示可读的代码或伪代码以说明算法、接口或实现步骤，不把代码展示当作运行证据。',
}


/** 按章节职责和学科过滤可用内容形态。 */
export function getAvailableContentForms(
  profile: SectionProfile,
  disciplineFamily: DisciplineFamily,
): SectionContentForm[] {
  const definitionForms = PROFILE_FORM_DEFAULTS[profile].filter((form) => CONTENT_FORMS.has(form));
  if (profile === 'abstract') return [];
  if (disciplineFamily === 'engineering' || disciplineFamily === 'science') {
    return [...new Set(definitionForms)];
  }
  if (
    disciplineFamily === 'literature-language'
    || disciplineFamily === 'law'
    || disciplineFamily === 'education'
    || disciplineFamily === 'management-economics'
  ) {
    return definitionForms.filter((form) => form === 'table' || form === 'diagram');
  }
  if (profile === 'method-design' || profile === 'result-implementation') {
    return definitionForms.filter((form) => form !== 'code' || disciplineFamily === 'design-art');
  }
  return definitionForms.filter((form) => form === 'table' || form === 'diagram');
}

/** 添加固定学科约束，保证工学、教育管理、文学和法学有不同的论证动作。 */
export function disciplineRhetoricalMoves(
  profile: SectionProfile,
  disciplineFamily: DisciplineFamily,
): string[] {
  if (disciplineFamily === 'engineering') {
    if (profile === 'method-design') return ['工学章节应把需求、模块边界、接口、技术选择与可复现步骤逐一对应。'];
    if (profile === 'result-implementation') return ['工学实现只能报告已有代码、日志、测试记录或可检查产物；无数据时改写为验证方案和待测指标。'];
  }
  if (disciplineFamily === 'education' || disciplineFamily === 'management-economics') {
    if (profile === 'introduction') return ['把教育、组织或治理场景、参与主体与制度约束落到可回答的问题。'];
    if (profile === 'literature-review') return ['按概念、机制和证据类型比较教育/管理研究，不把效果或绩效写成既定事实。'];
    if (profile === 'method-design') return ['交代对象、情境、干预或治理机制与分析步骤；没有样本时写清设计边界。'];
    if (profile === 'result-implementation') return ['区分课堂、组织或政策材料与推测；缺少真实数据时只写分析框架和待核验指标。'];
    if (profile === 'discussion-conclusion') return ['将解释限定在教育、组织或政策情境，并交代实施条件与外推边界。'];
  }
  if (disciplineFamily === 'literature-language' || disciplineFamily === 'law') {
    if (profile === 'literature-review') return ['按理论、文本或规范争点组织文献，比较立场、解释路径和证据边界。'];
    if (profile === 'method-design') return ['说明文本、法条、判例或案例选择标准、解释路径和比较维度，不能把规范判断当作实证结果。'];
    if (profile === 'result-implementation') return ['只分析已经提供的文本、法条、判例或案例材料，区分材料事实与研究者解释。'];
    if (profile === 'discussion-conclusion') return ['区分文本解释、规范评价与事实判断，结论限定在材料和法域范围内。'];
  }
  return [];
}

/** 内容形态说明只描述用途，不生成任何数据。 */
export function buildContentFormPurpose(
  kind: SectionContentForm,
  profile: SectionProfile,
  disciplineFamily: DisciplineFamily,
  dataAvailable: boolean,
): string {
  let purpose = BASE_CONTENT_FORM_PURPOSES[kind];
  if (profile === 'literature-review' && kind === 'table') purpose = '按主题、理论、方法和证据边界比较文献，不把表格当作逐篇摘要清单。';
  if (profile === 'method-design' && kind === 'diagram') purpose = '呈现研究流程、系统架构、模块接口或分析框架，并标明尚未实现的部分。';
  if (profile === 'result-implementation' && kind === 'table') purpose = '整理已有观察、测试记录、实现模块或对照项；没有真实数据时只列待测字段和证据缺口。';
  if (profile === 'result-implementation' && kind === 'diagram') purpose = '呈现已有产物结构或验证路径；没有真实数据时不得绘制虚假的结果趋势或性能曲线。';
  if (disciplineFamily === 'law' && kind === 'table') purpose = '并列法条、判例、制度要素或争议观点，明确法域和材料来源。';
  if (disciplineFamily === 'literature-language' && kind === 'table') purpose = '对照文本片段、主题、意象或理论维度；不得补造未提供的原文细节。';
  if (!dataAvailable && isDataBearingProfile(profile)) {
    purpose = `${purpose} 当前无真实数据时仅用于设计、已有材料或待验证字段，不得填入虚构数值。`;
  }
  return purpose;
}

export function isDataBearingProfile(profile: SectionProfile): boolean {
  return profile === 'result-implementation' || profile === 'method-design';
}
