#!/usr/bin/env node

/**
 * 原生权限中心只读冒烟：不点击申请、不打开系统设置，也不修改 macOS 权限。
 */
import { mkdir, writeFile } from 'node:fs/promises'

const port = Number(process.env.AIWRITEPAPER_CDP_PORT ?? 9347)
const outputDir = process.env.AIWRITEPAPER_PERMISSION_OUTPUT
if (!outputDir) throw new Error('缺少 AIWRITEPAPER_PERMISSION_OUTPUT。')

let client

async function main() {
  await mkdir(outputDir, { recursive: true })
  const target = await findTarget()
  client = await CdpClient.connect(target.webSocketDebuggerUrl)
  try {
  await client.call('Runtime.enable')
  await waitFor("Boolean(window.paperAgent?.systemPermissions?.get && document.querySelector('.composer'))")
  const snapshot = await evaluate('window.paperAgent.systemPermissions.get()')
  if (!snapshot || snapshot.platform !== 'macos') throw new Error('没有读取到真实 macOS 权限状态。')

  await evaluate("document.querySelector('.access-picker-trigger')?.click()")
  await waitFor("Boolean(document.querySelector('.access-picker-menu'))")
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.access-picker-menu button')].find(
      (item) => item.textContent?.includes('管理 macOS 权限'),
    )
    if (!(button instanceof HTMLElement)) throw new Error('权限菜单缺少管理入口。')
    button.click()
  })()`)
  await waitFor("document.querySelectorAll('.system-permission-row').length === 3")

  const dialog = await evaluate(`(() => ({
    title: document.querySelector('#system-permission-title')?.textContent,
    rows: [...document.querySelectorAll('.system-permission-row')].map((row) => row.textContent?.replace(/\\s+/g, ' ').trim()),
    enableDisabled: document.querySelector('.system-permission-footer .primary-button')?.disabled,
  }))()`)
  const image = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(`${outputDir}/system-permission-center.png`, Buffer.from(image.data, 'base64'))

  const state = await evaluate('window.paperAgent.workspace.get()')
  const project = state.projects.find((item) => item.id === state.settings.activeProjectId) ?? state.projects[0]
  const conversation = state.conversations.find((item) => item.id === project?.activeConversationId)
  if (!conversation) throw new Error('隔离工作区没有可验证的对话。')

  const enforcement = await evaluate(`(async () => {
    try {
      await window.paperAgent.conversation.update({ conversationId: ${JSON.stringify(conversation.id)}, accessMode: 'full' })
      await window.paperAgent.conversation.update({ conversationId: ${JSON.stringify(conversation.id)}, accessMode: 'ask' })
      return { allowed: true }
    } catch (error) {
      return { allowed: false, message: error instanceof Error ? error.message : String(error) }
    }
  })()`)

  if (snapshot.fullAccessReady !== enforcement.allowed) {
    throw new Error('主进程权限门禁与真实系统状态不一致。')
  }
  if (dialog.enableDisabled === snapshot.fullAccessReady) {
    throw new Error('权限中心启用按钮状态与系统授权状态不一致。')
  }

  process.stdout.write(`${JSON.stringify({ ok: true, snapshot, dialog, enforcement }, null, 2)}\n`)
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
      // 等待 Electron 调试端口就绪。
    }
    await new Promise((resolve) => setTimeout(resolve, 180))
  }
  throw new Error('未找到 Electron 页面。')
}

async function waitFor(predicate, timeout = 12_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await evaluate(predicate)) return
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('等待权限界面超时。')
}

async function evaluate(expression) {
  const response = await client.call('Runtime.evaluate', {
    expression: `(async () => (${expression}))()`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
  }
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
