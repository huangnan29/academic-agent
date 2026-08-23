import type {
  ManuscriptSection,
  OutlineNode,
  SectionGenerateInput,
  SectionGenerationMode,
  SectionGenerationOptions,
  SectionGenerationPreview,
} from '../../shared/contracts'
import {
  buildSectionGenerationPlan,
  type SectionGenerationPlan,
} from '../services/pipeline'
import type { WorkspaceRepository } from '../services/storage/workspaceRepository'

export interface ProtectedOutlineNode {
  id: string
  title: string
  level: 1 | 2 | 3
  parentId?: string
}

export interface OutlineContext {
  node?: OutlineNode
  parent?: OutlineNode
  ancestors: OutlineNode[]
}

export interface SectionGenerationResolution {
  outlineContext: OutlineContext
  generationPlan: SectionGenerationPlan
  generationMode: SectionGenerationMode
}

/** 生成与预览共用的确定性章节上下文，不访问模型，也不写入工作区。 */
export function resolveSectionGeneration(
  state: ReturnType<WorkspaceRepository['snapshot']>,
  project: ReturnType<WorkspaceRepository['snapshot']>['projects'][number],
  section: ManuscriptSection,
  options?: SectionGenerationOptions,
): SectionGenerationResolution {
  const outlineContext = findOutlineContext(
    state.outlines[project.id] ?? [],
    section.outlineNodeId,
  )
  const outlineNode = outlineContext.node
  const architecture = state.outlineArchitectures?.[project.id]
  const generationPlan = buildSectionGenerationPlan({
    title: section.title,
    node: outlineNode ?? { title: section.title, level: section.level },
    parent: outlineContext.parent,
    ancestors: outlineContext.ancestors,
    children: outlineNode?.children,
    brief: project.brief,
    architecture,
    hasRealData: architecture?.dataAvailable,
  }, options)
  const generationMode: SectionGenerationMode = options?.mode
    ?? (section.content.trim() ? 'revise' : 'initial')
  return { outlineContext, generationPlan, generationMode }
}

export function collectProtectedOutlineNodes(
  state: ReturnType<WorkspaceRepository['snapshot']>,
  projectId: string,
): ProtectedOutlineNode[] {
  const outline = state.outlines[projectId] ?? []
  const identityById = new Map<string, ProtectedOutlineNode>()
  const visit = (nodes: OutlineNode[], parentId?: string) => {
    for (const node of nodes) {
      identityById.set(node.id, { id: node.id, title: node.title, level: node.level, parentId })
      visit(node.children, node.id)
    }
  }
  visit(outline)

  const versionSectionIds = new Set(
    state.sectionVersions.filter((version) => version.projectId === projectId).map((version) => version.sectionId),
  )
  const citationSectionIds = new Set(
    state.citations.filter((citation) => citation.projectId === projectId).map((citation) => citation.sectionId),
  )
  const protectedIds = new Set<string>()
  for (const section of state.sections.filter((item) => item.projectId === projectId)) {
    if (!section.content.trim()
      && section.status === 'pending'
      && !versionSectionIds.has(section.id)
      && !citationSectionIds.has(section.id)) continue
    protectedIds.add(section.outlineNodeId)
  }

  for (const id of [...protectedIds]) {
    let current = identityById.get(id)
    while (current?.parentId) {
      protectedIds.add(current.parentId)
      current = identityById.get(current.parentId)
    }
  }
  return [...protectedIds]
    .map((id) => identityById.get(id))
    .filter((node): node is ProtectedOutlineNode => Boolean(node))
}

export function formatOutlineRegenerationConstraints(nodes: ProtectedOutlineNode[]): string {
  return [
    '## 重新生成时必须保留的既有正文结构',
    '以下节点已经关联正文、历史版本或引用证据。重新规划时必须逐项保留其 id、标题、level 与 parentId；只能调整其他尚未写作的节点。不得移动、改名或删除这些节点。',
    JSON.stringify(nodes),
  ].join('\n')
}

export function assertProtectedOutlineNodesPreserved(
  outline: OutlineNode[],
  protectedNodes: ProtectedOutlineNode[],
): void {
  if (protectedNodes.length === 0) return
  const generated = new Map<string, ProtectedOutlineNode>()
  const visit = (nodes: OutlineNode[], parentId?: string) => {
    for (const node of nodes) {
      generated.set(node.id, { id: node.id, title: node.title, level: node.level, parentId })
      visit(node.children, node.id)
    }
  }
  visit(outline)

  const changed = protectedNodes.find((current) => {
    const next = generated.get(current.id)
    return !next
      || next.title.normalize('NFKC').trim() !== current.title.normalize('NFKC').trim()
      || next.level !== current.level
      || next.parentId !== current.parentId
  })
  if (changed) {
    throw new Error(`模型未能安全保留已有正文对应的章节“${changed.title}”，旧大纲已保持不变。请重试。`)
  }
}

export function filterOutlineCitations(
  nodes: OutlineNode[],
  allowed: Set<string>,
): { outline: OutlineNode[]; removedCitationCount: number } {
  let removedCitationCount = 0
  const visit = (node: OutlineNode): OutlineNode => {
    const citationIds = node.citationIds.filter((id) => {
      const keep = allowed.has(id)
      if (!keep) removedCitationCount += 1
      return keep
    })
    return { ...node, citationIds, children: node.children.map(visit) }
  }
  return { outline: nodes.map(visit), removedCitationCount }
}

export function findOutlineNode(nodes: OutlineNode[], nodeId: string): OutlineNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node
    const nested = findOutlineNode(node.children, nodeId)
    if (nested) return nested
  }
  return undefined
}

export function findOutlineContext(nodes: OutlineNode[], nodeId: string): OutlineContext {
  const visit = (items: OutlineNode[], ancestors: OutlineNode[]): OutlineContext | undefined => {
    for (const node of items) {
      if (node.id === nodeId) {
        return {
          node,
          parent: ancestors.at(-1),
          ancestors,
        }
      }
      const nested = visit(node.children, [...ancestors, node])
      if (nested) return nested
    }
    return undefined
  }
  return visit(nodes, []) ?? { ancestors: [] }
}

/** 预览对象只复制计划字段，避免把内部管线对象或可变数组暴露给调用方。 */
export function toSectionGenerationPreview(
  resolution: SectionGenerationResolution,
  section: ManuscriptSection,
  includedLiteratureCount: number,
  generatedSectionCount: number,
): SectionGenerationPreview {
  const { generationPlan, generationMode } = resolution
  return {
    profile: generationPlan.profile,
    profileLabel: generationPlan.profileLabel,
    profileSummary: generationPlan.profileSummary,
    mode: generationMode,
    strategyIds: [...generationPlan.strategyIds],
    defaultStrategyIds: [...generationPlan.defaultStrategyIds],
    availableContentForms: [...generationPlan.availableContentForms],
    selectedContentForms: [...generationPlan.selectedContentForms],
    unsupportedContentForms: [...generationPlan.unsupportedContentForms],
    dataBoundary: generationPlan.dataBoundary,
    currentWordCount: section.wordCount,
    includedLiteratureCount,
    generatedSectionCount,
  }
}

export function assertSupportedGenerationOptions(
  input: SectionGenerateInput,
  plan: SectionGenerationPlan,
): void {
  if (input.options?.contentForms?.length && plan.unsupportedContentForms.length > 0) {
    throw new Error(`当前章节不适合以下内容形态：${plan.unsupportedContentForms.join('、')}。`)
  }
  const strategies = new Set(input.options?.strategyIds ?? [])
  if (strategies.has('argument-deepening') && strategies.has('concise')) {
    throw new Error('“论证深化”和“精炼表达”不能同时作为本次生成主策略。')
  }
}
