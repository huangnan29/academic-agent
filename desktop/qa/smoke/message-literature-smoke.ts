import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentRun, ChatMessage } from '../../shared/contracts'
import {
  createLiveEntityBase,
  WorkspaceRepository,
} from '../../electron/services/storage/workspaceRepository'

const temporaryRoot = await mkdtemp(join(tmpdir(), 'academic-agent-message-literature-'))
const workspacePath = join(temporaryRoot, 'workspace.json')

try {
  const repository = new WorkspaceRepository(workspacePath)
  await repository.initialize()
  const project = await repository.createProject({
    title: '消息文献添加验收',
    paperType: '课程论文',
    discipline: '教育技术',
    language: 'zh-CN',
    targetWords: 5_000,
    requirements: '验证真实 MCP 候选只能从对应消息加入右侧文献栏。',
    keywords: ['生成式人工智能', '教育'],
  })
  const firstCandidateId = randomUUID()
  const secondCandidateId = randomUUID()
  const message: ChatMessage = {
    ...createLiveEntityBase(),
    id: randomUUID(),
    projectId: project.id,
    conversationId: project.activeConversationId,
    role: 'assistant',
    content: '真实 MCP 检索完成。',
    status: 'completed',
    literatureCandidates: [
      {
        id: firstCandidateId,
        title: 'Generative Artificial Intelligence in Higher Education',
        authors: ['Researcher A'],
        year: 2025,
        venue: 'arXiv',
        url: 'https://arxiv.org/abs/2501.00001',
        source: 'mcp',
      },
      {
        id: secondCandidateId,
        title: 'Teaching with Large Language Models',
        authors: ['Researcher B'],
        year: 2024,
        venue: 'arXiv',
        url: 'https://arxiv.org/abs/2401.00002',
        source: 'mcp',
      },
    ],
  }
  await repository.appendMessage(message)

  const [first] = await repository.addLiteratureFromMessage(message.id, [firstCandidateId])
  assert.equal(first.projectId, project.id)
  assert.equal(first.title, message.literatureCandidates?.[0].title)
  assert.equal(first.included, false)
  assert.equal(first.verificationStatus, 'unverified')

  const [duplicate] = await repository.addLiteratureFromMessage(message.id, [firstCandidateId])
  assert.equal(duplicate.id, first.id, '重复添加应返回原记录而不是复制一份')
  assert.equal(repository.snapshot().literature.filter((item) => item.id === first.id).length, 1)

  const batch = await repository.addLiteratureFromMessage(message.id, [firstCandidateId, secondCandidateId])
  assert.equal(batch.length, 2)
  assert.equal(repository.snapshot().literature.filter((item) => item.projectId === project.id).length, 2)

  await assert.rejects(
    repository.addLiteratureFromMessage(message.id, [randomUUID()]),
    /不属于这条消息/,
  )

  const historicalRunId = randomUUID()
  const historicalStepId = randomUUID()
  const historicalRun: AgentRun = {
    ...createLiveEntityBase(),
    id: historicalRunId,
    projectId: project.id,
    kind: 'chat',
    status: 'completed',
    steps: [{
      id: historicalStepId,
      label: 'arXiv 检索',
      detail: '已返回真实结构化结果',
      status: 'completed',
      completedAt: new Date().toISOString(),
      evidence: {
        kind: 'mcp-tool',
        serverId: 'arxiv-mcp',
        toolName: 'search_papers',
        argumentsJson: '{"query":"generative artificial intelligence education"}',
        resultJson: JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              papers: [{
                id: '2506.22231v1',
                resource_uri: 'arxiv://2506.22231v1',
                title: 'Adapting University Policies for Generative AI',
                authors: ['Researcher C'],
                published: '2025-06-27',
                url: 'https://arxiv.org/pdf/2506.22231v1.pdf',
              }],
            }),
          }],
          isError: false,
        }),
        resultSha256: 'fixture-sha256',
        truncated: false,
      },
    }],
  }
  await repository.saveRun(historicalRun)
  const historicalMessage: ChatMessage = {
    ...createLiveEntityBase(),
    id: randomUUID(),
    projectId: project.id,
    conversationId: project.activeConversationId,
    role: 'assistant',
    content: '沿用此前检索结果：【文献:2506.22231】；占位内容【文献:arXiv编号】不得生成候选。',
    status: 'completed',
  }
  await repository.appendMessage(historicalMessage)

  const reopened = new WorkspaceRepository(workspacePath)
  await reopened.initialize()
  assert.equal(reopened.snapshot().literature.filter((item) => item.projectId === project.id).length, 2)
  assert.equal(reopened.snapshot().messages.find((item) => item.id === message.id)?.literatureCandidates?.length, 2)
  const migrated = reopened.snapshot().messages.find((item) => item.id === historicalMessage.id)
  assert.equal(migrated?.literatureCandidates?.length, 1)
  assert.equal(migrated?.literatureCandidates?.[0].referenceIds?.includes('2506.22231'), true)
  assert.equal(migrated?.literatureCandidates?.[0].provenance?.runId, historicalRunId)

  console.log(JSON.stringify({
    ok: true,
    projectId: project.id,
    messageId: message.id,
    candidateCount: message.literatureCandidates.length,
    storedLiteratureCount: 2,
    duplicatePrevented: true,
    forgedCandidateRejected: true,
    restartPersistence: true,
    historicalEvidenceBackfill: true,
    placeholderRejected: true,
  }, null, 2))
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
