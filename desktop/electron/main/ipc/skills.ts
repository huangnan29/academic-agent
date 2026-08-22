import { IPC } from '../../../shared/ipc'
import { skillInputSchema } from '../schemas'
import { assertId } from './common'
import { handle } from './runtime'
import type { IpcDependencies, RegisterIpcHandler } from './types'

export function registerSkillHandlers(
  dependencies: IpcDependencies,
  register: RegisterIpcHandler = handle,
): void {
  const { repository } = dependencies

  register(IPC.skillSave, async (_event, payload: unknown) => {
    return repository.saveSkill(skillInputSchema.parse(payload))
  })

  register(IPC.skillDelete, async (_event, skillId: unknown) => {
    assertId(skillId, 'Skill')
    await repository.deleteSkill(skillId)
  })
}
