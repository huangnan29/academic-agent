import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { shell, systemPreferences } from 'electron'
import type {
  SystemPermissionKind,
  SystemPermissionSnapshot,
  SystemPermissionStatus,
} from '../../shared/contracts'

const SETTINGS_URLS: Record<SystemPermissionKind, string> = {
  accessibility:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  'full-disk-access':
    'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
  'screen-recording':
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
}

const PROTECTED_DIRECTORIES = [
  join(homedir(), 'Library', 'Mail'),
  join(homedir(), 'Library', 'Messages'),
  join(homedir(), 'Library', 'Safari'),
]

/**
 * 所有 macOS 隐私权限都在主进程检测和申请，渲染层只能调用窄化后的 IPC。
 * 完全磁盘访问没有公开的授权 API，因此这里只做只读探测，并把用户送到系统设置。
 */
export class SystemPermissionService {
  async snapshot(): Promise<SystemPermissionSnapshot> {
    if (process.platform !== 'darwin') return unsupportedSnapshot()

    const accessibility = systemPreferences.isTrustedAccessibilityClient(false)
      ? 'granted'
      : 'denied'
    const fullDiskAccess = await detectFullDiskAccess()
    const screenRecording = normalizeMediaStatus(
      systemPreferences.getMediaAccessStatus('screen'),
    )

    return {
      platform: 'macos',
      accessibility,
      fullDiskAccess,
      screenRecording,
      fullAccessReady:
        accessibility === 'granted' && fullDiskAccess === 'granted',
      checkedAt: new Date().toISOString(),
    }
  }

  async requestFullAccess(): Promise<SystemPermissionSnapshot> {
    if (process.platform !== 'darwin') return unsupportedSnapshot()

    const trusted = systemPreferences.isTrustedAccessibilityClient(true)
    // 系统对话框返回后重新读取一次，避免把发起申请误报成已经授权。
    await new Promise((resolve) => setTimeout(resolve, 180))
    const next = await this.snapshot()

    if (!trusted && next.accessibility !== 'granted') {
      await this.openSettings('accessibility')
    } else if (next.fullDiskAccess !== 'granted') {
      await this.openSettings('full-disk-access')
    }
    return next
  }

  async openSettings(kind: SystemPermissionKind): Promise<void> {
    if (process.platform !== 'darwin') {
      throw new Error('系统权限设置仅支持 macOS。')
    }
    const target = SETTINGS_URLS[kind]
    if (!target) throw new Error('不支持该系统权限类型。')
    await shell.openExternal(target)
  }
}

async function detectFullDiskAccess(): Promise<SystemPermissionStatus> {
  for (const directory of PROTECTED_DIRECTORIES) {
    try {
      await readdir(directory)
      return 'granted'
    } catch (error) {
      const code = readErrorCode(error)
      if (code === 'ENOENT') continue
      if (code === 'EACCES' || code === 'EPERM') return 'denied'
    }
  }
  return 'unknown'
}

function readErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

function normalizeMediaStatus(value: string): SystemPermissionStatus {
  return ['granted', 'denied', 'not-determined', 'restricted', 'unknown'].includes(value)
    ? (value as SystemPermissionStatus)
    : 'unknown'
}

function unsupportedSnapshot(): SystemPermissionSnapshot {
  return {
    platform: 'unsupported',
    accessibility: 'unsupported',
    fullDiskAccess: 'unsupported',
    screenRecording: 'unsupported',
    fullAccessReady: false,
    checkedAt: new Date().toISOString(),
  }
}
