#!/usr/bin/env node

/** 使用原生 Electron CDP 验证推理流实时显示和落盘；不会启动 Chrome。 */
import { mkdir, writeFile } from 'node:fs/promises'

const port = Number(process.env.AIWRITEPAPER_CDP_PORT ?? 9349)
const outputDir = process.env.AIWRITEPAPER_REASONING_OUTPUT
if (!outputDir) throw new Error('缺少 AIWRITEPAPER_REASONING_OUTPUT。')
let client

async function main() {
  await mkdir(outputDir, { recursive: true })
  const target = await findTarget()
  client = await CdpClient.connect(target.webSocketDebuggerUrl)
  try {
    await client.call('Runtime.enable')
    await waitFor("Boolean(document.querySelector('.composer textarea') && window.paperAgent?.chat)")
    if (process.env.AIWRITEPAPER_REASONING_VERIFY_ONLY === '1') {
      await waitFor("Boolean(document.querySelector('.thinking-block'))")
      const persisted = await evaluate(`(async () => {
        const state = await window.paperAgent.workspace.get()
        const message = [...state.messages].reverse().find((item) => item.role === 'assistant' && item.reasoningContent)
        const block = [...document.querySelectorAll('.thinking-block')].at(-1)
        return { reasoning: message?.reasoningContent, status: message?.status, open: block?.open, label: block?.querySelector('summary')?.textContent?.replace(/\\s+/g, ' ').trim() }
      })()`)
      if (!persisted.reasoning?.includes('本地 QA 推理流') || persisted.status !== 'completed' || persisted.open) {
        throw new Error('重启后推理内容未持久化或历史思考块没有默认折叠。')
      }
      process.stdout.write(`${JSON.stringify({ ok: true, persisted }, null, 2)}\n`)
      return
    }
    await evaluate(`(() => {
      const textarea = document.querySelector('.composer textarea')
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter?.call(textarea, '请根据当前项目稿件说明下一步如何衔接。')
      textarea?.dispatchEvent(new Event('input', { bubbles: true }))
      document.querySelector('.send-button')?.click()
    })()`)
    await waitFor("Boolean(document.querySelector('.thinking-block.is-streaming'))")
    const streaming = await evaluate(`(() => {
      const block = document.querySelector('.thinking-block.is-streaming')
      return { open: block?.open, text: block?.textContent?.replace(/\\s+/g, ' ').trim() }
    })()`)
    if (!streaming.open || !streaming.text?.includes('正在思考')) throw new Error('推理流生成时没有自动展开。')

    await waitFor(`window.paperAgent.workspace.get().then((state) => {
      const message = [...state.messages].reverse().find((item) => item.role === 'assistant')
      return message?.status === 'completed' && message.reasoningContent?.includes('本地 QA 推理流')
    })`, 15_000)
    const completed = await evaluate(`(() => {
      const blocks = [...document.querySelectorAll('.thinking-block')]
      const block = blocks.at(-1)
      const body = block?.querySelector('.thinking-content')
      return { open: block?.open, label: block?.querySelector('summary')?.textContent?.replace(/\\s+/g, ' ').trim(), body: body?.textContent }
    })()`)
    if (!completed.body?.includes('本地 QA 推理流')) throw new Error('完成后界面没有保留推理内容。')
    const screenshot = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(`${outputDir}/reasoning-stream-completed.png`, Buffer.from(screenshot.data, 'base64'))
    process.stdout.write(`${JSON.stringify({ ok: true, streaming, completed }, null, 2)}\n`)
  } finally {
    client.close()
  }
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
  throw new Error('等待推理流界面超时。')
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
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (!message.id) return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result)
    })
  }

  call(method, params = {}) {
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    this.socket.close()
  }
}

await main()
