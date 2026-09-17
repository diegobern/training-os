import { create } from 'zustand'
import {
  getDbStatus,
  readSettings,
  requestPersistentStorage,
  writeSettings,
  log,
} from '../lib/db/database'
import { seedLibraryIfEmpty } from '../lib/db/repo.exercises'
import { migrateFavoritesOnce } from '../lib/db/repo.prefs'
import { defaultSettings, type Settings, type ThemeMode } from '../lib/db/schema'
import { LOCALES, makeT, type TFn } from '../lib/i18n'

export type AppPhase = 'booting' | 'ready' | 'error'

interface AppState {
  phase: AppPhase
  error: string | null
  settings: Settings
  t: TFn
  locale: string
  online: boolean
  init: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<void>
  setOnline: (v: boolean) => void
  refreshSettings: () => Promise<void>
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement
  const resolved =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode
  root.setAttribute('data-theme', resolved)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#F4F5F7' : '#0A0B0D')
  // Mirrored where a script in the document head can read it synchronously.
  // The real setting lives in IndexedDB, which cannot be read before the first
  // paint, so without this a dark-mode user gets a white flash on every launch.
  try {
    localStorage.setItem('to:theme', resolved)
  } catch {
    /* private mode, blocked storage — the app just starts light, as before */
  }
}

function applyMotion(enabled: boolean) {
  document.documentElement.setAttribute('data-motion', enabled ? 'on' : 'off')
}

export const useApp = create<AppState>((set, get) => ({
  phase: 'booting',
  error: null,
  settings: defaultSettings(),
  t: makeT('es'),
  locale: LOCALES.es,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,

  async init() {
    try {
      const settings = await readSettings()
      await seedLibraryIfEmpty(settings.language)
      applyTheme(settings.theme)
      applyMotion(settings.animations)
      document.documentElement.lang = settings.language
      set({
        settings,
        phase: 'ready',
        error: null,
        t: makeT(settings.language),
        locale: LOCALES[settings.language],
      })
      // Best-effort: keeps months of training data safe from eviction.
      void requestPersistentStorage()
      // After 'ready', never before: an existing account's stars move into
      // preferences without holding up a single frame of the first paint.
      void migrateFavoritesOnce()
      log('app', 'ready')
    } catch (err) {
      const { lastError } = getDbStatus()
      const message = lastError ?? (err instanceof Error ? err.message : String(err))
      set({ phase: 'error', error: message })
      log('app', `boot failed: ${message}`, 'error')
    }
  },

  async update(patch) {
    const next = await writeSettings(patch)
    if (patch.theme !== undefined) applyTheme(next.theme)
    if (patch.animations !== undefined) applyMotion(next.animations)
    if (patch.language !== undefined) document.documentElement.lang = next.language
    set({ settings: next, t: makeT(next.language), locale: LOCALES[next.language] })
  },

  async refreshSettings() {
    const settings = await readSettings()
    applyTheme(settings.theme)
    applyMotion(settings.animations)
    set({ settings, t: makeT(settings.language), locale: LOCALES[settings.language] })
  },

  setOnline(v) {
    if (get().online !== v) set({ online: v })
  },
}))

/** Convenience selectors — keep components subscribed to as little as possible. */
export const useT = () => useApp((s) => s.t)
export const useSettings = () => useApp((s) => s.settings)
export const useLocale = () => useApp((s) => s.locale)
export const useUnits = () => useApp((s) => s.settings.units)

export function watchSystemTheme() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => {
    if (useApp.getState().settings.theme === 'system') applyTheme('system')
  }
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}
