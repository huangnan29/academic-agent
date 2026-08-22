import type {
  AppearanceSettings,
  McpResourceReadResult,
  McpServerConfig,
  McpToolCallResult,
} from '../../../shared/contracts'
import type { WorkspaceRepository } from '../../services/storage/workspaceRepository'
import type { ChatCoordinator } from '../chatCoordinator'
import type { ConfigurationService } from '../configuration'
import type { ExportCoordinator } from '../exportCoordinator'
import type { LiteratureService } from '../../services/literature'
import type { PaperCoordinator } from '../paperCoordinator'
import type { SystemPermissionService } from '../systemPermissions'
import type { VoiceInputService } from '../voiceInput'

export interface McpTestResult {
  tools: McpServerConfig['tools']
  resources: McpServerConfig['resources']
}

export interface IpcDependencies {
  rendererWebContentsId: number
  repository: WorkspaceRepository
  configuration: ConfigurationService
  chat: ChatCoordinator
  paper: PaperCoordinator
  exporter: ExportCoordinator
  literature: LiteratureService
  systemPermissions: SystemPermissionService
  voiceInput: VoiceInputService
  applyAppearance(appearance: AppearanceSettings): void | Promise<void>
  testMcp(server: McpServerConfig): Promise<McpTestResult>
  callMcpTool(
    server: McpServerConfig,
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<McpToolCallResult>
  readMcpResource(server: McpServerConfig, uri: string): Promise<McpResourceReadResult>
  disconnectMcp(serverId: string): Promise<void>
}

export type IpcHandler = (
  event: Electron.IpcMainInvokeEvent,
  ...args: unknown[]
) => unknown

export type RegisterIpcHandler = (channel: string, listener: IpcHandler) => void
