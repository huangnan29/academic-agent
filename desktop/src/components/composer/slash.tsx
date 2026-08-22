import { Check, PlugZap, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type {
  ChatContextReference,
  McpServerConfig,
  SkillDefinition,
} from '../../../shared/contracts'

export type SlashItem = {
  key: string
  label: string
  description: string
  searchText: string
  reference: ChatContextReference
  kind: 'skill' | 'mcp-tool'
  status?: McpServerConfig['status']
  stateLabel?: string
}

export function referenceKey(reference: ChatContextReference) {
  if (reference.kind === 'skill') return `skill:${reference.skillId}`
  if (reference.kind === 'mcp-tool') return `mcp-tool:${reference.serverId}:${reference.toolName}`
  return `mcp:${reference.serverId}`
}

export function buildSlashItems(skills: SkillDefinition[], mcpServers: McpServerConfig[]): SlashItem[] {
  return [
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
  ]
}

function getSlashMatch(value: string, cursorPosition: number) {
  const beforeCursor = value.slice(0, cursorPosition)
  const match = /(?:^|\s)\/([^\s\/]*)$/.exec(beforeCursor)
  if (!match) return undefined
  const slashIndex = match.index + (match[0].startsWith('/') ? 0 : 1)
  let tokenEnd = cursorPosition
  while (tokenEnd < value.length && !/\s/.test(value[tokenEnd])) tokenEnd += 1
  return { query: match[1], slashIndex, tokenEnd }
}

function getReferenceLabel(
  reference: ChatContextReference,
  slashItems: SlashItem[],
  mcpServers: McpServerConfig[],
) {
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

type UseSlashMenuOptions = {
  value: string
  cursorPosition: number
  skills: SkillDefinition[]
  mcpServers: McpServerConfig[]
  interactionLocked: boolean
  textareaRef: RefObject<HTMLTextAreaElement | null>
  setValue: Dispatch<SetStateAction<string>>
  setCursorPosition: Dispatch<SetStateAction<number>>
}

export function useSlashMenu({
  value,
  cursorPosition,
  skills,
  mcpServers,
  interactionLocked,
  textareaRef,
  setValue,
  setCursorPosition,
}: UseSlashMenuOptions) {
  const [selectedReferences, setSelectedReferences] = useState<ChatContextReference[]>([])
  const [slashSelection, setSlashSelection] = useState(0)
  const [slashDismissedValue, setSlashDismissedValue] = useState<string>()
  const slashItems = useMemo(() => buildSlashItems(skills, mcpServers), [mcpServers, skills])
  const slashMatch = useMemo(() => getSlashMatch(value, cursorPosition), [cursorPosition, value])
  const filteredSlashItems = useMemo(() => {
    const query = slashMatch?.query.trim().toLocaleLowerCase() ?? ''
    const matches = query ? slashItems.filter((item) => item.searchText.includes(query)) : slashItems
    return matches.slice(0, 12)
  }, [slashItems, slashMatch?.query])
  const slashMenuOpen = Boolean(slashMatch && slashDismissedValue !== value && !interactionLocked)

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

  useEffect(() => {
    setSlashSelection(0)
  }, [slashMatch?.query, filteredSlashItems.length])

  useEffect(() => {
    if (!slashMenuOpen) return
    document.getElementById(`composer-slash-option-${slashSelection}`)?.scrollIntoView({ block: 'nearest' })
  }, [slashMenuOpen, slashSelection])

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

  const reset = () => {
    setSelectedReferences([])
    setSlashDismissedValue(undefined)
  }

  const removeReference = (reference: ChatContextReference) => {
    const key = referenceKey(reference)
    setSelectedReferences((current) => current.filter((item) => referenceKey(item) !== key))
  }

  return {
    selectedReferences,
    slashItems,
    filteredSlashItems,
    slashMenuOpen,
    slashSelection,
    selectedMcpToolPlaceholder,
    zeroArgumentToolReference,
    setSlashSelection,
    selectSlashItem,
    dismissSlashMenu: () => setSlashDismissedValue(value),
    clearSlashDismissal: () => setSlashDismissedValue(undefined),
    clearSelectedReferences: () => setSelectedReferences([]),
    removeReference,
    reset,
  }
}

export function SlashMenu({
  items,
  slashSelection,
  selectedReferences,
  onMouseEnter,
  onSelect,
}: {
  items: SlashItem[]
  slashSelection: number
  selectedReferences: ChatContextReference[]
  onMouseEnter: (index: number) => void
  onSelect: (item: SlashItem) => void
}) {
  return (
    <div className="composer-slash-menu" id="composer-slash-menu" role="listbox" aria-label="添加 Skill 或 MCP 工具">
      <div className="composer-slash-header">
        <span>添加到本次对话</span>
        <kbd>/</kbd>
      </div>
      {items.length === 0 ? (
        <div className="composer-slash-empty">没有匹配的已启用 Skill 或 MCP 工具</div>
      ) : (
        <div className="composer-slash-options">
          {(['skill', 'mcp-tool'] as const).map((kind) => {
            const group = items.filter((item) => item.kind === kind)
            if (group.length === 0) return null
            return (
              <div className="composer-slash-group" key={kind} role="group" aria-label={kind === 'skill' ? 'Skills' : 'MCP 工具'}>
                <span className="composer-slash-group-label">{kind === 'skill' ? 'Skills' : 'MCP 工具'}</span>
                {group.map((item) => {
                  const index = items.findIndex((candidate) => candidate.key === item.key)
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
                      onMouseEnter={() => onMouseEnter(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onSelect(item)}
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
  )
}

export function ContextReferences({
  references,
  slashItems,
  mcpServers,
  interactionLocked,
  onRemove,
}: {
  references: ChatContextReference[]
  slashItems: SlashItem[]
  mcpServers: McpServerConfig[]
  interactionLocked: boolean
  onRemove: (reference: ChatContextReference) => void
}) {
  if (references.length === 0) return null
  return (
    <div className="composer-context-references" aria-label="本次对话附加能力">
      {references.map((reference) => {
        const label = getReferenceLabel(reference, slashItems, mcpServers)
        return (
          <span className={`composer-reference-chip is-${reference.kind}`} key={referenceKey(reference)}>
            {reference.kind === 'skill' ? <Sparkles size={13} /> : <PlugZap size={13} />}
            <span>{label}</span>
            <button
              type="button"
              onClick={() => onRemove(reference)}
              aria-label={`移除 ${label}`}
              disabled={interactionLocked}
            >
              <X size={11} />
            </button>
          </span>
        )
      })}
    </div>
  )
}
