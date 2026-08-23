import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ProviderProfile, WorkspaceState } from '../../shared/contracts'

const [sourcePath, targetPath, baseUrl] = process.argv.slice(2)
if (!sourcePath || !targetPath || !baseUrl) {
  throw new Error('用法：prepare-section-strategy-workspace.ts <源 workspace> <目标 workspace> <Mock Base URL>')
}

const state = JSON.parse(await readFile(sourcePath, 'utf8')) as WorkspaceState
const project = state.projects.find((item) => (
  item.origin !== 'demo'
  && state.sections.some((section) => section.projectId === item.id && !section.derivedFromSectionId && section.content.trim())
)) ?? state.projects.find((item) => state.sections.some((section) => section.projectId === item.id && section.content.trim()))
if (!project) throw new Error('源工作区没有带正文的项目。')
const section = state.sections.find((item) => (
  item.projectId === project.id && !item.derivedFromSectionId && item.content.trim()
))
if (!section) throw new Error('源工作区没有可重新生成的主稿章节。')
const conversation = state.conversations.find((item) => item.id === project.activeConversationId)
  ?? state.conversations.find((item) => item.projectId === project.id && !item.archived)
if (!conversation) throw new Error('项目没有可用对话。')

const timestamp = new Date().toISOString()
const provider: ProviderProfile = {
  id: 'section-strategy-mock-provider',
  name: '本地策略面板 Mock',
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

section.status = 'draft'
section.generationError = undefined
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
