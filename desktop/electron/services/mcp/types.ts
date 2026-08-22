import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type {
  CallToolResult,
  ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js'

import type {
  McpServerConfig,
  McpTransportConfig,
} from '../../../shared/contracts.js'

export type McpToolSummary = McpServerConfig['tools'][number]
export type McpResourceSummary = McpServerConfig['resources'][number]
export type SupportedTransport = StdioClientTransport | StreamableHTTPClientTransport

export type McpToolCallResult = CallToolResult
export type McpResourceReadResult = ReadResourceResult

export interface McpManagerOptions {
  requestTimeoutMs?: number
  maxListPages?: number
  maxCallArgumentsBytes?: number
  maxResultBytes?: number
  onConfigChange?: (config: McpServerConfig) => void | Promise<void>
  onConfigDelete?: (serverId: string) => void | Promise<void>
}

export interface ManagedConnection {
  client: Client
  transport: SupportedTransport
  closing: boolean
  closed: boolean
  stderrText: string
}

export interface DiscoveryResult {
  tools: McpToolSummary[]
  resources: McpResourceSummary[]
}

export interface DiscoveryOptions {
  maxListPages: number
  requestTimeoutMs: number
}

