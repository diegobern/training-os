import type { ExerciseLog, MuscleGroup, WorkoutSession } from '../db/schema'
import { addDays, dateKey, startOfDay, startOfWeek } from '../dates'

export interface PeriodStats {
  workouts: number
  volume: number
  effectiveSets: number
  reps: number
  durationSec: number
}

export function statsFrom(sessions: WorkoutSession[], logs: ExerciseLog[]): PeriodStats {
  const ids = new Set(sessions.map((s) => s.id))
  const scoped = logs.filter((l) => ids.has(l.sessionId))
  return {
    workouts: sessions.length,
    volume: scoped.reduce((a, l) => a + l.volume, 0),
    effectiveSets: scoped.reduce((a, l) => a + l.effectiveSets, 0),
    reps: scoped.reduce((a, l) => a + l.totalReps, 0),
    durationSec: sessions.reduce((a, s) => a + s.durationSec, 0),
  }
}

/**
 * Consecutive weeks, counting back from the current one, that contain at least
 * one workout. The current week only breaks the streak once it is over, so a
 * Monday with no session yet does not wipe out months of consistency.
 */
export function weekStreak(sessions: WorkoutSession[], weekStartsOn: 0 | 1, now = Date.now()): number {
  if (!sessions.length) return 0
  const weeks = new Set(sessions.map((s) => startOfWeek(s.startedAt, weekStartsOn).getTime()))
  let cursor = startOfWeek(now, weekStartsOn).getTime()
  let streak = 0
  if (!weeks.has(cursor)) {
    cursor = addDays(cursor, -7).getTime()
    if (!weeks.has(cursor)) return 0
  }
  while (weeks.has(cursor)) {
    streak++
    cursor = addDays(cursor, -7).getTime()
  }
  return streak
}

export function trainedDayKeys(sessions: WorkoutSession[]): Set<string> {
  return new Set(sessions.map((s) => dateKey(s.startedAt)))
}

export function weeklySetsPerMuscle(logs: ExerciseLog[]): Map<MuscleGroup, number> {
  const map = new Map<MuscleGroup, number>()
  for (const l of logs) map.set(l.muscleGroup, (map.get(l.muscleGroup) ?? 0) + l.effectiveSets)
  return map
}

export function volumeByWeek(
  logs: ExerciseLog[],
  weekStartsOn: 0 | 1,
  weeks: number,
  now = Date.now(),
): { start: number; volume: number; sets: number }[] {
  const out: { start: number; volume: number; sets: number }[] = []
  const thisWeek = startOfWeek(now, weekStartsOn).getTime()
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(thisWeek, -7 * i).getTime()
    const end = addDays(start, 7).getTime()
    const scoped = logs.filter((l) => l.performedAt >= start && l.performedAt < end)
    out.push({
      start,
      volume: scoped.reduce((a, l) => a + l.volume, 0),
      sets: scoped.reduce((a, l) => a + l.effectiveSets, 0),
    })
  }
  return out
}

export function sessionsInRange(sessions: WorkoutSession[], from: number, to = Date.now()) {
  return sessions.filter((s) => s.startedAt >= from && s.startedAt <= to)
}

export function estimateDurationMinutes(exerciseCount: number, setCount: number, avgRest = 120): number {
  if (!setCount) return 0
  // Working time ≈ 40 s per set, plus rest between sets, plus a setup minute per exercise.
  const seconds = setCount * 40 + Math.max(0, setCount - exerciseCount) * avgRest + exerciseCount * 60
  return Math.round(seconds / 60)
}

export function todayStart(now = Date.now()) {
  return startOfDay(now).getTime()
}
