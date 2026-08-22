import type { ChatMessage } from '../../shared/contracts'
import { chatTimers, emit, subscribeChat } from './events'
import { clone, makeId, mutate, now } from './state'

export const chatApi: Window['paperAgent']['chat'] = {
  async start(input) {
    const runId = makeId('run')
    const userId = makeId('message')
    const assistantId = makeId('message')
    const createdAt = now()
    const userMessage: ChatMessage = {
      id: userId,
      projectId: input.projectId,
      conversationId: input.conversationId,
      role: 'user',
      content: input.content,
      status: 'completed',
      providerId: input.providerId,
      model: input.model,
      contextScope: input.contextScope,
      contextReferences: input.contextReferences,
      origin: 'demo',
      verificationStatus: 'demo',
      createdAt,
      updatedAt: createdAt,
    }
    const assistant: ChatMessage = {
      id: assistantId,
      projectId: input.projectId,
      conversationId: input.conversationId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      providerId: input.providerId,
      model: input.model,
      contextScope: input.contextScope,
      runId,
      origin: 'demo',
      verificationStatus: 'demo',
      createdAt,
      updatedAt: createdAt,
    }
    const fullText =
      '我已收到你的要求。当前运行在浏览器演示模式，因此这次回复不会访问真实模型或文献门户。\n\n我会保留项目上下文，并按“明确修改目标—定位相关段落—检查引用状态—生成修订稿”的流程处理。安装版配置模型后，同一输入框会切换为真实流式生成。'
    const deltas = fullText.match(/.{1,8}/gs) ?? [fullText]
    mutate((draft) => {
      draft.messages.push(userMessage, assistant)
      const conversation = draft.conversations.find((item) => item.id === input.conversationId)
      if (conversation) {
        const wasEmpty = conversation.messageIds.length === 0
        conversation.messageIds.push(userId, assistantId)
        if (wasEmpty && /^(新的研究任务|新对话(?:\s+\d+)?)$/.test(conversation.title)) {
          conversation.title = input.content.trim().replace(/\s+/g, ' ').slice(0, 42) || conversation.title
        }
        conversation.updatedAt = createdAt
      }
      const project = draft.projects.find((item) => item.id === input.projectId)
      if (project) project.updatedAt = createdAt
    })
    window.setTimeout(() => emit({ runId, type: 'started', message: clone(assistant) }), 0)
    const timers: number[] = []
    deltas.forEach((delta, index) => {
      timers.push(
        window.setTimeout(() => {
          mutate((draft) => {
            const message = draft.messages.find((item) => item.id === assistantId)
            if (message) message.content += delta
          })
          emit({ runId, type: 'text-delta', delta })
          if (index === deltas.length - 1) {
            const completed = mutate((draft) => {
              const message = draft.messages.find((item) => item.id === assistantId)
              if (message) message.status = 'completed'
            }).messages.find((item) => item.id === assistantId)
            if (completed) emit({ runId, type: 'completed', message: clone(completed) })
            chatTimers.delete(runId)
          }
        }, 80 + index * 36),
      )
    })
    chatTimers.set(runId, timers)
    return { runId }
  },
  async cancel(runId) {
    chatTimers.get(runId)?.forEach((timer) => window.clearTimeout(timer))
    chatTimers.delete(runId)
    const cancelled = mutate((draft) => {
      const message = draft.messages.find((item) => item.runId === runId)
      if (message) message.status = 'cancelled'
    }).messages.find((item) => item.runId === runId)
    if (cancelled) emit({ runId, type: 'cancelled', message: clone(cancelled) })
  },
  onEvent: subscribeChat,
}
