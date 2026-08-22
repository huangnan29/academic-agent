// 底部输入区：斜杠菜单、附件、语音输入、模型与权限选择；从 App.tsx 抽出。
import {
  ArrowUp,
  FolderOpen,
  Lightbulb,
  LoaderCircle,
  Mic,
  Paperclip,
  Square,
  Target,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
import { AccessPicker } from './AccessPicker'
import { ModelPicker } from './ModelPicker'
import { ComposerAddMenu } from './composer/ComposerAddMenu'
import { GoalDialog } from './composer/GoalDialog'
import { ContextReferences, SlashMenu, useSlashMenu } from './composer/slash'
import { useComposerModes } from './composer/useComposerModes'
import { useVoiceInput } from './composer/useVoiceInput'
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
  const [submitting, setSubmitting] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const composingRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const interactionLocked = running || submitting
  const accessMode: ConversationAccessMode = conversation?.accessMode === 'full' ? 'full' : 'ask'
  const {
    selectedReferences,
    slashItems,
    filteredSlashItems,
    slashMenuOpen,
    slashSelection,
    selectedMcpToolPlaceholder,
    zeroArgumentToolReference,
    setSlashSelection,
    selectSlashItem,
    dismissSlashMenu,
    clearSlashDismissal,
    clearSelectedReferences,
    removeReference,
    reset: resetSlashMenu,
  } = useSlashMenu({
    value,
    cursorPosition,
    skills,
    mcpServers,
    interactionLocked,
    textareaRef,
    setValue,
    setCursorPosition,
  })
  const { speechActive, speechRequesting, startSpeech, stopSpeech } = useVoiceInput({
    interactionLocked,
    value,
    cursorPosition,
    textareaRef,
    setValue,
    setCursorPosition,
    onToast,
  })
  const {
    addMenuOpen,
    goalOpen,
    goalDraft,
    updatingMode,
    setGoalDraft,
    toggleAddMenu,
    closeAddMenu,
    showGoal,
    openGoal,
    closeGoal,
    clearGoal,
    togglePlanMode,
    saveGoal,
  } = useComposerModes({ conversation, onUpdateConversation })
  const canSend = Boolean((value.trim() || zeroArgumentToolReference) && activeProviderId && activeModel && !interactionLocked)
  // 切换对话时，输入内容、语音会话和本轮 Slash 引用都必须隔离。
  useEffect(() => {
    stopSpeech()
    setValue('')
    setCursorPosition(0)
    resetSlashMenu()
  }, [conversation?.id])
  const submit = async () => {
    if (!canSend) return
    const content = value.trim() || (zeroArgumentToolReference?.kind === 'mcp-tool'
      ? `/${zeroArgumentToolReference.toolName}`
      : '')
    const contextReferences = [...selectedReferences]
    stopSpeech()
    setValue('')
    setCursorPosition(0)
    clearSlashDismissal()
    setSubmitting(true)
    try {
      const sent = await onSend(content, contextReferences)
      if (sent) {
        clearSelectedReferences()
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
  return (
    <div className="composer-wrap">
      <div className="composer">
      {slashMenuOpen && (
        <SlashMenu
          items={filteredSlashItems}
          slashSelection={slashSelection}
          selectedReferences={selectedReferences}
          onMouseEnter={setSlashSelection}
          onSelect={selectSlashItem}
        />
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
      <ContextReferences
        references={selectedReferences}
        slashItems={slashItems}
        mcpServers={mcpServers}
        interactionLocked={interactionLocked}
        onRemove={removeReference}
      />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          // 用户开始手动编辑时结束本轮识别，避免后续中间结果覆盖刚输入的内容。
          if (speechActive) stopSpeech()
          setValue(event.target.value)
          setCursorPosition(event.target.selectionStart)
          clearSlashDismissal()
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
              dismissSlashMenu()
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
          <ComposerAddMenu
            conversation={conversation}
            open={addMenuOpen}
            updatingMode={updatingMode}
            onToggle={toggleAddMenu}
            onClose={closeAddMenu}
            onChooseAttachments={onChooseAttachments}
            onOpenGoal={openGoal}
            onTogglePlanMode={togglePlanMode}
          />
          <AccessPicker
            mode={accessMode}
            disabled={!conversation || updatingMode}
            onSelect={onRequestAccessMode}
            onManage={onManagePermissions}
          />
          <span className="composer-context-chip">{contextLabel}</span>
          {conversation?.planMode && <span className="composer-mode-chip"><Lightbulb size={13} /> 计划</span>}
          {conversation?.goal && <button type="button" className="composer-goal-chip" onClick={showGoal} title={conversation.goal}><Target size={13} /> 目标</button>}
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
        <GoalDialog goalDraft={goalDraft} updatingMode={updatingMode}
          onChange={setGoalDraft} onClose={closeGoal} onClear={clearGoal} onSave={saveGoal} />
      )}
      {!activeProviderId && (
        <button type="button" className="composer-hint" onClick={onSettings}>
          尚未配置可用模型，前往设置后即可开始生成
        </button>
      )}
    </div>
  )
}
