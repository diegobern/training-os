import type { WorkoutSession } from '../db/schema'
import { isLogged } from './metrics'

/**
 * Where a session in progress stands, counted once for everyone who shows it:
 * the session header, the confirmation before finishing and the lock-screen
 * notification on Android. Three places counting sets three ways is how a
 * header says 9 of 12 while the dialog under it says 10.
 */
export interface SessionProgress {
  /** Sets ticked as done — the header's rule, warm-ups out if the setting says so. */
  doneSets: number
  totalSets: number
  /** Exercises with at least one set that will actually be saved. */
  loggedExercises: number
  totalExercises: number
  /** Whether finishing would save anything at all. */
  anyLogged: boolean
}

export function sessionProgress(session: WorkoutSession, excludeWarmups: boolean): SessionProgress {
  let doneSets = 0
  let totalSets = 0
  let loggedExercises = 0
  for (const ex of session.exercises) {
    for (const s of ex.sets) {
      if (s.type === 'warmup' && excludeWarmups) continue
      totalSets++
      if (s.completed) doneSets++
    }
    // The same test `finishSession` applies when it writes the logs, so this
    // is a count of what will be saved, not of what was touched.
    if (ex.sets.some(isLogged)) loggedExercises++
  }
  return {
    doneSets,
    totalSets,
    loggedExercises,
    totalExercises: session.exercises.length,
    anyLogged: loggedExercises > 0,
  }
}
