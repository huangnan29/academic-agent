#!/usr/bin/env node

/**
 * 通过安装版 Electron 的 CDP 接口验证 Codex 式研究侧栏。
 * 调用方应先备份工作区，脚本会创建临时对话并改变侧栏偏好。
 */

import { mkdir, writeFile } from 'node:fs/promises'

const port = Number(process.env.AIWRITEPAPER_CDP_PORT ?? 9341)
const outputDir = process.env.AIWRITEPAPER_SIDEBAR_OUTPUT
if (!outputDir) throw new Error('缺少 AIWRITEPAPER_SIDEBAR_OUTPUT。')
let client

async function main() {
  const target = await findTarget()
  client = await CdpClient.connect(target.webSocketDebuggerUrl)

  try {
  await mkdir(outputDir, { recursive: true })
  await waitFor('Boolean(window.paperAgent?.workspace)', 12_000)
  const initial = await evaluate('window.paperAgent.workspace.get()')
  if (process.env.AIWRITEPAPER_SIDEBAR_VERIFY_ONLY === '1') {
    const expectedProjectId = process.env.AIWRITEPAPER_EXPECTED_PROJECT_ID
    const expectedConversationCount = Number(process.env.AIWRITEPAPER_EXPECTED_CONVERSATIONS)
    const persistedProject = initial.projects.find((item) => item.id === expectedProjectId)
    const persistedConversationCount = initial.conversations.filter(
      (item) => item.projectId === expectedProjectId,
    ).length
    const result = {
      ok: Boolean(
        persistedProject &&
        Number.isInteger(expectedConversationCount) &&
        persistedConversationCount === expectedConversationCount &&
        initial.settings.sidebarViewMode === 'projects' &&
        initial.settings.sidebarChatSort === 'manual' &&
        initial.settings.sidebarExpandedProjectIds?.includes(expectedProjectId),
      ),
      projectId: expectedProjectId,
      conversationCount: persistedConversationCount,
      viewMode: initial.settings.sidebarViewMode,
      chatSort: initial.settings.sidebarChatSort,
      expanded: initial.settings.sidebarExpandedProjectIds?.includes(expectedProjectId) === true,
    }
    if (!result.ok) throw new Error('侧栏状态未在应用重启后完整恢复。')
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }
  const project = initial.projects.find((item) => item.origin === 'live') ?? initial.projects[0]
  if (!project) throw new Error('工作区没有可验证的项目。')

  const projectButtonSelector = `.research-folder-button[title=${JSON.stringify(project.title)}]`
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(projectButtonSelector)}))`)
  const initialButtonState = await evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(projectButtonSelector)})
    return {
      active: button?.closest('.research-group')?.classList.contains('is-active') === true,
      expanded: button?.getAttribute('aria-expanded') === 'true',
    }
  })()`)
  if (!initialButtonState.active) {
    await clickProjectControl(project.title, '.research-folder-button')
    await waitFor(`document.querySelector(${JSON.stringify(projectButtonSelector)})?.closest('.research-group')?.classList.contains('is-active') === true`)
    await waitFor(`document.querySelector(${JSON.stringify(projectButtonSelector)})?.getAttribute('aria-expanded') === ${JSON.stringify(String(!initialButtonState.expanded))}`)
  }
  const expandedAfterActivation = await evaluate(`document.querySelector(${JSON.stringify(projectButtonSelector)})?.getAttribute('aria-expanded') === 'true'`)
  if (!expandedAfterActivation) await clickProjectControl(project.title, '.research-folder-button')
  await waitFor(`document.querySelector(${JSON.stringify(projectButtonSelector)})?.getAttribute('aria-expanded') === 'true'`)

  await clickProjectControl(project.title, '.research-folder-button')
  await waitFor(`document.querySelector(${JSON.stringify(projectButtonSelector)})?.getAttribute('aria-expanded') === 'false'`)
  await clickProjectControl(project.title, '.research-folder-button')
  await waitFor(`document.querySelector(${JSON.stringify(projectButtonSelector)})?.getAttribute('aria-expanded') === 'true'`)

  const beforeCreate = await evaluate('window.paperAgent.workspace.get()')
  const beforeCount = beforeCreate.conversations.filter((item) => item.projectId === project.id).length
  await clickProjectControl(project.title, '.project-new-conversation')
  await waitFor(async () => {
    const state = await evaluate('window.paperAgent.workspace.get()')
    return state.conversations.filter((item) => item.projectId === project.id).length === beforeCount + 1
  })
  const afterCreate = await evaluate('window.paperAgent.workspace.get()')
  const activeAfterCreate = afterCreate.projects.find((item) => item.id === project.id)?.activeConversationId
  const previousConversation = afterCreate.conversations.find(
    (item) => item.projectId === project.id && item.id !== activeAfterCreate,
  )
  if (previousConversation) {
    await clickConversation(previousConversation.id)
    await waitFor(async () => {
      const state = await evaluate('window.paperAgent.workspace.get()')
      return state.projects.find((item) => item.id === project.id)?.activeConversationId === previousConversation.id
    })
  }
  await capture(`${outputDir}/project-conversations.png`)

  await openProjectMenu(project.title)
  await clickMenuText(project.pinned ? '取消置顶项目' : '置顶项目')
  await waitFor(async () => {
    const state = await evaluate('window.paperAgent.workspace.get()')
    return state.projects.find((item) => item.id === project.id)?.pinned === !Boolean(project.pinned)
  })
  await waitFor("!document.querySelector('.project-list-menu')")
  await openProjectMenu(project.title)
  const inversePinLabel = await evaluate(`(() => {
    const menu = document.querySelector('.project-list-menu')
    return [...(menu?.querySelectorAll('button') ?? [])].map((item) => item.textContent?.trim())
  })()`)
  if (!inversePinLabel.includes(project.pinned ? '置顶项目' : '取消置顶项目')) {
    throw new Error('项目菜单没有显示相反的置顶操作。')
  }
  await capture(`${outputDir}/project-menu.png`)
  await clickMenuText(project.pinned ? '置顶项目' : '取消置顶项目')

  await openOrganizeMenu()
  await clickMenuText('在一个列表中')
  await waitFor("Boolean(document.querySelector('.flat-conversation-list'))")
  await openOrganizeMenu()
  await capture(`${outputDir}/organize-list.png`)
  await clickMenuText('按项目')
  await waitFor("Boolean(document.querySelector('.research-group'))")

  for (const [label, value] of [['最近更新', 'recent'], ['手动排序', 'manual'], ['优先级', 'priority']]) {
    await openOrganizeMenu()
    await clickMenuText(label)
    await waitFor(async () => {
      const state = await evaluate('window.paperAgent.workspace.get()')
      return state.settings.sidebarChatSort === value
    })
  }

  await openOrganizeMenu()
  await clickMenuText('手动排序')
  await waitFor("Boolean(document.querySelector('.research-group[draggable=\"true\"]'))")
  await openOrganizeMenu()
  await capture(`${outputDir}/organize-manual.png`)
  await evaluate(`document.querySelector('button[aria-label="整理侧边栏"]')?.click()`)
  await waitFor("!document.querySelector('.sidebar-organize-menu')")
  const manualProjectReorder = await dragSecondBeforeFirst('.research-group', '.research-folder-button', 'title')
  const manualConversationReorder = await dragSecondBeforeFirst(
    '.research-group.is-active .research-conversation',
    null,
    'title',
  )

  const final = await evaluate('window.paperAgent.workspace.get()')
  const result = {
    ok: true,
    projectId: project.id,
    independentExpandCollapse: true,
    conversationsBefore: beforeCount,
    conversationsAfter: final.conversations.filter((item) => item.projectId === project.id).length,
    activeConversationSwitched: Boolean(previousConversation),
    pinAndUnpin: final.projects.find((item) => item.id === project.id)?.pinned === Boolean(project.pinned),
    projectAndListModes: true,
    sortModes: ['priority', 'recent', 'manual'],
    manualRowsDraggable: true,
    manualProjectReorder,
    manualConversationReorder,
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } finally {
    client.close()
  }
}

async function clickProjectControl(title, selector) {
  await evaluate(`(() => {
    const folder = [...document.querySelectorAll('.research-folder-button')].find(
      (item) => item.getAttribute('title') === ${JSON.stringify(title)},
    )
    const control = folder?.closest('.research-group')?.querySelector(${JSON.stringify(selector)})
    if (!(control instanceof HTMLElement)) throw new Error('找不到项目控件：${selector}')
    control.click()
  })()`)
}

async function clickConversation(conversationId) {
  await evaluate(`(() => {
    const state = window.paperAgent.workspace.get()
    return state.then((workspace) => {
      const conversation = workspace.conversations.find((item) => item.id === ${JSON.stringify(conversationId)})
      const project = workspace.projects.find((item) => item.id === conversation?.projectId)
      const label = ['新的研究任务', project?.title].includes(conversation?.title) ? '研究对话' : conversation?.title
      const button = [...document.querySelectorAll('.research-conversation')].find((item) => item.getAttribute('title') === label)
      if (!(button instanceof HTMLElement)) throw new Error('找不到要切换的对话。')
      button.click()
    })
  })()`)
}

async function openProjectMenu(title) {
  await clickProjectControl(title, '.project-list-more')
  await waitFor("Boolean(document.querySelector('.project-list-menu'))")
}

async function openOrganizeMenu() {
  if (await evaluate("Boolean(document.querySelector('.sidebar-organize-menu'))")) return
  await evaluate(`(() => {
    const button = document.querySelector('button[aria-label="整理侧边栏"]')
    if (!(button instanceof HTMLElement)) throw new Error('找不到整理侧边栏按钮。')
    button.click()
  })()`)
  await waitFor("Boolean(document.querySelector('.sidebar-organize-menu'))")
}

async function clickMenuText(text) {
  await evaluate(`(() => {
    const menu = document.querySelector('.project-list-menu, .sidebar-organize-menu')
    const button = [...(menu?.querySelectorAll('button') ?? [])].find((item) => item.textContent?.replace(/\\s+/g, ' ').trim().includes(${JSON.stringify(text)}))
    if (!(button instanceof HTMLElement)) throw new Error('菜单中找不到：${text}')
    button.click()
  })()`)
}

async function dragSecondBeforeFirst(selector, labelSelector, labelAttribute) {
  const before = await evaluate(`(() => {
    const rows = [...document.querySelectorAll(${JSON.stringify(selector)})]
    return rows.map((row) => {
      const label = ${labelSelector ? `row.querySelector(${JSON.stringify(labelSelector)})` : 'row'}
      return label?.getAttribute(${JSON.stringify(labelAttribute)}) ?? label?.textContent?.trim() ?? ''
    })
  })()`)
  if (before.length < 2) return false
  await evaluate(`(() => {
    const rows = [...document.querySelectorAll(${JSON.stringify(selector)})]
    const transfer = new DataTransfer()
    rows[1].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  })()`)
  await new Promise((resolve) => setTimeout(resolve, 160))
  await evaluate(`(() => {
    const rows = [...document.querySelectorAll(${JSON.stringify(selector)})]
    const transfer = new DataTransfer()
    rows[0].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    rows[0].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  })()`)
  await waitFor(`(() => {
    const row = document.querySelector(${JSON.stringify(selector)})
    const label = ${labelSelector ? `row?.querySelector(${JSON.stringify(labelSelector)})` : 'row'}
    return (label?.getAttribute(${JSON.stringify(labelAttribute)}) ?? label?.textContent?.trim() ?? '') === ${JSON.stringify(before[1])}
  })()`)
  return true
}

async function waitFor(predicate, timeout = 8_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = typeof predicate === 'string'
      ? await evaluate(predicate)
      : await predicate()
    if (value) return
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
  throw new Error('等待界面状态更新超时。')
}

async function capture(path) {
  const response = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(response.data, 'base64'))
}

async function findTarget() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`)
  const targets = await response.json()
  const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
  if (!target) throw new Error('未找到 Electron 页面。')
  return target
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
