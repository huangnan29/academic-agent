import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { paperAgent } from '../../fallback'

type SpeechSession = {
  sessionId?: string
  baseValue: string
  insertionPoint: number
}

type UseVoiceInputOptions = {
  interactionLocked: boolean
  value: string
  cursorPosition: number
  textareaRef: RefObject<HTMLTextAreaElement | null>
  setValue: Dispatch<SetStateAction<string>>
  setCursorPosition: Dispatch<SetStateAction<number>>
  onToast: (message: string, tone?: 'success' | 'error') => void
}

export function useVoiceInput({
  interactionLocked,
  value,
  cursorPosition,
  textareaRef,
  setValue,
  setCursorPosition,
  onToast,
}: UseVoiceInputOptions) {
  const [speechActive, setSpeechActive] = useState(false)
  const [speechRequesting, setSpeechRequesting] = useState(false)
  const speechSessionRef = useRef<SpeechSession | undefined>(undefined)

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
      const session: SpeechSession = {
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

  useEffect(() => () => stopSpeech(), [])

  return {
    speechActive,
    speechRequesting,
    startSpeech,
    stopSpeech,
  }
}
