#!/usr/bin/env node

/** 通过原生 Electron 桥接验证内置 arXiv MCP 的连接测试。 */
const port = Number(process.env.AIWRITEPAPER_CDP_PORT ?? 9364)

async function findTarget() {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      const targets = await response.json()
      const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
      if (target) return target
    } catch {
      // 等待 Electron 调试端口。
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('未找到 Electron 页面。')
}

class CdpClient {
  static async connect(url) {
    const socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    return new CdpClient(socket)
  }

  constructor(socket) {
    this.socket = socket
    this.nextId = 0
    this.pending = new Map()
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (!message.id) return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result)
    })
  }

  call(method, params = {}) {
    const id = ++this.nextId
    this.socket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }

  close() {
    this.socket.close()
  }
}

const target = await findTarget()
const client = await CdpClient.connect(target.webSocketDebuggerUrl)

try {
  await client.call('Runtime.enable')
  const response = await client.call('Runtime.evaluate', {
    expression: `(async () => {
      try {
        const before = await window.paperAgent.workspace.get()
        const stored = before.mcpServers.find((item) => item.id === 'builtin-arxiv-mcp')
        if (!stored || stored.transport.type !== 'stdio') throw new Error('内置 arXiv MCP 配置不存在。')
        const saved = await window.paperAgent.mcp.save({
          id: stored.id,
          name: stored.name,
          enabled: stored.enabled,
          transport: {
            type: 'stdio',
            command: stored.transport.command,
            args: stored.transport.args,
            env: stored.transport.env,
          },
        })
        const result = await window.paperAgent.mcp.test(saved.id)
        return {
          ok: true,
          before: stored,
          saved,
          result,
        }
      } catch (error) {
        return {
          ok: false,
          name: error?.name,
          message: error?.message ?? String(error),
          stack: error?.stack,
        }
      }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  })
  process.stdout.write(`${JSON.stringify(response.result?.value, null, 2)}\n`)
  if (!response.result?.value?.ok) process.exitCode = 1
} finally {
  client.close()
}
