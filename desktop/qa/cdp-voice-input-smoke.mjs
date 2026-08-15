#!/usr/bin/env node

/** 验证最终 Electron 应用中的语音按钮、权限桥接和语音设置页。 */
import { mkdir, writeFile } from 'node:fs/promises'

class CdpClient {
  static async connect(url) {
    const socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', () => reject(new Error('连接 Electron 调试页面失败。')), { once: true })
    })
    return new CdpClient(socket)
  }

  constructor(socket) {
    this.socket = socket
    this.sequence = 0
    this.pending = new Map()
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
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
const outputDir = process.env.AIWRITEPAPER_VOICE_OUTPUT
if (!Number.isInteger(port) || !outputDir) throw new Error('缺少有效 CDP 端口或输出目录。')

await mkdir(outputDir, { recursive: true })
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json())
const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
if (!target) throw new Error('未找到 Electron 页面。')

const client = await CdpClient.connect(target.webSocketDebuggerUrl)
try {
  await client.call('Runtime.enable')
  await client.call('Page.enable')
  await client.call('Page.reload', { ignoreCache: true })
  await waitFor("Boolean(document.querySelector('.microphone-button'))")

  const composer = await evaluate(`(async () => {
    const permission = await window.paperAgent.systemPermissions.get()
    const button = document.querySelector('.microphone-button')
    return {
      permission: {
        platform: permission.platform,
        accessibility: permission.accessibility,
        fullDiskAccess: permission.fullDiskAccess,
        screenRecording: permission.screenRecording,
        microphone: permission.microphone,
        fullAccessReady: permission.fullAccessReady,
        checkedAt: permission.checkedAt,
      },
      speechRecognitionType: typeof (window.SpeechRecognition ?? window.webkitSpeechRecognition),
      exists: Boolean(button),
      disabled: button?.disabled,
      label: button?.getAttribute('aria-label'),
      pressed: button?.getAttribute('aria-pressed'),
    }
  })()`)
  if (!composer.exists || composer.label !== '开始语音输入') throw new Error('输入框没有可访问的语音输入按钮。')
  if (composer.speechRecognitionType !== 'function') throw new Error('打包应用没有提供 Web Speech Recognition。')
  if (!composer.permission || typeof composer.permission.microphone !== 'string') throw new Error('麦克风权限桥接没有返回真实状态。')

  const composerScreenshotPath = `${outputDir}/voice-input-composer.png`
  const composerScreenshot = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(composerScreenshotPath, Buffer.from(composerScreenshot.data, 'base64'))

  await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.title === '设置')
    if (!button) throw new Error('未找到设置入口。')
    button.click()
  })()`)
  await waitFor("Boolean(document.querySelector('aside[aria-label=\"设置导航\"]'))")
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.settings-navigation button')].find((item) => item.textContent?.includes('语音输入'))
    if (!button) throw new Error('未找到语音输入设置入口。')
    button.click()
  })()`)
  await waitFor("Boolean(document.querySelector('.voice-settings-card'))")

  const settings = await evaluate(`(() => ({
    text: document.querySelector('.settings-hub-page')?.textContent ?? '',
    requestButton: [...document.querySelectorAll('.voice-settings-card button')].some((item) => item.textContent?.includes('请求权限')),
    openSettingsButton: [...document.querySelectorAll('.voice-settings-actions button')].some((item) => item.textContent?.includes('打开系统设置')),
  }))()`)
  for (const expected of ['麦克风权限', '系统语音识别', '简体中文（zh-CN）']) {
    if (!settings.text.includes(expected)) throw new Error(`语音设置缺少“${expected}”。`)
  }
  if (!settings.requestButton || !settings.openSettingsButton) throw new Error('语音权限操作没有完整显示。')

  const screenshotPath = `${outputDir}/voice-input-settings.png`
  const screenshot = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'))
  const summary = {
    ok: true,
    permission: composer.permission,
    speechRecognitionType: composer.speechRecognitionType,
    composerButton: {
      exists: composer.exists,
      disabled: composer.disabled,
      label: composer.label,
      pressed: composer.pressed,
    },
    settings,
    composerScreenshot: composerScreenshotPath,
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
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
  return response.result?.value
}
