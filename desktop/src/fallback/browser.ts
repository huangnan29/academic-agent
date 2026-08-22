import type {
  AppearanceThemeDocument,
  SystemPermissionSnapshot,
} from '../../shared/contracts'
import {
  parseAppearanceThemeDocument,
} from '../../shared/appearance'
import { now } from './state'

export const unsupportedPermissions = (): SystemPermissionSnapshot => ({
  platform: 'unsupported',
  accessibility: 'unsupported',
  fullDiskAccess: 'unsupported',
  screenRecording: 'unsupported',
  microphone: 'unsupported',
  fullAccessReady: false,
  checkedAt: now(),
})

export async function chooseBrowserThemeDocument(): Promise<AppearanceThemeDocument | undefined> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,.json'
  const file = await new Promise<File | undefined>((resolve) => {
    let settled = false
    const finish = (value?: File) => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', handleFocus)
      input.remove()
      resolve(value)
    }
    const handleFocus = () => window.setTimeout(() => finish(input.files?.[0]), 250)
    input.addEventListener('change', () => finish(input.files?.[0]), { once: true })
    window.addEventListener('focus', handleFocus, { once: true })
    input.click()
  })
  if (!file) return undefined
  if (file.size <= 0 || file.size > 64 * 1024) {
    throw new Error('主题文件必须是小于 64 KB 的非空 JSON 文件。')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new Error('主题文件不是有效的 JSON。')
  }
  return parseAppearanceThemeDocument(parsed)
}

export async function copyTextInBrowser(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('浏览器未允许写入剪贴板。')
}
