import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ProviderProfile, WorkspaceState } from '../shared/contracts'

const [sourcePath, targetPath, baseUrl] = process.argv.slice(2)
if (!sourcePath || !targetPath || !baseUrl) {
  throw new Error('用法：prepare-reasoning-workspace.ts <源 workspace> <目标 workspace> <Mock Base URL>')
}

const state = JSON.parse(await readFile(sourcePath, 'utf8')) as WorkspaceState
const project = state.projects.find((item) => item.origin !== 'demo') ?? state.projects[0]
if (!project) throw new Error('源工作区没有项目。')
const conversation = state.conversations.find((item) => item.id === project.activeConversationId) ??
  state.conversations.find((item) => item.projectId === project.id)
if (!conversation) throw new Error('项目没有对话。')

const timestamp = new Date().toISOString()
const provider: ProviderProfile = {
  id: 'reasoning-ui-mock-provider',
  name: '本地推理流 Mock',
  protocol: 'openai-compatible',
  baseUrl,
  models: ['mock-paper-agent'],
  defaultModel: 'mock-paper-agent',
  enabled: true,
  hasCredential: false,
  lastHealth: 'connected',
  origin: 'live',
  verificationStatus: 'unverified',
  createdAt: timestamp,
  updatedAt: timestamp,
}

project.activeConversationId = conversation.id
conversation.messageIds = []
conversation.accessMode = 'ask'
state.messages = state.messages.filter((item) => item.conversationId !== conversation.id)
state.runs = []
state.providers = [provider]
state.settings.activeProjectId = project.id
state.settings.activeProviderId = provider.id
state.settings.activeModel = provider.defaultModel
state.settings.demoMode = false

await mkdir(dirname(targetPath), { recursive: true })
await writeFile(targetPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
process.stdout.write(`${JSON.stringify({ projectId: project.id, conversationId: conversation.id })}\n`)
