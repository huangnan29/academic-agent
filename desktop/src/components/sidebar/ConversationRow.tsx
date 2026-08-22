// 侧栏项目树与平铺列表中的对话行。
import { GripVertical, MoreHorizontal, Pin } from 'lucide-react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { conversationDisplayTitle } from '../../lib/conversation'
import type {
  SidebarConversations,
  SidebarDragState,
  SidebarProject,
} from './types'

interface ConversationRowActions {
  onConversation: (projectId: string, conversationId: string) => void
  onOpenConversationMenu: (event: ReactMouseEvent, projectId: string, conversationId: string) => void
  onSetDragged: (dragged: SidebarDragState) => void
  onReorderConversations: (items: SidebarConversations, targetId: string) => void
}

export function ProjectConversationRow({
  conversation,
  project,
  selected,
  manualSort,
  projectConversations,
  ...actions
}: ConversationRowActions & {
  conversation: SidebarConversations[number]
  project: SidebarProject
  selected: boolean
  manualSort: boolean
  projectConversations: SidebarConversations
}) {
  const title = conversationDisplayTitle(conversation.title, project.title)
  return (
    <div
      className={`research-conversation-row${selected ? ' is-active' : ''}${conversation.archived ? ' is-archived' : ''}`}
      onContextMenu={(event) => actions.onOpenConversationMenu(event, project.id, conversation.id)}
    >
      <button
        type="button"
        className={`research-conversation${selected ? ' is-active' : ''}${manualSort ? ' is-draggable' : ''}`}
        onClick={() => actions.onConversation(project.id, conversation.id)}
        title={title}
        aria-current={selected ? 'page' : undefined}
        draggable={manualSort}
        onDragStart={(event) => { event.stopPropagation(); actions.onSetDragged({ kind: 'conversation', id: conversation.id }) }}
        onDragOver={(event) => { if (manualSort) event.preventDefault() }}
        onDrop={(event) => { event.stopPropagation(); actions.onReorderConversations(projectConversations, conversation.id) }}
      >
        {manualSort && <GripVertical size={12} className="conversation-drag-handle" aria-hidden="true" />}
        {conversation.unread && <span className="conversation-unread-dot" aria-label="未读" />}
        <span>{title}</span>
        {conversation.pinned && <Pin size={11} className="conversation-pinned-mark" aria-label="已置顶" />}
        <small aria-label={`${conversation.messageIds.length} 条消息`}>{conversation.messageIds.length || ''}</small>
      </button>
      <button
        type="button"
        className="conversation-more"
        aria-label={`管理对话：${title}`}
        title="对话操作"
        aria-haspopup="menu"
        onClick={(event) => actions.onOpenConversationMenu(event, project.id, conversation.id)}
      >
        <MoreHorizontal size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

export function FlatConversationRow({
  conversation,
  project,
  selected,
  manualSort,
  conversationItems,
  ...actions
}: ConversationRowActions & {
  conversation: SidebarConversations[number]
  project: SidebarProject
  selected: boolean
  manualSort: boolean
  conversationItems: SidebarConversations
}) {
  const title = conversationDisplayTitle(conversation.title, project.title)
  return (
    <div
      className={`flat-conversation-row${selected ? ' is-active' : ''}${conversation.archived ? ' is-archived' : ''}`}
      onContextMenu={(event) => actions.onOpenConversationMenu(event, project.id, conversation.id)}
    >
      <button
        type="button"
        className={`flat-conversation${selected ? ' is-active' : ''}${manualSort ? ' is-draggable' : ''}`}
        onClick={() => actions.onConversation(project.id, conversation.id)}
        draggable={manualSort}
        onDragStart={() => actions.onSetDragged({ kind: 'conversation', id: conversation.id })}
        onDragOver={(event) => { if (manualSort) event.preventDefault() }}
        onDrop={() => actions.onReorderConversations(conversationItems, conversation.id)}
      >
        {manualSort && <GripVertical size={12} className="conversation-drag-handle" aria-hidden="true" />}
        {conversation.unread && <span className="conversation-unread-dot" aria-label="未读" />}
        <span><strong>{title}</strong><small>{project.title}</small></span>
        {(conversation.pinned || project.pinned) && <Pin size={11} aria-label={conversation.pinned ? '对话已置顶' : '所属项目已置顶'} />}
      </button>
      <button
        type="button"
        className="conversation-more"
        aria-label={`管理对话：${title}`}
        title="对话操作"
        aria-haspopup="menu"
        onClick={(event) => actions.onOpenConversationMenu(event, project.id, conversation.id)}
      >
        <MoreHorizontal size={14} aria-hidden="true" />
      </button>
    </div>
  )
}
