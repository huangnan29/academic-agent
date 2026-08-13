import type { ProviderProfile } from '../shared/contracts'
import {
  deepSeekThinkingParameters,
  usesExplicitDeepSeekThinking,
} from '../electron/services/providers/openai-compatible'

const timestamp = new Date().toISOString()
const profile: ProviderProfile = {
  id: 'deepseek-thinking-check',
  name: 'DeepSeek',
  protocol: 'openai-compatible',
  baseUrl: 'https://api.deepseek.com',
  models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  defaultModel: 'deepseek-v4-flash',
  enabled: true,
  hasCredential: true,
  origin: 'live',
  verificationStatus: 'unverified',
  createdAt: timestamp,
  updatedAt: timestamp,
}

const parameters = deepSeekThinkingParameters(profile, profile.defaultModel)
const ok = usesExplicitDeepSeekThinking(profile, profile.defaultModel) &&
  parameters.reasoning_effort === 'high' &&
  parameters.thinking?.type === 'enabled'
if (!ok) throw new Error('官方 DeepSeek V4 请求没有显式开启 Thinking。')

const genericProfile = { ...profile, baseUrl: 'https://example.com/v1' }
if (usesExplicitDeepSeekThinking(genericProfile, profile.defaultModel)) {
  throw new Error('通用 OpenAI 兼容接口不应被强制注入 DeepSeek 专用参数。')
}

process.stdout.write(`${JSON.stringify({ ok, model: profile.defaultModel, parameters }, null, 2)}\n`)
