import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type {
  AgentRun,
  CitationEvidence,
  ManuscriptSection,
  OutlineGenerateInput,
  OutlineNode,
  SectionGenerateInput,
  SectionStreamEvent,
} from '../../shared/contracts'
import {
  createProviderAdapter,
  ProviderRequestError,
  usesExplicitDeepSeekThinking,
} from '../services/providers'
import { IPC } from '../../shared/ipc'
import {
  analyzeOutlineArchitecture,
  buildOutlinePrompt,
  buildSectionPrompt,
  extractCitationIds,
  parseOutline,
  runOutlineQualityChecks,
  runProjectQualityChecks,
  runQualityChecks,
} from '../services/pipeline'
import { WorkspaceRepository } from '../services/storage/workspaceRepository'
import { ConfigurationService } from './configuration'

const MAX_GENERATED_CONTENT_CHARS = 2_000_000
// 三级大纲同时要求专业路由、层级展开和严格 JSON；思考模型首包较慢，使用提供方默认的十分钟上限，避免三分钟误判超时。
const OUTLINE_REQUEST_TIMEOUT_MS = 600_000
const now = () => new Date().toISOString()

export class PaperCoordinator {
  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly configuration: ConfigurationService,
  ) {}

  async generateOutline(input: OutlineGenerateInput): Promise<OutlineNode[]> {
    const state = this.repository.snapshot()
    const project = state.projects.find((item) => item.id === input.projectId)
    if (!project) throw new Error('项目不存在。')
    const replacingExisting = (state.outlines[input.projectId] ?? []).length > 0
    const protectedOutlineNodes = replacingExisting
      ? collectProtectedOutlineNodes(state, input.projectId)
      : []
    const profile = this.repository.getProvider(input.providerId)
    if (!profile || !profile.enabled) throw new Error('所选模型服务未启用。')
    await this.repository.promoteProjectForProvider(input.projectId, profile.id)
    const adapter = createProviderAdapter(
      profile,
      this.configuration.providerSecret(input.providerId),
      { requestTimeoutMs: OUTLINE_REQUEST_TIMEOUT_MS },
    )
    const literature = state.literature.filter(
      (item) => item.projectId === input.projectId && item.included && item.origin !== 'demo',
    )
    const architecture = {
      ...analyzeOutlineArchitecture(project.brief, literature),
      projectId: input.projectId,
    }
    const run = createPaperRun(input.projectId, 'outline', [
      [
        '识别专业与结构',
        `已识别为${architecture.disciplineLabel}，采用 ${architecture.pattern} 结构（匹配度 ${Math.round(architecture.confidence * 100)}%）`,
        'completed',
      ],
      ['生成三级大纲', `正在使用 ${profile.name} / ${input.model}`, 'running'],
    ])
    await this.repository.saveRun(run)
    const basePrompt = buildOutlinePrompt(project.brief, literature, state.skills, architecture)
    const prompt = protectedOutlineNodes.length > 0
      ? `${basePrompt}\n\n${formatOutlineRegenerationConstraints(protectedOutlineNodes)}`
      : basePrompt

    try {
      let raw = ''
      for await (const event of adapter.streamChat(
        [
          { role: 'system', content: '你只负责生成结构化、可追溯的论文三级提纲。' },
          { role: 'user', content: prompt },
        ],
        input.model,
      )) {
        if (event.type !== 'text-delta') continue
        raw += event.delta
        if (raw.length > MAX_GENERATED_CONTENT_CHARS) {
          throw new Error('模型返回的提纲内容超过本机安全上限。')
        }
      }

      const allowedCitationIds = new Set(literature.map((item) => item.id))
      const parsed = parseOutline(raw, project.brief.targetWords)
      const { outline, removedCitationCount } = filterOutlineCitations(parsed, allowedCitationIds)
      assertProtectedOutlineNodesPreserved(outline, protectedOutlineNodes)
      const quality = runOutlineQualityChecks(outline, {
        brief: project.brief,
        architecture,
        allowedCitationIds,
      })
      await this.repository.commitGeneratedOutline(input.projectId, outline, architecture, quality)
      const completedAt = now()
      const qualityConcernCount = quality.issues.filter((issue) => issue.severity !== 'info').length
      await this.repository.updateRun(run.id, {
        status: 'completed',
        steps: [
          { ...run.steps[0], completedAt },
          {
            ...run.steps[1],
            detail: [
              `大纲已生成，共 ${outline.length} 个一级章节，结构得分 ${quality.score}`,
              removedCitationCount ? `已移除 ${removedCitationCount} 个未在文献库中的引用 ID` : '',
              qualityConcernCount ? `有 ${qualityConcernCount} 项结构问题需要复核` : '',
            ].filter(Boolean).join('；'),
            status: removedCitationCount || qualityConcernCount ? 'warning' : 'completed',
            completedAt,
          },
        ],
      })
      return outline
    } catch (error) {
      const message = error instanceof ProviderRequestError && error.code === 'TIMEOUT'
        ? '大纲生成等待模型响应超过 10 分钟。思考模型可能仍在服务端生成，请稍后重试或切换较快的模型。'
        : error instanceof Error ? error.message : '大纲生成失败。'
      await this.repository.updateRun(run.id, {
        status: 'error',
        error: message,
        steps: [
          run.steps[0],
          { ...run.steps[1], detail: message, status: 'error', completedAt: now() },
        ],
      })
      throw error
    }
  }

  async generateSection(input: SectionGenerateInput, sender: WebContents): Promise<void> {
    const state = this.repository.snapshot()
    const project = state.projects.find((item) => item.id === input.projectId)
    const section = state.sections.find(
      (item) => item.id === input.sectionId && item.projectId === input.projectId,
    )
    if (!project || !section) throw new Error('项目或论文章节不存在。')
    const profile = this.repository.getProvider(input.providerId)
    if (!profile || !profile.enabled) throw new Error('所选模型服务未启用。')
    await this.repository.promoteProjectForProvider(input.projectId, profile.id)
    const adapter = createProviderAdapter(
      profile,
      this.configuration.providerSecret(input.providerId),
      { requestTimeoutMs: 240_000 },
    )
    const messages = buildSectionPrompt(state, input.projectId, input.sectionId)
    const run = createPaperRun(input.projectId, 'write', [
      ['准备章节上下文', `已锁定“${section.title}”及其引用范围`, 'completed'],
      ['生成章节草稿', `正在使用 ${profile.name} / ${input.model}`, 'running'],
      ['检查引用与篇幅', '等待章节生成完成', 'pending'],
    ])
    const thinkingRequested = usesExplicitDeepSeekThinking(profile, input.model)
    const generation = await this.repository.beginSectionGeneration(input.sectionId, {
      generationProviderId: profile.id,
      generationModel: input.model,
      thinkingRequested,
    })
    let content = ''
    let reasoningContent = ''
    let savedSection: ManuscriptSection | undefined
    let runSaved = false

    try {
      await this.repository.saveRun(run)
      runSaved = true
      this.sendSection(sender, {
        runId: run.id,
        sectionId: input.sectionId,
        type: 'started',
        providerId: profile.id,
        providerName: profile.name,
        model: input.model,
        thinkingRequested,
      })
      for await (const event of adapter.streamChat(messages, input.model)) {
        if (event.type === 'reasoning-delta') {
          reasoningContent += event.delta
          if (reasoningContent.length > MAX_GENERATED_CONTENT_CHARS) {
            throw new Error('模型返回的章节推理内容超过本机安全上限。')
          }
          this.sendSection(sender, { runId: run.id, sectionId: input.sectionId, type: 'reasoning-delta', delta: event.delta })
          continue
        }
        if (event.type === 'text-delta') {
          content += event.delta
          if (content.length > MAX_GENERATED_CONTENT_CHARS) {
            throw new Error('模型返回的章节内容超过本机安全上限。')
          }
          this.sendSection(sender, { runId: run.id, sectionId: input.sectionId, type: 'text-delta', delta: event.delta })
        }
      }
      savedSection = await this.repository.commitSectionGeneration(
        input.sectionId,
        generation.baseVersion,
        content,
        {
          source: 'generated',
          reasoningContent: reasoningContent || undefined,
          generationProviderId: profile.id,
          generationModel: input.model,
          thinkingRequested,
          generationError: undefined,
        },
      )

      const included = state.literature.filter(
        (item) => item.projectId === input.projectId && item.included && item.origin !== 'demo',
      )
      const literatureById = new Map(included.map((item) => [item.id, item]))
      const citationIds = [...new Set(extractCitationIds(content))]
      const citations: CitationEvidence[] = citationIds.map((id) => {
        const literature = literatureById.get(id)
        const timestamp = now()
        return {
          id: randomUUID(),
          projectId: input.projectId,
          sectionId: input.sectionId,
          marker: `【文献:${id}】`,
          literatureId: literature?.id,
          claim: findCitationClaim(content, id),
          status: literature ? 'mapped' : 'unmapped',
          origin: 'live',
          verificationStatus: literature?.verificationStatus ?? 'unverified',
          createdAt: timestamp,
          updatedAt: timestamp,
        }
      })
      await this.repository.replaceSectionCitations(input.sectionId, citations)

      const outlineNode = findOutlineNode(state.outlines[input.projectId] ?? [], section.outlineNodeId)
      const quality = runQualityChecks(content, {
        targetWords: outlineNode?.targetWords,
        language: project.brief.language,
        allowedCitationIds: included.map((item) => item.id),
        requireCitations: included.length > 0,
      })
      const hasConcern = quality.issues.some((issue) => issue.severity !== 'info')
      const completedAt = now()
      await this.repository.updateRun(run.id, {
        status: 'completed',
        steps: [
          { ...run.steps[0], completedAt },
          {
            ...run.steps[1],
            detail: `已生成约 ${quality.metrics.wordCount} 字/词`,
            status: 'completed',
            completedAt,
          },
          {
            ...run.steps[2],
            detail: hasConcern
              ? `发现 ${quality.issues.length} 项需复核问题，已保留引用映射记录`
              : `引用与篇幅检查完成，共 ${quality.metrics.citationCount} 个引用标记`,
            status: hasConcern ? 'warning' : 'completed',
            startedAt: completedAt,
            completedAt,
          },
        ],
      })
      this.sendSection(sender, {
        runId: run.id,
        sectionId: input.sectionId,
        type: 'completed',
        section: savedSection,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '章节生成失败。'
      let failedSection = this.repository.snapshot().sections.find((item) => item.id === input.sectionId) ?? generation.section
      try {
        failedSection = savedSection
          ? await this.repository.updateSection(input.sectionId, {
              status: 'error',
              generationError: message,
            })
          : content
          ? await this.repository.commitSectionGeneration(
              input.sectionId,
              generation.baseVersion,
              content,
              {
                source: 'partial',
                reasoningContent: reasoningContent || undefined,
                generationProviderId: profile.id,
                generationModel: input.model,
                thinkingRequested,
                generationError: message,
              },
            )
          : await this.repository.failSectionGeneration(input.sectionId, generation.baseVersion, {
              reasoningContent: reasoningContent || undefined,
              generationProviderId: profile.id,
              generationModel: input.model,
              thinkingRequested,
              generationError: message,
            })
      } catch {
        failedSection = this.repository.snapshot().sections.find((item) => item.id === input.sectionId) ?? failedSection
      }
      if (runSaved) {
        await this.repository.updateRun(run.id, {
          status: 'error',
          error: message,
          steps: run.steps.map((step) =>
            step.status === 'running'
              ? { ...step, detail: message, status: 'error' as const, completedAt: now() }
              : step,
          ),
        })
      }
      this.sendSection(sender, {
        runId: run.id,
        sectionId: input.sectionId,
        type: 'error',
        message,
        section: failedSection,
      })
      throw error
    }
  }

  quality(projectId: string) {
    return runProjectQualityChecks(this.repository.snapshot(), projectId)
  }

  private sendSection(sender: WebContents, event: SectionStreamEvent): void {
    if (!sender.isDestroyed()) sender.send(IPC.sectionEvent, event)
  }
}

interface ProtectedOutlineNode {
  id: string
  title: string
  level: 1 | 2 | 3
  parentId?: string
}

function collectProtectedOutlineNodes(
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

function formatOutlineRegenerationConstraints(nodes: ProtectedOutlineNode[]): string {
  return [
    '## 重新生成时必须保留的既有正文结构',
    '以下节点已经关联正文、历史版本或引用证据。重新规划时必须逐项保留其 id、标题、level 与 parentId；只能调整其他尚未写作的节点。不得移动、改名或删除这些节点。',
    JSON.stringify(nodes),
  ].join('\n')
}

function assertProtectedOutlineNodesPreserved(
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

function createPaperRun(
  projectId: string,
  kind: AgentRun['kind'],
  steps: Array<[string, string, AgentRun['steps'][number]['status']]>,
): AgentRun {
  const timestamp = now()
  return {
    id: randomUUID(),
    projectId,
    kind,
    status: 'running',
    steps: steps.map(([label, detail, status]) => ({
      id: randomUUID(),
      label,
      detail,
      status,
      startedAt: status === 'pending' ? undefined : timestamp,
      completedAt: status === 'completed' ? timestamp : undefined,
    })),
    origin: 'live',
    verificationStatus: 'unverified',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function filterOutlineCitations(
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

function findOutlineNode(nodes: OutlineNode[], nodeId: string): OutlineNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node
    const nested = findOutlineNode(node.children, nodeId)
    if (nested) return nested
  }
  return undefined
}

function findCitationClaim(content: string, citationId: string): string {
  const marker = `【文献:${citationId}】`
  return (
    content
      .split(/(?<=[。！？.!?])\s*/)
      .find((sentence) => sentence.includes(marker))
      ?.trim()
      .slice(0, 500) ?? marker
  )
}
