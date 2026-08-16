import { AlertTriangle, CheckCircle2, ChevronDown, ListTree } from 'lucide-react'
import { useId, useState } from 'react'
import './outline-architecture-summary.css'

export interface OutlineArchitectureSummaryProps {
  /** 当前大纲采用的结构模式，例如“实证研究 / IMRaD”。 */
  structureMode: string
  /** 用于路由大纲模板的专业类别。 */
  discipline: string
  /** 标题识别出的具体研究方向。 */
  researchDirection: string
  /** 结构识别置信度，支持 0–1；传入大于 1 的值时按百分比兼容。 */
  confidence: number
  /** 当前大纲的总字数预算。 */
  totalWords: number
  /** 当前大纲的一级章节数量。 */
  topLevelChapterCount: number
  /** 质量检查发现的待处理问题。 */
  qualityIssues: readonly string[]
  /** 初次渲染时是否展开详情，默认为展开。 */
  defaultExpanded?: boolean
}

type ConfidenceTone = 'high' | 'medium' | 'low'

function normalizeConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0
  const percent = value > 1 ? value : value * 100
  return Math.min(100, Math.max(0, Math.round(percent)))
}

function getConfidenceState(percent: number): {
  tone: ConfidenceTone
  label: string
  description: string
} {
  if (percent >= 80) {
    return {
      tone: 'high',
      label: '较高',
      description: '专业类别与研究方向匹配度较高，可直接进入三级标题生成。',
    }
  }
  if (percent >= 60) {
    return {
      tone: 'medium',
      label: '中等',
      description: '已形成候选结构，建议在生成正文前确认研究动作与证据条件。',
    }
  }
  return {
    tone: 'low',
    label: '偏低',
    description: '识别结果仍有不确定性，建议先补充专业类别或研究方向。',
  }
}

function formatWords(value: number): string {
  const count = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
  return `${count.toLocaleString('zh-CN')} 字`
}

function formatChapterCount(value: number): string {
  const count = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
  return `${count.toLocaleString('zh-CN')} 章`
}

function displayValue(value: string, fallback: string): string {
  const normalized = value.trim()
  return normalized || fallback
}

export function OutlineArchitectureSummary({
  structureMode,
  discipline,
  researchDirection,
  confidence,
  totalWords,
  topLevelChapterCount,
  qualityIssues,
  defaultExpanded = true,
}: OutlineArchitectureSummaryProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const generatedId = useId()
  const titleId = `outline-architecture-title-${generatedId.replace(/:/g, '')}`
  const detailsId = `outline-architecture-details-${generatedId.replace(/:/g, '')}`
  const issueTitleId = `outline-architecture-issues-${generatedId.replace(/:/g, '')}`
  const confidencePercent = normalizeConfidence(confidence)
  const confidenceState = getConfidenceState(confidencePercent)
  const normalizedIssues = qualityIssues.map((issue) => issue.trim()).filter(Boolean)
  const hasIssues = normalizedIssues.length > 0

  return (
    <section
      className={`outline-architecture-summary${expanded ? ' is-expanded' : ''}`}
      aria-labelledby={titleId}
    >
      <header className="outline-architecture-summary__header">
        <div className="outline-architecture-summary__heading">
          <span className="outline-architecture-summary__icon" aria-hidden="true">
            <ListTree size={16} strokeWidth={1.8} />
          </span>
          <div>
            <p className="outline-architecture-summary__eyebrow">结构识别</p>
            <h2 id={titleId}>大纲架构</h2>
          </div>
        </div>
        <button
          type="button"
          className="outline-architecture-summary__toggle"
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={expanded ? '收起大纲架构详情' : '展开大纲架构详情'}
          onClick={() => setExpanded((current) => !current)}
        >
          <span>{expanded ? '收起详情' : '查看详情'}</span>
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      </header>

      <div className="outline-architecture-summary__lead" aria-live="polite">
        <span className="outline-architecture-summary__mode">
          {displayValue(structureMode, '尚未识别结构模式')}
        </span>
        <span className="outline-architecture-summary__separator" aria-hidden="true">·</span>
        <span>{displayValue(discipline, '未指定专业类别')}</span>
        <span className="outline-architecture-summary__confidence">
          {confidencePercent}% 匹配
        </span>
      </div>

      <div
        id={detailsId}
        className="outline-architecture-summary__details"
        hidden={!expanded}
      >
        <dl className="outline-architecture-summary__facts">
          <div>
            <dt>专业类别</dt>
            <dd>{displayValue(discipline, '未指定')}</dd>
          </div>
          <div>
            <dt>研究方向</dt>
            <dd>{displayValue(researchDirection, '待补充')}</dd>
          </div>
          <div>
            <dt>结构模式</dt>
            <dd>{displayValue(structureMode, '待识别')}</dd>
          </div>
          <div>
            <dt>总字数</dt>
            <dd>{formatWords(totalWords)}</dd>
          </div>
          <div>
            <dt>一级章节</dt>
            <dd>{formatChapterCount(topLevelChapterCount)}</dd>
          </div>
        </dl>

        <section
          className={`outline-architecture-summary__confidence-panel is-${confidenceState.tone}`}
          aria-label="结构识别置信度"
        >
          <div className="outline-architecture-summary__confidence-heading">
            <span>结构识别置信度</span>
            <strong>{confidencePercent}% · {confidenceState.label}</strong>
          </div>
          <progress
            className="outline-architecture-summary__confidence-meter"
            value={confidencePercent}
            max={100}
            aria-label={`结构识别置信度 ${confidencePercent}%`}
          >
            {confidencePercent}%
          </progress>
          <p>{confidenceState.description}</p>
        </section>

        <section
          className={`outline-architecture-summary__quality${hasIssues ? ' has-issues' : ''}`}
          aria-labelledby={issueTitleId}
        >
          <div className="outline-architecture-summary__quality-heading">
            <h3 id={issueTitleId}>质量检查</h3>
            <span>{hasIssues ? `${normalizedIssues.length} 项待处理` : '已通过初检'}</span>
          </div>
          {hasIssues ? (
            <ul className="outline-architecture-summary__issue-list">
              {normalizedIssues.map((issue, index) => (
                <li key={`${issue}-${index}`}>
                  <AlertTriangle size={14} aria-hidden="true" />
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="outline-architecture-summary__empty-quality">
              <CheckCircle2 size={14} aria-hidden="true" />
              <span>暂未发现明显的结构问题。</span>
            </p>
          )}
        </section>
      </div>
    </section>
  )
}
