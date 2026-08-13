import type {
  LiteratureRecord,
  ManuscriptSection,
  OutlineNode,
  Project,
  VerificationStatus,
  WorkspaceState,
} from '../../../shared/contracts'

export interface ExportSection {
  id: string
  title: string
  level: 1 | 2 | 3
  content: string
}

export interface ExportReference {
  number: number
  record: LiteratureRecord
}

export interface ExportDocumentModel {
  project: Project
  sections: ExportSection[]
  references: ExportReference[]
  unresolvedMarkers: string[]
}

export function createExportDocumentModel(
  state: WorkspaceState,
  projectId: string,
): ExportDocumentModel {
  const project = state.projects.find((item) => item.id === projectId)
  if (!project) throw new Error('找不到要导出的论文项目。')

  const outline = state.outlines[projectId] ?? []
  const outlineOrder = flattenOutline(outline)
  const orderById = new Map(outlineOrder.map((node, index) => [node.id, index]))
  const latestSections = selectLatestSections(
    state.sections.filter((section) => section.projectId === projectId),
  ).sort((left, right) => {
    const leftOrder = orderById.get(left.outlineNodeId) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = orderById.get(right.outlineNodeId) ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return left.createdAt.localeCompare(right.createdAt)
  })

  const literatureById = new Map(
    state.literature
      .filter((item) => item.projectId === projectId && item.included)
      .map((item) => [item.id, item]),
  )
  const citationOrder: string[] = []
  const unresolvedMarkers = new Set<string>()
  const sectionContent = new Map<string, string>()

  for (const section of latestSections) {
    let content = section.content.trim()
    const evidence = state.citations.filter(
      (item) => item.projectId === projectId && item.sectionId === section.id,
    )

    for (const citation of evidence) {
      if (!citation.marker || !content.includes(citation.marker)) continue
      if (citation.literatureId && literatureById.has(citation.literatureId)) {
        const number = addCitation(citationOrder, citation.literatureId)
        content = content.split(citation.marker).join(`[${number}]`)
      } else {
        unresolvedMarkers.add(citation.marker)
      }
    }

    content = content.replace(
      /【文献[:：]\s*([^】]+)】|\[cite:\s*([^\]]+)\]|\[@([^\]]+)\]/gi,
      (marker, first: string | undefined, second: string | undefined, third: string | undefined) => {
        const id = (first ?? second ?? third ?? '').trim()
        if (!literatureById.has(id)) {
          unresolvedMarkers.add(marker)
          return marker
        }
        return `[${addCitation(citationOrder, id)}]`
      },
    )

    sectionContent.set(section.id, content)
  }

  const references = citationOrder
    .map((id, index) => {
      const record = literatureById.get(id)
      return record ? { number: index + 1, record } : undefined
    })
    .filter((item): item is ExportReference => Boolean(item))

  return {
    project,
    sections: latestSections.map((section) => ({
      id: section.id,
      title: section.title,
      level: section.level,
      content: sectionContent.get(section.id) ?? section.content.trim(),
    })),
    references,
    unresolvedMarkers: [...unresolvedMarkers],
  }
}

export function formatReference(reference: ExportReference): string {
  const record = reference.record
  const authors = record.authors.join(', ') || '作者未知'
  const year = record.year ?? '年份未知'
  const venue = record.venue ? `. ${record.venue}` : ''
  const doi = record.doi ? `. https://doi.org/${normalizeDoi(record.doi)}` : ''
  return `[${reference.number}] ${authors}. ${record.title}[文献]. ${year}${venue}${doi}. ${verificationLabel(record.verificationStatus)}`
}

export function verificationLabel(status: VerificationStatus): string {
  const labels: Record<VerificationStatus, string> = {
    'verified-metadata': '元数据已核验',
    'abstract-only': '仅摘要可用',
    unverified: '未核验',
    unavailable: '来源不可用',
    demo: '演示数据',
  }
  return `（${labels[status]}）`
}

function flattenOutline(nodes: OutlineNode[]): OutlineNode[] {
  const result: OutlineNode[] = []
  const visit = (node: OutlineNode) => {
    result.push(node)
    node.children.forEach(visit)
  }
  nodes.forEach(visit)
  return result
}

function selectLatestSections(sections: ManuscriptSection[]): ManuscriptSection[] {
  const latest = new Map<string, ManuscriptSection>()
  for (const section of sections) {
    const key = section.outlineNodeId || section.id
    const current = latest.get(key)
    if (
      !current ||
      section.version > current.version ||
      (section.version === current.version && section.updatedAt > current.updatedAt)
    ) {
      latest.set(key, section)
    }
  }
  return [...latest.values()]
}

function addCitation(order: string[], literatureId: string): number {
  let index = order.indexOf(literatureId)
  if (index < 0) {
    order.push(literatureId)
    index = order.length - 1
  }
  return index + 1
}

function normalizeDoi(doi: string): string {
  return doi.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
}
