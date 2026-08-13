#!/usr/bin/env node

/** 使用原生 Electron 验证外观设置、全局应用与重启恢复；不会启动 Chrome。 */
import { mkdir, writeFile } from 'node:fs/promises'

const port = Number(process.env.AIWRITEPAPER_CDP_PORT ?? 9368)
const outputDir = process.env.AIWRITEPAPER_APPEARANCE_OUTPUT
if (!outputDir) throw new Error('缺少 AIWRITEPAPER_APPEARANCE_OUTPUT。')
let client

async function main() {
  await mkdir(outputDir, { recursive: true })
  const target = await findTarget()
  client = await CdpClient.connect(target.webSocketDebuggerUrl)

  try {
  await client.call('Runtime.enable')
  await waitFor("Boolean(window.paperAgent?.appearance && (document.querySelector('.sidebar-footer button') || document.querySelector('.settings-sidebar')))")
  await openAppearance()
  const initial = await inspect()
  if (initial.themeCards !== 3 || initial.colorInputs !== 6 || initial.preferenceRows < 6) {
    throw new Error(`外观页面控件不完整：${JSON.stringify(initial)}`)
  }
  await capture(`${outputDir}/appearance-system.png`)

  if (process.env.AIWRITEPAPER_APPEARANCE_VERIFY_RESTART === '1') {
    if (
      initial.theme !== 'light' || initial.uiFontSize !== 16 || initial.diffStyle !== 'symbol' ||
      initial.pointerCursor !== 'on' || initial.fontSmoothing !== 'on'
    ) throw new Error(`外观设置没有在重启后恢复：${JSON.stringify(initial)}`)
    const manuscriptDiff = await verifyManuscriptDiff()
    process.stdout.write(`${JSON.stringify({ ok: true, restartRecovered: initial, manuscriptDiff }, null, 2)}\n`)
    return
  }

  await evaluate(`window.paperAgent.appearance.update(${JSON.stringify({
    theme: 'dark',
    palettes: {
      light: { accent: '#b83b1c', background: '#fffaf3', foreground: '#28211f' },
      dark: { accent: '#f08367', background: '#181716', foreground: '#f3efec' },
    },
    uiFont: 'serif',
    translucentSidebar: true,
    contrast: 68,
    pointerCursor: true,
    dockIcon: 'assistant',
    reducedMotion: 'on',
    uiFontSize: 16,
    diffStyle: 'symbol',
    fontSmoothing: false,
  })}).then(() => location.reload())`)
  await waitFor("Boolean(document.querySelector('.sidebar-footer button'))")
  await openAppearance()
  const dark = await inspect()
  if (
    dark.theme !== 'dark' || dark.dataTheme !== 'dark' || dark.uiFontSize !== 16 ||
    dark.diffStyle !== 'symbol' || dark.reducedMotion !== 'on' || dark.pointerCursor !== 'on' ||
    !dark.background.includes('24, 23, 22') || !dark.fontFamily.includes('New York')
  ) throw new Error(`深色外观没有完整应用：${JSON.stringify(dark)}`)
  await capture(`${outputDir}/appearance-dark-custom.png`)

  const copied = await evaluate(`window.paperAgent.appearance.copyTheme().then((text) => JSON.parse(text))`)
  if (!copied.palettes?.light || !copied.palettes?.dark || copied.dockIcon || copied.reducedMotion || copied.uiFontSize) {
    throw new Error(`复制主题越过主题字段边界：${JSON.stringify(copied)}`)
  }

  await evaluate(`window.paperAgent.appearance.update({ theme: 'light', dockIcon: 'academic', reducedMotion: 'off', fontSmoothing: true }).then(() => location.reload())`)
  await waitFor("Boolean(document.querySelector('.sidebar-footer button'))")
  await openAppearance()
  const light = await inspect()
  if (light.theme !== 'light' || light.dataTheme !== 'light' || light.fontSmoothing !== 'on') {
    throw new Error(`浅色外观没有完整应用：${JSON.stringify(light)}`)
  }
  await capture(`${outputDir}/appearance-light-custom.png`)
  await evaluate(`(() => {
    const page = document.querySelector('.appearance-settings-page')
    if (!(page instanceof HTMLElement)) throw new Error('找不到外观滚动页。')
    page.scrollTop = page.scrollHeight
  })()`)
  await new Promise((resolve) => setTimeout(resolve, 120))
  const bottom = await evaluate(`(() => ({
    dockButtons: document.querySelectorAll('.appearance-dock-options button').length,
    reducedMotionButtons: document.querySelectorAll('[aria-label="减少动态效果"] button').length,
    diffButtons: document.querySelectorAll('[aria-label="差异标记"] button').length,
    fontSize: document.querySelector('#appearance-font-size')?.value,
    scrolled: document.querySelector('.appearance-settings-page')?.scrollTop > 0,
  }))()`)
  if (bottom.dockButtons !== 2 || bottom.reducedMotionButtons !== 3 || bottom.diffButtons !== 2 || !bottom.scrolled) {
    throw new Error(`底部外观偏好不完整：${JSON.stringify(bottom)}`)
  }
  await capture(`${outputDir}/appearance-preferences-bottom.png`)

    process.stdout.write(`${JSON.stringify({ ok: true, initial, dark, light, bottom, copiedThemeKeys: Object.keys(copied) }, null, 2)}\n`)
  } finally {
    client.close()
  }
}

async function verifyManuscriptDiff() {
  await evaluate(`window.paperAgent.workspace.get().then(async (workspace) => {
    let section = workspace.sections.find((item) => item.content) || workspace.sections[0]
    if (!section) {
      const project = workspace.projects[0]
      if (!project) throw new Error('隔离工作区没有可编辑的章节。')
      await window.paperAgent.outline.save(project.id, [{
        id: 'appearance-qa-section', title: '差异标记验收', level: 1,
        objective: '验证未保存修改的差异显示', targetWords: 1000,
        citationIds: [], children: [],
      }])
      workspace = await window.paperAgent.workspace.get()
      section = workspace.sections[0]
    }
    if (!section) throw new Error('无法从大纲建立章节。')
    if (!section.content) await window.paperAgent.section.save(section.id, '# 差异标记验收\\n\\n这是原始章节内容。')
    return window.paperAgent.section.setActive(section.id)
  }).then(() => location.reload())`)
  await waitFor("Boolean(document.querySelector('.center-workspace'))")
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.view-switcher button')].find((item) => item.textContent?.includes('文稿'))
    if (!(button instanceof HTMLElement)) throw new Error('找不到文稿入口。')
    button.click()
  })()`)
  await waitFor("Boolean(document.querySelector('.manuscript-paper'))")
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.manuscript-toolbar button')].find((item) => item.textContent?.includes('编辑'))
    if (!(button instanceof HTMLElement)) throw new Error('找不到章节编辑按钮。')
    button.click()
  })()`)
  await waitFor("Boolean(document.querySelector('.manuscript-editor-stack textarea'))")
  await evaluate(`(() => {
    const textarea = document.querySelector('.manuscript-editor-stack textarea')
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error('找不到章节编辑框。')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(textarea, textarea.value + '\\n新增的真实差异验收行。')
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await waitFor("Boolean(document.querySelector('.manuscript-diff-lines .is-added'))")
  const result = await evaluate(`(() => {
    const row = document.querySelector('.manuscript-diff-lines .is-added')
    const marker = row?.querySelector('span')
    return {
      visible: Boolean(row),
      mode: document.querySelector('.app-shell')?.getAttribute('data-diff-style'),
      marker: marker?.textContent,
      markerColor: marker ? getComputedStyle(marker).color : undefined,
      background: row ? getComputedStyle(row).backgroundColor : undefined,
    }
  })()`)
  await capture(`${outputDir}/appearance-real-manuscript-diff.png`)
  if (!result.visible || result.mode !== 'symbol' || result.marker !== '+') {
    throw new Error(`真实稿件差异标记没有生效：${JSON.stringify(result)}`)
  }
  return result
}

async function openAppearance() {
  await evaluate("Boolean(document.querySelector('.settings-sidebar')) || (document.querySelector('.sidebar-footer button')?.click(), true)")
  await waitFor("Boolean(document.querySelector('.settings-sidebar'))")
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.settings-navigation-group button')].find((item) => item.textContent?.trim() === '外观')
    if (!(button instanceof HTMLElement)) throw new Error('找不到外观设置入口。')
    button.click()
  })()`)
  await waitFor("Boolean(document.querySelector('.appearance-settings-page'))")
}

async function inspect() {
  return evaluate(`(() => {
    const state = window.paperAgent.workspace.get()
    const shell = document.querySelector('.app-shell')
    const styles = shell ? getComputedStyle(shell) : undefined
    return state.then((workspace) => ({
      theme: workspace.settings.appearance.theme,
      uiFontSize: workspace.settings.appearance.uiFontSize,
      dataTheme: shell?.getAttribute('data-theme'),
      diffStyle: shell?.getAttribute('data-diff-style'),
      reducedMotion: shell?.getAttribute('data-reduced-motion'),
      pointerCursor: shell?.getAttribute('data-pointer-cursor'),
      fontSmoothing: shell?.getAttribute('data-font-smoothing'),
      background: styles?.backgroundColor,
      fontFamily: styles?.fontFamily,
      themeCards: document.querySelectorAll('.appearance-theme-option').length,
      colorInputs: document.querySelectorAll('.appearance-color-control input').length,
      preferenceRows: document.querySelectorAll('.appearance-preferences .appearance-setting-row').length,
    }))
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

async function waitFor(expression, timeout = 15_000) {
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
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (!message.id) return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result)
    })
  }

  call(method, params = {}) {
    const id = ++this.nextId
    this.socket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }

  close() {
    this.socket.close()
  }
}

await main()
