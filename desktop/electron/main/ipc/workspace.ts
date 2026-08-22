import { IPC } from '../../../shared/ipc'
import { sidebarPreferencesSchema } from '../schemas'
import { assertId } from './common'
import { handle } from './runtime'
import type { IpcDependencies, RegisterIpcHandler } from './types'

export function registerWorkspaceHandlers(
  dependencies: IpcDependencies,
  register: RegisterIpcHandler = handle,
): void {
  const { repository } = dependencies

  register(IPC.workspaceGet, () => repository.snapshot())

  register(IPC.workspaceSetActiveModel, async (_event, providerId: unknown, model: unknown) => {
    assertId(providerId, '模型服务')
    assertId(model, '模型')
    return repository.setActiveModel(providerId, model)
  })

  register(IPC.workspaceSetSidebarPreferences, async (_event, payload: unknown) => {
    return repository.setSidebarPreferences(sidebarPreferencesSchema.parse(payload))
  })
}
