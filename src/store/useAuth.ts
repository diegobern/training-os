import { create } from 'zustand'
import type { User } from 'firebase/auth'
import { firebaseEnabled } from '../lib/firebase/app'
import {
  onAuth,
  readProfile,
  signOutUser,
  writeProfile,
} from '../lib/firebase/account'
import type { UserProfile } from '../lib/firebase/profile'
import { ONBOARDING_VERSION } from '../lib/training/onboarding-version'
import type { TrainingProfile } from '../lib/training/profile'
import { getMeta, setMeta } from '../lib/db/database'
import {
  adoptLocalData,
  applyRemoteSettings,
  checkLocalOwnership,
  pushSettings,
  resetLocalData,
  startSync,
  stopSync,
  syncNow,
  type OwnerCheck,
} from '../lib/sync/engine'
import { exportJson } from '../lib/backup'
import { log } from '../lib/db/database'
import { useApp } from './useApp'

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
  keepLocalSeparate: () => Promise<void>
  discardLocal: () => Promise<void>
  completeOnboarding: (patch: Partial<UserProfile>) => Promise<void>
  declineOnboardingTopUp: () => Promise<void>
  acceptOnboardingTopUp: () => void
  pushOnboardingDraft: (answers: Partial<TrainingProfile>, step: number) => Promise<void>
  logout: () => Promise<void>
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

export const useAuth = create<AuthState>((set, get) => ({
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
      else await pushSettings(user.uid)
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

      set({ phase: 'ready', busy: false })
    } catch (err) {
      // The session is valid; we simply could not reach Firestore. Signing the
      // user out here would look like a logout they did not ask for, so the
      // session is kept and the screen offers a retry instead.
      const message = err instanceof Error ? err.message : String(err)
      log('auth', `resolve failed: ${message}`, 'error')
      set({ busy: false, phase: 'connection-error', error: message })
    }
  },

  async refreshProfile() {
    const user = get().user
    if (!user) return
    set({ profile: await readProfile(user.uid) })
  },

  setPhase(phase) {
    set({ phase })
  },

  async adoptLocal() {
    const user = get().user
    if (!user) return
    set({ busy: true })
    await adoptLocalData(user.uid)
    await startSync(user.uid)
    await syncNow()
    await get().resolve()
  },

  /** Downloads a backup first, then starts the account clean on this device. */
  async keepLocalSeparate() {
    const user = get().user
    if (!user) return
    set({ busy: true })
    await exportJson(true)
    await resetLocalData(user.uid)
    await startSync(user.uid, { restore: true })
    await get().resolve()
  },

  async discardLocal() {
    const user = get().user
    if (!user) return
    set({ busy: true })
    await resetLocalData(user.uid)
    await startSync(user.uid, { restore: true })
    await get().resolve()
  },

  async completeOnboarding(patch) {
    const user = get().user
    if (!user) return
    await writeProfile(user.uid, { ...patch, onboardingCompleted: true })
    await pushSettings(user.uid)
    await get().refreshProfile()
    set({ phase: 'ready' })
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
    set({ phase: 'ready' })
  },

  /** Pushes a partial questionnaire after each step. Never awaited by the UI. */
  async pushOnboardingDraft(answers, step) {
    const user = get().user
    if (!user) return
    await writeProfile(user.uid, { trainingProfile: { ...answers }, onboardingStep: step })
  },

  async logout() {
    set({ busy: true })
    try {
      stopSync()
      await signOutUser()
      // A shared device must not keep one person's training behind a logout.
      await resetLocalData(null)
      set({ phase: 'signed-out', user: null, profile: null, localDataCheck: null })
    } finally {
      set({ busy: false })
    }
  },
}))
