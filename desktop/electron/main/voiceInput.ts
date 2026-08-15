import { randomUUID } from 'node:crypto'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { app, type WebContents } from 'electron'
import type { VoiceInputEvent, VoiceRecognitionStatus } from '../../shared/contracts'
import { IPC } from '../../shared/ipc'

interface NativeVoiceMessage {
  type?: string
  transcript?: string
  final?: boolean
  onDevice?: boolean
  available?: boolean
  authorization?: VoiceRecognitionStatus['authorization']
  locale?: string
  code?: string
  message?: string
}

interface ActiveVoiceSession {
  id: string
  process: ChildProcessWithoutNullStreams
  sender: WebContents
  buffer: string
  ended: boolean
}

const MAX_NATIVE_LINE_LENGTH = 128 * 1024

export class VoiceInputService {
  private active?: ActiveVoiceSession

  async status(): Promise<VoiceRecognitionStatus> {
    if (process.platform !== 'darwin') return unsupportedStatus('语音输入目前仅支持 macOS。')
    const executable = this.executablePath()
    try {
      await access(executable)
    } catch {
      return unsupportedStatus('本机语音识别组件尚未构建或未随应用安装。')
    }

    return new Promise((resolve) => {
      const child = spawn(executable, ['--status', '--locale', 'zh-CN'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      let buffer = ''
      let settled = false
      const finish = (status: VoiceRecognitionStatus) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve(status)
      }
      const timeout = setTimeout(() => {
        child.kill('SIGTERM')
        finish(unsupportedStatus('读取 macOS 语音识别状态超时。'))
      }, 10_000)
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        buffer += chunk
        const newline = buffer.indexOf('\n')
        if (newline < 0) return
        const message = parseMessage(buffer.slice(0, newline))
        if (!message || message.type !== 'status') {
          finish(unsupportedStatus('macOS 语音识别组件返回了无效状态。'))
          return
        }
        finish({
          available: message.available === true,
          authorization: isAuthorization(message.authorization) ? message.authorization : 'unknown',
          locale: typeof message.locale === 'string' ? message.locale : 'zh-CN',
          onDevice: message.onDevice === true,
          message: typeof message.message === 'string' ? message.message : undefined,
        })
      })
      child.once('error', () => finish(unsupportedStatus('无法启动 macOS 语音识别组件。')))
      child.once('exit', () => {
        if (!settled) finish(unsupportedStatus('macOS 语音识别组件未返回状态。'))
      })
    })
  }

  async start(sender: WebContents): Promise<{ sessionId: string }> {
    if (process.platform !== 'darwin') throw new Error('语音输入目前仅支持 macOS。')
    await this.stop()
    const executable = this.executablePath()
    try {
      await access(executable)
    } catch {
      throw new Error('本机语音识别组件不可用，请重新安装学术 Agent。')
    }

    const id = randomUUID()
    const child = spawn(executable, ['--locale', 'zh-CN'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    child.stderr.resume()
    const session: ActiveVoiceSession = { id, process: child, sender, buffer: '', ended: false }
    this.active = session
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.consume(session, chunk))
    child.once('error', () => {
      this.emit(session, {
        sessionId: id,
        type: 'error',
        code: 'helper-start-failed',
        message: '无法启动 macOS 语音识别组件。',
      })
      this.finish(session)
    })
    child.once('exit', () => this.finish(session))
    return { sessionId: id }
  }

  async stop(sessionId?: string): Promise<void> {
    const session = this.active
    if (!session || (sessionId && session.id !== sessionId)) return
    this.active = undefined
    session.ended = true
    if (!session.process.killed) {
      session.process.stdin.write('stop\n')
      const timer = setTimeout(() => session.process.kill('SIGTERM'), 1_500)
      session.process.once('exit', () => clearTimeout(timer))
    }
  }

  private executablePath(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'native/academic-speech-helper')
      : join(app.getAppPath(), 'native/bin/academic-speech-helper')
  }

  private consume(session: ActiveVoiceSession, chunk: string): void {
    if (session.ended) return
    session.buffer += chunk
    if (session.buffer.length > MAX_NATIVE_LINE_LENGTH) {
      this.emit(session, {
        sessionId: session.id,
        type: 'error',
        code: 'invalid-native-output',
        message: 'macOS 语音识别返回内容异常，识别已停止。',
      })
      void this.stop(session.id)
      return
    }
    while (true) {
      const newline = session.buffer.indexOf('\n')
      if (newline < 0) break
      const line = session.buffer.slice(0, newline)
      session.buffer = session.buffer.slice(newline + 1)
      const message = parseMessage(line)
      if (!message) continue
      if (message.type === 'ready') {
        this.emit(session, { sessionId: session.id, type: 'started', onDevice: message.onDevice === true })
      } else if (message.type === 'result' && typeof message.transcript === 'string') {
        this.emit(session, {
          sessionId: session.id,
          type: 'result',
          transcript: message.transcript.slice(0, 20_000),
          final: message.final === true,
        })
      } else if (message.type === 'error') {
        this.emit(session, {
          sessionId: session.id,
          type: 'error',
          code: typeof message.code === 'string' ? message.code : 'recognition-failed',
          message: safeNativeMessage(message.message),
        })
      } else if (message.type === 'ended') {
        this.emit(session, { sessionId: session.id, type: 'ended' })
        session.ended = true
        if (this.active?.id === session.id) this.active = undefined
      }
    }
  }

  private emit(session: ActiveVoiceSession, event: VoiceInputEvent): void {
    if (!session.sender.isDestroyed()) session.sender.send(IPC.voiceInputEvent, event)
  }

  private finish(session: ActiveVoiceSession): void {
    if (this.active?.id === session.id) this.active = undefined
    if (!session.ended) {
      session.ended = true
      this.emit(session, { sessionId: session.id, type: 'ended' })
    }
  }
}

function parseMessage(line: string): NativeVoiceMessage | undefined {
  try {
    const parsed: unknown = JSON.parse(line)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as NativeVoiceMessage
      : undefined
  } catch {
    return undefined
  }
}

function safeNativeMessage(message: unknown): string {
  if (typeof message !== 'string' || !message.trim()) return 'macOS 语音识别失败，请重试。'
  return message.replace(/[\r\n\0]+/g, ' ').trim().slice(0, 500)
}

function unsupportedStatus(message: string): VoiceRecognitionStatus {
  return {
    available: false,
    authorization: 'unsupported',
    locale: 'zh-CN',
    onDevice: false,
    message,
  }
}

function isAuthorization(value: unknown): value is VoiceRecognitionStatus['authorization'] {
  return value === 'authorized'
    || value === 'denied'
    || value === 'not-determined'
    || value === 'restricted'
    || value === 'unsupported'
    || value === 'unknown'
}
