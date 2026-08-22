import type { ProviderProfile } from '../../shared/contracts'
import { clone, makeId, mutate, now, readState } from './state'

export const providerApi: Window['paperAgent']['provider'] = {
  async save(input) {
    const id = input.id ?? makeId('provider')
    const existing = readState().providers.find((item) => item.id === id)
    const saved: ProviderProfile = {
      id,
      name: input.name,
      protocol: input.protocol,
      baseUrl: input.baseUrl,
      models: input.models,
      defaultModel: input.defaultModel,
      enabled: input.enabled,
      hasCredential: Boolean(input.apiKey) || existing?.hasCredential === true,
      lastHealth: 'untested',
      origin: 'demo',
      verificationStatus: 'demo',
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now(),
    }
    mutate((draft) => {
      const index = draft.providers.findIndex((item) => item.id === id)
      if (index >= 0) draft.providers[index] = saved
      else draft.providers.push(saved)
      if (!draft.settings.activeProviderId) {
        draft.settings.activeProviderId = id
        draft.settings.activeModel = saved.defaultModel
      }
    })
    return clone(saved)
  },
  async delete(providerId) {
    mutate((draft) => {
      draft.providers = draft.providers.filter((item) => item.id !== providerId)
      if (draft.settings.activeProviderId === providerId) {
        const next = draft.providers.find((item) => item.enabled)
        draft.settings.activeProviderId = next?.id
        draft.settings.activeModel = next?.defaultModel
      }
    })
  },
  async test(providerId) {
    const provider = readState().providers.find((item) => item.id === providerId)
    if (!provider) return { ok: false, message: '未找到该提供商配置' }
    mutate((draft) => {
      const target = draft.providers.find((item) => item.id === providerId)
      if (target) target.lastHealth = 'connected'
    })
    return {
      ok: true,
      message: '浏览器演示连接正常，未访问真实模型服务',
      models: provider.models,
    }
  },
}
