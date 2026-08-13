import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ProviderProfile, WorkspaceState } from '../shared/contracts'

const [sourcePath, targetPath, baseUrl] = process.argv.slice(2)
if (!sourcePath || !targetPath || !baseUrl) {
  throw new Error('用法：prepare-section-stream-workspace.ts <源 workspace> <目标 workspace> <Mock Base URL>')
}

const state = JSON.parse(await readFile(sourcePath, 'utf8')) as WorkspaceState
const project = state.projects.find((item) => item.origin !== 'demo') ?? state.projects[0]
if (!project) throw new Error('源工作区没有项目。')
const section = state.sections.find((item) => item.projectId === project.id && !item.derivedFromSectionId) ??
  state.sections.find((item) => item.projectId === project.id)
if (!section) throw new Error('源工作区没有可用于流式验收的章节。')
const conversation = state.conversations.find((item) => item.id === project.activeConversationId) ??
  state.conversations.find((item) => item.projectId === project.id && !item.archived)
if (!conversation) throw new Error('项目没有可用于对话跳转验收的对话。')

const timestamp = new Date().toISOString()
const provider: ProviderProfile = {
  id: 'section-stream-mock-provider',
  name: '本地章节流 Mock',
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

section.content = ''
section.status = 'pending'
section.wordCount = 0
section.reasoningContent = undefined
section.thinkingRequested = undefined
section.generationError = undefined
section.generationProviderId = undefined
section.generationModel = undefined
section.updatedAt = timestamp
project.activeSectionId = section.id
project.activeConversationId = conversation.id
state.providers = [provider]
state.runs = []
state.settings.activeProjectId = project.id
state.settings.activeProviderId = provider.id
state.settings.activeModel = provider.defaultModel
state.settings.demoMode = false

await mkdir(dirname(targetPath), { recursive: true })
await writeFile(targetPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
process.stdout.write(`${JSON.stringify({ projectId: project.id, sectionId: section.id, conversationId: conversation.id })}\n`)
