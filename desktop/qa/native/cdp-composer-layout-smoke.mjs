#!/usr/bin/env node

/**
 * 在隔离工作区中验证 Codex 式输入框、目标/计划模式与右侧调宽。
 * 不触发真实模型请求，也不打开 Chrome。
 */

import { mkdir, writeFile } from 'node:fs/promises'

const port = Number(process.env.AIWRITEPAPER_CDP_PORT ?? 9343)
const outputDir = process.env.AIWRITEPAPER_COMPOSER_OUTPUT
if (!outputDir) throw new Error('缺少 AIWRITEPAPER_COMPOSER_OUTPUT。')
let client

async function main() {
  await mkdir(outputDir, { recursive: true })
  const target = await findTarget()
  client = await CdpClient.connect(target.webSocketDebuggerUrl)
  try {
    await client.call('Runtime.enable')
    await client.call('Log.enable')
    const runtimeErrors = []
    client.on('Runtime.exceptionThrown', (params) => runtimeErrors.push(params.exceptionDetails?.text ?? '运行时异常'))
    client.on('Log.entryAdded', (params) => {
      if (params.entry?.level === 'error') runtimeErrors.push(params.entry.text)
    })
    await waitFor("Boolean(window.paperAgent?.conversation?.chooseAttachments && document.querySelector('.composer'))")
    if (process.env.AIWRITEPAPER_COMPOSER_VERIFY_ONLY === '1') {
      const expectedGoal = process.env.AIWRITEPAPER_EXPECTED_GOAL
      const expectedWidth = Number(process.env.AIWRITEPAPER_EXPECTED_RIGHT_WIDTH)
      const state = await evaluate('window.paperAgent.workspace.get()')
      const project = state.projects.find((item) => item.id === state.settings.activeProjectId) ?? state.projects[0]
      const conversation = state.conversations.find((item) => item.id === project?.activeConversationId)
      const rightWidth = await evaluate("Math.round(document.querySelector('.right-workspace')?.getBoundingClientRect().width ?? 0)")
      const result = {
        ok: Boolean(conversation?.goal === expectedGoal && conversation?.planMode === true && conversation?.accessMode === 'full' && state.settings.rightPanelWidth === expectedWidth && rightWidth === expectedWidth && runtimeErrors.length === 0),
        goal: conversation?.goal,
        planMode: conversation?.planMode,
        accessMode: conversation?.accessMode,
        savedWidth: state.settings.rightPanelWidth,
        renderedWidth: rightWidth,
        runtimeErrors,
      }
      if (!result.ok) throw new Error('目标、计划模式、右栏宽度或运行时状态未在重启后恢复。')
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
      return
    }
    const initialState = await evaluate('window.paperAgent.workspace.get()')
    const project = initialState.projects.find((item) => item.id === initialState.settings.activeProjectId) ?? initialState.projects[0]
    const conversation = initialState.conversations.find((item) => item.id === project?.activeConversationId)
    if (!project || !conversation) throw new Error('隔离工作区没有可验证的研究对话。')

    const neutralBorder = await evaluate(`(() => {
      const composer = document.querySelector('.composer')
      const textarea = composer?.querySelector('textarea')
      if (!(composer instanceof HTMLElement) || !(textarea instanceof HTMLElement)) return null
      const before = getComputedStyle(composer).borderColor
      const textareaBefore = getComputedStyle(textarea).boxShadow
      textarea.focus()
      const after = getComputedStyle(composer).borderColor
      const textareaAfter = getComputedStyle(textarea).boxShadow
      return { before, after, textareaBefore, textareaAfter }
    })()`)
    if (
      !neutralBorder ||
      neutralBorder.before !== neutralBorder.after ||
      neutralBorder.textareaAfter !== 'none'
    ) {
      throw new Error('输入框聚焦后仍出现额外高亮。')
    }

    await evaluate("document.querySelector('.composer-add .icon-button')?.click()")
    await waitFor("Boolean(document.querySelector('.composer-add-menu'))")
    await capture(`${outputDir}/composer-add-menu.png`)
    await clickMenuText('计划模式')
    await waitForState((state) => state.conversations.find((item) => item.id === conversation.id)?.planMode === true)

    await evaluate("document.querySelector('.composer-add .icon-button')?.click()")
    await waitFor("Boolean(document.querySelector('.composer-add-menu'))")
    await clickMenuText('目标')
    await waitFor("Boolean(document.querySelector('.composer-goal-dialog'))")
    const goal = '持续形成证据可追溯的论文计划，并在执行前明确步骤与边界。'
    await evaluate(`(() => {
      const textarea = document.querySelector('.composer-goal-dialog textarea')
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter?.call(textarea, ${JSON.stringify(goal)})
      textarea?.dispatchEvent(new Event('input', { bubbles: true }))
      textarea?.dispatchEvent(new Event('change', { bubbles: true }))
      const save = [...document.querySelectorAll('.composer-goal-actions button')].find((item) => item.textContent?.includes('保存目标'))
      save?.click()
    })()`)
    await waitForState((state) => state.conversations.find((item) => item.id === conversation.id)?.goal === goal)

    await evaluate("document.querySelector('.access-picker-trigger')?.click()")
    await waitFor("Boolean(document.querySelector('.access-picker-menu'))")
    await capture(`${outputDir}/composer-access-menu.png`)
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('.access-picker-menu button')].find(
        (item) => item.textContent?.includes('完全访问权限'),
      )
      if (!(button instanceof HTMLElement)) throw new Error('权限菜单缺少完全访问权限。')
      button.click()
    })()`)
    await waitForState((state) => state.conversations.find((item) => item.id === conversation.id)?.accessMode === 'full')

    await evaluate("document.querySelector('button[aria-label=\"整理侧边栏\"]')?.click()")
    await waitFor("Boolean(document.querySelector('.sidebar-organize-menu'))")
    const organizeLayout = await evaluate(`(() => {
      const menu = document.querySelector('.sidebar-organize-menu')?.getBoundingClientRect()
      const rows = [...document.querySelectorAll('.sidebar-organize-menu button')].map((button) => {
        const rect = button.getBoundingClientRect()
        const label = button.querySelector('span')?.getBoundingClientRect()
        return { text: button.textContent?.replace(/\s+/g, ' ').trim(), height: rect.height, labelWidth: label?.width ?? 0, labelHeight: label?.height ?? 0 }
      })
      return menu ? { width: menu.width, height: menu.height, rows } : null
    })()`)
    const longRows = organizeLayout?.rows.filter((row) => row.text?.includes('归档') || row.text?.includes('研究文件夹')) ?? []
    if (!organizeLayout || organizeLayout.rows.some((row) => row.height > 38 || row.labelHeight > 20) || longRows.some((row) => row.labelWidth < 80)) {
      throw new Error(`整理侧边栏菜单仍存在文字竖排或行重叠：${JSON.stringify(organizeLayout)}`)
    }
    await capture(`${outputDir}/sidebar-organize-menu-fixed.png`)
    await evaluate("document.querySelector('button[aria-label=\"整理侧边栏\"]')?.click()")

    const initialWidth = await evaluate("Math.round(document.querySelector('.right-workspace')?.getBoundingClientRect().width ?? 0)")
    const resizer = await evaluate(`(() => {
      const rect = document.querySelector('.right-resizer')?.getBoundingClientRect()
      return rect ? { x: rect.x + rect.width / 2, y: Math.min(420, rect.height / 2) } : null
    })()`)
    if (!resizer) throw new Error('没有找到右侧工作台拖动条。')
    await client.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: resizer.x, y: resizer.y })
    await client.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: resizer.x, y: resizer.y, button: 'left', buttons: 1, clickCount: 1 })
    await client.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: resizer.x - 72, y: resizer.y, button: 'left', buttons: 1 })
    await client.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: resizer.x - 72, y: resizer.y, button: 'left', buttons: 0, clickCount: 1 })
    await waitForState((state) => Number(state.settings.rightPanelWidth) >= initialWidth + 55)

    const layout = await evaluate(`(() => {
      const composer = document.querySelector('.composer')?.getBoundingClientRect()
      const model = document.querySelector('.model-picker-trigger')?.getBoundingClientRect()
      const right = document.querySelector('.right-workspace')?.getBoundingClientRect()
      return composer && model && right ? {
        composerWidth: Math.round(composer.width),
        modelAtRight: model.x > composer.x + composer.width / 2,
        rightWidth: Math.round(right.width),
      } : null
    })()`)
    if (!layout?.modelAtRight) throw new Error('模型选择器没有位于输入框右侧。')
    await capture(`${outputDir}/composer-goal-plan-resized-right.png`)

    const state = await evaluate('window.paperAgent.workspace.get()')
    if (runtimeErrors.length > 0) throw new Error(`原生界面存在运行时错误：${runtimeErrors.join('；')}`)
    process.stdout.write(`${JSON.stringify({
      ok: true,
      neutralBorder,
      goalSaved: state.conversations.find((item) => item.id === conversation.id)?.goal === goal,
      planMode: state.conversations.find((item) => item.id === conversation.id)?.planMode === true,
      accessMode: state.conversations.find((item) => item.id === conversation.id)?.accessMode,
      initialWidth,
      savedWidth: state.settings.rightPanelWidth,
      layout,
      organizeLayout,
      runtimeErrors,
    }, null, 2)}\n`)
  } finally {
    client.close()
  }
}

async function clickMenuText(text) {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.composer-add-menu button')].find(
      (item) => item.textContent?.replace(/\s+/g, ' ').includes(${JSON.stringify(text)}),
    )
    if (!(button instanceof HTMLElement)) throw new Error('添加菜单中找不到：${text}')
    button.click()
  })()`)
}

async function waitForState(predicate, timeout = 8_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const state = await evaluate('window.paperAgent.workspace.get()')
    if (predicate(state)) return
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
  throw new Error('等待工作区状态更新超时。')
}

async function waitFor(predicate, timeout = 12_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await evaluate(predicate)) return
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('等待界面状态更新超时。')
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
