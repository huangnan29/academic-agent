#!/usr/bin/env node

/** 通过隔离的 Electron 工作区验证 Slash 指令会真实调用 MCP，再将返回结果交给模型。 */
const port = Number(process.env.AIWRITEPAPER_CDP_PORT ?? 9375)
const deadline = Date.now() + 180_000

async function main() {
  const target = await findTarget()
  const client = await CdpClient.connect(target.webSocketDebuggerUrl)
  try {
    await client.call('Runtime.enable')
    const started = await evaluate(client, `(async () => {
      const workspace = await window.paperAgent.workspace.get()
      const project = workspace.projects.find((item) => item.origin === 'live') ?? workspace.projects[0]
      if (!project) throw new Error('没有可用研究项目。')
      const conversation = workspace.conversations.find((item) => item.id === project.activeConversationId)
        ?? workspace.conversations.find((item) => item.projectId === project.id && !item.archived)
      if (!conversation) throw new Error('没有可用对话。')
      const provider = workspace.providers.find((item) => item.enabled && item.hasCredential && item.lastHealth === 'healthy')
        ?? workspace.providers.find((item) => item.enabled && item.hasCredential)
      if (!provider) throw new Error('没有可用且已保存凭证的模型。')
      const model = provider.defaultModel || provider.models[0]
      if (!model) throw new Error('模型服务没有可用模型。')
      const result = await window.paperAgent.chat.start({
        projectId: project.id,
        conversationId: conversation.id,
        content: '/search_papers ti:"retrieval augmented generation"',
        providerId: provider.id,
        model,
        contextScope: 'project',
      })
      return { runId: result.runId, projectId: project.id, conversationId: conversation.id, provider: provider.name, model }
    })()`)

    while (Date.now() < deadline) {
      const snapshot = await evaluate(client, `(async () => {
        const workspace = await window.paperAgent.workspace.get()
        const run = workspace.runs.find((item) => item.id === ${JSON.stringify(started.runId)})
        const user = workspace.messages.find((item) => item.conversationId === ${JSON.stringify(started.conversationId)}
          && item.role === 'user' && item.content.startsWith('/search_papers'))
        const assistant = workspace.messages.find((item) => item.runId === ${JSON.stringify(started.runId)} && item.role === 'assistant')
        return { run, user, assistant }
      })()`)
      if (snapshot.run && ['completed', 'error', 'cancelled'].includes(snapshot.run.status)) {
        const toolReference = snapshot.user?.contextReferences?.find((item) => item.kind === 'mcp-tool')
        const toolStep = snapshot.run.steps?.find((item) => item.label === 'MCP · search_papers')
        const summary = {
          ok: snapshot.run.status === 'completed'
            && toolReference?.toolName === 'search_papers'
            && toolStep?.status === 'completed'
            && /\u771f\u5b9e\u8fd4\u56de/.test(toolStep.detail ?? '')
            && snapshot.assistant?.status === 'completed'
            && Boolean(snapshot.assistant?.content?.trim()),
          projectId: started.projectId,
          conversationId: started.conversationId,
          provider: started.provider,
          model: started.model,
          runStatus: snapshot.run.status,
          mcpReference: toolReference,
          mcpStep: toolStep ? { label: toolStep.label, status: toolStep.status, detail: String(toolStep.detail ?? '').slice(0, 900) } : null,
          assistant: snapshot.assistant ? {
            status: snapshot.assistant.status,
            content: String(snapshot.assistant.content ?? '').slice(0, 1200),
            error: snapshot.assistant.error,
          } : null,
          runError: snapshot.run.error,
        }
        process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
        if (!summary.ok) process.exitCode = 1
        return
      }
      await delay(500)
    }
    throw new Error('Slash MCP 对话验证超时。')
  } finally {
    client.close()
  }
}

async function findTarget() {
  const stopAt = Date.now() + 20_000
  while (Date.now() < stopAt) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      const targets = await response.json()
      const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
      if (target) return target
    } catch {
      // 等待 Electron 调试端口就绪。
    }
    await delay(100)
  }
  throw new Error('未找到 Electron 页面。')
}

async function evaluate(client, expression) {
  const response = await client.call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
  }
  return response.result?.value
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

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

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
