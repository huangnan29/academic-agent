import { app, ipcMain } from 'electron'
import { toUserMessage } from '../errors'
import type { IpcHandler } from './types'

let trustedRendererWebContentsId: number | undefined

export function setTrustedRendererWebContentsId(id: number): void {
  trustedRendererWebContentsId = id
}

export function handle(channel: string, listener: IpcHandler): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (!isTrustedIpcSender(event)) throw new Error('已拒绝非受信页面的应用请求。')
      return await listener(event, ...args)
    } catch (error) {
      throw new Error(toUserMessage(error))
    }
  })
}

function isTrustedIpcSender(event: Electron.IpcMainInvokeEvent): boolean {
  if (!trustedRendererWebContentsId || event.sender.id !== trustedRendererWebContentsId) return false
  const frame = event.senderFrame
  if (!frame || frame !== event.sender.mainFrame) return false
  try {
    const url = new URL(frame.url)
    if (app.isPackaged) {
      return url.protocol === 'file:' && decodeURIComponent(url.pathname).endsWith('/dist/index.html')
    }
    const configured = process.env.ELECTRON_RENDERER_URL
    return Boolean(configured && url.origin === new URL(configured).origin)
  } catch {
    return false
  }
}
