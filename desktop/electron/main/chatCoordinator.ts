import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type {
  AgentRun,
  AgentStep,
  ChatMessage,
  ChatStartInput,
  ChatStreamEvent,
} from '../../shared/contracts'
import { IPC } from '../../shared/ipc'
import { createProviderAdapter } from '../services/providers'
import { buildChatMessages } from '../services/pipeline'
import { WorkspaceRepository } from '../services/storage/workspaceRepository'
import { ConfigurationService } from './configuration'
import { toUserMessage } from './errors'

const now = () => new Date().toISOString()
const MAX_ASSISTANT_CONTENT_CHARS = 2_000_000

export class ChatCoordinator {
  private readonly controllers = new Map<string, AbortController>()

  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly configuration: ConfigurationService,
  ) {}

  async start(input: ChatStartInput, sender: WebContents): Promise<{ runId: string }> {
    const profile = this.repository.getProvider(input.providerId)
    if (!profile || !profile.enabled) throw new Error('所选模型服务未启用。')

    const stateBeforeMessage = this.repository.snapshot()
    const project = stateBeforeMessage.projects.find((item) => item.id === input.projectId)
    const conversation = stateBeforeMessage.conversations.find(
      (item) => item.id === input.conversationId && item.projectId === input.projectId,
    )
    if (!project || !conversation) throw new Error('项目或对话不存在。')
    const messages = buildChatMessages(stateBeforeMessage, input)
    const runId = randomUUID()
    const timestamp = now()
    const controller = new AbortController()
    this.controllers.set(runId, controller)

    const step: AgentStep = {
      id: randomUUID(),
      label: '生成回复',
      detail: `正在使用 ${profile.name} / ${input.model}`,
      status: 'running',
      startedAt: timestamp,
    }
    const run: AgentRun = {
      id: runId,
      projectId: input.projectId,
      kind: 'chat',
      status: 'running',
      steps: [step],
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
    this.send(sender, { runId, type: 'step', step })

    void this.consumeStream(input, assistantMessage, messages, step, controller, sender)
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
    assistantMessage: ChatMessage,
    messages: ReturnType<typeof buildChatMessages>,
    step: AgentStep,
    controller: AbortController,
    sender: WebContents,
  ): Promise<void> {
    const { runId } = assistantMessage
    if (!runId) return
    let content = ''

    try {
      const profile = this.repository.getProvider(input.providerId)
      if (!profile) throw new Error('模型服务配置不存在。')
      const apiKey = this.configuration.providerSecret(input.providerId)
      const adapter = createProviderAdapter(profile, apiKey, { requestTimeoutMs: 180_000 })

      for await (const event of adapter.streamChat(messages, input.model, controller.signal)) {
        if (event.type !== 'text-delta') continue
        content += event.delta
        if (content.length > MAX_ASSISTANT_CONTENT_CHARS) {
          throw new Error('模型回复超过本机安全上限，已停止继续接收。')
        }
        this.send(sender, { runId, type: 'text-delta', delta: event.delta })
      }

      const completed = await this.repository.updateMessage(assistantMessage.id, {
        content,
        status: 'completed',
      })
      await this.repository.updateRun(runId, {
        status: 'completed',
        verificationStatus: 'unverified',
        steps: [
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
        const cancelled = await this.repository.updateMessage(assistantMessage.id, {
          content,
          status: 'cancelled',
        })
        await this.repository.updateRun(runId, {
          status: 'cancelled',
          steps: [{ ...step, detail: '用户已停止本次生成', status: 'stopped', completedAt: now() }],
        })
        this.send(sender, { runId, type: 'cancelled', message: cancelled })
      } else {
        const message = toUserMessage(error, '模型生成失败，请检查服务配置后重试。')
        await this.repository.updateMessage(assistantMessage.id, {
          content,
          status: 'error',
          error: message,
        })
        await this.repository.updateRun(runId, {
          status: 'error',
          error: message,
          steps: [{ ...step, detail: message, status: 'error', completedAt: now() }],
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
