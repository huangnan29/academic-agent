// 对话右键菜单与“移至研究”子菜单。
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Copy,
  Folder,
  FolderInput,
  FolderOpen,
  Mail,
  MailOpen,
  MessageSquarePlus,
  PencilLine,
  Pin,
  PinOff,
} from 'lucide-react'
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import { conversationDisplayTitle } from '../../lib/conversation'
import type { Conversation, ConversationUpdateInput } from '../../../shared/contracts'
import type {
  ConversationMenuState,
  SidebarProject,
} from './types'

export function ConversationContextMenu({
  menu,
  conversation,
  project,
  moveTargets,
  moveMenuOpen,
  menuRef,
  onToggleMoveMenu,
  onMenuKeyDown,
  runConversationAction,
  beginRename,
  onUpdateConversation,
  onMoveConversation,
  onRevealProject,
  onCopyConversationId,
  onCreateConversation,
}: {
  menu: ConversationMenuState
  conversation: Conversation
  project: SidebarProject
  moveTargets: SidebarProject[]
  moveMenuOpen: boolean
  menuRef: RefObject<HTMLDivElement | null>
  onToggleMoveMenu: () => void
  onMenuKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
  runConversationAction: (action: () => Promise<void>) => Promise<void>
  beginRename: (conversation: Conversation) => void
  onUpdateConversation: (input: ConversationUpdateInput) => Promise<void>
  onMoveConversation: (conversationId: string, targetProjectId: string) => Promise<void>
  onRevealProject: (projectId: string) => void
  onCopyConversationId: (conversationId: string) => Promise<void>
  onCreateConversation: (projectId: string) => void
}) {
  const title = conversationDisplayTitle(conversation.title, project.title)
  return (
    <div
      ref={menuRef}
      className="conversation-context-menu"
      role="menu"
      aria-label={`${title}的对话操作`}
      style={{ left: menu.x, top: menu.y }}
      onKeyDown={onMenuKeyDown}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => runConversationAction(() => onUpdateConversation({
          conversationId: conversation.id,
          pinned: !conversation.pinned,
        }))}
      >
        {conversation.pinned ? <PinOff size={16} /> : <Pin size={16} />}
        {conversation.pinned ? '取消置顶聊天' : '置顶聊天'}
      </button>
      <div className="conversation-move-entry">
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={moveMenuOpen}
          disabled={moveTargets.length === 0}
          onClick={onToggleMoveMenu}
        >
          <FolderInput size={16} />
          移至研究
          <ChevronRight size={15} className="menu-trailing-icon" />
        </button>
        {moveMenuOpen && (
          <div className="conversation-move-submenu" role="menu" aria-label="选择目标研究">
            {moveTargets.map((targetProject) => (
              <button
                key={targetProject.id}
                type="button"
                role="menuitem"
                onClick={() => runConversationAction(() => onMoveConversation(conversation.id, targetProject.id))}
              >
                <Folder size={15} />
                <span>{targetProject.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="button" role="menuitem" onClick={() => beginRename(conversation)}>
        <PencilLine size={16} />
        重命名聊天
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => runConversationAction(() => onUpdateConversation({
          conversationId: conversation.id,
          archived: !conversation.archived,
        }))}
      >
        {conversation.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
        {conversation.archived ? '取消归档聊天' : '归档聊天'}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => runConversationAction(() => onUpdateConversation({
          conversationId: conversation.id,
          unread: !conversation.unread,
        }))}
      >
        {conversation.unread ? <MailOpen size={16} /> : <Mail size={16} />}
        {conversation.unread ? '标记为已读' : '标记为未读'}
      </button>
      <div className="menu-separator" />
      <button type="button" role="menuitem" onClick={() => runConversationAction(async () => onRevealProject(project.id))}>
        <FolderOpen size={16} />
        在 Finder 中显示
      </button>
      <button type="button" role="menuitem" onClick={() => runConversationAction(() => onCopyConversationId(conversation.id))}>
        <Copy size={16} />
        复制会话 ID
      </button>
      <div className="menu-separator" />
      <button type="button" role="menuitem" onClick={() => runConversationAction(async () => onCreateConversation(project.id))}>
        <MessageSquarePlus size={16} />
        在新对话中继续
      </button>
    </div>
  )
}
