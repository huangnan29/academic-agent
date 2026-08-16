// 右侧学术工作台：文献 / 稿件（大纲）/ 过程三个标签页；从 App.tsx 抽出。
import {
  Activity,
  BookOpen,
  CircleAlert,
  CircleCheck,
  Clock3,
  Download,
  Files,
  FolderOpen,
  ListChecks,
  LoaderCircle,
  PanelRightClose,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type {
  AgentStep,
  LiteratureRecord,
  ManuscriptSection,
  ManuscriptSectionVersion,
  OutlineArchitecture,
  OutlineQualityReport,
  WorkspaceState,
} from '../../shared/contracts'
import { formatBytes } from '../lib/format'
import { outlinePatternLabels } from '../lib/labels'
import { summarizeOutline } from '../lib/outline'
import { DEFAULT_RIGHT_PANEL_WIDTH, type RightTab } from '../lib/ui'
import { EmptyState, GenerateOutlineAction, IconButton } from './common'
import { LiteratureList } from './LiteratureList'
import { OutlineArchitectureSummary } from './OutlineArchitectureSummary'
import { OutlineTree } from './OutlineTree'

export function RightWorkspace({
  tab,
  onTab,
  literature,
  outline,
  outlineArchitecture,
  outlineQualityReport,
  sections,
  sectionVersions,
  selectedSectionId,
  runSteps,
  artifacts,
  activeProjectId,
  onToggleLiterature,
  onRemoveLiterature,
  onDeleteLiterature,
  onOpenLiterature,
  onSelectSection,
  onReveal,
  canGenerateOutline,
  generatingOutline,
  onGenerateOutline,
  onRequestRegenerateOutline,
  onConfigureModel,
  onRefresh,
  onCloseDrawer,
  width,
  onWidthChange,
  onWidthCommit,
}: {
  tab: RightTab
  onTab: (tab: RightTab) => void
  literature: LiteratureRecord[]
  outline: WorkspaceState['outlines'][string]
  outlineArchitecture?: OutlineArchitecture
  outlineQualityReport?: OutlineQualityReport
  sections: ManuscriptSection[]
  sectionVersions: ManuscriptSectionVersion[]
  selectedSectionId?: string
  runSteps: AgentStep[]
  artifacts: WorkspaceState['artifacts']
  activeProjectId?: string
  onToggleLiterature: (record: LiteratureRecord, projectId: string) => Promise<void>
  onRemoveLiterature: (record: LiteratureRecord) => Promise<void>
  onDeleteLiterature: (record: LiteratureRecord) => Promise<void>
  onOpenLiterature: (record: LiteratureRecord) => void
  onSelectSection: (section: ManuscriptSection) => void
  onReveal: (path: string) => void
  canGenerateOutline: boolean
  generatingOutline: boolean
  onGenerateOutline: () => void
  onRequestRegenerateOutline: () => void
  onConfigureModel: () => void
  onRefresh: () => void
  onCloseDrawer: () => void
  width: number
  onWidthChange: (width: number) => void
  onWidthCommit: (width: number) => void
}) {
  const outlineNodes = outline ?? []
  const outlineSummary = summarizeOutline(outlineNodes)
  const widthRef = useRef(width)

  useEffect(() => {
    widthRef.current = width
  }, [width])

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = widthRef.current
    const handleMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.max(320, Math.min(620, Math.round(startWidth + startX - moveEvent.clientX)))
      widthRef.current = nextWidth
      onWidthChange(nextWidth)
    }
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      document.body.classList.remove('is-resizing-panel')
      onWidthCommit(widthRef.current)
    }
    document.body.classList.add('is-resizing-panel')
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  return (
    <aside className="right-workspace">
      <div
        className="right-resizer"
        role="separator"
        aria-label="调整学术工作台宽度"
        aria-orientation="vertical"
        aria-valuemin={320}
        aria-valuemax={620}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={startResize}
        onDoubleClick={() => {
          widthRef.current = DEFAULT_RIGHT_PANEL_WIDTH
          onWidthChange(DEFAULT_RIGHT_PANEL_WIDTH)
          onWidthCommit(DEFAULT_RIGHT_PANEL_WIDTH)
        }}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return
          event.preventDefault()
          const nextWidth = event.key === 'Home'
            ? DEFAULT_RIGHT_PANEL_WIDTH
            : Math.max(320, Math.min(620, widthRef.current + (event.key === 'ArrowLeft' ? 16 : -16)))
          widthRef.current = nextWidth
          onWidthChange(nextWidth)
          onWidthCommit(nextWidth)
        }}
      />
      <div className="right-titlebar">
        <strong>研究工作台</strong>
        <div className="right-title-actions">
          <IconButton icon={RefreshCw} label="刷新工作台" onClick={onRefresh} />
          <span className="drawer-close-action">
            <IconButton icon={PanelRightClose} label="关闭研究工作台抽屉" onClick={onCloseDrawer} />
          </span>
        </div>
      </div>
      <div className="right-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          id="right-tab-literature"
          aria-selected={tab === 'literature'}
          aria-controls="right-workspace-panel"
          className={tab === 'literature' ? 'is-active' : ''}
          onClick={() => onTab('literature')}
        >
          <BookOpen size={15} /> 文献
          <span>{literature.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="right-tab-drafts"
          aria-selected={tab === 'drafts'}
          aria-controls="right-workspace-panel"
          className={tab === 'drafts' ? 'is-active' : ''}
          onClick={() => onTab('drafts')}
        >
          <Files size={15} /> 稿件
          <span>{sections.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="right-tab-process"
          aria-selected={tab === 'process'}
          aria-controls="right-workspace-panel"
          className={tab === 'process' ? 'is-active' : ''}
          onClick={() => onTab('process')}
        >
          <Activity size={15} /> 过程
        </button>
      </div>
      <div
        className="right-content"
        role="tabpanel"
        id="right-workspace-panel"
        aria-labelledby={`right-tab-${tab}`}
      >
        {tab === 'literature' && (
          <>
            <div className="panel-summary">
              <div>
                <strong>{literature.filter((item) => item.included).length}</strong>
                <span>已纳入</span>
              </div>
              <div>
                <strong>{literature.filter((item) => item.verificationStatus === 'verified-metadata').length}</strong>
                <span>来源已记录</span>
              </div>
              <div>
                <strong>{literature.filter((item) => ['demo', 'unverified'].includes(item.verificationStatus)).length}</strong>
                <span>待核验</span>
              </div>
            </div>
            <LiteratureList
              records={literature}
              activeProjectId={activeProjectId}
              compact
              onToggle={onToggleLiterature}
              onRemove={onRemoveLiterature}
              onDelete={onDeleteLiterature}
              onOpen={onOpenLiterature}
            />
          </>
        )}

        {tab === 'drafts' && (
          <div className="draft-panel">
            <div className="panel-section-heading">
              <div className="panel-section-heading-copy">
                <strong>论文大纲</strong>
                <span>{outlineSummary[1]} 章 · {outlineSummary[2]} 节 · {outlineSummary[3]} 目</span>
              </div>
              {outlineNodes.length > 0 && (
                <button
                  type="button"
                  className="outline-regenerate-button"
                  onClick={onRequestRegenerateOutline}
                  disabled={generatingOutline}
                  aria-busy={generatingOutline}
                  title={generatingOutline ? '正在生成大纲' : '重新生成大纲'}
                >
                  {generatingOutline ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
                  <span>{generatingOutline ? '正在生成' : '重新生成'}</span>
                </button>
              )}
            </div>
            {outlineNodes.length === 0 && (
              <EmptyState
                icon={ListChecks}
                title="尚未生成大纲"
                description="基于研究要求与已纳入文献生成三级大纲。"
                action={
                  <GenerateOutlineAction
                    canGenerate={canGenerateOutline}
                    generating={generatingOutline}
                    onGenerate={onGenerateOutline}
                    onConfigureModel={onConfigureModel}
                  />
                }
              />
            )}
            {outlineNodes.length > 0 && (
              <>
                {outlineArchitecture && (
                  <OutlineArchitectureSummary
                    structureMode={outlinePatternLabels[outlineArchitecture.pattern]}
                    discipline={outlineArchitecture.disciplineLabel}
                    researchDirection={outlineArchitecture.researchDirection}
                    confidence={outlineArchitecture.confidence}
                    totalWords={outlineArchitecture.totalTargetWords}
                    topLevelChapterCount={outlineNodes.length}
                    qualityIssues={(outlineQualityReport?.issues ?? [])
                      .filter((issue) => issue.severity !== 'info')
                      .map((issue) => issue.message)}
                    defaultExpanded={false}
                  />
                )}
                <OutlineTree
                  nodes={outlineNodes}
                  sections={sections}
                  sectionVersions={sectionVersions}
                  selectedSectionId={selectedSectionId}
                  onSelectSection={onSelectSection}
                />
              </>
            )}
            <div className="panel-section-heading artifacts-heading">
              <strong>导出产物</strong>
              <span>{artifacts.length} 项</span>
            </div>
            {artifacts.length === 0 ? (
              <p className="inline-empty">完成文稿后，可在顶部导出 Markdown 或 Word 文档。</p>
            ) : (
              artifacts.map((artifact) => (
                <button type="button" className="artifact-row" key={artifact.id} onClick={() => onReveal(artifact.path)}>
                  <Download size={16} />
                  <span>
                    <strong>{artifact.name}</strong>
                    <small>{formatBytes(artifact.size)} · {artifact.format.toUpperCase()}</small>
                  </span>
                  <FolderOpen size={15} />
                </button>
              ))
            )}
          </div>
        )}

        {tab === 'process' && (
          <div className="process-panel">
            <div className="quality-note">
              <ShieldCheck size={17} />
              <div>
                <strong>证据优先</strong>
                <p>书目信息、摘要可用性与主张支持情况分别记录，不以总分掩盖未核验项。</p>
              </div>
            </div>
            {runSteps.length === 0 ? (
              <EmptyState icon={ListChecks} title="尚无执行过程" description="开始检索或生成后，可公开的 Agent 操作会显示在这里。" />
            ) : (
              <ol className="process-list">
                {runSteps.map((step) => (
                  <li key={step.id} className={`process-${step.status}`}>
                    <span className="process-icon">
                      {step.status === 'completed' ? <CircleCheck size={16} /> : step.status === 'running' ? <LoaderCircle size={16} className="spin" /> : step.status === 'warning' ? <CircleAlert size={16} /> : <Clock3 size={16} />}
                    </span>
                    <div>
                      <strong>{step.label}</strong>
                      <p>{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
