import type { SectionGenerationPlan } from './section-profile'

/** 把规则计划变成可直接拼接到 system/user prompt 的纯文本。 */
export function formatSectionGenerationPlan(plan: SectionGenerationPlan): string {
  const evidence = plan.evidenceSlots.length
    ? plan.evidenceSlots.map((slot, index) => {
        const references = slot.referenceIds.length ? slot.referenceIds.join('、') : '无已提供引用 ID'
        return `${index + 1}. 主张：${slot.claim}；证据来源：${slot.source}；可用引用：${references}`
      }).join('\n')
    : '暂无结构化主张；请先从节点目标提炼主张，再逐项绑定证据。'
  const forms = plan.contentForms.length
    ? plan.contentForms.map((form) => `${form.kind}：${form.purpose}${form.dataAvailable ? '' : '（当前无可核验数据）'}`).join('\n')
    : '本次不要求额外表格、图示、公式或代码。'
  return [
    '## 本节生成规则（章节感知）',
    `章节职责：${plan.profileLabel}（${plan.profile}）`,
    `职责说明：${plan.profileSummary}`,
    `默认/实际策略：${plan.strategyIds.join('、') || '无额外策略'}`,
    '',
    '必须完成的论证动作：',
    ...plan.rhetoricalMoves.map((move, index) => `${index + 1}. ${move}`),
    '',
    '主张与证据槽位：',
    evidence,
    '',
    '本次允许的内容形态：',
    forms,
    '',
    '禁止的主张或写法：',
    ...plan.forbiddenClaims.map((claim) => `- ${claim}`),
    '',
    `数据边界：${plan.dataBoundary}`,
  ].join('\n')
}

/** 兼容 prompt/directives 命名；不生成任何模型内容。 */
export const formatSectionProfilePrompt = formatSectionGenerationPlan


