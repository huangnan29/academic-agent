import { Check, LoaderCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import './message-literature-actions.css'

export interface MessageLiteraturePaper {
  id: string
  title: string
  authors?: readonly string[]
  year?: number
  venue?: string
}

export interface MessageLiteratureActionsProps {
  papers: readonly MessageLiteraturePaper[]
  addedPaperIds?: readonly string[] | ReadonlySet<string>
  onAddPaper: (paper: MessageLiteraturePaper) => Promise<void>
  disabled?: boolean
  className?: string
}

type AddStatus = 'adding' | 'added' | 'failed'

function paperMeta(paper: MessageLiteraturePaper): string {
  return [paper.authors?.join('、'), paper.year, paper.venue].filter(Boolean).join(' · ')
}

export function MessageLiteratureActions({
  papers,
  addedPaperIds = [],
  onAddPaper,
  disabled = false,
  className,
}: MessageLiteratureActionsProps) {
  const [statusById, setStatusById] = useState<Record<string, AddStatus>>({})
  const [batchAdding, setBatchAdding] = useState(false)
  const inFlightIds = useRef(new Set<string>())
  const locallyAddedIds = useRef(new Set<string>())
  const uniquePapers = useMemo(() => {
    const byId = new Map<string, MessageLiteraturePaper>()
    papers.forEach((paper) => {
      const id = paper.id.trim()
      if (id && paper.title.trim() && !byId.has(id)) byId.set(id, paper)
    })
    return [...byId.values()]
  }, [papers])
  const externalAddedIds = useMemo(
    () => new Set(Array.isArray(addedPaperIds) ? addedPaperIds : [...addedPaperIds]),
    [addedPaperIds],
  )

  useEffect(() => {
    setStatusById((current) => {
      let changed = false
      const next = { ...current }
      externalAddedIds.forEach((id) => {
        if (next[id] !== 'added') {
          next[id] = 'added'
          changed = true
        }
      })
      return changed ? next : current
    })
  }, [externalAddedIds])

  const isAdded = (paperId: string) => (
    externalAddedIds.has(paperId)
    || locallyAddedIds.current.has(paperId)
    || statusById[paperId] === 'added'
  )

  const addPaper = async (paper: MessageLiteraturePaper): Promise<boolean> => {
    if (disabled || isAdded(paper.id) || inFlightIds.current.has(paper.id)) return isAdded(paper.id)
    inFlightIds.current.add(paper.id)
    setStatusById((current) => ({ ...current, [paper.id]: 'adding' }))
    try {
      await onAddPaper(paper)
      locallyAddedIds.current.add(paper.id)
      setStatusById((current) => ({ ...current, [paper.id]: 'added' }))
      return true
    } catch {
      setStatusById((current) => ({ ...current, [paper.id]: 'failed' }))
      return false
    } finally {
      inFlightIds.current.delete(paper.id)
    }
  }

  const addAll = async () => {
    if (disabled || batchAdding) return
    const pending = uniquePapers.filter((paper) => !isAdded(paper.id) && !inFlightIds.current.has(paper.id))
    if (pending.length === 0) return
    setBatchAdding(true)
    try {
      await Promise.all(pending.map((paper) => addPaper(paper)))
    } finally {
      setBatchAdding(false)
    }
  }

  if (uniquePapers.length === 0) return null

  const allAdded = uniquePapers.every((paper) => isAdded(paper.id))
  const rootClassName = ['message-literature-actions', className].filter(Boolean).join(' ')

  return (
    <section className={rootClassName} aria-label="本轮检索到的论文">
      <div className="message-literature-actions__heading">
        <span>本轮检索论文</span>
        {allAdded ? (
          <span className="message-literature-actions__all-done"><Check size={13} aria-hidden="true" /> 已全部添加</span>
        ) : (
          <button
            type="button"
            className="message-literature-actions__text-action"
            disabled={disabled || batchAdding}
            onClick={() => void addAll()}
          >
            {batchAdding ? <><LoaderCircle size={13} className="spin" aria-hidden="true" /> 全部添加中</> : '全部添加'}
          </button>
        )}
      </div>
      <ul className="message-literature-actions__list">
        {uniquePapers.map((paper) => {
          const status = isAdded(paper.id) ? 'added' : statusById[paper.id]
          const meta = paperMeta(paper)
          return (
            <li key={paper.id}>
              <div className="message-literature-actions__paper">
                <strong>{paper.title}</strong>
                {meta && <small>{meta}</small>}
              </div>
              <div className="message-literature-actions__status" aria-live="polite">
                {status === 'added' ? (
                  <span className="is-added"><Check size={13} aria-hidden="true" /> 已添加</span>
                ) : status === 'adding' ? (
                  <span><LoaderCircle size={13} className="spin" aria-hidden="true" /> 添加中</span>
                ) : (
                  <button
                    type="button"
                    className={`message-literature-actions__text-action${status === 'failed' ? ' is-failed' : ''}`}
                    disabled={disabled || batchAdding}
                    onClick={() => void addPaper(paper)}
                    aria-label={`${status === 'failed' ? '重新添加' : '添加到文献栏'}：${paper.title}`}
                  >
                    {status === 'failed' ? '添加失败，重试' : '添加到文献栏'}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

