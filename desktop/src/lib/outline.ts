// 大纲层级统计；从 App.tsx 抽出。
import type { OutlineNode } from '../../shared/contracts'

function normalizeOutlineLevel(node: OutlineNode, depth: number): 1 | 2 | 3 {
  const level = Number(node.level) || depth
  return Math.min(3, Math.max(1, level)) as 1 | 2 | 3
}

export function summarizeOutline(nodes: OutlineNode[]) {
  const summary = { 1: 0, 2: 0, 3: 0 }
  const visit = (items: OutlineNode[], depth: number) => {
    items.forEach((node) => {
      summary[normalizeOutlineLevel(node, depth)] += 1
      if (Array.isArray(node.children)) visit(node.children, depth + 1)
    })
  }
  visit(nodes, 1)
  return summary
}
