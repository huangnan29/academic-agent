import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../../shared/ipc'
import type {
  ChatStartInput,
  ChatStreamEvent,
  ExportFormat,
  LiteratureSearchInput,
  McpServerInput,
  OutlineGenerateInput,
  OutlineNode,
  ProviderInput,
  ResearchBrief,
  SectionGenerateInput,
  SidebarPreferencesInput,
  SkillInput,
} from '../../shared/contracts'

const api = {
  workspace: {
    get: () => ipcRenderer.invoke(IPC.workspaceGet),
    setActiveModel: (providerId: string, model: string) =>
      ipcRenderer.invoke(IPC.workspaceSetActiveModel, providerId, model),
    setSidebarPreferences: (input: SidebarPreferencesInput) =>
      ipcRenderer.invoke(IPC.workspaceSetSidebarPreferences, input),
  },
  project: {
    create: (input: ResearchBrief) => ipcRenderer.invoke(IPC.projectCreate, input),
    setActive: (projectId: string) => ipcRenderer.invoke(IPC.projectSetActive, projectId),
    setPinned: (projectId: string, pinned: boolean) =>
      ipcRenderer.invoke(IPC.projectSetPinned, projectId, pinned),
    delete: (projectId: string) => ipcRenderer.invoke(IPC.projectDelete, projectId),
    chooseFolder: () => ipcRenderer.invoke(IPC.projectChooseFolder),
    revealFolder: (projectId: string) => ipcRenderer.invoke(IPC.projectRevealFolder, projectId),
  },
  conversation: {
    create: (projectId: string) => ipcRenderer.invoke(IPC.conversationCreate, projectId),
    setActive: (projectId: string, conversationId: string) =>
      ipcRenderer.invoke(IPC.conversationSetActive, projectId, conversationId),
  },
  provider: {
    save: (input: ProviderInput) => ipcRenderer.invoke(IPC.providerSave, input),
    delete: (providerId: string) => ipcRenderer.invoke(IPC.providerDelete, providerId),
    test: (providerId: string) => ipcRenderer.invoke(IPC.providerTest, providerId),
  },
  literature: {
    search: (input: LiteratureSearchInput) => ipcRenderer.invoke(IPC.literatureSearch, input),
    toggle: (projectId: string, literatureId: string, included: boolean) =>
      ipcRenderer.invoke(IPC.literatureToggle, projectId, literatureId, included),
  },
  outline: {
    generate: (input: OutlineGenerateInput) => ipcRenderer.invoke(IPC.outlineGenerate, input),
    save: (projectId: string, outline: OutlineNode[]) =>
      ipcRenderer.invoke(IPC.outlineSave, projectId, outline),
  },
  section: {
    generate: (input: SectionGenerateInput) => ipcRenderer.invoke(IPC.sectionGenerate, input),
    save: (sectionId: string, content: string) =>
      ipcRenderer.invoke(IPC.sectionSave, sectionId, content),
    setActive: (sectionId: string) => ipcRenderer.invoke(IPC.sectionSetActive, sectionId),
  },
  chat: {
    start: (input: ChatStartInput) => ipcRenderer.invoke(IPC.chatStart, input),
    cancel: (runId: string) => ipcRenderer.invoke(IPC.chatCancel, runId),
    onEvent: (listener: (event: ChatStreamEvent) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: ChatStreamEvent) => listener(payload)
      ipcRenderer.on(IPC.chatEvent, wrapped)
      return () => ipcRenderer.removeListener(IPC.chatEvent, wrapped)
    },
  },
  mcp: {
    save: (input: McpServerInput) => ipcRenderer.invoke(IPC.mcpSave, input),
    delete: (serverId: string) => ipcRenderer.invoke(IPC.mcpDelete, serverId),
    test: (serverId: string) => ipcRenderer.invoke(IPC.mcpTest, serverId),
    callTool: (serverId: string, name: string, args: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC.mcpCallTool, serverId, name, args),
    readResource: (serverId: string, uri: string) =>
      ipcRenderer.invoke(IPC.mcpReadResource, serverId, uri),
  },
  skill: {
    save: (input: SkillInput) => ipcRenderer.invoke(IPC.skillSave, input),
    delete: (skillId: string) => ipcRenderer.invoke(IPC.skillDelete, skillId),
  },
  export: {
    project: (projectId: string, format: ExportFormat) =>
      ipcRenderer.invoke(IPC.exportProject, projectId, format),
    reveal: (path: string) => ipcRenderer.invoke(IPC.artifactReveal, path),
  },
  external: {
    open: (url: string) => ipcRenderer.invoke(IPC.externalOpen, url),
  },
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
  },
}

contextBridge.exposeInMainWorld('paperAgent', api)
