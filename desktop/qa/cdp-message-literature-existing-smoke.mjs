#!/usr/bin/env node

/** 验证已经完成的真实 MCP 消息在最终打包应用中展示文字添加状态与右栏记录。 */
import { mkdir, writeFile } from 'node:fs/promises'

class CdpClient {
  static async connect(url) {
    const socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', () => reject(new Error('连接 CDP 失败。')), { once: true })
    })
    return new CdpClient(socket)
  }

  constructor(socket) {
    this.socket = socket
    this.sequence = 0
    this.pending = new Map()
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (!message.id) return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result ?? {})
    })
  }

  call(method, params = {}) {
    const id = ++this.sequence
    this.socket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }

  close() {
    this.socket.close()
  }
}

const port = Number(process.env.AIWRITEPAPER_CDP_PORT)
const outputDir = process.env.AIWRITEPAPER_MESSAGE_LITERATURE_OUTPUT
const clickPending = process.env.AIWRITEPAPER_MESSAGE_LITERATURE_CLICK === '1'
if (!Number.isInteger(port) || !outputDir) throw new Error('缺少有效 CDP 端口或输出目录。')

await mkdir(outputDir, { recursive: true })
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json())
const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
if (!target) throw new Error('未找到 Electron 页面。')

const client = await CdpClient.connect(target.webSocketDebuggerUrl)
try {
  await client.call('Runtime.enable')
  await client.call('Page.enable')
  const state = await evaluate(`(async () => {
    const workspace = await window.paperAgent.workspace.get()
    const message = [...workspace.messages].reverse().find((item) => (
      item.role === 'assistant' && (item.literatureCandidates?.length ?? 0) >= 2
    ))
    if (!message) throw new Error('没有带文献候选的助手消息。')
    await window.paperAgent.project.setActive(message.projectId)
    return {
      messageId: message.id,
      projectId: message.projectId,
      candidates: message.literatureCandidates,
      literature: workspace.literature.filter((item) => item.projectId === message.projectId),
    }
  })()`)
  await evaluate('location.reload()')
  await waitFor("document.querySelectorAll('.message-literature-actions__list li').length >= 2")
  const visible = await evaluate(`(() => ({
    rows: [...document.querySelectorAll('.message-literature-actions__list li')].map((item) => item.textContent?.trim()),
    rightText: document.querySelector('.right-workspace')?.textContent ?? '',
    roundedActionCount: [...document.querySelectorAll('.message-literature-actions__text-action')].filter((item) => getComputedStyle(item).borderRadius !== '0px').length,
  }))()`)
  const hasPendingAction = visible.rows.some((item) => item?.includes('添加到文献栏'))
  const hasAddedState = visible.rows.some((item) => item?.includes('已添加'))
  if (!hasPendingAction && !hasAddedState) throw new Error('消息中没有文献添加操作或已添加状态。')
  let added = state.literature.find((record) => state.candidates.some((candidate) => candidate.title === record.title))
  let rightText = visible.rightText
  if (clickPending && !added) {
    const firstTitle = state.candidates[0].title
    await evaluate("document.querySelector('.message-literature-actions__text-action')?.click()")
    await waitFor(`document.querySelector('.right-workspace')?.textContent?.includes(${JSON.stringify(firstTitle)}) === true`)
    added = { title: firstTitle }
    rightText = await evaluate("document.querySelector('.right-workspace')?.textContent ?? ''")
  }
  if (added && !rightText.includes(added.title)) throw new Error('右侧文献栏没有显示已添加论文。')
  if (visible.roundedActionCount !== 0) throw new Error('文字操作出现了不应存在的圆角。')

  const screenshotPath = `${outputDir}/message-literature-actions-final.png`
  const screenshot = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'))
  const summary = {
    ok: true,
    messageId: state.messageId,
    candidateCount: state.candidates.length,
    addedTitle: added?.title,
    pendingActionCount: visible.rows.filter((item) => item?.includes('添加到文献栏')).length,
    addedStateCount: visible.rows.filter((item) => item?.includes('已添加')).length,
    rightPanelVisible: Boolean(rightText),
    roundedActionCount: visible.roundedActionCount,
    screenshot: screenshotPath,
  }
  await writeFile(`${outputDir}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
} finally {
  client.close()
}

async function waitFor(expression, timeout = 20_000) {
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
