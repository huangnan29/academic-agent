import {
  DEFAULT_APPEARANCE_SETTINGS,
  type AppearanceSettings,
  type AppearanceSettingsInput,
  type AppearancePalette,
  type AppearanceThemeDocument,
} from './contracts'

const HEX_COLOR = /^#[0-9a-f]{6}$/i
const THEMES = new Set(['system', 'light', 'dark'])
const UI_FONTS = new Set(['system', 'inter', 'serif', 'monospace'])
const DOCK_ICONS = new Set(['academic', 'assistant'])
const REDUCED_MOTION = new Set(['system', 'on', 'off'])
const DIFF_STYLES = new Set(['color', 'symbol'])
const THEME_DOCUMENT_KEYS = new Set([
  'version',
  'presetName',
  'palettes',
  'uiFont',
  'translucentSidebar',
  'contrast',
])
const PALETTE_KEYS = new Set(['accent', 'background', 'foreground'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizePalette(candidate: unknown, defaults: AppearancePalette): AppearancePalette {
  const value = isRecord(candidate) ? candidate : {}
  return {
    accent: typeof value.accent === 'string' && HEX_COLOR.test(value.accent)
      ? value.accent.toLowerCase()
      : defaults.accent,
    background: typeof value.background === 'string' && HEX_COLOR.test(value.background)
      ? value.background.toLowerCase()
      : defaults.background,
    foreground: typeof value.foreground === 'string' && HEX_COLOR.test(value.foreground)
      ? value.foreground.toLowerCase()
      : defaults.foreground,
  }
}

/**
 * 读取旧工作区或浏览器本地数据时采用容错归一化；非法字段只回退该字段，
 * 不让单个旧值破坏整个工作区。
 */
export function normalizeAppearanceSettings(candidate: unknown): AppearanceSettings {
  const value = isRecord(candidate) ? candidate : {}
  const palettes = isRecord(value.palettes) ? value.palettes : {}
  // 兼容开发预览曾短暂使用的单调色板字段，只迁移到浅色调色板。
  const legacyLight = {
    accent: value.accent,
    background: value.background,
    foreground: value.foreground,
  }
  return {
    theme: THEMES.has(value.theme as string)
      ? value.theme as AppearanceSettings['theme']
      : DEFAULT_APPEARANCE_SETTINGS.theme,
    palettes: {
      light: normalizePalette(
        palettes.light ?? legacyLight,
        DEFAULT_APPEARANCE_SETTINGS.palettes.light,
      ),
      dark: normalizePalette(
        palettes.dark,
        DEFAULT_APPEARANCE_SETTINGS.palettes.dark,
      ),
    },
    uiFont: UI_FONTS.has(value.uiFont as string)
      ? value.uiFont as AppearanceSettings['uiFont']
      : DEFAULT_APPEARANCE_SETTINGS.uiFont,
    translucentSidebar: typeof value.translucentSidebar === 'boolean'
      ? value.translucentSidebar
      : DEFAULT_APPEARANCE_SETTINGS.translucentSidebar,
    contrast: typeof value.contrast === 'number' && Number.isFinite(value.contrast)
      ? Math.max(0, Math.min(100, Math.round(value.contrast)))
      : DEFAULT_APPEARANCE_SETTINGS.contrast,
    pointerCursor: typeof value.pointerCursor === 'boolean'
      ? value.pointerCursor
      : DEFAULT_APPEARANCE_SETTINGS.pointerCursor,
    dockIcon: DOCK_ICONS.has(value.dockIcon as string)
      ? value.dockIcon as AppearanceSettings['dockIcon']
      : DEFAULT_APPEARANCE_SETTINGS.dockIcon,
    reducedMotion: REDUCED_MOTION.has(value.reducedMotion as string)
      ? value.reducedMotion as AppearanceSettings['reducedMotion']
      : DEFAULT_APPEARANCE_SETTINGS.reducedMotion,
    uiFontSize: typeof value.uiFontSize === 'number' && Number.isFinite(value.uiFontSize)
      ? Math.max(12, Math.min(20, Math.round(value.uiFontSize)))
      : DEFAULT_APPEARANCE_SETTINGS.uiFontSize,
    diffStyle: DIFF_STYLES.has(value.diffStyle as string)
      ? value.diffStyle as AppearanceSettings['diffStyle']
      : DEFAULT_APPEARANCE_SETTINGS.diffStyle,
    fontSmoothing: typeof value.fontSmoothing === 'boolean'
      ? value.fontSmoothing
      : DEFAULT_APPEARANCE_SETTINGS.fontSmoothing,
  }
}

export function mergeAppearanceSettings(
  current: AppearanceSettings,
  patch: AppearanceSettingsInput,
): AppearanceSettings {
  return normalizeAppearanceSettings({
    ...current,
    ...patch,
    palettes: patch.palettes
      ? {
          light: { ...current.palettes.light, ...patch.palettes.light },
          dark: { ...current.palettes.dark, ...patch.palettes.dark },
        }
      : current.palettes,
  })
}

export function createAppearanceThemeDocument(
  appearance: AppearanceSettings,
): AppearanceThemeDocument {
  const normalized = normalizeAppearanceSettings(appearance)
  return {
    version: 1,
    palettes: normalized.palettes,
    uiFont: normalized.uiFont,
    translucentSidebar: normalized.translucentSidebar,
    contrast: normalized.contrast,
  }
}

/** 导入主题时只更新可移植主题字段，不覆盖个人偏好。 */
export function appearancePatchFromThemeDocument(
  document: AppearanceThemeDocument,
): AppearanceSettingsInput {
  return {
    palettes: document.palettes,
    uiFont: document.uiFont,
    translucentSidebar: document.translucentSidebar,
    contrast: document.contrast,
  }
}

/** 浏览器演示导入也执行白名单校验；主进程仍以 Zod schema 作为安全边界。 */
export function parseAppearanceThemeDocument(candidate: unknown): AppearanceThemeDocument {
  if (!isRecord(candidate) || Object.keys(candidate).some((key) => !THEME_DOCUMENT_KEYS.has(key))) {
    throw new Error('主题 JSON 含有不支持的字段。')
  }
  if (candidate.version !== 1) throw new Error('主题 JSON 版本不受支持。')
  if (
    candidate.presetName !== undefined &&
    (typeof candidate.presetName !== 'string' || !candidate.presetName.trim() || candidate.presetName.length > 80)
  ) {
    throw new Error('主题名称无效。')
  }
  if (!isRecord(candidate.palettes)) throw new Error('主题缺少浅色或深色调色板。')
  const parsePalette = (value: unknown): AppearancePalette => {
    if (
      !isRecord(value) ||
      Object.keys(value).some((key) => !PALETTE_KEYS.has(key)) ||
      !['accent', 'background', 'foreground'].every(
        (key) => typeof value[key] === 'string' && HEX_COLOR.test(value[key] as string),
      )
    ) {
      throw new Error('主题调色板必须只包含有效的 #RRGGBB 颜色。')
    }
    return normalizePalette(value, DEFAULT_APPEARANCE_SETTINGS.palettes.light)
  }
  if (!UI_FONTS.has(candidate.uiFont as string)) throw new Error('主题字体不受支持。')
  if (typeof candidate.translucentSidebar !== 'boolean') throw new Error('半透明侧栏设置无效。')
  if (
    typeof candidate.contrast !== 'number' ||
    !Number.isInteger(candidate.contrast) ||
    candidate.contrast < 0 ||
    candidate.contrast > 100
  ) {
    throw new Error('主题对比度必须是 0 到 100 的整数。')
  }
  return {
    version: 1,
    presetName: candidate.presetName?.trim(),
    palettes: {
      light: parsePalette(candidate.palettes.light),
      dark: parsePalette(candidate.palettes.dark),
    },
    uiFont: candidate.uiFont as AppearanceThemeDocument['uiFont'],
    translucentSidebar: candidate.translucentSidebar,
    contrast: candidate.contrast,
  }
}
