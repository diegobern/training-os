/**
 * Feature flags for this expansion.
 *
 * They exist so a half-finished feature can ship dark rather than sit on a
 * branch, and so an existing user can be left on the old path until the new
 * one has been watched in production. They are temporary by construction:
 * every flag below has a removal condition written next to it, and removing a
 * flag means deleting the old path, not leaving both forever.
 *
 * Read from three places, in order:
 *   1. a `?ff=` query parameter — for testing one thing on one device
 *   2. localStorage — set by the query parameter, so it survives a reload
 *   3. the default below
 *
 * No server, no remote config, no network call. A flag that cannot be
 * evaluated offline is not usable in an offline-first app.
 */

export const FLAGS = {
  /** The seven-step questionnaire. Remove once every account has onboardingVersion >= 1. */
  newOnboarding: true,
  /** Cardio and mobility logging. Remove once cardio has been in production a full release. */
  cardioV2: true,
  /** The built-in catalog, HOW TO and illustrations. Remove with the old seeded library. */
  exerciseMediaV2: true,
} as const

export type FlagName = keyof typeof FLAGS

const KEY = 'to:flags'

function overrides(): Partial<Record<FlagName, boolean>> {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Partial<Record<FlagName, boolean>>) : {}
  } catch {
    return {}
  }
}

/**
 * Reads `?ff=cardioV2:0,newOnboarding:1` and remembers it.
 *
 * Called once at startup. The parameter is stripped from the URL afterwards so
 * that a shared link does not carry someone else's flag state.
 */
export function readFlagOverridesFromUrl(): void {
  try {
    const url = new URL(window.location.href)
    const ff = url.searchParams.get('ff')
    if (!ff) return
    const next = { ...overrides() }
    for (const pair of ff.split(',')) {
      const [name, value] = pair.split(':')
      if (name && name in FLAGS) next[name as FlagName] = value !== '0' && value !== 'false'
    }
    localStorage.setItem(KEY, JSON.stringify(next))
    url.searchParams.delete('ff')
    window.history.replaceState({}, '', url.toString())
  } catch {
    /* private mode, or no URL API — the defaults stand */
  }
}

export function flag(name: FlagName): boolean {
  return overrides()[name] ?? FLAGS[name]
}
