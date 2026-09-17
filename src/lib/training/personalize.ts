import type { MuscleGroup, Settings } from '../db/schema'
import { DEFAULT_WEEKLY_SET_TARGETS } from '../db/schema'
import {
  EXPERIENCE_DEFAULTS,
  GOAL_DEFAULTS,
  GOAL_EMPHASIS,
  type AvailableEquipment,
  type TrainingProfile,
} from './profile'

/**
 * The personalization engine.
 *
 * The questionnaire is only worth asking if the answers change something, so
 * this is the single place that turns a profile into consequences. Every
 * function here produces a DEFAULT or a RANKING — never a restriction. The
 * distinction matters more than it sounds:
 *
 *   · a default is what a new routine starts with, and the user can change it
 *     on the next tap;
 *   · a ranking decides what appears first, and everything else is still one
 *     scroll away;
 *   · a restriction would decide what the user is allowed to do, and nothing
 *     here does that. Someone who said "home gym" can still add a barbell
 *     squat — they may be travelling, or the answer may simply have changed.
 *
 * Nothing in here is a prescription. The app suggests; the person decides.
 */

/* ------------------------------------------------------------- equipment */

/** Exercise equipment values reachable with what the person says they have. */
export function usableEquipment(profile: TrainingProfile): string[] {
  const have = new Set<AvailableEquipment>(profile.availableEquipment)
  const out = new Set<string>(['bodyweight', 'other'])
  if (have.has('barbell')) out.add('barbell')
  if (have.has('dumbbell')) out.add('dumbbell')
  if (have.has('machine')) out.add('machine')
  if (have.has('cable')) out.add('cable')
  if (have.has('smith')) out.add('smith')
  if (have.has('kettlebell')) out.add('kettlebell')
  if (have.has('band')) out.add('band')
  return [...out]
}

/* ------------------------------------------------------------- exercises */

export interface ExerciseDefaults {
  sets: number
  repMin: number
  repMax: number
  rirTarget: number
  restSeconds: number
}

/**
 * What a newly added strength exercise starts with.
 *
 * The goal picks the rep range, experience picks the set count and nudges the
 * RIR target — someone still learning what proximity to failure feels like is
 * better off leaving a rep in reserve than guessing. A rep range the person
 * stated themselves beats the goal's.
 */
export function defaultsForExercise(
  profile: TrainingProfile,
  isolation: boolean,
): ExerciseDefaults {
  const goal = GOAL_DEFAULTS[profile.mainGoal]
  const exp = EXPERIENCE_DEFAULTS[profile.experienceLevel]
  const range = profile.preferredRepRange ?? { min: goal.repMin, max: goal.repMax }

  return {
    sets: exp.defaultSets,
    // Isolation work sits a little higher in the range than a compound, at
    // any goal — the load is smaller and the joint stress lower.
    repMin: isolation ? range.min + 2 : range.min,
    repMax: isolation ? range.max + 3 : range.max,
    rirTarget: Math.min(4, goal.rirTarget + exp.rirBias),
    restSeconds: isolation ? 90 : profile.mainGoal === 'strength' ? 180 : 150,
  }
}

/* ---------------------------------------------------------------- volume */

/**
 * Weekly effective-set targets per muscle group.
 *
 * Starts from the app's stock numbers and tilts them by goal, training days
 * and — gently — age. These are reference lines on a chart, not quotas: the
 * app never tells anyone they have to hit them.
 *
 * Days per week is the strongest input, because the number of sets a person
 * can recover from and actually fit in is bounded by how often they train. A
 * three-day week carrying a five-day target produces a chart that is always
 * red, which teaches nothing.
 */
export function weeklySetTargets(profile: TrainingProfile): Partial<Record<MuscleGroup, number>> {
  const goal = GOAL_DEFAULTS[profile.mainGoal]
  const dayFactor = Math.max(0.6, Math.min(1.25, profile.daysPerWeek / 4))
  const ageFactor = profile.ageRange === '50-59' ? 0.9 : profile.ageRange === '60+' ? 0.8 : 1
  const emphasis = new Set(GOAL_EMPHASIS[profile.mainGoal] ?? [])

  const out: Partial<Record<MuscleGroup, number>> = {}
  for (const [muscle, base] of Object.entries(DEFAULT_WEEKLY_SET_TARGETS) as [MuscleGroup, number][]) {
    const emphasised = emphasis.has(muscle) ? 1.15 : 1
    out[muscle] = Math.max(4, Math.round(base * goal.volumeFactor * dayFactor * ageFactor * emphasised))
  }
  return out
}

/* -------------------------------------------------------------- routines */

export interface TemplateSuggestion {
  /** Stable id. The display name is translated in the UI, never persisted. */
  templateId: string
  days: number
  /** Stable day ids, again translated for display. */
  dayIds: string[]
  /** Roughly how many exercises fit the stated session length. */
  exercisesPerDay: number
}

/**
 * Which routine shape to suggest.
 *
 * Driven by days per week, because that is what actually decides whether a
 * split works. Session length then caps how much goes in each day: a
 * 45-minute window with eight exercises in it is a routine nobody finishes,
 * and an unfinished routine reads as failure rather than as a bad suggestion.
 */
export function suggestTemplate(profile: TrainingProfile): TemplateSuggestion {
  const d = profile.daysPerWeek
  // About eleven minutes per exercise once warm-up sets, rest between working
  // sets and finding the machine are counted. That lands a 60-minute session
  // on five or six exercises, which is what one actually looks like — an
  // earlier divisor put eight in an hour, which is a routine nobody finishes.
  // Floored at three so even a half hour is a real session, capped at eight
  // because past that the last exercises get skipped regardless.
  const exercisesPerDay = Math.max(3, Math.min(8, Math.round(profile.sessionDuration / 11)))

  if (d <= 2) return { templateId: 'template.fullbody', days: 2, dayIds: ['day.fullBodyA', 'day.fullBodyB'], exercisesPerDay }
  if (d === 3) {
    return profile.experienceLevel === 'beginner'
      ? { templateId: 'template.fullbody', days: 3, dayIds: ['day.fullBodyA', 'day.fullBodyB', 'day.fullBodyC'], exercisesPerDay }
      : { templateId: 'template.ppl', days: 3, dayIds: ['day.push', 'day.pull', 'day.legs'], exercisesPerDay }
  }
  if (d === 4) return { templateId: 'template.upperLower', days: 4, dayIds: ['day.upperA', 'day.lowerA', 'day.upperB', 'day.lowerB'], exercisesPerDay }
  if (d === 5) return { templateId: 'template.pplUL', days: 5, dayIds: ['day.push', 'day.pull', 'day.legs', 'day.upper', 'day.lower'], exercisesPerDay }
  return { templateId: 'template.ppl', days: 6, dayIds: ['day.push', 'day.pull', 'day.legs', 'day.push', 'day.pull', 'day.legs'], exercisesPerDay }
}

/* ------------------------------------------------------------ what leads */

export interface Emphasis {
  /** Which metric the exercise progress chart opens on. */
  primaryMetric: 'e1rm' | 'weight' | 'volume' | 'reps'
  /** Whether cardio gets its own card on Home and Progress. */
  cardioForward: boolean
  /** Whether mobility work is surfaced rather than merely searchable. */
  mobilityForward: boolean
  /** Advanced set types offered in the picker before they are looked for. */
  offerAdvancedSetTypes: boolean
}

export function emphasisFor(profile: TrainingProfile): Emphasis {
  const goal = GOAL_DEFAULTS[profile.mainGoal]
  const second = profile.secondaryGoal ? GOAL_DEFAULTS[profile.secondaryGoal] : null
  const interests = new Set(profile.trainingInterests)

  return {
    primaryMetric: goal.primaryMetric,
    // Three independent ways to ask for cardio: the goal, the secondary goal,
    // or simply saying you are interested in it. Any one is enough.
    cardioForward:
      goal.cardioForward ||
      !!second?.cardioForward ||
      interests.has('cardio') ||
      interests.has('running') ||
      interests.has('cycling') ||
      interests.has('hiit'),
    mobilityForward: interests.has('mobility'),
    offerAdvancedSetTypes: EXPERIENCE_DEFAULTS[profile.experienceLevel].offerAdvancedSetTypes,
  }
}

/* ------------------------------------------------------------- settings */

/**
 * The settings patch applied when onboarding finishes.
 *
 * Only the fields the questionnaire actually asked about. Everything else the
 * user may already have changed is left exactly as it is — finishing
 * onboarding must not quietly reset someone's theme or rest timer.
 */
export function settingsPatchFor(profile: TrainingProfile): Partial<Settings> {
  return {
    units: profile.units,
    weeklySetTargets: weeklySetTargets(profile),
    defaultRestSeconds: profile.mainGoal === 'strength' ? 180 : 120,
  }
}
