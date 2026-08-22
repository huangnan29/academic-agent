import type { Dispatch, SetStateAction } from 'react'
import type {
  ChatContextReference,
  ChatMessage,
  Conversation,
  Project,
  WorkspaceState,
} from '../../shared/contracts'
import { paperAgent } from '../fallback'

type CenterMode = 'chat' | 'manuscript'
type ShowToast = (message: string, tone?: 'success' | 'error') => void

export function useChatActions({
  workspace,
  setWorkspace,
  activeProject,
  conversation,
  activeProviderId,
  activeModel,
  activeRunId,
  setActiveRunId,
  centerMode,
  setCenterMode,
  showToast,
}: {
  workspace: WorkspaceState
  setWorkspace: Dispatch<SetStateAction<WorkspaceState>>
  activeProject?: Project
  conversation?: Conversation
  activeProviderId?: string
  activeModel?: string
  activeRunId?: string
  setActiveRunId: Dispatch<SetStateAction<string | undefined>>
  centerMode: CenterMode
  setCenterMode: (mode: CenterMode) => void
  showToast: ShowToast
}) {
  const sendMessage = async (content: string, contextReferences: ChatContextReference[]): Promise<boolean> => {
    if (!activeProject || !conversation || !activeProviderId || !activeModel) return false
    const contextScope = centerMode === 'manuscript' ? 'section' : 'project'
    if (centerMode === 'manuscript') setCenterMode('chat')
    const activeProvider = workspace.providers.find((item) => item.id === activeProviderId)
    const usesDemoProvider = activeProvider?.origin === 'demo'
    const optimistic: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      projectId: activeProject.id,
      conversationId: conversation.id,
      role: 'user',
      content,
      status: 'completed',
      providerId: activeProviderId,
      model: activeModel,
      contextScope,
      contextReferences,
      origin: usesDemoProvider ? 'demo' : 'live',
      verificationStatus: usesDemoProvider ? 'demo' : 'unverified',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setWorkspace((current) => ({ ...current, messages: [...current.messages, optimistic] }))
    try {
      const result = await paperAgent.chat.start({
        projectId: activeProject.id,
        conversationId: conversation.id,
        content,
        providerId: activeProviderId,
        model: activeModel,
        contextScope,
        contextReferences,
      })
      setActiveRunId(result.runId)
      const persisted = await paperAgent.workspace.get()
      setWorkspace((current) => {
        const streamed = current.messages.find((item) => item.runId === result.runId)
        if (streamed) {
          const index = persisted.messages.findIndex((item) => item.runId === result.runId)
          if (index >= 0) {
            const persistedMessage = persisted.messages[index]
            if (streamed.content.length > persistedMessage.content.length) {
              persistedMessage.content = streamed.content
            }
            if ((streamed.reasoningContent?.length ?? 0) > (persistedMessage.reasoningContent?.length ?? 0)) {
              persistedMessage.reasoningContent = streamed.reasoningContent
            }
          }
        }
        return persisted
      })
      return true
    } catch (error) {
      setWorkspace((current) => ({ ...current, messages: current.messages.filter((item) => item.id !== optimistic.id) }))
      showToast(error instanceof Error ? error.message : '无法开始生成', 'error')
      return false
    }
  }

  const cancelRun = async () => {
    if (!activeRunId) return
    try {
      await paperAgent.chat.cancel(activeRunId)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '停止失败', 'error')
    }
  }

  return { sendMessage, cancelRun }
}
