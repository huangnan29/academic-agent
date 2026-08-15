#!/usr/bin/env node

/** 使用原生 Electron 验证文稿底色、完成章节编号与默认 arXiv MCP；不会启动 Chrome。 */
import { mkdir, writeFile } from 'node:fs/promises'

const port = Number(process.env.AIWRITEPAPER_CDP_PORT ?? 9363)
const outputDir = process.env.AIWRITEPAPER_POLISH_OUTPUT
if (!outputDir) throw new Error('缺少 AIWRITEPAPER_POLISH_OUTPUT。')
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
    await waitFor("Boolean(window.paperAgent?.workspace && document.querySelector('.center-workspace'))")

    await evaluate(`(() => {
      const button = [...document.querySelectorAll('.view-switcher button')].find((item) => item.textContent?.includes('文稿'))
      if (!(button instanceof HTMLElement)) throw new Error('找不到文稿页签。')
      button.click()
    })()`)
    await waitFor("Boolean(document.querySelector('.manuscript-view'))")
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('.right-tabs button')].find((item) => item.textContent?.includes('稿件'))
      button?.click()
      const scroll = document.querySelector('.center-scroll')
      if (scroll instanceof HTMLElement) scroll.scrollTop = scroll.scrollHeight
    })()`)
    await waitFor("Boolean(document.querySelector('.academic-outline__number.is-generated'))")

    const manuscript = await evaluate(`(() => {
      const view = document.querySelector('.manuscript-view')
      const scroll = document.querySelector('.center-body.is-manuscript .center-scroll')
      const wrap = document.querySelector('.center-body.is-manuscript .composer-wrap')
      const generated = document.querySelector('.academic-outline__number.is-generated')
      if (!(view && scroll && wrap && generated)) return null
      return {
        viewBackground: getComputedStyle(view).backgroundColor,
        scrollBackground: getComputedStyle(scroll).backgroundColor,
        composerBackground: getComputedStyle(wrap).backgroundColor,
        generatedNumber: generated.textContent?.trim(),
        generatedBackground: getComputedStyle(generated).backgroundColor,
        generatedColor: getComputedStyle(generated).color,
      }
    })()`)
    if (!manuscript) throw new Error('文稿视觉元素不完整。')
    if (
      manuscript.viewBackground !== manuscript.scrollBackground
      || manuscript.scrollBackground !== manuscript.composerBackground
    ) throw new Error(`文稿底部仍有色差：${JSON.stringify(manuscript)}`)
    await capture(`${outputDir}/manuscript-bottom-and-green-outline.png`)

    await evaluate(`(() => {
      const button = document.querySelector('.primary-nav button[title="文献库"]')
      if (!(button instanceof HTMLElement)) throw new Error('找不到文献库入口。')
      button.click()
    })()`)
    await waitFor("Boolean(document.querySelector('.library-source-select'))")
    const literatureSource = await evaluate(`(() => {
      const select = document.querySelector('.library-source-select')
      if (!(select instanceof HTMLSelectElement)) return null
      return {
        value: select.value,
        label: select.selectedOptions[0]?.textContent?.trim(),
        options: [...select.options].map((option) => option.textContent?.trim()),
      }
    })()`)
    if (!literatureSource?.value.includes('builtin-arxiv-mcp') || !literatureSource.label?.includes('默认')) {
      throw new Error(`文献库没有默认选择内置 arXiv MCP：${JSON.stringify(literatureSource)}`)
    }
    await capture(`${outputDir}/library-default-arxiv-mcp.png`)

    if (runtimeErrors.length > 0) throw new Error(`原生界面存在运行时错误：${runtimeErrors.join('；')}`)
    process.stdout.write(`${JSON.stringify({ ok: true, manuscript, literatureSource, runtimeErrors }, null, 2)}\n`)
  } finally {
    client.close()
  }
}

async function capture(path) {
  const screenshot = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(screenshot.data, 'base64'))
}

async function waitFor(expression, timeout = 15_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
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
    await new Promise((resolve) => setTimeout(resolve, 150))
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
