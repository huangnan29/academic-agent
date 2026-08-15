import type {
  AppearanceSettingsInput,
  Artifact,
  ChatStartInput,
  ChatStreamEvent,
  ConversationUpdateInput,
  ExportFormat,
  LiteratureRecord,
  LiteratureAddFromMessageInput,
  LiteratureDeleteInput,
  LiteratureSetProjectInput,
  LiteratureSearchInput,
  ManuscriptSection,
  McpServerConfig,
  McpServerInput,
  McpResourceReadResult,
  McpToolCallResult,
  OutlineGenerateInput,
  OutlineNode,
  Project,
  ProviderInput,
  ProviderProfile,
  SectionGenerateInput,
  SectionStreamEvent,
  SidebarPreferencesInput,
  SkillDefinition,
  SkillInput,
  SystemPermissionKind,
  SystemPermissionSnapshot,
  WorkspaceState,
  VoiceInputEvent,
  VoiceInputStartResult,
  VoiceRecognitionStatus,
} from '../shared/contracts'

declare global {
  interface Window {
    paperAgent: {
      workspace: {
        get(): Promise<WorkspaceState>
        setActiveModel(providerId: string, model: string): Promise<WorkspaceState>
        setSidebarPreferences(input: SidebarPreferencesInput): Promise<WorkspaceState>
      }
      appearance: {
        update(input: AppearanceSettingsInput): Promise<WorkspaceState>
        importTheme(): Promise<WorkspaceState>
        /** 返回值就是已经写入系统剪贴板的版本化 JSON。 */
        copyTheme(): Promise<string>
      }
      project: {
        create(input: Project['brief']): Promise<Project>
        setActive(projectId: string): Promise<WorkspaceState>
        setPinned(projectId: string, pinned: boolean): Promise<WorkspaceState>
        delete(projectId: string): Promise<WorkspaceState>
        chooseFolder(): Promise<WorkspaceState>
        revealFolder(projectId: string): Promise<void>
      }
      conversation: {
        create(projectId: string): Promise<WorkspaceState>
        setActive(projectId: string, conversationId: string): Promise<WorkspaceState>
        update(input: ConversationUpdateInput): Promise<WorkspaceState>
        move(conversationId: string, targetProjectId: string): Promise<WorkspaceState>
        copyId(conversationId: string): Promise<void>
        chooseAttachments(conversationId: string): Promise<WorkspaceState>
        removeAttachment(attachmentId: string): Promise<WorkspaceState>
      }
      systemPermissions: {
        get(): Promise<SystemPermissionSnapshot>
        requestFullAccess(): Promise<SystemPermissionSnapshot>
        requestMicrophone(): Promise<SystemPermissionSnapshot>
        openSettings(kind: SystemPermissionKind): Promise<void>
      }
      voice: {
        status(): Promise<VoiceRecognitionStatus>
        start(): Promise<VoiceInputStartResult>
        stop(sessionId: string): Promise<void>
        onEvent(listener: (event: VoiceInputEvent) => void): () => void
      }
      provider: {
        save(input: ProviderInput): Promise<ProviderProfile>
        delete(providerId: string): Promise<void>
        test(providerId: string): Promise<{ ok: boolean; message: string; models?: string[] }>
      }
      literature: {
        search(input: LiteratureSearchInput): Promise<LiteratureRecord[]>
        toggle(projectId: string, literatureId: string, included: boolean): Promise<LiteratureRecord>
        setProject(input: LiteratureSetProjectInput): Promise<LiteratureRecord>
        delete(input: LiteratureDeleteInput): Promise<void>
        addFromMessage(input: LiteratureAddFromMessageInput): Promise<LiteratureRecord[]>
      }
      outline: {
        generate(input: OutlineGenerateInput): Promise<OutlineNode[]>
        save(projectId: string, outline: OutlineNode[]): Promise<OutlineNode[]>
      }
      section: {
        generate(input: SectionGenerateInput): Promise<void>
        save(sectionId: string, content: string): Promise<void>
        setActive(sectionId: string): Promise<WorkspaceState>
        selectVersion(sectionId: string, versionId: string): Promise<ManuscriptSection>
        onEvent(listener: (event: SectionStreamEvent) => void): () => void
      }
      chat: {
        start(input: ChatStartInput): Promise<{ runId: string }>
        cancel(runId: string): Promise<void>
        onEvent(listener: (event: ChatStreamEvent) => void): () => void
      }
      mcp: {
        save(input: McpServerInput): Promise<McpServerConfig>
        delete(serverId: string): Promise<void>
        test(serverId: string): Promise<McpServerConfig>
        callTool(serverId: string, name: string, args: Record<string, unknown>): Promise<McpToolCallResult>
        readResource(serverId: string, uri: string): Promise<McpResourceReadResult>
      }
      skill: {
        save(input: SkillInput): Promise<SkillDefinition>
        delete(skillId: string): Promise<void>
      }
      export: {
        project(projectId: string, format: ExportFormat): Promise<Artifact | null>
        reveal(path: string): Promise<void>
      }
      external: {
        open(url: string): Promise<void>
      }
      app: {
        info(): Promise<{ version: string; platform: string; packaged: boolean }>
      }
    }
  }
}

export {}
