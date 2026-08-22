import { IPC } from '../../../shared/ipc'
import { createProviderAdapter } from '../../services/providers'
import { providerInputSchema } from '../schemas'
import { assertId } from './common'
import { handle } from './runtime'
import type { IpcDependencies, RegisterIpcHandler } from './types'

export function registerProviderHandlers(
  dependencies: IpcDependencies,
  register: RegisterIpcHandler = handle,
): void {
  const { repository, configuration } = dependencies

  register(IPC.providerSave, async (_event, payload: unknown) => {
    const input = providerInputSchema.parse(payload)
    return configuration.saveProvider(input)
  })

  register(IPC.providerDelete, async (_event, providerId: unknown) => {
    assertId(providerId, '模型服务')
    await configuration.deleteProvider(providerId)
  })

  register(IPC.providerTest, async (_event, providerId: unknown) => {
    assertId(providerId, '模型服务')
    const profile = repository.getProvider(providerId)
    if (!profile) throw new Error('模型服务不存在。')
    await repository.updateProviderHealth(providerId, 'checking')
    const adapter = createProviderAdapter(profile, configuration.providerSecret(providerId), {
      requestTimeoutMs: 15_000,
    })
    const result = await adapter.testConnection()
    await repository.updateProviderHealth(
      providerId,
      result.ok ? 'connected' : 'failed',
      result.ok ? undefined : result.message,
      result.models,
    )
    return { ok: result.ok, message: result.message, models: result.models }
  })
}
