import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ManuscriptSection, OutlineNode, WorkspaceState } from '../shared/contracts'
import { createExportDocumentModel } from '../electron/services/export/document-model'
import { buildPaperContext } from '../electron/services/pipeline/context'
import { runProjectQualityChecks } from '../electron/services/pipeline/quality'
import { WorkspaceRepository } from '../electron/services/storage/workspaceRepository'
import { extractDirectChildContents } from '../shared/sectionContent'

const timestamp = '2026-08-12T00:00:00.000Z'
const projectId = 'project-section-sync'

const outline: OutlineNode[] = [
  {
    id: 'chapter-1',
    title: '第一章 绪论',
    level: 1,
    objective: '说明研究背景与价值',
    targetWords: 1200,
    citationIds: [],
    children: [
      {
        id: 'chapter-1-1',
        title: '1.1 研究背景',
        level: 2,
        objective: '交代研究背景',
        targetWords: 500,
        citationIds: [],
        children: [
          {
            id: 'chapter-1-1-1',
            title: '1.1.1 技术演进',
            level: 3,
            objective: '说明技术演进',
            targetWords: 250,
            citationIds: [],
            children: [],
          },
        ],
      },
      {
        id: 'chapter-1-2',
        title: '1.2 研究意义',
        level: 2,
        objective: '说明研究意义',
        targetWords: 500,
        citationIds: [],
        children: [],
      },
    ],
  },
]

const rootContent = [
  '## 第一章 绪论',
  '',
  '本章先说明研究问题。',
  '',
  '### 1.1 研究背景',
  '',
  '这是原始背景内容。',
  '',
  '#### 1.1.1 技术演进',
  '',
  '这是技术演进内容。',
  '',
  '### 1.2 研究意义',
  '',
  '这是研究意义内容。',
].join('\n')

function section(
  id: string,
  outlineNodeId: string,
  title: string,
  level: 1 | 2 | 3,
  content = '',
): ManuscriptSection {
  return {
    id,
    projectId,
    outlineNodeId,
    title,
    level,
    content,
    status: content ? 'draft' : 'pending',
    wordCount: content.replace(/\s/g, '').length,
    version: 1,
    origin: 'live',
    verificationStatus: 'unverified',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function legacyState(): WorkspaceState {
  return {
    schemaVersion: 1,
    projects: [
      {
        id: projectId,
        title: '章节同步验证',
        status: 'writing',
        brief: {
          title: '章节同步验证',
          paperType: '测试论文',
          discipline: '计算机科学',
          language: 'zh-CN',
          targetWords: 1200,
          requirements: '',
          keywords: [],
        },
        activeConversationId: 'conversation-1',
        activeSectionId: 'section-root',
        origin: 'live',
        verificationStatus: 'unverified',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    conversations: [
      {
        id: 'conversation-1',
        projectId,
        title: '验证对话',
        messageIds: [],
        origin: 'live',
        verificationStatus: 'unverified',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    messages: [],
    providers: [],
    literature: [],
    outlines: { [projectId]: outline },
    sections: [
      section('section-root', 'chapter-1', '第一章 绪论', 1, rootContent),
      section('section-child', 'chapter-1-1', '1.1 研究背景', 2),
      section('section-grandchild', 'chapter-1-1-1', '1.1.1 技术演进', 3),
      section('section-sibling', 'chapter-1-2', '1.2 研究意义', 2),
    ],
    citations: [],
    runs: [],
    mcpServers: [],
    skills: [],
    artifacts: [],
    settings: { activeProjectId: projectId, demoMode: false },
  }
}

async function main() {
  const noSpaceContent = [
    '1.1研究背景',
    '无空格编号内容。',
    '（二）研究意义',
    '括号编号内容。',
  ].join('\n')
  const noSpaceOutline: OutlineNode[] = [
    { ...outline[0].children[0], title: '1.1 研究背景', children: [] },
    { ...outline[0].children[1], title: '（二）研究意义', children: [] },
  ]
  const parsedNoSpace = extractDirectChildContents(noSpaceContent, noSpaceOutline)
  assert.match(parsedNoSpace.get('chapter-1-1') ?? '', /无空格编号内容/)
  assert.match(parsedNoSpace.get('chapter-1-2') ?? '', /括号编号内容/)

  const directory = await mkdtemp(join(tmpdir(), 'academic-agent-section-sync-'))
  const workspacePath = join(directory, 'workspace.json')

  try {
    await writeFile(workspacePath, `${JSON.stringify(legacyState(), null, 2)}\n`, 'utf8')
    const repository = new WorkspaceRepository(workspacePath)
    await repository.initialize()

    let state = repository.snapshot()
    const child = state.sections.find((item) => item.id === 'section-child')
    const grandchild = state.sections.find((item) => item.id === 'section-grandchild')
    const sibling = state.sections.find((item) => item.id === 'section-sibling')

    assert.equal(child?.derivedFromSectionId, 'section-root')
    assert.match(child?.content ?? '', /这是原始背景内容/)
    assert.doesNotMatch(child?.content ?? '', /这是研究意义内容/)
    assert.equal(grandchild?.derivedFromSectionId, 'section-child')
    assert.match(grandchild?.content ?? '', /这是技术演进内容/)
    assert.equal(sibling?.derivedFromSectionId, 'section-root')
    assert.match(sibling?.content ?? '', /这是研究意义内容/)

    const exportModel = createExportDocumentModel(state, projectId)
    assert.deepEqual(exportModel.sections.map((item) => item.id), ['section-root'])
    const exportedText = exportModel.sections.map((item) => item.content).join('\n')
    assert.equal(
      exportedText.split('这是技术演进内容。').length - 1,
      1,
      '导出正文中的三级内容不得重复',
    )

    const quality = runProjectQualityChecks(state, projectId)
    assert.ok(quality.metrics.wordCount > 0)
    const sectionContext = buildPaperContext(state, projectId, {
      scope: 'section',
      targetSectionId: 'section-child',
    })
    assert.match(sectionContext, /这是原始背景内容/)
    assert.doesNotMatch(sectionContext, /这是研究意义内容/)
    const manuscriptContext = buildPaperContext(state, projectId, { scope: 'manuscript' })
    assert.equal(
      manuscriptContext.split('这是技术演进内容。').length - 1,
      1,
      '全文上下文中的三级内容不得重复',
    )

    const editedChild = [
      '### 1.1 研究背景',
      '',
      '这是用户修改后的背景内容。',
      '',
      '#### 1.1.1 技术演进',
      '',
      '这是用户修改后的技术演进内容。',
    ].join('\n')
    await repository.saveSection('section-child', editedChild)
    state = repository.snapshot()
    const root = state.sections.find((item) => item.id === 'section-root')
    assert.match(root?.content ?? '', /这是用户修改后的背景内容/)
    assert.doesNotMatch(root?.content ?? '', /这是原始背景内容/)
    assert.match(root?.content ?? '', /这是研究意义内容/)
    assert.match(
      state.sections.find((item) => item.id === 'section-grandchild')?.content ?? '',
      /这是用户修改后的技术演进内容/,
    )

    await repository.updateSection('section-grandchild', {
      content: '#### 1.1.1 技术演进\n\n这是此前独立编辑的三级内容。',
      wordCount: 22,
      status: 'draft',
      derivedFromSectionId: undefined,
      derivedFromVersion: undefined,
    })
    await repository.saveSection(
      'section-grandchild',
      '#### 1.1.1 技术演进\n\n这是此前独立编辑的三级内容。',
    )
    state = repository.snapshot()
    assert.match(
      state.sections.find((item) => item.id === 'section-root')?.content ?? '',
      /这是此前独立编辑的三级内容/,
    )

    const reopened = new WorkspaceRepository(workspacePath)
    await reopened.initialize()
    assert.match(
      reopened.snapshot().sections.find((item) => item.id === 'section-child')?.content ?? '',
      /这是用户修改后的背景内容/,
    )
    const persisted = JSON.parse(await readFile(workspacePath, 'utf8')) as WorkspaceState
    assert.equal(
      persisted.sections.find((item) => item.id === 'section-child')?.derivedFromSectionId,
      'section-root',
    )

    const promotedOutline: OutlineNode[] = [
      { ...outline[0], children: [outline[0].children[1]] },
      {
        ...outline[0].children[0],
        title: '第二章 研究背景',
        level: 1,
        children: outline[0].children[0].children,
      },
    ]
    await repository.saveOutline(projectId, promotedOutline)
    await repository.createSectionsFromOutline(projectId, promotedOutline)
    state = repository.snapshot()
    assert.equal(
      state.sections.find((item) => item.id === 'section-child')?.derivedFromSectionId,
      undefined,
      '节点升为一级后必须解除旧父章节同步关系',
    )
    assert.ok(
      createExportDocumentModel(state, projectId).sections.some(
        (item) => item.id === 'section-child',
      ),
      '解除旧同步关系后章节必须继续参与导出',
    )

    console.log('章节同步冒烟验证通过：旧数据回填、三级拆分、编辑回写、上下文与导出去重均正常。')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }

  const conflictDirectory = await mkdtemp(join(tmpdir(), 'academic-agent-conflict-copy-'))
  const conflictPath = join(conflictDirectory, 'workspace.json')
  try {
    const conflict = legacyState()
    const child = conflict.sections.find((item) => item.id === 'section-child')
    if (!child) throw new Error('冲突验证缺少子章节')
    child.content = '### 1.1 研究背景\n\n这是旧版中独立保存的子章节。'
    child.status = 'draft'
    child.wordCount = 23
    child.version = 9
    child.updatedAt = '2026-08-12T01:00:00.000Z'
    await writeFile(conflictPath, `${JSON.stringify(conflict, null, 2)}\n`, 'utf8')
    const repository = new WorkspaceRepository(conflictPath)
    await repository.initialize()
    const migrated = repository.snapshot()
    assert.equal(
      migrated.sections.find((item) => item.id === 'section-root')?.content,
      rootContent,
      '启动迁移不得用独立子章节覆盖父稿',
    )
    assert.equal(
      migrated.sections.find((item) => item.id === 'section-child')?.derivedFromSectionId,
      undefined,
      '存在内容冲突时不得猜测父子归属',
    )
    const changedRoot = rootContent.replace('这是原始背景内容。', '这是父稿刚刚保存的新内容。')
    await repository.saveSection('section-root', changedRoot)
    const afterSave = repository.snapshot()
    assert.match(
      afterSave.sections.find((item) => item.id === 'section-root')?.content ?? '',
      /这是父稿刚刚保存的新内容/,
    )
    assert.match(
      afterSave.sections.find((item) => item.id === 'section-child')?.content ?? '',
      /这是旧版中独立保存的子章节/,
      '保存父稿不得让其他独立子节反向覆盖或被覆盖',
    )
  } finally {
    await rm(conflictDirectory, { recursive: true, force: true })
  }

  const sourcePath = process.argv[2]
  if (!sourcePath) return
  const sourceBefore = await readFile(sourcePath)
  const sourceState = JSON.parse(sourceBefore.toString('utf8')) as WorkspaceState
  const sourceDirectory = await mkdtemp(join(tmpdir(), 'academic-agent-workspace-copy-'))
  const copiedPath = join(sourceDirectory, 'workspace.json')
  try {
    await writeFile(copiedPath, sourceBefore)
    const copiedRepository = new WorkspaceRepository(copiedPath)
    await copiedRepository.initialize()
    const migrated = copiedRepository.snapshot()
    const previouslyEmpty = new Set(
      sourceState.sections
        .filter((item) => !item.content.trim())
        .map((item) => item.id),
    )
    const recovered = migrated.sections.filter(
      (item) => previouslyEmpty.has(item.id) && item.content.trim() && item.derivedFromSectionId,
    )
    const existingDerived = migrated.sections.filter(
      (item) => item.content.trim() && item.derivedFromSectionId,
    )
    assert.ok(existingDerived.length > 0, '真实工作区副本中没有找到已同步的小节')
    assert.deepEqual(await readFile(sourcePath), sourceBefore, '验证过程不应修改原工作区')
    const detail = recovered.length
      ? `已识别并回填 ${recovered.length} 个二、三级小节`
      : `已确认 ${existingDerived.length} 个二、三级小节保持同步`
    console.log(`真实工作区副本验证通过：${detail}，原文件保持不变。`)
  } finally {
    await rm(sourceDirectory, { recursive: true, force: true })
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
