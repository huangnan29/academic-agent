// 文稿章节视图：版本切换、流式生成展示与编辑；从 App.tsx 抽出。
import {
  BrainCircuit,
  Check,
  ChevronDown,
  CircleAlert,
  FilePenLine,
  FileText,
  LoaderCircle,
  PencilLine,
  RefreshCw,
  Save,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ManuscriptSection, ManuscriptSectionVersion } from '../../shared/contracts'
import { formatSectionVersionMoment } from '../lib/format'
import { sectionStatusLabel } from '../lib/labels'
import { buildManuscriptDiff } from '../lib/manuscriptDiff'
import {
  EmptyState,
  GenerateOutlineAction,
  MarkdownMessage,
  StatusBadge,
  ThinkingBlock,
} from './common'

export function ManuscriptView({
  section,
  sectionVersions,
  generationProviderName,
  canGenerateOutline,
  generatingOutline,
  isEditing,
  draft,
  saving,
  selectingVersionId,
  onDraft,
  onEdit,
  onSave,
  onGenerate,
  onSelectVersion,
  onGenerateOutline,
  onConfigureModel,
}: {
  section?: ManuscriptSection
  sectionVersions: ManuscriptSectionVersion[]
  generationProviderName?: string
  canGenerateOutline: boolean
  generatingOutline: boolean
  isEditing: boolean
  draft: string
  saving: boolean
  selectingVersionId?: string
  onDraft: (value: string) => void
  onEdit: () => void
  onSave: () => void
  onGenerate: () => void
  onSelectVersion: (versionId: string) => Promise<void>
  onGenerateOutline: () => void
  onConfigureModel: () => void
}) {
  const streamTailRef = useRef<HTMLSpanElement>(null)
  const versionPickerRef = useRef<HTMLDivElement>(null)
  const versionTriggerRef = useRef<HTMLButtonElement>(null)
  const versionListRef = useRef<HTMLDivElement>(null)
  const [versionMenuOpen, setVersionMenuOpen] = useState(false)
  const [versionFocusIndex, setVersionFocusIndex] = useState(0)
  const manuscriptDiff = useMemo(
    () => isEditing && section ? buildManuscriptDiff(section.content, draft) : [],
    [draft, isEditing, section?.content],
  )
  const changedLines = manuscriptDiff.filter((line) => line.kind !== 'same')
  const orderedVersions = useMemo(
    () => [...sectionVersions].sort((left, right) => right.number - left.number || right.createdAt.localeCompare(left.createdAt)),
    [sectionVersions],
  )
  const activeVersion = orderedVersions.find((version) => version.id === section?.activeGenerationVersionId)

  useEffect(() => {
    setVersionMenuOpen(false)
    setVersionFocusIndex(0)
  }, [section?.id])

  useEffect(() => {
    if (!versionMenuOpen) return
    const activeIndex = Math.max(0, orderedVersions.findIndex((version) => version.id === activeVersion?.id))
    setVersionFocusIndex(activeIndex)
    requestAnimationFrame(() => versionListRef.current?.focus())

    const closeOnOutside = (event: PointerEvent) => {
      if (!versionPickerRef.current?.contains(event.target as Node)) setVersionMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setVersionMenuOpen(false)
      versionTriggerRef.current?.focus()
    }
    window.addEventListener('pointerdown', closeOnOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeOnOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [activeVersion?.id, orderedVersions, versionMenuOpen])

  useEffect(() => {
    if (section?.status !== 'generating') return
    streamTailRef.current?.scrollIntoView({ block: 'nearest' })
  }, [section?.content, section?.reasoningContent, section?.status])

  if (!section) {
    return (
      <div className="document-empty-wrap">
        <EmptyState
          icon={FileText}
          title="尚未创建文稿章节"
          description="生成三级论文大纲后，系统会创建对应章节，并可从右侧“稿件”逐章写作。"
          action={
            <GenerateOutlineAction
              canGenerate={canGenerateOutline}
              generating={generatingOutline}
              onGenerate={onGenerateOutline}
              onConfigureModel={onConfigureModel}
            />
          }
        />
      </div>
    )
  }

  const generating = section.status === 'generating'
  const hasVersionHistory = orderedVersions.length > 0
  const showVersionPicker = hasVersionHistory || ['draft', 'verified', 'error'].includes(section.status)
  const thinkingState = section.reasoningContent
    ? (generating ? 'Thinking 正在输出' : 'Thinking 已返回')
    : section.thinkingRequested
      ? 'Thinking 已请求'
      : undefined

  return (
    <div className="manuscript-view">
      <div className="manuscript-toolbar">
        <div>
          {showVersionPicker && (
            <div className="manuscript-version-cluster">
              <div className="manuscript-version-picker" ref={versionPickerRef}>
                <button
                  type="button"
                  className="manuscript-version-trigger"
                  ref={versionTriggerRef}
                  disabled={generating || isEditing || saving || Boolean(selectingVersionId) || orderedVersions.length === 0}
                  aria-label={generating
                    ? '正在生成章节新版本，旧版本已经保留'
                    : activeVersion
                      ? `版本，第 ${activeVersion.number} 版，${formatSectionVersionMoment(activeVersion)}`
                      : orderedVersions.length > 0
                      ? '当前稿尚未对应历史版本，可打开版本列表切换'
                      : '暂无可选择的历史版本'}
                  aria-haspopup="listbox"
                  aria-expanded={versionMenuOpen}
                  aria-controls={versionMenuOpen ? 'manuscript-version-list' : undefined}
                  onClick={() => setVersionMenuOpen((current) => !current)}
                  onKeyDown={(event) => {
                    if (!['ArrowDown', 'ArrowUp'].includes(event.key) || orderedVersions.length === 0) return
                    event.preventDefault()
                    const selectedIndex = Math.max(0, orderedVersions.findIndex((version) => version.id === activeVersion?.id))
                    setVersionFocusIndex(event.key === 'ArrowDown'
                      ? selectedIndex
                      : (selectedIndex - 1 + orderedVersions.length) % orderedVersions.length)
                    setVersionMenuOpen(true)
                  }}
                >
                  <span>{generating ? '正在生成新版' : activeVersion ? `第 ${activeVersion.number} 版` : '当前稿'}</span>
                  <small>{generating ? '旧版本已保留' : activeVersion ? formatSectionVersionMoment(activeVersion) : orderedVersions.length > 0 ? '选择历史版本' : '暂无历史'}</small>
                  <ChevronDown size={13} aria-hidden="true" />
                </button>
                {versionMenuOpen && orderedVersions.length > 0 && (
                  <div
                    className="manuscript-version-menu"
                    id="manuscript-version-list"
                    role="listbox"
                    aria-label={`${section.title}的历史版本`}
                    aria-activedescendant={`manuscript-version-option-${versionFocusIndex}`}
                    tabIndex={-1}
                    ref={versionListRef}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault()
                        const direction = event.key === 'ArrowDown' ? 1 : -1
                        setVersionFocusIndex((current) => (current + direction + orderedVersions.length) % orderedVersions.length)
                        return
                      }
                      if (event.key === 'Home' || event.key === 'End') {
                        event.preventDefault()
                        setVersionFocusIndex(event.key === 'Home' ? 0 : orderedVersions.length - 1)
                        return
                      }
                      if ((event.key === 'Enter' || event.key === ' ') && orderedVersions[versionFocusIndex]) {
                        event.preventDefault()
                        const version = orderedVersions[versionFocusIndex]
                        setVersionMenuOpen(false)
                        versionTriggerRef.current?.focus()
                        void onSelectVersion(version.id)
                      }
                    }}
                  >
                    {orderedVersions.map((version, index) => (
                      <button
                        type="button"
                        id={`manuscript-version-option-${index}`}
                        role="option"
                        aria-selected={version.id === activeVersion?.id}
                        className={`${index === versionFocusIndex ? 'is-focused' : ''}${version.id === activeVersion?.id ? ' is-active' : ''}`}
                        key={version.id}
                        disabled={Boolean(selectingVersionId)}
                        onMouseEnter={() => setVersionFocusIndex(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setVersionMenuOpen(false)
                          versionTriggerRef.current?.focus()
                          void onSelectVersion(version.id)
                        }}
                      >
                        <span>
                          <strong>第 {version.number} 版</strong>
                          <small>
                            <time dateTime={version.createdAt}>{formatSectionVersionMoment(version)}</time>
                            {version.generationProfile ? ` · ${sectionProfileLabel(version.generationProfile)}` : ''}
                          </small>
                        </span>
                        {version.id === activeVersion?.id && <Check size={14} aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="manuscript-regenerate-button"
                onClick={onGenerate}
                disabled={generating || isEditing || saving || Boolean(selectingVersionId)}
                aria-label={`重新生成章节：${section.title}`}
              >
                <RefreshCw size={13} aria-hidden="true" /> 重新生成
              </button>
            </div>
          )}
          <span>{section.wordCount.toLocaleString('zh-CN')} 字</span>
          <StatusBadge status={section.status}>{sectionStatusLabel(section)}</StatusBadge>
          {section.generationModel && (
            <span className="section-generation-model">
              <BrainCircuit size={12} /> {generationProviderName ? `${generationProviderName} · ` : ''}{section.generationModel}
              {thinkingState ? ` · ${thinkingState}` : ''}
            </span>
          )}
          {section.generationProfile && (
            <span
              className="section-generation-model"
              title={`章节职责：${sectionProfileLabel(section.generationProfile)}；优化策略：${sectionStrategyLabels(section.generationStrategyIds)}`}
            >
              {sectionProfileLabel(section.generationProfile)} · {sectionStrategyLabels(section.generationStrategyIds)}
            </span>
          )}
        </div>
        <div className="toolbar-actions">
          {section.status === 'pending' && !hasVersionHistory && (
            <button type="button" className="secondary-button" onClick={onGenerate}>
              <FilePenLine size={15} /> 生成本章
            </button>
          )}
          {generating ? (
            <span className="section-streaming-label" aria-live="polite"><LoaderCircle size={14} className="spin" /> 正在流式生成</span>
          ) : isEditing ? (
            <button type="button" className="primary-button compact" onClick={onSave} disabled={saving}>
              {saving ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
              {saving ? '保存中' : '保存修改'}
            </button>
          ) : (
            <button type="button" className="secondary-button" onClick={onEdit} disabled={Boolean(selectingVersionId)}>
              <PencilLine size={15} /> 编辑
            </button>
          )}
        </div>
      </div>
      <article className="manuscript-paper">
        {section.generationError && (
          <div className="section-generation-error" role="alert"><CircleAlert size={16} /><span><strong>章节生成中断</strong><small>{section.generationError} 当前正文已经保留，可重新生成或手工编辑。</small></span></div>
        )}
        {section.reasoningContent && (
          <div className="section-thinking-wrap"><ThinkingBlock content={section.reasoningContent} streaming={generating} /></div>
        )}
        {isEditing ? (
          <div className="manuscript-editor-stack">
            <textarea value={draft} onChange={(event) => onDraft(event.target.value)} aria-label="编辑当前章节" autoFocus />
            {changedLines.length > 0 && (
              <details className="manuscript-diff" open>
                <summary>本次修改 · 新增 {changedLines.filter((line) => line.kind === 'added').length} 行 · 删除 {changedLines.filter((line) => line.kind === 'removed').length} 行</summary>
                <div className="manuscript-diff-lines" aria-label="当前章节未保存的逐行差异">
                  {changedLines.slice(0, 120).map((line, index) => (
                    <div className={`is-${line.kind}`} key={`${line.kind}-${index}-${line.text}`}>
                      <span aria-hidden="true">{line.kind === 'added' ? '+' : '−'}</span>
                      <code>{line.text || ' '}</code>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        ) : section.content || generating ? (
          <div className={`section-streaming-content${generating ? ' is-generating' : ''}`}>
            {section.content ? <MarkdownMessage content={section.content} /> : (
              <div className="section-stream-waiting"><LoaderCircle size={17} className="spin" /><span>{section.thinkingRequested ? '模型正在思考并准备章节结构…' : '模型正在准备章节内容…'}</span></div>
            )}
            {generating && <span ref={streamTailRef} className="section-stream-caret" aria-label="正文正在生成" />}
          </div>
        ) : (
          <EmptyState icon={FileText} title="本章尚未生成" description="生成后可在这里继续编辑，并围绕选中文本向 Agent 追问。" />
        )}
      </article>
    </div>
  )
}

function sectionProfileLabel(profile: NonNullable<ManuscriptSection['generationProfile']>): string {
  if (profile === 'abstract') return '摘要'
  if (profile === 'introduction') return '绪论 / 问题提出'
  if (profile === 'literature-review') return '综述 / 理论'
  if (profile === 'method-design') return '方法 / 设计'
  if (profile === 'result-implementation') return '结果 / 实现'
  if (profile === 'discussion-conclusion') return '讨论 / 结论'
  return '通用分析'
}

function sectionStrategyLabels(strategies: ManuscriptSection['generationStrategyIds']): string {
  if (!strategies?.length) return '默认策略'
  return strategies.map((strategy) => {
    if (strategy === 'evidence-first') return '证据优先'
    if (strategy === 'argument-deepening') return '论证深化'
    if (strategy === 'natural-academic') return '自然学术'
    return '精炼表达'
  }).join(' + ')
}
