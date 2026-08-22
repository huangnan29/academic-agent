import { readFile, stat } from 'node:fs/promises'
import { BrowserWindow, clipboard, dialog } from 'electron'
import {
  appearancePatchFromThemeDocument,
  createAppearanceThemeDocument,
} from '../../../shared/appearance'
import { IPC } from '../../../shared/ipc'
import {
  appearanceSettingsInputSchema,
  appearanceThemeDocumentSchema,
} from '../schemas'
import { isSystemPermissionKind } from './common'
import { handle } from './runtime'
import type { IpcDependencies, RegisterIpcHandler } from './types'

export function registerSettingsHandlers(
  dependencies: IpcDependencies,
  register: RegisterIpcHandler = handle,
): void {
  const { repository, systemPermissions, voiceInput } = dependencies

  register(IPC.appearanceUpdate, async (_event, payload: unknown) => {
    const next = await repository.setAppearance(appearanceSettingsInputSchema.parse(payload))
    await dependencies.applyAppearance(next.settings.appearance)
    return next
  })

  register(IPC.appearanceImportTheme, async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const options: Electron.OpenDialogOptions = {
      title: '导入外观主题',
      buttonLabel: '导入',
      filters: [{ name: '学术 Agent 主题', extensions: ['json'] }],
      properties: ['openFile'],
      message: '仅导入由学术 Agent 复制的版本化 JSON 外观主题。',
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return repository.snapshot()

    const selectedPath = result.filePaths[0]
    const metadata = await stat(selectedPath)
    if (!metadata.isFile() || metadata.size <= 0 || metadata.size > 64 * 1024) {
      throw new Error('主题文件必须是小于 64 KB 的非空 JSON 文件。')
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(selectedPath, 'utf8'))
    } catch {
      throw new Error('主题文件不是有效的 JSON。')
    }
    const document = appearanceThemeDocumentSchema.parse(parsed)
    const next = await repository.setAppearance(appearancePatchFromThemeDocument(document))
    await dependencies.applyAppearance(next.settings.appearance)
    return next
  })

  register(IPC.appearanceCopyTheme, () => {
    const document = createAppearanceThemeDocument(repository.snapshot().settings.appearance)
    const serialized = `${JSON.stringify(document, null, 2)}\n`
    clipboard.writeText(serialized)
    return serialized
  })

  register(IPC.systemPermissionsGet, () => systemPermissions.snapshot())

  register(IPC.systemPermissionsRequestFullAccess, () =>
    systemPermissions.requestFullAccess(),
  )

  register(IPC.systemPermissionsRequestMicrophone, () =>
    systemPermissions.requestMicrophone(),
  )

  register(IPC.systemPermissionsOpenSettings, async (_event, kind: unknown) => {
    if (!isSystemPermissionKind(kind)) throw new Error('系统权限类型无效。')
    await systemPermissions.openSettings(kind)
  })

  register(IPC.voiceInputStatus, () => voiceInput.status())

  register(IPC.voiceInputStart, async (event) => {
    const permissions = await systemPermissions.snapshot()
    if (permissions.microphone !== 'granted') {
      throw new Error('macOS 尚未允许学术 Agent 使用麦克风，请先完成系统授权。')
    }
    return voiceInput.start(event.sender)
  })

  register(IPC.voiceInputStop, async (_event, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || sessionId.length < 1 || sessionId.length > 100) {
      throw new Error('语音识别会话无效。')
    }
    await voiceInput.stop(sessionId)
  })
}
