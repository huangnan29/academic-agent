import { randomUUID } from 'node:crypto'
import type { AgentRun, OutlineNode, SystemPermissionKind } from '../../../shared/contracts'

export function createRun(
  projectId: string,
  kind: AgentRun['kind'],
  label: string,
  detail: string,
): AgentRun {
  const timestamp = new Date().toISOString()
  return {
    id: randomUUID(),
    projectId,
    kind,
    status: 'running',
    steps: [{ id: randomUUID(), label, detail, status: 'running', startedAt: timestamp }],
    origin: 'live',
    verificationStatus: 'unverified',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function assertId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) {
    throw new Error(`${label}标识无效。`)
  }
}

export function isSystemPermissionKind(value: unknown): value is SystemPermissionKind {
  return (
    value === 'accessibility' ||
    value === 'full-disk-access' ||
    value === 'screen-recording' ||
    value === 'microphone'
  )
}

export function safeResearchFolderName(title: string): string {
  const normalized = title
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 72)
  return normalized || '未命名研究'
}

export function stringValue(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && Boolean(value.trim()))?.trim()
}

export function assertOutlineBounds(outline: OutlineNode[]): void {
  let count = 0
  const visit = (nodes: OutlineNode[], depth: number) => {
    // 三级叶节点的空 children 会以 depth=4 进入；只有实际存在第四级节点才应拒绝。
    if (nodes.length > 0 && depth > 3) throw new Error('提纲最多支持三级层级。')
    for (const node of nodes) {
      count += 1
      if (count > 160) throw new Error('提纲节点数量超过安全上限。')
      visit(node.children, depth + 1)
    }
  }
  visit(outline, 1)
}

export function sanitizeOutlineNode(
  node: OutlineNode,
  allowedCitationIds: Set<string>,
): OutlineNode {
  return {
    ...node,
    citationIds: node.citationIds.filter((id) => allowedCitationIds.has(id)),
    children: node.children.map((child) => sanitizeOutlineNode(child, allowedCitationIds)),
  }
}
