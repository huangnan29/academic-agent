#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import * as z from 'zod/v4'

const CATALOG_URI = 'paper://catalog'

// 这些记录仅用于本机验收，不代表真实发表文献，也不提供虚构 DOI。
const catalog = [
  {
    title: '用于测试的检索增强生成研究综述',
    authors: ['AIWritePaper QA'],
    year: 2024,
    venue: 'AIWritePaper QA Fixture Collection',
    abstract: '用于验证 RAG、公开文献检索和结构化结果归一化的固定测试记录。',
    url: 'https://example.org/aiwritepaper/qa/rag-review',
    keywords: ['RAG', 'retrieval', '检索增强生成'],
    source: 'mcp',
    origin: 'demo',
    verificationStatus: 'demo',
  },
  {
    title: '用于测试的大语言模型引用可追溯性研究',
    authors: ['AIWritePaper QA', 'Fixture Author'],
    year: 2025,
    venue: 'AIWritePaper QA Fixture Collection',
    abstract: '用于验证作者数组、年份、来源、摘要和引用状态字段的固定测试记录。',
    url: 'https://example.org/aiwritepaper/qa/citation-traceability',
    keywords: ['citation', 'traceability', '引用追溯'],
    source: 'mcp',
    origin: 'demo',
    verificationStatus: 'demo',
  },
  {
    title: '用于测试的本地优先学术写作 Agent 设计',
    authors: ['AIWritePaper QA'],
    year: 2026,
    venue: 'AIWritePaper QA Fixture Collection',
    abstract: '用于验证桌面 Agent、MCP 工具调用和 paper 资源读取的固定测试记录。',
    url: 'https://example.org/aiwritepaper/qa/local-agent',
    keywords: ['agent', 'MCP', 'local-first', '本地优先'],
    source: 'mcp',
    origin: 'demo',
    verificationStatus: 'demo',
  },
]

const literatureRecordSchema = z.object({
  title: z.string(),
  authors: z.array(z.string()),
  year: z.number().int(),
  venue: z.string(),
  abstract: z.string(),
  url: z.string().url(),
  keywords: z.array(z.string()),
  source: z.literal('mcp'),
  origin: z.literal('demo'),
  verificationStatus: z.literal('demo'),
})

const server = new McpServer({
  name: 'aiwritepaper-qa-mock',
  version: '1.0.0',
})

server.registerTool(
  'search_literature',
  {
    title: '检索 QA 文献样本',
    description: '按关键词返回结构化的本机 QA 文献样本，不发起网络请求。',
    inputSchema: {
      query: z.string().trim().min(1).max(500).describe('检索关键词'),
      limit: z.number().int().min(1).max(20).default(10).describe('最大返回数量'),
    },
    outputSchema: {
      query: z.string(),
      results: z.array(literatureRecordSchema),
      total: z.number().int().nonnegative(),
      returned: z.number().int().nonnegative(),
      source: z.literal('qa-mock'),
      fixture: z.literal(true),
    },
  },
  async ({ query, limit }) => {
    const normalizedQuery = query.normalize('NFKC').toLocaleLowerCase()
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
    const matches = catalog.filter((record) => {
      const searchableText = [
        record.title,
        record.abstract,
        record.venue,
        ...record.authors,
        ...record.keywords,
      ]
        .join(' ')
        .normalize('NFKC')
        .toLocaleLowerCase()
      return tokens.some((token) => searchableText.includes(token))
    })

    // 任意关键词均返回确定性样本，方便集中验收调用链和归一化逻辑。
    const candidates = matches.length > 0 ? matches : catalog
    const results = candidates.slice(0, limit)
    const structuredContent = {
      query,
      results,
      total: candidates.length,
      returned: results.length,
      source: 'qa-mock',
      fixture: true,
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(structuredContent),
        },
      ],
      structuredContent,
    }
  },
)

server.registerResource(
  'paper-catalog',
  CATALOG_URI,
  {
    title: 'QA 文献目录',
    description: '包含 search_literature 使用的固定 QA 文献样本。',
    mimeType: 'application/json',
  },
  async () => ({
    contents: [
      {
        uri: CATALOG_URI,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            source: 'qa-mock',
            fixture: true,
            records: catalog,
          },
          null,
          2,
        ),
      },
    ],
  }),
)

const transport = new StdioServerTransport()

async function shutdown() {
  await server.close()
}

process.once('SIGINT', () => {
  void shutdown()
})
process.once('SIGTERM', () => {
  void shutdown()
})

try {
  await server.connect(transport)
  // stdout 专供 MCP 协议使用，启动信息只能写入 stderr。
  console.error('AIWritePaper QA MCP mock 已通过 stdio 启动')
} catch (error) {
  const message = error instanceof Error ? error.message : '未知错误'
  console.error(`AIWritePaper QA MCP mock 启动失败：${message}`)
  process.exitCode = 1
}
