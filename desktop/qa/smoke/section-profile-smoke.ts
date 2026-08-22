import {
  buildSectionGenerationPlan,
  classifySectionProfile,
  formatSectionGenerationPlan,
  getSectionProfileDefinition,
} from '../../electron/services/pipeline/section-profile'
import type { SectionProfile } from '../../shared/contracts'

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

const cases: Array<{ name: string; expected: SectionProfile; input: Parameters<typeof classifySectionProfile>[0] }> = [
  { name: '工学设计', expected: 'method-design', input: { title: '系统总体设计', discipline: '工学', pattern: 'system-engineering', contentForms: ['diagram', 'code'] } },
  { name: '教育综述', expected: 'literature-review', input: { title: '教育数字化研究现状', discipline: '教育管理', evidenceNeeds: ['literature'] } },
  { name: '文学引言', expected: 'introduction', input: { title: '绪论：问题提出与研究范围', discipline: '文学' } },
  { name: '法学分析', expected: 'general-analysis', input: { title: '行政裁量的规范边界', discipline: '法学', role: '规范分析' } },
  { name: '摘要', expected: 'abstract', input: { title: '摘要', discipline: '文学' } },
  { name: '结果', expected: 'result-implementation', input: { title: '实验结果与分析', discipline: '工学', hasRealData: false } },
  { name: '讨论', expected: 'discussion-conclusion', input: { title: '讨论与结论', discipline: '教育管理' } },
]

for (const item of cases) {
  const actual = classifySectionProfile(item.input)
  expect(actual === item.expected, `${item.name}识别为 ${actual}，预期 ${item.expected}`)
}

for (const profile of [
  'abstract',
  'introduction',
  'literature-review',
  'method-design',
  'result-implementation',
  'discussion-conclusion',
  'general-analysis',
] as SectionProfile[]) {
  const definition = getSectionProfileDefinition(profile)
  expect(definition.defaultStrategyIds.length >= 1 && definition.defaultStrategyIds.length <= 2, `${profile}默认策略数量不在 1–2 项`)
  expect(definition.rhetoricalMoves.length >= 3, `${profile}论证动作不足`)
  expect(definition.forbiddenClaims.length >= 2, `${profile}禁止主张不足`)
}

const noDataPlan = buildSectionGenerationPlan({
  title: '系统实现与测试',
  discipline: '工学',
  hasRealData: false,
  evidenceNeeds: ['project-data'],
  contentForms: ['table', 'diagram', 'code'],
  keyClaims: ['系统性能达到预期'],
})
expect(noDataPlan.profile === 'result-implementation', '无数据结果章节未识别为 result-implementation')
expect(noDataPlan.evidenceSlots[0]?.source === 'missing', '无数据结果主张未标记为 missing')
expect(noDataPlan.forbiddenClaims.some((claim) => claim.includes('不得要求或生成')), '无数据结果未输出强数据边界')
expect(noDataPlan.contentForms.every((form) => !form.dataAvailable), '无数据结果内容形态错误地标记为有数据')
expect(formatSectionGenerationPlan(noDataPlan).includes('数据边界：'), '计划格式化结果缺少数据边界')

process.stdout.write(`${JSON.stringify({ ok: true, checkedProfiles: 7, checkedCases: cases.length, noDataBoundary: true }, null, 2)}\n`)
