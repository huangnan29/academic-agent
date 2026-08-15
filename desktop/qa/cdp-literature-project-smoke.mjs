#!/usr/bin/env node

/**
 * 连接已经启动的隔离 Electron，验收文献按项目分类、纳入状态与可用性边界。
 * 本脚本不启动应用、不检索新文献，也不会伪造隔离工作区数据。
 */
import { mkdir, writeFile } from 'node:fs/promises'

const port = Number(process.env.AIWRITEPAPER_CDP_PORT)
const outputDir = process.env.AIWRITEPAPER_LITERATURE_PROJECT_OUTPUT

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('AIWRITEPAPER_CDP_PORT 必须是有效端口。')
}
if (!outputDir) throw new Error('缺少 AIWRITEPAPER_LITERATURE_PROJECT_OUTPUT。')

let client

async function main() {
  await mkdir(outputDir, { recursive: true })
  const target = await findTarget()
  client = await CdpClient.connect(target.webSocketDebuggerUrl)
  const runtimeErrors = []
  const screenshots = []

  try {
    await client.call('Runtime.enable')
    await client.call('Log.enable')
    await client.call('Page.enable')
    client.on('Runtime.exceptionThrown', (params) => {
      runtimeErrors.push(redact(params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? '运行时异常'))
    })
    client.on('Log.entryAdded', (params) => {
      if (params.entry?.level === 'error') runtimeErrors.push(redact(params.entry.text))
    })

    await waitFor("Boolean(window.paperAgent?.workspace?.get && window.paperAgent?.project?.setActive && window.paperAgent?.literature?.setProject)")
    const fixture = await evaluate(`(async () => {
      const workspace = await window.paperAgent.workspace.get()
      if (workspace.projects.length === 0) throw new Error('隔离工作区没有项目，无法验收项目分类。')

      const projectById = new Map(workspace.projects.map((project) => [project.id, project]))
      const eligibleRecords = workspace.literature.filter((item) => {
        const project = item.projectId ? projectById.get(item.projectId) : undefined
        return Boolean(
          project
          && project.origin !== 'demo'
          && item.origin !== 'demo'
          && item.source !== 'demo'
          && item.verificationStatus !== 'demo'
        )
      })
      // 卡片暂未暴露记录 ID，选择标题唯一的真实记录，避免同题记录导致验收误点。
      const record = eligibleRecords.find((item) => (
        workspace.literature.filter((candidate) => candidate.title === item.title).length === 1
      ))
      if (!record?.projectId) {
        throw new Error('隔离工作区缺少标题唯一、已归属真实项目的非 demo 文献，无法执行纳入与移出验收。')
      }
      const project = projectById.get(record.projectId)
      if (!project) throw new Error('候选文献的所属项目不存在。')
      const demoRecord = workspace.literature.find((item) => item.origin === 'demo')
      if (!demoRecord) throw new Error('隔离工作区缺少用于验收永久删除的演示文献。')
      const projectIndex = workspace.projects.findIndex((item) => item.id === project.id)
      await window.paperAgent.project.setActive(project.id)
      return {
        project: { id: project.id, title: project.title, index: projectIndex },
        projects: workspace.projects.map((item) => ({ id: item.id, title: item.title })),
        record: { id: record.id, title: record.title, included: record.included },
        demoRecord: { id: demoRecord.id, title: demoRecord.title, projectId: demoRecord.projectId },
      }
    })()`)

    await evaluate("(() => { location.reload(); return true })()")
    await waitFor("Boolean(document.querySelector('.sidebar') || document.querySelector('.settings-back-button'))")
    await openLibrary()

    const categories = await inspectCategories()
    if (categories.length !== fixture.projects.length + 1 || categories[0]?.label !== '全部文献') {
      throw new Error(`项目分类数量或首项错误：${JSON.stringify(categories)}`)
    }
    for (const project of fixture.projects) {
      if (!categories.some((item) => item.label === project.title)) {
        throw new Error(`文献库缺少项目分类：${project.title}`)
      }
    }

    await selectScope(0, '全部文献')
    const allOwner = await inspectRecord(fixture.record.title, fixture.project.title)
    if (!allOwner?.projectLabel?.includes(fixture.project.title)) {
      throw new Error(`全部文献卡片没有展示正确项目归属：${JSON.stringify(allOwner)}`)
    }

    await selectScope(fixture.project.index + 1, fixture.project.title)
    await waitFor(recordVisibleExpression(fixture.record.title))
    screenshots.push(await capture('literature-current-project.png'))

    // 若记录初始已经纳入，先恢复为未纳入，再完整执行“纳入→取消纳入→移出项目”。
    const currentState = await readRecordState(fixture.record.id)
    if (currentState.included) {
      await clickRecordAction(fixture.record.title, '取消纳入')
      await waitFor(recordStateExpression(fixture.record.id, false, fixture.project.id))
    }

    await clickRecordAction(fixture.record.title, '纳入项目')
    await waitFor(recordStateExpression(fixture.record.id, true, fixture.project.id))
    await clickRecordAction(fixture.record.title, '取消纳入')
    await waitFor(recordStateExpression(fixture.record.id, false, fixture.project.id))
    await clickRecordAction(fixture.record.title, '移出项目')
    await waitFor(recordStateExpression(fixture.record.id, false, undefined))
    await waitFor(`!(${recordVisibleExpression(fixture.record.title)})`)

    await selectScope(0, '全部文献')
    await waitFor(recordVisibleExpression(fixture.record.title, '未分类'))
    const unclassified = await inspectRecord(fixture.record.title, '未分类')
    if (!unclassified?.projectLabel?.includes('未分类')) {
      throw new Error(`移出后全部文献没有显示“未分类”：${JSON.stringify(unclassified)}`)
    }

    await openRecordDetail(fixture.record.title, '未分类')
    const detail = await evaluate(`(() => ({
      title: document.querySelector('.detail-panel-body h2')?.textContent?.trim(),
      metadata: document.querySelector('.metadata-list')?.textContent?.replace(/\\s+/g, ' ').trim(),
      boundary: document.querySelector('.evidence-boundary')?.textContent?.replace(/\\s+/g, ' ').trim(),
    }))()`)
    if (detail.title !== fixture.record.title || !detail.metadata?.includes('未分类')) {
      throw new Error(`文献详情没有展示移出后的归属：${JSON.stringify(detail)}`)
    }
    if (
      !detail.boundary?.includes('当前检查只验证元数据、摘要、来源链接和引用映射')
      || !detail.boundary.includes('不会自动判断该文献是否支持正文主张')
    ) {
      throw new Error(`文献详情缺少新的可用性边界：${JSON.stringify(detail)}`)
    }
    screenshots.push(await capture('literature-unclassified-detail.png'))

    await clickRecordAction(fixture.demoRecord.title, '删除')
    await waitFor("document.querySelector('#delete-literature-title')?.textContent?.includes('删除这篇文献')")
    screenshots.push(await capture('literature-delete-confirm.png'))
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('.modal-footer button')]
        .find((candidate) => candidate.textContent?.trim() === '永久删除')
      if (!(button instanceof HTMLButtonElement) || button.disabled) throw new Error('找不到可用的永久删除按钮。')
      button.click()
      return true
    })()`)
    await waitFor(`window.paperAgent.workspace.get().then((workspace) => (
      !workspace.literature.some((item) => item.id === ${JSON.stringify(fixture.demoRecord.id)})
    ))`)
    await waitFor(`!(${recordVisibleExpression(fixture.demoRecord.title)})`)
    screenshots.push(await capture('literature-demo-deleted.png'))

    const summary = {
      ok: runtimeErrors.length === 0,
      project: fixture.project,
      record: {
        id: fixture.record.id,
        title: fixture.record.title,
        transitions: ['纳入项目', '取消纳入', '移出项目', '全部文献：未分类'],
      },
      categoryCount: categories.length,
      detailBoundary: detail.boundary,
      permanentDelete: {
        id: fixture.demoRecord.id,
        title: fixture.demoRecord.title,
        removedFromLibrary: true,
      },
      screenshots,
      runtimeErrors,
    }
    await writeSummary(summary)
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    if (!summary.ok) process.exitCode = 1
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : String(error))
    try {
      screenshots.push(await capture('literature-project-failure.png'))
    } catch {
      // 页面已经不可用时，只保留结构化失败信息。
    }
    const summary = { ok: false, error: message, screenshots, runtimeErrors }
    await writeSummary(summary)
    process.stderr.write(`${JSON.stringify(summary, null, 2)}\n`)
    process.exitCode = 1
  } finally {
    client.close()
  }
}

async function openLibrary() {
  await evaluate(`(() => {
    const back = document.querySelector('.settings-back-button')
    if (back instanceof HTMLElement) back.click()
    return true
  })()`)
  await waitFor("Boolean(document.querySelector('.primary-nav button[title=\"文献库\"]'))")
  await evaluate(`(() => {
    const button = document.querySelector('.primary-nav button[title="文献库"]')
    if (!(button instanceof HTMLElement)) throw new Error('找不到文献库入口。')
    button.click()
    return true
  })()`)
  await waitFor("Boolean(document.querySelector('.library-page .library-project-scopes'))")
}

async function inspectCategories() {
  return evaluate(`(() => [...document.querySelectorAll('.library-project-scopes button')].map((button) => ({
    label: button.querySelector('span')?.textContent?.trim(),
    count: button.querySelector('small')?.textContent?.trim(),
    active: button.getAttribute('aria-current') === 'page',
  })))()`)
}

async function selectScope(index, expectedLabel) {
  await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('.library-project-scopes button')]
    const button = buttons[${index}]
    if (!(button instanceof HTMLElement)) throw new Error(${JSON.stringify(`找不到文献分类：${expectedLabel}`)})
    if (button.querySelector('span')?.textContent?.trim() !== ${JSON.stringify(expectedLabel)}) {
      throw new Error('文献分类顺序与工作区项目不一致。')
    }
    button.click()
    return true
  })()`)
  await waitFor(`document.querySelectorAll('.library-project-scopes button')[${index}]?.getAttribute('aria-current') === 'page'`)
}

function recordVisibleExpression(title, projectLabel) {
  return `[...document.querySelectorAll('.literature-item')].some((item) => (
    item.querySelector('.literature-copy strong')?.textContent?.trim() === ${JSON.stringify(title)}
    ${projectLabel ? `&& item.querySelector('.literature-project-label')?.textContent?.includes(${JSON.stringify(projectLabel)})` : ''}
  ))`
}

async function inspectRecord(title, projectLabel) {
  return evaluate(`(() => {
    const item = [...document.querySelectorAll('.literature-item')].find((candidate) => (
      candidate.querySelector('.literature-copy strong')?.textContent?.trim() === ${JSON.stringify(title)}
      && candidate.querySelector('.literature-project-label')?.textContent?.includes(${JSON.stringify(projectLabel)})
    ))
    if (!item) return undefined
    return {
      title: item.querySelector('.literature-copy strong')?.textContent?.trim(),
      projectLabel: item.querySelector('.literature-project-label')?.textContent?.replace(/\\s+/g, ' ').trim(),
      actions: [...item.querySelectorAll('.literature-actions button')].map((button) => button.textContent?.trim()),
    }
  })()`)
}

async function clickRecordAction(title, actionLabel) {
  await waitFor(`[...document.querySelectorAll('.literature-item')].some((item) => (
    item.querySelector('.literature-copy strong')?.textContent?.trim() === ${JSON.stringify(title)}
    && [...item.querySelectorAll('.literature-actions button')].some((button) => (
      button.textContent?.trim() === ${JSON.stringify(actionLabel)} && !button.disabled
    ))
  ))`)
  await evaluate(`(() => {
    const item = [...document.querySelectorAll('.literature-item')].find((candidate) => (
      candidate.querySelector('.literature-copy strong')?.textContent?.trim() === ${JSON.stringify(title)}
    ))
    const button = [...(item?.querySelectorAll('.literature-actions button') ?? [])]
      .find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(actionLabel)})
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      throw new Error(${JSON.stringify(`无法执行文献操作：${actionLabel}`)})
    }
    button.click()
    return true
  })()`)
}

async function openRecordDetail(title, projectLabel) {
  await evaluate(`(() => {
    const item = [...document.querySelectorAll('.literature-item')].find((candidate) => (
      candidate.querySelector('.literature-copy strong')?.textContent?.trim() === ${JSON.stringify(title)}
      && candidate.querySelector('.literature-project-label')?.textContent?.includes(${JSON.stringify(projectLabel)})
    ))
    const button = item?.querySelector('.literature-main')
    if (!(button instanceof HTMLElement)) throw new Error('找不到待打开的文献卡片。')
    button.click()
    return true
  })()`)
  await waitFor(`document.querySelector('.detail-panel-body h2')?.textContent?.trim() === ${JSON.stringify(title)}`)
}

async function readRecordState(recordId) {
  return evaluate(`window.paperAgent.workspace.get().then((workspace) => {
    const record = workspace.literature.find((item) => item.id === ${JSON.stringify(recordId)})
    if (!record) throw new Error('验收文献已经不存在。')
    return { included: record.included, projectId: record.projectId }
  })`)
}

function recordStateExpression(recordId, included, projectId) {
  const projectCheck = projectId
    ? `record.projectId === ${JSON.stringify(projectId)}`
    : '!record.projectId'
  return `window.paperAgent.workspace.get().then((workspace) => {
    const record = workspace.literature.find((item) => item.id === ${JSON.stringify(recordId)})
    return Boolean(record && record.included === ${included} && ${projectCheck})
  })`
}

async function capture(name) {
  const path = `${outputDir}/${name}`
  const screenshot = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(screenshot.data, 'base64'))
  return path
}

async function writeSummary(summary) {
  await writeFile(
    `${outputDir}/literature-project-summary.json`,
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  )
}

async function waitFor(expression, timeout = 20_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return
    await delay(100)
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
    throw new Error(redact(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text))
  }
  return response.result?.value
}

async function findTarget() {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      const targets = await response.json()
      const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
      if (target) return target
    } catch {
      // 等待已经启动的隔离 Electron 调试端口。
    }
    await delay(100)
  }
  throw new Error('未找到隔离 Electron 页面。')
}

function redact(value) {
  return String(value)
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1***')
    .replace(/((?:api[_-]?key|authorization|token)["'\s:=]+)[^\s,"'}]+/gi, '$1***')
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

class CdpClient {
  static async connect(url) {
    const socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('连接 CDP WebSocket 超时。')), 10_000)
      socket.addEventListener('open', () => {
        clearTimeout(timeout)
        resolve()
      }, { once: true })
      socket.addEventListener('error', () => {
        clearTimeout(timeout)
        reject(new Error('连接 CDP WebSocket 失败。'))
      }, { once: true })
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
        message.error ? pending.reject(new Error(redact(message.error.message))) : pending.resolve(message.result)
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

main().catch((error) => {
  process.stderr.write(`${redact(error instanceof Error ? error.message : String(error))}\n`)
  process.exitCode = 1
})
