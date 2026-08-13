import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'

const HOST = '127.0.0.1'
const PORT = parseInteger(process.env.AIWRITEPAPER_MOCK_PORT, 43_123, 1, 65_535)
const CHUNK_DELAY_MS = parseInteger(process.env.AIWRITEPAPER_MOCK_CHUNK_DELAY_MS, 4, 0, 1_000)
const MODEL_ID = 'mock-paper-agent'
const MAX_REQUEST_BYTES = 2 * 1024 * 1024

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${HOST}:${PORT}`)

    if (request.method === 'GET' && url.pathname === '/v1/models') {
      writeJson(response, 200, {
        object: 'list',
        data: [
          {
            id: MODEL_ID,
            object: 'model',
            created: 0,
            owned_by: 'aiwritepaper-local-qa',
          },
        ],
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
      const payload = await readJsonBody(request)
      const messages = normalizeMessages(payload.messages)
      const content = createMockContent(messages)
      const model = typeof payload.model === 'string' && payload.model.trim()
        ? payload.model.trim().slice(0, 200)
        : MODEL_ID

      if (payload.stream === false) {
        writeJson(response, 200, {
          id: `chatcmpl-mock-${randomUUID()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1_000),
          model,
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: estimateUsage(messages, content),
        })
        return
      }

      await writeStreamingCompletion(response, model, content)
      return
    }

    writeJson(response, 404, {
      error: { message: '本地 Mock 仅支持 GET /v1/models 与 POST /v1/chat/completions。' },
    })
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    const message = error instanceof HttpError ? error.message : '本地 Mock 处理请求失败。'
    if (!response.headersSent) writeJson(response, status, { error: { message } })
    else response.end()
  }
})

server.on('clientError', (_error, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
})

server.on('error', (error) => {
  // 只输出启动错误代码，不记录请求、请求头或凭证。
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'UNKNOWN'
  console.error(`AIWritePaper Mock 启动失败：${code}`)
  process.exitCode = 1
})

server.listen(PORT, HOST, () => {
  console.log(`AIWritePaper OpenAI-compatible Mock 已启动：http://${HOST}:${PORT}/v1`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => process.exit(0)))
}

async function readJsonBody(request) {
  const chunks = []
  let received = 0

  for await (const chunk of request) {
    received += chunk.byteLength
    if (received > MAX_REQUEST_BYTES) throw new HttpError(413, '请求正文超过 2 MB 上限。')
    chunks.push(chunk)
  }

  if (chunks.length === 0) throw new HttpError(400, '请求正文不能为空。')
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, '请求正文不是合法 JSON。')
  }
}

function normalizeMessages(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(400, 'messages 必须是非空数组。')
  }

  return value.slice(-50).map((message) => ({
    role: typeof message?.role === 'string' ? message.role : 'user',
    content: normalizeContent(message?.content).slice(0, 200_000),
  }))
}

function normalizeContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
}

function createMockContent(messages) {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
  const latestUser = [...messages].reverse().find((message) => message.role === 'user')?.content ?? ''
  const prompt = `${system}\n\n${latestUser}`

  if (/三级提纲|结构化、可追溯的论文三级提纲|只输出合法 JSON/.test(prompt)) {
    return createOutline(prompt)
  }
  if (/只生成指定小节正文|请撰写：|本节目标：/.test(prompt)) {
    return createSection(prompt)
  }
  return createConversationReply(prompt, latestUser)
}

function createOutline(prompt) {
  const targetWords = clamp(
    Number(/目标篇幅：约?\s*([\d,]+)/.exec(prompt)?.[1]?.replaceAll(',', '')) || 8_000,
    1_500,
    100_000,
  )
  const references = extractLiteratureIds(prompt)
  const refs = (start = 0, count = 1) => references.slice(start, start + count)
  const words = (ratio, minimum = 200) => Math.max(minimum, Math.round(targetWords * ratio))

  return JSON.stringify(
    [
      {
        id: 'mock-1',
        title: '绪论',
        level: 1,
        objective: '界定研究问题、现实背景与论文的分析边界，说明研究价值和整体路径。',
        targetWords: words(0.16),
        citationIds: refs(0, 1),
        children: [
          {
            id: 'mock-1-1',
            title: '研究背景与问题提出',
            level: 2,
            objective: '从现实场景和学术语境中提炼可回答的核心问题。',
            targetWords: words(0.08),
            citationIds: refs(0, 1),
            children: [
              {
                id: 'mock-1-1-1',
                title: '研究情境与矛盾识别',
                level: 3,
                objective: '说明研究对象所处情境、主要矛盾以及问题成立的前提。',
                targetWords: words(0.04),
                citationIds: refs(0, 1),
                children: [],
              },
            ],
          },
          {
            id: 'mock-1-2',
            title: '研究目标与研究思路',
            level: 2,
            objective: '明确研究目标、核心问题、分析步骤和全文结构。',
            targetWords: words(0.08),
            citationIds: [],
            children: [],
          },
        ],
      },
      {
        id: 'mock-2',
        title: '理论基础与文献综述',
        level: 1,
        objective: '梳理核心概念、理论解释和既有研究，并形成可检验的分析框架。',
        targetWords: words(0.26),
        citationIds: refs(0, 3),
        children: [
          {
            id: 'mock-2-1',
            title: '核心概念与理论基础',
            level: 2,
            objective: '给出关键概念的工作性定义，并说明理论对研究问题的解释力。',
            targetWords: words(0.12),
            citationIds: refs(0, 2),
            children: [
              {
                id: 'mock-2-1-1',
                title: '概念边界与分析维度',
                level: 3,
                objective: '区分相近概念，确定后续分析采用的维度和判断标准。',
                targetWords: words(0.05),
                citationIds: refs(0, 1),
                children: [],
              },
            ],
          },
          {
            id: 'mock-2-2',
            title: '既有研究评述与研究缺口',
            level: 2,
            objective: '比较既有观点、证据和方法，指出尚未充分回答的问题。',
            targetWords: words(0.14),
            citationIds: refs(1, 3),
            children: [],
          },
        ],
      },
      {
        id: 'mock-3',
        title: '研究设计与分析',
        level: 1,
        objective: '说明资料来源、分析方法和证据边界，并围绕研究问题展开论证。',
        targetWords: words(0.42),
        citationIds: refs(0, 4),
        children: [
          {
            id: 'mock-3-1',
            title: '研究设计与资料处理',
            level: 2,
            objective: '交代研究对象、资料选择、处理步骤、质量控制和局限。',
            targetWords: words(0.14),
            citationIds: refs(0, 2),
            children: [
              {
                id: 'mock-3-1-1',
                title: '资料来源与证据等级',
                level: 3,
                objective: '区分元数据、摘要和全文证据，避免超出可核验范围作结论。',
                targetWords: words(0.06),
                citationIds: refs(0, 2),
                children: [],
              },
            ],
          },
          {
            id: 'mock-3-2',
            title: '结果分析与讨论',
            level: 2,
            objective: '依照分析框架组织证据、解释差异，并与既有研究形成对话。',
            targetWords: words(0.28),
            citationIds: refs(0, 4),
            children: [
              {
                id: 'mock-3-2-1',
                title: '主要发现及其解释',
                level: 3,
                objective: '逐项回答研究问题，并明确每项判断的证据来源与适用范围。',
                targetWords: words(0.14),
                citationIds: refs(0, 3),
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: 'mock-4',
        title: '结论与展望',
        level: 1,
        objective: '总结研究结论、理论与实践启示，说明局限并提出后续研究方向。',
        targetWords: words(0.16),
        citationIds: refs(0, 1),
        children: [
          {
            id: 'mock-4-1',
            title: '研究结论与启示',
            level: 2,
            objective: '对应研究问题凝练结论，避免引入正文未论证的新事实。',
            targetWords: words(0.1),
            citationIds: refs(0, 1),
            children: [],
          },
          {
            id: 'mock-4-2',
            title: '研究局限与未来方向',
            level: 2,
            objective: '说明资料、方法和外推范围的限制，并提出可执行的改进方向。',
            targetWords: words(0.06),
            citationIds: [],
            children: [],
          },
        ],
      },
    ],
    null,
    2,
  )
}

function createSection(prompt) {
  const title = captureLine(prompt, '请撰写') || '指定小节'
  const objective = captureLine(prompt, '本节目标') || '围绕研究问题形成清晰、可核验的论证'
  const references = extractLiteratureIds(prompt)
  const citation = references[0] ? `【文献:${references[0]}】` : ''
  const evidenceBoundary = references.length
    ? `当前上下文提供了可追溯文献条目，本节仅在其元数据或摘要所能支持的范围内使用 ${citation}，不把“已检索到”直接等同于“全文观点已核验”。`
    : '当前上下文没有可用的已纳入文献，因此本节只搭建分析框架，不虚构作者、DOI、页码、样本或统计结果。'

  return [
    `### ${title}`,
    '',
    `本节围绕“${objective}”展开。首先需要把研究对象、分析层次与判断标准区分开来：研究对象回答“讨论什么”，分析层次说明“从何种尺度观察”，判断标准则决定“凭什么形成结论”。三者若混在一起，容易出现概念替代证据、局部现象被外推为普遍规律等问题。因此，后续论证采用“问题界定—机制解释—证据核对—边界说明”的顺序。`,
    '',
    `在问题界定层面，应把宽泛主题转换为能够由现有资料回答的具体问题。本文关注的不是简单描述现象，而是识别现象背后的关键条件、作用路径及可能结果。不同条件之间可能存在协同、替代或约束关系，分析时需要逐项说明其逻辑联系，并把事实陈述、理论解释与规范性建议分开，避免以价值判断代替经验依据。`,
    '',
    `${evidenceBoundary} 对每项重要判断，应继续核对资料的作者、年份、来源和核验状态；若只有摘要，则只能概括摘要明确表达的内容。对于尚不能确认的因果关系、数量差异或适用范围，应保留“当前证据不足”的标记，而不是补造细节。`,
    '',
    `在机制分析层面，可以将影响过程拆分为输入、转化与结果三个环节。输入包括制度环境、资源条件与参与主体；转化环节关注这些因素如何经过具体流程产生作用；结果环节则需要同时观察预期效果与潜在代价。这一结构有助于定位分歧究竟来自前提不同、过程失效，还是衡量结果的尺度不同，也便于后续把每个论点映射到相应证据。`,
    '',
    `综合来看，本节形成的是一个有边界的解释框架：结论只覆盖当前资料能够支持的范围，未核验信息不进入确定性表述。下一步应将框架中的关键变量与文献证据逐一对应，并检查反例、替代解释和适用条件。这样既能保持论证连贯，也能为后续章节的比较、讨论和建议提供可复核的基础。`,
  ].join('\n')
}

function createConversationReply(prompt, latestUser) {
  const projectTitle = /题目：([^\n]+)/.exec(prompt)?.[1]?.trim()
  const references = extractLiteratureIds(prompt)
  const question = latestUser.trim().slice(0, 240) || '继续完善当前论文'
  const evidenceSummary = references.length
    ? `当前上下文中有 ${references.length} 条可追溯文献 ID；引用时我会使用“【文献:ID】”，并区分元数据、摘要和全文证据。`
    : '当前上下文未提供可引用文献，因此我不会补造文献或实证结论。'

  return [
    `我已基于${projectTitle ? `“${projectTitle}”` : '当前论文项目'}的本机上下文处理你的问题：“${question}”。`,
    '',
    evidenceSummary,
    '',
    '建议按三个层次继续：先确认需要修改的具体章节与目标，再明确可用证据及其核验状态，最后只重写受到影响的段落并保留其他内容。若你希望直接修改，请指出章节或粘贴选中文本；若希望补强依据，请先在文献库纳入相关记录。',
  ].join('\n')
}

async function writeStreamingCompletion(response, model, content) {
  const completionId = `chatcmpl-mock-${randomUUID()}`
  const created = Math.floor(Date.now() / 1_000)
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  response.flushHeaders()

  writeSse(response, {
    id: completionId,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
  })

  for (const delta of splitContent(content, 28)) {
    if (response.destroyed || response.writableEnded) return
    writeSse(response, {
      id: completionId,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
    })
    if (CHUNK_DELAY_MS > 0) await delay(CHUNK_DELAY_MS)
  }

  if (response.destroyed || response.writableEnded) return
  writeSse(response, {
    id: completionId,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  })
  response.end('data: [DONE]\n\n')
}

function writeSse(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function writeJson(response, status, payload) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  response.end(body)
}

function splitContent(value, size) {
  const characters = Array.from(value)
  const chunks = []
  for (let index = 0; index < characters.length; index += size) {
    chunks.push(characters.slice(index, index + size).join(''))
  }
  return chunks
}

function extractLiteratureIds(prompt) {
  return [
    ...new Set(
      [...prompt.matchAll(/\[ID=([^\]\s]+)\]/g)]
        .map((match) => match[1]?.trim())
        .filter(Boolean),
    ),
  ].slice(0, 20)
}

function captureLine(prompt, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}[：:]\\s*([^\\n]+)`).exec(prompt)?.[1]?.trim().slice(0, 300)
}

function estimateUsage(messages, content) {
  const inputCharacters = messages.reduce((total, message) => total + message.content.length, 0)
  const promptTokens = Math.max(1, Math.ceil(inputCharacters / 3))
  const completionTokens = Math.max(1, Math.ceil(content.length / 3))
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  }
}

function parseInteger(value, fallback, minimum, maximum) {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new TypeError(`环境变量必须是 ${minimum} 到 ${maximum} 的整数。`)
  }
  return parsed
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
