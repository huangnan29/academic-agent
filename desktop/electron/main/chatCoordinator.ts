import { createHash, randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type {
  AgentRun,
  AgentStep,
  ChatMessage,
  ChatStartInput,
  ChatStreamEvent,
  McpToolCallResult,
  MessageLiteratureCandidate,
} from '../../shared/contracts'
import { IPC } from '../../shared/ipc'
import { createProviderAdapter } from '../services/providers'
import { buildChatMessages } from '../services/pipeline'
import {
  sanitizeMcpText,
  stringifySanitizedMcpData,
  type ResolvedChatStartInput,
} from '../services/pipeline/context'
import { WorkspaceRepository } from '../services/storage/workspaceRepository'
import { ConfigurationService } from './configuration'
import { toUserMessage } from './errors'
import {
  extractMcpLiteratureCandidates,
  resolveHistoricalMessageLiteratureCandidates,
} from './mcpLiterature'
import { SystemPermissionService } from './systemPermissions'

const now = () => new Date().toISOString()
const MAX_ASSISTANT_CONTENT_CHARS = 2_000_000
const MAX_REASONING_CONTENT_CHARS = 1_000_000
const MAX_MCP_AUDIT_RESULT_CHARS = 48_000

export interface ChatMcpToolPlan {
  serverId: string
  serverName: string
  toolName: string
  arguments: Record<string, unknown>
  execute(signal: AbortSignal): Promise<McpToolCallResult>
}

export class ChatCoordinator {
  private readonly controllers = new Map<string, AbortController>()

  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly configuration: ConfigurationService,
    private readonly systemPermissions: SystemPermissionService,
  ) {}

  /**
   * 在任何外部 MCP 调用或模型请求发生前完成本机状态校验。
   * IPC 层会先调用一次；start 内再次校验用于防止状态在等待外部工具期间发生变化。
   */
  async assertCanStart(input: ChatStartInput): Promise<void> {
    const profile = this.repository.getProvider(input.providerId)
    if (!profile || !profile.enabled) throw new Error('所选模型服务未启用。')

    const stateBeforeMessage = this.repository.snapshot()
    const project = stateBeforeMessage.projects.find((item) => item.id === input.projectId)
    const conversation = stateBeforeMessage.conversations.find(
      (item) => item.id === input.conversationId && item.projectId === input.projectId,
    )
    if (!project || !conversation) throw new Error('项目或对话不存在。')
    validateContextReferences(stateBeforeMessage, input)
    if (conversation.accessMode === 'full') {
      const permissions = await this.systemPermissions.snapshot()
      if (!permissions.fullAccessReady) {
        await this.repository.updateConversation({
          conversationId: conversation.id,
          accessMode: 'ask',
        })
        throw new Error('macOS 完全访问权限已经失效，当前对话已恢复默认权限。')
      }
    }
  }

  async start(
    input: ChatStartInput,
    sender: WebContents,
    mcpPlans: ChatMcpToolPlan[] = [],
  ): Promise<{ runId: string }> {
    await this.assertCanStart(input)
    const profile = this.repository.getProvider(input.providerId)
    if (!profile) throw new Error('所选模型服务不存在。')
    await this.repository.promoteProjectForProvider(input.projectId, profile.id)

    const runId = randomUUID()
    const timestamp = now()
    const controller = new AbortController()
    this.controllers.set(runId, controller)

    const step: AgentStep = {
      id: randomUUID(),
      label: '生成回复',
      detail: `正在使用 ${profile.name} / ${input.model}`,
      status: mcpPlans.length > 0 ? 'pending' : 'running',
      startedAt: mcpPlans.length > 0 ? undefined : timestamp,
    }
    const toolSteps: AgentStep[] = mcpPlans.map((plan) => ({
      id: randomUUID(),
      label: `MCP · ${plan.toolName}`,
      detail: `等待调用 ${plan.serverName}`,
      status: 'pending',
    }))
    const run: AgentRun = {
      id: runId,
      projectId: input.projectId,
      kind: 'chat',
      status: 'running',
      steps: [...toolSteps, step],
      origin: 'live',
      verificationStatus: 'unverified',
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    const userMessage: ChatMessage = {
      id: randomUUID(),
      projectId: input.projectId,
      conversationId: input.conversationId,
      role: 'user',
      content: input.content.trim(),
      status: 'completed',
      contextScope: input.contextScope,
      contextReferences: input.contextReferences,
      origin: 'live',
      verificationStatus: 'unverified',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await this.repository.appendMessage(userMessage)

    const assistantMessage: ChatMessage = {
      id: randomUUID(),
      projectId: input.projectId,
      conversationId: input.conversationId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      providerId: input.providerId,
      model: input.model,
      contextScope: input.contextScope,
      runId,
      origin: 'live',
      verificationStatus: 'unverified',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await this.repository.appendMessage(assistantMessage)
    await this.repository.saveRun(run)
    this.send(sender, { runId, type: 'started', message: assistantMessage })
    for (const toolStep of toolSteps) this.send(sender, { runId, type: 'step', step: toolStep })
    this.send(sender, { runId, type: 'step', step })

    void this.consumeStream(input, userMessage.id, assistantMessage, step, toolSteps, mcpPlans, controller, sender)
    return { runId }
  }

  cancel(runId: string): void {
    this.controllers.get(runId)?.abort()
  }

  cancelAll(): void {
    for (const controller of this.controllers.values()) controller.abort()
    this.controllers.clear()
  }

  private async consumeStream(
    input: ChatStartInput,
    currentUserMessageId: string,
    assistantMessage: ChatMessage,
    step: AgentStep,
    toolSteps: AgentStep[],
    mcpPlans: ChatMcpToolPlan[],
    controller: AbortController,
    sender: WebContents,
  ): Promise<void> {
    const { runId } = assistantMessage
    if (!runId) return
    let content = ''
    let reasoningContent = ''
    const literatureCandidates: MessageLiteratureCandidate[] = []
    const resolvedMcpTools: NonNullable<ResolvedChatStartInput['resolvedMcpTools']> = []
    let activeToolIndex = -1

    try {
      for (const [index, plan] of mcpPlans.entries()) {
        activeToolIndex = index
        toolSteps[index] = {
          ...toolSteps[index],
          detail: `正在调用 ${plan.serverName} · 参数 ${redactedJson(plan.arguments).slice(0, 500)}`,
          status: 'running',
          startedAt: now(),
        }
        await this.repository.updateRun(runId, { steps: [...toolSteps, step] })
        this.send(sender, { runId, type: 'step', step: toolSteps[index] })

        const result = await plan.execute(controller.signal)
        if (result.isError) throw new Error(`${plan.serverName} / ${plan.toolName} 返回错误。`)
        const execution = {
          serverId: plan.serverId,
          serverName: plan.serverName,
          toolName: plan.toolName,
          arguments: plan.arguments,
          result,
        }
        resolvedMcpTools.push(execution)
        const auditEvidence = createMcpAuditEvidence(execution)
        for (const candidate of extractMcpLiteratureCandidates(result)) {
          if (literatureCandidates.length >= 50) break
          const duplicated = literatureCandidates.some((item) => (
            (item.doi && candidate.doi && item.doi === candidate.doi)
            || (item.title === candidate.title && item.year === candidate.year)
          ))
          if (duplicated) continue
          literatureCandidates.push({
            id: randomUUID(),
            ...candidate,
            provenance: {
              runId,
              stepId: toolSteps[index].id,
              serverId: auditEvidence.serverId,
              toolName: auditEvidence.toolName,
              resultSha256: auditEvidence.resultSha256,
            },
            source: 'mcp',
          })
        }
        if (literatureCandidates.length > 0) {
          // 工具完成后立即保存候选；即使后续模型失败，真实检索结果仍可由用户加入文献栏。
          await this.repository.updateMessage(assistantMessage.id, {
            literatureCandidates: [...literatureCandidates],
          })
        }
        toolSteps[index] = {
          ...toolSteps[index],
          detail: summarizeMcpExecution(execution),
          status: 'completed',
          completedAt: now(),
          evidence: auditEvidence,
        }
        await this.repository.updateRun(runId, { steps: [...toolSteps, step] })
        this.send(sender, { runId, type: 'step', step: toolSteps[index] })
      }

      activeToolIndex = -1
      const resolvedInput: ResolvedChatStartInput = {
        ...input,
        // 用户消息仍保存原始别名；只在模型输入中规范为真实工具名，避免模型误判“工具不存在”。
        content: normalizeResolvedMcpAlias(input.content, resolvedMcpTools),
        resolvedMcpTools,
        currentUserMessageId,
      }
      await this.assertCanStart(resolvedInput)
      const messages = buildChatMessages(this.repository.snapshot(), resolvedInput)
      const runningStep: AgentStep = { ...step, status: 'running', startedAt: now() }
      Object.assign(step, runningStep)
      await this.repository.updateRun(runId, { steps: [...toolSteps, step] })
      this.send(sender, { runId, type: 'step', step })

      const profile = this.repository.getProvider(input.providerId)
      if (!profile) throw new Error('模型服务配置不存在。')
      const apiKey = this.configuration.providerSecret(input.providerId)
      const adapter = createProviderAdapter(profile, apiKey, { requestTimeoutMs: 180_000 })

      for await (const event of adapter.streamChat(messages, input.model, controller.signal)) {
        if (event.type === 'reasoning-delta') {
          reasoningContent += event.delta
          if (reasoningContent.length > MAX_REASONING_CONTENT_CHARS) {
            throw new Error('模型推理内容超过本机安全上限，已停止继续接收。')
          }
          this.send(sender, { runId, type: 'reasoning-delta', delta: event.delta })
          continue
        }
        if (event.type === 'text-delta') {
          content += event.delta
          if (content.length > MAX_ASSISTANT_CONTENT_CHARS) {
            throw new Error('模型回复超过本机安全上限，已停止继续接收。')
          }
          this.send(sender, { runId, type: 'text-delta', delta: event.delta })
        }
      }

      const historicalCandidates = resolveHistoricalMessageLiteratureCandidates(
        this.repository.snapshot(),
        { ...assistantMessage, content },
      )
      const completedCandidates = mergeLiteratureCandidates(literatureCandidates, historicalCandidates)
      const completed = await this.repository.updateMessage(assistantMessage.id, {
        content,
        reasoningContent: reasoningContent || undefined,
        literatureCandidates: completedCandidates.length > 0 ? completedCandidates : undefined,
        status: 'completed',
      })
      await this.repository.updateRun(runId, {
        status: 'completed',
        verificationStatus: 'unverified',
        steps: [
          ...toolSteps,
          {
            ...step,
            detail: `已使用 ${profile.name} / ${input.model} 完成回复`,
            status: 'completed',
            completedAt: now(),
          },
        ],
      })
      this.send(sender, { runId, type: 'completed', message: completed })
    } catch (error) {
      if (controller.signal.aborted) {
        if (activeToolIndex >= 0) {
          const activePlan = mcpPlans[activeToolIndex]
          toolSteps[activeToolIndex] = {
            ...toolSteps[activeToolIndex],
            detail: '用户已停止本次 MCP 调用',
            status: 'stopped',
            completedAt: now(),
            evidence: activePlan ? createMcpFailureAuditEvidence(activePlan, '用户已停止本次 MCP 调用') : undefined,
          }
        }
        const cancelled = await this.repository.updateMessage(assistantMessage.id, {
          content,
          reasoningContent: reasoningContent || undefined,
          status: 'cancelled',
        })
        await this.repository.updateRun(runId, {
          status: 'cancelled',
          steps: [
            ...toolSteps.map((item) => item.status === 'pending' ? { ...item, status: 'stopped' as const, completedAt: now() } : item),
            { ...step, detail: '用户已停止本次生成', status: 'stopped', completedAt: now() },
          ],
        })
        this.send(sender, { runId, type: 'cancelled', message: cancelled })
      } else {
        const message = toUserMessage(error, '模型生成失败，请检查服务配置后重试。')
        if (activeToolIndex >= 0) {
          const activePlan = mcpPlans[activeToolIndex]
          toolSteps[activeToolIndex] = {
            ...toolSteps[activeToolIndex],
            detail: message,
            status: 'error',
            completedAt: now(),
            evidence: activePlan ? createMcpFailureAuditEvidence(activePlan, message) : undefined,
          }
        }
        await this.repository.updateMessage(assistantMessage.id, {
          content,
          reasoningContent: reasoningContent || undefined,
          status: 'error',
          error: message,
        })
        await this.repository.updateRun(runId, {
          status: 'error',
          error: message,
          steps: [
            ...toolSteps.map((item) => item.status === 'pending' ? { ...item, status: 'stopped' as const, completedAt: now() } : item),
            { ...step, detail: activeToolIndex >= 0 ? 'MCP 调用未完成，未启动模型生成。' : message, status: activeToolIndex >= 0 ? 'stopped' : 'error', completedAt: now() },
          ],
        })
        this.send(sender, { runId, type: 'error', message })
      }
    } finally {
      this.controllers.delete(runId)
    }
  }

  private send(sender: WebContents, event: ChatStreamEvent): void {
    if (!sender.isDestroyed()) sender.send(IPC.chatEvent, event)
  }
}

function mergeLiteratureCandidates(
  current: MessageLiteratureCandidate[],
  historical: MessageLiteratureCandidate[],
): MessageLiteratureCandidate[] {
  const merged = [...current]
  for (const candidate of historical) {
    const duplicated = merged.some((item) => (
      (item.doi && candidate.doi && item.doi === candidate.doi)
      || (item.title === candidate.title && item.year === candidate.year)
    ))
    if (!duplicated) merged.push(candidate)
  }
  return merged.slice(0, 50)
}

function summarizeMcpExecution(execution: NonNullable<ResolvedChatStartInput['resolvedMcpTools']>[number]): string {
  const text = execution.result.content
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return ''
      const block = item as Record<string, unknown>
      return block.type === 'text' && typeof block.text === 'string' ? block.text : ''
    })
    .find((item) => Boolean(item.trim()))
    ?.replace(/\s+/g, ' ')
    .trim()
  const safeText = text ? sanitizeMcpText(text).slice(0, 800) : ''
  const args = redactedJson(execution.arguments).slice(0, 500)
  return [
    execution.serverName,
    `参数 ${args}`,
    safeText ? `真实返回：${safeText}` : '已真实返回结构化结果',
  ].join(' · ')
}

function createMcpAuditEvidence(
  execution: NonNullable<ResolvedChatStartInput['resolvedMcpTools']>[number],
): NonNullable<AgentStep['evidence']> {
  const rawResult = JSON.stringify({
    content: execution.result.content,
    structuredContent: execution.result.structuredContent,
    isError: execution.result.isError === true,
  })
  const safeResult = stringifySanitizedMcpData({
    content: execution.result.content,
    structuredContent: execution.result.structuredContent,
    isError: execution.result.isError === true,
  })
  return {
    kind: 'mcp-tool',
    serverId: execution.serverId,
    toolName: execution.toolName,
    argumentsJson: redactedJson(execution.arguments).slice(0, 8_000),
    resultJson: safeResult.slice(0, MAX_MCP_AUDIT_RESULT_CHARS),
    resultSha256: createHash('sha256').update(rawResult).digest('hex'),
    truncated: safeResult.length > MAX_MCP_AUDIT_RESULT_CHARS,
  }
}

function createMcpFailureAuditEvidence(
  plan: ChatMcpToolPlan,
  errorMessage: string,
): NonNullable<AgentStep['evidence']> {
  const safeError = sanitizeMcpText(errorMessage).slice(0, 2_000)
  const result = stringifySanitizedMcpData({ error: safeError })
  return {
    kind: 'mcp-tool',
    serverId: plan.serverId,
    toolName: plan.toolName,
    argumentsJson: redactedJson(plan.arguments).slice(0, 8_000),
    resultJson: result,
    resultSha256: createHash('sha256').update(result).digest('hex'),
    truncated: false,
  }
}

function redactedJson(value: unknown): string {
  try {
    return stringifySanitizedMcpData(value)
  } catch {
    return '{}'
  }
}

function normalizeResolvedMcpAlias(
  content: string,
  executions: NonNullable<ResolvedChatStartInput['resolvedMcpTools']>,
): string {
  if (!executions.some((item) => item.serverId === 'builtin-arxiv-mcp' && item.toolName === 'search_papers')) {
    return content
  }
  return content.replace(/^\s*\/paper_search\b/iu, '/search_papers')
}

function validateContextReferences(
  state: ReturnType<WorkspaceRepository['snapshot']>,
  input: ChatStartInput,
): void {
  for (const reference of input.contextReferences ?? []) {
    if (reference.kind === 'skill') {
      const skill = state.skills.find((item) => item.id === reference.skillId)
      if (!skill || !skill.enabled) throw new Error('所选 Skill 不存在或已停用，请重新选择。')
      continue
    }
    const server = state.mcpServers.find((item) => item.id === reference.serverId)
    if (!server || !server.enabled) throw new Error('所选 MCP 服务不存在或已停用，请重新选择。')
    if (
      reference.kind === 'mcp-tool'
      && !server.tools.some((tool) => tool.name === reference.toolName)
    ) {
      throw new Error(`所选 MCP 工具 ${reference.toolName} 不存在，请重新测试服务后选择。`)
    }
  }
}
