import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  AgentRun,
  Artifact,
  ChatMessage,
  CitationEvidence,
  LiteratureRecord,
  OutlineNode,
} from '../shared/contracts'
import {
  createLiveEntityBase,
  WorkspaceRepository,
} from '../electron/services/storage/workspaceRepository'

const temporaryRoot = await mkdtemp(join(tmpdir(), 'academic-agent-project-lifecycle-'))
const workspacePath = join(temporaryRoot, 'workspace.json')

try {
  const repository = new WorkspaceRepository(workspacePath)
  await repository.initialize()

  const project = await repository.createProject({
    title: '项目删除冒烟验收',
    paperType: '课程论文',
    discipline: '软件工程',
    language: 'zh-CN',
    targetWords: 5_000,
    requirements: '验证项目级联删除与磁盘文件保留边界。',
    keywords: ['项目管理'],
  })
  const researchRootPath = join(temporaryRoot, '学术 Agent')
  const researchFolderPath = join(researchRootPath, '项目删除冒烟验收-test')
  const exportedPath = join(researchFolderPath, '已导出.md')
  await mkdir(researchFolderPath, { recursive: true })
  await writeFile(exportedPath, '# 导出文件\n', 'utf8')
  await repository.setResearchRootPath(researchRootPath)
  await repository.setProjectResearchFolder(project.id, researchFolderPath)

  const base = createLiveEntityBase()
  const literature: LiteratureRecord = {
    ...base,
    id: randomUUID(),
    projectId: project.id,
    title: '可追溯文献元数据验收',
    authors: ['QA'],
    source: 'manual',
    included: true,
  }
  await repository.addLiterature([literature], project.id)

  const outline: OutlineNode[] = [
    {
      id: randomUUID(),
      title: '一、绪论',
      level: 1,
      objective: '验证联删除',
      targetWords: 500,
      citationIds: [literature.id],
      children: [],
    },
  ]
  await repository.saveOutline(project.id, outline)
  const [section] = await repository.createSectionsFromOutline(project.id, outline)
  assert.ok(section)

  const message: ChatMessage = {
    ...createLiveEntityBase(),
    projectId: project.id,
    conversationId: project.activeConversationId,
    role: 'user',
    content: '验证消息联删除',
    status: 'completed',
  }
  await repository.appendMessage(message)

  const citation: CitationEvidence = {
    ...createLiveEntityBase(),
    projectId: project.id,
    sectionId: section.id,
    marker: '【文献:QA】',
    literatureId: literature.id,
    claim: '验收主张',
    status: 'mapped',
  }
  await repository.replaceSectionCitations(section.id, [citation])

  const completedRun: AgentRun = {
    ...createLiveEntityBase(),
    projectId: project.id,
    kind: 'export',
    status: 'completed',
    steps: [],
  }
  await repository.saveRun(completedRun)

  const artifact: Artifact = {
    ...createLiveEntityBase(),
    projectId: project.id,
    name: '已导出.md',
    format: 'md',
    path: exportedPath,
    size: 12,
  }
  await repository.saveArtifact(artifact)

  const afterDeletion = await repository.deleteProject(project.id)
  assert.equal(afterDeletion.projects.some((item) => item.id === project.id), false)
  assert.equal(afterDeletion.conversations.some((item) => item.projectId === project.id), false)
  assert.equal(afterDeletion.messages.some((item) => item.projectId === project.id), false)
  assert.equal(afterDeletion.literature.some((item) => item.projectId === project.id), false)
  assert.equal(afterDeletion.outlines[project.id], undefined)
  assert.equal(afterDeletion.sections.some((item) => item.projectId === project.id), false)
  assert.equal(afterDeletion.citations.some((item) => item.projectId === project.id), false)
  assert.equal(afterDeletion.runs.some((item) => item.projectId === project.id), false)
  assert.equal(afterDeletion.artifacts.some((item) => item.projectId === project.id), false)
  assert.equal(afterDeletion.settings.researchRootPath, researchRootPath)
  await access(exportedPath)

  const protectedProject = await repository.createProject({
    ...project.brief,
    title: '运行中任务保护',
  })
  const runningRun: AgentRun = {
    ...createLiveEntityBase(),
    projectId: protectedProject.id,
    kind: 'chat',
    status: 'running',
    steps: [
      {
        id: randomUUID(),
        label: '运行中',
        detail: '不允许删除',
        status: 'running',
      },
    ],
  }
  await repository.saveRun(runningRun)
  await assert.rejects(
    repository.deleteProject(protectedProject.id),
    /任务运行/,
  )
  await repository.updateRun(runningRun.id, { status: 'cancelled' })
  await repository.deleteProject(protectedProject.id)

  await repository.deleteProject('demo-project')
  const empty = repository.snapshot()
  assert.equal(empty.projects.length, 0)
  assert.equal(empty.settings.activeProjectId, undefined)
  assert.equal(empty.settings.demoMode, false)

  const reopened = new WorkspaceRepository(workspacePath)
  await reopened.initialize()
  assert.equal(reopened.snapshot().projects.length, 0)
  assert.equal(reopened.snapshot().settings.activeProjectId, undefined)

  console.log('项目生命周期冒烟验收：通过')
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
