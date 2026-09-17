import type { FirebaseApp } from 'firebase/app'
import type { Auth } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'
import type { FirebaseStorage } from 'firebase/storage'
import {
  isFirebaseConfigured,
  missingFirebaseKeys,
  readEmulatorConfig,
  readFirebaseConfig,
  type FirebaseStatus,
} from './config'
import { log } from '../db/database'

export interface FirebaseCore {
  app: FirebaseApp
  auth: Auth
  projectId: string
  emulators: boolean
}

export interface FirebaseServices extends FirebaseCore {
  db: Firestore
  storage: FirebaseStorage
}

let corePromise: Promise<FirebaseCore> | null = null
let servicesPromise: Promise<FirebaseServices> | null = null
let status: FirebaseStatus = isFirebaseConfigured()
  ? { state: 'connecting' }
  : { state: 'not-configured', missing: missingFirebaseKeys() }

const listeners = new Set<() => void>()

export function firebaseStatus(): FirebaseStatus {
  return status
}

export function subscribeFirebaseStatus(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function setStatus(next: FirebaseStatus) {
  status = next
  listeners.forEach((fn) => fn())
}

/**
 * Auth only: the smallest thing that can answer "who is signed in?".
 *
 * Firestore and Storage are 850 KB of the Firebase SDK and the session does
 * not need either of them. Loading all four modules together meant every
 * launch of a signed-in install waited for the database and the file store
 * before it could decide which screen to show — which is exactly the delay
 * between opening the app and it connecting to the account.
 *
 * Split in two, the launch waits for `firebase/app` and `firebase/auth`, and
 * the rest arrives while the app is already on screen.
 */
export function getFirebaseAuth(): Promise<FirebaseCore> | null {
  const config = readFirebaseConfig()
  if (!config) return null
  if (corePromise) return corePromise

  corePromise = (async () => {
    const [{ initializeApp, getApps, getApp }, authMod] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
    ])

    const app = getApps().length ? getApp() : initializeApp(config)

    const auth = authMod.initializeAuth(app, {
      // indexedDB first so an installed PWA keeps the session across launches.
      persistence: [
        authMod.indexedDBLocalPersistence,
        authMod.browserLocalPersistence,
        authMod.inMemoryPersistence,
      ],
    })

    const emu = readEmulatorConfig()
    if (emu.enabled) {
      authMod.connectAuthEmulator(auth, `http://${emu.host}:${emu.authPort}`, { disableWarnings: true })
    }

    setStatus({ state: 'ready', projectId: config.projectId, emulators: emu.enabled })
    log('firebase', `auth ready for ${config.projectId}${emu.enabled ? ' (emulators)' : ''}`)

    return { app, auth, projectId: config.projectId, emulators: emu.enabled }
  })().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    setStatus({ state: 'error', message })
    log('firebase', `auth initialisation failed: ${message}`, 'error')
    corePromise = null
    throw err
  })

  return corePromise
}

/**
 * Everything: auth, Firestore and Storage. Used by sync and by the screens
 * that read or write documents — never on the launch path.
 */
export function getFirebase(): Promise<FirebaseServices> | null {
  const core = getFirebaseAuth()
  if (!core) return null
  if (servicesPromise) return servicesPromise

  servicesPromise = (async () => {
    const [{ app, auth, projectId, emulators }, firestoreMod, storageMod] = await Promise.all([
      core,
      import('firebase/firestore'),
      import('firebase/storage'),
    ])

    // Firestore runs with an in-memory cache on purpose: Training OS already
    // owns an offline layer in IndexedDB and a write outbox, and two competing
    // queues would make "is my set saved?" impossible to answer honestly.
    const db = firestoreMod.initializeFirestore(app, {
      localCache: firestoreMod.memoryLocalCache(),
      experimentalAutoDetectLongPolling: true,
      ignoreUndefinedProperties: true,
    })

    const storage = storageMod.getStorage(app)

    if (emulators) {
      const emu = readEmulatorConfig()
      firestoreMod.connectFirestoreEmulator(db, emu.host, emu.firestorePort)
      storageMod.connectStorageEmulator(storage, emu.host, emu.storagePort)
      log('firebase', `connected to local emulators on ${emu.host}`)
    }

    log('firebase', `firestore ready for ${projectId}`)
    return { app, auth, db, storage, projectId, emulators }
  })().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    setStatus({ state: 'error', message })
    log('firebase', `initialisation failed: ${message}`, 'error')
    servicesPromise = null
    throw err
  })

  return servicesPromise
}

/** True when this build can talk to Firebase at all. */
export function firebaseEnabled(): boolean {
  return isFirebaseConfigured()
}
