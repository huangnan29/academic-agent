#!/usr/bin/env node

/** 验证右侧大纲与文稿页读取同一个活动历史版本，而不是内部修订计数。 */
import { mkdir, writeFile } from 'node:fs/promises'

const port = Number(process.env.AIWRITEPAPER_CDP_PORT)
const outputDir = process.env.AIWRITEPAPER_OUTLINE_VERSION_OUTPUT
if (!Number.isInteger(port) || !outputDir) throw new Error('缺少有效 CDP 端口或输出目录。')

const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json())
const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
if (!target) throw new Error('未找到 Electron 页面。')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', () => reject(new Error('连接 CDP 失败。')), { once: true })
})
let sequence = 0
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  const task = pending.get(message.id)
  if (!task) return
  pending.delete(message.id)
  if (message.error) task.reject(new Error(message.error.message))
  else task.resolve(message.result ?? {})
})

const call = (method, params = {}) => {
  const id = ++sequence
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}
const evaluate = async (expression) => {
  const response = await call('Runtime.evaluate', {
    expression: `(async () => (${expression}))()`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
  return response.result?.value
}
const waitFor = async (expression, timeout = 20_000) => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`等待界面超时：${expression}`)
}

try {
  await call('Runtime.enable')
  await call('Page.enable')
  const expected = await evaluate(`(async () => {
    const workspace = await window.paperAgent.workspace.get()
    const section = workspace.sections.find((item) => {
      const version = workspace.sectionVersions.find((candidate) => candidate.id === item.activeGenerationVersionId)
      return item.wordCount > 0 && version && item.version !== version.number
    })
    if (!section) throw new Error('没有可验证内部修订号与历史版本号差异的章节。')
    const version = workspace.sectionVersions.find((item) => item.id === section.activeGenerationVersionId)
    await window.paperAgent.project.setActive(section.projectId)
    await window.paperAgent.section.setActive(section.id)
    return { sectionId: section.id, title: section.title, internalVersion: section.version, visibleVersion: version.number }
  })()`)
  await evaluate('location.reload()')
  await waitFor("[...document.querySelectorAll('button')].some((item) => item.textContent?.trim() === '文稿')")
  await evaluate("[...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '文稿')?.click()")
  await evaluate("[...document.querySelectorAll('[role=tab]')].find((item) => item.textContent?.includes('稿件'))?.click()")
  await waitFor("document.querySelector('.academic-outline__row.is-selected small') !== null")
  const visibleMeta = await evaluate("document.querySelector('.academic-outline__row.is-selected small')?.textContent ?? ''")
  const correctLabel = `第 ${expected.visibleVersion} 版`
  const wrongLabel = `第 ${expected.internalVersion} 版`
  if (!visibleMeta.includes(correctLabel)) throw new Error(`右侧大纲未显示正确版本：${visibleMeta}`)
  if (expected.internalVersion !== expected.visibleVersion && visibleMeta.includes(wrongLabel)) {
    throw new Error(`右侧大纲仍在显示内部修订号：${visibleMeta}`)
  }

  await mkdir(outputDir, { recursive: true })
  const screenshotPath = `${outputDir}/outline-version-consistency-final.png`
  const screenshot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'))
  const summary = { ok: true, ...expected, visibleMeta, screenshot: screenshotPath }
  await writeFile(`${outputDir}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
} finally {
  socket.close()
}
