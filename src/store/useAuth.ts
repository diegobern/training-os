import { create } from 'zustand'
import type { User } from 'firebase/auth'
import { firebaseEnabled } from '../lib/firebase/app'
import {
  AccountError,
  deleteAccount as deleteAccountRecords,
  onAuth,
  readProfile,
  reauthenticate,
  signOutUser,
  signUpSettled,
  writeProfile,
} from '../lib/firebase/account'
import type { UserProfile } from '../lib/firebase/profile'
import { ONBOARDING_VERSION } from '../lib/training/onboarding-version'
import type { TrainingProfile } from '../lib/training/profile'
import { getMeta, setMeta } from '../lib/db/database'
import {
  adoptLocalData,
  applyRemoteSettings,
  beforeLocalReset,
  checkLocalOwnership,
  pushSettings,
  resetLocalData,
  startSync,
  stopSync,
  syncNow,
  syncingFor,
  waitForSyncIdle,
  wipeRemoteData,
  type OwnerCheck,
} from '../lib/sync/engine'
import { exportJson } from '../lib/backup'
import { log } from '../lib/db/database'
import { useApp } from './useApp'
import { useWorkout } from './useWorkout'

/**
 * `local-only`  — Firebase is not configured; the app runs exactly as the
 *                 local-first version did, with no accounts at all.
 * `checking`    — resolving the session. Nothing is rendered behind this, so
 *                 the login screen never flashes before the dashboard.
 */
export type AuthPhase =
  | 'checking'
  | 'local-only'
  | 'signed-out'
  | 'migrating'
  | 'needs-username'
  | 'onboarding'
  | 'ready'
  /** Signed in, but the profile could not be reached. The session is kept. */
  | 'connection-error'

export interface AuthUser {
  uid: string
  email: string
  displayName: string
}

interface AuthState {
  phase: AuthPhase
  user: AuthUser | null
  profile: UserProfile | null
  localDataCheck: OwnerCheck | null
  /**
   * Which questionnaire is being shown.
   *   initial      a new account. Mandatory.
   *   update       an existing account missing the newer answers. An offer:
   *                this shows the reassurance screen, not the questionnaire.
   *   update-steps they accepted the offer and are in the questionnaire.
   */
  onboardingMode: 'initial' | 'update' | 'update-steps'
  busy: boolean
  error: string | null
  init: () => Promise<void>
  resolve: () => Promise<void>
  refreshProfile: () => Promise<void>
  setPhase: (phase: AuthPhase) => void
  adoptLocal: () => Promise<void>
  /**
   * Exporta una copia y, sólo si el fichero salió de verdad, deja la cuenta
   * limpia en este dispositivo. `false`: la copia no se guardó (la persona
   * cerró el menú de compartir, o falló) y no se ha borrado nada.
   */
  keepLocalSeparate: () => Promise<boolean>
  discardLocal: () => Promise<void>
  completeOnboarding: (patch: Partial<UserProfile>) => Promise<void>
  declineOnboardingTopUp: () => Promise<void>
  acceptOnboardingTopUp: () => void
  pushOnboardingDraft: (answers: Partial<TrainingProfile>, step: number) => Promise<void>
  logout: () => Promise<void>
  /** Elimina la cuenta. Lanza si no se pudo (contraseña incorrecta, red…); la pantalla traduce el error. */
  deleteAccount: (password: string) => Promise<void>
}

function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email ?? '',
    displayName: user.displayName ?? '',
  }
}

let unsubscribe: (() => void) | null = null

const TOP_UP_DECLINED_KEY = 'onboarding:topUpDeclined'

/** True when this device has already been offered the top-up and said no. */
async function topUpDeclined(): Promise<boolean> {
  try {
    return (await getMeta<number>(TOP_UP_DECLINED_KEY, 0)) >= ONBOARDING_VERSION
  } catch {
    // If we cannot read the flag we would rather ask again than silently
    // never offer it.
    return false
  }
}

/** This device already holds this account's data, past the questionnaire. */
async function canOpenOffline(uid: string): Promise<boolean> {
  try {
    if ((await checkLocalOwnership(uid)) !== 'same-user') return false
    return (useApp.getState().settings.onboardingVersion ?? 0) > 0
  } catch {
    return false
  }
}

let onlineWaiter: (() => void) | null = null

/** Runs `fn` once, the next time the browser reports a connection. */
function whenOnline(fn: () => void) {
  if (typeof window === 'undefined') return
  if (onlineWaiter) window.removeEventListener('online', onlineWaiter)
  onlineWaiter = () => {
    onlineWaiter = null
    fn()
  }
  window.addEventListener('online', onlineWaiter, { once: true })
}

/* ---------------------------------------------------- dependencias externas */

/**
 * Lo que los flujos de cuenta (cerrar sesión, eliminar la cuenta, empezar
 * limpio) necesitan de fuera de este almacén. Reunido aquí para que las
 * pruebas puedan sustituir piezas sin Firebase (`setAuthDeps`); la app usa
 * siempre las reales.
 */
export interface AuthDeps {
  exportJson: (includePhotos: boolean) => Promise<{ delivered: boolean }>
  resetLocalData: (uid: string | null) => Promise<void>
  startSync: (uid: string, opts?: { restore?: boolean }) => Promise<void>
  stopSync: () => void
  syncNow: () => Promise<void>
  waitForSyncIdle: (ms: number) => Promise<void>
  /** `useWorkout.reset()` + retirar el aviso nativo, tal como lo conecta `main.tsx`. */
  beforeLocalReset: () => void
  reauthenticate: (password: string) => Promise<void>
  wipeRemoteData: (uid: string) => Promise<number>
  deleteAccountRecords: () => Promise<void>
  signOutUser: () => Promise<void>
}

const realDeps: AuthDeps = {
  exportJson,
  resetLocalData,
  startSync,
  stopSync,
  syncNow,
  waitForSyncIdle,
  beforeLocalReset,
  reauthenticate,
  wipeRemoteData,
  deleteAccountRecords,
  signOutUser,
}

let deps: AuthDeps = realDeps

/** Sustituye dependencias (pruebas). `null` vuelve a las reales. */
export function setAuthDeps(patch: Partial<AuthDeps> | null): void {
  deps = patch ? { ...realDeps, ...patch } : realDeps
}

/** Lo que se espera a la subida antes de cerrar sesión. Sin red no se espera más: se avisó antes. */
const LOGOUT_SYNC_MS = 8_000
/** Lo que se espera a que termine un ciclo de sincronización ya parado. */
const SYNC_IDLE_MS = 5_000

/**
 * El dueño de los datos está cambiando (cierre de sesión o eliminación de la
 * cuenta en curso). Mientras tanto, el `onAuth(null)` que provoca Firebase no
 * guarda lo pendiente: el propio flujo ya lo hizo, y los datos se van.
 */
let ownerChanging = false

function bounded(p: Promise<void>, ms: number, code: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(code)), ms)
  })
  return Promise.race([p, guard]).finally(() => clearTimeout(timer))
}

/**
 * Lee (o confirma) el entrenamiento guardado de la cuenta que acaba de quedar
 * lista. Idempotente y protegido por la época de `useWorkout`: llamarlo de más
 * no pisa una sesión que ya está en pantalla.
 */
function loadWorkout(): void {
  void useWorkout
    .getState()
    .load()
    .catch((err: unknown) => log('workout', `load failed: ${String(err)}`, 'warn'))
}

async function flushWorkout(): Promise<void> {
  try {
    await useWorkout.getState().flushSave()
  } catch (err) {
    log('workout', `could not flush pending save: ${String(err)}`, 'warn')
  }
}

export const useAuth = create<AuthState>((set, get) => {
  /** La única forma de llegar a 'ready': con el entrenamiento de esta cuenta cargado detrás. */
  const enterReady = (extra: Partial<AuthState> = {}) => {
    set({ ...extra, phase: 'ready', busy: false })
    loadWorkout()
  }

  return {
    phase: firebaseEnabled() ? 'checking' : 'local-only',
    user: null,
    profile: null,
    localDataCheck: null,
    onboardingMode: 'initial',
    busy: false,
    error: null,

    async init() {
      if (!firebaseEnabled()) {
        set({ phase: 'local-only' })
        return
      }
      if (unsubscribe) return
      try {
        unsubscribe = await onAuth((user) => {
          if (!user) {
            stopSync()
            /*
             * Firebase ha cerrado la sesión por su cuenta (caducada, revocada,
             * cerrada en otra pestaña) o no había ninguna al arrancar. Los
             * datos locales siguen siendo de esta cuenta: se guarda lo
             * pendiente y se vacía la memoria. El aviso nativo lo retira
             * NativeShell, que sólo lo enseña en 'ready'/'local-only'. Durante
             * un cierre de sesión o un borrado, el propio flujo ya lo hizo.
             */
            if (!ownerChanging) {
              void useWorkout
                .getState()
                .reset({ flush: true })
                .catch((err: unknown) => log('workout', `reset on sign-out failed: ${String(err)}`, 'warn'))
            }
            set({ phase: 'signed-out', user: null, profile: null, localDataCheck: null })
            return
          }
          set({ user: toAuthUser(user) })
          void get().resolve()
        })
      } catch (err) {
        log('auth', `could not start auth listener: ${String(err)}`, 'error')
        set({ phase: 'signed-out' })
      }
    },

    /** Decides which screen the signed-in user belongs on, and starts syncing. */
    async resolve() {
      const user = get().user
      if (!user) return
      set({ busy: true })
      try {
        // A sign-up still writing the username and profile: decide on the
        // finished account, not on the half-made one Firebase announced.
        await signUpSettled()
        const profile = await readProfile(user.uid)
        set({ profile })

        const check = await checkLocalOwnership(user.uid)
        set({ localDataCheck: check })

        if (check === 'local-data-found') {
          // Ask before touching anything the person may have spent months on.
          set({ phase: 'migrating', busy: false })
          return
        }

        if (check === 'other-user' || check === 'fresh') {
          await resetLocalData(user.uid)
          await startSync(user.uid, { restore: true })
        } else {
          await startSync(user.uid)
        }

        if (profile?.settings) await applyRemoteSettings(profile)
        else {
          // An upload, not a decision: nothing below depends on it. Awaited, a
          // write Firestore cannot acknowledge (no server reachable) held the
          // person on the previous screen indefinitely.
          void pushSettings(user.uid).catch((err) => log('sync', `settings upload deferred: ${String(err)}`, 'warn'))
        }
        await useApp.getState().refreshSettings()

        if (!profile || !profile.usernameNormalized) {
          set({ phase: 'needs-username', busy: false })
          return
        }
        if (!profile.onboardingCompleted && (useApp.getState().settings.onboardingVersion ?? 0) === 0) {
          set({ phase: 'onboarding', onboardingMode: 'initial', busy: false })
          return
        }

        // An account that finished an OLDER questionnaire is not incomplete —
        // it is simply missing the newer answers. It gets an offer, never a
        // gate: their routines, history and records are all there and nothing
        // about the app is withheld until they answer. Declining is remembered
        // so it does not ask again on every launch.
        // Either copy counts. Someone who finished the questionnaire offline has
        // it in their settings but not yet on the profile, and asking them again
        // the moment they get signal would be the app forgetting what they did.
        const localVersion = useApp.getState().settings.onboardingVersion ?? 0
        const version = Math.max(profile.onboardingVersion ?? 0, localVersion)
        if (version < ONBOARDING_VERSION && !(await topUpDeclined())) {
          set({ phase: 'onboarding', onboardingMode: 'update', busy: false })
          return
        }

        enterReady()
      } catch (err) {
        // The session is valid; we simply could not reach Firestore. Signing the
        // user out here would look like a logout they did not ask for, so the
        // session is kept.
        const message = err instanceof Error ? err.message : String(err)
        log('auth', `resolve failed: ${message}`, 'error')

        /*
         * No signal in the gym is the normal case, not an error. If this device
         * already holds this account's data and has been through the
         * questionnaire, the app opens on it — everything is written locally
         * and queued — and the account is checked again as soon as the
         * connection is back. Only a device with nothing of this account's to
         * show gets the retry screen.
         */
        if (await canOpenOffline(user.uid)) {
          try {
            await startSync(user.uid)
          } catch (syncErr) {
            log('sync', `start deferred while offline: ${String(syncErr)}`, 'warn')
          }
          enterReady({ error: null })
          log('auth', 'opened offline on the local copy; will re-check when online')
          whenOnline(() => void get().resolve())
          return
        }
        set({ busy: false, phase: 'connection-error', error: message })
      }
    },

    async refreshProfile() {
      const user = get().user
      if (!user) return
      set({ profile: await readProfile(user.uid) })
    },

    setPhase(phase) {
      if (phase === 'ready') enterReady()
      else set({ phase })
    },

    async adoptLocal() {
      const user = get().user
      if (!user) return
      set({ busy: true })
      try {
        await adoptLocalData(user.uid)
        await startSync(user.uid)
        await syncNow()
      } catch (err) {
        // Lo adoptado ya está en el buzón; subirá en cuanto haya red.
        log('auth', `adopting local data: ${String(err)}`, 'warn')
      }
      await get().resolve()
      loadWorkout()
    },

    /** Downloads a backup first, then starts the account clean on this device. */
    async keepLocalSeparate() {
      const user = get().user
      if (!user) return false
      set({ busy: true })
      // Lo último del entrenamiento en curso también va en la copia.
      await flushWorkout()
      let delivered = false
      try {
        delivered = (await deps.exportJson(true)).delivered
      } catch (err) {
        log('backup', `backup before starting clean failed: ${String(err)}`, 'warn')
      }
      if (!delivered) {
        // Sin copia no se borra nada: la pantalla lo explica (migrate.exportNotSaved).
        set({ busy: false })
        return false
      }
      try {
        await deps.resetLocalData(user.uid)
        await deps.startSync(user.uid, { restore: true })
      } catch (err) {
        log('auth', `starting clean failed: ${String(err)}`, 'error')
      }
      await get().resolve()
      loadWorkout()
      return true
    },

    async discardLocal() {
      const user = get().user
      if (!user) return
      set({ busy: true })
      try {
        await deps.resetLocalData(user.uid)
        await deps.startSync(user.uid, { restore: true })
      } catch (err) {
        log('auth', `discarding local data failed: ${String(err)}`, 'error')
      }
      await get().resolve()
      loadWorkout()
    },

    async completeOnboarding(patch) {
      const user = get().user
      if (!user) return
      await writeProfile(user.uid, { ...patch, onboardingCompleted: true })
      await pushSettings(user.uid)
      await get().refreshProfile()
      enterReady()
    },

    /**
     * "Not now" on the top-up questionnaire.
     *
     * Recorded locally rather than on the profile: it is a decision about this
     * device's nagging, not a fact about the account, and it should not follow
     * the person to a phone where they might happily answer it.
     */
    acceptOnboardingTopUp() {
      set({ onboardingMode: 'update-steps' })
    },

    async declineOnboardingTopUp() {
      await setMeta(TOP_UP_DECLINED_KEY, ONBOARDING_VERSION)
      enterReady()
    },

    /** Pushes a partial questionnaire after each step. Never awaited by the UI. */
    async pushOnboardingDraft(answers, step) {
      const user = get().user
      if (!user) return
      await writeProfile(user.uid, { trainingProfile: { ...answers }, onboardingStep: step })
    },

    /**
     * Cerrar sesión, en este orden (docs/NATIVE-CONTRACT.md): guardar lo
     * pendiente → intentar subirlo (≤ 8 s) → vaciar el entrenamiento y
     * retirar el aviso → parar la sincronización → cerrar la sesión de
     * Firebase → vaciar la copia local. La pantalla ya avisó antes si había
     * un entrenamiento en curso o cambios sin subir.
     *
     * Nunca rechaza: la pantalla de error de conexión lo llama sin esperar.
     */
    async logout() {
      const uid = get().user?.uid ?? null
      const wasSyncing = uid !== null && syncingFor() === uid
      set({ busy: true })
      ownerChanging = true
      try {
        await flushWorkout()
        try {
          await bounded(deps.syncNow(), LOGOUT_SYNC_MS, 'LOGOUT_SYNC_TIMEOUT')
        } catch (err) {
          log('sync', `upload before sign-out did not finish: ${String(err)}`, 'warn')
        }
        deps.beforeLocalReset()
        deps.stopSync()
        await deps.waitForSyncIdle(SYNC_IDLE_MS)
        try {
          await deps.signOutUser()
        } catch (err) {
          // Sigue con la sesión abierta: todo vuelve a como estaba.
          log('auth', `sign-out failed: ${String(err)}`, 'error')
          if (uid && wasSyncing) {
            void deps.startSync(uid).catch((e: unknown) => log('sync', `restart after failed sign-out: ${String(e)}`, 'warn'))
          }
          loadWorkout()
          return
        }
        // A shared device must not keep one person's training behind a logout.
        try {
          await deps.resetLocalData(null)
        } catch (err) {
          log('auth', `local copy not cleared after sign-out: ${String(err)}`, 'error')
        }
        set({ phase: 'signed-out', user: null, profile: null, localDataCheck: null })
      } finally {
        ownerChanging = false
        set({ busy: false })
      }
    },

    /**
     * Eliminar la cuenta (docs/NATIVE-CONTRACT.md):
     *
     *   1. Reautenticar, LO PRIMERO. Con la contraseña mal no se toca nada:
     *      ni la nube, ni la sincronización, ni el entrenamiento.
     *   2. Guardar lo pendiente, vaciar el entrenamiento, retirar el aviso y
     *      parar la sincronización (esperando al ciclo que estuviera en vuelo,
     *      para que nada vuelva a subir después del borrado).
     *   3. Borrar los datos en la nube, después el nombre de usuario, el
     *      perfil y el usuario.
     *   4. Vaciar la copia local.
     *
     * Si algo falla en 2–3, la cuenta sigue existiendo: la sincronización se
     * vuelve a arrancar y el entrenamiento se vuelve a leer. El error sube
     * para que la pantalla lo diga.
     */
    async deleteAccount(password) {
      const user = get().user
      if (!user) throw new AccountError('no-user', 'Not signed in')

      await deps.reauthenticate(password)

      ownerChanging = true
      let stopped = false
      try {
        await flushWorkout()
        deps.beforeLocalReset()
        deps.stopSync()
        stopped = true
        await deps.waitForSyncIdle(SYNC_IDLE_MS)
        await deps.wipeRemoteData(user.uid)
        await deps.deleteAccountRecords()
      } catch (err) {
        ownerChanging = false
        if (stopped) {
          // Sólo se llega aquí desde Ajustes, con la cuenta lista y sincronizando.
          void deps
            .startSync(user.uid)
            .catch((e: unknown) => log('sync', `restart after failed deletion: ${String(e)}`, 'warn'))
          loadWorkout()
        }
        log('account', `account deletion failed: ${String(err)}`, 'error')
        throw err
      }

      /*
       * Y la copia local. Sin esto, el entrenamiento de una cuenta que acaba de
       * eliminarse seguiría en IndexedDB de este móvil hasta que alguien entrara
       * con otra cuenta. "Elimina mi cuenta" tiene que significar que no queda
       * nada, también aquí. La cuenta ya no existe: un fallo aquí se anota y no
       * se deshace nada.
       */
      try {
        await deps.resetLocalData(null)
      } catch (err) {
        log('account', `local copy not cleared after deletion: ${String(err)}`, 'error')
      }
      ownerChanging = false
      set({ phase: 'signed-out', user: null, profile: null, localDataCheck: null, busy: false })
    },
  }
})
