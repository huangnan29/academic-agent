import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LiteratureRecord } from '../../shared/contracts'
import {
  createLiveEntityBase,
  WorkspaceRepository,
} from '../../electron/services/storage/workspaceRepository'

const temporaryRoot = await mkdtemp(join(tmpdir(), 'academic-agent-literature-project-'))
const workspacePath = join(temporaryRoot, 'workspace.json')

try {
  const repository = new WorkspaceRepository(workspacePath)
  await repository.initialize()

  const initialState = repository.snapshot()
  const project = initialState.projects.find((item) => item.origin === 'demo')
  assert.ok(project, '新工作区应包含演示项目')
  assert.equal(initialState.settings.activeProjectId, project.id)
  assert.equal(initialState.settings.demoMode, true)

  const realLiterature: LiteratureRecord = {
    ...createLiveEntityBase(),
    projectId: project.id,
    title: 'Project-aware Literature Lifecycle',
    authors: ['QA Researcher'],
    year: 2026,
    venue: 'arXiv',
    doi: '10.1234/PROJECT-SMOKE',
    url: 'https://example.org/project-smoke',
    source: 'openalex',
    included: false,
    verificationStatus: 'verified-metadata',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }

  const [added] = await repository.addLiterature([realLiterature], project.id)
  assert.equal(added.id, realLiterature.id)
  assert.equal(added.projectId, project.id)
  assert.equal(added.included, false)

  // 演示项目一旦产生真实文献活动，必须升级为正式研究并同步清除演示状态。
  const promotedState = repository.snapshot()
  const promotedProject = promotedState.projects.find((item) => item.id === project.id)
  assert.equal(promotedProject?.origin, 'live')
  assert.equal(promotedProject?.verificationStatus, 'unverified')
  assert.equal(promotedState.settings.demoMode, false)

  const included = await repository.toggleLiterature(project.id, added.id, true)
  assert.equal(included.included, true)
  let citedSection = repository.snapshot().sections.find((item) => item.projectId === project.id)
  if (!citedSection) {
    const outline = [{
      id: 'literature-reference-qa-node',
      title: '引用保护验收章节',
      level: 1 as const,
      objective: '验证已经引用的文献不会被取消纳入。',
      targetWords: 500,
      citationIds: [],
      children: [],
    }]
    await repository.saveOutline(project.id, outline)
    await repository.createSectionsFromOutline(project.id, outline)
    citedSection = repository.snapshot().sections.find((item) => item.projectId === project.id)
  }
  assert.ok(citedSection, '演示项目应包含可用于引用边界验收的章节')
  await repository.replaceSectionCitations(citedSection.id, [{
    ...createLiveEntityBase(),
    projectId: project.id,
    sectionId: citedSection.id,
    marker: `【文献:${added.id}】`,
    literatureId: added.id,
    claim: '用于验收引用保护。',
    status: 'mapped',
  }])
  await assert.rejects(
    repository.toggleLiterature(project.id, added.id, false),
    /仍被大纲或正文引用/,
  )
  await repository.replaceSectionCitations(citedSection.id, [])
  await repository.saveSection(citedSection.id, `引用保护测试 [cite:${added.id}]。`)
  await assert.rejects(
    repository.toggleLiterature(project.id, added.id, false),
    /仍被大纲或正文引用/,
  )
  await assert.rejects(
    repository.deleteLiterature(added.id, project.id),
    /仍被大纲或正文引用/,
  )
  await repository.saveSection(citedSection.id, '引用保护测试已清理。')
  const excluded = await repository.toggleLiterature(project.id, added.id, false)
  assert.equal(excluded.included, false)

  // 移出项目前先恢复纳入状态，验证移出动作会强制清除 included，但不删除记录。
  await repository.toggleLiterature(project.id, added.id, true)
  const detached = await repository.setLiteratureProject(added.id, project.id, undefined)
  assert.equal(detached.projectId, undefined)
  assert.equal(detached.included, false)
  assert.ok(
    repository.snapshot().literature.some((item) => item.id === added.id),
    '移出项目后文献记录仍应保留在本机文献库',
  )

  const restored = await repository.setLiteratureProject(added.id, null, project.id)
  assert.equal(restored.projectId, project.id)
  assert.equal(restored.included, false)

  // 重复检索结果只能更新元数据，不能替换记录身份、纳入状态和首次创建时间。
  await repository.toggleLiterature(project.id, added.id, true)
  const duplicateResult: LiteratureRecord = {
    ...createLiveEntityBase(),
    projectId: project.id,
    title: 'Project-aware Literature Lifecycle（更新元数据）',
    authors: ['QA Researcher', 'Second Researcher'],
    year: 2027,
    venue: 'Updated Venue',
    doi: '10.1234/project-smoke',
    url: 'https://example.org/project-smoke-v2',
    source: 'crossref',
    included: false,
    createdAt: '2027-02-02T00:00:00.000Z',
    updatedAt: '2027-02-02T00:00:00.000Z',
  }
  const [merged] = await repository.addLiterature([duplicateResult], project.id)
  assert.equal(merged.id, added.id, '重复 DOI 应合并到原记录')
  assert.equal(merged.included, true, '重复检索不得清除用户的纳入状态')
  assert.equal(merged.createdAt, realLiterature.createdAt, '重复检索不得覆盖首次创建时间')
  assert.equal(merged.title, realLiterature.title, '低可信重复结果不得覆盖已确认的标题')
  assert.deepEqual(merged.authors, realLiterature.authors, '低可信重复结果不得覆盖已确认的作者')
  assert.equal(
    repository.snapshot().literature.filter(
      (item) => item.doi?.toLocaleLowerCase() === realLiterature.doi?.toLocaleLowerCase(),
    ).length,
    1,
    '同一项目中的重复 DOI 只能保留一条记录',
  )

  const secondProject = await repository.createProject({
    ...project.brief,
    title: '第二个文献归属验收项目',
  })
  const [samePaperInSecondProject] = await repository.addLiterature([{
    ...realLiterature,
    projectId: secondProject.id,
  }], secondProject.id)
  assert.notEqual(
    samePaperInSecondProject.id,
    added.id,
    '同一文献进入不同项目时必须使用不同记录 ID，避免跨项目误操作',
  )
  await repository.deleteLiterature(samePaperInSecondProject.id, secondProject.id)
  assert.equal(
    repository.snapshot().literature.some((item) => item.id === samePaperInSecondProject.id),
    false,
    '永久删除后记录不应继续留在全部文献中',
  )

  const demoLiterature = repository.snapshot().literature.find(
    (item) => item.projectId === project.id && item.origin === 'demo',
  )
  assert.ok(demoLiterature, '演示项目的演示文献应继续保留')
  await assert.rejects(
    repository.toggleLiterature(project.id, demoLiterature.id, true),
    /演示文献不可用于正式引用/,
  )
  assert.equal(
    repository.snapshot().literature.find((item) => item.id === demoLiterature.id)?.included,
    false,
    '被拒绝的演示文献不得改变纳入状态',
  )
  await repository.deleteLiterature(demoLiterature.id, project.id)
  assert.equal(
    repository.snapshot().literature.some((item) => item.id === demoLiterature.id),
    false,
    '演示测试文献也必须允许用户永久删除',
  )

  console.log(JSON.stringify({
    ok: true,
    projectPromotedToLive: true,
    includeAndExclude: true,
    citedLiteratureProtected: true,
    detachPreservedRecord: true,
    restoreProject: true,
    duplicateDoiMerged: true,
    crossProjectIdsUnique: true,
    demoLiteratureRejected: true,
    referencedDeleteProtected: true,
    permanentDelete: true,
    demoLiteratureDelete: true,
  }, null, 2))
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
