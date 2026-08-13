import type {
  ChatStartInput,
  LiteratureRecord,
  ManuscriptSection,
  OutlineNode,
  Project,
  ResearchBrief,
  WorkspaceState,
} from '../../../shared/contracts'
import type { ProviderChatMessage } from '../providers'

const DEFAULT_CONTEXT_LIMIT = 80_000
const MAX_ABSTRACT_CHARS = 1_200
const MAX_HISTORY_MESSAGES = 24

export interface PaperContextOptions {
  scope?: ChatStartInput['contextScope']
  selectedText?: string
  targetSectionId?: string
  maxChars?: number
}

export function buildOutlinePrompt(
  brief: ResearchBrief,
  literature: LiteratureRecord[] = [],
): string {
  const sources = literature.filter((item) => item.included)
  const sourceText = sources.length
    ? sources.map(formatLiteratureForPrompt).join('\n')
    : '当前没有已纳入的文献。允许生成不带引用的结构，但不得虚构文献、DOI 或研究结论。'

  return [
    '你是严谨的学术写作规划 Agent。请先规划，不要直接撰写论文正文。',
    '',
    '## 研究任务',
    `题目：${brief.title}`,
    `论文类型：${brief.paperType || '未指定'}`,
    `学科：${brief.discipline || '未指定'}`,
    `语言：${brief.language === 'zh-CN' ? '简体中文' : '英文'}`,
    `目标篇幅：约 ${brief.targetWords} 字/词`,
    `关键词：${brief.keywords.join('、') || '未指定'}`,
    `其他要求：${brief.requirements || '无'}`,
    '',
    '## 可用文献',
    sourceText,
    '',
    '## 约束',
    '1. 结构必须围绕研究问题推进，避免“概念堆砌”和重复章节。',
    '2. citationIds 只能填写上方真实存在的文献 ID；证据不足时保持空数组。',
    '3. 不得虚构 DOI、页码、样本、实验、访谈、调查结果或检索成功状态。',
    '4. 必须生成完整三级结构：一级章节的 children 为二级小节，二级小节的 children 为三级条目；只有三级条目的 children 为空。',
    '5. objective 必须说明该节解决的问题和预期论证内容，而不是复述标题。',
    '',
    '## 输出格式',
    '只输出合法 JSON，不要使用 Markdown 代码块或补充说明。JSON 顶层为数组：',
    '[{"id":"chapter-1","title":"第一章 章节标题","level":1,"objective":"本章目标","targetWords":1200,"citationIds":[],"children":[{"id":"chapter-1-1","title":"1.1 二级小节","level":2,"objective":"本节目标","targetWords":600,"citationIds":[],"children":[{"id":"chapter-1-1-1","title":"1.1.1 三级条目","level":3,"objective":"本条目目标","targetWords":300,"citationIds":["文献ID"],"children":[]}]}]}]',
  ].join('\n')
}

export function buildPaperContext(
  state: WorkspaceState,
  projectId: string,
  options: PaperContextOptions = {},
): string {
  const project = getProject(state, projectId)
  const scope = options.scope ?? 'project'
  const outline = state.outlines[projectId] ?? []
  const includedLiterature = state.literature.filter(
    (item) => item.projectId === projectId && item.included,
  )
  const projectSections = state.sections.filter((section) => section.projectId === projectId)
  const sections = chooseSections(project, projectSections, scope, options.targetSectionId)

  const blocks = [
    formatBrief(project),
    formatOutline(outline),
    formatLiterature(includedLiterature),
  ]

  if (scope !== 'project') blocks.push(formatSections(sections))
  if (scope === 'selection' && options.selectedText?.trim()) {
    blocks.push(`## 用户选中文本\n${options.selectedText.trim()}`)
  }

  return truncateContext(blocks.filter(Boolean).join('\n\n'), options.maxChars ?? DEFAULT_CONTEXT_LIMIT)
}

export function buildChatMessages(
  state: WorkspaceState,
  input: ChatStartInput,
): ProviderChatMessage[] {
  const context = buildPaperContext(state, input.projectId, {
    scope: input.contextScope,
    selectedText: input.selectedText,
  })
  const conversation = state.conversations.find(
    (item) => item.id === input.conversationId && item.projectId === input.projectId,
  )
  const allowedMessageIds = new Set(conversation?.messageIds ?? [])
  const history = state.messages
    .filter(
      (message) =>
        message.projectId === input.projectId &&
        message.conversationId === input.conversationId &&
        (allowedMessageIds.size === 0 || allowedMessageIds.has(message.id)) &&
        message.status === 'completed' &&
        ['user', 'assistant'].includes(message.role),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-MAX_HISTORY_MESSAGES)
    .map<ProviderChatMessage>((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }))

  return [
    {
      role: 'system',
      content: [
        '你是学术 Agent，一款本机优先的论文研究工具。',
        '只能依据用户提供的信息和下方可追溯上下文工作。',
        '引用可用文献时使用 `【文献:文献ID】`，文献 ID 必须来自上下文。',
        '元数据已核验不等于正文观点已核验；仅有摘要时要明确证据边界。',
        '不得虚构文献、DOI、页码、实验、样本、统计结果或工具执行状态。',
        '如果证据不足，直接说明“当前证据不足”并提出下一步，而不是补造事实。',
        '修改论文时保持用户未要求改变的内容、结构和引用关系。',
        '',
        context,
      ].join('\n'),
    },
    ...history,
    { role: 'user', content: input.content.trim() },
  ]
}

export function buildSectionPrompt(
  state: WorkspaceState,
  projectId: string,
  sectionId: string,
): ProviderChatMessage[] {
  const project = getProject(state, projectId)
  const section = state.sections.find(
    (item) => item.id === sectionId && item.projectId === projectId,
  )
  if (!section) throw new Error('找不到要生成的论文小节。')

  const outlineNode = findOutlineNode(state.outlines[projectId] ?? [], section.outlineNodeId)
  const context = buildPaperContext(state, projectId, {
    scope: 'section',
    targetSectionId: sectionId,
    maxChars: DEFAULT_CONTEXT_LIMIT,
  })

  return [
    {
      role: 'system',
      content: [
        '你是严谨的学术论文写作 Agent。请只生成指定小节正文。',
        '保留标题层级，不输出整篇论文或额外的写作说明。',
        '引用格式必须为 `【文献:文献ID】`，且 ID 只能来自上下文。',
        '不得虚构研究结果、样本、DOI、页码或数据；证据不足必须明确说明。',
        '',
        context,
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `请撰写：${section.title}`,
        `论文题目：${project.title}`,
        `本节目标：${outlineNode?.objective || '围绕标题完成清晰、连贯的论证。'}`,
        `建议篇幅：约 ${outlineNode?.targetWords || Math.max(600, project.brief.targetWords / 8)} 字/词`,
        `优先使用文献 ID：${outlineNode?.citationIds.join('、') || '无指定文献'}`,
      ].join('\n'),
    },
  ]
}

function getProject(state: WorkspaceState, projectId: string): Project {
  const project = state.projects.find((item) => item.id === projectId)
  if (!project) throw new Error('找不到论文项目。')
  return project
}

function chooseSections(
  project: Project,
  sections: ManuscriptSection[],
  scope: ChatStartInput['contextScope'],
  targetSectionId?: string,
): ManuscriptSection[] {
  if (scope === 'section' || scope === 'selection') {
    const sectionId = targetSectionId ?? project.activeSectionId
    return sections.filter((section) => section.id === sectionId)
  }
  return sections
}

function formatBrief(project: Project): string {
  const brief = project.brief
  return [
    '## 项目要求',
    `题目：${brief.title || project.title}`,
    `类型：${brief.paperType || '未指定'}`,
    `学科：${brief.discipline || '未指定'}`,
    `语言：${brief.language}`,
    `目标篇幅：${brief.targetWords}`,
    `关键词：${brief.keywords.join('、') || '未指定'}`,
    `具体要求：${brief.requirements || '无'}`,
  ].join('\n')
}

function formatOutline(nodes: OutlineNode[]): string {
  if (nodes.length === 0) return '## 当前提纲\n尚未生成。'
  const lines: string[] = ['## 当前提纲']
  const visit = (node: OutlineNode) => {
    lines.push(
      `${'  '.repeat(node.level - 1)}- [${node.id}] ${node.title}（目标 ${node.targetWords}；引用 ${node.citationIds.join('、') || '无'}）`,
    )
    node.children.forEach(visit)
  }
  nodes.forEach(visit)
  return lines.join('\n')
}

function formatLiterature(records: LiteratureRecord[]): string {
  if (records.length === 0) return '## 已纳入文献\n暂无。'
  return ['## 已纳入文献', ...records.map(formatLiteratureForPrompt)].join('\n')
}

function formatLiteratureForPrompt(record: LiteratureRecord): string {
  const parts = [
    `[ID=${record.id}] ${record.authors.join(', ') || '作者未知'}（${record.year ?? '年份未知'}）《${record.title}》`,
    `来源=${record.source}；核验状态=${record.verificationStatus}`,
  ]
  if (record.doi) parts.push(`DOI=${record.doi}`)
  if (record.abstract) parts.push(`摘要=${record.abstract.slice(0, MAX_ABSTRACT_CHARS)}`)
  return `- ${parts.join('；')}`
}

function formatSections(sections: ManuscriptSection[]): string {
  if (sections.length === 0) return '## 当前文稿\n暂无已生成内容。'
  return [
    '## 当前文稿',
    ...sections.map((section) => `${'#'.repeat(section.level + 1)} ${section.title}\n${section.content}`),
  ].join('\n\n')
}

function findOutlineNode(nodes: OutlineNode[], id: string): OutlineNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    const child = findOutlineNode(node.children, id)
    if (child) return child
  }
  return undefined
}

function truncateContext(context: string, maxChars: number): string {
  const limit = Math.max(4_000, maxChars)
  if (context.length <= limit) return context
  return `${context.slice(0, limit)}\n\n[上下文因长度限制已截断]`
}
