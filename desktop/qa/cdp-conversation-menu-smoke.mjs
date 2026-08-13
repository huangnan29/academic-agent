#!/usr/bin/env node

/**
 * 通过原生 Electron 的 CDP 接口验证对话菜单与侧栏调宽。
 * 调用方必须传入隔离的 user-data-dir，避免修改用户真实工作区。
 */

import { mkdir, writeFile } from 'node:fs/promises'

const port = Number(process.env.AIWRITEPAPER_CDP_PORT ?? 9342)
const outputDir = process.env.AIWRITEPAPER_CONVERSATION_OUTPUT
if (!outputDir) throw new Error('缺少 AIWRITEPAPER_CONVERSATION_OUTPUT。')
let client

async function main() {
  await mkdir(outputDir, { recursive: true })
  const target = await findTarget()
  client = await CdpClient.connect(target.webSocketDebuggerUrl)
  try {
    await waitFor('Boolean(window.paperAgent?.conversation?.update && window.paperAgent?.conversation?.move)')
    if (process.env.AIWRITEPAPER_CONVERSATION_VERIFY_ONLY === '1') {
      const expectedTitle = process.env.AIWRITEPAPER_EXPECTED_CONVERSATION_TITLE
      const expectedWidth = Number(process.env.AIWRITEPAPER_EXPECTED_SIDEBAR_WIDTH)
      const state = await evaluate('window.paperAgent.workspace.get()')
      const conversation = state.conversations.find((item) => item.title === expectedTitle)
      const result = {
        ok: Boolean(conversation && state.settings.sidebarWidth === expectedWidth),
        conversationTitle: conversation?.title,
        archived: conversation?.archived === true,
        pinned: conversation?.pinned === true,
        unread: conversation?.unread === true,
        sidebarWidth: state.settings.sidebarWidth,
      }
      if (!result.ok) throw new Error('对话状态或侧栏宽度未在重启后恢复。')
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
      return
    }

    const suffix = String(Date.now()).slice(-6)
    const firstProject = await createProject(`侧栏菜单测试 A-${suffix}`)
    const secondProject = await createProject(`侧栏菜单测试 B-${suffix}`)
    await evaluate(`window.paperAgent.project.setActive(${JSON.stringify(firstProject.id)})`)
    await evaluate(`window.paperAgent.conversation.create(${JSON.stringify(firstProject.id)})`)
    let state = await evaluate('window.paperAgent.workspace.get()')
    const conversation = state.conversations.find(
      (item) => item.projectId === firstProject.id && item.id === state.projects.find((project) => project.id === firstProject.id)?.activeConversationId,
    )
    if (!conversation) throw new Error('没有找到待验证对话。')
    await evaluate(`window.paperAgent.workspace.setSidebarPreferences({
      viewMode: 'projects',
      chatSort: 'priority',
      expandedProjectIds: [${JSON.stringify(firstProject.id)}, ${JSON.stringify(secondProject.id)}]
    })`)
    await client.call('Page.reload', { ignoreCache: true })
    await waitFor('Boolean(window.paperAgent?.workspace)')
    await waitFor(`Boolean(document.querySelector('.research-group.is-active .research-conversation'))`)

    await openContextMenu(firstProject.title, conversation.id, true)
    await capture(`${outputDir}/conversation-context-menu.png`)
    await clickContextMenuText('置顶聊天')
    await waitForState((next) => next.conversations.find((item) => item.id === conversation.id)?.pinned === true)

    const renamedTitle = `论文证据梳理-${suffix}`
    await openContextMenu(firstProject.title, conversation.id)
    await clickContextMenuText('重命名聊天')
    await waitFor("Boolean(document.querySelector('.conversation-rename-dialog input'))")
    await evaluate(`(() => {
      const input = document.querySelector('.conversation-rename-dialog input')
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, ${JSON.stringify(renamedTitle)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      document.querySelector('.conversation-rename-dialog button[type="submit"]')?.click()
    })()`)
    await waitForState((next) => next.conversations.find((item) => item.id === conversation.id)?.title === renamedTitle)

    await openContextMenu(firstProject.title, conversation.id)
    await clickContextMenuText('标记为未读')
    await waitForState((next) => next.conversations.find((item) => item.id === conversation.id)?.unread === true)

    await openContextMenu(firstProject.title, conversation.id)
    await clickContextMenuText('移至研究')
    await waitFor("Boolean(document.querySelector('.conversation-move-submenu'))")
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('.conversation-move-submenu button')].find(
        (item) => item.textContent?.includes(${JSON.stringify(secondProject.title)}),
      )
      if (!(button instanceof HTMLElement)) throw new Error('找不到目标研究。')
      button.click()
    })()`)
    await waitForState((next) => next.conversations.find((item) => item.id === conversation.id)?.projectId === secondProject.id)

    await openContextMenu(secondProject.title, conversation.id)
    await clickContextMenuText('归档聊天')
    await waitForState((next) => next.conversations.find((item) => item.id === conversation.id)?.archived === true)
    state = await evaluate('window.paperAgent.workspace.get()')
    if (state.settings.sidebarShowArchived !== true) {
      await openOrganizeMenu()
      await clickOrganizeText('显示已归档对话')
      await waitForState((next) => next.settings.sidebarShowArchived === true)
    }
    await waitFor(`Boolean([...document.querySelectorAll('.research-conversation')].find((item) => item.getAttribute('title') === ${JSON.stringify(renamedTitle)}))`)
    await openContextMenu(secondProject.title, conversation.id)
    await clickContextMenuText('取消归档聊天')
    await waitForState((next) => next.conversations.find((item) => item.id === conversation.id)?.archived === false)

    await openContextMenu(secondProject.title, conversation.id)
    await clickContextMenuText('复制会话 ID')
    await waitFor(`document.body.textContent?.includes('会话 ID 已复制') === true`)

    const initialWidth = await evaluate("document.querySelector('.sidebar')?.getBoundingClientRect().width")
    const resizer = await evaluate(`(() => {
      const rect = document.querySelector('.sidebar-resizer')?.getBoundingClientRect()
      return rect ? { x: rect.x + rect.width / 2, y: rect.y + Math.min(420, rect.height / 2) } : null
    })()`)
    if (!resizer) throw new Error('没有找到侧栏拖动条。')
    await client.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: resizer.x, y: resizer.y })
    await client.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: resizer.x, y: resizer.y, button: 'left', buttons: 1, clickCount: 1 })
    await client.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: resizer.x + 86, y: resizer.y, button: 'left', buttons: 1 })
    await client.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: resizer.x + 86, y: resizer.y, button: 'left', buttons: 0, clickCount: 1 })
    await waitForState((next) => Number(next.settings.sidebarWidth) >= Number(initialWidth) + 70)
    state = await evaluate('window.paperAgent.workspace.get()')
    const savedWidth = state.settings.sidebarWidth
    await evaluate(`document.querySelector('button[aria-label="收起侧栏"]')?.click()`)
    await waitFor(`Math.round(document.querySelector('.sidebar')?.getBoundingClientRect().width ?? 0) === 80`)
    await evaluate(`document.querySelector('button[aria-label="展开侧栏"]')?.click()`)
    await waitFor(`Math.round(document.querySelector('.sidebar')?.getBoundingClientRect().width ?? 0) === ${Number(savedWidth)}`)
    await capture(`${outputDir}/conversation-menu-resized-sidebar.png`)

    const finalConversation = state.conversations.find((item) => item.id === conversation.id)
    const result = {
      ok: true,
      conversationId: conversation.id,
      conversationTitle: finalConversation?.title,
      pinned: finalConversation?.pinned === true,
      unread: finalConversation?.unread === true,
      archivedRestored: finalConversation?.archived === false,
      movedToProject: finalConversation?.projectId === secondProject.id,
      copiedId: true,
      initialWidth,
      savedWidth,
      collapseAndRestoreWidth: true,
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } finally {
    client.close()
  }
}

async function createProject(title) {
  return evaluate(`window.paperAgent.project.create({
    title: ${JSON.stringify(title)},
    paperType: '研究论文',
    discipline: '教育技术',
    language: 'zh-CN',
    targetWords: 5000,
    requirements: '原生侧栏隔离验收项目',
    keywords: ['侧栏', '对话']
  })`)
}

async function openContextMenu(projectTitle, conversationId, nativeRightClick = false) {
  await waitFor(`Boolean([...document.querySelectorAll('.research-folder-button')].find((item) => item.getAttribute('title') === ${JSON.stringify(projectTitle)}))`)
  const point = await evaluate(`(() => {
    const statePromise = window.paperAgent.workspace.get()
    return statePromise.then((state) => {
      const conversation = state.conversations.find((item) => item.id === ${JSON.stringify(conversationId)})
      const project = state.projects.find((item) => item.id === conversation?.projectId)
      const title = ['新的研究任务', project?.title].includes(conversation?.title) ? '研究对话' : conversation?.title
      const group = [...document.querySelectorAll('.research-group')].find(
        (item) => item.querySelector('.research-folder-button')?.getAttribute('title') === ${JSON.stringify(projectTitle)},
      )
      const row = [...(group?.querySelectorAll('.research-conversation') ?? [])].find((item) => item.getAttribute('title') === title)
      const rect = row?.getBoundingClientRect()
      return rect ? { x: rect.x + Math.min(90, rect.width / 2), y: rect.y + rect.height / 2 } : null
    })
  })()`)
  if (!point) throw new Error('找不到对话行。')
  if (nativeRightClick) {
    await client.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'right', buttons: 2, clickCount: 1 })
    await client.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'right', buttons: 0, clickCount: 1 })
  } else {
    await evaluate(`(() => {
      const statePromise = window.paperAgent.workspace.get()
      return statePromise.then((state) => {
        const conversation = state.conversations.find((item) => item.id === ${JSON.stringify(conversationId)})
        const project = state.projects.find((item) => item.id === conversation?.projectId)
        const title = ['新的研究任务', project?.title].includes(conversation?.title) ? '研究对话' : conversation?.title
        const group = [...document.querySelectorAll('.research-group')].find(
          (item) => item.querySelector('.research-folder-button')?.getAttribute('title') === ${JSON.stringify(projectTitle)},
        )
        const row = [...(group?.querySelectorAll('.research-conversation') ?? [])].find((item) => item.getAttribute('title') === title)
        row?.closest('.research-conversation-row')?.querySelector('.conversation-more')?.click()
      })
    })()`)
  }
  await waitFor("Boolean(document.querySelector('.conversation-context-menu'))")
}

async function clickContextMenuText(text) {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.conversation-context-menu > button, .conversation-context-menu > .conversation-move-entry > button')].find(
      (item) => item.textContent?.replace(/\s+/g, ' ').trim().includes(${JSON.stringify(text)}),
    )
    if (!(button instanceof HTMLElement)) throw new Error('对话菜单中找不到：${text}')
    button.click()
  })()`)
}

async function openOrganizeMenu() {
  await evaluate(`document.querySelector('button[aria-label="整理侧边栏"]')?.click()`)
  await waitFor("Boolean(document.querySelector('.sidebar-organize-menu'))")
}

async function clickOrganizeText(text) {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.sidebar-organize-menu button')].find(
      (item) => item.textContent?.replace(/\s+/g, ' ').trim().includes(${JSON.stringify(text)}),
    )
    if (!(button instanceof HTMLElement)) throw new Error('整理菜单中找不到：${text}')
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

async function waitFor(predicate, timeout = 10_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await evaluate(predicate)) return
    await new Promise((resolve) => setTimeout(resolve, 120))
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
