import 'fake-indexeddb/auto'
/*
 * Ciclo de vida del entrenamiento, de la cuenta y de la sincronización.
 *
 * Mismo arnés que tests/unit.ts: se empaqueta con esbuild y corre en node,
 * contra una IndexedDB de verdad (fake-indexeddb), así que lo que se prueba es
 * la función que llama la app, no una copia de su lógica. Firebase no está
 * configurado aquí: donde un flujo lo necesita, se le inyecta lo de fuera
 * (`setAuthDeps`, `SyncOptions.backend`).
 *
 *   npx esbuild tests/unit-lifecycle.ts --bundle --platform=node --format=esm \
 *     --define:import.meta.env={} --outfile=node_modules/.cache/unit-lifecycle.mjs \
 *     --log-level=error && node node_modules/.cache/unit-lifecycle.mjs
 */
import { getDB, getMeta, invalidateSettingsCache, readSettings, setMeta } from '../src/lib/db/database'
import { defaultSettings, type SessionExercise, type WorkoutSession } from '../src/lib/db/schema'
import { pickLanguage } from '../src/lib/i18n/pickLanguage'
import {
  ACTIVE_EXERCISE_INDEX_KEY,
  ACTIVE_REST_KEY,
  ACTIVE_SESSION_KEY,
  makeSet,
  persistSession,
  startSession,
} from '../src/lib/db/repo.sessions'
import { flushOnHide, setRestEndCue, shouldCueRestEnd, useWorkout } from '../src/store/useWorkout'
import {
  checkLocalOwnership,
  resetLocalData,
  setBeforeLocalReset,
  syncCycle,
  syncRunning,
  type PushBackend,
} from '../src/lib/sync/engine'
import { clearEntries, enqueue, pendingIds, putPulled, putSynced, takeBatch, ticketOf } from '../src/lib/sync/queue'
import { BACKUP_FORMAT, importBackup, importErrorKey } from '../src/lib/backup'
import { setAuthDeps, useAuth } from '../src/store/useAuth'
import { authErrorKey } from '../src/lib/firebase/account'

let pass = 0
let fail = 0
const results: string[] = []

function eq(actual: unknown, expected: unknown, name: string) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) {
    pass++
    results.push(`PASS  ${name}`)
  } else {
    fail++
    results.push(`FAIL  ${name}\n        expected ${b}\n        actual   ${a}`)
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** `p`, o 'timeout' si tarda más de `ms`. El temporizador se limpia: no retiene el proceso. */
async function within<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const guard = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms)
  })
  try {
    return await Promise.race([p, guard])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Espera a que aterricen las escrituras lanzadas sin esperar (`setMetaQuiet`,
 * autoguardados): las transacciones de lectura y escritura sobre un mismo
 * almacén se ejecutan en orden, así que una vacía detrás confirma las de antes.
 */
async function settle() {
  await sleep(15)
  const db = await getDB()
  const tx = db.transaction(['meta', 'sessions', 'syncQueue'], 'readwrite')
  await tx.done
}

/** Lo que la app conecta en main.tsx (sin el plugin nativo, que aquí no existe). */
setBeforeLocalReset(() => {
  void useWorkout.getState().reset()
})

/** Los idiomas que dice tener el dispositivo, para `readSettings`. */
function setDeviceLanguages(languages: string[]) {
  Object.defineProperty(globalThis.navigator, 'languages', { value: languages, configurable: true })
  Object.defineProperty(globalThis.navigator, 'language', { value: languages[0] ?? '', configurable: true })
}

/** La visibilidad de la página, para el fin del descanso. En node no hay `document`. */
function setVisibility(state: 'visible' | 'hidden' | null) {
  const g = globalThis as { document?: { visibilityState: string } }
  if (state === null) delete g.document
  else g.document = { visibilityState: state }
}

function sessionExercise(id: string, exerciseId: string, order: number): SessionExercise {
  return {
    id,
    exerciseId,
    name: exerciseId,
    muscleGroup: 'chest',
    order,
    targetSets: 1,
    repMin: 6,
    repMax: 10,
    rirTarget: null,
    rpeTarget: null,
    restSeconds: 90,
    sets: [makeSet('working')],
    sessionNote: '',
  }
}

function activeSession(id: string, exercises: SessionExercise[]): WorkoutSession {
  const now = Date.now()
  return {
    id,
    routineId: null,
    routineName: '',
    dayId: null,
    dayName: 'Prueba',
    status: 'active',
    startedAt: now,
    endedAt: null,
    durationSec: 0,
    pausedMs: 0,
    pausedAt: null,
    notes: '',
    exercises,
    demo: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

/** Un dispositivo vacío y sin dueño, y nada en memoria. */
async function cleanDevice() {
  await resetLocalData(null)
  await useWorkout.getState().reset()
  await settle()
}

/** Como reabrir la app: se va lo de memoria (sin cambiar de dueño) y se vuelve a leer. */
async function reopen() {
  await useWorkout.getState().reset()
  await useWorkout.getState().load()
}

/** Un servidor falso para `push`: cuenta los envíos y deja intervenir en el `commit`. */
function fakeBackend(onCommit: () => Promise<void>): PushBackend & { commits: number; writes: string[] } {
  const backend = {
    commits: 0,
    writes: [] as string[],
    batch() {
      const paths: string[] = []
      return {
        set: (path: string) => {
          paths.push(path)
        },
        delete: (path: string) => {
          paths.push(`-${path}`)
        },
        commit: async () => {
          backend.commits++
          backend.writes.push(...paths)
          await onCommit()
        },
      }
    },
    serverTimestamp: () => 0,
  }
  return backend
}

// `push` sólo sube con conexión; node no tiene `navigator.onLine`.
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true })

/* ------------------------------------------------------- idioma de inicio */
{
  eq(pickLanguage(['es-MX']), 'es', 'idioma: es-MX → español')
  eq(pickLanguage(['es']), 'es', 'idioma: es → español')
  eq(pickLanguage(['ca-ES', 'es-ES']), 'en', 'idioma: sólo cuenta el primero (catalán, luego español) → inglés')
  eq(pickLanguage([]), 'en', 'idioma: sin idiomas → inglés')
  eq(pickLanguage(['en-US']), 'en', 'idioma: en-US → inglés')
  eq(pickLanguage(['ES-es']), 'es', 'idioma: sin distinguir mayúsculas')
  eq(pickLanguage(['est']), 'en', 'idioma: «est» (estonio) no es español')

  const db = await getDB()
  setDeviceLanguages(['es-MX', 'en-US'])
  await db.delete('settings', 'app')
  invalidateSettingsCache()
  eq((await readSettings()).language, 'es', 'ajustes: la primera vez, el idioma del dispositivo (es-MX → es)')

  setDeviceLanguages(['en-US'])
  await db.delete('settings', 'app')
  invalidateSettingsCache()
  eq((await readSettings()).language, 'en', 'ajustes: la primera vez, el idioma del dispositivo (en-US → en)')

  // Una instalación que ya tiene ajustes conserva su idioma, diga lo que diga el sistema.
  await db.put('settings', { ...defaultSettings(), language: 'es' })
  invalidateSettingsCache()
  eq((await readSettings()).language, 'es', 'ajustes: con una fila guardada, se queda su idioma (no el del dispositivo)')
  eq(defaultSettings().language, 'es', 'ajustes: defaultSettings() sigue diciendo español')
}

/* ------------------------- reset con un guardado pendiente + pagehide */
{
  await cleanDevice()
  await useWorkout.getState().begin(null, null, 'Pendiente')
  // Un cambio con guardado diferido (250 ms) aún sin escribir…
  useWorkout.getState().setSessionNote('nota que no debe aterrizar')
  // …y el dispositivo cambia de dueño: `resetLocalData` llama primero al
  // gancho (useWorkout.reset) y después vacía la copia local.
  await resetLocalData(null)
  // La app se oculta justo después.
  flushOnHide()
  await sleep(400)
  await settle()
  const db = await getDB()
  eq(await db.count('sessions'), 0, 'reset: el guardado pendiente no aterriza después del vaciado')
  eq(await db.count('syncQueue'), 0, 'reset: ni deja nada en el buzón')
  eq(useWorkout.getState().session, null, 'reset: no queda sesión en memoria')
  eq(await checkLocalOwnership('B'), 'fresh', 'reset: otra cuenta encuentra el dispositivo limpio')
}

/* ------------------------------------------------- load() contra reset */
{
  await cleanDevice()
  await useWorkout.getState().begin(null, null, 'Carrera')
  const id = useWorkout.getState().session?.id ?? ''
  await useWorkout.getState().reset()

  const loading = useWorkout.getState().load()
  void useWorkout.getState().reset()
  await loading
  eq(useWorkout.getState().session, null, 'load: si se vacía mientras lee, no resucita la sesión')
  eq(useWorkout.getState().loaded, true, 'load: y queda como leído')

  await useWorkout.getState().load()
  eq(useWorkout.getState().session?.id ?? null, id, 'load: sin vaciado de por medio, recupera la sesión guardada')

  // Idempotente: con la misma sesión en memoria, un segundo load no la pisa.
  useWorkout.getState().setSessionNote('sin guardar aún')
  await useWorkout.getState().load()
  eq(useWorkout.getState().session?.notes, 'sin guardar aún', 'load: dos veces no pisa cambios aún sin escribir')
  await useWorkout.getState().flushSave()
}

/* ----------------------------------------------- descanso guardado en meta */
{
  await cleanDevice()
  const s = activeSession('ses-rest', [sessionExercise('se-1', 'press', 0)])
  await persistSession(s)
  await setMeta(ACTIVE_SESSION_KEY, s.id)
  await useWorkout.getState().load()

  useWorkout.getState().startRest(90, 'Press', 'press')
  const endsAt = useWorkout.getState().rest?.endsAt ?? 0
  await settle()
  await reopen()
  const back = useWorkout.getState().rest
  eq(
    back && { endsAt: back.endsAt, paused: back.paused, exerciseId: back.exerciseId, exerciseName: back.exerciseName },
    { endsAt, paused: false, exerciseId: 'press', exerciseName: 'Press' },
    'descanso: al reabrir, la misma sesión recupera su descanso (misma hora de fin)',
  )

  useWorkout.getState().toggleRestPause()
  const pausedLeft = useWorkout.getState().rest?.remaining ?? -1
  await settle()
  await reopen()
  eq(
    { paused: useWorkout.getState().rest?.paused, remaining: useWorkout.getState().rest?.remaining },
    { paused: true, remaining: pausedLeft },
    'descanso: uno en pausa vuelve en pausa, con lo que quedaba',
  )

  await setMeta(ACTIVE_REST_KEY, {
    v: 1,
    sessionId: 'otra-sesion',
    exerciseId: 'press',
    exerciseName: 'Press',
    total: 90,
    endsAt: Date.now() + 60_000,
    paused: false,
    remaining: 90,
  })
  await reopen()
  eq(useWorkout.getState().rest, null, 'descanso: el de otra sesión se ignora')

  let cues = 0
  setRestEndCue(() => {
    cues++
  })
  setVisibility('visible')
  await setMeta(ACTIVE_REST_KEY, {
    v: 1,
    sessionId: s.id,
    exerciseId: 'press',
    exerciseName: 'Press',
    total: 90,
    endsAt: Date.now() - 5_000,
    paused: false,
    remaining: 90,
  })
  await reopen()
  await settle()
  eq(useWorkout.getState().rest, null, 'descanso: uno que venció con la app cerrada se descarta')
  eq(cues, 0, 'descanso: y se descarta sin sonar ni vibrar')
  eq(await getMeta(ACTIVE_REST_KEY, 'borrado'), 'borrado', 'descanso: y se borra de meta')

  // Fin natural con la app a la vista: suena una vez, a su hora.
  useWorkout.getState().startRest(0.12, 'Press', 'press')
  await sleep(350)
  eq(useWorkout.getState().rest, null, 'descanso: termina solo, sin ninguna pantalla montada')
  eq(cues, 1, 'descanso: a su hora y a la vista, suena una vez')

  // Restar más de lo que queda (fin hace más de 1,5 s): termina en silencio.
  useWorkout.getState().startRest(60, 'Press', 'press')
  useWorkout.getState().adjustRest(-62)
  eq(useWorkout.getState().rest, null, 'descanso: restar de más lo termina')
  eq(cues, 1, 'descanso: y como su hora pasó hace > 1,5 s, sin sonar')

  // Con la app oculta, el final llega en silencio (lo avisa el sistema).
  setVisibility('hidden')
  useWorkout.getState().startRest(0.08, 'Press', 'press')
  await sleep(300)
  eq(useWorkout.getState().rest, null, 'descanso: oculta, también termina')
  eq(cues, 1, 'descanso: oculta, sin sonido de la app')
  setVisibility(null)
  setRestEndCue(null)

  eq(shouldCueRestEnd(1000, 1000, true), true, 'aviso: justo a su hora y a la vista, sí')
  eq(shouldCueRestEnd(1000, 2500, true), true, 'aviso: 1,5 s tarde, todavía sí')
  eq(shouldCueRestEnd(1000, 2600, true), false, 'aviso: más de 1,5 s tarde, no')
  eq(shouldCueRestEnd(1000, 1000, false), false, 'aviso: con la app oculta, no')
}

/* ----------------------------------------------- ejercicio actual en meta */
{
  await cleanDevice()
  const a = sessionExercise('se-a', 'remo', 0)
  const b = sessionExercise('se-b', 'press', 1)
  const c = sessionExercise('se-c', 'sentadilla', 2)
  const s = activeSession('ses-index', [a, b, c])
  await persistSession(s)
  await setMeta(ACTIVE_SESSION_KEY, s.id)
  await useWorkout.getState().load()

  useWorkout.getState().setCurrentIndex(2)
  await settle()
  await reopen()
  eq(useWorkout.getState().currentIndex, 2, 'ejercicio: al reabrir, el mismo ejercicio')

  // Reordenado en otro sitio: se encuentra por su id, no por la posición.
  await persistSession({ ...s, exercises: [c, a, b].map((e, i) => ({ ...e, order: i })) })
  await reopen()
  eq(useWorkout.getState().currentIndex, 0, 'ejercicio: reordenado, se encuentra por su id dentro de la sesión')

  await setMeta(ACTIVE_EXERCISE_INDEX_KEY, { v: 1, sessionId: s.id, index: 9, sessionExerciseId: 'ya-no-esta' })
  await reopen()
  eq(useWorkout.getState().currentIndex, 2, 'ejercicio: si ya no está, la posición guardada recortada al último')

  await setMeta(ACTIVE_EXERCISE_INDEX_KEY, { v: 1, sessionId: 'otra', index: 1, sessionExerciseId: 'se-a' })
  await reopen()
  eq(useWorkout.getState().currentIndex, 0, 'ejercicio: el de otra sesión se ignora')

  // Cambio de dueño: fuera el puntero, el descanso y el ejercicio.
  useWorkout.getState().startRest(90, 'Remo', 'remo')
  useWorkout.getState().setCurrentIndex(1)
  await settle()
  await resetLocalData('otra-cuenta')
  await settle()
  eq(
    [
      await getMeta(ACTIVE_SESSION_KEY, 'no'),
      await getMeta(ACTIVE_REST_KEY, 'no'),
      await getMeta(ACTIVE_EXERCISE_INDEX_KEY, 'no'),
    ],
    ['no', 'no', 'no'],
    'cambio de dueño: se borran el puntero, el descanso y el ejercicio',
  )
  eq(useWorkout.getState().rest, null, 'cambio de dueño: y el descanso en memoria')
}

/* ------------------------------------- buzón: borrar sólo lo que se subió */
{
  await cleanDevice()
  await enqueue('routines', 'r-seq', 'put')
  const tickets = (await takeBatch(10)).map(ticketOf)
  // Una edición del mismo documento mientras se subía la anterior.
  await enqueue('routines', 'r-seq', 'put')
  await clearEntries(tickets)
  eq((await pendingIds()).has('routines:r-seq'), true, 'buzón: una edición hecha durante la subida no se borra')
  await clearEntries((await takeBatch(10)).map(ticketOf))
  eq((await pendingIds()).has('routines:r-seq'), false, 'buzón: lo que sí subió, se borra')

  // Lo mismo a través del ciclo completo: la edición llega durante el `commit`.
  await putSynced('routines', { id: 'r-push', name: 'Rutina', updatedAt: 1 })
  const editing = fakeBackend(async () => {
    await enqueue('routines', 'r-push', 'put')
  })
  await syncCycle('u-seq', { backend: editing })
  eq(editing.commits, 1, 'buzón: se subió una vez')
  eq((await pendingIds()).has('routines:r-push'), true, 'buzón: y la edición de durante la subida espera a la siguiente')
  const quiet = fakeBackend(async () => undefined)
  await syncCycle('u-seq', { backend: quiet })
  eq((await pendingIds()).has('routines:r-push'), false, 'buzón: la siguiente subida la vacía')
}

/* ------------------------------ bajada: nunca encima de lo pendiente */
{
  // La bajada mira el buzón al empezar y espera a Firestore (segundos en el
  // iPhone). Si mientras tanto se guarda una versión más nueva — la serie, o
  // finalizar el entrenamiento — lo que llega del servidor es más viejo y no
  // puede pisarla: si la pisa, la subida pendiente lee esa versión vieja y
  // la sube, y el cambio se pierde en los dos sitios (ios-auth: un
  // entrenamiento finalizado volvía «en curso» y sin series).
  await cleanDevice()
  const pendingAtStart = await pendingIds()
  eq(pendingAtStart.has('sessions:s-race'), false, 'bajada: al empezar no había nada pendiente')
  // Durante la bajada: la persona finaliza (documento y buzón, juntos).
  await putSynced('sessions', { id: 's-race', status: 'completed', updatedAt: 3 })
  // Llega la copia del servidor, de antes de finalizar.
  eq(await putPulled('sessions', { id: 's-race', status: 'active', updatedAt: 2 }), false, 'bajada: no escribe encima de un documento pendiente')
  const db = await getDB()
  const local = (await db.get('sessions', 's-race')) as { status?: string } | undefined
  eq(local?.status, 'completed', 'bajada: la versión local, más nueva, se queda')
  eq((await pendingIds()).has('sessions:s-race'), true, 'bajada: y sigue en el buzón para subir')

  // Sin nada pendiente, lo del servidor sí entra (es otro dispositivo).
  eq(await putPulled('sessions', { id: 's-other', status: 'completed', updatedAt: 5 }), true, 'bajada: sin nada pendiente, escribe')
  const other = (await db.get('sessions', 's-other')) as { status?: string } | undefined
  eq(other?.status, 'completed', 'bajada: y queda lo del servidor')
}

/* ------------------------------------- documento y buzón, a la vez */
{
  await cleanDevice()
  await putSynced('bodyweight', { id: 'bw-1', date: '2026-10-14', weight: 80, createdAt: 1, updatedAt: 1 })
  const db = await getDB()
  const row = await db.get('syncQueue', 'bodyweight:bw-1')
  eq(
    { doc: (await db.get('bodyweight', 'bw-1'))?.id ?? null, queued: row?.op ?? null, seq: typeof row?.seq },
    { doc: 'bw-1', queued: 'put', seq: 'number' },
    'putSynced: el documento y su fila del buzón están los dos',
  )

  // Si el documento no se puede guardar, tampoco queda su fila: van juntos.
  let failed = false
  try {
    await putSynced('bodyweight', { id: 'bw-2', notCloneable: () => 0 })
  } catch {
    failed = true
  }
  eq(
    { failed, doc: (await db.get('bodyweight', 'bw-2')) ?? null, queued: (await db.get('syncQueue', 'bodyweight:bw-2')) ?? null },
    { failed: true, doc: null, queued: null },
    'putSynced: si el documento falla, no queda ni el documento ni su fila',
  )
}

/* ------------------------------------------ un commit que no contesta */
{
  await cleanDevice()
  await putSynced('routines', { id: 'r-hang', name: 'Colgada', updatedAt: 1 })
  const hung = fakeBackend(() => new Promise<void>(() => undefined))
  const outcome = await within(
    syncCycle('u-hang', { backend: hung, commitTimeoutMs: 60 }).then(() => 'done'),
    3_000,
  )
  eq(outcome, 'done', 'commit colgado: el ciclo termina igualmente')
  eq(syncRunning(), false, 'commit colgado: y deja libre el ciclo')
  const db = await getDB()
  const row = await db.get('syncQueue', 'routines:r-hang')
  eq({ attempts: row?.attempts, error: row?.lastError }, { attempts: 1, error: 'COMMIT_TIMEOUT' }, 'commit colgado: la fila se queda, marcada como fallida')

  const ok = fakeBackend(async () => undefined)
  // Acotado también: con el ciclo aún atascado, esto esperaría para siempre.
  await within(syncCycle('u-hang', { backend: ok }), 3_000)
  eq(ok.commits, 1, 'commit colgado: el siguiente ciclo sí corre')
  eq((await pendingIds()).has('routines:r-hang'), false, 'commit colgado: y la sube')
}

/* ------------------- una petición durante un ciclo trae otro ciclo detrás */
{
  // Finalizar el entrenamiento mientras un ciclo baja: ese ciclo ya leyó el
  // buzón y no lo sube. Antes, pedir otro devolvía el mismo ciclo y el cambio
  // esperaba al siguiente aviso (ios-auth: no subió hasta el arranque siguiente).
  await cleanDevice()
  await putSynced('routines', { id: 'r-first', name: 'Primera', updatedAt: 1 })
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const slow = fakeBackend(async () => {
    if (slow.commits === 1) await gate
  })
  const first = syncCycle('u-follow', { backend: slow })
  // Que el primer ciclo llegue al `commit` antes de guardar lo nuevo.
  await within(new Promise<void>((resolve) => {
    const poll = () => (slow.commits === 1 ? resolve() : setTimeout(poll, 5))
    poll()
  }), 3_000)
  await putSynced('routines', { id: 'r-later', name: 'Después', updatedAt: 2 })
  const second = syncCycle('u-follow', { backend: slow })
  const third = syncCycle('u-follow', { backend: slow })
  eq(second === third, true, 'ciclo de más: las peticiones de mientras tanto se juntan en uno')
  release()
  await within(Promise.all([first, second]), 3_000)
  eq(slow.commits, 2, 'ciclo de más: al acabar el primero, se hace otro')
  eq(slow.writes.some((path) => path.endsWith('/r-later')), true, 'ciclo de más: y sube lo guardado durante el primero')
  eq((await pendingIds()).size, 0, 'ciclo de más: el buzón queda vacío')
  eq(syncRunning(), false, 'ciclo de más: y no queda ninguno en marcha')
}

/* ------------------------------------------------ eliminar la cuenta */
{
  await cleanDevice()
  await useWorkout.getState().begin(null, null, 'En curso')
  const calls: string[] = []
  const wrongPassword = Object.assign(new Error('wrong password'), { code: 'auth/wrong-password' })
  let passwordOk = false
  setAuthDeps({
    reauthenticate: async () => {
      calls.push('reauthenticate')
      if (!passwordOk) throw wrongPassword
    },
    beforeLocalReset: () => {
      calls.push('reset+stop')
    },
    stopSync: () => {
      calls.push('stopSync')
    },
    waitForSyncIdle: async () => undefined,
    wipeRemoteData: async () => {
      calls.push('wipeRemoteData')
      return 0
    },
    deleteAccountRecords: async () => {
      calls.push('deleteAccount')
    },
    resetLocalData: async () => {
      calls.push('resetLocalData')
    },
    startSync: async () => {
      calls.push('startSync')
    },
  })
  useAuth.setState({ user: { uid: 'u-del', email: 'a@example.test', displayName: '' }, phase: 'ready' })

  let key = ''
  try {
    await useAuth.getState().deleteAccount('mal')
  } catch (err) {
    key = authErrorKey(err)
  }
  eq(calls, ['reauthenticate'], 'eliminar: con la contraseña mal no se toca nada más (ni la nube)')
  eq(key, 'auth.error.badCredentials', 'eliminar: y el error es el de credenciales')
  eq(useWorkout.getState().session !== null, true, 'eliminar: el entrenamiento sigue en pantalla')

  calls.length = 0
  passwordOk = true
  await useAuth.getState().deleteAccount('bien')
  eq(
    calls,
    ['reauthenticate', 'reset+stop', 'stopSync', 'wipeRemoteData', 'deleteAccount', 'resetLocalData'],
    'eliminar: reautenticar → vaciar y parar → borrar en la nube → borrar la cuenta → vaciar la copia',
  )
  eq(useAuth.getState().phase, 'signed-out', 'eliminar: termina fuera de la sesión')

  // Falla el borrado en la nube: la cuenta sigue, así que todo vuelve a arrancar.
  calls.length = 0
  setAuthDeps({
    reauthenticate: async () => {
      calls.push('reauthenticate')
    },
    beforeLocalReset: () => {
      calls.push('reset+stop')
    },
    stopSync: () => {
      calls.push('stopSync')
    },
    waitForSyncIdle: async () => undefined,
    wipeRemoteData: async () => {
      calls.push('wipeRemoteData')
      throw new Error('network')
    },
    deleteAccountRecords: async () => {
      calls.push('deleteAccount')
    },
    resetLocalData: async () => {
      calls.push('resetLocalData')
    },
    startSync: async () => {
      calls.push('startSync')
    },
  })
  useAuth.setState({ user: { uid: 'u-del', email: 'a@example.test', displayName: '' }, phase: 'ready' })
  let threw = false
  try {
    await useAuth.getState().deleteAccount('bien')
  } catch {
    threw = true
  }
  eq(threw, true, 'eliminar: un fallo en la nube llega a la pantalla')
  eq(
    calls,
    ['reauthenticate', 'reset+stop', 'stopSync', 'wipeRemoteData', 'startSync'],
    'eliminar: y la sincronización vuelve a arrancar; ni se borra la cuenta ni la copia local',
  )
  setAuthDeps(null)
}

/* ------------------------------------------------------ cerrar sesión */
{
  await cleanDevice()
  const calls: string[] = []
  setAuthDeps({
    syncNow: async () => {
      calls.push('syncNow')
    },
    beforeLocalReset: () => {
      calls.push('reset+stop')
    },
    stopSync: () => {
      calls.push('stopSync')
    },
    waitForSyncIdle: async () => undefined,
    signOutUser: async () => {
      calls.push('signOut')
    },
    resetLocalData: async () => {
      calls.push('resetLocalData')
    },
  })
  useAuth.setState({ user: { uid: 'u-out', email: 'a@example.test', displayName: '' }, phase: 'ready' })
  await useAuth.getState().logout()
  eq(
    calls,
    ['syncNow', 'reset+stop', 'stopSync', 'signOut', 'resetLocalData'],
    'cerrar sesión: subir → vaciar y parar → cerrar → vaciar la copia',
  )
  eq(useAuth.getState().phase, 'signed-out', 'cerrar sesión: termina fuera')

  // Una subida que no contesta no retiene el cierre más de lo previsto.
  calls.length = 0
  setAuthDeps({
    syncNow: () => new Promise<void>(() => undefined),
    beforeLocalReset: () => {
      calls.push('reset+stop')
    },
    stopSync: () => undefined,
    waitForSyncIdle: async () => undefined,
    signOutUser: async () => {
      calls.push('signOut')
    },
    resetLocalData: async () => undefined,
  })
  useAuth.setState({ user: { uid: 'u-out', email: 'a@example.test', displayName: '' }, phase: 'ready' })
  const started = Date.now()
  const done = await within(useAuth.getState().logout().then(() => 'done'), 12_000)
  eq({ done, signedOut: calls.includes('signOut') }, { done: 'done', signedOut: true }, 'cerrar sesión: sin red, se cierra igualmente')
  eq(Date.now() - started < 9_500, true, 'cerrar sesión: esperando a la subida como mucho ~8 s')
  setAuthDeps(null)
}

/* --------------------------------------- restaurar «reemplazar» bloqueado */
{
  await cleanDevice()
  const s = await startSession({ routine: null, day: null, freeName: 'Activo' })
  let key = ''
  try {
    await importBackup({ format: BACKUP_FORMAT, version: 1, data: { routines: [] } }, 'replace')
  } catch (err) {
    key = importErrorKey(err)
  }
  eq(key, 'data.importBlockedActive', 'restaurar: «reemplazar» se niega con un entrenamiento en curso')
  const db = await getDB()
  eq((await db.get('sessions', s.id))?.status ?? null, 'active', 'restaurar: y el entrenamiento sigue ahí')
  const merged = await importBackup(
    { format: BACKUP_FORMAT, version: 1, data: { routines: [{ id: 'r-merge', name: 'Importada', updatedAt: 1 }] } },
    'merge',
  )
  eq(merged.imported, 1, 'restaurar: «combinar» sí se puede')
}

/* ------------------------------------- empezar limpio sin copia guardada */
{
  await cleanDevice()
  const calls: string[] = []
  setAuthDeps({
    exportJson: async () => ({ delivered: false }),
    resetLocalData: async () => {
      calls.push('resetLocalData')
    },
    startSync: async () => {
      calls.push('startSync')
    },
  })
  useAuth.setState({ user: { uid: 'u-sep', email: 'a@example.test', displayName: '' }, phase: 'migrating', busy: false })
  const went = await useAuth.getState().keepLocalSeparate()
  eq(
    { went, calls, phase: useAuth.getState().phase, busy: useAuth.getState().busy },
    { went: false, calls: [], phase: 'migrating', busy: false },
    'empezar limpio: si la copia no se entregó, no se borra nada y se queda en la pantalla',
  )

  setAuthDeps({
    exportJson: async () => {
      throw new Error('disk full')
    },
    resetLocalData: async () => {
      calls.push('resetLocalData')
    },
  })
  eq(await useAuth.getState().keepLocalSeparate(), false, 'empezar limpio: si exportar falla, tampoco')
  eq(calls, [], 'empezar limpio: y sigue sin borrarse nada')

  setAuthDeps({
    exportJson: async () => ({ delivered: true }),
    resetLocalData: async (uid) => {
      calls.push(`resetLocalData:${uid ?? 'null'}`)
    },
    startSync: async () => {
      calls.push('startSync')
    },
  })
  eq(await useAuth.getState().keepLocalSeparate(), true, 'empezar limpio: con la copia entregada, sigue adelante')
  eq(calls, ['resetLocalData:u-sep', 'startSync'], 'empezar limpio: y entonces sí vacía y restaura la cuenta')
  setAuthDeps(null)
}

/* ------------------------------------------------------------- limpieza */

await useWorkout.getState().reset()
setBeforeLocalReset(null)

console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
// Explícito: un temporizador de algo que se probó colgado no retiene el proceso.
process.exit(fail > 0 ? 1 : 0)
