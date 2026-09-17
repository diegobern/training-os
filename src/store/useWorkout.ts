import { create } from 'zustand'
import {
  discardSession,
  finishSession,
  getActiveSession,
  lastLogForExercise,
  logsForExercise,
  makeSet,
  persistSession,
  startSession,
  checkLivePR,
  type DetectedPR,
  type FinishResult,
} from '../lib/db/repo.sessions'
import { getExercise } from '../lib/db/repo.exercises'
import { notify, log, readSettings } from '../lib/db/database'
import type {
  Exercise,
  ExerciseLog,
  Routine,
  RoutineDay,
  SessionExercise,
  SetEntry,
  SetType,
  WorkoutSession,
} from '../lib/db/schema'
import { newId } from '../lib/db/schema'
import { buildInsight, type ExerciseInsight } from '../lib/training/overload'
import { incrementSourceForEquipment } from '../lib/training/weights'
import { useApp } from './useApp'
import { haptic, sound } from '../lib/feedback'

export interface RestState {
  total: number
  endsAt: number
  paused: boolean
  remaining: number
  exerciseName: string
}

export type Celebration =
  | { kind: 'pr'; pr: DetectedPR }
  | { kind: 'weight-up'; exerciseName: string; from: number; to: number }
  | null

interface WorkoutState {
  session: WorkoutSession | null
  loaded: boolean
  saving: boolean
  currentIndex: number
  previous: Record<string, ExerciseLog | null>
  insights: Record<string, ExerciseInsight>
  rest: RestState | null
  celebration: Celebration
  finishResult: FinishResult | null

  load: () => Promise<void>
  begin: (routine: Routine | null, day: RoutineDay | null, freeName?: string) => Promise<void>
  discard: () => Promise<void>
  finish: () => Promise<FinishResult | null>
  clearFinish: () => void

  setCurrentIndex: (i: number) => void
  updateSet: (exerciseId: string, setId: string, patch: Partial<SetEntry>) => void
  toggleComplete: (exerciseId: string, setId: string) => Promise<void>
  addSet: (exerciseId: string, type?: SetType) => void
  duplicateSet: (exerciseId: string, setId: string) => void
  removeSet: (exerciseId: string, setId: string) => void
  setSetType: (exerciseId: string, setId: string, type: SetType) => void
  setSessionNote: (note: string) => void
  setExerciseSessionNote: (exerciseId: string, note: string) => void
  addExercise: (exercise: Exercise) => Promise<void>
  removeExercise: (exerciseId: string) => void
  reorderExercises: (from: number, to: number) => void

  startRest: (seconds: number, exerciseName: string) => void
  adjustRest: (deltaSeconds: number) => void
  toggleRestPause: () => void
  restartRest: () => void
  stopRest: () => void
  tickRest: () => void

  dismissCelebration: () => void
}

let saveTimer: number | null = null

function scheduleSave(session: WorkoutSession, immediate = false) {
  if (saveTimer) window.clearTimeout(saveTimer)
  const write = () => {
    saveTimer = null
    void persistSession(session).catch((err) => log('workout', `autosave failed: ${String(err)}`, 'error'))
  }
  if (immediate) write()
  else saveTimer = window.setTimeout(write, 250)
}

/** Flush pending writes when the tab is hidden or closed — the gym-floor case. */
export function installSessionGuards() {
  const flush = () => {
    const s = useWorkout.getState().session
    if (s) scheduleSave(s, true)
  }
  window.addEventListener('pagehide', flush)
  window.addEventListener('beforeunload', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}

async function loadContext(session: WorkoutSession) {
  const settings = await readSettings()
  const previous: Record<string, ExerciseLog | null> = {}
  const insights: Record<string, ExerciseInsight> = {}
  for (const se of session.exercises) {
    const [last, logs, ex] = await Promise.all([
      lastLogForExercise(se.exerciseId, session.startedAt),
      logsForExercise(se.exerciseId),
      getExercise(se.exerciseId),
    ])
    previous[se.exerciseId] = last
    insights[se.exerciseId] = buildInsight({
      logs: logs.filter((l) => l.sessionId !== session.id),
      repMin: se.repMin,
      repMax: se.repMax,
      rirTarget: se.rirTarget,
      source: ex ? ex.incrementSource : incrementSourceForEquipment('other'),
      weights: settings.availableWeights,
    })
  }
  return { previous, insights }
}

function applyAutofill(session: WorkoutSession, previous: Record<string, ExerciseLog | null>) {
  for (const se of session.exercises) {
    const last = previous[se.exerciseId]
    if (!last) continue
    se.sets.forEach((set, i) => {
      // Only ever fill an untouched set — never overwrite something already entered.
      if (set.completed || set.weight !== null || set.reps !== null) return
      const prev = last.sets[i] ?? last.sets[last.sets.length - 1]
      if (!prev) return
      set.weight = prev.weight
      set.reps = prev.reps
    })
  }
}

export const useWorkout = create<WorkoutState>((set, get) => ({
  session: null,
  loaded: false,
  saving: false,
  currentIndex: 0,
  previous: {},
  insights: {},
  rest: null,
  celebration: null,
  finishResult: null,

  async load() {
    const session = await getActiveSession()
    if (!session) {
      set({ session: null, loaded: true, previous: {}, insights: {} })
      return
    }
    const { previous, insights } = await loadContext(session)
    set({ session, previous, insights, loaded: true })
  },

  async begin(routine, day, freeName) {
    const session = await startSession({ routine, day, freeName })
    const { previous, insights } = await loadContext(session)
    const settings = useApp.getState().settings
    if (settings.autofillPreviousSets) {
      applyAutofill(session, previous)
      scheduleSave(session, true)
    }
    set({ session, previous, insights, loaded: true, currentIndex: 0, rest: null, finishResult: null })
  },

  async discard() {
    const s = get().session
    if (s) await discardSession(s.id)
    set({ session: null, previous: {}, insights: {}, rest: null, currentIndex: 0 })
  },

  async finish() {
    const s = get().session
    if (!s) return null
    if (saveTimer) {
      window.clearTimeout(saveTimer)
      saveTimer = null
    }
    const result = await finishSession(s)
    set({ session: null, previous: {}, insights: {}, rest: null, currentIndex: 0, finishResult: result })
    sound('finish')
    haptic('success')
    return result
  },

  clearFinish() {
    set({ finishResult: null })
  },

  setCurrentIndex(i) {
    set({ currentIndex: i })
  },

  updateSet(exerciseId, setId, patch) {
    const s = get().session
    if (!s) return
    const next = structuredCloneSession(s)
    const ex = next.exercises.find((e) => e.exerciseId === exerciseId)
    if (!ex) return
    const target = ex.sets.find((x) => x.id === setId)
    if (!target) return
    Object.assign(target, patch)
    set({ session: next })
    scheduleSave(next)
  },

  async toggleComplete(exerciseId, setId) {
    const s = get().session
    if (!s) return
    const next = structuredCloneSession(s)
    const ex = next.exercises.find((e) => e.exerciseId === exerciseId)
    if (!ex) return
    const target = ex.sets.find((x) => x.id === setId)
    if (!target) return

    const wasCompleted = target.completed
    target.completed = !wasCompleted
    target.completedAt = target.completed ? Date.now() : null
    set({ session: next })
    scheduleSave(next, true)

    if (!target.completed) return

    haptic('success')
    sound('tick')

    // Weight-up detection against the same set index of the previous session.
    const prevLog = get().previous[exerciseId]
    const idx = ex.sets.findIndex((x) => x.id === setId)
    const prevSet = prevLog?.sets[idx]
    if (
      prevSet &&
      prevSet.weight !== null &&
      target.weight !== null &&
      target.weight > prevSet.weight &&
      target.reps !== null
    ) {
      set({
        celebration: {
          kind: 'weight-up',
          exerciseName: ex.name,
          from: prevSet.weight,
          to: target.weight,
        },
      })
    }

    // PR check is read-only until the session is finished.
    try {
      const pr = await checkLivePR(exerciseId, ex.name, target, next.id)
      if (pr) {
        haptic('pr')
        sound('pr')
        set({ celebration: { kind: 'pr', pr } })
      }
    } catch (err) {
      log('workout', `PR check failed: ${String(err)}`, 'warn')
    }

    // Auto rest.
    const settings = useApp.getState().settings
    if (settings.restAutoStart && target.type !== 'warmup') {
      get().startRest(ex.restSeconds || settings.defaultRestSeconds, ex.name)
    }
  },

  addSet(exerciseId, type = 'working') {
    const s = get().session
    if (!s) return
    const next = structuredCloneSession(s)
    const ex = next.exercises.find((e) => e.exerciseId === exerciseId)
    if (!ex) return
    const last = [...ex.sets].reverse().find((x) => x.weight !== null)
    const fresh = makeSet(type)
    if (last) {
      fresh.weight = last.weight
      fresh.reps = last.reps
    }
    ex.sets.push(fresh)
    set({ session: next })
    scheduleSave(next, true)
  },

  duplicateSet(exerciseId, setId) {
    const s = get().session
    if (!s) return
    const next = structuredCloneSession(s)
    const ex = next.exercises.find((e) => e.exerciseId === exerciseId)
    if (!ex) return
    const i = ex.sets.findIndex((x) => x.id === setId)
    if (i === -1) return
    const copy: SetEntry = { ...ex.sets[i], id: newId(), completed: false, completedAt: null }
    ex.sets.splice(i + 1, 0, copy)
    set({ session: next })
    scheduleSave(next, true)
  },

  removeSet(exerciseId, setId) {
    const s = get().session
    if (!s) return
    const next = structuredCloneSession(s)
    const ex = next.exercises.find((e) => e.exerciseId === exerciseId)
    if (!ex) return
    ex.sets = ex.sets.filter((x) => x.id !== setId)
    set({ session: next })
    scheduleSave(next, true)
  },

  setSetType(exerciseId, setId, type) {
    get().updateSet(exerciseId, setId, { type })
  },

  setSessionNote(note) {
    const s = get().session
    if (!s) return
    const next = { ...s, notes: note }
    set({ session: next })
    scheduleSave(next)
  },

  setExerciseSessionNote(exerciseId, note) {
    const s = get().session
    if (!s) return
    const next = structuredCloneSession(s)
    const ex = next.exercises.find((e) => e.exerciseId === exerciseId)
    if (!ex) return
    ex.sessionNote = note
    set({ session: next })
    scheduleSave(next)
  },

  async addExercise(exercise) {
    const s = get().session
    if (!s) return
    if (s.exercises.some((e) => e.exerciseId === exercise.id)) return
    const settings = useApp.getState().settings
    const next = structuredCloneSession(s)
    const se: SessionExercise = {
      id: newId(),
      exerciseId: exercise.id,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      order: next.exercises.length,
      targetSets: exercise.defaultSets,
      repMin: exercise.repMin,
      repMax: exercise.repMax,
      rirTarget: exercise.rirTarget,
      rpeTarget: exercise.rpeTarget,
      restSeconds: exercise.restSeconds || settings.defaultRestSeconds,
      sets: Array.from({ length: Math.max(1, exercise.defaultSets) }, () => makeSet('working')),
      sessionNote: '',
    }
    next.exercises.push(se)
    const [last, logs] = await Promise.all([
      lastLogForExercise(exercise.id, next.startedAt),
      logsForExercise(exercise.id),
    ])
    if (settings.autofillPreviousSets && last) {
      se.sets.forEach((st, i) => {
        const prev = last.sets[i] ?? last.sets[last.sets.length - 1]
        if (prev) {
          st.weight = prev.weight
          st.reps = prev.reps
        }
      })
    }
    set({
      session: next,
      previous: { ...get().previous, [exercise.id]: last },
      insights: {
        ...get().insights,
        [exercise.id]: buildInsight({
          logs: logs.filter((l) => l.sessionId !== next.id),
          repMin: se.repMin,
          repMax: se.repMax,
          rirTarget: se.rirTarget,
          source: exercise.incrementSource,
          weights: settings.availableWeights,
        }),
      },
    })
    scheduleSave(next, true)
  },

  removeExercise(exerciseId) {
    const s = get().session
    if (!s) return
    const next = structuredCloneSession(s)
    next.exercises = next.exercises.filter((e) => e.exerciseId !== exerciseId).map((e, i) => ({ ...e, order: i }))
    set({ session: next, currentIndex: Math.min(get().currentIndex, Math.max(0, next.exercises.length - 1)) })
    scheduleSave(next, true)
  },

  reorderExercises(from, to) {
    const s = get().session
    if (!s) return
    const next = structuredCloneSession(s)
    const [moved] = next.exercises.splice(from, 1)
    next.exercises.splice(to, 0, moved)
    next.exercises = next.exercises.map((e, i) => ({ ...e, order: i }))
    set({ session: next })
    scheduleSave(next, true)
  },

  /* ------------------------------------------------------------ rest timer */

  startRest(seconds, exerciseName) {
    set({
      rest: {
        total: seconds,
        endsAt: Date.now() + seconds * 1000,
        paused: false,
        remaining: seconds,
        exerciseName,
      },
    })
  },

  adjustRest(delta) {
    const rest = get().rest
    if (!rest) return
    if (rest.paused) {
      set({ rest: { ...rest, remaining: Math.max(0, rest.remaining + delta), total: Math.max(1, rest.total + delta) } })
    } else {
      set({
        rest: {
          ...rest,
          endsAt: rest.endsAt + delta * 1000,
          total: Math.max(1, rest.total + delta),
        },
      })
    }
  },

  toggleRestPause() {
    const rest = get().rest
    if (!rest) return
    if (rest.paused) {
      set({ rest: { ...rest, paused: false, endsAt: Date.now() + rest.remaining * 1000 } })
    } else {
      set({ rest: { ...rest, paused: true, remaining: Math.max(0, Math.round((rest.endsAt - Date.now()) / 1000)) } })
    }
  },

  restartRest() {
    const rest = get().rest
    if (!rest) return
    set({ rest: { ...rest, endsAt: Date.now() + rest.total * 1000, paused: false, remaining: rest.total } })
  },

  stopRest() {
    set({ rest: null })
  },

  tickRest() {
    const rest = get().rest
    if (!rest || rest.paused) return
    const remaining = Math.max(0, Math.round((rest.endsAt - Date.now()) / 1000))
    if (remaining !== rest.remaining) set({ rest: { ...rest, remaining } })
    if (remaining === 0) {
      const settings = useApp.getState().settings
      if (settings.restSound) sound('restEnd')
      if (settings.restVibrate) haptic('warn')
      set({ rest: null })
    }
  },

  dismissCelebration() {
    set({ celebration: null })
  },
}))

function structuredCloneSession(s: WorkoutSession): WorkoutSession {
  return {
    ...s,
    exercises: s.exercises.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x })) })),
  }
}

export function notifySessions() {
  notify('sessions')
}
