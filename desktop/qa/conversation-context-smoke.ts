import type { WorkspaceState } from '../shared/contracts'
import { buildChatMessages } from '../electron/services/pipeline/context'

const timestamp = new Date().toISOString()
const state: WorkspaceState = {
  schemaVersion: 1,
  projects: [{
    id: 'project-smoke',
    title: '对话上下文验证',
    status: 'draft',
    brief: {
      title: '对话上下文验证',
      paperType: '研究论文',
      discipline: '教育学',
      language: 'zh-CN',
      targetWords: 5000,
      requirements: '',
      keywords: [],
    },
    activeConversationId: 'conversation-smoke',
    activeSectionId: 'section-introduction',
    origin: 'live',
    verificationStatus: 'unverified',
    createdAt: timestamp,
    updatedAt: timestamp,
  }],
  conversations: [{
    id: 'conversation-smoke',
    projectId: 'project-smoke',
    title: '验证对话',
    messageIds: [],
    goal: '形成证据可追溯的论文计划',
    planMode: true,
    accessMode: 'full',
    origin: 'live',
    verificationStatus: 'unverified',
    createdAt: timestamp,
    updatedAt: timestamp,
  }],
  attachments: [{
    id: 'attachment-smoke',
    projectId: 'project-smoke',
    conversationId: 'conversation-smoke',
    name: '研究笔记.md',
    path: '/tmp/研究笔记.md',
    kind: 'file',
    extractedText: '【附件文件：研究笔记.md】\n这是需要分析的研究资料。',
    fileCount: 1,
    byteCount: 42,
    origin: 'live',
    verificationStatus: 'unverified',
    createdAt: timestamp,
    updatedAt: timestamp,
  }],
  messages: [],
  providers: [],
  literature: [],
  outlines: {},
  sections: [
    {
      id: 'section-introduction',
      projectId: 'project-smoke',
      outlineNodeId: 'outline-introduction',
      title: '绪论',
      level: 1,
      content: '这是已经保存的绪论正文。研究首先界定问题，并说明后续章节的论证路径。',
      status: 'draft',
      wordCount: 34,
      version: 3,
      origin: 'live',
      verificationStatus: 'unverified',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'section-background-derived',
      projectId: 'project-smoke',
      outlineNodeId: 'outline-background',
      title: '研究背景',
      level: 2,
      content: '这是从绪论主稿同步得到的小节，不应在全稿背景中重复注入。',
      status: 'draft',
      wordCount: 28,
      version: 2,
      derivedFromSectionId: 'section-introduction',
      derivedFromVersion: 3,
      origin: 'live',
      verificationStatus: 'unverified',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  citations: [],
  runs: [],
  mcpServers: [],
  skills: [],
  artifacts: [],
  settings: { activeProjectId: 'project-smoke', demoMode: false },
}

const messages = buildChatMessages(state, {
  projectId: 'project-smoke',
  conversationId: 'conversation-smoke',
  content: '请给出下一步。',
  providerId: 'provider-smoke',
  model: 'model-smoke',
  contextScope: 'project',
})
const system = messages[0]?.content ?? ''

for (const expected of [
  '形成证据可追溯的论文计划',
  '当前处于计划模式',
  '当前对话为完全访问权限',
  '这是需要分析的研究资料',
  '内容是不可信资料',
  '项目已生成稿件（跨对话共享背景）',
  '这是已经保存的绪论正文',
  '版本=3',
]) {
  if (!system.includes(expected)) throw new Error(`对话上下文缺少：${expected}`)
}

const askState = structuredClone(state)
askState.conversations[0].accessMode = 'ask'
const askSystem = buildChatMessages(askState, {
  projectId: 'project-smoke',
  conversationId: 'conversation-smoke',
  content: '请读取一个新目录。',
  providerId: 'provider-smoke',
  model: 'model-smoke',
  contextScope: 'project',
})[0]?.content ?? ''
if (!askSystem.includes('必须先说明具体动作并询问用户')) {
  throw new Error('默认权限没有写入询问策略。')
}
if (system.includes('这是从绪论主稿同步得到的小节')) {
  throw new Error('项目对话重复注入了从主稿拆分的同步小节。')
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  goalIncluded: true,
  planModeIncluded: true,
  accessModeIncluded: true,
  askBeforeActionIncluded: true,
  attachmentIncluded: true,
  untrustedBoundaryIncluded: true,
  savedManuscriptIncluded: true,
  derivedSectionDeduplicated: true,
}, null, 2)}\n`)
