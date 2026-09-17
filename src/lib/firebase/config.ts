/* ============================================================================
 * Firebase configuration
 *
 * The Firebase *web* config is not a secret — it is a set of public
 * identifiers that every client is meant to see, and what actually protects
 * your data are the Security Rules in `firestore.rules` / `storage.rules`.
 * It still lives in environment variables so that a build can be pointed at a
 * different project without touching code, and so nothing is baked into git.
 *
 * Nothing that IS secret (service accounts, admin keys, passwords) ever
 * appears in this project.
 * ========================================================================== */

export interface FirebaseWebConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId?: string
}

const REQUIRED = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const

function env(key: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[key]
  return typeof value === 'string' ? value.trim() : ''
}

/** Environment variables that are missing or still hold a placeholder. */
export function missingFirebaseKeys(): string[] {
  return REQUIRED.filter((key) => {
    const v = env(key)
    return v === '' || v.startsWith('your-') || v.includes('XXXX')
  })
}

export function isFirebaseConfigured(): boolean {
  return missingFirebaseKeys().length === 0
}

export function readFirebaseConfig(): FirebaseWebConfig | null {
  if (!isFirebaseConfigured()) return null
  const measurementId = env('VITE_FIREBASE_MEASUREMENT_ID')
  return {
    apiKey: env('VITE_FIREBASE_API_KEY'),
    authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: env('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: env('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: env('VITE_FIREBASE_APP_ID'),
    ...(measurementId ? { measurementId } : {}),
  }
}

/** Local emulator suite, used by the automated tests and for development. */
export interface EmulatorConfig {
  enabled: boolean
  host: string
  authPort: number
  firestorePort: number
  storagePort: number
}

export function readEmulatorConfig(): EmulatorConfig {
  const flag = env('VITE_FIREBASE_EMULATORS')
  return {
    enabled: flag === '1' || flag === 'true',
    host: env('VITE_FIREBASE_EMULATOR_HOST') || '127.0.0.1',
    authPort: Number(env('VITE_FIREBASE_AUTH_EMULATOR_PORT') || 9099),
    firestorePort: Number(env('VITE_FIREBASE_FIRESTORE_EMULATOR_PORT') || 8080),
    storagePort: Number(env('VITE_FIREBASE_STORAGE_EMULATOR_PORT') || 9199),
  }
}

/** What the UI shows when the project has not been wired up yet. */
export type FirebaseStatus =
  | { state: 'not-configured'; missing: string[] }
  | { state: 'connecting' }
  | { state: 'ready'; projectId: string; emulators: boolean }
  | { state: 'error'; message: string }
