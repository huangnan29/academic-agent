import { useEffect, useState } from 'react'
import type {
  Conversation,
  ConversationAccessMode,
  SystemPermissionKind,
  SystemPermissionSnapshot,
} from '../../shared/contracts'
import { paperAgent } from '../fallback'

type ShowToast = (message: string, tone?: 'success' | 'error') => void
type UpdateConversation = (input: { conversationId: string; accessMode: ConversationAccessMode }) => Promise<void>

export function usePermissionActions({
  conversation,
  updateConversation,
  showToast,
}: {
  conversation?: Conversation
  updateConversation: UpdateConversation
  showToast: ShowToast
}) {
  const [permissionCenterOpen, setPermissionCenterOpen] = useState(false)
  const [systemPermissions, setSystemPermissions] = useState<SystemPermissionSnapshot>()
  const [permissionBusy, setPermissionBusy] = useState(false)

  useEffect(() => {
    paperAgent.systemPermissions.get()
      .then(setSystemPermissions)
      .catch(() => undefined)
  }, [])

  const refreshSystemPermissions = async () => {
    setPermissionBusy(true)
    try {
      const next = await paperAgent.systemPermissions.get()
      setSystemPermissions(next)
      return next
    } catch (error) {
      showToast(error instanceof Error ? error.message : '无法读取 macOS 权限状态', 'error')
      throw error
    } finally {
      setPermissionBusy(false)
    }
  }

  const requestFullAccess = async () => {
    setPermissionCenterOpen(true)
    setPermissionBusy(true)
    try {
      const next = await paperAgent.systemPermissions.requestFullAccess()
      setSystemPermissions(next)
      if (next.platform === 'unsupported') {
        showToast('浏览器演示无法申请 macOS 权限，请使用桌面应用', 'error')
      } else if (next.fullAccessReady && conversation) {
        await updateConversation({ conversationId: conversation.id, accessMode: 'full' })
      } else {
        showToast('请在 macOS 系统设置完成必需授权，再返回重新检测', 'error')
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '申请 macOS 权限失败', 'error')
    } finally {
      setPermissionBusy(false)
    }
  }

  const requestConversationAccessMode = async (mode: ConversationAccessMode) => {
    if (!conversation) return
    if (mode === 'ask') {
      await updateConversation({ conversationId: conversation.id, accessMode: 'ask' })
      return
    }
    await requestFullAccess()
  }

  const openSystemPermissionSettings = async (kind: SystemPermissionKind) => {
    try {
      await paperAgent.systemPermissions.openSettings(kind)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '无法打开 macOS 系统设置', 'error')
    }
  }

  const enableFullAccess = async () => {
    if (!conversation) return
    const next = await refreshSystemPermissions()
    if (!next.fullAccessReady) {
      showToast('真实系统权限尚未满足，不能启用完全访问', 'error')
      return
    }
    await updateConversation({ conversationId: conversation.id, accessMode: 'full' })
    setPermissionCenterOpen(false)
  }

  const requestMicrophone = async () => {
    setPermissionBusy(true)
    try {
      const next = await paperAgent.systemPermissions.requestMicrophone()
      setSystemPermissions(next)
      return next
    } finally {
      setPermissionBusy(false)
    }
  }

  return {
    permissionCenterOpen,
    setPermissionCenterOpen,
    systemPermissions,
    permissionBusy,
    refreshSystemPermissions,
    requestFullAccess,
    requestConversationAccessMode,
    openSystemPermissionSettings,
    enableFullAccess,
    requestMicrophone,
  }
}
