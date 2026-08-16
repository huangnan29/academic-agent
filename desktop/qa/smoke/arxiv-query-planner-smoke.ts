import {
  arxivResultCount,
  buildLocalArxivFallbackQueries,
  executeArxivSearchWithRetry,
  isArxivErrorResult,
  needsArxivQueryPlanning,
  parseArxivPlannerQueries,
} from '../../electron/main/arxivSearch'
import type { McpToolCallResult } from '../../shared/contracts'

function result(total: number): McpToolCallResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ total_results: total, papers: total > 0 ? [{ id: '1' }] : [] }) }],
    structuredContent: { total_results: total },
    isError: false,
  }
}

async function main(): Promise<void> {
  if (!needsArxivQueryPlanning('生成式人工智能在教育')) throw new Error('中文查询没有进入规划流程。')
  if (needsArxivQueryPlanning('ti:"generative artificial intelligence" AND education')) {
    throw new Error('英文 arXiv 检索式被错误地判定为自然语言指令。')
  }

  const local = buildLocalArxivFallbackQueries('生成式人工智能在高等教育教学中的作用机制')
  if (local.length === 0 || local.some((query) => /[\u3400-\u9fff]/u.test(query))) {
    throw new Error('本机回退没有生成英文查询。')
  }

  const planned = parseArxivPlannerQueries('```json\n{"queries":["\\\"generative AI\\\" AND education","ChatGPT AND teaching"]}\n```')
  if (planned.length !== 2 || planned[0] !== '"generative AI" AND education') {
    throw new Error('模型查询 JSON 解析失败。')
  }

  const calls: string[] = []
  const retried = await executeArxivSearchWithRetry(
    { query: '原始中文', max_results: 5 },
    ['"generative AI" AND "higher education"', 'ChatGPT AND education'],
    async (arguments_) => {
      calls.push(String(arguments_.query))
      return result(calls.length === 1 ? 0 : 2)
    },
  )
  if (calls.length !== 2 || arxivResultCount(retried.result) !== 2) {
    throw new Error('零结果后没有自动放宽重试。')
  }
  if (retried.arguments.query !== 'ChatGPT AND education') throw new Error('没有保留真实命中的查询参数。')

  let argumentsBeforeFailure: Record<string, unknown> | undefined
  await executeArxivSearchWithRetry(
    { query: '原始中文', max_results: 5 },
    ['ChatGPT AND education'],
    async () => { throw new Error('模拟网络中断') },
    (arguments_) => { argumentsBeforeFailure = arguments_ },
  ).catch(() => undefined)
  if (argumentsBeforeFailure?.query !== 'ChatGPT AND education') {
    throw new Error('失败前没有暴露真实英文查询供审计。')
  }
  if (!isArxivErrorResult({ content: [{ type: 'text', text: 'Error: invalid query' }], isError: false })) {
    throw new Error('没有识别上游文本错误。')
  }

  console.log(JSON.stringify({
    ok: true,
    localFallback: local,
    plannerQueries: planned,
    attemptedQueries: retried.attemptedQueries,
    finalQuery: retried.arguments.query,
    resultCount: arxivResultCount(retried.result),
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
