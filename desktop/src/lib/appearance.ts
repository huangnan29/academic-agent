// 外观设置到 CSS 变量的映射；从 App.tsx 抽出。
import type { CSSProperties } from 'react'
import type { AppearanceSettings } from '../../shared/contracts'

const appearanceFontFamilies: Record<AppearanceSettings['uiFont'], string> = {
  system: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif',
  inter: '"Avenir Next", Avenir, "PingFang SC", sans-serif',
  serif: '"New York", "Songti SC", "STSong", serif',
  monospace: '"SFMono-Regular", "SF Mono", Menlo, Monaco, monospace',
}

export function appearanceVariables(appearance: AppearanceSettings, prefersDark: boolean): CSSProperties {
  const effectiveTheme = appearance.theme === 'system' ? (prefersDark ? 'dark' : 'light') : appearance.theme
  const palette = appearance.palettes[effectiveTheme]
  const contrastRatio = appearance.contrast / 100
  const surfaceMix = 2 + contrastRatio * 4
  const strongMix = 5 + contrastRatio * 7
  const hoverMix = 8 + contrastRatio * 9
  const borderMix = 12 + contrastRatio * 16
  return {
    '--background': palette.background,
    '--text': palette.foreground,
    '--brand': palette.accent,
    '--surface': `color-mix(in srgb, ${palette.background} ${100 - surfaceMix}%, ${palette.foreground})`,
    '--surface-strong': `color-mix(in srgb, ${palette.background} ${100 - strongMix}%, ${palette.foreground})`,
    '--surface-hover': `color-mix(in srgb, ${palette.background} ${100 - hoverMix}%, ${palette.foreground})`,
    '--border': `color-mix(in srgb, ${palette.background} ${100 - borderMix}%, ${palette.foreground})`,
    '--border-strong': `color-mix(in srgb, ${palette.background} ${Math.max(45, 74 - contrastRatio * 24)}%, ${palette.foreground})`,
    '--ui-font-family': appearanceFontFamilies[appearance.uiFont],
    '--ui-font-scale': appearance.uiFontSize / 14,
    '--appearance-contrast': appearance.contrast,
  } as CSSProperties
}
