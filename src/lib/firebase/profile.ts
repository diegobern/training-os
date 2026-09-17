import type { Settings } from '../db/schema'
import type { TrainingProfile } from '../training/profile'
import { SCHEMA_VERSION } from './paths'

/** The Firestore document at `users/{uid}`. Never contains a password. */
export interface UserProfile {
  uid: string
  username: string
  usernameNormalized: string
  displayName: string
  email: string
  photoURL: string | null
  createdAt: number
  updatedAt: number
  schemaVersion: number
  onboardingCompleted: boolean
  goal: TrainingGoal | null
  trainingDaysPerWeek: number | null
  /** The app settings, mirrored so a new device is configured the moment you log in. */
  settings: Partial<Settings> | null

  /* --- the questionnaire ------------------------------------------------
     Optional, because every account created before it existed has neither
     field. `onboardingVersion` absent or lower than the current one is what
     triggers the short top-up questionnaire — and the absence of these
     fields must never look like an incomplete account, only an older one. */

  /** Which questionnaire produced `trainingProfile`. Absent means none. */
  onboardingVersion?: number
  /** Every answer. Partial, because an older version asked fewer questions. */
  trainingProfile?: Partial<TrainingProfile> | null
  /**
   * How far through the questionnaire this account got, pushed after each
   * step. The authoritative copy for resuming is the local draft — this one
   * exists so a person who starts on their phone and finishes on a laptop
   * does not begin again.
   */
  onboardingStep?: number
}

export const TRAINING_GOALS = ['hypertrophy', 'strength', 'recomp', 'general'] as const
export type TrainingGoal = (typeof TRAINING_GOALS)[number]

export function makeProfile(input: {
  uid: string
  username: string
  usernameNormalized: string
  displayName: string
  email: string
}): UserProfile {
  const now = Date.now()
  return {
    uid: input.uid,
    username: input.username,
    usernameNormalized: input.usernameNormalized,
    displayName: input.displayName,
    email: input.email,
    photoURL: null,
    createdAt: now,
    updatedAt: now,
    schemaVersion: SCHEMA_VERSION,
    onboardingCompleted: false,
    goal: null,
    trainingDaysPerWeek: null,
    settings: null,
  }
}

/** Settings fields that belong to the account rather than to one device. */
export const ACCOUNT_SETTING_KEYS = [
  'units',
  'intensityMetric',
  'language',
  'theme',
  'defaultRestSeconds',
  'restAutoStart',
  'restSound',
  'restVibrate',
  'haptics',
  'sounds',
  'animations',
  'excludeWarmupsFromStats',
  'autofillPreviousSets',
  'weekStartsOn',
  'availableWeights',
  'weeklySetTargets',
  'trainingProfile',
  'onboardingVersion',
] as const

export function pickAccountSettings(settings: Settings): Partial<Settings> {
  const out: Record<string, unknown> = {}
  for (const key of ACCOUNT_SETTING_KEYS) out[key] = settings[key]
  return out as Partial<Settings>
}
