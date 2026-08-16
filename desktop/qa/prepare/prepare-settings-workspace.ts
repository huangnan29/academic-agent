import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Conversation, WorkspaceState } from '../../shared/contracts'

const [sourcePath, targetPath] = process.argv.slice(2)
if (!sourcePath || !targetPath) {
  throw new Error('用法：prepare-settings-workspace.ts <源 workspace> <目标 workspace>')
}

const state = JSON.parse(await readFile(sourcePath, 'utf8')) as WorkspaceState
const project = state.projects.find((item) => item.origin !== 'demo') ?? state.projects[0]
if (!project) throw new Error('源工作区没有项目。')
const sourceConversation = state.conversations.find((item) => item.projectId === project.id)
if (!sourceConversation) throw new Error('源工作区没有可用于隔离验收的对话。')

const timestamp = new Date().toISOString()
const archivedConversation: Conversation = {
  ...sourceConversation,
  id: 'settings-qa-archived-conversation',
  title: '设置验收归档对话',
  messageIds: [],
  pinned: false,
  archived: true,
  unread: false,
  createdAt: timestamp,
  updatedAt: timestamp,
}
state.conversations = [
  ...state.conversations.filter((item) => item.id !== archivedConversation.id),
  archivedConversation,
]
state.messages = state.messages.filter((item) => item.conversationId !== archivedConversation.id)
state.attachments = state.attachments.filter((item) => item.conversationId !== archivedConversation.id)
state.runs = []
state.settings.activeProjectId = project.id
state.settings.demoMode = project.origin === 'demo'

await mkdir(dirname(targetPath), { recursive: true })
await writeFile(targetPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
process.stdout.write(`${JSON.stringify({ projectId: project.id, archivedConversationId: archivedConversation.id })}\n`)
