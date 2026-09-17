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

export interface FirebaseServices {
  app: FirebaseApp
  auth: Auth
  db: Firestore
  storage: FirebaseStorage
  projectId: string
  emulators: boolean
}

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
 * Loads the Firebase SDK on demand. Kept out of the main bundle so a build
 * without Firebase configured never downloads it and runs exactly as the
 * local-first app did.
 */
export function getFirebase(): Promise<FirebaseServices> | null {
  const config = readFirebaseConfig()
  if (!config) return null
  if (servicesPromise) return servicesPromise

  servicesPromise = (async () => {
    const [{ initializeApp, getApps, getApp }, authMod, firestoreMod, storageMod] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
      import('firebase/storage'),
    ])

    const app = getApps().length ? getApp() : initializeApp(config)

    // Firestore runs with an in-memory cache on purpose: Training OS already
    // owns an offline layer in IndexedDB and a write outbox, and two competing
    // queues would make "is my set saved?" impossible to answer honestly.
    const db = firestoreMod.initializeFirestore(app, {
      localCache: firestoreMod.memoryLocalCache(),
      experimentalAutoDetectLongPolling: true,
      ignoreUndefinedProperties: true,
    })

    const auth = authMod.initializeAuth(app, {
      // indexedDB first so an installed PWA keeps the session across launches.
      persistence: [
        authMod.indexedDBLocalPersistence,
        authMod.browserLocalPersistence,
        authMod.inMemoryPersistence,
      ],
    })

    const storage = storageMod.getStorage(app)

    const emu = readEmulatorConfig()
    if (emu.enabled) {
      authMod.connectAuthEmulator(auth, `http://${emu.host}:${emu.authPort}`, { disableWarnings: true })
      firestoreMod.connectFirestoreEmulator(db, emu.host, emu.firestorePort)
      storageMod.connectStorageEmulator(storage, emu.host, emu.storagePort)
      log('firebase', `connected to local emulators on ${emu.host}`)
    }

    setStatus({ state: 'ready', projectId: config.projectId, emulators: emu.enabled })
    log('firebase', `initialised project ${config.projectId}${emu.enabled ? ' (emulators)' : ''}`)

    return { app, auth, db, storage, projectId: config.projectId, emulators: emu.enabled }
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
