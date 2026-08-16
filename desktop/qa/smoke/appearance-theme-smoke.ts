import assert from 'node:assert/strict'

import {
  appearancePatchFromThemeDocument,
  createAppearanceThemeDocument,
  mergeAppearanceSettings,
  parseAppearanceThemeDocument,
} from '../../shared/appearance'
import { DEFAULT_APPEARANCE_SETTINGS } from '../../shared/contracts'

const appearance = mergeAppearanceSettings(DEFAULT_APPEARANCE_SETTINGS, {
  theme: 'dark',
  dockIcon: 'assistant',
  reducedMotion: 'on',
  pointerCursor: true,
  uiFontSize: 18,
  diffStyle: 'symbol',
  fontSmoothing: false,
  contrast: 72,
  uiFont: 'serif',
})

const document = createAppearanceThemeDocument(appearance)
assert.deepEqual(Object.keys(document).sort(), [
  'contrast',
  'palettes',
  'translucentSidebar',
  'uiFont',
  'version',
])

const parsed = parseAppearanceThemeDocument(document)
const imported = mergeAppearanceSettings(
  DEFAULT_APPEARANCE_SETTINGS,
  appearancePatchFromThemeDocument(parsed),
)
assert.equal(imported.contrast, 72)
assert.equal(imported.uiFont, 'serif')
assert.equal(imported.dockIcon, DEFAULT_APPEARANCE_SETTINGS.dockIcon)
assert.equal(imported.uiFontSize, DEFAULT_APPEARANCE_SETTINGS.uiFontSize)
assert.equal(imported.pointerCursor, DEFAULT_APPEARANCE_SETTINGS.pointerCursor)

assert.throws(
  () => parseAppearanceThemeDocument({ ...document, dockIcon: 'assistant' }),
  /不支持的字段/,
)
assert.throws(
  () => parseAppearanceThemeDocument({
    ...document,
    palettes: {
      ...document.palettes,
      light: { ...document.palettes.light, accent: 'red' },
    },
  }),
  /#RRGGBB/,
)

process.stdout.write(JSON.stringify({
  ok: true,
  portableKeys: Object.keys(document),
  preservedPersonalPreferences: true,
  rejectedUnknownFields: true,
  rejectedInvalidColors: true,
}, null, 2) + '\n')
