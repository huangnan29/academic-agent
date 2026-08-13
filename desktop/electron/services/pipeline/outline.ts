import { randomUUID } from 'node:crypto'
import type { OutlineNode } from '../../../shared/contracts'

const MAX_OUTLINE_SOURCE_CHARS = 2_000_000
const MAX_OUTLINE_NODES = 160
const MAX_ROOT_NODES = 40
const MAX_CHILD_NODES = 60

export function parseOutline(raw: string, targetWords = 8_000): OutlineNode[] {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error('模型未返回提纲内容。')
  if (trimmed.length > MAX_OUTLINE_SOURCE_CHARS) throw new Error('模型返回的提纲内容过长。')

  const json = extractJson(trimmed)
  if (json) {
    try {
      const parsed = JSON.parse(json) as unknown
      const candidates = selectOutlineArray(parsed)
      if (candidates.length > 0) {
        const roots = candidates.slice(0, MAX_ROOT_NODES)
        const fallbackWords = Math.max(200, Math.round(targetWords / roots.length))
        const budget = { count: 0 }
        return ensureUniqueIds(
          roots.map((item) => normalizeNode(item, 1, fallbackWords, budget)),
        )
      }
    } catch {
      // JSON 不完整时继续尝试解析 Markdown 标题。
    }
  }

  const markdownOutline = parseMarkdownOutline(trimmed, targetWords)
  if (markdownOutline.length > 0) return markdownOutline
  throw new Error('无法解析模型返回的提纲，请重新生成。')
}

function selectOutlineArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (!isRecord(value)) return []
  for (const key of ['outline', 'sections', 'data', 'items']) {
    if (Array.isArray(value[key])) return value[key] as unknown[]
  }
  if (typeof value.title === 'string') return [value]
  return []
}

function normalizeNode(
  value: unknown,
  suggestedLevel: number,
  fallbackWords: number,
  budget: { count: number },
): OutlineNode {
  if (!isRecord(value)) throw new Error('提纲节点格式无效。')
  budget.count += 1
  if (budget.count > MAX_OUTLINE_NODES) throw new Error('提纲节点数量超过安全上限。')

  const title = firstString(value.title, value.name, value.heading)?.trim().slice(0, 500)
  if (!title) throw new Error('提纲节点缺少标题。')

  const level = clampLevel(suggestedLevel)
  const rawChildren = Array.isArray(value.children)
    ? value.children
    : Array.isArray(value.sections)
      ? value.sections
      : []
  const childValues = suggestedLevel >= 3 ? [] : rawChildren.slice(0, MAX_CHILD_NODES)
  const targetWords = Math.min(100_000, Math.max(
    100,
    Math.round(asNumber(value.targetWords) ?? asNumber(value.wordCount) ?? fallbackWords),
  ))
  const citationSource = Array.isArray(value.citationIds)
    ? value.citationIds
    : Array.isArray(value.citations)
      ? value.citations
      : []
  const citationIds = [
    ...new Set(
      citationSource
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 100),
    ),
  ]
  const childFallback = Math.max(100, Math.round(targetWords / Math.max(1, childValues.length)))

  return {
    id: firstString(value.id)?.trim().slice(0, 200) || randomUUID(),
    title,
    level,
    objective:
      firstString(value.objective, value.goal, value.description)?.trim().slice(0, 3_000) ||
      `围绕“${title}”完成清晰、可核验的论证。`,
    targetWords,
    citationIds,
    children: childValues.map((child) =>
      normalizeNode(child, Math.min(3, level + 1), childFallback, budget),
    ),
  }
}

function parseMarkdownOutline(raw: string, targetWords: number): OutlineNode[] {
  const headingLines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => {
      const markdown = /^(#{1,3})\s+(.+)$/.exec(line)
      if (markdown) return { level: markdown[1].length, title: cleanHeading(markdown[2]) }
      const numbered = /^(\d+(?:\.\d+){0,2})[.、]?\s+(.+)$/.exec(line)
      if (numbered) {
        return { level: Math.min(3, numbered[1].split('.').length), title: cleanHeading(numbered[2]) }
      }
      return undefined
    })
    .filter((item): item is { level: number; title: string } => Boolean(item?.title))
    .slice(0, MAX_OUTLINE_NODES)

  if (headingLines.length === 0) return []
  const topCount = Math.max(1, headingLines.filter((item) => item.level === 1).length)
  const fallbackWords = Math.max(200, Math.round(targetWords / topCount))
  const roots: OutlineNode[] = []
  const stack: OutlineNode[] = []

  for (const heading of headingLines) {
    const node: OutlineNode = {
      id: randomUUID(),
      title: heading.title,
      level: clampLevel(heading.level),
      objective: `围绕“${heading.title}”完成清晰、可核验的论证。`,
      targetWords: heading.level === 1 ? fallbackWords : Math.max(200, Math.round(fallbackWords / 2)),
      citationIds: [],
      children: [],
    }

    while (stack.length && stack.at(-1)!.level >= node.level) stack.pop()
    const parent = stack.at(-1)
    if (parent) {
      node.level = clampLevel(Math.min(parent.level + 1, node.level))
      parent.children.push(node)
    } else {
      node.level = 1
      roots.push(node)
    }
    stack.push(node)
  }

  return roots.slice(0, MAX_ROOT_NODES)
}

function extractJson(raw: string): string | undefined {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const source = fenced?.[1]?.trim() || raw
  const start = source.search(/[\[{]/)
  if (start < 0) return undefined

  const opening = source[start]
  const closing = opening === '[' ? ']' : '}'
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === opening) depth += 1
    else if (char === closing) {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }

  return fenced?.[1]?.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string')
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function clampLevel(level: number): 1 | 2 | 3 {
  return Math.max(1, Math.min(3, Math.round(level))) as 1 | 2 | 3
}

function cleanHeading(title: string): string {
  return title.replace(/\*\*/g, '').replace(/\s*[-—:：]\s*$/, '').trim().slice(0, 500)
}

function ensureUniqueIds(nodes: OutlineNode[]): OutlineNode[] {
  const seen = new Set<string>()
  const visit = (node: OutlineNode) => {
    if (seen.has(node.id)) node.id = randomUUID()
    seen.add(node.id)
    node.children.forEach(visit)
  }
  nodes.forEach(visit)
  return nodes
}
