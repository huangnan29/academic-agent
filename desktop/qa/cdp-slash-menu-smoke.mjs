#!/usr/bin/env node

/** 在隔离的原生 Electron 工作区验证输入框“/”Skill/MCP 工具选择器；不会发送消息。 */
import { mkdir, writeFile } from 'node:fs/promises'

const port = Number(process.env.AIWRITEPAPER_CDP_PORT ?? 9374)
const outputDir = process.env.AIWRITEPAPER_SLASH_OUTPUT
if (!outputDir) throw new Error('缺少 AIWRITEPAPER_SLASH_OUTPUT。')
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
    await waitFor("Boolean(window.paperAgent?.skill?.save && document.querySelector('.composer textarea'))")
    await evaluate(`window.paperAgent.skill.save({
      name: '论证链检查',
      description: '检查主张、证据与结论是否连贯',
      instructions: '回答前先识别关键主张，并逐项核对证据。',
      enabled: true,
    }).then(() => location.reload())`)
    await waitFor("Boolean(document.querySelector('.composer textarea'))")

    await setComposerValue('/')
    await waitFor("Boolean(document.querySelector('.composer-slash-menu'))")
    const menu = await evaluate(`(() => ({
      groups: [...document.querySelectorAll('.composer-slash-group-label')].map((item) => item.textContent?.trim()),
      labels: [...document.querySelectorAll('.composer-slash-copy strong')].map((item) => item.textContent?.trim()),
      rect: (() => {
        const value = document.querySelector('.composer-slash-menu')?.getBoundingClientRect()
        return value ? { x: value.x, y: value.y, width: value.width, height: value.height, viewportHeight: innerHeight } : null
      })(),
    }))()`)
    if (!menu.groups.includes('Skills') || !menu.groups.includes('MCP 工具')) throw new Error('“/”菜单没有按 Skill/MCP 工具分组。')
    if (!menu.labels.includes('论证链检查') || !menu.labels.includes('/search_papers')) throw new Error('“/”菜单没有列出应用内 Skill 或 arXiv search_papers。')
    if (!menu.rect || menu.rect.y < 0 || menu.rect.y + menu.rect.height > menu.rect.viewportHeight) throw new Error('“/”菜单超出窗口可见区域。')
    await capture(`${outputDir}/slash-menu-groups.png`)

    await evaluate(`(() => {
      const option = [...document.querySelectorAll('.composer-slash-group > button')]
        .find((item) => item.querySelector('.composer-slash-copy strong')?.textContent?.trim() === '论证链检查')
      if (!(option instanceof HTMLButtonElement)) throw new Error('未找到论证链检查 Skill。')
      option.click()
    })()`)
    await waitFor("document.querySelectorAll('.composer-reference-chip').length === 1")
    await setComposerValue('/search_papers')
    await waitFor("[...document.querySelectorAll('.composer-slash-copy strong')].some((item) => item.textContent?.trim() === '/search_papers')")
    await evaluate(`(() => {
      const option = [...document.querySelectorAll('.composer-slash-group > button')]
        .find((item) => item.querySelector('.composer-slash-copy strong')?.textContent?.trim() === '/search_papers')
      if (!(option instanceof HTMLButtonElement)) throw new Error('未找到 search_papers 选项。')
      option.click()
    })()`)
    await waitFor("document.querySelectorAll('.composer-reference-chip').length === 2")
    const selected = await evaluate(`(() => ({
      chips: [...document.querySelectorAll('.composer-reference-chip > span')].map((item) => item.textContent?.trim()),
      value: document.querySelector('.composer textarea')?.value,
      menuOpen: Boolean(document.querySelector('.composer-slash-menu')),
    }))()`)
    if (!selected.chips.includes('论证链检查') || !selected.chips.some((label) => label?.includes('/search_papers') && label?.includes('arXiv'))) throw new Error('Skill/MCP 工具没有形成可见引用标签。')
    if (selected.value.includes('/') || selected.menuOpen) throw new Error('选择能力后没有清理 slash 查询或关闭菜单。')
    await capture(`${outputDir}/slash-selected-chips.png`)

    await setComposerValue('/论证')
    await pressKey('Enter')
    await waitFor("!document.querySelector('.composer-slash-menu')")
    const duplicateCount = await evaluate("document.querySelectorAll('.composer-reference-chip').length")
    if (duplicateCount !== 2) throw new Error('重复选择同一能力时没有去重。')
    if (runtimeErrors.length > 0) throw new Error(`界面存在运行时错误：${runtimeErrors.join('；')}`)

    process.stdout.write(`${JSON.stringify({ ok: true, menu, selected, duplicateCount, runtimeErrors }, null, 2)}\n`)
  } finally {
    client.close()
  }
}

async function setComposerValue(value) {
  await evaluate(`(() => {
    const textarea = document.querySelector('.composer textarea')
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error('找不到输入框。')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(textarea, ${JSON.stringify(value)})
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.focus()
    textarea.setSelectionRange(${value.length}, ${value.length})
    textarea.dispatchEvent(new Event('select', { bubbles: true }))
  })()`)
}

async function pressKey(key) {
  await client.call('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key === 'Enter' ? 'Enter' : key })
  await client.call('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key === 'Enter' ? 'Enter' : key })
}

async function waitFor(predicate, timeout = 12_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await evaluate(predicate)) return
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
  throw new Error(`等待界面状态超时：${predicate}`)
}

async function capture(path) {
  const response = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(response.data, 'base64'))
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
      // Electron 尚未开放调试端口时继续等待。
    }
    await new Promise((resolve) => setTimeout(resolve, 180))
  }
  throw new Error('未找到 Electron 页面。')
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
      if (!message.id) {
        for (const listener of this.listeners.get(message.method) ?? []) listener(message.params)
        return
      }
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result)
    })
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? []
    listeners.push(listener)
    this.listeners.set(method, listeners)
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
