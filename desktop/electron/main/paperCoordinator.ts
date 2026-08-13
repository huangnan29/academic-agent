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
import { createProviderAdapter, usesExplicitDeepSeekThinking } from '../services/providers'
import { IPC } from '../../shared/ipc'
import {
  buildOutlinePrompt,
  buildSectionPrompt,
  extractCitationIds,
  parseOutline,
  runProjectQualityChecks,
  runQualityChecks,
} from '../services/pipeline'
import { WorkspaceRepository } from '../services/storage/workspaceRepository'
import { ConfigurationService } from './configuration'

const MAX_GENERATED_CONTENT_CHARS = 2_000_000
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
    const profile = this.repository.getProvider(input.providerId)
    if (!profile || !profile.enabled) throw new Error('所选模型服务未启用。')
    const adapter = createProviderAdapter(
      profile,
      this.configuration.providerSecret(input.providerId),
      { requestTimeoutMs: 180_000 },
    )
    const literature = state.literature.filter(
      (item) => item.projectId === input.projectId && item.included && item.origin !== 'demo',
    )
    const run = createPaperRun(input.projectId, 'outline', [
      ['整理研究要求', '已读取题目、学科、篇幅与引用约束', 'completed'],
      ['生成三级大纲', `正在使用 ${profile.name} / ${input.model}`, 'running'],
    ])
    await this.repository.saveRun(run)
    const prompt = buildOutlinePrompt(project.brief, literature, state.skills)

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
      await this.repository.saveOutline(input.projectId, outline)
      await this.repository.createSectionsFromOutline(input.projectId, outline)
      const completedAt = now()
      await this.repository.updateRun(run.id, {
        status: 'completed',
        steps: [
          { ...run.steps[0], completedAt },
          {
            ...run.steps[1],
            detail: removedCitationCount
              ? `大纲已生成；已移除 ${removedCitationCount} 个未在文献库中的引用 ID`
              : `大纲已生成，共 ${outline.length} 个一级章节`,
            status: removedCitationCount ? 'warning' : 'completed',
            completedAt,
          },
        ],
      })
      return outline
    } catch (error) {
      const message = error instanceof Error ? error.message : '大纲生成失败。'
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
    await this.repository.saveRun(run)
    await this.repository.updateSection(input.sectionId, {
      status: 'generating',
      content: '',
      wordCount: 0,
      reasoningContent: undefined,
      generationError: undefined,
      generationProviderId: profile.id,
      generationModel: input.model,
      thinkingRequested,
    })
    this.sendSection(sender, {
      runId: run.id,
      sectionId: input.sectionId,
      type: 'started',
      providerId: profile.id,
      providerName: profile.name,
      model: input.model,
      thinkingRequested,
    })
    let content = ''
    let reasoningContent = ''
    let savedSection: ManuscriptSection | undefined

    try {
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
      savedSection = await this.repository.saveSection(input.sectionId, content)
      savedSection = await this.repository.updateSection(input.sectionId, {
        reasoningContent: reasoningContent || undefined,
        generationProviderId: profile.id,
        generationModel: input.model,
        thinkingRequested,
        generationError: undefined,
      })

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
      if (!savedSection && content) {
        savedSection = await this.repository.saveSection(input.sectionId, content)
      }
      const failedSection = await this.repository.updateSection(input.sectionId, {
        status: 'error',
        reasoningContent: reasoningContent || undefined,
        generationProviderId: profile.id,
        generationModel: input.model,
        thinkingRequested,
        generationError: message,
      })
      await this.repository.updateRun(run.id, {
        status: 'error',
        error: message,
        steps: run.steps.map((step) =>
          step.status === 'running'
            ? { ...step, detail: message, status: 'error' as const, completedAt: now() }
            : step,
        ),
      })
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
