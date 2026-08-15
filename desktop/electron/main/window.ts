import { isIP } from 'node:net'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, nativeImage, nativeTheme, shell } from 'electron'
import type { AppearanceSettings } from '../../shared/contracts'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    backgroundColor: '#f7f7f6',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: {
      preload: join(currentDirectory, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  })

  window.once('ready-to-show', () => window.show())

  // 语音输入只允许当前主窗口的本地渲染页请求音频；摄像头和子框架请求始终拒绝。
  window.webContents.session.setPermissionCheckHandler((webContents, permission, _origin, details) => (
    webContents?.id === window.webContents.id
    && permission === 'media'
    && (details.mediaType === 'audio' || details.mediaType === 'unknown')
    && details.isMainFrame
    && isTrustedRendererUrl(details.requestingUrl ?? window.webContents.getURL())
  ))
  window.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const mediaTypes = 'mediaTypes' in details ? details.mediaTypes ?? [] : []
    callback(
      webContents.id === window.webContents.id
      && permission === 'media'
      && details.isMainFrame
      && mediaTypes.includes('audio')
      && !mediaTypes.includes('video')
      && isTrustedRendererUrl(details.requestingUrl),
    )
  })

  // 应用内不允许任意页面覆盖当前工作区。
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    const currentUrl = window.webContents.getURL()
    if (url !== currentUrl) event.preventDefault()
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) void window.loadURL(rendererUrl)
  else void window.loadFile(join(currentDirectory, '../../dist/index.html'))

  return window
}

function isTrustedRendererUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (app.isPackaged) {
      return url.protocol === 'file:' && decodeURIComponent(url.pathname).endsWith('/dist/index.html')
    }
    const configured = process.env.ELECTRON_RENDERER_URL
    return Boolean(configured && url.origin === new URL(configured).origin)
  } catch {
    return false
  }
}

/**
 * 仅应用已经持久化并经过 IPC schema 校验的外观值。
 * Dock 图标只能来自应用包内资源或 macOS 内置图像，渲染层不能提供路径。
 */
export function applyNativeAppearance(
  window: BrowserWindow,
  appearance: AppearanceSettings,
): void {
  if (nativeTheme.themeSource !== appearance.theme) nativeTheme.themeSource = appearance.theme
  const dark = appearance.theme === 'dark'
    || (appearance.theme === 'system' && nativeTheme.shouldUseDarkColors)
  const palette = dark ? appearance.palettes.dark : appearance.palettes.light
  window.setBackgroundColor(palette.background)

  if (process.platform === 'darwin') {
    window.setVibrancy(appearance.translucentSidebar ? 'sidebar' : null)
    applyDockIcon(appearance.dockIcon)
  }
}

function applyDockIcon(dockIcon: AppearanceSettings['dockIcon']): void {
  if (!app.dock) return
  const image = dockIcon === 'assistant'
    ? nativeImage.createFromPath(join(app.getAppPath(), 'build', 'dock-icon-dark.png'))
    : nativeImage.createFromPath(join(app.getAppPath(), 'dist', 'icon.png'))
  if (!image.isEmpty()) app.dock.setIcon(image)
}

export function isAllowedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.username || url.password) return false
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && isLoopbackHostname(url.hostname)
  } catch {
    return false
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true
  if (isIP(normalized) === 4) return normalized.split('.')[0] === '127'
  return isIP(normalized) === 6 && normalized === '::1'
}
