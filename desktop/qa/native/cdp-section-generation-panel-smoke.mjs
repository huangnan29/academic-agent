#!/usr/bin/env node

/** 使用原生 Electron + 本地 Mock 验证重新生成策略面板与版本元数据闭环。 */
import { mkdir, writeFile } from 'node:fs/promises'

const port = Number(process.env.AIWRITEPAPER_CDP_PORT ?? 9454)
const outputDir = process.env.AIWRITEPAPER_SECTION_STRATEGY_OUTPUT
if (!outputDir) throw new Error('缺少 AIWRITEPAPER_SECTION_STRATEGY_OUTPUT。')
const customInstruction = 'QA-策略面板：保留引用标记，并比较两类理论路径。'
let client

async function main() {
  await mkdir(outputDir, { recursive: true })
  client = await CdpClient.connect((await findTarget()).webSocketDebuggerUrl)
  const runtimeErrors = []
  try {
    await client.call('Runtime.enable')
    await client.call('Log.enable')
    client.on('Runtime.exceptionThrown', (params) => runtimeErrors.push(params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text))
    client.on('Log.entryAdded', (params) => {
      if (params.entry?.level === 'error') runtimeErrors.push(params.entry.text)
    })
    await waitFor("Boolean(window.paperAgent?.section?.previewGeneration && document.querySelector('.view-switcher'))", 15_000)
    await clickText('.view-switcher button', '文稿')
    await waitFor("Boolean(document.querySelector('.manuscript-view'))")
    await clickText('.manuscript-regenerate-button', '重新生成')
    await waitFor("Boolean(document.querySelector('.section-generation-modal'))")
    await waitFor("!document.querySelector('.section-generation-modal[aria-busy=true]')", 15_000)

    const initial = await panelSnapshot()
    if (!initial.mode?.includes('revise') || !initial.profile || !initial.facts.includes('本地策略面板 Mock') || !initial.boundary) {
      throw new Error(`策略面板初始状态不完整：${JSON.stringify(initial)}`)
    }
    await capture(`${outputDir}/section-generation-panel.png`)

    await evaluate(`document.querySelector('input[name="section-generation-mode"][value="rewrite"]')?.click()`)
    await evaluate(`document.querySelector('input[name="section-profile-mode"][value="manual"]')?.click()`)
    await waitFor("!document.querySelector('.section-generation-modal[aria-busy=true]')")
    await evaluate(`(() => {
      const select = document.querySelector('.section-generation-profile-select')
      select.value = 'literature-review'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await waitFor("document.querySelector('.section-generation-profile-summary strong')?.textContent?.includes('综述')", 15_000)

    await clickCheckboxByLabel('证据优先')
    await waitFor("!document.querySelector('.section-generation-check-option input:checked') || true", 100)
    await clickCheckboxByLabel('精炼表达')
    await waitFor("Boolean(document.querySelector('.section-generation-inline-error'))")
    const conflict = await evaluate("document.querySelector('.section-generation-inline-error')?.textContent?.replace(/\\s+/g, ' ').trim()")
    if (!conflict?.includes('不能同时')) throw new Error(`策略冲突提示不正确：${conflict}`)
    await clickCheckboxByLabel('自然学术')
    await waitFor("!document.querySelector('.section-generation-inline-error')")

    const firstAvailableForm = await evaluate(`(() => {
      const item = [...document.querySelectorAll('.section-generation-content-forms label')]
        .find((label) => !label.classList.contains('is-disabled'))
      const input = item?.querySelector('input')
      if (input && !input.checked) input.click()
      return item?.querySelector('strong')?.textContent?.trim()
    })()`)
    await setTextarea('.section-generation-custom-field textarea', customInstruction)
    const configured = await panelSnapshot()
    if (!configured.mode?.includes('rewrite') || !configured.profile.includes('综述') || !configured.custom.includes(customInstruction)) {
      throw new Error(`策略面板配置未生效：${JSON.stringify(configured)}`)
    }
    await capture(`${outputDir}/section-generation-configured.png`)

    await clickText('.section-generation-footer .primary-button', '提交并生成')
    await waitFor("!document.querySelector('.section-generation-modal')")
    await waitFor("Boolean(document.querySelector('.section-streaming-label'))", 15_000)
    await waitFor("!document.querySelector('.section-streaming-label')", 30_000)
    const result = await evaluate(`(async () => {
      const state = await window.paperAgent.workspace.get()
      const project = state.projects.find((item) => item.id === state.settings.activeProjectId) ?? state.projects[0]
      const section = state.sections.find((item) => item.id === project?.activeSectionId)
      const version = state.sectionVersions.find((item) => item.id === section?.activeGenerationVersionId)
      return {
        profile: section?.generationProfile,
        mode: section?.generationMode,
        strategies: section?.generationStrategyIds,
        forms: section?.generationContentForms,
        custom: section?.generationCustomInstructions,
        versionProfile: version?.generationProfile,
        versionMode: version?.generationMode,
        versionStrategies: version?.generationStrategyIds,
        versionForms: version?.generationContentForms,
        versionCustom: version?.generationCustomInstructions,
        toolbar: [...document.querySelectorAll('.section-generation-model')].map((item) => item.textContent?.replace(/\s+/g, ' ').trim()),
      }
    })()`)
    if (result.profile !== 'literature-review'
      || result.mode !== 'rewrite'
      || result.custom !== customInstruction
      || result.strategies?.length === 0
      || result.versionProfile !== result.profile
      || result.versionMode !== result.mode
      || JSON.stringify(result.versionStrategies) !== JSON.stringify(result.strategies)
      || JSON.stringify(result.versionForms) !== JSON.stringify(result.forms)
      || result.versionCustom !== result.custom) {
      throw new Error(`生成参数没有完整写入版本：${JSON.stringify(result)}`)
    }
    await capture(`${outputDir}/section-generation-completed.png`)
    if (runtimeErrors.length > 0) throw new Error(`运行时错误：${runtimeErrors.join('；')}`)
    const summary = { ok: true, initial, configured, firstAvailableForm, conflict, result, runtimeErrors }
    await writeFile(`${outputDir}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`)
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  } finally {
    client.close()
  }
}

async function panelSnapshot() {
  return evaluate(`(() => ({
    mode: document.querySelector('input[name="section-generation-mode"]:checked')?.value,
    profile: document.querySelector('.section-generation-profile-summary strong')?.textContent?.trim(),
    facts: document.querySelector('.section-generation-facts')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    boundary: document.querySelector('.section-generation-boundary p')?.textContent?.trim(),
    strategies: [...document.querySelectorAll('.section-generation-strategy-grid input:checked')]
      .map((input) => input.closest('label')?.querySelector('strong')?.textContent?.trim()),
    forms: [...document.querySelectorAll('.section-generation-content-forms input:checked')]
      .map((input) => input.closest('label')?.querySelector('strong')?.textContent?.trim()),
    custom: document.querySelector('.section-generation-custom-field textarea')?.value ?? '',
  }))()`)
}

async function clickCheckboxByLabel(label) {
  await evaluate(`(() => {
    const target = [...document.querySelectorAll('.section-generation-strategy-grid label')]
      .find((item) => item.querySelector('strong')?.textContent?.trim() === ${JSON.stringify(label)})
    const input = target?.querySelector('input')
    if (!(input instanceof HTMLInputElement)) throw new Error('找不到策略：${label}')
    if (input.disabled) throw new Error('策略当前不可选择：${label}')
    input.click()
  })()`)
}

async function clickText(selector, text) {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((item) => item.textContent?.includes(${JSON.stringify(text)}))
    if (!(button instanceof HTMLElement)) throw new Error('找不到按钮：${text}')
    button.click()
  })()`)
}

async function setTextarea(selector, value) {
  await evaluate(`(() => {
    const textarea = document.querySelector(${JSON.stringify(selector)})
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(textarea, ${JSON.stringify(value)})
    textarea?.dispatchEvent(new Event('input', { bubbles: true }))
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
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
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
