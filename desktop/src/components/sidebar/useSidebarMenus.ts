// 侧栏各级菜单、重命名弹窗与菜单键盘行为。
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import type { Conversation, ConversationUpdateInput } from '../../../shared/contracts'
import { conversationDisplayTitle } from '../../lib/conversation'
import type { ConversationMenuState, SidebarDragState, SidebarProject } from './types'

interface UseSidebarMenusOptions {
  projectById: Map<string, SidebarProject>
  onUpdateConversation: (input: ConversationUpdateInput) => Promise<void>
}

export function useSidebarMenus({ projectById, onUpdateConversation }: UseSidebarMenusOptions) {
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string>()
  const [organizeMenuOpen, setOrganizeMenuOpen] = useState(false)
  const [dragged, setDragged] = useState<SidebarDragState>()
  const [conversationMenu, setConversationMenu] = useState<ConversationMenuState>()
  const [moveMenuOpen, setMoveMenuOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<Conversation>()
  const [renameDraft, setRenameDraft] = useState('')
  const [renaming, setRenaming] = useState(false)
  const projectMenuRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const projectMenuTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const organizeMenuRef = useRef<HTMLDivElement | null>(null)
  const organizeTriggerRef = useRef<HTMLButtonElement | null>(null)
  const conversationMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!openProjectMenuId) return
    projectMenuRefs.current[openProjectMenuId]?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [openProjectMenuId])

  useEffect(() => {
    if (!organizeMenuOpen) return
    organizeMenuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [organizeMenuOpen])

  useEffect(() => {
    if (!openProjectMenuId && !organizeMenuOpen) return
    const closeMenu = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (openProjectMenuId) projectMenuTriggerRefs.current[openProjectMenuId]?.focus()
      if (organizeMenuOpen) organizeTriggerRef.current?.focus()
      setOpenProjectMenuId(undefined)
      setOrganizeMenuOpen(false)
    }
    document.addEventListener('keydown', closeMenu)
    return () => document.removeEventListener('keydown', closeMenu)
  }, [openProjectMenuId, organizeMenuOpen])

  useEffect(() => {
    if (!conversationMenu) return
    const close = (event: MouseEvent) => {
      if (!conversationMenuRef.current?.contains(event.target as Node)) {
        setConversationMenu(undefined)
        setMoveMenuOpen(false)
      }
    }
    const closeWithKeyboard = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConversationMenu(undefined)
        setMoveMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', closeWithKeyboard)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', closeWithKeyboard)
    }
  }, [conversationMenu])

  const openConversationMenu = (
    event: ReactMouseEvent,
    projectId: string,
    conversationId: string,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    setOpenProjectMenuId(undefined)
    setOrganizeMenuOpen(false)
    setMoveMenuOpen(false)
    setConversationMenu({
      projectId,
      conversationId,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 244)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 390)),
    })
  }

  const runConversationAction = async (action: () => Promise<void>) => {
    setConversationMenu(undefined)
    setMoveMenuOpen(false)
    try {
      await action()
    } catch {
      // 具体错误已经由上层操作统一显示为提示。
    }
  }

  const beginRename = (conversation: Conversation) => {
    setConversationMenu(undefined)
    setMoveMenuOpen(false)
    setRenameTarget(conversation)
    setRenameDraft(conversationDisplayTitle(conversation.title, projectById.get(conversation.projectId)?.title ?? ''))
  }

  const submitRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!renameTarget || !renameDraft.trim()) return
    setRenaming(true)
    try {
      await onUpdateConversation({ conversationId: renameTarget.id, title: renameDraft.trim() })
      setRenameTarget(undefined)
    } catch {
      // 保留输入框，用户可直接修正后重试。
    } finally {
      setRenaming(false)
    }
  }

  const menuKeyNavigation = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return
    event.preventDefault()
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]')]
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const direction = event.key === 'ArrowDown' ? 1 : -1
    buttons[(currentIndex + direction + buttons.length) % buttons.length]?.focus()
  }

  return {
    openProjectMenuId,
    setOpenProjectMenuId,
    organizeMenuOpen,
    setOrganizeMenuOpen,
    dragged,
    setDragged,
    conversationMenu,
    setConversationMenu,
    moveMenuOpen,
    setMoveMenuOpen,
    renameTarget,
    setRenameTarget,
    renameDraft,
    setRenameDraft,
    renaming,
    openConversationMenu,
    runConversationAction,
    beginRename,
    submitRename,
    menuKeyNavigation,
    projectMenuRefs,
    projectMenuTriggerRefs,
    organizeMenuRef,
    organizeTriggerRef,
    conversationMenuRef,
  }
}
