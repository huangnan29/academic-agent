import {
  appearancePatchFromThemeDocument,
  createAppearanceThemeDocument,
  mergeAppearanceSettings,
} from '../../shared/appearance'
import { chooseBrowserThemeDocument, copyTextInBrowser } from './browser'
import { clone, mutate, readState } from './state'

export const appearanceApi: Window['paperAgent']['appearance'] = {
  async update(input) {
    const next = mutate((draft) => {
      draft.settings.appearance = mergeAppearanceSettings(draft.settings.appearance, input)
    })
    return clone(next)
  },
  async importTheme() {
    const document = await chooseBrowserThemeDocument()
    if (!document) return clone(readState())
    const next = mutate((draft) => {
      draft.settings.appearance = mergeAppearanceSettings(
        draft.settings.appearance,
        appearancePatchFromThemeDocument(document),
      )
    })
    return clone(next)
  },
  async copyTheme() {
    const serialized = `${JSON.stringify(
      createAppearanceThemeDocument(readState().settings.appearance),
      null,
      2,
    )}\n`
    await copyTextInBrowser(serialized)
    return serialized
  },
}
