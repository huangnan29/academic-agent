import { useEffect, useState } from 'react'
import type { SectionStreamEvent, WorkspaceState } from '../../shared/contracts'
import { DEFAULT_APPEARANCE_SETTINGS } from '../../shared/contracts'
import { paperAgent } from '../fallback'

export type ToastState = { message: string; tone: 'success' | 'error' }

export type SectionGenerationCandidate = {
  sectionId: string
  content: string
  reasoningContent: string
  providerId: string
  model: string
  thinkingRequested: boolean
}

export const emptyWorkspace: WorkspaceState = {
  schemaVersion: 1,
  projects: [],
  conversations: [],
  attachments: [],
  messages: [],
  providers: [],
  literature: [],
  outlines: {},
  outlineArchitectures: {},
  outlineQualityReports: {},
  sections: [],
  sectionVersions: [],
  citations: [],
  runs: [],
  mcpServers: [],
  skills: [],
  artifacts: [],
  settings: { appearance: DEFAULT_APPEARANCE_SETTINGS, demoMode: false },
}

export function useWorkspaceRuntime() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(emptyWorkspace)
  const [loading, setLoading] = useState(true)
  const [activeRunId, setActiveRunId] = useState<string>()
  const [sectionGenerationCandidate, setSectionGenerationCandidate] = useState<SectionGenerationCandidate>()
  const [toast, setToast] = useState<ToastState>()

  const refreshWorkspace = async () => {
    const next = await paperAgent.workspace.get()
    setWorkspace(next)
  }

  const showToast = (message: string, tone: ToastState['tone'] = 'success') => setToast({ message, tone })

  useEffect(() => {
    refreshWorkspace()
      .catch(() => setToast({ message: '无法读取本机工作区', tone: 'error' }))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(undefined), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const dispose = paperAgent.chat.onEvent((event) => {
      setWorkspace((current) => {
        const next = structuredClone(current)
        if (event.type === 'started') {
          if (!next.messages.some((message) => message.id === event.message.id)) next.messages.push(event.message)
        } else if (event.type === 'text-delta') {
          const message = next.messages.find((item) => item.runId === event.runId)
          if (message) message.content += event.delta
        } else if (event.type === 'reasoning-delta') {
          const message = next.messages.find((item) => item.runId === event.runId)
          if (message) message.reasoningContent = `${message.reasoningContent ?? ''}${event.delta}`
        } else if (event.type === 'completed' || event.type === 'cancelled') {
          const index = next.messages.findIndex((item) => item.runId === event.runId)
          if (index >= 0) next.messages[index] = event.message
          else next.messages.push(event.message)
        }
        return next
      })
      if (event.type === 'completed' || event.type === 'cancelled' || event.type === 'error') {
        setActiveRunId(undefined)
        paperAgent.workspace.get().then(setWorkspace).catch(() => undefined)
      }
      if (event.type === 'error') setToast({ message: event.message, tone: 'error' })
    })
    return dispose
  }, [])

  useEffect(() => {
    const dispose = paperAgent.section.onEvent((event: SectionStreamEvent) => {
      if (event.type === 'started') {
        setSectionGenerationCandidate({
          sectionId: event.sectionId,
          content: '',
          reasoningContent: '',
          providerId: event.providerId,
          model: event.model,
          thinkingRequested: event.thinkingRequested,
        })
      } else if (event.type === 'text-delta') {
        setSectionGenerationCandidate((current) => current?.sectionId === event.sectionId
          ? { ...current, content: `${current.content}${event.delta}` }
          : current)
      } else if (event.type === 'reasoning-delta') {
        setSectionGenerationCandidate((current) => current?.sectionId === event.sectionId
          ? { ...current, reasoningContent: `${current.reasoningContent}${event.delta}` }
          : current)
      } else {
        setSectionGenerationCandidate((current) => current?.sectionId === event.sectionId ? undefined : current)
      }
      setWorkspace((current) => {
        const next = structuredClone(current)
        const index = next.sections.findIndex((section) => section.id === event.sectionId)
        if (index < 0) return current
        const section = next.sections[index]
        if (event.type === 'started') {
          section.status = 'generating'
          section.generationError = undefined
          section.generationProviderId = event.providerId
          section.generationModel = event.model
          section.thinkingRequested = event.thinkingRequested
        } else if (event.type === 'completed' || event.type === 'error') {
          next.sections[index] = event.section
        }
        return next
      })
    })
    return dispose
  }, [])

  return {
    workspace,
    setWorkspace,
    loading,
    activeRunId,
    setActiveRunId,
    sectionGenerationCandidate,
    setSectionGenerationCandidate,
    refreshWorkspace,
    toast,
    setToast,
    showToast,
  }
}
