#!/usr/bin/env node

/** 使用原生 Electron CDP 验证覆盖式设置导航和真实归档恢复；不会启动 Chrome。 */
import { mkdir, writeFile } from 'node:fs/promises'

const port = Number(process.env.AIWRITEPAPER_CDP_PORT ?? 9353)
const outputDir = process.env.AIWRITEPAPER_SETTINGS_OUTPUT
if (!outputDir) throw new Error('缺少 AIWRITEPAPER_SETTINGS_OUTPUT。')
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
    await waitFor("Boolean(document.querySelector('.sidebar-footer button') && window.paperAgent?.workspace)")
    await evaluate("document.querySelector('.sidebar-footer button')?.click()")
    await waitFor("Boolean(document.querySelector('.settings-sidebar') && document.querySelector('.settings-hub-page'))")

    const navigation = await evaluate(`(() => ({
      originalSidebarHidden: !document.querySelector('.sidebar'),
      backVisible: Boolean(document.querySelector('.settings-back-button')),
      groups: [...document.querySelectorAll('.settings-navigation-group h2')].map((item) => item.textContent?.trim()),
      items: [...document.querySelectorAll('.settings-navigation-group button span')].map((item) => item.textContent?.trim()),
      heading: document.querySelector('.settings-hub-header h1')?.textContent?.trim(),
    }))()`)
    const requiredGroups = ['个人', '集成', '编码', '已归档']
    const requiredItems = ['常规', '外观', '语音输入', '配置', '个性化', '键盘快捷键', '应用快照', '浏览器', '电脑控制', '钩子', '连接', 'Git', '环境', 'Worktrees', '已归档的对话']
    if (
      !navigation.originalSidebarHidden ||
      !navigation.backVisible ||
      navigation.heading !== '常规' ||
      requiredGroups.some((item) => !navigation.groups.includes(item)) ||
      requiredItems.some((item) => !navigation.items.includes(item))
    ) throw new Error(`设置导航不完整：${JSON.stringify(navigation)}`)
    await capture(`${outputDir}/settings-general.png`)

    await clickNavigation('配置')
    await waitFor("Boolean(document.querySelector('.settings-tabs') && document.querySelector('.settings-workbench'))")
    const configuration = await evaluate(`(() => ({
      tabs: [...document.querySelectorAll('.settings-tabs button')].map((item) => item.textContent?.replace(/\s+/g, ' ').trim()),
      providers: document.querySelectorAll('.settings-list .settings-row').length,
    }))()`)
    if (!configuration.tabs.some((item) => item?.includes('模型提供商')) || !configuration.tabs.some((item) => item?.includes('MCP 服务'))) {
      throw new Error('原有模型和 MCP 配置没有保留。')
    }

    await clickNavigation('应用快照')
    await waitFor("document.querySelector('.settings-hub-header h1')?.textContent?.trim() === '应用快照'")
    const snapshotState = await evaluate(`(() => ({
      shortcut: document.querySelector('.snapshot-shortcut-preview')?.textContent?.replace(/\s+/g, ' ').trim(),
      planned: document.querySelector('.settings-planned-badge')?.textContent?.trim(),
    }))()`)
    if (!snapshotState.shortcut?.includes('⌘') || snapshotState.planned !== '计划中') throw new Error('应用快照入口状态不正确。')
    await capture(`${outputDir}/settings-app-snapshot.png`)

    await clickNavigation('已归档的对话')
    await waitFor("document.querySelector('.settings-hub-header h1')?.textContent?.trim() === '已归档的对话'")
    const beforeRestore = await evaluate("window.paperAgent.workspace.get().then((state) => state.conversations.filter((item) => item.archived).length)")
    if (beforeRestore < 1) throw new Error('隔离工作区没有可验证的已归档对话。')
    await capture(`${outputDir}/settings-archived.png`)
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('.archived-conversation-row button')].find((item) => item.textContent?.includes('恢复并打开'))
      if (!(button instanceof HTMLElement)) throw new Error('找不到恢复并打开按钮。')
      button.click()
    })()`)
    await waitFor("Boolean(document.querySelector('.center-workspace'))")
    const afterRestore = await evaluate("window.paperAgent.workspace.get().then((state) => state.conversations.filter((item) => item.archived).length)")
    if (afterRestore !== beforeRestore - 1) throw new Error('归档对话没有真实恢复。')

    if (runtimeErrors.length > 0) throw new Error(`原生设置界面存在运行时错误：${runtimeErrors.join('；')}`)
    process.stdout.write(`${JSON.stringify({ ok: true, navigation, configuration, snapshotState, beforeRestore, afterRestore, runtimeErrors }, null, 2)}\n`)
  } finally {
    client.close()
  }
}

async function clickNavigation(label) {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.settings-navigation-group button')].find((item) => item.textContent?.trim() === ${JSON.stringify(label)})
    if (!(button instanceof HTMLElement)) throw new Error('找不到设置入口：${label}')
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
