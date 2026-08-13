#!/usr/bin/env node

/**
 * 连接已启动的原生 Electron 窗口，验证右侧大纲点击二级标题后能显示父稿中的对应内容。
 * 脚本不会启动浏览器，也不会修改模型、文献或论文正文。
 */

const port = Number(process.env.ACADEMIC_AGENT_CDP_PORT ?? 9338)

async function main() {
  const target = await findTarget()
  const client = await CdpClient.connect(target.webSocketDebuggerUrl)
  try {
    const result = await evaluate(client, `
      (async () => {
        const workspace = await window.paperAgent?.workspace.get()
        if (!workspace) throw new Error('未找到桌面桥接接口')
        const activeProjectId = workspace.settings.activeProjectId
        const projectSections = workspace.sections.filter((item) => item.projectId === activeProjectId)
        const derived = projectSections.find(
          (item) => item.derivedFromSectionId && item.level > 1 && item.content.trim()
        )
        if (!derived) throw new Error('当前研究没有可验证的同步小节')

        const manuscriptTab = [...document.querySelectorAll('[role="tab"]')]
          .find((item) => item.textContent?.includes('稿件'))
        manuscriptTab?.click()

        const deadline = Date.now() + 10000
        let outlineButton
        while (Date.now() < deadline) {
          outlineButton = [...document.querySelectorAll('.outline-row')]
            .find((item) => item.textContent?.includes(derived.title))
          if (outlineButton) break
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        if (!outlineButton) throw new Error('右侧大纲中未找到同步小节')
        outlineButton.click()

        let paperText = ''
        while (Date.now() < deadline) {
          paperText = document.querySelector('.manuscript-paper')?.textContent?.trim() ?? ''
          if (paperText && !paperText.includes('本章尚未生成')) break
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        return {
          projectId: activeProjectId,
          sectionId: derived.id,
          title: derived.title,
          derivedFromSectionId: derived.derivedFromSectionId,
          contentLength: derived.content.length,
          selected: outlineButton.getAttribute('aria-current') === 'true',
          showsEmptyState: paperText.includes('本章尚未生成'),
          renderedTextLength: paperText.length,
        }
      })()
    `)
    if (!result.selected || result.showsEmptyState || result.renderedTextLength === 0) {
      throw new Error(`原生界面验证失败：${JSON.stringify(result)}`)
    }
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`)
  } finally {
    client.close()
  }
}

async function findTarget() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`)
  if (!response.ok) throw new Error(`CDP 目标请求失败：HTTP ${response.status}`)
  const targets = await response.json()
  const pages = Array.isArray(targets)
    ? targets.filter((item) => item?.type === 'page' && item.webSocketDebuggerUrl)
    : []
  const target = pages.find((item) => /学术 Agent|AIWritePaper/i.test(`${item.title} ${item.url}`)) ?? pages[0]
  if (!target) throw new Error('未找到学术 Agent 原生窗口')
  return target
}

async function evaluate(client, expression) {
  const response = await client.call('Runtime.evaluate', {
    expression,
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
      const timeout = setTimeout(() => reject(new Error('连接原生窗口超时')), 10_000)
      socket.addEventListener('open', () => {
        clearTimeout(timeout)
        resolve()
      }, { once: true })
      socket.addEventListener('error', () => {
        clearTimeout(timeout)
        reject(new Error('无法连接原生窗口'))
      }, { once: true })
    })
    return new CdpClient(socket)
  }

  constructor(socket) {
    this.socket = socket
    this.nextId = 0
    this.pending = new Map()
    socket.addEventListener('message', (event) => this.receive(event))
  }

  call(method, params) {
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`原生窗口调用超时：${method}`))
      }, 30_000)
      this.pending.set(id, { resolve, reject, timeout })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  receive(event) {
    let message
    try {
      message = JSON.parse(String(event.data))
    } catch {
      return
    }
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    clearTimeout(pending.timeout)
    if (message.error) pending.reject(new Error(message.error.message))
    else pending.resolve(message.result)
  }

  close() {
    this.socket.close()
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : '原生界面验证失败'}\n`)
  process.exitCode = 1
})
