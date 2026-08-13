#!/usr/bin/env node

/**
 * 通过已启动安装版的 CDP 接口执行 DeepSeek 对话冒烟验证。
 * 密钥仅从进程环境读取，并且不会被写入文件、标准输出或错误输出。
 */

const DEFAULT_CDP_PORT = 9337
const RUN_TIMEOUT_MS = 180_000
const POLL_INTERVAL_MS = 1_000

const summary = {
  provider: null,
  test: null,
  projectId: null,
  conversationId: null,
  run: null,
  assistant: null,
  error: null,
}

async function main() {
  const apiKey = process.env.AIWRITEPAPER_DEEPSEEK_KEY
  if (!apiKey) {
    throw new Error('缺少 AIWRITEPAPER_DEEPSEEK_KEY，无法执行 DeepSeek 冒烟验证。')
  }

  const port = readPort(process.env.AIWRITEPAPER_CDP_PORT)
  const target = await findCdpTarget(port)
  const client = await CdpClient.connect(target.webSocketDebuggerUrl)

  try {
    const initialWorkspace = await evaluate(client, 'window.paperAgent?.workspace.get()')
    if (!initialWorkspace) {
      throw new Error('目标窗口未暴露 window.paperAgent，无法执行安装版验证。')
    }

    const existing = initialWorkspace.providers.find((item) => item.name === 'DeepSeek')
    const savedProvider = await evaluate(
      client,
      `window.paperAgent.provider.save(${JSON.stringify({
        id: existing?.id,
        name: 'DeepSeek',
        protocol: 'openai-compatible',
        baseUrl: 'https://api.deepseek.com',
        apiKey,
        models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
        defaultModel: 'deepseek-v4-flash',
        enabled: true,
      })})`,
    )
    summary.provider = providerSummary(savedProvider)

    const test = await evaluate(
      client,
      `window.paperAgent.provider.test(${JSON.stringify(savedProvider.id)})`,
    )
    summary.test = {
      ok: Boolean(test?.ok),
      message: redact(test?.message ?? ''),
    }

    const workspaceAfterTest = await evaluate(client, 'window.paperAgent.workspace.get()')
    const persistedProvider = workspaceAfterTest.providers.find((item) => item.id === savedProvider.id)
    summary.provider = providerSummary(persistedProvider ?? savedProvider)

    if (!test?.ok) {
      throw new Error(`DeepSeek 连接测试失败：${test?.message ?? '未知错误'}`)
    }

    const liveProject = workspaceAfterTest.projects.find((item) => item.origin === 'live')
    if (!liveProject) {
      throw new Error('工作区中不存在 origin=live 的项目，无法执行真实对话验证。')
    }

    const activatedWorkspace = await evaluate(
      client,
      `window.paperAgent.project.setActive(${JSON.stringify(liveProject.id)})`,
    )
    const activeProject = activatedWorkspace.projects.find((item) => item.id === liveProject.id)
    const conversation = activatedWorkspace.conversations.find(
      (item) => item.id === activeProject?.activeConversationId && item.projectId === liveProject.id,
    ) ?? activatedWorkspace.conversations.find((item) => item.projectId === liveProject.id)
    if (!conversation) {
      throw new Error('所选真实项目没有可用对话，无法执行真实对话验证。')
    }

    summary.projectId = liveProject.id
    summary.conversationId = conversation.id

    const started = await evaluate(
      client,
      `window.paperAgent.chat.start(${JSON.stringify({
        projectId: liveProject.id,
        conversationId: conversation.id,
        content: '请只用一句话回答：当前正在使用哪个模型？',
        providerId: savedProvider.id,
        model: 'deepseek-v4-flash',
        contextScope: 'project',
      })})`,
    )
    const result = await waitForRun(client, started.runId)
    summary.run = {
      status: result.run.status,
      error: redact(result.run.error ?? ''),
    }
    summary.assistant = result.assistant
      ? {
          status: result.assistant.status,
          model: result.assistant.model ?? null,
          content: redact(result.assistant.content ?? ''),
        }
      : null

    if (result.run.status !== 'completed') {
      throw new Error(`对话运行未完成：${result.run.error ?? result.run.status}`)
    }
    if (!result.assistant || result.assistant.status !== 'completed') {
      throw new Error('未取得已完成的助手回复。')
    }
  } finally {
    client.close()
  }
}

function readPort(value) {
  if (value === undefined || value === '') return DEFAULT_CDP_PORT
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('AIWRITEPAPER_CDP_PORT 必须是 1 到 65535 的整数。')
  }
  return port
}

async function findCdpTarget(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`)
  if (!response.ok) {
    throw new Error(`CDP 目标列表请求失败：HTTP ${response.status}`)
  }
  const targets = await response.json()
  if (!Array.isArray(targets)) {
    throw new Error('CDP 目标列表格式无效。')
  }
  const pages = targets.filter((item) => item?.type === 'page' && typeof item.webSocketDebuggerUrl === 'string')
  const target = pages.find((item) => /学术 Agent|AIWritePaper/i.test(`${item.title ?? ''} ${item.url ?? ''}`)) ?? pages[0]
  if (!target) {
    throw new Error('未找到可连接的安装版页面 CDP 目标。')
  }
  return target
}

async function evaluate(client, expression) {
  const response = await client.call('Runtime.evaluate', {
    expression: `(async () => (${expression}))()`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (response.exceptionDetails) {
    throw new Error(cdpExceptionMessage(response.exceptionDetails))
  }
  return response.result?.value
}

async function waitForRun(client, runId) {
  const deadline = Date.now() + RUN_TIMEOUT_MS
  while (Date.now() < deadline) {
    const workspace = await evaluate(client, 'window.paperAgent.workspace.get()')
    const run = workspace.runs.find((item) => item.id === runId)
    if (!run) {
      throw new Error('工作区中未找到刚刚启动的对话运行。')
    }
    const assistant = workspace.messages.find((item) => item.runId === runId && item.role === 'assistant')
    if (run.status === 'completed' || run.status === 'cancelled' || run.status === 'error') {
      return { run, assistant }
    }
    await delay(POLL_INTERVAL_MS)
  }
  throw new Error(`等待对话运行超时（${RUN_TIMEOUT_MS / 1000} 秒）。`)
}

function providerSummary(provider) {
  return {
    id: provider?.id ?? null,
    name: provider?.name ?? null,
    hasCredential: Boolean(provider?.hasCredential),
    health: provider?.lastHealth ?? null,
    models: Array.isArray(provider?.models) ? provider.models : [],
  }
}

function cdpExceptionMessage(exception) {
  const description = exception.exception?.description ?? exception.text ?? 'CDP Runtime.evaluate 执行失败。'
  return redact(String(description))
}

function redact(value) {
  return String(value).replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

class CdpClient {
  static async connect(url) {
    const socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('连接 CDP WebSocket 超时。')), 10_000)
      socket.addEventListener('open', () => {
        clearTimeout(timeout)
        resolve()
      }, { once: true })
      socket.addEventListener('error', () => {
        clearTimeout(timeout)
        reject(new Error('连接 CDP WebSocket 失败。'))
      }, { once: true })
    })
    return new CdpClient(socket)
  }

  constructor(socket) {
    this.socket = socket
    this.nextId = 0
    this.pending = new Map()
    socket.addEventListener('message', (event) => this.receive(event))
    socket.addEventListener('close', () => this.rejectAll(new Error('CDP WebSocket 已关闭。')))
    socket.addEventListener('error', () => this.rejectAll(new Error('CDP WebSocket 通信失败。')))
  }

  call(method, params) {
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP 调用超时：${method}`))
      }, 30_000)
      this.pending.set(id, { resolve, reject, timeout })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  receive(event) {
    let message
    try {
      message = JSON.parse(String(event.data))
    } catch {
      return
    }
    if (typeof message.id !== 'number') return
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    clearTimeout(pending.timeout)
    if (message.error) {
      pending.reject(new Error(redact(message.error.message ?? 'CDP 调用失败。')))
      return
    }
    pending.resolve(message.result)
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
  }

  close() {
    this.socket.close()
  }
}

void main()
  .catch((error) => {
    summary.error = redact(error instanceof Error ? error.message : '未知错误')
    process.stderr.write(`DeepSeek CDP 冒烟失败：${summary.error}\n`)
    process.exitCode = 1
  })
  .finally(() => {
    process.stdout.write(`${JSON.stringify(summary)}\n`)
  })
