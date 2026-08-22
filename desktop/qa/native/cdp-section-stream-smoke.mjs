#!/usr/bin/env node

/** 使用原生 Electron CDP 验证章节正文与 Thinking 流，以及文稿对话自动切页；不会启动 Chrome。 */
import { mkdir, writeFile } from 'node:fs/promises'

const port = Number(process.env.AIWRITEPAPER_CDP_PORT ?? 9355)
const outputDir = process.env.AIWRITEPAPER_SECTION_STREAM_OUTPUT
if (!outputDir) throw new Error('缺少 AIWRITEPAPER_SECTION_STREAM_OUTPUT。')
let client

async function main() {
  await mkdir(outputDir, { recursive: true })
  const target = await findTarget()
  client = await CdpClient.connect(target.webSocketDebuggerUrl)
  const runtimeErrors = []
  try {
    await client.call('Runtime.enable')
    await client.call('Log.enable')
    client.on('Runtime.exceptionThrown', (params) => runtimeErrors.push(params.exceptionDetails?.text ?? '运行时异常'))
    client.on('Log.entryAdded', (params) => {
      if (params.entry?.level === 'error') runtimeErrors.push(params.entry.text)
    })
    await waitFor("Boolean(document.querySelector('.view-switcher') && window.paperAgent?.section?.onEvent)")
    await clickButtonText('.view-switcher button', '文稿')
    await waitFor("Boolean(document.querySelector('.manuscript-view'))")
    await clickFirstButtonText('.manuscript-toolbar button', ['生成本章', '重新生成'])
    await waitFor("Boolean(document.querySelector('.section-streaming-label'))")
    await waitFor("Boolean(document.querySelector('.thinking-block.is-streaming'))")
    await waitFor("(document.querySelector('.section-streaming-content .markdown-body')?.textContent?.length ?? 0) > 20")
    if (process.env.AIWRITEPAPER_SECTION_EXPECT_ERROR === '1') {
      await waitFor("Boolean(document.querySelector('.section-generation-error'))", 20_000)
      const failure = await sectionSnapshot()
      const errorText = await evaluate("document.querySelector('.section-generation-error')?.textContent?.replace(/\\s+/g, ' ').trim()")
      if (failure.generating || failure.contentLength < 20 || !errorText?.includes('已经保留')) {
        throw new Error(`章节错误态没有保留正文片段：${JSON.stringify({ failure, errorText })}`)
      }
      await capture(`${outputDir}/section-stream-error.png`)
      if (runtimeErrors.length > 0) throw new Error(`原生章节错误态存在运行时错误：${runtimeErrors.join('；')}`)
      process.stdout.write(`${JSON.stringify({ ok: true, failure, errorText, runtimeErrors }, null, 2)}\n`)
      return
    }
    const early = await sectionSnapshot()
    await new Promise((resolve) => setTimeout(resolve, 260))
    const later = await sectionSnapshot()
    if (!early.generating || !later.generating || later.contentLength <= early.contentLength) {
      throw new Error(`章节正文没有渐进增长：${JSON.stringify({ early, later })}`)
    }
    await capture(`${outputDir}/section-streaming.png`)

    await waitFor("document.querySelector('.section-streaming-label') === null", 20_000)
    const completed = await sectionSnapshot()
    if (completed.status !== '草稿' || completed.contentLength <= later.contentLength || !completed.thinkingLabel?.includes('思考过程')) {
      throw new Error(`章节完成态不正确：${JSON.stringify(completed)}`)
    }
    const generationMetadata = await evaluate(`(async () => {
      const state = await window.paperAgent.workspace.get()
      const project = state.projects.find((item) => item.id === state.settings.activeProjectId) ?? state.projects[0]
      const section = state.sections.find((item) => item.id === project?.activeSectionId)
      const version = state.sectionVersions.find((item) => item.id === section?.activeGenerationVersionId)
      return {
        profile: section?.generationProfile,
        mode: section?.generationMode,
        strategies: section?.generationStrategyIds,
        versionProfile: version?.generationProfile,
        versionStrategies: version?.generationStrategyIds,
        visibleMetadata: [...document.querySelectorAll('.section-generation-model')]
          .map((item) => item.textContent?.replace(/\s+/g, ' ').trim()),
      }
    })()`)
    if (!generationMetadata.profile
      || generationMetadata.mode !== 'initial'
      || generationMetadata.strategies?.length === 0
      || generationMetadata.versionProfile !== generationMetadata.profile
      || JSON.stringify(generationMetadata.versionStrategies) !== JSON.stringify(generationMetadata.strategies)
      || !generationMetadata.visibleMetadata.some((item) => item?.includes('证据优先') || item?.includes('自然学术') || item?.includes('论证深化') || item?.includes('精炼表达'))) {
      throw new Error(`章节感知元数据没有完整落盘或显示：${JSON.stringify(generationMetadata)}`)
    }
    await capture(`${outputDir}/section-completed.png`)

    const textarea = await evaluate(`(() => {
      const element = document.querySelector('.composer textarea')
      return element ? true : false
    })()`)
    if (!textarea) throw new Error('文稿页没有对话输入框。')
    await evaluate(`(() => {
      const textarea = document.querySelector('.composer textarea')
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter?.call(textarea, '请继续说明这一章的论证结构。')
      textarea?.dispatchEvent(new Event('input', { bubbles: true }))
      document.querySelector('.send-button')?.click()
    })()`)
    await waitFor("Boolean(document.querySelector('.conversation-stream'))")
    const chatTransition = await evaluate(`(async () => {
      const state = await window.paperAgent.workspace.get()
      return {
        activeView: [...document.querySelectorAll('.view-switcher button')].find((item) => item.classList.contains('is-active'))?.textContent?.replace(/\s+/g, ' ').trim(),
        contextScope: [...state.messages].reverse().find((item) => item.role === 'user')?.contextScope,
      }
    })()`)
    if (!chatTransition.activeView?.includes('对话') || chatTransition.contextScope !== 'section') {
      throw new Error(`文稿页对话没有切到聊天或丢失章节上下文：${JSON.stringify(chatTransition)}`)
    }
    await capture(`${outputDir}/manuscript-message-opened-chat.png`)

    if (runtimeErrors.length > 0) throw new Error(`原生章节流界面存在运行时错误：${runtimeErrors.join('；')}`)
    process.stdout.write(`${JSON.stringify({ ok: true, early, later, completed, generationMetadata, chatTransition, runtimeErrors }, null, 2)}\n`)
  } finally {
    client.close()
  }
}

async function sectionSnapshot() {
  return evaluate(`(() => ({
    generating: Boolean(document.querySelector('.section-streaming-label')),
    contentLength: document.querySelector('.section-streaming-content .markdown-body')?.textContent?.length ?? 0,
    status: [...document.querySelectorAll('.manuscript-toolbar .status-badge')].at(-1)?.textContent?.trim(),
    model: document.querySelector('.section-generation-model')?.textContent?.replace(/\s+/g, ' ').trim(),
    thinkingLabel: document.querySelector('.section-thinking-wrap summary')?.textContent?.replace(/\s+/g, ' ').trim(),
  }))()`)
}

async function clickButtonText(selector, text) {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll(${JSON.stringify(selector)})].find((item) => item.textContent?.includes(${JSON.stringify(text)}))
    if (!(button instanceof HTMLElement)) throw new Error('找不到按钮：${text}')
    button.click()
  })()`)
}

async function clickFirstButtonText(selector, labels) {
  await evaluate(`(() => {
    const labels = ${JSON.stringify(labels)}
    const button = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((item) => labels.some((label) => item.textContent?.includes(label)))
    if (!(button instanceof HTMLElement)) throw new Error('找不到按钮：' + labels.join(' / '))
    button.click()
  })()`)
}

async function capture(path) {
  const screenshot = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(screenshot.data, 'base64'))
}

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

async function waitFor(expression, timeout = 12_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`等待界面超时：${expression}`)
}

async function evaluate(expression) {
  const response = await client.call('Runtime.evaluate', {
    expression: `(async () => (${expression}))()`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
  return response.result?.value
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
    this.listeners = new Map()
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result)
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

await main()
