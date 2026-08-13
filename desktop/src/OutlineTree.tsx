import {
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
} from 'lucide-react'
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import type { ManuscriptSection, OutlineNode } from '../shared/contracts'
import './outline-tree.css'

export interface OutlineTreeProps {
  nodes: OutlineNode[]
  sections: ManuscriptSection[]
  selectedSectionId?: string
  onSelectSection: (section: ManuscriptSection) => void
}

const statusLabels: Record<ManuscriptSection['status'], string> = {
  pending: '待生成',
  generating: '生成中',
  draft: '草稿',
  verified: '已核验',
  error: '生成失败',
}

interface DisplayHeading {
  number: string
  title: string
}

function parseChineseNumber(value: string): number | undefined {
  const digits: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  }

  if (!value) return undefined
  if (!/[十百]/.test(value)) {
    const parsed = [...value].reduce((result, character) => {
      const digit = digits[character]
      return digit === undefined ? Number.NaN : result * 10 + digit
    }, 0)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  let total = 0
  let current = 0
  for (const character of value) {
    if (character === '十' || character === '百') {
      const unit = character === '十' ? 10 : 100
      total += (current || 1) * unit
      current = 0
      continue
    }
    const digit = digits[character]
    if (digit === undefined) return undefined
    current = digit
  }
  return total + current
}

function qualifyLocalNumber(number: string, fallbackNumber: string): string {
  const fallbackParts = fallbackNumber.split('.')
  if (!number.includes('.') && fallbackParts.length > 1) {
    return [...fallbackParts.slice(0, -1), number].join('.')
  }
  return number
}

/** 将标题内已有的序号与正文分离；没有序号时使用树路径生成。 */
function getDisplayHeading(title: string, fallbackNumber: string): DisplayHeading {
  const source = title.trim() || '未命名大纲节点'
  const arabicMatch = source.match(/^\s*(\d+(?:\.\d+){0,2})(?=\s|[、．.。)）\]：:\-]|$)/)
    ?? source.match(/^\s*(\d+(?:\.\d+){1,2})(?=\p{Script=Han})/u)

  if (arabicMatch) {
    const remainingTitle = source
      .slice(arabicMatch[0].length)
      .replace(/^[\s、．.。)）\]：:\-]+/, '')
      .trim()
    return {
      number: qualifyLocalNumber(arabicMatch[1], fallbackNumber),
      title: remainingTitle || source,
    }
  }

  const chapterMatch = source.match(/^\s*第([零〇一二三四五六七八九十百两]+)[章节篇部]\s*/)
  if (chapterMatch) {
    const parsedNumber = parseChineseNumber(chapterMatch[1])
    if (parsedNumber !== undefined) {
      const remainingTitle = source.slice(chapterMatch[0].length).trim()
      return {
        number: qualifyLocalNumber(String(parsedNumber), fallbackNumber),
        title: remainingTitle || source,
      }
    }
  }

  const chineseMatch = source.match(/^\s*[（(]?([零〇一二三四五六七八九十百两]+)[）)]?[、．.。：:\-]\s*/)
  if (chineseMatch) {
    const parsedNumber = parseChineseNumber(chineseMatch[1])
    if (parsedNumber !== undefined) {
      const remainingTitle = source.slice(chineseMatch[0].length).trim()
      return {
        number: qualifyLocalNumber(String(parsedNumber), fallbackNumber),
        title: remainingTitle || source,
      }
    }
  }

  return { number: fallbackNumber, title: source }
}

function indexSections(sections: ManuscriptSection[], selectedSectionId?: string) {
  const result = new Map<string, ManuscriptSection>()
  sections.forEach((section) => {
    if (!section.outlineNodeId) return
    const current = result.get(section.outlineNodeId)
    if (!current || section.id === selectedSectionId) {
      result.set(section.outlineNodeId, section)
      return
    }
    if (current.id === selectedSectionId) return
    if (
      section.version > current.version
      || (section.version === current.version && section.updatedAt > current.updatedAt)
    ) {
      result.set(section.outlineNodeId, section)
    }
  })
  return result
}

function collectExpandableIds(nodes: OutlineNode[], result: string[] = []): string[] {
  nodes.forEach((node) => {
    if (node.children?.length) {
      result.push(node.id)
      collectExpandableIds(node.children, result)
    }
  })
  return result
}

function findAncestorIds(
  nodes: OutlineNode[],
  targetNodeId: string | undefined,
  ancestors: string[] = [],
): string[] {
  if (!targetNodeId) return []
  for (const node of nodes) {
    if (node.id === targetNodeId) return ancestors
    const result = findAncestorIds(node.children ?? [], targetNodeId, [...ancestors, node.id])
    if (result.length || node.children?.some((child) => child.id === targetNodeId)) return result
  }
  return []
}

function formatNumber(value: number): string {
  return Math.max(0, value).toLocaleString('zh-CN')
}

function getSectionMeta(section: ManuscriptSection | undefined, node: OutlineNode): string {
  if (!section) return '尚未创建文稿'
  const status = section.derivedFromSectionId && ['draft', 'verified'].includes(section.status)
    ? section.status === 'verified' ? '随父章同步 · 已核验' : '随父章同步'
    : statusLabels[section.status]
  const count = section.wordCount > 0
    ? `${formatNumber(section.wordCount)} 字`
    : node.targetWords > 0 ? `${formatNumber(node.targetWords)} 字目标` : ''
  const version = section.wordCount > 0 && section.version > 1 ? `第 ${section.version} 版` : ''
  return [status, count, version].filter(Boolean).join(' · ')
}

function safeDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-')
}

interface OutlineBranchProps extends OutlineTreeProps {
  depth: number
  numberPrefix: number[]
  sectionByNodeId: Map<string, ManuscriptSection>
  expandedIds: Set<string>
  onToggle: (nodeId: string) => void
}

function OutlineBranch({
  nodes,
  sections,
  selectedSectionId,
  onSelectSection,
  depth,
  numberPrefix,
  sectionByNodeId,
  expandedIds,
  onToggle,
}: OutlineBranchProps) {
  return (
    <>
      {nodes.map((node, index) => {
        const numberPath = [...numberPrefix, index + 1]
        const heading = getDisplayHeading(node.title, numberPath.join('.'))
        const section = sectionByNodeId.get(node.id)
        const children = node.children ?? []
        const hasChildren = children.length > 0
        const expanded = hasChildren && expandedIds.has(node.id)
        const selected = section?.id === selectedSectionId
        const generated = Boolean(
          section && ['draft', 'verified'].includes(section.status) && section.wordCount > 0,
        )
        const childrenId = `academic-outline-children-${numberPath.join('-')}-${safeDomId(node.id)}`
        const meta = getSectionMeta(section, node)

        const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
          if (!hasChildren) return
          if (event.key === 'ArrowRight' && !expanded) {
            event.preventDefault()
            onToggle(node.id)
          }
          if (event.key === 'ArrowLeft' && expanded) {
            event.preventDefault()
            onToggle(node.id)
          }
        }

        return (
          <li
            className="academic-outline__node"
            key={node.id}
            role="treeitem"
            aria-level={depth}
            aria-selected={selected}
            aria-expanded={hasChildren ? expanded : undefined}
          >
            <div className={`academic-outline__row${selected ? ' is-selected' : ''}`}>
              {hasChildren ? (
                <button
                  type="button"
                  className="academic-outline__toggle"
                  aria-label={`${expanded ? '收起' : '展开'} ${heading.number} ${heading.title}`}
                  aria-expanded={expanded}
                  aria-controls={childrenId}
                  onClick={() => onToggle(node.id)}
                >
                  {expanded
                    ? <ChevronDown size={14} aria-hidden="true" />
                    : <ChevronRight size={14} aria-hidden="true" />}
                </button>
              ) : (
                <span className="academic-outline__toggle-spacer" aria-hidden="true" />
              )}
              <button
                type="button"
                className="academic-outline__select"
                disabled={!section}
                aria-label={`${heading.number} ${heading.title}，${meta}`}
                title={section ? heading.title : `${heading.title}（尚未创建对应文稿）`}
                onClick={() => section && onSelectSection(section)}
                onKeyDown={handleKeyDown}
              >
                <span className={`academic-outline__number${generated ? ' is-generated' : ''}`} aria-hidden="true">{heading.number}</span>
                <span className="academic-outline__copy">
                  <strong>{heading.title}</strong>
                  <small>{meta}</small>
                </span>
              </button>
            </div>
            {expanded && (
              <ol className="academic-outline__group" id={childrenId} role="group">
                <OutlineBranch
                  nodes={children}
                  sections={sections}
                  selectedSectionId={selectedSectionId}
                  onSelectSection={onSelectSection}
                  depth={depth + 1}
                  numberPrefix={numberPath}
                  sectionByNodeId={sectionByNodeId}
                  expandedIds={expandedIds}
                  onToggle={onToggle}
                />
              </ol>
            )}
          </li>
        )
      })}
    </>
  )
}

export function OutlineTree({
  nodes,
  sections,
  selectedSectionId,
  onSelectSection,
}: OutlineTreeProps) {
  const sectionByNodeId = useMemo(
    () => indexSections(sections, selectedSectionId),
    [sections, selectedSectionId],
  )
  const selectedOutlineNodeId = sections.find((section) => section.id === selectedSectionId)?.outlineNodeId
  const selectedAncestorIds = useMemo(
    () => findAncestorIds(nodes, selectedOutlineNodeId),
    [nodes, selectedOutlineNodeId],
  )
  const expandableIds = useMemo(() => collectExpandableIds(nodes), [nodes])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(selectedAncestorIds),
  )

  // 选择隐藏在折叠分支中的章节时，自动露出它的完整路径。
  useEffect(() => {
    setExpandedIds((current) => {
      const availableIds = new Set(expandableIds)
      const next = new Set([...current].filter((nodeId) => availableIds.has(nodeId)))
      selectedAncestorIds.forEach((nodeId) => next.add(nodeId))
      return next
    })
  }, [expandableIds, selectedAncestorIds])

  const toggleNode = (nodeId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  return (
    <section className="academic-outline" aria-label="论文分级大纲">
      {expandableIds.length > 0 && (
        <div className="academic-outline__toolbar" aria-label="大纲折叠控制">
          <span>分级视图</span>
          <div>
            <button
              type="button"
              onClick={() => setExpandedIds(new Set(expandableIds))}
              aria-label="展开全部章节"
              title="展开全部"
            >
              <ChevronsDown size={13} aria-hidden="true" />
              展开
            </button>
            <button
              type="button"
              onClick={() => setExpandedIds(new Set(selectedAncestorIds))}
              aria-label="收起全部章节"
              title="收起全部"
            >
              <ChevronsUp size={13} aria-hidden="true" />
              收起
            </button>
          </div>
        </div>
      )}
      <ol className="academic-outline__tree" role="tree" aria-label="论文三级大纲">
        <OutlineBranch
          nodes={nodes}
          sections={sections}
          selectedSectionId={selectedSectionId}
          onSelectSection={onSelectSection}
          depth={1}
          numberPrefix={[]}
          sectionByNodeId={sectionByNodeId}
          expandedIds={expandedIds}
          onToggle={toggleNode}
        />
      </ol>
    </section>
  )
}
