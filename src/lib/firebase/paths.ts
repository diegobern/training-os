/**
 * Everything a user owns lives under `users/{uid}`, so the Security Rules can
 * be one short, auditable statement: you may touch your own subtree, nothing
 * else. Adding a feature later means adding a collection here, not rewriting
 * the rules.
 */
export const SCHEMA_VERSION = 1

export const USERS = 'users'
export const USERNAMES = 'usernames'

/** Local IndexedDB stores that are mirrored to Firestore, and their collection names. */
export const SYNCED_COLLECTIONS = {
  exercises: 'exercises',
  routines: 'routines',
  sessions: 'sessions',
  exerciseLogs: 'exerciseLogs',
  personalRecords: 'personalRecords',
  bodyweight: 'bodyweight',
  measurements: 'measurements',
  milestones: 'milestones',
  photos: 'photos',
} as const

export type SyncedStore = keyof typeof SYNCED_COLLECTIONS

export const SYNCED_STORES = Object.keys(SYNCED_COLLECTIONS) as SyncedStore[]

/** Stores whose documents can be large; pulled with a smaller page size. */
export const HEAVY_STORES: SyncedStore[] = ['sessions']

export const userDoc = (uid: string) => `${USERS}/${uid}`
export const userCollection = (uid: string, store: SyncedStore) =>
  `${USERS}/${uid}/${SYNCED_COLLECTIONS[store]}`
export const tombstoneCollection = (uid: string) => `${USERS}/${uid}/tombstones`
export const usernameDoc = (normalized: string) => `${USERNAMES}/${normalized}`
export const photoStoragePath = (uid: string, photoId: string) => `users/${uid}/photos/${photoId}.jpg`
export const avatarStoragePath = (uid: string) => `users/${uid}/avatar.jpg`

/** Field the sync engine stamps on every document so pulls can be incremental. */
export const SYNC_FIELD = '_syncedAt'

/* ------------------------------------------------------------------ usernames */

export const USERNAME_MIN = 3
export const USERNAME_MAX = 20
const USERNAME_RE = /^[a-z0-9_.]+$/

/** `Diego`, `diego` and `DIEGO` are all the same username. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '')
}

export type UsernameProblem = 'too-short' | 'too-long' | 'charset' | 'edge-dot' | 'reserved' | null

const RESERVED = new Set([
  'admin', 'root', 'support', 'help', 'about', 'settings', 'login', 'signup',
  'profile', 'account', 'training', 'trainingos', 'api', 'null', 'undefined',
])

export function validateUsername(raw: string): UsernameProblem {
  const value = normalizeUsername(raw)
  if (value.length < USERNAME_MIN) return 'too-short'
  if (value.length > USERNAME_MAX) return 'too-long'
  if (!USERNAME_RE.test(value)) return 'charset'
  if (value.startsWith('.') || value.endsWith('.') || value.includes('..')) return 'edge-dot'
  if (RESERVED.has(value)) return 'reserved'
  return null
}

/* ------------------------------------------------------------------ passwords */

export interface PasswordCheck {
  length: boolean
  letter: boolean
  number: boolean
  mixedCase: boolean
  score: 0 | 1 | 2 | 3 | 4
  acceptable: boolean
}

export function checkPassword(password: string): PasswordCheck {
  const length = password.length >= 8
  const letter = /[a-zA-Z]/.test(password)
  const number = /[0-9]/.test(password)
  const mixedCase = /[a-z]/.test(password) && /[A-Z]/.test(password)
  const symbol = /[^a-zA-Z0-9]/.test(password)
  const met = [length, letter, number, mixedCase, symbol].filter(Boolean).length
  const score = Math.min(4, Math.max(0, met - (password.length >= 12 ? 0 : 1))) as 0 | 1 | 2 | 3 | 4
  // Firebase itself requires 6+; we ask for a little more without being silly.
  return { length, letter, number, mixedCase, score, acceptable: length && letter && number }
}
