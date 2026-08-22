import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'

import type { McpServerConfig } from '../../../shared/contracts.js'

import {
  CLIENT_INFO,
  MAX_STDERR_LENGTH,
} from './constants.js'
import type { ManagedConnection, SupportedTransport } from './types.js'

export function createRuntime(config: McpServerConfig): ManagedConnection {
  const client = new Client(CLIENT_INFO, { capabilities: {} })
  let transport: SupportedTransport

  if (config.transport.type === 'stdio') {
    const env = { ...getDefaultEnvironment(), ...(config.transport.env ?? {}) }
    // Finder 启动的应用通常没有交互式 Shell 的 PATH；补入 macOS 常见工具目录，
    // 使应用内置的 uvx MCP 与用户自行配置的本机工具都能被稳定找到。
    env.PATH = [
      join(homedir(), '.local', 'bin'),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      env.PATH,
    ].filter(Boolean).join(delimiter)
    transport = new StdioClientTransport({
      command: config.transport.command,
      args: [...config.transport.args],
      cwd: config.transport.cwd,
      env,
      stderr: 'pipe',
    })
  } else {
    transport = new StreamableHTTPClientTransport(new URL(config.transport.url), {
      requestInit: {
        headers: config.transport.headers ? { ...config.transport.headers } : undefined,
      },
      reconnectionOptions: {
        maxReconnectionDelay: 10_000,
        initialReconnectionDelay: 500,
        reconnectionDelayGrowFactor: 1.5,
        maxRetries: 2,
      },
    })
  }

  const runtime: ManagedConnection = {
    client,
    transport,
    closing: false,
    closed: false,
    stderrText: '',
  }

  if (transport instanceof StdioClientTransport) {
    transport.stderr?.on('data', (chunk: unknown) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
      runtime.stderrText = `${runtime.stderrText}${text}`.slice(-MAX_STDERR_LENGTH)
    })
  }

  return runtime
}

export async function closeRuntime(
  runtime: ManagedConnection,
  requestTimeoutMs: number,
): Promise<void> {
  runtime.closing = true
  let terminateError: unknown

  if (runtime.transport instanceof StreamableHTTPClientTransport) {
    try {
      await withTimeout(runtime.transport.terminateSession(), Math.min(3_000, requestTimeoutMs))
    } catch (error) {
      terminateError = error
    }
  }

  try {
    await runtime.client.close()
  } finally {
    runtime.closed = true
  }

  if (terminateError) throw terminateError
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`操作超过 ${timeoutMs} 毫秒`)), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
