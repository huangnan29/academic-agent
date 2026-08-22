import { IPC } from '../../../shared/ipc'
import { chatStartSchema } from '../schemas'
import { assertId } from './common'
import { handle } from './runtime'
import { buildSlashMcpPlans, prepareSlashToolReferences } from './slashTools'
import type { IpcDependencies, RegisterIpcHandler } from './types'

export function registerChatHandlers(
  dependencies: IpcDependencies,
  register: RegisterIpcHandler = handle,
): void {
  const { repository, configuration, chat } = dependencies

  register(IPC.chatStart, async (event, payload: unknown) => {
    const parsed = chatStartSchema.parse(payload)
    const prepared = prepareSlashToolReferences(repository.snapshot(), parsed)
    const mcpPlans = buildSlashMcpPlans(
      repository.snapshot(),
      prepared.input,
      prepared.argumentTextByReference,
      configuration,
      dependencies.callMcpTool,
    )
    return chat.start(prepared.input, event.sender, mcpPlans)
  })

  register(IPC.chatCancel, async (_event, runId: unknown) => {
    assertId(runId, '运行任务')
    chat.cancel(runId)
  })
}
