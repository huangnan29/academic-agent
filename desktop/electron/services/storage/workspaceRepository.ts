import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  AgentRun,
  AppearanceSettingsInput,
  Artifact,
  ChatMessage,
  CitationEvidence,
  ConversationAttachment,
  ConversationUpdateInput,
  LiteratureRecord,
  McpServerConfig,
  ManuscriptSection,
  OutlineArchitecture,
  OutlineNode,
  OutlineQualityReport,
  Project,
  ProviderProfile,
  ResearchBrief,
  SidebarPreferencesInput,
  SkillDefinition,
  SkillInput,
  WorkspaceState,
} from '../../../shared/contracts'
import { mergeAppearanceSettings } from '../../../shared/appearance'
import { synchronizeDerivedSections } from '../../../shared/sectionContent'
import {
  backfillHistoricalMessageLiteratureCandidates,
  demoState,
  isSelectableProvider,
  normalizeSectionVersions,
  normalizeState,
  now,
  promoteConvertedDemoProjects,
  promoteProjectToLive,
  synchronizeActiveModelSelection,
  createLiveEntityBase,
} from './workspace-state'
import {
  addConversationAttachments as addConversationAttachmentsInState,
  createConversation as createConversationInState,
  createProject as createProjectInState,
  deleteProject as deleteProjectInState,
  moveConversation as moveConversationInState,
  removeConversationAttachment as removeConversationAttachmentInState,
  setActiveConversation as setActiveConversationInState,
  setActiveProject as setActiveProjectInState,
  setProjectPinned as setProjectPinnedInState,
  setProjectResearchFolder as setProjectResearchFolderInState,
  setResearchRootPath as setResearchRootPathInState,
  setSidebarPreferences as setSidebarPreferencesInState,
  updateConversation as updateConversationInState,
} from './workspace-projects'
import {
  addLiterature as addLiteratureInState,
  addLiteratureFromMessage as addLiteratureFromMessageInState,
  deleteLiterature as deleteLiteratureInState,
  setLiteratureProject as setLiteratureProjectInState,
  toggleLiterature as toggleLiteratureInState,
} from './workspace-literature'
import {
  beginSectionGeneration as beginSectionGenerationInState,
  commitGeneratedOutline as commitGeneratedOutlineInState,
  commitSectionGeneration as commitSectionGenerationInState,
  createSectionsFromOutline as createSectionsFromOutlineInState,
  failSectionGeneration as failSectionGenerationInState,
  saveOutline as saveOutlineInState,
  saveSection as saveSectionInState,
  selectSectionVersion as selectSectionVersionInState,
  setActiveSection as setActiveSectionInState,
  updateSection as updateSectionInState,
} from './workspace-manuscript'

export class WorkspaceRepository {
  private state: WorkspaceState = demoState()
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<WorkspaceState>
      this.state = normalizeState(parsed)
      let changed = JSON.stringify(parsed) !== JSON.stringify(this.state)
      changed = synchronizeActiveModelSelection(this.state) || changed
      changed = promoteConvertedDemoProjects(this.state) || changed
      // 兼容旧版本：父章节已经包含子标题时，只回填对应的空白子章节。
      changed = synchronizeDerivedSections(this.state) || changed
      normalizeSectionVersions(this.state)
      changed = backfillHistoricalMessageLiteratureCandidates(this.state) || changed
      for (const run of this.state.runs) {
        if (run.status !== 'queued' && run.status !== 'running') continue
        run.status = 'cancelled'
        run.error = run.error ?? '上次会话已结束，未完成任务已停止。'
        run.updatedAt = now()
        for (const step of run.steps) {
          if (step.status !== 'running') continue
          step.status = 'stopped'
          step.completedAt = now()
        }
        changed = true
      }
      if (changed) await this.persist()
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
      this.state = demoState()
      await this.persist()
    }
  }

  snapshot(): WorkspaceState {
    return structuredClone(this.state)
  }

  private async persist(): Promise<void> {
    const serialized = `${JSON.stringify(this.state, null, 2)}\n`
    const temporary = `${this.filePath}.tmp`
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      await writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, this.filePath)
    })
    await this.writeQueue
  }

  private async mutate<T>(operation: (state: WorkspaceState) => T): Promise<T> {
    const result = operation(this.state)
    await this.persist()
    return structuredClone(result)
  }

  async createProject(brief: ResearchBrief): Promise<Project> {
    return this.mutate((state) => createProjectInState(state, brief))
  }

  async setActiveProject(projectId: string): Promise<WorkspaceState> {
    return this.mutate((state) => setActiveProjectInState(state, projectId))
  }

  async setProjectPinned(projectId: string, pinned: boolean): Promise<WorkspaceState> {
    return this.mutate((state) => setProjectPinnedInState(state, projectId, pinned))
  }

  async createConversation(projectId: string): Promise<WorkspaceState> {
    return this.mutate((state) => createConversationInState(state, projectId))
  }

  async setActiveConversation(projectId: string, conversationId: string): Promise<WorkspaceState> {
    return this.mutate((state) => setActiveConversationInState(state, projectId, conversationId))
  }

  async updateConversation(input: ConversationUpdateInput): Promise<WorkspaceState> {
    return this.mutate((state) => updateConversationInState(state, input))
  }

  async moveConversation(conversationId: string, targetProjectId: string): Promise<WorkspaceState> {
    return this.mutate((state) => moveConversationInState(state, conversationId, targetProjectId))
  }

  async setSidebarPreferences(input: SidebarPreferencesInput): Promise<WorkspaceState> {
    return this.mutate((state) => setSidebarPreferencesInState(state, input))
  }

  async setAppearance(input: AppearanceSettingsInput): Promise<WorkspaceState> {
    return this.mutate((state) => {
      state.settings.appearance = mergeAppearanceSettings(state.settings.appearance, input)
      return state
    })
  }

  async deleteProject(projectId: string): Promise<WorkspaceState> {
    return this.mutate((state) => deleteProjectInState(state, projectId))
  }

  async setProjectResearchFolder(projectId: string, folderPath: string): Promise<WorkspaceState> {
    return this.mutate((state) => setProjectResearchFolderInState(state, projectId, folderPath))
  }

  async addConversationAttachments(conversationId: string, attachments: ConversationAttachment[]): Promise<WorkspaceState> {
    return this.mutate((state) => addConversationAttachmentsInState(state, conversationId, attachments))
  }

  async removeConversationAttachment(attachmentId: string): Promise<WorkspaceState> {
    return this.mutate((state) => removeConversationAttachmentInState(state, attachmentId))
  }

  async setResearchRootPath(folderPath: string): Promise<WorkspaceState> {
    return this.mutate((state) => setResearchRootPathInState(state, folderPath))
  }

  async setActiveModel(providerId: string, model: string): Promise<WorkspaceState> {
    return this.mutate((state) => {
      const provider = state.providers.find(
        (item) => item.id === providerId && isSelectableProvider(item),
      )
      if (!provider) throw new Error('所选模型提供商尚未连接或已被停用。')
      if (!provider.models.includes(model)) throw new Error('所选模型不属于该提供商。')
      state.settings.activeProviderId = provider.id
      state.settings.activeModel = model
      return state
    })
  }

  async saveProvider(profile: ProviderProfile): Promise<ProviderProfile> {
    return this.mutate((state) => {
      const index = state.providers.findIndex((item) => item.id === profile.id)
      if (index >= 0) state.providers[index] = profile
      else state.providers.push(profile)
      synchronizeActiveModelSelection(state)
      return profile
    })
  }

  async deleteProvider(providerId: string): Promise<void> {
    await this.mutate((state) => {
      state.providers = state.providers.filter((item) => item.id !== providerId)
      synchronizeActiveModelSelection(state)
    })
  }

  async updateProviderHealth(
    providerId: string,
    health: ProviderProfile['lastHealth'],
    error?: string,
    models?: string[],
  ): Promise<ProviderProfile> {
    return this.mutate((state) => {
      const provider = state.providers.find((item) => item.id === providerId)
      if (!provider) throw new Error('模型提供商不存在。')
      provider.lastHealth = health
      provider.lastError = error
      if (models?.length) provider.models = [...new Set(models)]
      provider.updatedAt = now()
      synchronizeActiveModelSelection(state)
      return provider
    })
  }

  getProvider(providerId: string): ProviderProfile | undefined {
    const provider = this.state.providers.find((item) => item.id === providerId)
    return provider ? structuredClone(provider) : undefined
  }

  /** 用户明确调用真实模型后，将内置演示研究升级为可继续使用的正式研究。 */
  async promoteProjectForProvider(projectId: string, providerId: string): Promise<void> {
    const project = this.state.projects.find((item) => item.id === projectId)
    const provider = this.state.providers.find((item) => item.id === providerId)
    if (!project || !provider) throw new Error('项目或模型提供商不存在。')
    if (project.origin !== 'demo' || provider.origin === 'demo') return
    await this.mutate((state) => {
      promoteProjectToLive(state, projectId)
    })
  }

  async addLiterature(records: LiteratureRecord[], projectId?: string): Promise<LiteratureRecord[]> {
    return this.mutate((state) => addLiteratureInState(state, records, projectId))
  }

  async addLiteratureFromMessage(messageId: string, candidateIds: string[]): Promise<LiteratureRecord[]> {
    return this.mutate((state) => addLiteratureFromMessageInState(state, messageId, candidateIds))
  }

  async toggleLiterature(projectId: string, literatureId: string, included: boolean): Promise<LiteratureRecord> {
    return this.mutate((state) => toggleLiteratureInState(state, projectId, literatureId, included))
  }

  async setLiteratureProject(literatureId: string, sourceProjectId?: string | null, targetProjectId?: string): Promise<LiteratureRecord> {
    return this.mutate((state) => setLiteratureProjectInState(state, literatureId, sourceProjectId, targetProjectId))
  }

  async deleteLiterature(literatureId: string, sourceProjectId?: string | null): Promise<void> {
    return this.mutate((state) => deleteLiteratureInState(state, literatureId, sourceProjectId))
  }

  async saveOutline(projectId: string, outline: OutlineNode[], architecture?: OutlineArchitecture, qualityReport?: OutlineQualityReport): Promise<OutlineNode[]> {
    return this.mutate((state) => saveOutlineInState(state, projectId, outline, architecture, qualityReport))
  }

  async commitGeneratedOutline(projectId: string, outline: OutlineNode[], architecture: OutlineArchitecture, qualityReport: OutlineQualityReport): Promise<OutlineNode[]> {
    return this.mutate((state) => commitGeneratedOutlineInState(state, projectId, outline, architecture, qualityReport))
  }

  async createSectionsFromOutline(projectId: string, outline: OutlineNode[]): Promise<ManuscriptSection[]> {
    return this.mutate((state) => createSectionsFromOutlineInState(state, projectId, outline))
  }

  async saveSection(sectionId: string, content: string): Promise<ManuscriptSection> {
    return this.mutate((state) => saveSectionInState(state, sectionId, content))
  }

  async beginSectionGeneration(sectionId: string, metadata: Pick<ManuscriptSection, "generationProviderId" | "generationModel" | "thinkingRequested">): Promise<{ section: ManuscriptSection; baseVersion: number }> {
    return this.mutate((state) => beginSectionGenerationInState(state, sectionId, metadata))
  }

  async commitSectionGeneration(sectionId: string, expectedVersion: number, content: string, metadata: Pick<ManuscriptSection, "reasoningContent" | "generationProviderId" | "generationModel" | "thinkingRequested"> & { source: "generated" | "partial"; generationError?: string }): Promise<ManuscriptSection> {
    return this.mutate((state) => commitSectionGenerationInState(state, sectionId, expectedVersion, content, metadata))
  }

  async failSectionGeneration(sectionId: string, expectedVersion: number, patch: Pick<ManuscriptSection, "reasoningContent" | "generationProviderId" | "generationModel" | "thinkingRequested" | "generationError">): Promise<ManuscriptSection> {
    return this.mutate((state) => failSectionGenerationInState(state, sectionId, expectedVersion, patch))
  }

  async selectSectionVersion(sectionId: string, versionId: string): Promise<ManuscriptSection> {
    return this.mutate((state) => selectSectionVersionInState(state, sectionId, versionId))
  }

  async setActiveSection(sectionId: string): Promise<WorkspaceState> {
    return this.mutate((state) => setActiveSectionInState(state, sectionId))
  }

  async updateSection(sectionId: string, patch: Partial<ManuscriptSection>): Promise<ManuscriptSection> {
    return this.mutate((state) => updateSectionInState(state, sectionId, patch))
  }

  async appendMessage(message: ChatMessage): Promise<ChatMessage> {
    return this.mutate((state) => {
      const conversation = state.conversations.find(
        (item) => item.id === message.conversationId && item.projectId === message.projectId,
      )
      if (!conversation || !state.projects.some((project) => project.id === message.projectId)) {
        throw new Error('对话不存在或不属于当前项目。')
      }
      state.messages.push(message)
      conversation.messageIds.push(message.id)
      const timestamp = now()
      if (
        message.role === 'user' &&
        conversation.messageIds.length === 1 &&
        /^(新的研究任务|新对话(?:\s+\d+)?)$/.test(conversation.title)
      ) {
        conversation.title = message.content.trim().replace(/\s+/g, ' ').slice(0, 42) || conversation.title
      }
      conversation.updatedAt = timestamp
      const project = state.projects.find((item) => item.id === message.projectId)
      if (project) project.updatedAt = timestamp
      return message
    })
  }

  async updateMessage(messageId: string, patch: Partial<ChatMessage>): Promise<ChatMessage> {
    return this.mutate((state) => {
      const message = state.messages.find((item) => item.id === messageId)
      if (!message) throw new Error('消息不存在。')
      Object.assign(message, patch, { updatedAt: now() })
      return message
    })
  }

  async saveRun(run: AgentRun): Promise<AgentRun> {
    return this.mutate((state) => {
      if (!state.projects.some((project) => project.id === run.projectId)) {
        throw new Error('运行任务对应的项目不存在。')
      }
      const index = state.runs.findIndex((item) => item.id === run.id)
      if (index >= 0) state.runs[index] = run
      else state.runs.push(run)
      return run
    })
  }

  async updateRun(runId: string, patch: Partial<AgentRun>): Promise<AgentRun> {
    return this.mutate((state) => {
      const run = state.runs.find((item) => item.id === runId)
      if (!run) throw new Error('运行任务不存在。')
      Object.assign(run, patch, { id: run.id, projectId: run.projectId, updatedAt: now() })
      return run
    })
  }

  async replaceSectionCitations(
    sectionId: string,
    citations: CitationEvidence[],
  ): Promise<CitationEvidence[]> {
    return this.mutate((state) => {
      const section = state.sections.find((item) => item.id === sectionId)
      if (!section) throw new Error('论文章节不存在。')
      if (citations.some((item) => item.sectionId !== sectionId || item.projectId !== section.projectId)) {
        throw new Error('引用证据不属于当前章节。')
      }
      state.citations = [
        ...state.citations.filter((item) => item.sectionId !== sectionId),
        ...citations,
      ]
      return citations
    })
  }

  async saveMcpServer(server: McpServerConfig): Promise<McpServerConfig> {
    return this.mutate((state) => {
      const index = state.mcpServers.findIndex((item) => item.id === server.id)
      if (index >= 0) state.mcpServers[index] = server
      else state.mcpServers.push(server)
      return server
    })
  }

  async deleteMcpServer(serverId: string): Promise<void> {
    await this.mutate((state) => {
      state.mcpServers = state.mcpServers.filter((item) => item.id !== serverId)
    })
  }

  getMcpServer(serverId: string): McpServerConfig | undefined {
    const server = this.state.mcpServers.find((item) => item.id === serverId)
    return server ? structuredClone(server) : undefined
  }

  async saveSkill(input: SkillInput): Promise<SkillDefinition> {
    return this.mutate((state) => {
      const timestamp = now()
      const existing = input.id
        ? state.skills.find((item) => item.id === input.id)
        : undefined
      if (input.id && !existing) throw new Error('Skill 不存在或已经被移除。')

      const skill: SkillDefinition = {
        id: existing?.id ?? randomUUID(),
        name: input.name.trim(),
        description: input.description.trim(),
        instructions: input.instructions.trim(),
        enabled: input.enabled,
        origin: 'live',
        verificationStatus: 'unverified',
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      }
      const index = state.skills.findIndex((item) => item.id === skill.id)
      if (index >= 0) state.skills[index] = skill
      else state.skills.push(skill)
      return skill
    })
  }

  async deleteSkill(skillId: string): Promise<void> {
    await this.mutate((state) => {
      if (!state.skills.some((item) => item.id === skillId)) {
        throw new Error('Skill 不存在或已经被移除。')
      }
      state.skills = state.skills.filter((item) => item.id !== skillId)
    })
  }

  async saveArtifact(artifact: Artifact): Promise<Artifact> {
    return this.mutate((state) => {
      if (!state.projects.some((project) => project.id === artifact.projectId)) {
        throw new Error('导出产物对应的项目不存在。')
      }
      state.artifacts.unshift(artifact)
      return artifact
    })
  }
}

export { createLiveEntityBase }
