import type { ManuscriptSection, OutlineNode, WorkspaceState } from './contracts'

interface HeadingMatch {
  childId: string
  start: number
  headingEnd: number
  markdownLevel?: number
}

interface SectionRange {
  start: number
  end: number
  headingEnd: number
}

/**
 * 把标题统一为只包含正文语义的键。标题编号和 Markdown 装饰不会参与匹配，
 * 但最终仍要求完整语义键精确相等，避免把相似标题错误合并。
 */
function normalizeHeadingTitle(title: string): string {
  return title
    .normalize('NFKC')
    .trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^(?:\*\*|__)(.*)(?:\*\*|__)$/, '$1')
    .replace(/^第[0-9一二三四五六七八九十百千万]+(?:章|节|篇|部分)\s*/, '')
    .replace(/^[（(][0-9一二三四五六七八九十百千万]+[）)](?:[、.．:：])?\s*/, '')
    .replace(/^\d+(?:[.．]\d+)+(?:[、.．:：])?\s*/, '')
    .replace(/^\d+[、.．:：]\s*/, '')
    .replace(/^[一二三四五六七八九十百千万]+[、.．:：]\s*/, '')
    .replace(/[\p{P}\p{S}\s]/gu, '')
    .toLocaleLowerCase('zh-CN')
}

interface ParsedHeading {
  title: string
  markdownLevel?: number
}

function parseHeadingLine(line: string): ParsedHeading | undefined {
  const withoutNewline = line.replace(/[\r\n]+$/, '')
  const markdown = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(withoutNewline)
  if (markdown?.[2]) return { title: markdown[2], markdownLevel: markdown[1].length }

  const bold = /^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*$/.exec(withoutNewline)
  if (bold?.[1]) return { title: bold[1] }

  const numbered = /^\s*(?:第[0-9一二三四五六七八九十百千万]+(?:章|节|篇|部分)|\d+(?:[.．]\d+)+(?:[、.．:：])?|[（(][0-9一二三四五六七八九十百千万]+[）)](?:[、.．:：])?|[一二三四五六七八九十百千万]+[、.．:：])\s*(.+?)\s*$/.exec(
    withoutNewline,
  )
  return numbered?.[0] ? { title: numbered[0].trim() } : undefined
}

function collectHeadingMatches(content: string, children: OutlineNode[]): HeadingMatch[] {
  const childrenByKey = new Map<string, OutlineNode[]>()
  for (const child of children) {
    const key = normalizeHeadingTitle(child.title)
    if (!key) continue
    const group = childrenByKey.get(key) ?? []
    group.push(child)
    childrenByKey.set(key, group)
  }

  const matches: HeadingMatch[] = []
  const linePattern = /[^\r\n]*(?:\r\n|\r|\n|$)/g
  for (const match of content.matchAll(linePattern)) {
    const line = match[0]
    if (!line) continue
    const heading = parseHeadingLine(line)
    if (!heading) continue
    const candidates = childrenByKey.get(normalizeHeadingTitle(heading.title))
    // 同级大纲标题本身重复时无法可靠判断归属，因此不做猜测。
    if (candidates?.length !== 1) continue
    const start = match.index ?? 0
    matches.push({
      childId: candidates[0].id,
      start,
      headingEnd: start + line.length,
      markdownLevel: heading.markdownLevel,
    })
  }
  return matches.sort((left, right) => left.start - right.start)
}

function findDirectChildRanges(content: string, children: OutlineNode[]): Map<string, SectionRange> {
  const matches = collectHeadingMatches(content, children)
  const markdownBoundaries: Array<{ start: number; level: number }> = []
  const linePattern = /[^\r\n]*(?:\r\n|\r|\n|$)/g
  for (const match of content.matchAll(linePattern)) {
    if (!match[0]) continue
    const heading = parseHeadingLine(match[0])
    if (heading?.markdownLevel) {
      markdownBoundaries.push({ start: match.index ?? 0, level: heading.markdownLevel })
    }
  }
  const occurrences = new Map<string, HeadingMatch[]>()
  for (const match of matches) {
    const group = occurrences.get(match.childId) ?? []
    group.push(match)
    occurrences.set(match.childId, group)
  }

  const ranges = new Map<string, SectionRange>()
  for (const [childId, group] of occurrences) {
    // 正文中同一个小节标题出现多次也属于歧义，保守地不拆分。
    if (group.length !== 1) continue
    const current = group[0]
    const nextKnownSibling = matches.find((item) => item.start > current.start)?.start
    const nextMarkdownBoundary = current.markdownLevel
      ? markdownBoundaries.find(
          (item) => item.start > current.start && item.level <= current.markdownLevel!,
        )?.start
      : undefined
    const end = Math.min(
      nextKnownSibling ?? content.length,
      nextMarkdownBoundary ?? content.length,
    )
    ranges.set(childId, {
      start: current.start,
      end,
      headingEnd: current.headingEnd,
    })
  }
  return ranges
}

export function extractDirectChildContents(
  content: string,
  children: OutlineNode[],
): Map<string, string> {
  const result = new Map<string, string>()
  for (const [childId, range] of findDirectChildRanges(content, children)) {
    const chunk = content.slice(range.start, range.end).trim()
    if (chunk) result.set(childId, chunk)
  }
  return result
}

export function replaceDirectChildContent(
  parentContent: string,
  child: OutlineNode,
  siblings: OutlineNode[],
  replacement: string,
): string | undefined {
  const range = findDirectChildRanges(parentContent, siblings).get(child.id)
  if (!range) return undefined

  const replacementContainsHeading = findDirectChildRanges(replacement, [child]).has(child.id)
  const originalHeading = parentContent.slice(range.start, range.headingEnd).trim()
  const nextContent = replacementContainsHeading
    ? replacement.trim()
    : `${originalHeading}\n\n${replacement.trim()}`.trim()
  const before = parentContent.slice(0, range.start)
  const after = parentContent.slice(range.end).replace(/^(?:\r\n|\r|\n)+/, '')
  return `${before}${nextContent}${after ? `\n\n${after}` : '\n'}`
}

function countSectionCharacters(content: string): number {
  return content.replace(/\s/g, '').length
}

function sectionIsNewer(left: ManuscriptSection, right: ManuscriptSection): boolean {
  return (
    left.version > right.version ||
    (left.version === right.version && left.updatedAt > right.updatedAt)
  )
}

function indexLatestSections(state: WorkspaceState, projectId: string): Map<string, ManuscriptSection> {
  const sections = new Map<string, ManuscriptSection>()
  for (const section of state.sections) {
    if (section.projectId !== projectId || !section.outlineNodeId) continue
    const current = sections.get(section.outlineNodeId)
    if (!current || sectionIsNewer(section, current)) sections.set(section.outlineNodeId, section)
  }
  return sections
}

function findOutlineNode(nodes: OutlineNode[], id: string): OutlineNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    const child = findOutlineNode(node.children, id)
    if (child) return child
  }
  return undefined
}

function findOutlineParent(nodes: OutlineNode[], id: string): OutlineNode | undefined {
  for (const node of nodes) {
    if (node.children.some((child) => child.id === id)) return node
    const parent = findOutlineParent(node.children, id)
    if (parent) return parent
  }
  return undefined
}

function updateSectionContent(
  section: ManuscriptSection,
  content: string,
  updatedAt: string,
): void {
  section.content = content
  section.wordCount = countSectionCharacters(content)
  section.status = 'draft'
  section.version += 1
  section.updatedAt = updatedAt
}

function writeDerivedContentToAncestors(
  state: WorkspaceState,
  section: ManuscriptSection,
  content: string,
  updatedAt: string,
): boolean {
  if (!section.derivedFromSectionId) return false
  const source = state.sections.find(
    (item) => item.id === section.derivedFromSectionId && item.projectId === section.projectId,
  )
  const outline = state.outlines[section.projectId] ?? []
  const sourceNode = source ? findOutlineNode(outline, source.outlineNodeId) : undefined
  const childNode = findOutlineNode(outline, section.outlineNodeId)
  if (!source || !sourceNode || !childNode) return false
  const replaced = replaceDirectChildContent(
    source.content,
    childNode,
    sourceNode.children,
    content,
  )
  if (replaced === undefined) return false

  if (!writeDerivedContentToAncestors(state, source, replaced, updatedAt)) {
    updateSectionContent(source, replaced, updatedAt)
  } else {
    updateSectionContent(source, replaced, updatedAt)
    const parent = state.sections.find((item) => item.id === source.derivedFromSectionId)
    if (parent) source.derivedFromVersion = parent.version
  }
  return true
}

/**
 * 将父章节主稿中的二、三级标题拆成同步视图。只回填空白、相同内容
 * 或已经建立同步关系的小节，绝不猜测和覆盖独立保存的用户正文。
 */
export function synchronizeDerivedSections(
  state: WorkspaceState,
  projectId?: string,
  updatedAt = new Date().toISOString(),
): boolean {
  let changed = false
  const projectIds = projectId
    ? [projectId]
    : state.projects.map((project) => project.id)

  for (const currentProjectId of projectIds) {
    const outline = state.outlines[currentProjectId] ?? []
    const sectionByNodeId = indexLatestSections(state, currentProjectId)

    // 大纲可能被重新排序、升降级或移动节点。旧同步关系若不再对应当前直接父子，
    // 必须先解除，否则独立章节会被全文上下文和导出错误排除。
    for (const section of sectionByNodeId.values()) {
      if (!section.derivedFromSectionId) continue
      const source = state.sections.find(
        (item) => item.id === section.derivedFromSectionId && item.projectId === currentProjectId,
      )
      const currentParent = findOutlineParent(outline, section.outlineNodeId)
      if (!source || currentParent?.id !== source.outlineNodeId) {
        delete section.derivedFromSectionId
        delete section.derivedFromVersion
        section.updatedAt = updatedAt
        changed = true
      }
    }

    const visit = (node: OutlineNode): void => {
      const source = sectionByNodeId.get(node.id)
      if (!source?.content.trim() || node.children.length === 0) {
        node.children.forEach(visit)
        return
      }

      const extracted = extractDirectChildContents(source.content, node.children)

      for (const child of node.children) {
        const target = sectionByNodeId.get(child.id)
        if (!target) continue
        const chunk = extracted.get(child.id)

        if (!chunk) {
          if (target.derivedFromSectionId === source.id) {
            delete target.derivedFromSectionId
            delete target.derivedFromVersion
            target.updatedAt = updatedAt
            changed = true
          }
          continue
        }

        const canSynchronize =
          !target.content.trim() ||
          target.derivedFromSectionId === source.id ||
          target.content.trim() === chunk
        if (!canSynchronize) continue

        if (target.content !== chunk) {
          updateSectionContent(target, chunk, updatedAt)
          changed = true
        }
        const expectedStatus = source.status === 'verified' ? 'verified' : 'draft'
        if (
          target.derivedFromSectionId !== source.id ||
          target.derivedFromVersion !== source.version ||
          target.status !== expectedStatus
        ) {
          target.derivedFromSectionId = source.id
          target.derivedFromVersion = source.version
          target.status = expectedStatus
          target.updatedAt = updatedAt
          changed = true
        }
      }

      node.children.forEach(visit)
    }

    outline.forEach(visit)
  }

  return changed
}

/**
 * 保存同步小节时，先把修改回写到最近父稿；若父稿本身也是同步视图，
 * 则继续向上回写到完整主稿，最后重新生成所有下级视图。
 */
export function saveSectionContentInState(
  state: WorkspaceState,
  sectionId: string,
  content: string,
  updatedAt = new Date().toISOString(),
): ManuscriptSection {
  const selected = state.sections.find((section) => section.id === sectionId)
  if (!selected) throw new Error('论文章节不存在。')

  const writeToSource = (section: ManuscriptSection, nextContent: string): void => {
    if (writeDerivedContentToAncestors(state, section, nextContent, updatedAt)) return
    if (section.derivedFromSectionId) {
      // 父稿已不再包含对应标题时保留用户修改，并解除旧同步关系。
      delete section.derivedFromSectionId
      delete section.derivedFromVersion
    }

    // 旧版本可能存在尚未建立关系、但父稿确实包含同名标题的独立小节。
    // 只有用户明确保存这个小节时才将它并回父稿，不扫描或改写其他冲突章节。
    const outline = state.outlines[section.projectId] ?? []
    const node = findOutlineNode(outline, section.outlineNodeId)
    const parentNode = findOutlineParent(outline, section.outlineNodeId)
    const sectionByNodeId = indexLatestSections(state, section.projectId)
    const parentSection = parentNode ? sectionByNodeId.get(parentNode.id) : undefined
    if (node && parentNode && parentSection?.content.trim()) {
      const replaced = replaceDirectChildContent(
        parentSection.content,
        node,
        parentNode.children,
        nextContent,
      )
      if (replaced !== undefined) {
        if (!writeDerivedContentToAncestors(state, parentSection, replaced, updatedAt)) {
          updateSectionContent(parentSection, replaced, updatedAt)
        }
        section.derivedFromSectionId = parentSection.id
        section.derivedFromVersion = parentSection.version
        return
      }
    }
    updateSectionContent(section, nextContent, updatedAt)
  }

  writeToSource(selected, content)
  synchronizeDerivedSections(state, selected.projectId, updatedAt)
  return state.sections.find((section) => section.id === sectionId) ?? selected
}
