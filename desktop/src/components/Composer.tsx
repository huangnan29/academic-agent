// 底部输入区：斜杠菜单、附件、语音输入、模型与权限选择；从 App.tsx 抽出。
import {
  ArrowUp,
  Check,
  FolderOpen,
  Lightbulb,
  LoaderCircle,
  Mic,
  Paperclip,
  Plus,
  PlugZap,
  Sparkles,
  Square,
  Target,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChatContextReference,
  Conversation,
  ConversationAccessMode,
  ConversationAttachment,
  ConversationUpdateInput,
  McpServerConfig,
  ProviderProfile,
  SkillDefinition,
} from '../../shared/contracts'
import { paperAgent } from '../fallback'
import { AccessPicker } from './AccessPicker'
import { IconButton } from './common'
import { ModelPicker } from './ModelPicker'

export function Composer({
  providers,
  activeProviderId,
  activeModel,
  conversation,
  attachments,
  skills,
  mcpServers,
  running,
  contextLabel,
  onSelectModel,
  onSend,
  onCancel,
  onSettings,
  onUpdateConversation,
  onChooseAttachments,
  onRemoveAttachment,
  onRequestAccessMode,
  onManagePermissions,
  onToast,
}: {
  providers: ProviderProfile[]
  activeProviderId?: string
  activeModel?: string
  conversation?: Conversation
  attachments: ConversationAttachment[]
  skills: SkillDefinition[]
  mcpServers: McpServerConfig[]
  running: boolean
  contextLabel: string
  onSelectModel: (providerId: string, model: string) => void
  onSend: (content: string, contextReferences: ChatContextReference[]) => Promise<boolean>
  onCancel: () => void
  onSettings: () => void
  onUpdateConversation: (input: ConversationUpdateInput) => Promise<void>
  onChooseAttachments: () => Promise<void>
  onRemoveAttachment: (attachmentId: string) => Promise<void>
  onRequestAccessMode: (mode: ConversationAccessMode) => Promise<void>
  onManagePermissions: () => void
  onToast: (message: string, tone?: 'success' | 'error') => void
}) {
  const [value, setValue] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const [selectedReferences, setSelectedReferences] = useState<ChatContextReference[]>([])
  const [slashSelection, setSlashSelection] = useState(0)
  const [slashDismissedValue, setSlashDismissedValue] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [goalOpen, setGoalOpen] = useState(false)
  const [goalDraft, setGoalDraft] = useState(conversation?.goal ?? '')
  const [updatingMode, setUpdatingMode] = useState(false)
  const composingRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const speechSessionRef = useRef<{
    sessionId?: string
    baseValue: string
    insertionPoint: number
  } | undefined>(undefined)
  const interactionLocked = running || submitting
  const accessMode: ConversationAccessMode = conversation?.accessMode === 'full' ? 'full' : 'ask'
  const [speechActive, setSpeechActive] = useState(false)
  const [speechRequesting, setSpeechRequesting] = useState(false)

  type SlashItem = {
    key: string
    label: string
    description: string
    searchText: string
    reference: ChatContextReference
    kind: 'skill' | 'mcp-tool'
    status?: McpServerConfig['status']
    stateLabel?: string
  }

  const slashItems = useMemo<SlashItem[]>(() => [
    ...skills
      .filter((skill) => skill.enabled)
      .map((skill) => ({
        key: `skill:${skill.id}`,
        label: skill.name,
        description: skill.description || '应用内 Skill',
        searchText: `${skill.name} ${skill.description}`.toLocaleLowerCase(),
        reference: { kind: 'skill' as const, skillId: skill.id },
        kind: 'skill' as const,
      })),
    ...mcpServers
      .filter((server) => server.enabled)
      .flatMap((server) => server.tools.map((tool) => {
        const requiredFields = tool.inputSchema?.required
        const connectionLabel = server.status === 'failed'
          ? '连接失败'
          : server.status === 'connecting'
            ? '正在连接'
            : server.status === 'connected'
              ? Array.isArray(requiredFields)
                ? requiredFields.length > 0 ? '需参数' : '可直接调用'
                : '输入参数'
              : '按需连接'
        return {
          key: `mcp-tool:${server.id}:${tool.name}`,
          label: `/${tool.name}`,
          description: `${server.name}${tool.description ? ` · ${tool.description}` : ''}`,
          searchText: `${tool.name} ${server.name} ${tool.description ?? ''}`.toLocaleLowerCase(),
          reference: { kind: 'mcp-tool' as const, serverId: server.id, toolName: tool.name },
          kind: 'mcp-tool' as const,
          status: server.status,
          stateLabel: connectionLabel,
        }
      })),
  ], [mcpServers, skills])

  const slashMatch = useMemo(() => {
    const beforeCursor = value.slice(0, cursorPosition)
    const match = /(?:^|\s)\/([^\s/]*)$/.exec(beforeCursor)
    if (!match) return undefined
    const slashIndex = match.index + (match[0].startsWith('/') ? 0 : 1)
    let tokenEnd = cursorPosition
    while (tokenEnd < value.length && !/\s/.test(value[tokenEnd])) tokenEnd += 1
    return { query: match[1], slashIndex, tokenEnd }
  }, [cursorPosition, value])

  const filteredSlashItems = useMemo(() => {
    const query = slashMatch?.query.trim().toLocaleLowerCase() ?? ''
    const matches = query ? slashItems.filter((item) => item.searchText.includes(query)) : slashItems
    return matches.slice(0, 12)
  }, [slashItems, slashMatch?.query])
  const slashMenuOpen = Boolean(slashMatch && slashDismissedValue !== value && !interactionLocked)

  const referenceKey = (reference: ChatContextReference) => {
    if (reference.kind === 'skill') return `skill:${reference.skillId}`
    if (reference.kind === 'mcp-tool') return `mcp-tool:${reference.serverId}:${reference.toolName}`
    return `mcp:${reference.serverId}`
  }

  const referenceLabel = (reference: ChatContextReference) => {
    const item = slashItems.find((candidate) => candidate.key === referenceKey(reference))
    if (item && reference.kind === 'mcp-tool') {
      const server = mcpServers.find((candidate) => candidate.id === reference.serverId)
      return `${item.label} · ${server?.name ?? 'MCP'}`
    }
    if (item) return item.label
    if (reference.kind === 'skill') return '已选择的 Skill'
    if (reference.kind === 'mcp-tool') {
      const server = mcpServers.find((candidate) => candidate.id === reference.serverId)
      return `/${reference.toolName} · ${server?.name ?? 'MCP'}`
    }
    return mcpServers.find((candidate) => candidate.id === reference.serverId)?.name ?? '已选择的 MCP'
  }

  const selectedMcpToolPlaceholder = useMemo(() => {
    const reference = [...selectedReferences].reverse().find((candidate) => candidate.kind === 'mcp-tool')
    if (!reference || reference.kind !== 'mcp-tool') return undefined
    const server = mcpServers.find((candidate) => candidate.id === reference.serverId)
    const tool = server?.tools.find((candidate) => candidate.name === reference.toolName)
    const requiredFields = tool?.inputSchema?.required
    return Array.isArray(requiredFields) && requiredFields.includes('query')
      ? `输入 /${reference.toolName} 的检索词…`
      : `输入 /${reference.toolName} 的参数或检索词…`
  }, [mcpServers, selectedReferences])

  const zeroArgumentToolReference = useMemo(() => selectedReferences.find((reference) => {
    if (reference.kind !== 'mcp-tool') return false
    const server = mcpServers.find((candidate) => candidate.id === reference.serverId)
    const tool = server?.tools.find((candidate) => candidate.name === reference.toolName)
    return Array.isArray(tool?.inputSchema?.required) && tool.inputSchema.required.length === 0
  }), [mcpServers, selectedReferences])
  const canSend = Boolean((value.trim() || zeroArgumentToolReference) && activeProviderId && activeModel && !interactionLocked)

  const stopSpeech = () => {
    const sessionId = speechSessionRef.current?.sessionId
    speechSessionRef.current = undefined
    setSpeechActive(false)
    if (sessionId) void paperAgent.voice.stop(sessionId).catch(() => undefined)
  }

  const startSpeech = async () => {
    if (interactionLocked || speechRequesting || speechActive) {
      if (speechActive) stopSpeech()
      return
    }
    setSpeechRequesting(true)
    try {
      const permission = await paperAgent.systemPermissions.requestMicrophone()
      if (permission.microphone !== 'granted') {
        onToast(
          permission.platform === 'unsupported'
            ? '浏览器演示无法申请麦克风权限，请在桌面应用中使用。'
            : '麦克风权限未授予，语音输入没有启动。请在系统设置中允许学术 Agent 使用麦克风。',
          'error',
        )
        return
      }

      const textarea = textareaRef.current
      const insertionPoint = textarea?.selectionStart ?? cursorPosition
      const session: NonNullable<typeof speechSessionRef.current> = {
        sessionId: undefined,
        baseValue: value,
        insertionPoint: Math.max(0, Math.min(insertionPoint, value.length)),
      }
      speechSessionRef.current = session
      const started = await paperAgent.voice.start()
      if (speechSessionRef.current !== session) {
        await paperAgent.voice.stop(started.sessionId)
        return
      }
      session.sessionId = started.sessionId
      setSpeechActive(true)
      requestAnimationFrame(() => textareaRef.current?.focus())
    } catch (error) {
      speechSessionRef.current = undefined
      setSpeechActive(false)
      onToast(error instanceof Error ? error.message : '无法启动语音识别，请重试。', 'error')
    } finally {
      setSpeechRequesting(false)
    }
  }

  useEffect(() => paperAgent.voice.onEvent((event) => {
    const session = speechSessionRef.current
    if (!session) return
    if (session.sessionId && session.sessionId !== event.sessionId) return
    if (!session.sessionId) session.sessionId = event.sessionId

    if (event.type === 'started') {
      setSpeechActive(true)
      return
    }
    if (event.type === 'result') {
      const nextValue = `${session.baseValue.slice(0, session.insertionPoint)}${event.transcript}${session.baseValue.slice(session.insertionPoint)}`
      const nextCursor = session.insertionPoint + event.transcript.length
      setValue(nextValue)
      setCursorPosition(nextCursor)
      requestAnimationFrame(() => {
        if (document.activeElement !== textareaRef.current) return
        textareaRef.current?.setSelectionRange(nextCursor, nextCursor)
      })
      return
    }
    speechSessionRef.current = undefined
    setSpeechActive(false)
    if (event.type === 'error') onToast(event.message, 'error')
  }), [onToast])

  useEffect(() => {
    if (interactionLocked && speechActive) stopSpeech()
  }, [interactionLocked, speechActive])

  useEffect(() => {
    setGoalDraft(conversation?.goal ?? '')
    setGoalOpen(false)
    setAddMenuOpen(false)
  }, [conversation?.id, conversation?.goal])

  useEffect(() => {
    stopSpeech()
    setValue('')
    setCursorPosition(0)
    setSelectedReferences([])
    setSlashDismissedValue(undefined)
  }, [conversation?.id])

  useEffect(() => () => stopSpeech(), [])

  useEffect(() => {
    setSlashSelection(0)
  }, [slashMatch?.query, filteredSlashItems.length])

  useEffect(() => {
    if (!slashMenuOpen) return
    document.getElementById(`composer-slash-option-${slashSelection}`)?.scrollIntoView({ block: 'nearest' })
  }, [slashMenuOpen, slashSelection])

  useEffect(() => {
    if (!addMenuOpen) return
    const close = (event: PointerEvent) => {
      if (!addMenuRef.current?.contains(event.target as Node)) setAddMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAddMenuOpen(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [addMenuOpen])

  const removeSlashQuery = () => {
    if (!slashMatch) return
    const nextValue = `${value.slice(0, slashMatch.slashIndex)}${value.slice(slashMatch.tokenEnd)}`
    const nextCursor = slashMatch.slashIndex
    setValue(nextValue)
    setCursorPosition(nextCursor)
    setSlashDismissedValue(undefined)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const selectSlashItem = (item: SlashItem) => {
    const exists = selectedReferences.some((reference) => referenceKey(reference) === item.key)
    const selectedToolCount = selectedReferences.filter((reference) => reference.kind === 'mcp-tool').length
    if (!exists && item.kind === 'mcp-tool' && selectedToolCount >= 3) return
    if (!exists && selectedReferences.length >= 12) return
    if (!exists) setSelectedReferences((current) => [...current, item.reference])
    removeSlashQuery()
  }

  const submit = async () => {
    if (!canSend) return
    const content = value.trim() || (zeroArgumentToolReference?.kind === 'mcp-tool'
      ? `/${zeroArgumentToolReference.toolName}`
      : '')
    const contextReferences = [...selectedReferences]
    stopSpeech()
    setValue('')
    setCursorPosition(0)
    setSlashDismissedValue(undefined)
    setSubmitting(true)
    try {
      const sent = await onSend(content, contextReferences)
      if (sent) {
        setSelectedReferences([])
      } else {
        setValue(content)
        setCursorPosition(content.length)
        requestAnimationFrame(() => {
          textareaRef.current?.focus()
          textareaRef.current?.setSelectionRange(content.length, content.length)
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

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

  return (
    <div className="composer-wrap">
      <div className="composer">
        {slashMenuOpen && (
          <div className="composer-slash-menu" id="composer-slash-menu" role="listbox" aria-label="添加 Skill 或 MCP 工具">
            <div className="composer-slash-header">
              <span>添加到本次对话</span>
              <kbd>/</kbd>
            </div>
            {filteredSlashItems.length === 0 ? (
              <div className="composer-slash-empty">没有匹配的已启用 Skill 或 MCP 工具</div>
            ) : (
              <div className="composer-slash-options">
                {(['skill', 'mcp-tool'] as const).map((kind) => {
                  const group = filteredSlashItems.filter((item) => item.kind === kind)
                  if (group.length === 0) return null
                  return (
                    <div className="composer-slash-group" key={kind} role="group" aria-label={kind === 'skill' ? 'Skills' : 'MCP 工具'}>
                      <span className="composer-slash-group-label">{kind === 'skill' ? 'Skills' : 'MCP 工具'}</span>
                      {group.map((item) => {
                        const index = filteredSlashItems.findIndex((candidate) => candidate.key === item.key)
                        const selected = index === slashSelection
                        const alreadyAdded = selectedReferences.some((reference) => referenceKey(reference) === item.key)
                        const selectedToolCount = selectedReferences.filter((reference) => reference.kind === 'mcp-tool').length
                        const unavailable = !alreadyAdded && (
                          selectedReferences.length >= 12
                          || (item.kind === 'mcp-tool' && selectedToolCount >= 3)
                        )
                        return (
                          <button
                            type="button"
                            id={`composer-slash-option-${index}`}
                            className={selected ? 'is-selected' : ''}
                            role="option"
                            aria-selected={selected}
                            aria-disabled={unavailable}
                            key={item.key}
                            onMouseEnter={() => setSlashSelection(index)}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectSlashItem(item)}
                          >
                            <span className={`composer-slash-icon is-${item.kind}`} aria-hidden="true">
                              {item.kind === 'skill' ? <Sparkles size={15} /> : <PlugZap size={15} />}
                            </span>
                            <span className="composer-slash-copy">
                              <strong>{item.label}</strong>
                              <small>{item.description}</small>
                            </span>
                            {alreadyAdded ? (
                              <span className="composer-slash-state"><Check size={13} /> 已添加</span>
                            ) : item.kind === 'mcp-tool' ? (
                              <span className={`composer-slash-state is-${item.status}${item.stateLabel === '需参数' || item.stateLabel === '输入参数' ? ' is-requires-input' : ''}`}>{item.stateLabel}</span>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
            <div className="composer-slash-footer">
              <span>{selectedReferences.length}/12 已添加</span>
              <span><kbd>↑↓</kbd> 选择 <kbd>Enter</kbd> 添加 <kbd>Esc</kbd> 关闭</span>
            </div>
          </div>
        )}
        {attachments.length > 0 && (
          <div className="composer-attachments" aria-label="当前对话附件">
            {attachments.map((attachment) => (
              <span className={`composer-attachment${attachment.warning ? ' has-warning' : ''}`} key={attachment.id} title={attachment.warning ?? attachment.path}>
                {attachment.kind === 'folder' ? <FolderOpen size={14} /> : <Paperclip size={14} />}
                <span>{attachment.name}</span>
                <button type="button" onClick={() => onRemoveAttachment(attachment.id)} aria-label={`移除附件 ${attachment.name}`}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        {selectedReferences.length > 0 && (
          <div className="composer-context-references" aria-label="本次对话附加能力">
            {selectedReferences.map((reference) => (
              <span className={`composer-reference-chip is-${reference.kind}`} key={referenceKey(reference)}>
                {reference.kind === 'skill' ? <Sparkles size={13} /> : <PlugZap size={13} />}
                <span>{referenceLabel(reference)}</span>
                <button
                  type="button"
                  onClick={() => setSelectedReferences((current) => current.filter((item) => referenceKey(item) !== referenceKey(reference)))}
                  aria-label={`移除 ${referenceLabel(reference)}`}
                  disabled={interactionLocked}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => {
            // 用户开始手动编辑时结束本轮识别，避免后续中间结果覆盖刚输入的内容。
            if (speechActive) stopSpeech()
            setValue(event.target.value)
            setCursorPosition(event.target.selectionStart)
            setSlashDismissedValue(undefined)
          }}
          onSelect={(event) => setCursorPosition(event.currentTarget.selectionStart)}
          onInput={(event) => {
            event.currentTarget.style.height = 'auto'
            event.currentTarget.style.height = `${Math.min(180, Math.max(82, event.currentTarget.scrollHeight))}px`
          }}
          onCompositionStart={() => {
            composingRef.current = true
          }}
          onCompositionEnd={() => {
            composingRef.current = false
          }}
          onKeyDown={(event) => {
            if (composingRef.current) return
            if (slashMenuOpen) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                if (filteredSlashItems.length > 0) {
                  const direction = event.key === 'ArrowDown' ? 1 : -1
                  setSlashSelection((current) => (current + direction + filteredSlashItems.length) % filteredSlashItems.length)
                }
                return
              }
              if ((event.key === 'Enter' || event.key === 'Tab') && filteredSlashItems[slashSelection]) {
                event.preventDefault()
                selectSlashItem(filteredSlashItems[slashSelection])
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setSlashDismissedValue(value)
                return
              }
            }
            if (event.key === 'Enter' && !event.shiftKey && !composingRef.current) {
              event.preventDefault()
              void submit()
            }
          }}
          placeholder={selectedMcpToolPlaceholder ?? '描述研究任务，或围绕当前文稿继续对话…'}
          aria-label="向论文研究 Agent 提问"
          disabled={interactionLocked}
          aria-expanded={slashMenuOpen}
          aria-haspopup="listbox"
          aria-controls={slashMenuOpen ? 'composer-slash-menu' : undefined}
          aria-activedescendant={slashMenuOpen && filteredSlashItems[slashSelection] ? `composer-slash-option-${slashSelection}` : undefined}
          aria-autocomplete="list"
        />
        <div className="composer-toolbar">
          <div className="composer-tools">
            <div className="composer-add" ref={addMenuRef}>
              <IconButton
                icon={Plus}
                label="添加"
                active={addMenuOpen}
                onClick={() => setAddMenuOpen((current) => !current)}
              />
              {addMenuOpen && (
                <div className="composer-add-menu" role="menu">
                  <span className="composer-menu-heading">添加</span>
                  <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); void onChooseAttachments() }}>
                    <Paperclip size={17} />
                    <span><strong>文件和文件夹</strong><small>加入当前对话上下文</small></span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setGoalDraft(conversation?.goal ?? ''); setGoalOpen(true); setAddMenuOpen(false) }} disabled={!conversation}>
                    <Target size={17} />
                    <span><strong>目标</strong><small>{conversation?.goal ? '修改持续追踪的目标' : '设置要持续追踪的目标'}</small></span>
                  </button>
                  <button type="button" role="menuitemcheckbox" aria-checked={conversation?.planMode === true} onClick={() => void togglePlanMode()} disabled={!conversation || updatingMode}>
                    <Lightbulb size={17} />
                    <span><strong>计划模式</strong><small>{conversation?.planMode ? '已开启，点击关闭' : '先分析并形成步骤'}</small></span>
                    {conversation?.planMode && <Check size={15} />}
                  </button>
                </div>
              )}
            </div>
            <AccessPicker
              mode={accessMode}
              disabled={!conversation || updatingMode}
              onSelect={onRequestAccessMode}
              onManage={onManagePermissions}
            />
            <span className="composer-context-chip">{contextLabel}</span>
            {conversation?.planMode && <span className="composer-mode-chip"><Lightbulb size={13} /> 计划</span>}
            {conversation?.goal && <button type="button" className="composer-goal-chip" onClick={() => setGoalOpen(true)} title={conversation.goal}><Target size={13} /> 目标</button>}
          </div>
          <div className="composer-status">
            <ModelPicker
              providers={providers}
              activeProviderId={activeProviderId}
              activeModel={activeModel}
              open={pickerOpen}
              onToggle={() => setPickerOpen((current) => !current)}
              onSelect={(providerId, model) => {
                onSelectModel(providerId, model)
                setPickerOpen(false)
              }}
              onSettings={() => {
                setPickerOpen(false)
                onSettings()
              }}
            />
            <button
              type="button"
              className={`microphone-button${speechActive ? ' is-active' : ''}`}
              onClick={() => { void (speechActive ? stopSpeech() : startSpeech()) }}
              disabled={interactionLocked || speechRequesting}
              aria-pressed={speechActive}
              aria-label={speechActive ? '停止语音输入' : '开始语音输入'}
              title={speechActive ? '停止语音输入' : '语音输入'}
            >
              {speechRequesting ? <LoaderCircle size={17} className="spin" /> : <Mic size={17} />}
            </button>
            {running ? (
              <button type="button" className="send-button is-stop" onClick={onCancel} aria-label="停止生成">
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
                <button type="button" className="send-button" onClick={() => void submit()} disabled={!canSend} aria-label="发送消息">
                  <ArrowUp size={18} />
                </button>
            )}
          </div>
        </div>
      </div>
      {goalOpen && (
        <div className="composer-goal-dialog" role="dialog" aria-modal="true" aria-label="设置对话目标">
          <div>
            <Target size={18} />
            <span><strong>对话目标</strong><small>保存后会持续加入当前对话的模型上下文。</small></span>
            <IconButton icon={X} label="关闭目标设置" onClick={() => setGoalOpen(false)} />
          </div>
          <textarea value={goalDraft} onChange={(event) => setGoalDraft(event.target.value)} maxLength={2000} placeholder="例如：完成一篇证据可追溯的中文教育学论文，并逐章核验引用。" autoFocus />
          <div className="composer-goal-actions">
            <span>{goalDraft.length}/2000</span>
            <button type="button" className="secondary-button" onClick={() => setGoalDraft('')} disabled={updatingMode}>清除</button>
            <button type="button" className="primary-button compact" onClick={() => void saveGoal()} disabled={updatingMode}>保存目标</button>
          </div>
        </div>
      )}
      {!activeProviderId && (
        <button type="button" className="composer-hint" onClick={onSettings}>
          尚未配置可用模型，前往设置后即可开始生成
        </button>
      )}
    </div>
  )
}
