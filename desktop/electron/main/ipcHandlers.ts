import {
  registerChatHandlers,
} from './ipc/chat'
import { registerConversationHandlers } from './ipc/conversation'
import { registerExportHandlers } from './ipc/export'
import { registerLiteratureHandlers } from './ipc/literature'
import { registerMcpHandlers } from './ipc/mcp'
import { registerManuscriptHandlers } from './ipc/manuscript'
import { registerProjectHandlers } from './ipc/project'
import { registerProviderHandlers } from './ipc/provider'
import { registerSettingsHandlers } from './ipc/settings'
import { registerSkillHandlers } from './ipc/skills'
import { setTrustedRendererWebContentsId } from './ipc/runtime'
import { registerWorkspaceHandlers } from './ipc/workspace'
import type { IpcDependencies } from './ipc/types'

export type { IpcDependencies, McpTestResult } from './ipc/types'

export function registerIpcHandlers(dependencies: IpcDependencies): void {
  setTrustedRendererWebContentsId(dependencies.rendererWebContentsId)

  registerWorkspaceHandlers(dependencies)
  registerSettingsHandlers(dependencies)
  registerProjectHandlers(dependencies)
  registerConversationHandlers(dependencies)
  registerProviderHandlers(dependencies)
  registerLiteratureHandlers(dependencies)
  registerManuscriptHandlers(dependencies)
  registerChatHandlers(dependencies)
  registerMcpHandlers(dependencies)
  registerSkillHandlers(dependencies)
  registerExportHandlers(dependencies)
}
