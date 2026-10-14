import { create } from 'zustand'
import {
  ACTIVE_EXERCISE_INDEX_KEY,
  ACTIVE_REST_KEY,
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
import { deleteMeta, getMeta, notify, log, readSettings, setMetaQuiet } from '../lib/db/database'
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
  /** Marca absoluta (ms de época) a la que termina. Sólo vale mientras no está en pausa. */
  endsAt: number
  paused: boolean
  /**
   * Segundos que quedaban al pausar (al empezar, el total). Sólo significa
   * algo en pausa: la cuenta que se ve en pantalla es `restRemaining`.
   */
  remaining: number
  exerciseName: string
  /** El ejercicio de la serie que lo empezó; `null` si no viene de una serie. */
  exerciseId: string | null
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
  /**
   * Segundos que enseña la barra de descanso. Lo mueve el reloj de este
   * almacén, una vez por segundo y sólo con la app a la vista; `rest` no
   * cambia con cada segundo, así que quien sólo necesita saber si hay
   * descanso y hasta cuándo (el aviso nativo) no se entera de cada tic.
   */
  restRemaining: number
  celebration: Celebration
  finishResult: FinishResult | null

  load: () => Promise<void>
  /**
   * Vacía el entrenamiento en memoria: cancela el guardado pendiente, para el
   * descanso y sube la época, así que nada de lo que esté en vuelo escribe ni
   * toca el estado después. `flush: true` guarda antes lo pendiente: sólo
   * cuando los datos se quedan (la sesión de Firebase se cerró sola, el dueño
   * no cambia). Ver docs/NATIVE-CONTRACT.md.
   */
  reset: (opts?: { flush?: boolean }) => Promise<void>
  /** Escribe ya el guardado pendiente y espera a los que estén en vuelo. */
  flushSave: () => Promise<void>
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

  startRest: (seconds: number, exerciseName: string, exerciseId?: string | null) => void
  adjustRest: (deltaSeconds: number) => void
  toggleRestPause: () => void
  restartRest: () => void
  stopRest: () => void
  /** Pone al día la cuenta en pantalla y, si la hora ya llegó, termina el descanso. */
  tickRest: () => void

  dismissCelebration: () => void
}

/* ------------------------------------------------------------------ época */

/**
 * Sube con cada `reset`. Cada acción asíncrona la apunta al empezar y, tras
 * cada `await`, comprueba que sigue igual antes de tocar el estado o escribir:
 * si alguien vació el entrenamiento mientras tanto (cerrar sesión, cambio de
 * dueño, «Borrar todo»), lo que llegue tarde se descarta en vez de resucitar
 * la sesión de la persona anterior.
 */
let epoch = 0

/* ------------------------------------------------------------ autoguardado */

const SAVE_DEBOUNCE_MS = 250

let saveTimer: ReturnType<typeof setTimeout> | null = null
/** La sesión que espera en el temporizador de arriba, para poder escribirla ya (`flushSave`). */
let pendingSave: WorkoutSession | null = null
/** Escrituras lanzadas y aún sin confirmar. */
const inflight = new Set<Promise<void>>()
/**
 * La sesión que se está terminando o descartando. Un autoguardado de esa
 * sesión que llegue tarde la devolvería a «en curso» por encima del
 * terminado: se descarta.
 */
let closingSessionId: string | null = null

/** Cancela el guardado con retardo que esté pendiente. Lo usan `reset`, `discard` y `finish`. */
function cancelPendingSave(): void {
  if (saveTimer !== null) clearTimeout(saveTimer)
  saveTimer = null
  pendingSave = null
}

function writeSession(session: WorkoutSession, myEpoch: number): Promise<void> {
  const write = persistSession(session, () => myEpoch === epoch && session.id !== closingSessionId).catch(
    (err: unknown) => log('workout', `autosave failed: ${String(err)}`, 'error'),
  )
  inflight.add(write)
  void write.finally(() => inflight.delete(write))
  return write
}

function scheduleSave(session: WorkoutSession, immediate = false): void {
  cancelPendingSave()
  const myEpoch = epoch
  if (immediate) {
    void writeSession(session, myEpoch)
    return
  }
  pendingSave = session
  saveTimer = setTimeout(() => {
    saveTimer = null
    pendingSave = null
    void writeSession(session, myEpoch)
  }, SAVE_DEBOUNCE_MS)
}

async function settleWrites(): Promise<void> {
  if (inflight.size) await Promise.allSettled([...inflight])
}

async function flushPendingSave(): Promise<void> {
  const pending = pendingSave
  if (pending) {
    cancelPendingSave()
    void writeSession(pending, epoch)
  }
  await settleWrites()
}

/**
 * Escribe lo que haya en memoria al ocultarse o cerrarse la app: el caso del
 * gimnasio. Tras un `reset` no hay sesión en memoria y no escribe nada; y lo
 * que estuviera en vuelo lleva su época (ver `writeSession`).
 */
export function flushOnHide(): void {
  const s = useWorkout.getState().session
  if (s) scheduleSave(s, true)
}

/** Flush pending writes when the tab is hidden or closed — the gym-floor case. */
export function installSessionGuards() {
  window.addEventListener('pagehide', flushOnHide)
  window.addEventListener('beforeunload', flushOnHide)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushOnHide()
      // El segundero sólo corre a la vista; el aviso de fin sigue armado.
      stopRestTick()
    } else {
      resumeRestClock()
    }
  })
}

/* --------------------------------------------------------- reloj de descanso */

/**
 * El descanso lo vigila este almacén, no la pantalla: termina a su hora
 * aunque la barra no esté montada (otra pantalla, la app en segundo plano).
 *
 * Dos temporizadores: uno hasta `endsAt`, que es el que termina el descanso,
 * y un segundero alineado con el cambio de segundo que sólo mueve
 * `restRemaining` mientras la app está a la vista. Con la app oculta no hay
 * segundero; al volver, `resumeRestClock` pone la cuenta al día.
 */
let restEndTimer: ReturnType<typeof setTimeout> | null = null
let restTickTimer: ReturnType<typeof setTimeout> | null = null

/** Margen tras `endsAt` en el que aún tiene sentido sonar: más tarde, el aviso del sistema ya lo dijo. */
const REST_CUE_GRACE_MS = 1500
/** Lo máximo que acepta `setTimeout` sin desbordarse (~24,8 días). */
const MAX_TIMEOUT_MS = 2_147_000_000

function pageVisible(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible'
}

function secondsLeft(rest: RestState, now = Date.now()): number {
  return Math.max(0, Math.ceil((rest.endsAt - now) / 1000))
}

function stopRestTick(): void {
  if (restTickTimer !== null) clearTimeout(restTickTimer)
  restTickTimer = null
}

function clearRestTimers(): void {
  if (restEndTimer !== null) clearTimeout(restEndTimer)
  restEndTimer = null
  stopRestTick()
}

/** Arma los dos temporizadores para el descanso actual (o los quita si no corre). */
function armRestClock(): void {
  clearRestTimers()
  const { rest } = useWorkout.getState()
  if (!rest || rest.paused) return
  const left = rest.endsAt - Date.now()
  if (left <= 0) {
    endRestNaturally()
    return
  }
  restEndTimer = setTimeout(endRestNaturally, Math.min(left, MAX_TIMEOUT_MS))
  scheduleRestTick()
}

function scheduleRestTick(): void {
  stopRestTick()
  const { rest } = useWorkout.getState()
  if (!rest || rest.paused || !pageVisible()) return
  const left = rest.endsAt - Date.now()
  if (left <= 0) return
  // Justo después del siguiente cambio de segundo: la cuenta baja a la vez
  // que el reloj, sin ir medio segundo por detrás.
  restTickTimer = setTimeout(() => {
    restTickTimer = null
    const current = useWorkout.getState().rest
    if (!current || current.paused) return
    const remaining = secondsLeft(current)
    if (remaining !== useWorkout.getState().restRemaining) useWorkout.setState({ restRemaining: remaining })
    scheduleRestTick()
  }, (left % 1000 || 1000) + 15)
}

/** Al volver la app a primer plano: la cuenta al día, o el final si la hora pasó. */
function resumeRestClock(): void {
  const { rest } = useWorkout.getState()
  if (!rest || rest.paused) return
  if (rest.endsAt <= Date.now()) {
    endRestNaturally()
    return
  }
  useWorkout.setState({ restRemaining: secondsLeft(rest) })
  armRestClock()
}

/**
 * Suena y vibra sólo si la app está a la vista y han pasado como mucho 1,5 s
 * desde `endsAt`. Más tarde (la app estaba en segundo plano y el temporizador
 * llegó con retraso) el aviso del sistema ya lo dijo: sonar ahora sería un
 * pitido a destiempo. Pura, para poder probarla.
 */
export function shouldCueRestEnd(endsAt: number, now: number, visible: boolean): boolean {
  return visible && now >= endsAt && now - endsAt <= REST_CUE_GRACE_MS
}

function defaultRestEndCue(): void {
  const settings = useApp.getState().settings
  if (settings.restSound) sound('restEnd')
  if (settings.restVibrate) haptic('warn')
}

let restEndCue: () => void = defaultRestEndCue

/** Sustituye el sonido y la vibración del fin del descanso. Para las pruebas; `null` vuelve al de siempre. */
export function setRestEndCue(fn: (() => void) | null): void {
  restEndCue = fn ?? defaultRestEndCue
}

/** Fin natural: la hora llegó. Nunca lanza; un fallo del sonido no puede tumbar el entrenamiento. */
function endRestNaturally(): void {
  restEndTimer = null
  const { rest } = useWorkout.getState()
  if (!rest || rest.paused) return
  const now = Date.now()
  if (rest.endsAt > now) {
    // Un temporizador adelantado (cambio de hora del sistema): se vuelve a armar.
    armRestClock()
    return
  }
  const cue = shouldCueRestEnd(rest.endsAt, now, pageVisible())
  clearRestTimers()
  useWorkout.setState({ rest: null, restRemaining: 0 })
  persistRest(null)
  if (!cue) return
  try {
    restEndCue()
  } catch (err) {
    log('workout', `rest cue failed: ${String(err)}`, 'warn')
  }
}

/* ------------------------------------------- descanso y ejercicio, en meta */

/** `meta.activeRest`. Ver docs/NATIVE-CONTRACT.md. */
interface ActiveRestRow {
  v: 1
  sessionId: string
  exerciseId: string | null
  exerciseName: string
  total: number
  endsAt: number
  paused: boolean
  remaining: number
}

/** `meta.activeExerciseIndex`. */
interface ActiveExerciseIndexRow {
  v: 1
  sessionId: string
  index: number
  sessionExerciseId: string | null
}

function warnMeta(err: unknown): void {
  log('workout', `could not store workout screen state: ${String(err)}`, 'warn')
}

/** Se escribe al cambiar el descanso (empezar, ajustar, pausar, reanudar, reiniciar), nunca en cada segundo. */
function persistRest(rest: RestState | null): void {
  const myEpoch = epoch
  const isCurrent = () => myEpoch === epoch
  const session = useWorkout.getState().session
  if (!rest || !session) {
    void deleteMeta([ACTIVE_REST_KEY], isCurrent).catch(warnMeta)
    return
  }
  const row: ActiveRestRow = {
    v: 1,
    sessionId: session.id,
    exerciseId: rest.exerciseId,
    exerciseName: rest.exerciseName,
    total: rest.total,
    endsAt: rest.endsAt,
    paused: rest.paused,
    remaining: rest.remaining,
  }
  void setMetaQuiet(ACTIVE_REST_KEY, row, isCurrent).catch(warnMeta)
}

function persistIndex(): void {
  const myEpoch = epoch
  const { session, currentIndex } = useWorkout.getState()
  if (!session) return
  const row: ActiveExerciseIndexRow = {
    v: 1,
    sessionId: session.id,
    index: currentIndex,
    sessionExerciseId: session.exercises[currentIndex]?.id ?? null,
  }
  void setMetaQuiet(ACTIVE_EXERCISE_INDEX_KEY, row, () => myEpoch === epoch).catch(warnMeta)
}

/** Al empezar, terminar o descartar: el descanso y el ejercicio guardados ya no son de nadie. */
function dropScreenState(): void {
  const myEpoch = epoch
  void deleteMeta([ACTIVE_REST_KEY, ACTIVE_EXERCISE_INDEX_KEY], () => myEpoch === epoch).catch(warnMeta)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * El descanso guardado, si es de esta sesión y sigue vivo. Uno que corría y
 * cuya hora ya pasó (la app estuvo cerrada) se descarta sin sonar: el aviso
 * del sistema ya avisó, o ya no tiene sentido hacerlo.
 */
export function restoreRest(row: unknown, sessionId: string, now = Date.now()): RestState | null {
  if (!isRecord(row) || row.v !== 1 || row.sessionId !== sessionId) return null
  const { total, endsAt, paused, remaining, exerciseName, exerciseId } = row
  if (!finite(total) || !finite(endsAt) || !finite(remaining) || typeof paused !== 'boolean') return null
  if (!paused && endsAt <= now) return null
  return {
    total,
    endsAt,
    paused,
    remaining,
    exerciseName: typeof exerciseName === 'string' ? exerciseName : '',
    exerciseId: typeof exerciseId === 'string' ? exerciseId : null,
  }
}

/**
 * El ejercicio que se estaba viendo. Se busca por el id del ejercicio dentro
 * de la sesión, que sobrevive a reordenar; si ya no está, la posición
 * guardada, recortada a lo que hay.
 */
export function restoreIndex(row: unknown, session: WorkoutSession): number {
  if (!isRecord(row) || row.v !== 1 || row.sessionId !== session.id) return 0
  if (typeof row.sessionExerciseId === 'string') {
    const found = session.exercises.findIndex((e) => e.id === row.sessionExerciseId)
    if (found >= 0) return found
  }
  const last = Math.max(0, session.exercises.length - 1)
  const index = finite(row.index) ? Math.trunc(row.index) : 0
  return Math.min(Math.max(0, index), last)
}

/* ------------------------------------------------------------------ store */

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

/** Sonido y vibración de terminar. Envueltos: nada de esto puede impedir que se guarde. */
function finishCue(): void {
  try {
    sound('finish')
    haptic('success')
  } catch (err) {
    log('workout', `finish cue failed: ${String(err)}`, 'warn')
  }
}

export const useWorkout = create<WorkoutState>((set, get) => {
  /**
   * Lo que se hace cuando una acción descubre, tras un `await`, que el estado
   * cambió por otro lado: no pisarlo, sólo dejar constancia de que ya se leyó.
   */
  const markLoaded = () => {
    if (!get().loaded) set({ loaded: true })
  }

  /** Si `discard`/`finish` fallan, la sesión sigue en curso: se vuelve a guardar lo que hay en memoria. */
  const reopenAfterFailure = (myEpoch: number) => {
    closingSessionId = null
    const current = get().session
    if (current && myEpoch === epoch) scheduleSave(current, true)
  }

  return {
    session: null,
    loaded: false,
    saving: false,
    currentIndex: 0,
    previous: {},
    insights: {},
    rest: null,
    restRemaining: 0,
    celebration: null,
    finishResult: null,

    /**
     * Lee el entrenamiento guardado. Idempotente: si la sesión que hay en
     * memoria es la misma que la guardada, se queda la de memoria (puede
     * llevar cambios aún sin escribir), con su descanso y su ejercicio. Si
     * otra acción cambia la sesión mientras se lee, gana esa acción.
     */
    async load() {
      const myEpoch = epoch
      const before = get().session
      const stale = () => myEpoch !== epoch || get().session !== before

      const session = await getActiveSession()
      if (myEpoch !== epoch) return
      if (stale()) return markLoaded()
      if (!session) {
        clearRestTimers()
        set({
          session: null,
          loaded: true,
          previous: {},
          insights: {},
          rest: null,
          restRemaining: 0,
          currentIndex: 0,
        })
        return
      }
      if (before && before.id === session.id) return markLoaded()

      const { previous, insights } = await loadContext(session)
      if (myEpoch !== epoch) return
      if (stale()) return markLoaded()

      const [restRow, indexRow] = await Promise.all([
        getMeta<unknown>(ACTIVE_REST_KEY, null),
        getMeta<unknown>(ACTIVE_EXERCISE_INDEX_KEY, null),
      ])
      if (myEpoch !== epoch) return
      if (stale()) return markLoaded()

      const now = Date.now()
      const rest = restoreRest(restRow, session.id, now)
      // Un descanso de otra sesión, o uno que venció con la app cerrada: fuera, sin sonar.
      if (!rest && restRow !== null) void deleteMeta([ACTIVE_REST_KEY], () => myEpoch === epoch).catch(warnMeta)
      clearRestTimers()
      set({
        session,
        previous,
        insights,
        loaded: true,
        currentIndex: restoreIndex(indexRow, session),
        rest,
        restRemaining: rest ? (rest.paused ? rest.remaining : secondsLeft(rest, now)) : 0,
      })
      armRestClock()
    },

    async reset(opts = {}) {
      if (opts.flush) {
        try {
          await flushPendingSave()
        } catch (err) {
          log('workout', `flush before reset failed: ${String(err)}`, 'warn')
        }
      }
      // Lo que llegara a programarse mientras se guardaba lo de arriba (sólo
      // con `flush`: el dueño no cambia y esos datos siguen siendo suyos).
      const leftover = opts.flush ? pendingSave : null
      epoch++
      cancelPendingSave()
      closingSessionId = null
      clearRestTimers()
      set({
        session: null,
        rest: null,
        restRemaining: 0,
        currentIndex: 0,
        previous: {},
        insights: {},
        celebration: null,
        finishResult: null,
        loaded: true,
      })
      if (leftover) {
        await persistSession(leftover).catch((err: unknown) =>
          log('workout', `autosave failed: ${String(err)}`, 'error'),
        )
      }
    },

    flushSave() {
      return flushPendingSave()
    },

    async begin(routine, day, freeName) {
      const myEpoch = epoch
      const session = await startSession({ routine, day, freeName })
      if (myEpoch !== epoch) return
      const { previous, insights } = await loadContext(session)
      if (myEpoch !== epoch) return
      const settings = useApp.getState().settings
      if (settings.autofillPreviousSets) {
        applyAutofill(session, previous)
        scheduleSave(session, true)
      }
      closingSessionId = null
      clearRestTimers()
      set({
        session,
        previous,
        insights,
        loaded: true,
        currentIndex: 0,
        rest: null,
        restRemaining: 0,
        finishResult: null,
      })
      dropScreenState()
    },

    async discard() {
      const s = get().session
      const myEpoch = epoch
      cancelPendingSave()
      if (s) {
        closingSessionId = s.id
        await settleWrites()
        try {
          await discardSession(s.id)
        } catch (err) {
          reopenAfterFailure(myEpoch)
          throw err
        }
      }
      if (myEpoch !== epoch) return
      clearRestTimers()
      set({ session: null, previous: {}, insights: {}, rest: null, restRemaining: 0, currentIndex: 0 })
      dropScreenState()
    },

    async finish() {
      const s = get().session
      if (!s) return null
      const myEpoch = epoch
      cancelPendingSave()
      closingSessionId = s.id
      await settleWrites()
      if (myEpoch !== epoch) return null
      // Lo último que hay en memoria, por si algo cambió mientras se esperaba.
      const latest = get().session
      const toFinish = latest && latest.id === s.id ? latest : s
      let result: FinishResult
      try {
        result = await finishSession(toFinish)
      } catch (err) {
        reopenAfterFailure(myEpoch)
        throw err
      }
      if (myEpoch !== epoch) return null
      clearRestTimers()
      set({
        session: null,
        previous: {},
        insights: {},
        rest: null,
        restRemaining: 0,
        currentIndex: 0,
        finishResult: result,
      })
      dropScreenState()
      finishCue()
      return result
    },

    clearFinish() {
      set({ finishResult: null })
    },

    setCurrentIndex(i) {
      set({ currentIndex: i })
      persistIndex()
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
      const myEpoch = epoch
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
        // Vaciado o terminado mientras se comprobaba: ni récord ni descanso.
        if (myEpoch !== epoch || get().session?.id !== next.id) return
        if (pr) {
          haptic('pr')
          sound('pr')
          set({ celebration: { kind: 'pr', pr } })
        }
      } catch (err) {
        log('workout', `PR check failed: ${String(err)}`, 'warn')
      }
      if (myEpoch !== epoch || get().session?.id !== next.id) return

      // Auto rest.
      const settings = useApp.getState().settings
      if (settings.restAutoStart && target.type !== 'warmup') {
        get().startRest(ex.restSeconds || settings.defaultRestSeconds, ex.name, ex.exerciseId)
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
      const myEpoch = epoch
      const settings = useApp.getState().settings
      const se: SessionExercise = {
        id: newId(),
        exerciseId: exercise.id,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        order: s.exercises.length,
        targetSets: exercise.defaultSets,
        repMin: exercise.repMin,
        repMax: exercise.repMax,
        rirTarget: exercise.rirTarget,
        rpeTarget: exercise.rpeTarget,
        restSeconds: exercise.restSeconds || settings.defaultRestSeconds,
        sets: Array.from({ length: Math.max(1, exercise.defaultSets) }, () => makeSet('working')),
        sessionNote: '',
      }
      const [last, logs] = await Promise.all([
        lastLogForExercise(exercise.id, s.startedAt),
        logsForExercise(exercise.id),
      ])
      if (myEpoch !== epoch) return
      // Se añade sobre la sesión de AHORA, no sobre la de antes del `await`:
      // una serie marcada mientras se leía el historial no se pierde.
      const current = get().session
      if (!current || current.id !== s.id) return
      if (current.exercises.some((e) => e.exerciseId === exercise.id)) return
      if (settings.autofillPreviousSets && last) {
        se.sets.forEach((st, i) => {
          const prev = last.sets[i] ?? last.sets[last.sets.length - 1]
          if (prev) {
            st.weight = prev.weight
            st.reps = prev.reps
          }
        })
      }
      const next = structuredCloneSession(current)
      next.exercises.push({ ...se, order: next.exercises.length })
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
      persistIndex()
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
      persistIndex()
    },

    /* ---------------------------------------------------------- rest timer */

    startRest(seconds, exerciseName, exerciseId = null) {
      const rest: RestState = {
        total: seconds,
        endsAt: Date.now() + seconds * 1000,
        paused: false,
        remaining: seconds,
        exerciseName,
        exerciseId,
      }
      set({ rest, restRemaining: seconds })
      persistRest(rest)
      armRestClock()
    },

    adjustRest(delta) {
      const rest = get().rest
      if (!rest) return
      if (rest.paused) {
        const next: RestState = {
          ...rest,
          remaining: Math.max(0, rest.remaining + delta),
          total: Math.max(1, rest.total + delta),
        }
        set({ rest: next, restRemaining: next.remaining })
        persistRest(next)
        return
      }
      const next: RestState = {
        ...rest,
        endsAt: rest.endsAt + delta * 1000,
        total: Math.max(1, rest.total + delta),
      }
      set({ rest: next, restRemaining: secondsLeft(next) })
      persistRest(next)
      // Restar más de lo que quedaba lo termina: con las reglas del final
      // natural (suena sólo si la nueva hora es de hace ≤ 1,5 s y se ve la app).
      armRestClock()
    },

    toggleRestPause() {
      const rest = get().rest
      if (!rest) return
      if (rest.paused) {
        const next: RestState = { ...rest, paused: false, endsAt: Date.now() + rest.remaining * 1000 }
        set({ rest: next, restRemaining: rest.remaining })
        persistRest(next)
        armRestClock()
        return
      }
      if (rest.endsAt <= Date.now()) {
        // Ya había llegado su hora: no se pausa un descanso terminado.
        endRestNaturally()
        return
      }
      const remaining = secondsLeft(rest)
      const next: RestState = { ...rest, paused: true, remaining }
      clearRestTimers()
      set({ rest: next, restRemaining: remaining })
      persistRest(next)
    },

    restartRest() {
      const rest = get().rest
      if (!rest) return
      const next: RestState = { ...rest, endsAt: Date.now() + rest.total * 1000, paused: false, remaining: rest.total }
      set({ rest: next, restRemaining: rest.total })
      persistRest(next)
      armRestClock()
    },

    stopRest() {
      clearRestTimers()
      set({ rest: null, restRemaining: 0 })
      persistRest(null)
    },

    tickRest() {
      const rest = get().rest
      if (!rest || rest.paused) return
      if (rest.endsAt <= Date.now()) {
        endRestNaturally()
        return
      }
      const remaining = secondsLeft(rest)
      if (remaining !== get().restRemaining) set({ restRemaining: remaining })
    },

    dismissCelebration() {
      set({ celebration: null })
    },
  }
})

function structuredCloneSession(s: WorkoutSession): WorkoutSession {
  return {
    ...s,
    exercises: s.exercises.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x })) })),
  }
}

export function notifySessions() {
  notify('sessions')
}
