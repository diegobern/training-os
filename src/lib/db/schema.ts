/* ============================================================================
 * TRAINING OS — domain model
 *
 * Storage is local-first (IndexedDB). The model is still normalised where
 * normalisation buys us something:
 *
 *   exercises      — the library. Referenced by id from everywhere.
 *   routines       — document per routine (days + exercises nested).
 *                    Days/exercises are only ever read and written together
 *                    with their routine, so splitting them into their own
 *                    stores would buy nothing and cost transactional safety.
 *   sessions       — document per workout session (exercises + sets nested).
 *                    A session must be saved atomically or a gym-floor crash
 *                    could leave half a workout behind.
 *   exerciseLogs   — denormalised read-model: one row per (session, exercise),
 *                    indexed by exerciseId + date. This is what Progress, the
 *                    coach and PR detection read, so none of them ever has to
 *                    scan the whole session history.
 *   personalRecords, bodyweight, measurements, photos, milestones, meta
 *
 * Soft deletes: routines, exercises and sessions carry `deletedAt`.
 * ========================================================================== */

export type ID = string

export type Units = 'kg' | 'lb'
export type IntensityMetric = 'rir' | 'rpe'
export type ThemeMode = 'dark' | 'light' | 'system'
export type Language = 'es' | 'en'

export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'forearms',
  'other',
] as const
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'smith',
  'kettlebell',
  'band',
  'other',
] as const
export type Equipment = (typeof EQUIPMENT)[number]

/**
 * What kind of thing an exercise is, which decides how a set of it is logged
 * and what can be computed from it.
 *
 * This is a different axis from `ExerciseType` below, which describes the
 * movement (compound vs isolation). A treadmill run is `kind: 'cardio'`; asking
 * whether it is compound or isolation is meaningless. Existing rows have no
 * `kind`, so every read goes through `exerciseKind()`, which infers the old
 * behaviour — strength — rather than leaving `undefined` to leak into a branch.
 */
export const EXERCISE_KINDS = ['strength', 'cardio', 'mobility'] as const
export type ExerciseKind = (typeof EXERCISE_KINDS)[number]

/**
 * The metrics a cardio exercise can record. An exercise declares the ones that
 * make sense for it, and the logger shows only those: a rowing machine has
 * resistance and no incline, an outdoor run has neither.
 *
 * None of them is ever required. Someone who only knows they ran for 25
 * minutes has logged a real session, and the app must treat it as one.
 */
export const CARDIO_METRICS = [
  'duration',
  'distance',
  'incline',
  'resistance',
  'speed',
  'avgHr',
  'calories',
] as const
export type CardioMetric = (typeof CARDIO_METRICS)[number]

/** How a cardio machine or activity is grouped in the library filters. */
export const CARDIO_MODES = ['run', 'bike', 'row', 'walk', 'machine', 'outdoor', 'hiit', 'swim', 'other'] as const
export type CardioMode = (typeof CARDIO_MODES)[number]

export const EXERCISE_TYPES = ['compound', 'isolation', 'cardio', 'stretch'] as const
export type ExerciseType = (typeof EXERCISE_TYPES)[number]

/** Set types. `working` is the default and the only one shown by default. */
export const SET_TYPES = [
  'warmup',
  'working',
  'top',
  'backoff',
  'drop',
  'failure',
  'restpause',
] as const
export type SetType = (typeof SET_TYPES)[number]

/** Set types that count towards volume / PR / weekly-set statistics. */
export const EFFECTIVE_SET_TYPES: SetType[] = [
  'working',
  'top',
  'backoff',
  'drop',
  'failure',
  'restpause',
]

export interface Exercise {
  id: ID
  name: string
  muscleGroup: MuscleGroup
  primaryMuscle: string
  secondaryMuscles: string[]
  equipment: Equipment
  type: ExerciseType
  /** Defaults copied into a routine when the exercise is added. */
  defaultSets: number
  repMin: number
  repMax: number
  rirTarget: number | null
  rpeTarget: number | null
  restSeconds: number
  /** Persistent technique cues — survive across every session. */
  instructions: string
  referenceUrl: string
  imageUrl: string
  isCustom: boolean
  isFavorite: boolean
  /** Weight increment source, used by the coach to round suggestions. */
  incrementSource: 'dumbbell' | 'barbell' | 'machine' | 'cable' | 'bodyweight'
  demo: boolean

  /* --- catalog ----------------------------------------------------------
     Present on rows resolved from the shared built-in catalog rather than
     from the user's own database. Absent on every row written before the
     catalog existed and on every custom exercise, which is exactly right:
     those belong to the user and the catalog's do not. */

  /** What this is and how a set of it is logged. Absent means strength. */
  kind?: ExerciseKind
  /** Which metrics a cardio exercise can record. */
  cardioMetrics?: CardioMetric[]
  cardioMode?: CardioMode
  /** True when the row was resolved from the catalog, not stored per-user. */
  fromCatalog?: boolean
  catalogSlug?: string
  /** Key into the media manifest; null when the exercise has no illustration. */
  mediaKey?: string | null
  /** Its own drawing, an equivalent movement's, or none at all. */
  mediaStatus?: 'illustrated' | 'variant' | 'none'
  /** The movement actually drawn, when `mediaStatus` is 'variant'. */
  mediaVariantOf?: { id: string; en: string; es: string }
  hasInstructions?: boolean
  /** Whether the Spanish name was written by hand or generated. */
  nameStatus?: 'missing' | 'machine' | 'reviewed'
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface RoutineExercise {
  id: ID
  exerciseId: ID
  order: number
  targetSets: number
  repMin: number
  repMax: number
  rirTarget: number | null
  rpeTarget: number | null
  restSeconds: number
  notes: string
}

export interface RoutineDay {
  id: ID
  name: string
  order: number
  exercises: RoutineExercise[]
}

export interface Routine {
  id: ID
  name: string
  description: string
  days: RoutineDay[]
  isActive: boolean
  archivedAt: number | null
  demo: boolean
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface SetEntry {
  id: ID
  type: SetType
  /** Always stored in kilograms. Display converts. */
  weight: number | null
  reps: number | null
  rir: number | null
  rpe: number | null
  completed: boolean
  completedAt: number | null
  note: string

  /* --- cardio ----------------------------------------------------------
     All optional, and absent entirely on the millions of strength sets that
     already exist. A set is nested inside its session document, so adding
     these needs no database migration — but every consumer must keep treating
     `undefined` as "not recorded", never as zero. */

  /** Seconds. The one metric almost every cardio entry has. */
  durationSec?: number | null
  /** Metres. Always metric internally, like weight; display converts. */
  distanceM?: number | null
  /** Percent, for a treadmill or a stepper. */
  inclinePct?: number | null
  /** The machine's own resistance number. Unitless by nature — a 7 on one
   *  brand of bike is not a 7 on another, which is why it is never used in any
   *  cross-exercise comparison. */
  resistance?: number | null
  /** Beats per minute, averaged over the effort. */
  avgHr?: number | null
  /** Kilocalories, as reported by the machine or watch. Recorded because
   *  people like to see it, never used in any calculation — machine estimates
   *  are not accurate enough to build anything on. */
  calories?: number | null
}

export interface SessionExercise {
  id: ID
  exerciseId: ID
  /** Denormalised so history stays readable if the library exercise is deleted. */
  name: string
  muscleGroup: MuscleGroup
  order: number
  targetSets: number
  repMin: number
  repMax: number
  rirTarget: number | null
  rpeTarget: number | null
  restSeconds: number
  sets: SetEntry[]
  /** Free notes for this exercise *in this session*. */
  sessionNote: string
}

export type SessionStatus = 'active' | 'completed'

export interface WorkoutSession {
  id: ID
  routineId: ID | null
  routineName: string
  dayId: ID | null
  dayName: string
  status: SessionStatus
  startedAt: number
  endedAt: number | null
  /** Seconds of elapsed wall time, excluding paused time. */
  durationSec: number
  /** Accumulated pause offset in ms, so recovery after a crash stays honest. */
  pausedMs: number
  pausedAt: number | null
  notes: string
  exercises: SessionExercise[]
  demo: boolean
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

/** Denormalised per-exercise read model, written when a session completes. */
export interface ExerciseLog {
  id: ID // `${sessionId}:${exerciseId}`
  sessionId: ID
  exerciseId: ID
  exerciseName: string
  muscleGroup: MuscleGroup
  /** Local calendar date, `YYYY-MM-DD`, for calendar/period grouping. */
  date: string
  performedAt: number
  sets: SetEntry[]
  effectiveSets: number
  totalReps: number
  volume: number
  topSetWeight: number
  topSetReps: number
  bestE1rm: number
  repMin: number
  repMax: number
  rirTarget: number | null
  demo: boolean
}

export type PRType = 'weight' | 'reps' | 'e1rm' | 'volume'

export interface PersonalRecord {
  id: ID
  exerciseId: ID
  exerciseName: string
  type: PRType
  value: number
  weight: number | null
  reps: number | null
  previousValue: number | null
  delta: number | null
  sessionId: ID
  date: string
  achievedAt: number
  demo: boolean
}

export interface BodyweightEntry {
  id: ID
  date: string
  weight: number // kg
  notes: string
  demo: boolean
  createdAt: number
}

export const MEASUREMENT_SITES = [
  'neck',
  'shoulders',
  'chest',
  'arms',
  'forearms',
  'waist',
  'hips',
  'thigh',
  'calf',
] as const
export type MeasurementSite = (typeof MEASUREMENT_SITES)[number]

export interface MeasurementEntry {
  id: ID
  date: string
  /** cm, per site. Missing keys simply were not measured. */
  values: Partial<Record<MeasurementSite, number>>
  notes: string
  demo: boolean
  createdAt: number
}

export type PhotoPose = 'front' | 'side' | 'back'

export interface ProgressPhoto {
  id: ID
  date: string
  pose: PhotoPose
  /**
   * The image bytes on this device. Null when the photo belongs to the account
   * but has not been downloaded here yet — it is fetched on demand from
   * private Firebase Storage the first time it is displayed.
   */
  blob: Blob | null
  /** Private Storage path, `users/{uid}/photos/{id}.jpg`, once uploaded. */
  storagePath: string | null
  width: number
  height: number
  weight: number | null
  notes: string
  createdAt: number
  updatedAt: number
}

export interface Milestone {
  id: ID
  key: string
  achievedAt: number
  meta: Record<string, string | number>
}

/** Weight increments actually available in the user's gym. */
export interface AvailableWeights {
  /** Explicit dumbbell ladder in kg. */
  dumbbells: number[]
  /** Plate denominations available per side, in kg. */
  barbellPlates: number[]
  barWeight: number
  /** Smallest usable step for pin-loaded machines / cables, in kg. */
  machineStep: number
  cableStep: number
  /** Micro-plates, if the user has them. */
  microPlates: number[]
}

export interface Settings {
  id: 'app'
  units: Units
  intensityMetric: IntensityMetric
  language: Language
  theme: ThemeMode
  defaultRestSeconds: number
  restAutoStart: boolean
  restSound: boolean
  restVibrate: boolean
  haptics: boolean
  sounds: boolean
  animations: boolean
  excludeWarmupsFromStats: boolean
  autofillPreviousSets: boolean
  weekStartsOn: 0 | 1
  availableWeights: AvailableWeights
  /** Weekly effective-set targets per muscle group, used only as a reference line. */
  weeklySetTargets: Partial<Record<MuscleGroup, number>>
  demoDataPresent: boolean
  onboarded: boolean

  /**
   * The questionnaire's answers, stored locally and mirrored to the account.
   *
   * Local is authoritative on purpose. The first version kept this only on the
   * Firestore profile, which meant the questionnaire could not run at all
   * without Firebase configured and reachable — so an offline first launch, or
   * a local-only install, had no onboarding and therefore no personalization.
   *
   * Typed loosely here to keep `schema.ts` free of a dependency on the
   * training layer; `mergeTrainingProfile` gives it its real shape on read.
   */
  trainingProfile?: Record<string, unknown> | null
  /** Which questionnaire produced it. 0 or absent means none. */
  onboardingVersion?: number
  createdAt: number
  updatedAt: number
}

export interface MetaRow {
  key: string
  value: unknown
  updatedAt: number
}

export const DEFAULT_AVAILABLE_WEIGHTS: AvailableWeights = {
  dumbbells: [
    2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32.5, 35, 37.5, 40, 42.5, 45, 47.5, 50,
  ],
  barbellPlates: [1.25, 2.5, 5, 10, 15, 20, 25],
  barWeight: 20,
  machineStep: 5,
  cableStep: 2.5,
  microPlates: [],
}

export const DEFAULT_WEEKLY_SET_TARGETS: Partial<Record<MuscleGroup, number>> = {
  chest: 12,
  back: 14,
  shoulders: 10,
  biceps: 8,
  triceps: 8,
  quads: 12,
  hamstrings: 8,
  glutes: 8,
  calves: 6,
  core: 6,
}

export function defaultSettings(now = Date.now()): Settings {
  return {
    id: 'app',
    units: 'kg',
    intensityMetric: 'rir',
    language: 'es',
    theme: 'light',
    defaultRestSeconds: 120,
    restAutoStart: true,
    restSound: true,
    restVibrate: true,
    haptics: true,
    sounds: true,
    animations: true,
    excludeWarmupsFromStats: true,
    autofillPreviousSets: true,
    weekStartsOn: 1,
    availableWeights: { ...DEFAULT_AVAILABLE_WEIGHTS },
    weeklySetTargets: { ...DEFAULT_WEEKLY_SET_TARGETS },
    demoDataPresent: false,
    onboarded: false,
    createdAt: now,
    updatedAt: now,
  }
}

/* ---------------------------------------------------------------- helpers */

export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}
