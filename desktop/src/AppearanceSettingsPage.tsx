import { Check, Copy, Download } from 'lucide-react'
import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type {
  AppearancePalette,
  AppearanceSettings,
  AppearanceSettingsInput,
  AppearanceTheme,
  AppearanceUiFont,
} from '../shared/contracts'
import './appearance-settings.css'

type PaletteMode = keyof AppearanceSettings['palettes']
type PaletteColor = keyof AppearancePalette
type ToastTone = 'success' | 'error'

export interface AppearanceSettingsPageProps {
  appearance: AppearanceSettings
  appIconUrl: string
  darkDockIconUrl?: string
  onChange: (patch: AppearanceSettingsInput) => Promise<void>
  onImport: () => Promise<void>
  onCopy: () => Promise<void>
  onToast: (message: string, tone?: ToastTone) => void
}

interface ThemePreset {
  id: string
  name: string
  patch: Pick<
    AppearanceSettings,
    'palettes' | 'uiFont' | 'translucentSidebar' | 'contrast'
  >
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'academic-warm-paper',
    name: '学术暖纸',
    patch: {
      palettes: {
        light: { accent: '#c43d1a', background: '#fffaf3', foreground: '#29211f' },
        dark: { accent: '#ef876a', background: '#211b19', foreground: '#f5ece8' },
      },
      uiFont: 'system',
      translucentSidebar: false,
      contrast: 56,
    },
  },
  {
    id: 'calm-grayscale',
    name: '冷静灰阶',
    patch: {
      palettes: {
        light: { accent: '#52667a', background: '#f7f9fb', foreground: '#202933' },
        dark: { accent: '#9db0c2', background: '#181c20', foreground: '#edf1f4' },
      },
      uiFont: 'system',
      translucentSidebar: true,
      contrast: 48,
    },
  },
  {
    id: 'midnight-research',
    name: '深夜研究',
    patch: {
      palettes: {
        light: { accent: '#8a5a22', background: '#fbfaf7', foreground: '#25221f' },
        dark: { accent: '#f1b971', background: '#151719', foreground: '#f2eee7' },
      },
      uiFont: 'serif',
      translucentSidebar: true,
      contrast: 68,
    },
  },
]

const THEME_OPTIONS: Array<{ value: AppearanceTheme; label: string }> = [
  { value: 'system', label: '系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

const FONT_OPTIONS: Array<{ value: AppearanceUiFont; label: string }> = [
  { value: 'system', label: '系统字体' },
  { value: 'inter', label: '现代无衬线' },
  { value: 'serif', label: '学术衬线' },
  { value: 'monospace', label: '等宽字体' },
]

const COLOR_ROWS: Array<{ key: PaletteColor; label: string }> = [
  { key: 'accent', label: '强调色' },
  { key: 'background', label: '背景' },
  { key: 'foreground', label: '前景' },
]

function colorDraftsFromAppearance(appearance: AppearanceSettings): Record<string, string> {
  return {
    'light-accent': appearance.palettes.light.accent,
    'light-background': appearance.palettes.light.background,
    'light-foreground': appearance.palettes.light.foreground,
    'dark-accent': appearance.palettes.dark.accent,
    'dark-background': appearance.palettes.dark.background,
    'dark-foreground': appearance.palettes.dark.foreground,
  }
}

function presetMatches(appearance: AppearanceSettings, preset: ThemePreset): boolean {
  return (
    appearance.uiFont === preset.patch.uiFont &&
    appearance.translucentSidebar === preset.patch.translucentSidebar &&
    appearance.contrast === preset.patch.contrast &&
    (['light', 'dark'] as const).every((mode) =>
      (['accent', 'background', 'foreground'] as const).every(
        (key) => appearance.palettes[mode][key].toLowerCase() === preset.patch.palettes[mode][key].toLowerCase(),
      ),
    )
  )
}

function ThemeCard({
  value,
  label,
  selected,
  appearance,
  onSelect,
}: {
  value: AppearanceTheme
  label: string
  selected: boolean
  appearance: AppearanceSettings
  onSelect: () => void
}) {
  const light = appearance.palettes.light
  const dark = appearance.palettes.dark
  const style = {
    '--preview-light-background': light.background,
    '--preview-light-foreground': light.foreground,
    '--preview-light-accent': light.accent,
    '--preview-dark-background': dark.background,
    '--preview-dark-foreground': dark.foreground,
    '--preview-dark-accent': dark.accent,
  } as CSSProperties

  return (
    <button
      type="button"
      className={`appearance-theme-option${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      aria-label={`${label}主题`}
      onClick={onSelect}
    >
      <span className={`appearance-theme-thumbnail is-${value}`} style={style} aria-hidden="true">
        <span className="appearance-theme-title-line" />
        <span className="appearance-theme-card-surface">
          <i /><i /><i />
        </span>
        {selected && <span className="appearance-theme-selected-mark"><Check size={12} /></span>}
      </span>
      <span>{label}</span>
    </button>
  )
}

function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`appearance-switch${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  )
}

function SegmentedControl<T extends string>({
  value,
  label,
  options,
  onChange,
}: {
  value: T
  label: string
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="appearance-segmented-control" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? 'is-selected' : ''}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function AppearanceSettingsPage({
  appearance,
  appIconUrl,
  darkDockIconUrl,
  onChange,
  onImport,
  onCopy,
  onToast,
}: AppearanceSettingsPageProps) {
  const [paletteMode, setPaletteMode] = useState<PaletteMode>('light')
  const [colorDrafts, setColorDrafts] = useState(() => colorDraftsFromAppearance(appearance))

  useEffect(() => {
    setColorDrafts(colorDraftsFromAppearance(appearance))
  }, [appearance.palettes])

  const selectedPreset = useMemo(
    () => THEME_PRESETS.find((preset) => presetMatches(appearance, preset))?.id ?? 'custom',
    [appearance],
  )

  const commit = (patch: AppearanceSettingsInput, fallbackMessage = '外观设置更新失败') => {
    void onChange(patch).catch((error: unknown) => {
      onToast(error instanceof Error ? error.message : fallbackMessage, 'error')
    })
  }

  const commitColor = (mode: PaletteMode, color: PaletteColor, rawValue: string) => {
    const draftKey = `${mode}-${color}`
    const value = rawValue.trim()
    if (!HEX_COLOR.test(value)) {
      setColorDrafts((current) => ({ ...current, [draftKey]: appearance.palettes[mode][color] }))
      onToast('颜色必须使用完整的 #RRGGBB 格式', 'error')
      return
    }
    const normalized = value.toLowerCase()
    setColorDrafts((current) => ({ ...current, [draftKey]: normalized }))
    const palettes = mode === 'light'
      ? { light: { [color]: normalized } }
      : { dark: { [color]: normalized } }
    commit({ palettes }, '颜色更新失败')
  }

  const handleColorKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    mode: PaletteMode,
    color: PaletteColor,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitColor(mode, color, event.currentTarget.value)
      event.currentTarget.blur()
    }
    if (event.key === 'Escape') {
      setColorDrafts((current) => ({
        ...current,
        [`${mode}-${color}`]: appearance.palettes[mode][color],
      }))
      event.currentTarget.blur()
    }
  }

  const previewStyle = {
    '--appearance-light-accent': appearance.palettes.light.accent,
    '--appearance-light-background': appearance.palettes.light.background,
    '--appearance-light-foreground': appearance.palettes.light.foreground,
    '--appearance-dark-accent': appearance.palettes.dark.accent,
    '--appearance-dark-background': appearance.palettes.dark.background,
    '--appearance-dark-foreground': appearance.palettes.dark.foreground,
  } as CSSProperties

  return (
    <section className="appearance-settings-page" aria-labelledby="appearance-page-title">
      <div className="appearance-settings-content">
        <header className="appearance-page-header">
          <h1 id="appearance-page-title">外观</h1>
        </header>

        <section className="appearance-section" aria-labelledby="appearance-theme-heading">
          <h2 id="appearance-theme-heading">主题</h2>
          <div className="appearance-theme-grid">
            {THEME_OPTIONS.map((option) => (
              <ThemeCard
                key={option.value}
                value={option.value}
                label={option.label}
                selected={appearance.theme === option.value}
                appearance={appearance}
                onSelect={() => commit({ theme: option.value }, '主题切换失败')}
              />
            ))}
          </div>

          <div
            className="appearance-diff-preview"
            style={previewStyle}
            data-diff-style={appearance.diffStyle}
            aria-label="浅色与深色主题差异预览"
          >
            <div className="appearance-diff-gutter" aria-hidden="true"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
            <pre className="is-light" aria-label="浅色主题示例"><code><span>const themePreview: ThemeConfig = {'{'}</span>{'\n'}<b>  surface: &quot;paper&quot;,</b>{'\n'}<b>  accent: &quot;{appearance.palettes.light.accent}&quot;,</b>{'\n'}<b>  contrast: {appearance.contrast},</b>{'\n'}<span>{'}'};</span></code></pre>
            <div className="appearance-diff-gutter is-dark" aria-hidden="true"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
            <pre className="is-dark" aria-label="深色主题示例"><code><span>const themePreview: ThemeConfig = {'{'}</span>{'\n'}<b>  surface: &quot;ink&quot;,</b>{'\n'}<b>  accent: &quot;{appearance.palettes.dark.accent}&quot;,</b>{'\n'}<b>  contrast: {appearance.contrast},</b>{'\n'}<span>{'}'};</span></code></pre>
          </div>

          <div className="appearance-panel appearance-theme-editor">
            <div className="appearance-editor-toolbar">
              <div className="appearance-palette-tabs" role="tablist" aria-label="编辑调色板">
                {(['light', 'dark'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    id={`appearance-${mode}-palette-tab`}
                    aria-controls="appearance-palette-panel"
                    aria-selected={paletteMode === mode}
                    className={paletteMode === mode ? 'is-selected' : ''}
                    onClick={() => setPaletteMode(mode)}
                  >
                    {mode === 'light' ? '浅色主题' : '深色主题'}
                  </button>
                ))}
              </div>
              <div className="appearance-theme-actions">
                <button type="button" onClick={() => { void onImport() }}>
                  <Download size={14} aria-hidden="true" />导入
                </button>
                <button type="button" onClick={() => { void onCopy() }}>
                  <Copy size={14} aria-hidden="true" />复制主题
                </button>
                <label className="appearance-preset-select">
                  <span className="appearance-preset-icon" aria-hidden="true">Aa</span>
                  <span className="sr-only">主题预设</span>
                  <select
                    value={selectedPreset}
                    aria-label="主题预设"
                    onChange={(event) => {
                      const preset = THEME_PRESETS.find((item) => item.id === event.target.value)
                      if (preset) commit(preset.patch, '应用主题预设失败')
                    }}
                  >
                    <option value="custom">自定义</option>
                    {THEME_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <div
              id="appearance-palette-panel"
              role="tabpanel"
              aria-labelledby={`appearance-${paletteMode}-palette-tab`}
            >
              {COLOR_ROWS.map(({ key, label }) => {
                const draftKey = `${paletteMode}-${key}`
                const currentColor = appearance.palettes[paletteMode][key]
                return (
                  <div className="appearance-setting-row appearance-color-row" key={key}>
                    <label htmlFor={`appearance-${paletteMode}-${key}`}>{label}</label>
                    <div className="appearance-color-control">
                      <input
                        type="color"
                        value={currentColor}
                        aria-label={`${paletteMode === 'light' ? '浅色' : '深色'}主题${label}取色器`}
                        onChange={(event) => commitColor(paletteMode, key, event.target.value)}
                      />
                      <input
                        id={`appearance-${paletteMode}-${key}`}
                        type="text"
                        value={colorDrafts[draftKey] ?? currentColor}
                        aria-describedby="appearance-color-format"
                        maxLength={7}
                        spellCheck={false}
                        onChange={(event) => setColorDrafts((current) => ({ ...current, [draftKey]: event.target.value }))}
                        onBlur={(event) => commitColor(paletteMode, key, event.target.value)}
                        onKeyDown={(event) => handleColorKeyDown(event, paletteMode, key)}
                      />
                    </div>
                  </div>
                )
              })}
              <span id="appearance-color-format" className="sr-only">使用井号加六位十六进制颜色值</span>

              <div className="appearance-setting-row">
                <label htmlFor="appearance-ui-font">UI 字体</label>
                <select
                  id="appearance-ui-font"
                  className="appearance-select-control"
                  value={appearance.uiFont}
                  onChange={(event) => commit({ uiFont: event.target.value as AppearanceUiFont }, '字体切换失败')}
                >
                  {FONT_OPTIONS.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
                </select>
              </div>
              <div className="appearance-setting-row">
                <span>半透明侧栏</span>
                <Switch
                  checked={appearance.translucentSidebar}
                  label="半透明侧栏"
                  onChange={(checked) => commit({ translucentSidebar: checked }, '侧栏透明度更新失败')}
                />
              </div>
              <div className="appearance-setting-row appearance-range-row">
                <label htmlFor="appearance-contrast">对比度</label>
                <div className="appearance-range-control">
                  <input
                    id="appearance-contrast"
                    type="range"
                    min="0"
                    max="100"
                    value={appearance.contrast}
                    aria-valuetext={`${appearance.contrast}`}
                    onChange={(event) => commit({ contrast: Number(event.target.value) }, '对比度更新失败')}
                  />
                  <output htmlFor="appearance-contrast">{appearance.contrast}</output>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="appearance-section appearance-preferences" aria-labelledby="appearance-preference-heading">
          <h2 id="appearance-preference-heading">偏好设置</h2>
          <div className="appearance-panel">
            <div className="appearance-setting-row is-descriptive">
              <span><strong>使用指针光标</strong><small>悬停交互元素时切换为指针光标</small></span>
              <Switch
                checked={appearance.pointerCursor}
                label="使用指针光标"
                onChange={(checked) => commit({ pointerCursor: checked }, '指针设置更新失败')}
              />
            </div>
            <div className="appearance-setting-row is-descriptive appearance-dock-row">
              <span><strong>Dock 图标</strong><small>选择应用在 Dock 中使用的图标</small></span>
              <div className="appearance-dock-options" role="group" aria-label="Dock 图标">
                <button
                  type="button"
                  aria-label="使用学术 Agent 图标"
                  aria-pressed={appearance.dockIcon === 'academic'}
                  className={appearance.dockIcon === 'academic' ? 'is-selected' : ''}
                  onClick={() => commit({ dockIcon: 'academic' }, 'Dock 图标切换失败')}
                >
                  <img src={appIconUrl} alt="" />
                  {appearance.dockIcon === 'academic' && <Check size={12} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  aria-label="使用深色助理图标"
                  aria-pressed={appearance.dockIcon === 'assistant'}
                  className={`is-dark-icon${appearance.dockIcon === 'assistant' ? ' is-selected' : ''}${darkDockIconUrl ? '' : ' uses-filter-preview'}`}
                  onClick={() => commit({ dockIcon: 'assistant' }, 'Dock 图标切换失败')}
                >
                  <img src={darkDockIconUrl || appIconUrl} alt="" />
                  {appearance.dockIcon === 'assistant' && <Check size={12} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <div className="appearance-setting-row is-descriptive">
              <span><strong>减少动态效果</strong><small>减少动画效果或匹配系统设置</small></span>
              <SegmentedControl
                value={appearance.reducedMotion}
                label="减少动态效果"
                options={[
                  { value: 'system', label: '系统' },
                  { value: 'on', label: '开启' },
                  { value: 'off', label: '关闭' },
                ]}
                onChange={(value) => commit({ reducedMotion: value }, '动态效果设置更新失败')}
              />
            </div>
            <div className="appearance-setting-row is-descriptive">
              <label htmlFor="appearance-font-size"><strong>UI 字号</strong><small>调整学术 Agent 界面使用的基准字号</small></label>
              <div className="appearance-number-control">
                <input
                  id="appearance-font-size"
                  type="number"
                  min="12"
                  max="20"
                  step="1"
                  value={appearance.uiFontSize}
                  aria-describedby="appearance-font-size-unit"
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (Number.isInteger(value) && value >= 12 && value <= 20) commit({ uiFontSize: value }, '字号更新失败')
                  }}
                />
                <span id="appearance-font-size-unit">px</span>
              </div>
            </div>
            <div className="appearance-setting-row is-descriptive">
              <span><strong>差异标记</strong><small>使用颜色或 +/− 标记显示更改</small></span>
              <SegmentedControl
                value={appearance.diffStyle}
                label="差异标记"
                options={[
                  { value: 'color', label: '颜色' },
                  { value: 'symbol', label: '+/−' },
                ]}
                onChange={(value) => commit({ diffStyle: value }, '差异标记设置更新失败')}
              />
            </div>
            <div className="appearance-setting-row is-descriptive">
              <span><strong>字体平滑</strong><small>使用 macOS 原生字体抗锯齿</small></span>
              <Switch
                checked={appearance.fontSmoothing}
                label="字体平滑"
                onChange={(checked) => commit({ fontSmoothing: checked }, '字体平滑设置更新失败')}
              />
            </div>
          </div>
        </section>
      </div>
    </section>
  )
}

export default AppearanceSettingsPage
