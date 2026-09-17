/**
 * The training profile — what the onboarding asks, and why.
 *
 * Every field here has to earn its place. The rule applied throughout: a
 * question is only worth asking if something in the app behaves differently
 * because of the answer. Each field below carries a `— used for:` note naming
 * the concrete consequence. If a future field cannot be given one of those
 * notes, it does not belong in this file.
 *
 * Deliberately NOT collected:
 *   · Sex or gender. Nothing in Training OS branches on it today. Collecting it
 *     "in case" is the exact habit this file exists to avoid.
 *   · Date of birth. An age *range* would only be used to soften default
 *     volume, and even that is thin, so it is optional and coarse.
 *   · Anything medical. No injuries, no conditions, no limitations. The app
 *     does not diagnose and must never look as though it does. If limitations
 *     are ever added they need their own privacy design, not a checkbox here.
 */

import type { MuscleGroup, Units } from '../db/schema'

// Defined in its own module so importing just the version does not pull this
// file's tables onto the critical path. Re-exported for convenience.
export { ONBOARDING_VERSION } from './onboarding-version'
import { ONBOARDING_VERSION } from './onboarding-version'

/* ------------------------------------------------------------------ answers */

export const MAIN_GOALS = [
  'hypertrophy',
  'strength',
  'fatloss',
  'recomp',
  'general',
  'endurance',
  'performance',
] as const
export type MainGoal = (typeof MAIN_GOALS)[number]

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number]

export const TRAINING_YEARS = ['<6m', '6-12m', '1-3y', '3-5y', '5y+'] as const
export type TrainingYears = (typeof TRAINING_YEARS)[number]

export const SESSION_DURATIONS = [30, 45, 60, 75, 90] as const
export type SessionDuration = (typeof SESSION_DURATIONS)[number]

export const TRAINING_ENVIRONMENTS = ['commercial', 'home', 'minimal', 'bodyweight', 'mixed'] as const
export type TrainingEnvironment = (typeof TRAINING_ENVIRONMENTS)[number]

/**
 * What the person can actually train with. Intentionally a superset of the
 * `Equipment` union used by exercises: `cardio` is a category of machine rather
 * than a single piece, and `bench` is not an exercise's equipment but does
 * decide whether half the dumbbell catalogue is usable.
 */
export const AVAILABLE_EQUIPMENT = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'smith',
  'kettlebell',
  'band',
  'bench',
  'pullupbar',
  'cardio',
  'bodyweight',
] as const
export type AvailableEquipment = (typeof AVAILABLE_EQUIPMENT)[number]

export const TRAINING_INTERESTS = [
  'strength',
  'hypertrophy',
  'cardio',
  'running',
  'cycling',
  'hiit',
  'mobility',
  'calisthenics',
  'powerlifting',
  'general',
] as const
export type TrainingInterest = (typeof TRAINING_INTERESTS)[number]

export const CARDIO_PREFERENCES = ['running', 'cycling', 'rowing', 'walking', 'machine', 'hiit'] as const
export type CardioPreference = (typeof CARDIO_PREFERENCES)[number]

/** 0 = Sunday … 6 = Saturday, matching `Date.getDay()`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const AGE_RANGES = ['u20', '20-29', '30-39', '40-49', '50-59', '60+'] as const
export type AgeRange = (typeof AGE_RANGES)[number]

/* ------------------------------------------------------------------ profile */

export interface TrainingProfile {
  /** Which questionnaire produced this. 0 = never onboarded. */
  onboardingVersion: number
  /** Set only when the last step was actually reached. */
  completedAt: number | null

  /* --- step 1, about you ------------------------------------------------ */

  /** cm. Always metric internally; the UI converts. — used for: nothing yet on
   *  its own; it is the denominator the moment bodyweight-relative strength or
   *  BMI-style context appears, and it is the one body fact that never changes.
   *  OPTIONAL. */
  heightCm: number | null
  /** kg. — used for: seeding the bodyweight chart with a first point, and
   *  loading bodyweight exercises so volume is not zero. OPTIONAL. */
  bodyweightKg: number | null
  /** — used for: every weight and distance shown in the app. REQUIRED. */
  units: Units
  /** — used for: softening default weekly volume at the extremes. OPTIONAL. */
  ageRange: AgeRange | null

  /* --- step 2, goal ----------------------------------------------------- */

  /** — used for: rep ranges, which metric leads on Progress, which chart Home
   *  opens with, and how the overload coach prioritises load vs reps. REQUIRED. */
  mainGoal: MainGoal
  /** — used for: a secondary weighting when the main goal leaves a tie, e.g.
   *  hypertrophy + endurance keeps cardio visible. OPTIONAL. */
  secondaryGoal: MainGoal | null

  /* --- step 3, experience ----------------------------------------------- */

  /** — used for: default set counts, default RIR target, and whether advanced
   *  set types are offered up front. REQUIRED. */
  experienceLevel: ExperienceLevel
  /** — used for: refining the above; five years in reads differently from six
   *  months even at the same self-declared level. OPTIONAL. */
  trainingYears: TrainingYears | null

  /* --- step 4, availability --------------------------------------------- */

  /** — used for: which routine templates are suggested, and the weekly set
   *  targets per muscle group. REQUIRED. */
  daysPerWeek: number
  /** — used for: the calendar's suggested days and streak expectations. OPTIONAL. */
  preferredDays: Weekday[]
  /** minutes. — used for: capping the length of suggested sessions, so a
   *  45-minute window is never met with a 28-set routine. REQUIRED. */
  sessionDuration: SessionDuration

  /* --- step 5, environment ---------------------------------------------- */

  /** — used for: the default equipment set, and the library's first filter. REQUIRED. */
  trainingEnvironment: TrainingEnvironment
  /** — used for: ranking the exercise library and excluding impossible
   *  exercises from suggestions. Never hides anything permanently. REQUIRED. */
  availableEquipment: AvailableEquipment[]

  /* --- step 6, interests ------------------------------------------------ */

  /** — used for: which sections Home surfaces, and whether cardio gets its own
   *  card on Progress. OPTIONAL. */
  trainingInterests: TrainingInterest[]

  /* --- step 7, preferences ---------------------------------------------- */

  /** Exercise ids. — used for: floating them to the top of the picker. OPTIONAL. */
  favoriteExerciseIds: string[]
  /** Exercise ids. — used for: dropping them out of *suggestions*. They stay
   *  fully searchable and usable; this is a preference, not a ban. OPTIONAL. */
  avoidedExerciseIds: string[]
  /** — used for: the default rep range on newly added exercises, when the
   *  person has an opinion. Falls back to the goal's range. OPTIONAL. */
  preferredRepRange: { min: number; max: number } | null
  /** — used for: which cardio exercises lead the library. OPTIONAL. */
  preferredCardio: CardioPreference[]
}

export function emptyTrainingProfile(units: Units = 'kg'): TrainingProfile {
  return {
    onboardingVersion: 0,
    completedAt: null,
    heightCm: null,
    bodyweightKg: null,
    units,
    ageRange: null,
    mainGoal: 'hypertrophy',
    secondaryGoal: null,
    experienceLevel: 'beginner',
    trainingYears: null,
    daysPerWeek: 4,
    preferredDays: [],
    sessionDuration: 60,
    trainingEnvironment: 'commercial',
    availableEquipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bench', 'bodyweight'],
    trainingInterests: [],
    favoriteExerciseIds: [],
    avoidedExerciseIds: [],
    preferredRepRange: null,
    preferredCardio: [],
  }
}

/**
 * Merges a stored profile over the defaults.
 *
 * Every field is optional on the way in, because a profile written by an older
 * version of the questionnaire simply will not have the newer keys — and a
 * missing key must read as "not answered", never as `undefined` leaking into a
 * comparison. Arrays are replaced wholesale rather than concatenated: an empty
 * selection is a real answer.
 */
export function mergeTrainingProfile(
  stored: Partial<TrainingProfile> | null | undefined,
  units: Units = 'kg',
): TrainingProfile {
  const base = emptyTrainingProfile(units)
  if (!stored) return base

  // Spreading an object that carries explicit `undefined` values would
  // overwrite the defaults with undefined — which is how `daysPerWeek` became
  // "undefined días/semana" on the summary screen and turned a three-day week
  // into a six-day routine. A key that is present but undefined means "not
  // answered", exactly like a key that is absent, so both are dropped here.
  const given: Partial<TrainingProfile> = {}
  for (const [k, v] of Object.entries(stored)) {
    if (v !== undefined) (given as Record<string, unknown>)[k] = v
  }

  return {
    ...base,
    ...given,
    preferredDays: given.preferredDays ?? base.preferredDays,
    availableEquipment: given.availableEquipment ?? base.availableEquipment,
    trainingInterests: given.trainingInterests ?? base.trainingInterests,
    favoriteExerciseIds: given.favoriteExerciseIds ?? base.favoriteExerciseIds,
    avoidedExerciseIds: given.avoidedExerciseIds ?? base.avoidedExerciseIds,
    preferredCardio: given.preferredCardio ?? base.preferredCardio,
    preferredRepRange: given.preferredRepRange ?? base.preferredRepRange,
  }
}

/** True once the person has been through the current questionnaire. */
export function isOnboardingCurrent(p: Pick<TrainingProfile, 'onboardingVersion'>): boolean {
  return p.onboardingVersion >= ONBOARDING_VERSION
}

/* --------------------------------------------------------------- migration */

/**
 * Carries an existing account's two old answers into the new shape.
 *
 * The first version of the app stored `goal` and `trainingDaysPerWeek` directly
 * on the Firestore profile. Those are real answers the person gave and they are
 * not asked again: the top-up questionnaire starts with them already filled.
 *
 * `recomp` and `general` survive as goals unchanged; `hypertrophy` and
 * `strength` too. The old union was a strict subset of the new one, so nothing
 * has to be guessed.
 */
export function fromLegacyProfile(
  legacyGoal: string | null | undefined,
  legacyDays: number | null | undefined,
  units: Units,
): TrainingProfile {
  const base = emptyTrainingProfile(units)
  const goal = (MAIN_GOALS as readonly string[]).includes(legacyGoal ?? '')
    ? (legacyGoal as MainGoal)
    : base.mainGoal
  return {
    ...base,
    mainGoal: goal,
    daysPerWeek: typeof legacyDays === 'number' && legacyDays > 0 ? legacyDays : base.daysPerWeek,
  }
}

/* ------------------------------------------------------- goal-derived rules */

export interface GoalDefaults {
  repMin: number
  repMax: number
  rirTarget: number
  /** Which metric leads on the exercise progress chart. */
  primaryMetric: 'e1rm' | 'weight' | 'volume' | 'reps'
  /** Relative weekly-set weighting applied to the stock targets. */
  volumeFactor: number
  /** Whether cardio gets first-class placement on Home and Progress. */
  cardioForward: boolean
}

/**
 * The single table that turns a goal into numbers.
 *
 * These are starting points, not prescriptions — every one of them is editable
 * per exercise and per routine the moment the app opens. The values follow the
 * ranges in common strength-training practice rather than anything invented
 * here: low reps and heavy load for strength, moderate reps and more total
 * sets for hypertrophy, higher reps and shorter rest where endurance leads.
 */
export const GOAL_DEFAULTS: Record<MainGoal, GoalDefaults> = {
  hypertrophy: { repMin: 8, repMax: 12, rirTarget: 1, primaryMetric: 'volume', volumeFactor: 1, cardioForward: false },
  strength: { repMin: 3, repMax: 6, rirTarget: 2, primaryMetric: 'e1rm', volumeFactor: 0.8, cardioForward: false },
  fatloss: { repMin: 10, repMax: 15, rirTarget: 1, primaryMetric: 'volume', volumeFactor: 0.9, cardioForward: true },
  recomp: { repMin: 8, repMax: 12, rirTarget: 1, primaryMetric: 'volume', volumeFactor: 1, cardioForward: true },
  general: { repMin: 8, repMax: 12, rirTarget: 2, primaryMetric: 'weight', volumeFactor: 0.8, cardioForward: true },
  endurance: { repMin: 12, repMax: 20, rirTarget: 2, primaryMetric: 'reps', volumeFactor: 0.8, cardioForward: true },
  performance: { repMin: 5, repMax: 8, rirTarget: 2, primaryMetric: 'e1rm', volumeFactor: 0.9, cardioForward: true },
}

export interface ExperienceDefaults {
  defaultSets: number
  /** Extra RIR for someone still learning what failure feels like. */
  rirBias: number
  /** Whether drop sets, rest-pause and the like are offered before they are sought. */
  offerAdvancedSetTypes: boolean
}

export const EXPERIENCE_DEFAULTS: Record<ExperienceLevel, ExperienceDefaults> = {
  beginner: { defaultSets: 3, rirBias: 1, offerAdvancedSetTypes: false },
  intermediate: { defaultSets: 3, rirBias: 0, offerAdvancedSetTypes: true },
  advanced: { defaultSets: 4, rirBias: 0, offerAdvancedSetTypes: true },
}

/** Equipment implied by a choice of training environment, before refinement. */
export const ENVIRONMENT_EQUIPMENT: Record<TrainingEnvironment, AvailableEquipment[]> = {
  commercial: ['barbell', 'dumbbell', 'machine', 'cable', 'smith', 'kettlebell', 'band', 'bench', 'pullupbar', 'cardio', 'bodyweight'],
  home: ['dumbbell', 'band', 'bench', 'pullupbar', 'bodyweight'],
  minimal: ['dumbbell', 'band', 'bodyweight'],
  bodyweight: ['bodyweight'],
  mixed: ['barbell', 'dumbbell', 'machine', 'cable', 'bench', 'bodyweight'],
}

/** Muscle groups a goal leans on, used only to tilt the stock weekly targets. */
export const GOAL_EMPHASIS: Partial<Record<MainGoal, MuscleGroup[]>> = {
  strength: ['chest', 'back', 'quads', 'glutes'],
  performance: ['quads', 'glutes', 'hamstrings', 'core'],
}
