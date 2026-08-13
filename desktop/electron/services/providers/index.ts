import type { ProviderProfile } from '../../../shared/contracts'
import { AnthropicProvider } from './anthropic'
import { OpenAICompatibleProvider } from './openai-compatible'
import type { ProviderAdapter, ProviderAdapterOptions } from './types'
import { ProviderRequestError } from './utils'

export * from './anthropic'
export * from './openai-compatible'
export * from './types'
export * from './utils'

export function createProviderAdapter(
  profile: ProviderProfile,
  apiKey?: string,
  options?: ProviderAdapterOptions,
): ProviderAdapter {
  if (profile.protocol === 'openai-compatible') {
    return new OpenAICompatibleProvider(profile, apiKey, options)
  }
  if (profile.protocol === 'anthropic') {
    return new AnthropicProvider(profile, apiKey, options)
  }

  throw new ProviderRequestError('暂不支持该模型服务协议。', {
    code: 'UNSUPPORTED_PROTOCOL',
  })
}
export class ProviderRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>()
  private readonly options?: ProviderAdapterOptions

  constructor(options?: ProviderAdapterOptions) {
    this.options = options
  }

  register(profile: ProviderProfile, apiKey?: string): ProviderAdapter {
    const adapter = createProviderAdapter(profile, apiKey, this.options)
    this.adapters.set(profile.id, adapter)
    return adapter
  }

  remove(providerId: string): void {
    this.adapters.delete(providerId)
  }

  clear(): void {
    this.adapters.clear()
  }

  get(providerId: string): ProviderAdapter {
    const adapter = this.adapters.get(providerId)
    if (!adapter) {
      throw new ProviderRequestError('模型服务尚未初始化或已被删除。', {
        code: 'PROVIDER_NOT_REGISTERED',
      })
    }
    return adapter
  }

  has(providerId: string): boolean {
    return this.adapters.has(providerId)
  }
}
