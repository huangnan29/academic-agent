// 对话消息流视图；从 App.tsx 抽出。
import { BookOpen, Bot, LoaderCircle, MessageSquareText, PencilLine } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ChatMessage, LiteratureRecord } from '../../shared/contracts'
import { formatTime } from '../lib/format'
import { EmptyState, MarkdownMessage, StatusBadge, ThinkingBlock } from './common'
import { MessageLiteratureActions } from './MessageLiteratureActions'

export function ChatView({
  messages,
  projectTitle,
  literature,
  onAddLiterature,
  onShowLiterature,
}: {
  messages: ChatMessage[]
  projectTitle: string
  literature: LiteratureRecord[]
  onAddLiterature: (messageId: string, candidateId: string) => Promise<void>
  onShowLiterature: () => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="chat-empty-wrap">
        <EmptyState
          icon={MessageSquareText}
          title="从研究要求开始"
          description={`围绕“${projectTitle}”提出任务。Agent 会保留项目、文献和文稿上下文。`}
        />
      </div>
    )
  }

  return (
    <div className="conversation-stream">
      {messages.map((message) => {
        const candidates = message.literatureCandidates ?? []
        const addedCandidateIds = candidates
          .filter((candidate) => literature.some((record) => (
            (candidate.doi && record.doi && candidate.doi.toLocaleLowerCase() === record.doi.toLocaleLowerCase())
            || normalizeMessageLiteratureTitle(candidate.title) === normalizeMessageLiteratureTitle(record.title)
          )))
          .map((candidate) => candidate.id)
        return (
        <article key={message.id} className={`message message-${message.role}`}>
          <div className="message-avatar" aria-hidden="true">
            {message.role === 'user' ? '你' : <Bot size={17} />}
          </div>
          <div className="message-main">
            <div className="message-meta">
              <strong>{message.role === 'user' ? '你' : '学术 Agent'}</strong>
              <span>{formatTime(message.createdAt)}</span>
              {message.origin === 'demo' && <span className="demo-text">演示</span>}
            </div>
            {message.role === 'assistant' && message.reasoningContent && (
              <ThinkingBlock content={message.reasoningContent} streaming={message.status === 'streaming'} />
            )}
            <MarkdownMessage content={message.content || '正在生成…'} />
            {message.role === 'assistant' && candidates.length > 0 && (
              <MessageLiteratureActions
                papers={candidates}
                addedPaperIds={addedCandidateIds}
                disabled={message.status === 'streaming'}
                onAddPaper={(paper) => onAddLiterature(message.id, paper.id)}
              />
            )}
            {message.status === 'streaming' && (
              <span className="streaming-line">
                <LoaderCircle size={13} className="spin" /> 正在生成
              </span>
            )}
            {message.status === 'cancelled' && <StatusBadge status="stopped">已停止，已保留生成内容</StatusBadge>}
            {message.status === 'error' && <StatusBadge status="error">{message.error || '生成失败'}</StatusBadge>}
            {message.role === 'assistant' && message.status === 'completed' && (
              <div className="message-actions">
                <button type="button" onClick={onShowLiterature}>
                  <BookOpen size={14} /> 查看引用状态
                </button>
                <button
                  type="button"
                  disabled
                  aria-label="基于此回复修改，首版暂未开放"
                  title="首版暂未开放；请直接在下方输入修改要求"
                >
                  <PencilLine size={14} /> 基于此回复修改
                </button>
              </div>
            )}
          </div>
        </article>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}

function normalizeMessageLiteratureTitle(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '')
  return normalized || value.normalize('NFKC').toLocaleLowerCase().trim()
}
