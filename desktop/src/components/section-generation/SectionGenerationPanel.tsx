import {
  AlertCircle,
  BookOpen,
  Check,
  FileText,
  Layers3,
  LoaderCircle,
  RefreshCw,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type {
  ManuscriptSection,
  SectionContentForm,
  SectionGenerationMode,
  SectionGenerationOptions,
  SectionGenerationPreview,
  SectionOptimizationStrategy,
  SectionProfile,
} from '../../../shared/contracts'

type PreviewHandler = (
  options: SectionGenerationOptions,
) => Promise<SectionGenerationPreview | undefined> | SectionGenerationPreview | undefined

export interface SectionGenerationPanelProps {
  open: boolean
  section: ManuscriptSection
  modelLabel?: string
  preview?: SectionGenerationPreview
  previewLoading: boolean
  previewError?: string
  submitting?: boolean
  onClose: () => void
  onPreview: PreviewHandler
  onSubmit: (options: SectionGenerationOptions) => void | Promise<void>
}

type ProfileMode = 'auto' | 'manual'

const profileOptions: Array<{ value: SectionProfile; label: string; summary: string }> = [
  { value: 'abstract', label: '摘要', summary: '压缩研究对象、方法与结论边界' },
  { value: 'introduction', label: '绪论 / 问题提出', summary: '交代背景、问题、价值与全文路线' },
  { value: 'literature-review', label: '综述 / 理论', summary: '组织概念、文献脉络与研究缺口' },
  { value: 'method-design', label: '方法 / 设计', summary: '说明方法选择、步骤、材料与限制' },
  { value: 'result-implementation', label: '结果 / 实现', summary: '呈现已提供材料支持的结果或实现' },
  { value: 'discussion-conclusion', label: '讨论 / 结论', summary: '解释发现、回应问题并收束边界' },
  { value: 'general-analysis', label: '通用分析', summary: '围绕章节目标组织证据与分析' },
]

const strategyOptions: Array<{ value: SectionOptimizationStrategy; label: string; summary: string }> = [
  { value: 'evidence-first', label: '证据优先', summary: '先对齐已纳入材料，再展开正文' },
  { value: 'argument-deepening', label: '论证深化', summary: '补足因果、比较和反例链条' },
  { value: 'natural-academic', label: '自然学术', summary: '减少模板套话，保持学术语气' },
  { value: 'concise', label: '精炼表达', summary: '压缩重复表述，保留核心论点' },
]

const contentFormLabels: Record<SectionContentForm, { label: string; summary: string }> = {
  table: { label: '表格', summary: '用于结构化比较、变量或清单' },
  diagram: { label: '图示', summary: '用于关系、流程或机制表达' },
  formula: { label: '公式', summary: '仅在可说明符号与推导边界时使用' },
  code: { label: '代码', summary: '仅在章节职责与材料允许时使用' },
}

export function SectionGenerationPanel({
  open,
  section,
  modelLabel,
  preview,
  previewLoading,
  previewError,
  submitting = false,
  onClose,
  onPreview,
  onSubmit,
}: SectionGenerationPanelProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const previewSyncedRef = useRef(false)
  const submittingRef = useRef(submitting)
  submittingRef.current = submitting
  const [mode, setMode] = useState<SectionGenerationMode>('revise')
  const [profileMode, setProfileMode] = useState<ProfileMode>('auto')
  const [profile, setProfile] = useState<SectionProfile>('general-analysis')
  const [strategies, setStrategies] = useState<SectionOptimizationStrategy[]>([])
  const [contentForms, setContentForms] = useState<SectionContentForm[]>([])
  const [customInstructions, setCustomInstructions] = useState('')
  const [strategyError, setStrategyError] = useState<string>()

  useEffect(() => {
    if (!open) {
      previewSyncedRef.current = false
      return
    }
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setMode('revise')
    setProfileMode('auto')
    setProfile(preview?.profile ?? 'general-analysis')
    setStrategies([])
    setContentForms([])
    setCustomInstructions('')
    setStrategyError(undefined)
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!submittingRef.current) {
          event.preventDefault()
          onClose()
        }
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open || !preview || previewSyncedRef.current) return
    previewSyncedRef.current = true
    setMode(preview.mode)
    setStrategies([...preview.strategyIds].slice(0, 2))
    setContentForms([...preview.selectedContentForms])
    setProfile(preview.profile)
  }, [open, preview])

  if (!open) return null

  const selectedProfile = profileOptions.find((item) => item.value === profile)
  const currentWordCount = preview?.currentWordCount ?? section.wordCount
  const canSubmit = Boolean(preview && modelLabel && !previewLoading && !previewError && !submitting && !strategyError)

  const buildOptions = (overrides: {
    mode?: SectionGenerationMode
    profileMode?: ProfileMode
    profile?: SectionProfile
    strategyIds?: SectionOptimizationStrategy[]
    contentForms?: SectionContentForm[]
  } = {}): SectionGenerationOptions => ({
    mode: overrides.mode ?? mode,
    profile: (overrides.profileMode ?? profileMode) === 'manual'
      ? overrides.profile ?? profile
      : undefined,
    strategyIds: (overrides.strategyIds ?? strategies).slice(0, 2),
    contentForms: overrides.contentForms ?? contentForms,
    customInstructions: customInstructions.trim() || undefined,
  })

  const requestProfilePreview = async (nextProfileMode: ProfileMode, nextProfile: SectionProfile) => {
    // 切换章节职责时重新采用该职责的后端默认策略与内容形态，避免沿用上一职责的组合。
    const options: SectionGenerationOptions = {
      mode,
      profile: nextProfileMode === 'manual' ? nextProfile : undefined,
      customInstructions: customInstructions.trim() || undefined,
    }
    const nextPreview = await onPreview(options)
    if (nextPreview) {
      if (nextProfileMode === 'auto') setProfile(nextPreview.profile)
      setContentForms([...nextPreview.selectedContentForms])
      setStrategies([...nextPreview.strategyIds].slice(0, 2))
    }
  }

  const toggleStrategy = (value: SectionOptimizationStrategy) => {
    const selected = strategies.includes(value)
    if (selected) {
      setStrategies(strategies.filter((item) => item !== value))
      setStrategyError(undefined)
      return
    }
    if (strategies.length >= 2) {
      setStrategyError('最多选择两种优化策略。')
      return
    }
    if ((value === 'argument-deepening' && strategies.includes('concise'))
      || (value === 'concise' && strategies.includes('argument-deepening'))) {
      setStrategyError('“论证深化”和“精炼表达”不能同时选择。')
      return
    }
    setStrategies([...strategies, value])
    setStrategyError(undefined)
  }

  const toggleContentForm = (value: SectionContentForm) => {
    if (!preview?.availableContentForms.includes(value) || preview.unsupportedContentForms.includes(value)) return
    setContentForms((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value])
  }

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit(buildOptions())
  }

  return (
    <div
      className="modal-backdrop section-generation-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !submitting && onClose()}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="modal section-generation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="section-generation-title"
        aria-describedby="section-generation-description"
        aria-busy={previewLoading || submitting}
      >
        <header className="section-generation-header">
          <div>
            <span className="section-generation-heading-icon"><SlidersHorizontal size={17} aria-hidden="true" /></span>
            <div>
              <p className="section-generation-eyebrow">章节生成配置</p>
              <h2 id="section-generation-title">重新生成「{section.title}」</h2>
              <p id="section-generation-description">先确定本次写作边界，再保留当前稿或从头建立新版本。历史版本不会被覆盖。</p>
            </div>
          </div>
          <button ref={closeButtonRef} type="button" className="icon-button" onClick={onClose} disabled={submitting} aria-label="关闭章节生成配置" title="关闭">
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="section-generation-body">
          <div className="section-generation-facts" aria-label="章节生成上下文">
            <div><span>当前模型</span><strong>{modelLabel || '尚未配置可用模型'}</strong></div>
            <div><span>当前字数</span><strong>{currentWordCount.toLocaleString('zh-CN')} 字</strong></div>
            <div><span>已纳入文献</span><strong>{preview ? `${preview.includedLiteratureCount} 篇` : '—'}</strong></div>
            <div><span>已生成章节</span><strong>{preview ? `${preview.generatedSectionCount} 个` : '—'}</strong></div>
          </div>

          <fieldset className="section-generation-fieldset">
            <legend>生成方式</legend>
            <div className="section-generation-choice-row">
              <label className={`section-generation-choice${mode === 'revise' ? ' is-selected' : ''}`}>
                <input type="radio" name="section-generation-mode" value="revise" checked={mode === 'revise'} onChange={() => setMode('revise')} disabled={submitting} />
                <span><strong>基于当前稿优化</strong><small>保留当前论述，按新的职责与策略改写</small></span>
              </label>
              <label className={`section-generation-choice${mode === 'rewrite' ? ' is-selected' : ''}`}>
                <input type="radio" name="section-generation-mode" value="rewrite" checked={mode === 'rewrite'} onChange={() => setMode('rewrite')} disabled={submitting} />
                <span><strong>从头重写</strong><small>以当前章节目标为基线建立新版本</small></span>
              </label>
            </div>
          </fieldset>

          <fieldset className="section-generation-fieldset">
            <legend>章节职责</legend>
            <div className="section-generation-profile-mode" role="radiogroup" aria-label="章节职责识别方式">
              <label className={profileMode === 'auto' ? 'is-selected' : ''}>
                <input type="radio" name="section-profile-mode" value="auto" checked={profileMode === 'auto'} onChange={() => { setProfileMode('auto'); void requestProfilePreview('auto', profile) }} disabled={submitting} />
                自动识别
              </label>
              <label className={profileMode === 'manual' ? 'is-selected' : ''}>
                <input type="radio" name="section-profile-mode" value="manual" checked={profileMode === 'manual'} onChange={() => { setProfileMode('manual'); void requestProfilePreview('manual', profile) }} disabled={submitting} />
                手动指定
              </label>
            </div>
            <select
              className="section-generation-profile-select"
              value={profile}
              onChange={(event) => {
                const nextProfile = event.target.value as SectionProfile
                setProfileMode('manual')
                setProfile(nextProfile)
                void requestProfilePreview('manual', nextProfile)
              }}
              disabled={profileMode !== 'manual' || submitting}
              aria-label="手动选择章节职责"
            >
              {profileOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <div className="section-generation-profile-summary" aria-live="polite">
              <span>{previewLoading ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <Layers3 size={14} aria-hidden="true" />}</span>
              <div><strong>{preview?.profileLabel ?? selectedProfile?.label ?? '等待职责识别'}</strong><p>{preview?.profileSummary ?? selectedProfile?.summary ?? '打开配置后由后端根据大纲与项目边界识别。'}</p></div>
            </div>
          </fieldset>

          <fieldset className="section-generation-fieldset">
            <legend>优化策略 <small>最多 2 种</small></legend>
            <div className="section-generation-strategy-grid">
              {strategyOptions.map((item) => {
                const checked = strategies.includes(item.value)
                const limitReached = strategies.length >= 2 && !checked
                return (
                  <label className={`section-generation-check-option${checked ? ' is-selected' : ''}`} key={item.value}>
                    <input type="checkbox" checked={checked} onChange={() => toggleStrategy(item.value)} disabled={submitting || limitReached} />
                    <span className="section-generation-checkmark" aria-hidden="true">{checked && <Check size={12} />}</span>
                    <span><strong>{item.label}</strong><small>{item.summary}</small></span>
                  </label>
                )
              })}
            </div>
            {strategyError && <p className="section-generation-inline-error" role="alert"><AlertCircle size={14} aria-hidden="true" />{strategyError}</p>}
          </fieldset>

          <fieldset className="section-generation-fieldset">
            <legend>内容形态 <small>由当前章节职责返回可用项</small></legend>
            {previewLoading && !preview ? (
              <div className="section-generation-loading"><LoaderCircle size={15} className="spin" />正在读取本章可用形态…</div>
            ) : preview?.availableContentForms.length ? (
              <div className="section-generation-content-forms">
                {preview.availableContentForms.map((value) => {
                  const checked = contentForms.includes(value)
                  const disabled = preview.unsupportedContentForms.includes(value)
                  const item = contentFormLabels[value]
                  return (
                    <label className={`section-generation-check-option${checked ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`} key={value}>
                      <input type="checkbox" checked={checked} onChange={() => toggleContentForm(value)} disabled={disabled || submitting} />
                      <span className="section-generation-checkmark" aria-hidden="true">{checked && <Check size={12} />}</span>
                      <span><strong>{item.label}</strong><small>{disabled ? '当前章节不适合' : item.summary}</small></span>
                    </label>
                  )
                })}
              </div>
            ) : (
              <p className="section-generation-muted">本次生成以连续正文为主，后端没有返回额外内容形态。</p>
            )}
          </fieldset>

          <div className="section-generation-boundary">
            <BookOpen size={15} aria-hidden="true" />
            <div><strong>数据边界</strong><p>{preview?.dataBoundary ?? '等待后端返回当前项目的数据边界。'}</p></div>
          </div>

          <label className="section-generation-custom-field">
            <span><strong>补充要求</strong><small>{customInstructions.length}/2000</small></span>
            <textarea
              value={customInstructions}
              maxLength={2000}
              onChange={(event) => setCustomInstructions(event.target.value)}
              placeholder="例如：保留当前小标题，优先解释两个概念之间的差异。"
              disabled={submitting}
              aria-label="章节生成补充要求"
            />
          </label>

          {previewError && (
            <div className="section-generation-preview-error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <div><strong>无法读取生成配置</strong><p>{previewError}</p></div>
              <button type="button" className="inline-link" onClick={() => { void onPreview(buildOptions()) }} disabled={previewLoading || submitting}><RefreshCw size={13} aria-hidden="true" />重试</button>
            </div>
          )}
        </div>

        <footer className="section-generation-footer">
          <span className="section-generation-footer-note">
            <FileText size={14} aria-hidden="true" />
            {modelLabel ? '提交后会生成新的历史版本' : '请先在设置中配置并选择可用模型'}
          </span>
          <div>
            <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>取消</button>
            <button type="button" className="primary-button compact" onClick={handleSubmit} disabled={!canSubmit} aria-busy={submitting}>
              {submitting ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}
              {submitting ? '正在开始生成' : '提交并生成'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
