import { appearanceApi } from './fallback/appearance'
import { appApi, exportApi, externalApi } from './fallback/misc'
import { chatApi } from './fallback/chat'
import { conversationApi } from './fallback/conversation'
import { literatureApi } from './fallback/literature'
import { mcpApi } from './fallback/mcp'
import { outlineApi } from './fallback/outline'
import { projectApi } from './fallback/project'
import { providerApi } from './fallback/provider'
import { sectionApi } from './fallback/section'
import { skillApi } from './fallback/skill'
import { systemPermissionsApi } from './fallback/system'
import { voiceApi } from './fallback/voice'
import { workspaceApi } from './fallback/workspace'

type PaperAgentApi = Window['paperAgent']

const fallbackApi: PaperAgentApi = {
  workspace: workspaceApi,
  appearance: appearanceApi,
  project: projectApi,
  conversation: conversationApi,
  systemPermissions: systemPermissionsApi,
  voice: voiceApi,
  provider: providerApi,
  literature: literatureApi,
  outline: outlineApi,
  section: sectionApi,
  chat: chatApi,
  mcp: mcpApi,
  skill: skillApi,
  export: exportApi,
  external: externalApi,
  app: appApi,
}

export const isNativeBridge = typeof window !== 'undefined' && Boolean(window.paperAgent)

export const paperAgent: PaperAgentApi = isNativeBridge ? window.paperAgent : fallbackApi
