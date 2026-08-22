import { app, BrowserWindow, shell } from 'electron'
import { IPC } from '../../../shared/ipc'
import { isAllowedExternalUrl } from '../window'
import { assertId } from './common'
import { handle } from './runtime'
import type { IpcDependencies, RegisterIpcHandler } from './types'

export function registerExportHandlers(
  dependencies: IpcDependencies,
  register: RegisterIpcHandler = handle,
): void {
  const { exporter } = dependencies

  register(IPC.exportProject, async (event, projectId: unknown, format: unknown) => {
    assertId(projectId, '项目')
    if (format !== 'md' && format !== 'docx') throw new Error('不支持该导出格式。')
    return exporter.exportProject(
      projectId,
      format,
      BrowserWindow.fromWebContents(event.sender) ?? undefined,
    )
  })

  register(IPC.artifactReveal, async (_event, path: unknown) => {
    if (typeof path !== 'string' || !path) throw new Error('文件路径无效。')
    exporter.reveal(path)
  })

  register(IPC.externalOpen, async (_event, url: unknown) => {
    if (typeof url !== 'string' || !isAllowedExternalUrl(url)) {
      throw new Error('外部链接无效。')
    }
    await shell.openExternal(url)
  })

  // 预留接口：应用版本/平台信息查询，供后续“关于”面板或诊断页使用；当前渲染层与 QA 脚本均无调用方。
  register(IPC.appInfo, () => ({
    version: app.getVersion(),
    platform: process.platform,
    packaged: app.isPackaged,
  }))
}
