import { useEffect, useState } from 'react'
import type { Conversation, ConversationUpdateInput } from '../../../shared/contracts'

export function useComposerModes({
  conversation,
  onUpdateConversation,
}: {
  conversation?: Conversation
  onUpdateConversation: (input: ConversationUpdateInput) => Promise<void>
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [goalOpen, setGoalOpen] = useState(false)
  const [goalDraft, setGoalDraft] = useState(conversation?.goal ?? '')
  const [updatingMode, setUpdatingMode] = useState(false)

  useEffect(() => {
    setGoalDraft(conversation?.goal ?? '')
    setGoalOpen(false)
    setAddMenuOpen(false)
  }, [conversation?.id, conversation?.goal])

  const togglePlanMode = async () => {
    if (!conversation || updatingMode) return
    setUpdatingMode(true)
    try {
      await onUpdateConversation({
        conversationId: conversation.id,
        planMode: !conversation.planMode,
      })
      setAddMenuOpen(false)
    } catch {
      // 上层统一显示错误提示。
    } finally {
      setUpdatingMode(false)
    }
  }

  const saveGoal = async () => {
    if (!conversation || updatingMode) return
    setUpdatingMode(true)
    try {
      await onUpdateConversation({ conversationId: conversation.id, goal: goalDraft })
      setGoalOpen(false)
    } catch {
      // 上层统一显示错误提示。
    } finally {
      setUpdatingMode(false)
    }
  }

  const openGoal = () => {
    setGoalDraft(conversation?.goal ?? '')
    setGoalOpen(true)
    setAddMenuOpen(false)
  }

  return {
    addMenuOpen,
    goalOpen,
    goalDraft,
    updatingMode,
    setGoalDraft,
    toggleAddMenu: () => setAddMenuOpen((current) => !current),
    closeAddMenu: () => setAddMenuOpen(false),
    showGoal: () => setGoalOpen(true),
    openGoal,
    closeGoal: () => setGoalOpen(false),
    clearGoal: () => setGoalDraft(''),
    togglePlanMode,
    saveGoal,
  }
}
