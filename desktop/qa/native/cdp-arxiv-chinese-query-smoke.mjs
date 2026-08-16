#!/usr/bin/env node

/** 通过已启动的隔离 Electron 验证中文请求会规划为英文 arXiv 查询；不会启动应用或写出凭证。 */
import { mkdir, writeFile } from 'node:fs/promises'

const port = Number(process.env.AIWRITEPAPER_CDP_PORT)
const outputDir = process.env.AIWRITEPAPER_ARXIV_CHINESE_QUERY_OUTPUT
  ?? process.env.AIWRITEPAPER_ARXIV_CHINESE_OUTPUT
const runTimeoutMs = 300_000

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('AIWRITEPAPER_CDP_PORT 必须是有效端口。')
}
if (!outputDir) {
  throw new Error('缺少 AIWRITEPAPER_ARXIV_CHINESE_QUERY_OUTPUT。')
}

let client

async function main() {
  await mkdir(outputDir, { recursive: true })
  const target = await findTarget()
  client = await CdpClient.connect(target.webSocketDebuggerUrl)
  const runtimeErrors = []

  try {
    await client.call('Runtime.enable')
    await client.call('Log.enable')
    await client.call('Page.enable')
    client.on('Runtime.exceptionThrown', (params) => {
      runtimeErrors.push(redact(params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? '运行时异常'))
    })
    client.on('Log.entryAdded', (params) => {
      if (params.entry?.level === 'error') runtimeErrors.push(redact(params.entry.text))
    })

    await waitFor("Boolean(window.paperAgent?.workspace?.get && window.paperAgent?.chat?.start && document.querySelector('.center-workspace'))")
    const started = await evaluate(`(async () => {
      const workspace = await window.paperAgent.workspace.get()
      const project = workspace.projects.find((item) => /生成式|教育|高校/u.test(item.title))
        ?? workspace.projects.find((item) => item.id === workspace.settings.activeProjectId)
        ?? workspace.projects.find((item) => item.origin === 'live')
      if (!project) throw new Error('隔离工作区没有可用研究项目。')
      const provider = workspace.providers.find((item) => (
        item.enabled && item.hasCredential && item.lastHealth === 'connected'
        && (item.defaultModel || item.models[0])
      ))
      if (!provider) throw new Error('隔离工作区没有已连接且具备凭证的模型服务。')
      const model = provider.models.includes(provider.defaultModel) ? provider.defaultModel : provider.models[0]
      if (!model) throw new Error('可用模型服务没有模型。')

      const activated = await window.paperAgent.project.setActive(project.id)
      const activeProject = activated.projects.find((item) => item.id === project.id)
      const conversation = activated.conversations.find((item) => (
        item.id === activeProject?.activeConversationId && item.projectId === project.id && !item.archived
      )) ?? activated.conversations.find((item) => item.projectId === project.id && !item.archived)
      if (!conversation) throw new Error('live 项目没有可用对话。')

      const command = '/paper_search 帮我搜索5篇与此标题强相关的内容'
      const result = await window.paperAgent.chat.start({
        projectId: project.id,
        conversationId: conversation.id,
        content: command,
        providerId: provider.id,
        model,
        contextScope: 'project',
      })
      return {
        runId: result.runId,
        projectId: project.id,
        conversationId: conversation.id,
        providerName: provider.name,
        model,
        command,
      }
    })()`)

    const completed = await waitForRun(started.runId)
    const toolStep = completed.run.steps?.find((step) => step.label === 'MCP · search_papers')
    if (completed.run.status !== 'completed') {
      throw new Error(`对话运行未完成：${completed.run.error ?? completed.run.status}`)
    }
    if (!toolStep || toolStep.status !== 'completed' || toolStep.evidence?.kind !== 'mcp-tool') {
      throw new Error('没有取得已完成的 MCP · search_papers 审计步骤。')
    }

    const arguments_ = parseJsonObject(toolStep.evidence.argumentsJson, 'MCP 参数审计')
    const query = typeof arguments_.query === 'string' ? arguments_.query.trim() : ''
    if (!query || /[\u3400-\u9fff]/u.test(query) || !/[A-Za-z]/.test(query)) {
      throw new Error(`arXiv query 不是英文检索式：${redact(query)}`)
    }
    if (arguments_.max_results !== 5) {
      throw new Error(`arXiv max_results 不是 5：${String(arguments_.max_results)}`)
    }

    const auditedResult = parseJsonObject(toolStep.evidence.resultJson, 'MCP 结果审计')
    const papers = findPapers(auditedResult)
    if (!papers || papers.length === 0) {
      throw new Error('MCP 结果审计中没有非空 papers。')
    }
    if (!completed.assistant || completed.assistant.status !== 'completed' || !completed.assistant.content?.trim()) {
      throw new Error('没有取得已完成的助手回复。')
    }
    const literatureCandidates = completed.assistant.literatureCandidates ?? []
    if (literatureCandidates.length === 0) {
      throw new Error('助手消息没有保存本轮真实 MCP 文献候选。')
    }
    if (/不存在该工具的真实返回|没有.{0,12}真实返回|未收到.{0,12}真实返回|工具未执行|检索尚未执行|再次确认工具/u.test(completed.assistant.content)) {
      throw new Error('助手错误地否认了已经完成的 MCP 调用。')
    }
    const paperIdentityMentioned = papers.some((paper) => {
      if (!paper || typeof paper !== 'object') return false
      const id = typeof paper.id === 'string' ? paper.id : ''
      const title = typeof paper.title === 'string' ? paper.title : ''
      return (id && completed.assistant.content.includes(id))
        || (title && completed.assistant.content.includes(title.slice(0, Math.min(36, title.length))))
    })
    if (!paperIdentityMentioned) throw new Error('助手回复没有引用任何真实返回论文的标题或 arXiv ID。')

    await evaluate("(() => { location.reload(); return true })()")
    await waitFor("Boolean(document.querySelector('.view-switcher') && document.querySelector('.center-workspace'))")
    await clickButtonText('.view-switcher button', '对话')
    await waitFor(`document.body.textContent?.includes(${JSON.stringify(started.command)})`)
    await waitFor("Boolean(document.querySelector('.message-literature-actions__list li button'))")
    const candidateToAdd = literatureCandidates[0]
    await evaluate(`(() => {
      const rows = [...document.querySelectorAll('.message-literature-actions__list li')]
      const row = rows.find((item) => item.textContent?.includes(${JSON.stringify(candidateToAdd.title)}))
      const button = row?.querySelector('button')
      if (!(button instanceof HTMLElement)) throw new Error('找不到消息内添加文献链接。')
      button.click()
      return true
    })()`)
    await waitFor(`window.paperAgent.workspace.get().then((workspace) => workspace.literature.some((item) => (
      item.projectId === ${JSON.stringify(started.projectId)}
      && item.title === ${JSON.stringify(candidateToAdd.title)}
    )))`)
    await waitFor(`Boolean(document.querySelector('.right-workspace')?.textContent?.includes(${JSON.stringify(candidateToAdd.title)}))`)
    await capture(`${outputDir}/arxiv-chinese-query-completed.png`)

    const summary = {
      ok: runtimeErrors.length === 0,
      projectId: started.projectId,
      conversationId: started.conversationId,
      provider: started.providerName,
      model: started.model,
      runId: started.runId,
      runStatus: completed.run.status,
      mcpStep: {
        label: toolStep.label,
        status: toolStep.status,
        toolName: toolStep.evidence.toolName,
        query,
        maxResults: arguments_.max_results,
        paperCount: papers.length,
        resultSha256: toolStep.evidence.resultSha256,
        truncated: toolStep.evidence.truncated,
      },
      assistant: {
        status: completed.assistant.status,
        contentPreview: redact(completed.assistant.content).slice(0, 600),
        literatureCandidateCount: literatureCandidates.length,
        addedTitle: candidateToAdd.title,
      },
      screenshot: `${outputDir}/arxiv-chinese-query-completed.png`,
      runtimeErrors,
    }
    await writeFile(
      `${outputDir}/arxiv-chinese-query-summary.json`,
      `${JSON.stringify(summary, null, 2)}\n`,
      'utf8',
    )
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    if (!summary.ok) process.exitCode = 1
  } finally {
    client.close()
  }
}

async function waitForRun(runId) {
  const deadline = Date.now() + runTimeoutMs
  while (Date.now() < deadline) {
    const snapshot = await evaluate(`window.paperAgent.workspace.get().then((workspace) => ({
      run: workspace.runs.find((item) => item.id === ${JSON.stringify(runId)}),
      assistant: workspace.messages.find((item) => item.runId === ${JSON.stringify(runId)} && item.role === 'assistant'),
    }))`)
    if (snapshot.run && ['completed', 'error', 'cancelled'].includes(snapshot.run.status)) return snapshot
    await delay(500)
  }
  throw new Error(`等待 arXiv 中文查询运行超时（${runTimeoutMs / 1_000} 秒）。`)
}

function parseJsonObject(value, label) {
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('不是对象')
    return parsed
  } catch {
    throw new Error(`${label}不是有效 JSON 对象。`)
  }
}

function findPapers(value, visited = new Set()) {
  if (typeof value === 'string') {
    try {
      return findPapers(JSON.parse(value), visited)
    } catch {
      return undefined
    }
  }
  if (!value || typeof value !== 'object' || visited.has(value)) return undefined
  visited.add(value)
  if (Array.isArray(value.papers)) return value.papers
  if (Array.isArray(value)) {
    for (const item of value) {
      const papers = findPapers(item, visited)
      if (papers) return papers
    }
    return undefined
  }
  for (const item of Object.values(value)) {
    const papers = findPapers(item, visited)
    if (papers) return papers
  }
  return undefined
}

async function clickButtonText(selector, text) {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((item) => item.textContent?.includes(${JSON.stringify(text)}))
    if (!(button instanceof HTMLElement)) throw new Error(${JSON.stringify(`找不到按钮：${text}`)})
    button.click()
  })()`)
}

async function capture(path) {
  const screenshot = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(screenshot.data, 'base64'))
}

async function waitFor(expression, timeout = 20_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error(`等待界面超时：${expression}`)
}

async function evaluate(expression) {
  const response = await client.call('Runtime.evaluate', {
    expression: `(async () => (${expression}))()`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (response.exceptionDetails) {
    throw new Error(redact(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text))
  }
  return response.result?.value
}

async function findTarget() {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      const targets = await response.json()
      const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
      if (target) return target
    } catch {
      // 等待隔离 Electron 调试端口。
    }
    await delay(100)
  }
  throw new Error('未找到隔离 Electron 页面。')
}

function redact(value) {
  return String(value)
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1***')
    .replace(/((?:api[_-]?key|authorization|token)["'\s:=]+)[^\s,"'}]+/gi, '$1***')
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

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
    this.listeners = new Map()
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        message.error ? pending.reject(new Error(redact(message.error.message))) : pending.resolve(message.result)
        return
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params)
    })
  }

  call(method, params = {}) {
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? []
    listeners.push(listener)
    this.listeners.set(method, listeners)
  }

  close() {
    this.socket.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${redact(error instanceof Error ? error.message : String(error))}\n`)
  process.exitCode = 1
})
