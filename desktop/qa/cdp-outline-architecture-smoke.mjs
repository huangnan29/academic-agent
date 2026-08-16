#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'

const port = Number(process.env.AIWRITEPAPER_CDP_PORT)
const outputDir = process.env.AIWRITEPAPER_OUTLINE_OUTPUT
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('AIWRITEPAPER_CDP_PORT 无效。')
if (!outputDir) throw new Error('缺少 AIWRITEPAPER_OUTLINE_OUTPUT。')

await mkdir(outputDir, { recursive: true })
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json())
const target = targets.find((item) => item.type === 'page' && /学术 Agent|AIWritePaper/.test(item.title))
  ?? targets.find((item) => item.type === 'page')
if (!target?.webSocketDebuggerUrl) throw new Error('找不到学术 Agent 渲染进程。')

const socket = new WebSocket(target.webSocketDebuggerUrl)
const callbacks = new Map()
let sequence = 0
socket.addEventListener('message', (event) => {
  const payload = JSON.parse(String(event.data))
  const callback = callbacks.get(payload.id)
  if (!callback) return
  callbacks.delete(payload.id)
  if (payload.error) callback.reject(new Error(payload.error.message))
  else callback.resolve(payload.result)
})
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

function call(method, params = {}) {
  const id = ++sequence
  return new Promise((resolve, reject) => {
    callbacks.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const result = await call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  }
  return result.result?.value
}

async function waitFor(expression, timeoutMs = 15_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(expression)) return
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`等待界面状态超时：${expression}`)
}

try {
  await call('Runtime.enable')
  await call('Page.enable')
  await waitFor("Boolean(window.paperAgent?.project?.create && window.paperAgent?.outline?.save)")
  const prepared = await evaluate(`(async () => {
    const brief = {
      title: '生成式人工智能赋能高校教学的作用机制研究',
      paperType: '研究论文',
      discipline: '教育/管理（跨学科）',
      language: 'zh-CN',
      targetWords: 12000,
      requirements: '当前没有问卷、访谈或实验数据，只能基于文献与机制分析提出条件化建议。',
      keywords: ['生成式人工智能', '高校教学', '作用机制', '教育治理'],
    }
    const project = await window.paperAgent.project.create(brief)
    const chapters = [
      ['问题界定与理论基础', ['高校教学的现实问题', '生成式人工智能的教育属性']],
      ['赋能机制的构成维度', ['技术适配与认知支持', '主体协同与教学重构']],
      ['作用机制的条件与风险', ['组织条件与教师能力', '认知依赖与治理风险']],
      ['实践路径与实施边界', ['分层应用与课程治理', '评价原则与后续验证']],
    ]
    const outline = chapters.map(([chapterTitle, sectionTitles], chapterIndex) => ({
      id: 'qa-chapter-' + (chapterIndex + 1),
      title: '第' + ['一', '二', '三', '四'][chapterIndex] + '章 ' + chapterTitle,
      level: 1,
      objective: '围绕研究问题推进本章论证。',
      targetWords: 3000,
      citationIds: [],
      servesResearchQuestions: [],
      role: '形成全文论证链的一个环节。',
      keyClaims: ['形成需要文献与分析支持的条件化主张。'],
      evidenceNeeds: ['literature', 'analysis'],
      contentForms: ['prose', 'diagram'],
      transition: '衔接下一章的分析任务。',
      children: sectionTitles.map((sectionTitle, sectionIndex) => ({
        id: 'qa-section-' + (chapterIndex + 1) + '-' + (sectionIndex + 1),
        title: (chapterIndex + 1) + '.' + (sectionIndex + 1) + ' ' + sectionTitle,
        level: 2,
        objective: '拆解本节需要回答的子问题。',
        targetWords: 1500,
        citationIds: [],
        role: '完成本章的一个分析维度。',
        keyClaims: ['比较概念、条件与证据边界。'],
        evidenceNeeds: ['literature', 'analysis'],
        contentForms: ['prose'],
        transition: '转入下一分析维度。',
        children: ['概念与证据边界', '机制关系与适用条件'].map((itemTitle, itemIndex) => ({
          id: 'qa-item-' + (chapterIndex + 1) + '-' + (sectionIndex + 1) + '-' + (itemIndex + 1),
          title: (chapterIndex + 1) + '.' + (sectionIndex + 1) + '.' + (itemIndex + 1) + ' ' + sectionTitle + '：' + itemTitle,
          level: 3,
          objective: '形成可核验、有限度的三级论证单元。',
          targetWords: 750,
          citationIds: [],
          role: '完成具体论证。',
          keyClaims: ['仅在证据支持范围内形成结论。'],
          evidenceNeeds: ['literature', 'analysis'],
          contentForms: ['prose'],
          transition: '',
          children: [],
        })),
      })),
    }))
    await window.paperAgent.outline.save(project.id, outline)
    return { projectId: project.id, title: project.title }
  })()`)
  await evaluate('location.reload(); true')
  await waitFor("Boolean(document.querySelector('.right-tabs'))")
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('.right-tabs button')]
      .find((item) => item.textContent?.includes('稿件'))
    if (!(button instanceof HTMLButtonElement)) throw new Error('找不到稿件标签。')
    button.click()
  })()`)
  await waitFor("Boolean(document.querySelector('.outline-architecture-summary'))")
  const result = await evaluate(`window.paperAgent.workspace.get().then((workspace) => {
    const architecture = workspace.outlineArchitectures?.[${JSON.stringify(prepared.projectId)}]
    const quality = workspace.outlineQualityReports?.[${JSON.stringify(prepared.projectId)}]
    const summary = document.querySelector('.outline-architecture-summary')
    return {
      architecture,
      quality,
      summaryText: summary?.textContent?.replace(/\\s+/g, ' ').trim(),
      summaryVisible: summary instanceof HTMLElement && summary.getBoundingClientRect().height > 0,
    }
  })`)
  if (result.architecture?.pattern !== 'policy-management') {
    throw new Error(`结构路由错误：${JSON.stringify(result.architecture)}`)
  }
  if (result.architecture?.disciplineFamily !== 'interdisciplinary') {
    throw new Error(`专业类别错误：${JSON.stringify(result.architecture)}`)
  }
  if (result.quality?.passed !== true || !result.summaryVisible) {
    throw new Error(`质量报告或摘要未通过：${JSON.stringify(result)}`)
  }
  const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(`${outputDir}/outline-architecture-summary.png`, Buffer.from(screenshot.data, 'base64'))
  await evaluate(`(() => {
    const button = document.querySelector('.outline-architecture-summary__toggle')
    if (!(button instanceof HTMLButtonElement)) throw new Error('找不到结构详情按钮。')
    button.click()
  })()`)
  await waitFor("document.querySelector('.outline-architecture-summary__toggle')?.getAttribute('aria-expanded') === 'true'")
  const detailScreenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(`${outputDir}/outline-architecture-details.png`, Buffer.from(detailScreenshot.data, 'base64'))
  await writeFile(`${outputDir}/outline-architecture-summary.json`, `${JSON.stringify({ ok: true, prepared, result }, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify({ ok: true, prepared, result }, null, 2)}\n`)
} finally {
  socket.close()
}
