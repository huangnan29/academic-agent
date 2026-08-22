import type { Client } from '@modelcontextprotocol/sdk/client/index.js'

import {
  cloneToolInputSchema,
} from './bounded-json.js'
import { cleanText } from './validation.js'
import type {
  DiscoveryOptions,
  DiscoveryResult,
  McpResourceSummary,
  McpToolSummary,
} from './types.js'

export async function discover(
  client: Client,
  options: DiscoveryOptions,
): Promise<DiscoveryResult> {
  const capabilities = client.getServerCapabilities()
  const [tools, resources] = await Promise.all([
    capabilities?.tools ? fetchTools(client, options) : Promise.resolve([]),
    capabilities?.resources ? fetchResources(client, options) : Promise.resolve([]),
  ])
  return { tools, resources }
}

export async function fetchTools(
  client: Client,
  options: DiscoveryOptions,
): Promise<McpToolSummary[]> {
  const tools = new Map<string, McpToolSummary>()
  const seenCursors = new Set<string>()
  let cursor: string | undefined

  for (let page = 0; page < options.maxListPages; page += 1) {
    const result = await client.listTools(
      cursor ? { cursor } : undefined,
      { timeout: options.requestTimeoutMs },
    )
    for (const tool of result.tools) {
      const name = cleanText(tool.name, 256)
      if (!name || tools.has(name)) continue
      tools.set(name, {
        name,
        description: cleanText(tool.description),
        inputSchema: cloneToolInputSchema(tool.inputSchema),
      })
    }

    if (!result.nextCursor) return [...tools.values()]
    if (seenCursors.has(result.nextCursor)) {
      throw new Error('MCP tools/list 返回了重复游标')
    }
    seenCursors.add(result.nextCursor)
    cursor = result.nextCursor
  }

  throw new Error(`MCP tools/list 超过 ${options.maxListPages} 页，已停止继续读取`)
}

export async function fetchResources(
  client: Client,
  options: DiscoveryOptions,
): Promise<McpResourceSummary[]> {
  const resources = new Map<string, McpResourceSummary>()
  const seenCursors = new Set<string>()
  let cursor: string | undefined

  for (let page = 0; page < options.maxListPages; page += 1) {
    const result = await client.listResources(
      cursor ? { cursor } : undefined,
      { timeout: options.requestTimeoutMs },
    )
    for (const resource of result.resources) {
      const uri = cleanText(resource.uri, 4_096)
      const name = cleanText(resource.name, 512)
      if (!uri || !name || resources.has(uri)) continue
      resources.set(uri, { uri, name, description: cleanText(resource.description) })
    }

    if (!result.nextCursor) return [...resources.values()]
    if (seenCursors.has(result.nextCursor)) {
      throw new Error('MCP resources/list 返回了重复游标')
    }
    seenCursors.add(result.nextCursor)
    cursor = result.nextCursor
  }

  throw new Error(`MCP resources/list 超过 ${options.maxListPages} 页，已停止继续读取`)
}
