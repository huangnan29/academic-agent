import type {
  Artifact,
  ChatStartInput,
  ChatStreamEvent,
  ExportFormat,
  LiteratureRecord,
  LiteratureSearchInput,
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
  SkillDefinition,
  SkillInput,
  WorkspaceState,
} from '../shared/contracts'

declare global {
  interface Window {
    paperAgent: {
      workspace: {
        get(): Promise<WorkspaceState>
        setActiveModel(providerId: string, model: string): Promise<WorkspaceState>
      }
      project: {
        create(input: Project['brief']): Promise<Project>
        setActive(projectId: string): Promise<WorkspaceState>
        delete(projectId: string): Promise<WorkspaceState>
        chooseFolder(): Promise<WorkspaceState>
        revealFolder(projectId: string): Promise<void>
      }
      provider: {
        save(input: ProviderInput): Promise<ProviderProfile>
        delete(providerId: string): Promise<void>
        test(providerId: string): Promise<{ ok: boolean; message: string; models?: string[] }>
      }
      literature: {
        search(input: LiteratureSearchInput): Promise<LiteratureRecord[]>
        toggle(projectId: string, literatureId: string, included: boolean): Promise<LiteratureRecord>
      }
      outline: {
        generate(input: OutlineGenerateInput): Promise<OutlineNode[]>
        save(projectId: string, outline: OutlineNode[]): Promise<OutlineNode[]>
      }
      section: {
        generate(input: SectionGenerateInput): Promise<void>
        save(sectionId: string, content: string): Promise<void>
        setActive(sectionId: string): Promise<WorkspaceState>
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
