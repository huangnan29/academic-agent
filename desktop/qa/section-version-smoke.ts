import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { OutlineNode, WorkspaceState } from '../shared/contracts'
import { WorkspaceRepository } from '../electron/services/storage/workspaceRepository'

const temporaryRoot = await mkdtemp(join(tmpdir(), 'academic-agent-section-version-'))
const workspacePath = join(temporaryRoot, 'workspace.json')

try {
  // 先用现行仓储生成完整工作区，再移除新字段，模拟升级前已经保存正文的旧工作区。
  const seedRepository = new WorkspaceRepository(workspacePath)
  await seedRepository.initialize()
  const project = await seedRepository.createProject({
    title: '章节版本历史冒烟验收',
    paperType: '测试论文',
    discipline: '软件工程',
    language: 'zh-CN',
    targetWords: 3_000,
    requirements: '验证旧稿迁移、重新生成、版本选择与级联清理。',
    keywords: ['章节版本'],
  })
  const outline: OutlineNode[] = [
    {
      id: 'outline-version-chapter',
      title: '第一章 绪论',
      level: 1,
      objective: '验证章节版本历史',
      targetWords: 800,
      citationIds: [],
      children: [],
    },
  ]
  await seedRepository.saveOutline(project.id, outline)
  const [createdSection] = await seedRepository.createSectionsFromOutline(project.id, outline)
  assert.ok(createdSection)
  await seedRepository.saveSection(createdSection.id, '这是升级前已经存在的旧稿正文。')

  const legacyWorkspace = JSON.parse(
    await readFile(workspacePath, 'utf8'),
  ) as Partial<WorkspaceState>
  delete legacyWorkspace.sectionVersions
  const legacySection = legacyWorkspace.sections?.find((item) => item.id === createdSection.id)
  assert.ok(legacySection)
  delete legacySection.activeGenerationVersionId
  await writeFile(workspacePath, `${JSON.stringify(legacyWorkspace, null, 2)}\n`, 'utf8')

  const repository = new WorkspaceRepository(workspacePath)
  await repository.initialize()

  let state = repository.snapshot()
  let section = state.sections.find((item) => item.id === createdSection.id)
  let versions = state.sectionVersions.filter((item) => item.sectionId === createdSection.id)
  assert.ok(section)
  assert.equal(versions.length, 1, '旧章节首次初始化后应迁移出一个历史版本')
  const versionOne = versions[0]
  assert.equal(versionOne.number, 1)
  assert.equal(versionOne.source, 'migrated')
  assert.equal(versionOne.content, '这是升级前已经存在的旧稿正文。')
  assert.equal(section.activeGenerationVersionId, versionOne.id)

  const generation = await repository.beginSectionGeneration(createdSection.id, {
    generationProviderId: 'provider-version-smoke',
    generationModel: 'reasoning-model',
    thinkingRequested: true,
  })
  assert.equal(generation.section.content, versionOne.content, '开始重新生成时不得清空旧正文')
  await assert.rejects(
    repository.beginSectionGeneration(createdSection.id, {
      generationProviderId: 'provider-version-smoke',
      generationModel: 'reasoning-model',
      thinkingRequested: true,
    }),
    /已经在生成/,
    '同一章节生成期间不得重复开始生成',
  )

  await repository.commitSectionGeneration(
    createdSection.id,
    generation.baseVersion,
    '这是模型重新生成的新稿正文。',
    {
      source: 'generated',
      reasoningContent: '这是服务商明确返回的推理内容。',
      generationProviderId: 'provider-version-smoke',
      generationModel: 'reasoning-model',
      thinkingRequested: true,
    },
  )
  state = repository.snapshot()
  section = state.sections.find((item) => item.id === createdSection.id)
  versions = state.sectionVersions
    .filter((item) => item.sectionId === createdSection.id)
    .sort((left, right) => left.number - right.number)
  assert.ok(section)
  assert.equal(versions.length, 2)
  const versionTwo = versions[1]
  assert.equal(versionTwo.number, 2)
  assert.equal(versionTwo.source, 'generated')
  assert.equal(versionTwo.content, '这是模型重新生成的新稿正文。')
  assert.equal(section.activeGenerationVersionId, versionTwo.id)
  assert.equal(section.content, versionTwo.content)

  const restored = await repository.selectSectionVersion(createdSection.id, versionOne.id)
  assert.equal(restored.content, versionOne.content, '选择 v1 后当前正文应切回旧稿')
  assert.equal(restored.activeGenerationVersionId, versionOne.id)

  await repository.saveSection(createdSection.id, '这是用户再次手工保存的第三稿。')
  state = repository.snapshot()
  section = state.sections.find((item) => item.id === createdSection.id)
  versions = state.sectionVersions
    .filter((item) => item.sectionId === createdSection.id)
    .sort((left, right) => left.number - right.number)
  assert.ok(section)
  assert.equal(versions.length, 3, '切回旧稿后再次手工保存应形成新版本')
  const versionThree = versions[2]
  assert.equal(versionThree.number, 3)
  assert.equal(versionThree.source, 'saved')
  assert.equal(versionThree.content, '这是用户再次手工保存的第三稿。')
  assert.equal(section.activeGenerationVersionId, versionThree.id)

  const afterDeletion = await repository.deleteProject(project.id)
  assert.equal(afterDeletion.sections.some((item) => item.projectId === project.id), false)
  assert.equal(
    afterDeletion.sectionVersions.some((item) => item.projectId === project.id),
    false,
    '删除项目后应级联清理章节版本历史',
  )

  console.log('章节版本历史冒烟验收：通过')
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
