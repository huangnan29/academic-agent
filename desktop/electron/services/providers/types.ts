import type { ProviderProfile } from '../../../shared/contracts'

export type ProviderMessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ProviderChatMessage {
  role: ProviderMessageRole
  content: string
}
export interface ProviderUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export type ProviderStreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'reasoning-delta'; delta: string }
  | { type: 'tool-call'; name?: string; argumentsDelta?: string }
  | { type: 'usage'; usage: ProviderUsage }
  | { type: 'finish'; reason?: string }

export interface ProviderConnectionResult {
  ok: boolean
  latencyMs: number
  models: string[]
  message: string
}

export interface ProviderAdapter {
  readonly profile: ProviderProfile

  testConnection(signal?: AbortSignal): Promise<ProviderConnectionResult>

  streamChat(
    messages: ProviderChatMessage[],
    model?: string,
    signal?: AbortSignal,
  ): AsyncGenerator<ProviderStreamEvent, void, void>
}

export interface ProviderAdapterOptions {
  requestTimeoutMs?: number
  maxErrorBodyBytes?: number
}
