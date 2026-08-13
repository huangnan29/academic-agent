import type { ProviderProfile } from '../shared/contracts'
import { createProviderAdapter } from '../electron/services/providers'

const baseUrl = process.env.AIWRITEPAPER_REASONING_BASE_URL
if (!baseUrl) throw new Error('缺少 AIWRITEPAPER_REASONING_BASE_URL。')

const timestamp = new Date().toISOString()
const profile: ProviderProfile = {
  id: 'reasoning-smoke-provider',
  name: '本地推理流 Mock',
  protocol: 'openai-compatible',
  baseUrl,
  models: ['mock-paper-agent'],
  defaultModel: 'mock-paper-agent',
  enabled: true,
  hasCredential: false,
  lastHealth: 'connected',
  origin: 'live',
  verificationStatus: 'unverified',
  createdAt: timestamp,
  updatedAt: timestamp,
}

const adapter = createProviderAdapter(profile, undefined, { requestTimeoutMs: 10_000 })
let reasoning = ''
let content = ''
for await (const event of adapter.streamChat(
  [
    { role: 'system', content: '这是本地推理流测试。' },
    { role: 'user', content: '请确认推理流与正文流可以分开接收。' },
  ],
  profile.defaultModel,
)) {
  if (event.type === 'reasoning-delta') reasoning += event.delta
  if (event.type === 'text-delta') content += event.delta
}

if (!reasoning.includes('本地 QA 推理流')) throw new Error('没有收到 reasoning-delta。')
if (!content.trim()) throw new Error('没有收到正文 text-delta。')

process.stdout.write(`${JSON.stringify({
  ok: true,
  reasoningChars: reasoning.length,
  contentChars: content.length,
  streamsSeparated: !content.includes('本地 QA 推理流'),
}, null, 2)}\n`)
