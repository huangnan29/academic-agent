#!/usr/bin/env node

/** 使用原生 Electron CDP 验证章节版本菜单与真实版本切换；不会调用模型。 */
import { mkdir, writeFile } from 'node:fs/promises'

const port = Number(process.env.AIWRITEPAPER_CDP_PORT)
const outputDir = process.env.AIWRITEPAPER_SECTION_VERSION_OUTPUT

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('AIWRITEPAPER_CDP_PORT 必须是有效端口。')
}
if (!outputDir) throw new Error('缺少 AIWRITEPAPER_SECTION_VERSION_OUTPUT。')

let client

async function main() {
  await mkdir(outputDir, { recursive: true })
  const target = await findTarget()
  client = await CdpClient.connect(target.webSocketDebuggerUrl)
  const runtimeErrors = []

  try {
    await client.call('Runtime.enable')
    await client.call('Log.enable')
    await client.call('Page.enable')
    client.on('Runtime.exceptionThrown', (params) => {
      runtimeErrors.push(params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? '运行时异常')
    })
    client.on('Log.entryAdded', (params) => {
      if (params.entry?.level === 'error') runtimeErrors.push(params.entry.text)
    })

    await waitFor("Boolean(window.paperAgent?.section?.save && window.paperAgent?.section?.selectVersion && document.querySelector('.center-workspace'))")

    const prepared = await evaluate(`(async () => {
      let workspace = await window.paperAgent.workspace.get()
      const demoProjectIds = new Set(workspace.projects.filter((project) => project.origin === 'demo').map((project) => project.id))
      let section = workspace.sections.find((item) => demoProjectIds.has(item.projectId) && !item.derivedFromSectionId && item.content.trim())
        ?? workspace.sections.find((item) => demoProjectIds.has(item.projectId) && item.content.trim())
      if (!section) throw new Error('隔离演示工作区没有已有正文的章节。')
      const project = workspace.projects.find((item) => item.id === section.projectId)
      if (!project) throw new Error('已有正文章节缺少所属演示项目。')

      await window.paperAgent.project.setActive(project.id)
      await window.paperAgent.section.setActive(section.id)

      const baseContent = section.content.trim()
      const marker = String(Date.now())
      const firstMarker = '章节版本界面冒烟第一稿-' + marker
      const secondMarker = '章节版本界面冒烟第二稿-' + marker
      const firstContent = baseContent + '\\n\\n' + firstMarker
      const secondContent = baseContent + '\\n\\n' + secondMarker

      await window.paperAgent.section.save(section.id, firstContent)
      workspace = await window.paperAgent.workspace.get()
      section = workspace.sections.find((item) => item.id === section.id)
      const firstVersion = workspace.sectionVersions.find((item) => item.id === section?.activeGenerationVersionId)
      if (!section || !firstVersion || firstVersion.content !== firstContent) {
        throw new Error('第一次保存没有形成可追溯章节版本。')
      }

      await window.paperAgent.section.save(section.id, secondContent)
      workspace = await window.paperAgent.workspace.get()
      section = workspace.sections.find((item) => item.id === section.id)
      const secondVersion = workspace.sectionVersions.find((item) => item.id === section?.activeGenerationVersionId)
      if (!section || !secondVersion || secondVersion.content !== secondContent || secondVersion.id === firstVersion.id) {
        throw new Error('第二次保存没有形成新的章节版本。')
      }

      return {
        projectId: project.id,
        sectionId: section.id,
        sectionTitle: section.title,
        olderVersionId: firstVersion.id,
        olderVersionNumber: firstVersion.number,
        olderMarker: firstMarker,
        latestVersionId: secondVersion.id,
        latestVersionNumber: secondVersion.number,
        latestMarker: secondMarker,
      }
    })()`)

    await evaluate("(() => { location.reload(); return true })()")
    await waitFor("Boolean(window.paperAgent?.section?.selectVersion && document.querySelector('.view-switcher'))")
    await clickButtonText('.view-switcher button', '文稿')
    await waitFor("Boolean(document.querySelector('.manuscript-view'))")
    await waitFor(`window.paperAgent.workspace.get().then((workspace) => {
      const section = workspace.sections.find((item) => item.id === ${JSON.stringify(prepared.sectionId)})
      return section?.activeGenerationVersionId === ${JSON.stringify(prepared.latestVersionId)}
        && Boolean(document.querySelector('.manuscript-version-trigger'))
    })`)

    const controls = await evaluate(`(() => {
      const trigger = document.querySelector('.manuscript-version-trigger')
      const regenerate = document.querySelector('.manuscript-regenerate-button')
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
      }
      return {
        triggerVisible: visible(trigger),
        triggerText: trigger?.textContent?.replace(/\\s+/g, ' ').trim(),
        triggerExpanded: trigger?.getAttribute('aria-expanded'),
        regenerateVisible: visible(regenerate),
        regenerateText: regenerate?.textContent?.replace(/\\s+/g, ' ').trim(),
      }
    })()`)
    if (!controls.triggerVisible || !controls.regenerateVisible || !controls.regenerateText?.includes('重新生成')) {
      throw new Error(`章节版本控件不完整：${JSON.stringify(controls)}`)
    }

    await evaluate(`(() => {
      const trigger = document.querySelector('.manuscript-version-trigger')
      if (!(trigger instanceof HTMLButtonElement)) throw new Error('找不到章节版本触发器。')
      trigger.click()
    })()`)
    await waitFor("document.querySelectorAll('.manuscript-version-menu [role=option]').length >= 2")

    const menu = await evaluate(`(() => {
      const options = [...document.querySelectorAll('.manuscript-version-menu [role=option]')]
      return {
        optionCount: options.length,
        expanded: document.querySelector('.manuscript-version-trigger')?.getAttribute('aria-expanded'),
        options: options.map((option) => ({
          text: option.textContent?.replace(/\\s+/g, ' ').trim(),
          selected: option.getAttribute('aria-selected'),
          dateTime: option.querySelector('time')?.getAttribute('datetime'),
        })),
      }
    })()`)
    const informativeOptions = menu.options.filter((option) => (
      /第\s*\d+\s*版/.test(option.text ?? '')
      && /(生成于|保存于|未完成)/.test(option.text ?? '')
      && Boolean(option.dateTime && !Number.isNaN(Date.parse(option.dateTime)))
    ))
    if (menu.expanded !== 'true' || menu.optionCount < 2 || informativeOptions.length < 2) {
      throw new Error(`章节版本菜单缺少编号或时间信息：${JSON.stringify(menu)}`)
    }
    await capture(`${outputDir}/section-version-menu.png`)

    await evaluate(`(() => {
      const expected = ${JSON.stringify(`第 ${prepared.olderVersionNumber} 版`)}
      const option = [...document.querySelectorAll('.manuscript-version-menu [role=option]')]
        .find((item) => item.querySelector('strong')?.textContent?.replace(/\\s+/g, ' ').trim() === expected)
      if (!(option instanceof HTMLButtonElement)) throw new Error('找不到需要切换的旧章节版本。')
      option.click()
    })()`)
    await waitFor(`window.paperAgent.workspace.get().then((workspace) => {
      const section = workspace.sections.find((item) => item.id === ${JSON.stringify(prepared.sectionId)})
      return section?.activeGenerationVersionId === ${JSON.stringify(prepared.olderVersionId)}
        && section.content.includes(${JSON.stringify(prepared.olderMarker)})
        && !section.content.includes(${JSON.stringify(prepared.latestMarker)})
    })`)
    await waitFor(`document.querySelector('.manuscript-paper .markdown-body')?.textContent?.includes(${JSON.stringify(prepared.olderMarker)})`)

    const switched = await evaluate(`window.paperAgent.workspace.get().then((workspace) => {
      const section = workspace.sections.find((item) => item.id === ${JSON.stringify(prepared.sectionId)})
      return {
        activeVersionId: section?.activeGenerationVersionId,
        versionTriggerText: document.querySelector('.manuscript-version-trigger')?.textContent?.replace(/\\s+/g, ' ').trim(),
        bodyContainsOlderMarker: document.querySelector('.manuscript-paper .markdown-body')?.textContent?.includes(${JSON.stringify(prepared.olderMarker)}),
        bodyContainsLatestMarker: document.querySelector('.manuscript-paper .markdown-body')?.textContent?.includes(${JSON.stringify(prepared.latestMarker)}),
      }
    })`)
    if (
      switched.activeVersionId !== prepared.olderVersionId
      || !switched.versionTriggerText?.includes(`第 ${prepared.olderVersionNumber} 版`)
      || !switched.bodyContainsOlderMarker
      || switched.bodyContainsLatestMarker
    ) throw new Error(`旧版本没有真实切换到当前正文：${JSON.stringify(switched)}`)
    await capture(`${outputDir}/section-version-restored-body.png`)

    if (runtimeErrors.length > 0) {
      throw new Error(`章节版本原生界面存在运行时错误：${runtimeErrors.join('；')}`)
    }
    process.stdout.write(`${JSON.stringify({
      ok: true,
      prepared,
      controls,
      menu,
      switched,
      screenshots: [
        `${outputDir}/section-version-menu.png`,
        `${outputDir}/section-version-restored-body.png`,
      ],
      runtimeErrors,
    }, null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      runtimeErrors,
    }, null, 2)}\n`)
    throw error
  } finally {
    client.close()
  }
}

async function clickButtonText(selector, text) {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((item) => item.textContent?.includes(${JSON.stringify(text)}))
    if (!(button instanceof HTMLElement)) throw new Error(${JSON.stringify(`找不到按钮：${text}`)})
    button.click()
  })()`)
}

async function capture(path) {
  const screenshot = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(screenshot.data, 'base64'))
}

async function waitFor(expression, timeout = 15_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return
    await new Promise((resolve) => setTimeout(resolve, 75))
  }
  throw new Error(`等待界面超时：${expression}`)
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

async function findTarget() {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      const targets = await response.json()
      const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
      if (target) return target
    } catch {
      // 等待隔离 Electron 调试端口。
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('未找到隔离 Electron 页面。')
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
