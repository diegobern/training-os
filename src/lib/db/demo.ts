/* ============================================================================
 * DEMO DATA
 *
 * Everything created here carries `demo: true` and is labelled DEMO in the UI.
 * It exists so charts, PRs and the overload assistant can be tried before there
 * is any real history — it is never presented as real training.
 * ========================================================================== */

import { getDB, log, notify, readSettings, writeSettings } from './database'
import { enqueueMany } from '../sync/queue'
import { commitCompletedSession, makeSet } from './repo.sessions'
import { getExercisesByIds } from './repo.exercises'
import { makeRoutine, makeRoutineDay, makeRoutineExercise, saveRoutine } from './repo.routines'
import { newId, type SessionExercise, type WorkoutSession } from './schema'
import { ladderFor } from '../training/weights'
import { addBodyweight } from './repo.body'
import { dateKey } from '../dates'

interface Plan {
  day: string
  exercises: { slug: string; sets: number; repMin: number; repMax: number; startWeight: number }[]
}

const PLAN: Plan[] = [
  {
    day: 'PUSH',
    exercises: [
      { slug: 'incline-dumbbell-press', sets: 3, repMin: 6, repMax: 10, startWeight: 30 },
      { slug: 'chest-press-machine', sets: 3, repMin: 8, repMax: 12, startWeight: 55 },
      { slug: 'dumbbell-shoulder-press', sets: 3, repMin: 8, repMax: 12, startWeight: 18 },
      { slug: 'lateral-raise', sets: 4, repMin: 12, repMax: 18, startWeight: 8 },
      { slug: 'rope-pushdown', sets: 3, repMin: 12, repMax: 15, startWeight: 25 },
    ],
  },
  {
    day: 'PULL',
    exercises: [
      { slug: 'lat-pulldown', sets: 3, repMin: 8, repMax: 12, startWeight: 60 },
      { slug: 'barbell-row', sets: 4, repMin: 6, repMax: 10, startWeight: 60 },
      { slug: 'seated-cable-row', sets: 3, repMin: 8, repMax: 12, startWeight: 55 },
      { slug: 'face-pull', sets: 3, repMin: 12, repMax: 20, startWeight: 20 },
      { slug: 'incline-dumbbell-curl', sets: 3, repMin: 10, repMax: 15, startWeight: 10 },
    ],
  },
  {
    day: 'LEGS',
    exercises: [
      { slug: 'back-squat', sets: 4, repMin: 5, repMax: 8, startWeight: 80 },
      { slug: 'romanian-deadlift', sets: 3, repMin: 8, repMax: 12, startWeight: 70 },
      { slug: 'leg-press', sets: 3, repMin: 10, repMax: 15, startWeight: 120 },
      { slug: 'lying-leg-curl', sets: 3, repMin: 10, repMax: 15, startWeight: 35 },
      { slug: 'standing-calf-raise', sets: 4, repMin: 10, repMax: 15, startWeight: 60 },
    ],
  },
  {
    day: 'UPPER',
    exercises: [
      { slug: 'barbell-bench-press', sets: 4, repMin: 5, repMax: 8, startWeight: 60 },
      { slug: 'pull-up', sets: 4, repMin: 5, repMax: 10, startWeight: 5 },
      { slug: 'overhead-press', sets: 3, repMin: 5, repMax: 8, startWeight: 35 },
      { slug: 'chest-supported-row', sets: 3, repMin: 8, repMax: 12, startWeight: 45 },
      { slug: 'cable-curl', sets: 3, repMin: 10, repMax: 15, startWeight: 20 },
    ],
  },
  {
    day: 'LOWER',
    exercises: [
      { slug: 'hack-squat', sets: 3, repMin: 8, repMax: 12, startWeight: 80 },
      { slug: 'hip-thrust', sets: 3, repMin: 8, repMax: 12, startWeight: 70 },
      { slug: 'leg-extension', sets: 3, repMin: 12, repMax: 20, startWeight: 45 },
      { slug: 'seated-leg-curl', sets: 3, repMin: 10, repMax: 15, startWeight: 40 },
      { slug: 'seated-calf-raise', sets: 3, repMin: 12, repMax: 20, startWeight: 40 },
    ],
  },
]

const SESSION_COUNT = 18
const DAYS_BETWEEN = 2

export async function loadDemoData(): Promise<number> {
  const settings = await readSettings()
  const ids = PLAN.flatMap((p) => p.exercises.map((e) => `lib-${e.slug}`))
  const library = await getExercisesByIds(ids)

  // ---------------------------------------------------------------- routine
  const routine = makeRoutine('DEMO · Hypertrophy 2026')
  routine.demo = true
  routine.description = 'Rutina de ejemplo generada por Training OS.'
  const db0 = await getDB()
  const existing = await db0.getAll('routines')
  routine.isActive = !existing.some((r) => r.isActive && !r.deletedAt && !r.archivedAt)
  routine.days = PLAN.map((p, i) => {
    const day = makeRoutineDay(p.day, i)
    day.exercises = p.exercises
      .map((e, j) => {
        const ex = library.get(`lib-${e.slug}`)
        if (!ex) return null
        const re = makeRoutineExercise(ex, j)
        re.targetSets = e.sets
        re.repMin = e.repMin
        re.repMax = e.repMax
        re.rirTarget = 1
        return re
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
    return day
  })
  await saveRoutine(routine)

  // --------------------------------------------------------------- sessions
  const state = new Map<string, { weight: number; reps: number }>()
  for (const p of PLAN) {
    for (const e of p.exercises) state.set(e.slug, { weight: e.startWeight, reps: e.repMin })
  }

  const now = new Date()
  let created = 0

  for (let i = SESSION_COUNT - 1; i >= 0; i--) {
    const planIndex = (SESSION_COUNT - 1 - i) % PLAN.length
    const plan = PLAN[planIndex]
    const started = new Date(now)
    started.setDate(started.getDate() - i * DAYS_BETWEEN - 1)
    started.setHours(18, 15, 0, 0)
    const durationSec = 55 * 60 + ((i * 137) % 900)
    const ended = started.getTime() + durationSec * 1000

    const exercises: SessionExercise[] = []
    plan.exercises.forEach((e, order) => {
      const ex = library.get(`lib-${e.slug}`)
      if (!ex) return
      const st = state.get(e.slug)!
      const ladder = ladderFor(ex.incrementSource, settings.availableWeights)

      const sets = Array.from({ length: e.sets }, (_, k) => {
        const s = makeSet(k === 0 && e.sets > 3 ? 'warmup' : 'working')
        if (s.type === 'warmup') {
          s.weight = Math.max(ladder[0] ?? st.weight * 0.5, Math.round(st.weight * 0.55 * 2) / 2)
          s.reps = Math.min(12, e.repMax)
          s.rir = 5
        } else {
          s.weight = st.weight
          s.reps = Math.max(e.repMin, st.reps - Math.max(0, k - 1))
          s.rir = k === e.sets - 1 ? 0 : 1
        }
        s.completed = true
        s.completedAt = ended
        return s
      })

      exercises.push({
        id: newId(),
        exerciseId: ex.id,
        name: ex.name,
        muscleGroup: ex.muscleGroup,
        order,
        targetSets: e.sets,
        repMin: e.repMin,
        repMax: e.repMax,
        rirTarget: 1,
        rpeTarget: 9,
        restSeconds: ex.restSeconds,
        sets,
        sessionNote: '',
      })

      // Double progression, exactly as the coach would suggest.
      if (st.reps >= e.repMax) {
        const next = ladder.find((w) => w > st.weight)
        if (next !== undefined) {
          st.weight = next
          st.reps = e.repMin
        }
      } else {
        st.reps += 1
      }
    })

    const session: WorkoutSession = {
      id: newId(),
      routineId: routine.id,
      routineName: routine.name,
      dayId: routine.days[planIndex].id,
      dayName: plan.day,
      status: 'completed',
      startedAt: started.getTime(),
      endedAt: ended,
      durationSec,
      pausedMs: 0,
      pausedAt: null,
      notes: '',
      exercises,
      demo: true,
      createdAt: started.getTime(),
      updatedAt: ended,
      deletedAt: null,
    }

    await commitCompletedSession(session)
    created++
  }

  // ------------------------------------------------------------- bodyweight
  const startWeight = 78.4
  for (let d = 56; d >= 0; d -= 2) {
    const date = new Date(now)
    date.setDate(date.getDate() - d)
    const drift = -0.012 * (56 - d)
    const noise = (((d * 37) % 11) - 5) / 20
    await addBodyweight(Math.round((startWeight + drift + noise) * 10) / 10, dateKey(date), '')
  }
  const db = await getDB()
  const bw = await db.getAll('bodyweight')
  const tx = db.transaction('bodyweight', 'readwrite')
  for (const b of bw) await tx.store.put({ ...b, demo: true })
  await tx.done
  await enqueueMany(bw.map((b) => ({ store: 'bodyweight' as const, docId: b.id, op: 'put' as const })))

  await writeSettings({ demoDataPresent: true })
  log('demo', `seeded ${created} demo sessions`)
  notify('routines', 'sessions', 'exerciseLogs', 'personalRecords', 'bodyweight', 'settings')
  return created
}

export async function clearDemoData(): Promise<number> {
  const db = await getDB()
  let removed = 0
  const queued: { store: 'sessions' | 'exerciseLogs' | 'personalRecords' | 'routines' | 'bodyweight' | 'measurements'; docId: string; op: 'delete' }[] = []

  const demoSessionIds = new Set<string>()
  const sessions = await db.getAll('sessions')
  for (const s of sessions) if (s.demo) demoSessionIds.add(s.id)

  const tx = db.transaction(
    ['sessions', 'exerciseLogs', 'personalRecords', 'routines', 'bodyweight', 'measurements'],
    'readwrite',
  )
  for (const s of sessions) {
    if (s.demo) {
      await tx.objectStore('sessions').delete(s.id)
      queued.push({ store: 'sessions', docId: s.id, op: 'delete' })
      removed++
    }
  }
  for (const l of await tx.objectStore('exerciseLogs').getAll()) {
    if (l.demo || demoSessionIds.has(l.sessionId)) {
      await tx.objectStore('exerciseLogs').delete(l.id)
      queued.push({ store: 'exerciseLogs', docId: l.id, op: 'delete' })
      removed++
    }
  }
  for (const p of await tx.objectStore('personalRecords').getAll()) {
    if (p.demo || demoSessionIds.has(p.sessionId)) {
      await tx.objectStore('personalRecords').delete(p.id)
      queued.push({ store: 'personalRecords', docId: p.id, op: 'delete' })
      removed++
    }
  }
  for (const r of await tx.objectStore('routines').getAll()) {
    if (r.demo) {
      await tx.objectStore('routines').delete(r.id)
      queued.push({ store: 'routines', docId: r.id, op: 'delete' })
      removed++
    }
  }
  for (const b of await tx.objectStore('bodyweight').getAll()) {
    if (b.demo) {
      await tx.objectStore('bodyweight').delete(b.id)
      queued.push({ store: 'bodyweight', docId: b.id, op: 'delete' })
      removed++
    }
  }
  for (const m of await tx.objectStore('measurements').getAll()) {
    if (m.demo) {
      await tx.objectStore('measurements').delete(m.id)
      queued.push({ store: 'measurements', docId: m.id, op: 'delete' })
      removed++
    }
  }
  await tx.done
  await enqueueMany(queued)

  await writeSettings({ demoDataPresent: false })
  log('demo', `removed ${removed} demo records`)
  notify('routines', 'sessions', 'exerciseLogs', 'personalRecords', 'bodyweight', 'measurements', 'settings')
  return removed
}
