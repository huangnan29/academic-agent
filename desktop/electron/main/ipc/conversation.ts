import { BrowserWindow, clipboard, dialog } from 'electron'
import { IPC } from '../../../shared/ipc'
import { extractConversationAttachment } from '../attachments'
import { conversationUpdateSchema } from '../schemas'
import { assertId } from './common'
import { handle } from './runtime'
import type { IpcDependencies, RegisterIpcHandler } from './types'

export function registerConversationHandlers(
  dependencies: IpcDependencies,
  register: RegisterIpcHandler = handle,
): void {
  const { repository } = dependencies

  register(IPC.conversationCreate, async (_event, projectId: unknown) => {
    assertId(projectId, '项目')
    return repository.createConversation(projectId)
  })

  register(
    IPC.conversationSetActive,
    async (_event, projectId: unknown, conversationId: unknown) => {
      assertId(projectId, '项目')
      assertId(conversationId, '对话')
      return repository.setActiveConversation(projectId, conversationId)
    },
  )

  register(IPC.conversationUpdate, async (_event, payload: unknown) => {
    const input = conversationUpdateSchema.parse(payload)
    if (input.accessMode === 'full') {
      const permissions = await dependencies.systemPermissions.snapshot()
      if (!permissions.fullAccessReady) {
        throw new Error('尚未完成 macOS 辅助功能与完全磁盘访问授权。')
      }
    }
    return repository.updateConversation(input)
  })

  register(
    IPC.conversationMove,
    async (_event, conversationId: unknown, targetProjectId: unknown) => {
      assertId(conversationId, '对话')
      assertId(targetProjectId, '目标研究')
      return repository.moveConversation(conversationId, targetProjectId)
    },
  )

  register(IPC.conversationCopyId, async (_event, conversationId: unknown) => {
    assertId(conversationId, '对话')
    const conversation = repository.snapshot().conversations.find((item) => item.id === conversationId)
    if (!conversation) throw new Error('对话不存在或已经被移除。')
    clipboard.writeText(conversation.id)
  })

  register(IPC.conversationChooseAttachments, async (event, conversationId: unknown) => {
    assertId(conversationId, '对话')
    const snapshot = repository.snapshot()
    const conversation = snapshot.conversations.find((item) => item.id === conversationId)
    if (!conversation) throw new Error('对话不存在或已经被移除。')
    const project = snapshot.projects.find((item) => item.id === conversation.projectId)
    if (!project) throw new Error('对话所属研究不存在。')
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const options: Electron.OpenDialogOptions = {
      title: '添加到当前对话',
      buttonLabel: '添加',
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      message: '文本文件会在本机提取内容并加入当前对话上下文。',
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return snapshot
    if (result.filePaths.length > 10) throw new Error('每次最多添加 10 个文件或文件夹。')
    const attachments = await Promise.all(
      result.filePaths.map((selectedPath) => extractConversationAttachment(selectedPath, {
        projectId: project.id,
        conversationId: conversation.id,
        origin: project.origin,
        verificationStatus: project.verificationStatus,
      })),
    )
    return repository.addConversationAttachments(conversation.id, attachments)
  })

  register(IPC.conversationRemoveAttachment, async (_event, attachmentId: unknown) => {
    assertId(attachmentId, '附件')
    return repository.removeConversationAttachment(attachmentId)
  })
}
