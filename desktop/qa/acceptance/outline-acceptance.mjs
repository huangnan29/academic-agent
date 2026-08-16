#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createOutlinePipelineAdapter,
  loadPipelineModule,
} from './outline-pipeline-adapter.mjs'

const currentDir = dirname(fileURLToPath(import.meta.url))
const defaultBaselinePath = resolve(currentDir, 'outline-acceptance-baseline.json')

/**
 * 运行固定题目集的分类和三级大纲质量验收。
 * 默认只读取已生成的大纲 JSON，不主动调用模型；需要端到端生成时显式传入 --generate。
 */
async function main() {
  const args = parseArguments(process.argv.slice(2))
  if (args.help) {
    printUsage()
    return
  }
  if (!args.pipeline) {
    throw new Error('缺少 --pipeline。请传入最终 pipeline 构建模块或本地适配模块路径。')
  }

  const baseline = await readJson(resolveFrom(currentDir, args.baseline || defaultBaselinePath))
  const module = await loadPipelineModule(resolveFrom(currentDir, args.pipeline))
  const adapter = createOutlinePipelineAdapter(module, {
    classifier: args.classifier,
    quality: args.quality,
    generator: args.generator,
    callStyle: args.callStyle,
  })
  const outlines = args.outlines
    ? await loadOutlines(resolveFrom(currentDir, args.outlines))
    : new Map()

  const result = {
    状态: '通过',
    适配契约: {
      分类导出: adapter.names.classifier,
      质量导出: adapter.names.quality,
      生成导出: adapter.names.generator,
      调用风格: adapter.callStyle === 'object' ? '对象参数' : '位置参数',
    },
    固定题目数: Array.isArray(baseline.cases) ? baseline.cases.length : 0,
    题目结果: [],
    质量反例结果: [],
    未验证项: [],
    失败项: [],
  }

  const baselineProblems = validateBaselineCoverage(baseline)
  if (baselineProblems.length) {
    result.失败项.push({ label: '固定题目基线完整性', 问题: baselineProblems })
  }

  for (const item of baseline.cases || []) {
    const caseResult = await evaluateCase(item, adapter, outlines, args)
    result.题目结果.push(caseResult)
    collectStatus(result, caseResult, `固定题目 ${item.id}`)
  }

  for (const fixture of baseline.qualityFixtures || []) {
    const fixtureResult = await evaluateQualityFixture(fixture, adapter)
    result.质量反例结果.push(fixtureResult)
    collectStatus(result, fixtureResult, `质量反例 ${fixture.id}`)
  }

  if (result.失败项.length > 0) result.状态 = '失败'
  else if (result.未验证项.length > 0) result.状态 = '未验证'

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (result.状态 === '失败') process.exitCode = 1
  else if (result.状态 === '未验证') process.exitCode = 2
}

async function evaluateCase(item, adapter, outlines, args) {
  const evidence = item.evidence || {}
  const context = {
    evidence,
    literature: item.literature || [],
    caseId: item.id,
  }
  const output = await adapter.classify(item.brief, context)
  const architecture = unwrapArchitecture(output)
  const checks = checkClassification(item, architecture)
  let outline = outlines.get(item.id)
  let qualityReport

  if (!outline && args.generate) {
    if (!adapter.generate) {
      checks.push('要求端到端生成，但适配模块没有可选生成导出。')
    } else {
      const generated = await adapter.generate(item.brief, {
        ...context,
        architecture,
      })
      outline = unwrapOutline(generated)
      if (!outline) checks.push('生成函数没有返回可识别的 outline 数组。')
    }
  }

  if (outline) {
    const outlineChecks = checkOutlineSemantics(item, architecture, outline)
    checks.push(...outlineChecks)
    qualityReport = normalizeQualityReport(await adapter.quality(outline, {
      brief: item.brief,
      architecture,
      evidence,
      allowedCitationIds: item.allowedCitationIds || [],
      requireMainBodyThirdLevel: item.expected.mainBodyMustReachLevel3 !== false,
      caseId: item.id,
    }))
    if (!qualityReport.validShape) {
      checks.push('质量函数返回值不符合验收契约：必须包含 passed 和 issues。')
    } else if (!qualityReport.passed) {
      checks.push(`生成大纲质量未通过：${formatIssueCodes(qualityReport.issues)}`)
    }
  } else {
    checks.push('尚未提供该题目的生成大纲；分类已调用，大纲粒度和质量未验证。')
  }

  return {
    id: item.id,
    label: item.label,
    状态: checks.some((message) => !message.startsWith('尚未提供'))
      ? '失败'
      : checks.some((message) => message.startsWith('尚未提供'))
        ? '未验证'
        : '通过',
    未验证: checks.some((message) => message.startsWith('尚未提供')),
    分类: {
      结构模式: architecture.pattern,
      专业类别: architecture.disciplineFamily,
      研究方向: architecture.researchDirection,
      研究动作: architecture.researchAction,
      置信度: architecture.confidence,
      备选结构: architecture.alternatives,
    },
    大纲质量: qualityReport
      ? {
          通过: qualityReport.passed,
          指标: qualityReport.metrics,
          问题代码: qualityReport.issues.map((issue) => issue.code),
        }
      : '未提供大纲输入',
    问题: checks,
  }
}

async function evaluateQualityFixture(fixture, adapter) {
  const report = normalizeQualityReport(await adapter.quality(fixture.outline, {
    brief: fixture.brief,
    architecture: fixture.architecture || undefined,
    evidence: fixture.evidence || {},
    allowedCitationIds: fixture.allowedCitationIds || [],
    requireMainBodyThirdLevel: true,
    fixtureId: fixture.id,
  }))
  const checks = []
  const expected = fixture.expect || {}
  if (!report.validShape) {
    checks.push('质量函数返回值不符合验收契约：必须包含 passed 和 issues。')
  } else {
    if (typeof expected.passed === 'boolean' && report.passed !== expected.passed) {
      checks.push(`passed 与反例预期不符：期望 ${expected.passed ? '通过' : '不通过'}。`)
    }
    for (const code of expected.requiredIssueCodes || []) {
      if (!report.issues.some((issue) => issue.code === code)) {
        checks.push(`缺少预期质量问题代码：${code}。`)
      }
    }
    for (const code of expected.forbiddenIssueCodes || []) {
      if (report.issues.some((issue) => issue.code === code)) {
        checks.push(`出现不应出现的质量问题代码：${code}。`)
      }
    }
  }
  return {
    id: fixture.id,
    label: fixture.label,
    状态: checks.length ? '失败' : '通过',
    通过: report.passed,
    指标: report.metrics,
    问题代码: report.issues.map((issue) => issue.code),
    问题: checks,
  }
}

function checkClassification(item, architecture) {
  const expected = item.expected || {}
  const problems = []
  if (!architecture.pattern) problems.push('分类结果缺少结构模式。')
  if (!architecture.disciplineFamily) problems.push('分类结果缺少专业类别。')
  if (!architecture.researchDirection) problems.push('分类结果缺少具体研究方向。')
  if (!architecture.researchAction) problems.push('分类结果缺少研究动作。')

  const allowedPatterns = expected.patterns || []
  if (architecture.pattern && allowedPatterns.length && !allowedPatterns.includes(architecture.pattern)) {
    problems.push(`结构模式不符合题目基线：得到 ${architecture.pattern}，允许 ${allowedPatterns.join('、')}。`)
  }
  if (architecture.disciplineFamily && expected.disciplineFamilies?.length) {
    const familyText = String(architecture.disciplineFamily)
    const familyMatched = expected.disciplineFamilies.some((family) => familyText.includes(family))
    if (!familyMatched) problems.push(`专业类别不符合题目基线：得到 ${familyText}。`)
  }
  if (typeof expected.minimumConfidence === 'number') {
    if (typeof architecture.confidence !== 'number') problems.push('分类结果缺少 confidence。')
    else if (architecture.confidence < expected.minimumConfidence) {
      problems.push(`分类置信度过低：${architecture.confidence} < ${expected.minimumConfidence}。`)
    }
  }
  if (expected.requiresAlternativeReview) {
    const alternatives = Array.isArray(architecture.alternatives) ? architecture.alternatives : []
    if (alternatives.length === 0 && architecture.requiresUserChoice !== true) {
      problems.push('跨学科题目未提供备选结构或需要用户选择的标记。')
    }
  }
  if (item.evidence?.hasRealData === false && architecture.pattern === 'empirical-imrad') {
    problems.push('没有真实数据却路由到 empirical-imrad，存在生成实证结果的风险。')
  }
  return problems
}

function validateBaselineCoverage(baseline) {
  const problems = []
  const rules = baseline.acceptanceRules || {}
  const cases = Array.isArray(baseline.cases) ? baseline.cases : []
  if (typeof rules.requiredCaseCount === 'number' && cases.length < rules.requiredCaseCount) {
    problems.push(`固定题目数量不足：${cases.length} < ${rules.requiredCaseCount}。`)
  }
  const ids = cases.map((item) => item?.id).filter(Boolean)
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
  if (duplicateIds.length) problems.push(`固定题目 ID 重复：${[...new Set(duplicateIds)].join('、')}。`)

  const disciplines = cases
    .map((item) => `${item?.brief?.discipline || ''} ${(item?.expected?.disciplineFamilies || []).join(' ')}`)
    .join('｜')
  for (const family of rules.requiredDisciplineFamilies || []) {
    if (!disciplines.includes(family)) problems.push(`固定题目未覆盖专业类别：${family}。`)
  }

  const patterns = new Set(cases.flatMap((item) => item?.expected?.patterns || []))
  for (const pattern of rules.requiredPatterns || []) {
    if (!patterns.has(pattern)) problems.push(`固定题目未覆盖结构模式：${pattern}。`)
  }
  for (const item of cases) {
    if (!item?.id || !item?.brief?.title) problems.push('存在缺少 id 或 title 的固定题目。')
    if (!item?.evidence || typeof item.evidence.hasRealData !== 'boolean') {
      problems.push(`题目 ${item?.id || '未知'} 缺少明确的 hasRealData 边界。`)
    }
  }
  return [...new Set(problems)]
}

function checkOutlineSemantics(item, architecture, outline) {
  const expected = item.expected || {}
  const problems = []
  const nodes = flattenOutline(outline)
  const titles = nodes.map((node) => String(node.title || '').trim()).filter(Boolean)
  const titleText = titles.join('｜')
  const anchorGroups = expected.semanticAnchorGroups || []
  const matchedAnchorGroups = anchorGroups.filter((group) =>
    group.some((token) => titleText.includes(token)),
  ).length
  if (anchorGroups.length && matchedAnchorGroups < (expected.minimumMatchedAnchorGroups || anchorGroups.length)) {
    problems.push(`专业方向语义锚点不足：命中 ${matchedAnchorGroups}/${anchorGroups.length} 组。`)
  }

  if (expected.forbiddenTitleTokensWithoutData?.length && item.evidence?.hasRealData === false) {
    const forbidden = expected.forbiddenTitleTokensWithoutData.filter((token) => titleText.includes(token))
    if (forbidden.length) problems.push(`无真实数据时出现实证标题：${forbidden.join('、')}。`)
  }

  if (expected.requiresNoEmpiricalSections && item.evidence?.hasRealData === false) {
    const empiricalMarkers = ['样本', '问卷', '回归', '显著性', '统计检验', '实验结果', '效果量', '实证结果']
    const matched = empiricalMarkers.filter((token) => titleText.includes(token))
    if (matched.length) problems.push(`无真实数据的跨学科题目出现实证章节：${matched.join('、')}。`)
  }

  if (item.evidence?.hasRealData === false) {
    const dataBoundaryMarkers = [
      '实验结果', '统计结果', '问卷结果', '回归结果', '显著性检验', '效果量',
      '实测结论', '性能提升', '样本分析', '结果讨论', '结果与',
    ]
    const dataTitles = titles.filter((title) => dataBoundaryMarkers.some((token) => title.includes(token)))
    const dataNeedNodes = nodes.filter((node) => {
      const role = String(node.role || '').toLowerCase()
      const needs = Array.isArray(node.evidenceNeeds) ? node.evidenceNeeds : []
      return ['result', 'results', 'empirical'].includes(role) || needs.includes('project-data')
    })
    if (dataTitles.length || dataNeedNodes.length) {
      problems.push(`无真实数据却出现结果证据槽位：${[...dataTitles, ...dataNeedNodes.map((node) => node.title)].join('、')}。`)
    }
  }

  if (expected.mainBodyMustReachLevel3 !== false) {
    const level3Count = nodes.filter((node) => Number(node.level) === 3).length
    if (level3Count === 0) problems.push('主要正文没有三级论证节点。')
  }
  if (architecture.pattern && expected.patterns?.length && !expected.patterns.includes(architecture.pattern)) {
    problems.push('大纲语义检查使用了不在题目允许范围内的结构模式。')
  }
  return problems
}

function normalizeQualityReport(value) {
  const report = value?.report && typeof value.report === 'object' ? value.report : value
  const issues = Array.isArray(report?.issues)
    ? report.issues.map((issue) => ({
        code: String(issue?.code || 'UNKNOWN_QUALITY_ISSUE'),
        severity: String(issue?.severity || 'warning'),
        message: String(issue?.message || ''),
      }))
    : []
  return {
    validShape: Boolean(report && typeof report.passed === 'boolean' && Array.isArray(report.issues)),
    passed: report?.passed === true,
    issues,
    metrics: report?.metrics && typeof report.metrics === 'object' ? report.metrics : {},
  }
}

function unwrapArchitecture(value) {
  if (value?.architecture && typeof value.architecture === 'object') return value.architecture
  if (value?.classification && typeof value.classification === 'object') return value.classification
  return value && typeof value === 'object' ? value : {}
}

function unwrapOutline(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.outline)) return value.outline
  if (Array.isArray(value?.sections)) return value.sections
  if (Array.isArray(value?.data)) return value.data
  return undefined
}

function flattenOutline(outline) {
  const result = []
  const visit = (nodes) => {
    if (!Array.isArray(nodes)) return
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue
      result.push(node)
      visit(node.children)
    }
  }
  visit(outline)
  return result
}

function collectStatus(result, item, label) {
  if (item.状态 === '失败') result.失败项.push({ label, 问题: item.问题 || [] })
  if (item.未验证 || item.状态 === '未验证') {
    result.未验证项.push({ label, 问题: item.问题 || [] })
  }
}

async function loadOutlines(path) {
  const value = await readJson(path)
  if (value?.caseId && unwrapOutline(value)) {
    return new Map([[value.caseId, unwrapOutline(value)]])
  }
  const source = value?.outlines && typeof value.outlines === 'object' ? value.outlines : value
  const result = new Map()
  if (Array.isArray(source)) {
    for (const item of source) {
      if (item?.caseId && unwrapOutline(item)) result.set(item.caseId, unwrapOutline(item))
    }
    return result
  }
  if (source && typeof source === 'object') {
    for (const [caseId, outline] of Object.entries(source)) {
      const unwrapped = unwrapOutline(outline)
      if (unwrapped) result.set(caseId, unwrapped)
    }
  }
  return result
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

function resolveFrom(base, target) {
  return isAbsolute(target) ? target : resolve(base, target)
}

function formatIssueCodes(issues) {
  return issues.length ? issues.map((issue) => issue.code).join('、') : '未提供问题代码'
}

function parseArguments(values) {
  const result = { baseline: defaultBaselinePath }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--help' || value === '-h') result.help = true
    else if (value === '--generate') result.generate = true
    else if (value.startsWith('--')) {
      const key = value.slice(2)
      const next = values[index + 1]
      if (!next || next.startsWith('--')) throw new Error(`参数 ${value} 缺少值。`)
      result[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = next
      index += 1
    } else {
      throw new Error(`无法识别参数：${value}。`)
    }
  }
  return result
}

function printUsage() {
  process.stdout.write([
    '三级大纲验收用法：',
    '',
    'node qa/acceptance/outline-acceptance.mjs --pipeline <pipeline-module> [选项]',
    '',
    '必填：',
    '  --pipeline <路径>       最终 pipeline 构建模块或本地适配模块。',
    '',
    '常用选项：',
    '  --outlines <路径>       按题目 ID 提供生成结果 JSON；不提供则只完成分类，质量标为未验证。',
    '  --generate              在 pipeline 暴露 generateOutline 时生成大纲；默认不主动调用模型。',
    '  --baseline <路径>       替换固定题目基线。',
    '  --classifier <导出名>   默认 classifyResearchBrief。',
    '  --quality <导出名>      默认 runOutlineQualityChecks。',
    '  --generator <导出名>    默认 generateOutline。',
    '  --call-style <类型>     positional（默认）或 object。',
    '  --help                  显示本说明。',
  ].join('\n') + '\n')
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : '未知错误。'
  process.stderr.write(`三级大纲验收未执行：${message}\n`)
  process.exitCode = 1
})
