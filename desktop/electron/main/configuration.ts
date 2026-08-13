import { randomUUID } from 'node:crypto'
import type {
  McpServerConfig,
  McpServerInput,
  McpTransportConfig,
  ProviderInput,
  ProviderProfile,
} from '../../shared/contracts'
import { CredentialStore } from '../services/storage/credentialStore'
import { WorkspaceRepository } from '../services/storage/workspaceRepository'

const timestamp = () => new Date().toISOString()
const maskedValue = '••••••••'

const isSensitiveName = (name: string) =>
  /authorization|(?:^|[-_])auth(?:$|[-_])|api[-_]?key|access[-_]?key|token|secret|password|cookie|credential/i.test(name)

export class ConfigurationService {
  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly credentials: CredentialStore,
  ) {}

  async saveProvider(input: ProviderInput): Promise<ProviderProfile> {
    const current = input.id ? this.repository.getProvider(input.id) : undefined
    const id = input.id ?? randomUUID()
    const createdAt = current?.createdAt ?? timestamp()

    if (input.apiKey?.trim() && input.apiKey !== maskedValue) {
      await this.credentials.set(`provider:${id}`, input.apiKey.trim())
    }

    const models = [...new Set([input.defaultModel, ...input.models].map((item) => item.trim()))]
    const profile: ProviderProfile = {
      id,
      name: input.name.trim(),
      protocol: input.protocol,
      baseUrl: input.baseUrl.replace(/\/+$/, ''),
      models,
      defaultModel: input.defaultModel.trim(),
      enabled: input.enabled,
      hasCredential: this.credentials.has(`provider:${id}`),
      lastHealth: current?.lastHealth ?? 'untested',
      lastError: current?.lastError,
      origin: 'live',
      verificationStatus: 'unverified',
      createdAt,
      updatedAt: timestamp(),
    }
    return this.repository.saveProvider(profile)
  }

  async deleteProvider(providerId: string): Promise<void> {
    await this.credentials.delete(`provider:${providerId}`)
    await this.repository.deleteProvider(providerId)
  }

  providerSecret(providerId: string): string | undefined {
    return this.credentials.get(`provider:${providerId}`)
  }

  async saveMcpServer(input: McpServerInput): Promise<McpServerConfig> {
    const current = input.id ? this.repository.getMcpServer(input.id) : undefined
    const id = input.id ?? randomUUID()
    const currentSecrets = this.readJsonSecret(`mcp:${id}`)
    const { sanitized, sensitive } = sanitizeTransport(input.transport, currentSecrets)
    if (Object.keys(sensitive).length) await this.credentials.set(`mcp:${id}`, JSON.stringify(sensitive))
    else await this.credentials.delete(`mcp:${id}`)

    const server: McpServerConfig = {
      id,
      name: input.name.trim(),
      transport: sanitized,
      enabled: input.enabled,
      status: 'disconnected',
      tools: current?.tools ?? [],
      resources: current?.resources ?? [],
      origin: 'live',
      verificationStatus: 'unverified',
      createdAt: current?.createdAt ?? timestamp(),
      updatedAt: timestamp(),
    }
    return this.repository.saveMcpServer(server)
  }

  async deleteMcpServer(serverId: string): Promise<void> {
    await this.credentials.delete(`mcp:${serverId}`)
    await this.repository.deleteMcpServer(serverId)
  }

  resolvedMcpServer(serverId: string): McpServerConfig {
    const server = this.repository.getMcpServer(serverId)
    if (!server) throw new Error('MCP 服务不存在。')
    const sensitive = this.readJsonSecret(`mcp:${serverId}`)
    return {
      ...server,
      transport: restoreTransport(server.transport, sensitive),
    }
  }

  private readJsonSecret(key: string): Record<string, string> {
    const raw = this.credentials.get(key)
    if (!raw) return {}
    try {
      return JSON.parse(raw) as Record<string, string>
    } catch {
      return {}
    }
  }
}

function sanitizeTransport(
  transport: McpTransportConfig,
  currentSecrets: Record<string, string>,
): {
  sanitized: McpTransportConfig
  sensitive: Record<string, string>
} {
  const sensitive: Record<string, string> = {}
  if (transport.type === 'stdio') {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(transport.env ?? {})) {
      if (!isSensitiveName(key)) {
        env[key] = value
        continue
      }
      const secretKey = `env:${key}`
      const resolved = value === maskedValue ? currentSecrets[secretKey] : value
      if (resolved) {
        sensitive[secretKey] = resolved
        env[key] = maskedValue
      }
    }
    return { sanitized: { ...transport, env }, sensitive }
  }

  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(transport.headers ?? {})) {
    if (!isSensitiveName(key)) {
      headers[key] = value
      continue
    }
    const secretKey = `header:${key}`
    const resolved = value === maskedValue ? currentSecrets[secretKey] : value
    if (resolved) {
      sensitive[secretKey] = resolved
      headers[key] = maskedValue
    }
  }
  return { sanitized: { ...transport, headers }, sensitive }
}

function restoreTransport(
  transport: McpTransportConfig,
  sensitive: Record<string, string>,
): McpTransportConfig {
  if (transport.type === 'stdio') {
    const env = { ...(transport.env ?? {}) }
    for (const [key, value] of Object.entries(sensitive)) {
      if (key.startsWith('env:')) env[key.slice(4)] = value
    }
    return { ...transport, env }
  }

  const headers = { ...(transport.headers ?? {}) }
  for (const [key, value] of Object.entries(sensitive)) {
    if (key.startsWith('header:')) headers[key.slice(7)] = value
  }
  return { ...transport, headers }
}
