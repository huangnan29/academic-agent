import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { OutlineNode } from '../../shared/contracts'
import {
  buildSectionGenerationPlan,
  buildSectionPrompt,
  runQualityChecks,
} from '../../electron/services/pipeline'
import { WorkspaceRepository } from '../../electron/services/storage/workspaceRepository'

const temporaryRoot = await mkdtemp(join(tmpdir(), 'academic-agent-section-aware-'))
const workspacePath = join(temporaryRoot, 'workspace.json')

try {
  const repository = new WorkspaceRepository(workspacePath)
  await repository.initialize()
  const project = await repository.createProject({
    title: '生成式人工智能赋能高校教学的作用机制研究',
    paperType: '学位论文',
    discipline: '教育学',
    language: 'zh-CN',
    targetWords: 12_000,
    requirements: '暂无问卷、访谈或实验数据，只允许进行文献与机制分析。',
    keywords: ['生成式人工智能', '高校教学', '作用机制'],
  })
  const outline: OutlineNode[] = [
    node('intro', '第一章 绪论', 1, '提出研究问题与理论缺口', 1_600, [
      node('intro-1', '1.1 研究背景与问题提出', 2, '收束背景并提出问题', 800),
    ]),
    node('method', '第二章 研究方法与分析设计', 1, '说明研究材料、分析维度与实施步骤', 2_200, [
      node('method-1', '2.1 研究路径与分析步骤', 2, '建立可复核的分析步骤', 1_000),
    ]),
    node('result', '第三章 作用机制分析', 1, '基于已纳入文献分析机制，不产生实证结果', 2_800),
    node('conclusion', '第四章 讨论、局限与结论', 1, '回答问题并说明边界', 1_400),
  ]
  await repository.saveOutline(project.id, outline)
  const sections = await repository.createSectionsFromOutline(project.id, outline)
  const state = repository.snapshot()

  const introPlan = buildSectionGenerationPlan({
    node: outline[0],
    brief: project.brief,
    hasRealData: false,
  })
  const methodPlan = buildSectionGenerationPlan({
    node: outline[1],
    brief: project.brief,
    hasRealData: false,
  })
  const resultPlan = buildSectionGenerationPlan({
    node: outline[2],
    brief: project.brief,
    hasRealData: false,
  })
  const conclusionPlan = buildSectionGenerationPlan({
    node: outline[3],
    brief: project.brief,
    hasRealData: false,
  })

  assert.equal(introPlan.profile, 'introduction')
  assert.equal(methodPlan.profile, 'method-design')
  assert.equal(resultPlan.profile, 'result-implementation')
  assert.equal(conclusionPlan.profile, 'discussion-conclusion')
  assert.notDeepEqual(introPlan.rhetoricalMoves, methodPlan.rhetoricalMoves)
  assert.ok(resultPlan.dataBoundary.includes('不得') || resultPlan.dataBoundary.includes('不能'))
  assert.ok(resultPlan.forbiddenClaims.some((item) => /数据|结果|成效/.test(item)))

  const introSection = sections.find((item) => item.outlineNodeId === 'intro')
  assert.ok(introSection)
  const prompt = buildSectionPrompt(state, project.id, introSection.id, {
    generationPlan: introPlan,
    mode: 'initial',
  })
  const systemPrompt = prompt[0]?.content ?? ''
  assert.ok(systemPrompt.includes('章节职责：绪论 / 问题提出'))
  assert.ok(systemPrompt.includes('本次优化策略'))
  assert.ok(systemPrompt.includes('不得虚构'))

  const generation = await repository.beginSectionGeneration(introSection.id, {
    generationProfile: introPlan.profile,
    generationMode: 'initial',
    generationStrategyIds: introPlan.strategyIds,
    generationContentForms: introPlan.selectedContentForms,
    generationProviderId: 'provider-smoke',
    generationModel: 'model-smoke',
    thinkingRequested: false,
  })
  const committed = await repository.commitSectionGeneration(
    introSection.id,
    generation.baseVersion,
    '## 第一章 绪论\n\n本节围绕研究背景、问题缺口与研究目标展开，并明确后续机制分析的证据边界。',
    {
      source: 'generated',
      generationProfile: introPlan.profile,
      generationMode: 'initial',
      generationStrategyIds: introPlan.strategyIds,
      generationContentForms: introPlan.selectedContentForms,
      generationProviderId: 'provider-smoke',
      generationModel: 'model-smoke',
      thinkingRequested: false,
    },
  )
  assert.equal(committed.generationProfile, 'introduction')
  assert.deepEqual(committed.generationStrategyIds, introPlan.strategyIds)
  const version = repository.snapshot().sectionVersions.find(
    (item) => item.id === committed.activeGenerationVersionId,
  )
  assert.equal(version?.generationProfile, 'introduction')
  assert.deepEqual(version?.generationStrategyIds, introPlan.strategyIds)

  const styleOnly = runQualityChecks([
    '随着相关技术不断发展，教学研究开始关注新的协作方式。',
    '随着数字平台持续发展，课程设计逐渐形成新的证据需求。',
    '这些句子用于触发可解释的风格提醒，但不包含引用造假或虚构数据。',
  ].join('\n\n'))
  assert.ok(styleOnly.issues.some((item) => item.code === 'BOILERPLATE_DENSITY'))
  assert.equal(styleOnly.passed, true)
  assert.equal(styleOnly.score, 100, '风格 warning 不应扣减传统质量分')

  const reopened = new WorkspaceRepository(workspacePath)
  await reopened.initialize()
  const restored = reopened.snapshot().sections.find((item) => item.id === introSection.id)
  assert.equal(restored?.generationProfile, 'introduction')
  assert.deepEqual(restored?.generationStrategyIds, introPlan.strategyIds)

  console.log(JSON.stringify({
    ok: true,
    profiles: [introPlan.profile, methodPlan.profile, resultPlan.profile, conclusionPlan.profile],
    strategies: introPlan.strategyIds,
    promptDifferentiated: true,
    metadataPersisted: true,
    styleWarningsDoNotPenalizeScore: true,
  }, null, 2))
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}

function node(
  id: string,
  title: string,
  level: 1 | 2 | 3,
  objective: string,
  targetWords: number,
  children: OutlineNode[] = [],
): OutlineNode {
  return {
    id,
    title,
    level,
    objective,
    targetWords,
    citationIds: [],
    children,
  }
}
