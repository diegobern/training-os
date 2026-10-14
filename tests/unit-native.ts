/*
 * Pruebas de la capa nativa que no caben en tests/unit.ts.
 *
 * Dos cosas:
 *
 *   1. Las cuentas puras de `src/lib/native/workoutPresence.ts`: qué texto
 *      llega a la notificación / Live Activity en español y en inglés, la
 *      clave con la que se deduplica, cuándo se programa o se cancela el
 *      aviso de descanso y adónde lleva tocarlo.
 *   2. La mitad JavaScript del plugin `WorkoutNotification` contra un iOS
 *      falso — `webkit.messageHandlers.bridge`, sin `androidBridge` — con el
 *      @capacitor/core de verdad hablando con él.
 *
 * Va en su propio paquete porque @capacitor/core se queda con el primer
 * global `Capacitor` que ve: en tests/unit.ts ese es el de Android, y en un
 * mismo paquete no puede haber dos plataformas.
 *
 *   npx esbuild tests/unit-native.ts --bundle --platform=node --format=esm \
 *     --define:import.meta.env={} --outfile=node_modules/.cache/unit-native.mjs \
 *     --log-level=error && node node_modules/.cache/unit-native.mjs
 */
import type { SessionExercise, SetEntry, WorkoutSession } from '../src/lib/db/schema'

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

function ok(cond: boolean, name: string, detail?: string) {
  if (cond) {
    pass++
    results.push(`PASS  ${name}`)
  } else {
    fail++
    results.push(`FAIL  ${name}${detail ? `\n        ${detail}` : ''}`)
  }
}

/* ------------------------------------------------------- el iOS falso */
/*
 * ANTES de que nada importe @capacitor/core: lo lee una vez, al cargarse.
 * Es la superficie que inyecta el WKWebView de Capacitor: el manejador
 * `bridge` de WebKit y un `Capacitor` con `PluginHeaders`, `nativePromise` y
 * `nativeCallback`.
 */
type Call = { method: string; options: Record<string, unknown> }
const g = globalThis as unknown as Record<string, unknown>
const store = new Map<string, string>()
g.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}

const calls: Call[] = []
const appCalls: Call[] = []
const scenario = {
  permission: 'denied',
  afterRequest: 'granted',
  hang: new Set<string>(),
  holdRequest: false,
  release: null as null | (() => void),
}
let tap: ((data: unknown) => void) | null = null
let appState: ((data: unknown) => void) | null = null

g.webkit = { messageHandlers: { bridge: { postMessage: () => {} } } }
g.Capacitor = {
  isNativePlatform: () => true,
  getPlatform: () => 'ios',
  Plugins: {},
  PluginHeaders: [
    {
      name: 'WorkoutNotification',
      methods: [
        { name: 'start', rtype: 'promise' },
        { name: 'stop', rtype: 'promise' },
        { name: 'scheduleRestAlert', rtype: 'promise' },
        { name: 'cancelRestAlert', rtype: 'promise' },
        { name: 'haptic', rtype: 'promise' },
        { name: 'isSupported', rtype: 'promise' },
        { name: 'checkPermissions', rtype: 'promise' },
        { name: 'requestPermissions', rtype: 'promise' },
        { name: 'requestExactAlarm', rtype: 'promise' },
        { name: 'addListener', rtype: 'callback' },
        { name: 'removeListener', rtype: 'promise' },
      ],
    },
    {
      name: 'App',
      methods: [
        { name: 'addListener', rtype: 'callback' },
        { name: 'removeListener', rtype: 'promise' },
      ],
    },
  ],
  nativePromise: (plugin: string, method: string, options: Record<string, unknown> = {}) => {
    if (plugin !== 'WorkoutNotification') {
      appCalls.push({ method, options })
      return Promise.resolve({})
    }
    calls.push({ method, options })
    // Un método que no contesta nunca: lo que pasa en iOS si falta en `pluginMethods`.
    if (scenario.hang.has(method)) return new Promise(() => {})
    if (method === 'checkPermissions') return Promise.resolve({ display: scenario.permission })
    if (method === 'requestPermissions') {
      const answer = () => {
        scenario.permission = scenario.afterRequest
        return { display: scenario.permission }
      }
      if (!scenario.holdRequest) return Promise.resolve(answer())
      // La persona tiene el diálogo delante y no contesta todavía.
      return new Promise((resolve) => {
        scenario.release = () => resolve(answer())
      })
    }
    if (method === 'start') return Promise.resolve({ shown: true })
    if (method === 'scheduleRestAlert') return Promise.resolve({ scheduled: true, exact: true })
    if (method === 'cancelRestAlert') return Promise.resolve({ delivered: false })
    if (method === 'isSupported') return Promise.resolve({ presence: true, restAlerts: true, exactAlarms: true })
    if (method === 'requestExactAlarm') return Promise.resolve({ exactAlarms: true })
    return Promise.resolve({})
  },
  nativeCallback: (plugin: string, method: string, options: Record<string, unknown>, cb: (data: unknown) => void) => {
    if (plugin === 'App') {
      appCalls.push({ method, options })
      if (method === 'addListener' && options.eventName === 'appStateChange') appState = cb
      return 'app-cb'
    }
    calls.push({ method, options })
    if (method === 'addListener' && options.eventName === 'open') tap = cb
    return 'cb-1'
  },
}

const methods = () => calls.map((c) => c.method)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function waitFor(cond: () => boolean, ms = 3000): Promise<boolean> {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (cond()) return true
    await sleep(5)
  }
  return cond()
}

/* ----------------------------------------------------------- datos */

let sid = 0
const set = (p: Partial<SetEntry> = {}): SetEntry => ({
  id: `s${++sid}`,
  type: 'working',
  weight: 80,
  reps: 8,
  rir: null,
  rpe: null,
  completed: false,
  completedAt: null,
  note: '',
  ...p,
})
const exercise = (exerciseId: string, name: string, sets: SetEntry[]): SessionExercise => ({
  id: `se-${exerciseId}`,
  exerciseId,
  name,
  muscleGroup: 'chest',
  order: 0,
  targetSets: sets.length,
  repMin: 8,
  repMax: 12,
  rirTarget: null,
  rpeTarget: null,
  restSeconds: 90,
  sets,
  sessionNote: '',
})
const session = (exercises: SessionExercise[], patch: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id: 'sesion-1',
  routineId: 'r1',
  routineName: 'PPL',
  dayId: 'd1',
  dayName: 'Push',
  status: 'active',
  startedAt: 1_700_000_000_000,
  endedAt: null,
  durationSec: 0,
  pausedMs: 5_000,
  pausedAt: null,
  notes: '',
  exercises,
  demo: false,
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
  ...patch,
})

/** Todas las cadenas de un objeto, para buscar claves sin traducir o palabras del otro idioma. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}
const RAW_KEY = /^(live|workout|notif|native)\.[A-Za-z]+/
const SPANISH = /Serie|Descanso|Entrenamiento|Duración|pausa|series|hasta|Siguiente|Toca /
const ENGLISH = /\bSet\b|\bRest\b|Workout|Duration|Paused|\bsets\b|until|Next set|Tap /

/* ================================================= 1. cuentas puras */
{
  const P = await import('../src/lib/native/workoutPresence')
  const { makeT } = await import('../src/lib/i18n')
  const tEs = makeT('es')
  const tEn = makeT('en')
  const now = 1_700_000_100_000

  // El press de banca se añadió con la app en español; el catálogo lo da
  // traducido al idioma de ahora.
  const namesEs = new Map([['bench', { name: 'Press de banca', isCustom: false }]])
  const namesEn = new Map([['bench', { name: 'Bench press', isCustom: false }]])
  const push = session([
    exercise('bench', 'Press de banca', [
      set({ type: 'warmup', completed: true }),
      set({ completed: true }),
      set(),
      set(),
    ]),
    exercise('row', 'Remo', [set()]),
  ])
  const base = {
    session: push,
    rest: null,
    currentIndex: 0,
    excludeWarmups: true,
    now,
  }

  const es = P.buildWorkoutPresence({ ...base, exerciseNameById: namesEs, t: tEs, language: 'es', android: true })
  eq(
    es,
    {
      sessionId: 'sesion-1',
      startedAt: 1_700_000_005_000,
      title: 'Entrenamiento en curso',
      body: 'Press de banca · Serie 2 de 3',
      sessionName: 'Push',
      exerciseName: 'Press de banca',
      setLabel: 'Serie 2 de 3',
      progressLabel: '1 de 4 series',
      rest: null,
      labels: { rest: 'Descanso', restOver: 'Descanso terminado', elapsed: 'Duración', paused: 'En pausa' },
      locale: 'es-ES',
      channelName: 'Entrenamiento en curso',
      channelDescription:
        'Muestra en la pantalla de bloqueo el tiempo que llevas entrenando mientras dure el entrenamiento.',
    },
    'presencia (es): todo traducido, hora de inicio con la pausa, serie siguiente y canal de Android',
  )

  const en = P.buildWorkoutPresence({ ...base, exerciseNameById: namesEn, t: tEn, language: 'en', android: false })
  eq(
    en,
    {
      sessionId: 'sesion-1',
      startedAt: 1_700_000_005_000,
      title: 'Workout in progress',
      body: 'Bench press · Set 2 of 3',
      sessionName: 'Push',
      exerciseName: 'Bench press',
      setLabel: 'Set 2 of 3',
      progressLabel: '1 of 4 sets',
      rest: null,
      labels: { rest: 'Rest', restOver: 'Rest over', elapsed: 'Duration', paused: 'Paused' },
      locale: 'en-GB',
    },
    'presencia (en): todo en inglés, el ejercicio con su nombre traducido y sin campos de canal en iOS',
  )

  const free = session([], { dayId: null, dayName: 'Entrenamiento libre' })
  const freeEn = P.buildWorkoutPresence({ ...base, session: free, exerciseNameById: undefined, t: tEn, language: 'en', android: true })
  eq(
    [freeEn.body, freeEn.sessionName, freeEn.exerciseName, freeEn.setLabel],
    ['Free workout · 0 of 0 sets', 'Free workout', null, null],
    'presencia (en): un entrenamiento libre guardado en español se lee en inglés; sin ejercicios, sin serie',
  )

  const running = { total: 90, endsAt: now + 60_000, paused: false, remaining: 61 }
  const withRestEs = P.buildWorkoutPresence({ ...base, rest: running, exerciseNameById: namesEs, t: tEs, language: 'es', android: true })
  const withRestEn = P.buildWorkoutPresence({ ...base, rest: running, exerciseNameById: namesEn, t: tEn, language: 'en', android: false })
  const freeEs = P.buildWorkoutPresence({ ...base, session: free, exerciseNameById: undefined, t: tEs, language: 'es', android: true })
  for (const [label, p] of [
    ['es', es],
    ['en', en],
    ['es con descanso', withRestEs],
    ['en con descanso', withRestEn],
    ['es libre', freeEs],
    ['en libre', freeEn],
  ] as const) {
    const raw = strings(p).filter((s) => RAW_KEY.test(s))
    ok(raw.length === 0, `presencia (${label}): ninguna clave sin traducir`, raw.join(' · '))
  }
  const enWords = [en, withRestEn, freeEn].flatMap(strings).filter((s) => SPANISH.test(s))
  ok(enWords.length === 0, 'presencia (en): ni una palabra en español', enWords.join(' · '))
  const esWords = [es, withRestEs, freeEs].flatMap(strings).filter((s) => ENGLISH.test(s))
  ok(esWords.length === 0, 'presencia (es): ni una palabra en inglés', esWords.join(' · '))

  /* --- series */
  const setLabel = (sets: SetEntry[], excludeWarmups = true) =>
    P.buildWorkoutPresence({
      ...base,
      session: session([exercise('bench', 'Press de banca', sets)]),
      excludeWarmups,
      exerciseNameById: namesEs,
      t: tEs,
      language: 'es',
      android: false,
    }).setLabel
  eq(setLabel([set(), set(), set()]), 'Serie 1 de 3', 'serie: sin ninguna hecha, toca la 1')
  eq(setLabel([set({ completed: true }), set({ completed: true }), set()]), 'Serie 3 de 3', 'serie: con dos hechas, toca la 3')
  eq(
    setLabel([set({ completed: true }), set({ completed: true }), set({ completed: true })]),
    'Serie 3 de 3',
    'serie: con todas hechas se queda en la última, nunca «4 de 3»',
  )
  eq(setLabel([]), null, 'serie: un ejercicio sin series no tiene etiqueta')
  eq(
    setLabel([set({ type: 'warmup', completed: true }), set(), set()]),
    'Serie 1 de 2',
    'serie: el calentamiento no cuenta si el ajuste lo excluye, como en la cabecera',
  )
  eq(
    setLabel([set({ type: 'warmup', completed: true }), set(), set()], false),
    'Serie 2 de 3',
    'serie: y cuenta si el ajuste no lo excluye',
  )
  eq(
    P.buildWorkoutPresence({ ...base, currentIndex: 7, exerciseNameById: namesEs, t: tEs, language: 'es', android: false }).exerciseName,
    null,
    'serie: un índice fuera de la sesión no inventa ejercicio',
  )

  /* --- descanso */
  eq(withRestEs.rest, { endsAt: now + 60_000, total: 90, paused: false, remaining: 61 }, 'descanso: en marcha viaja con su hora de fin')
  ok(
    /^Descanso · hasta \d{2}:\d{2}$/.test(withRestEs.labels.restUntil ?? ''),
    'descanso: «Descanso · hasta HH:MM» ya formateado para Android',
    withRestEs.labels.restUntil,
  )
  ok(/^Rest · until \d{2}:\d{2}$/.test(withRestEn.labels.restUntil ?? ''), 'descanso: y en inglés, «Rest · until HH:MM»', withRestEn.labels.restUntil)
  const at = (rest: { total: number; endsAt: number; paused: boolean; remaining: number }) =>
    P.buildWorkoutPresence({ ...base, rest, exerciseNameById: namesEs, t: tEs, language: 'es', android: false })
  eq(at({ ...running, endsAt: now }).rest, null, 'descanso: vencido justo ahora ya no se enseña')
  eq(at({ ...running, endsAt: now - 1 }).rest, null, 'descanso: vencido hace nada tampoco')
  const paused = at({ total: 90, endsAt: now - 5_000, paused: true, remaining: 30 })
  eq(paused.rest, { endsAt: now - 5_000, total: 90, paused: true, remaining: 30 }, 'descanso: en pausa se enseña aunque su hora vieja haya pasado')
  eq(paused.labels.restUntil, undefined, 'descanso: en pausa no hay «hasta HH:MM»')

  /* --- cortar */
  const longName = 'Press de banca con agarre cerrado y pausa en el pecho sobre banco inclinado a cuarenta y cinco grados'
  const long = P.buildWorkoutPresence({
    ...base,
    exerciseNameById: new Map([['bench', { name: longName, isCustom: false }]]),
    t: tEs,
    language: 'es',
    android: true,
  })
  ok(
    Array.from(long.exerciseName ?? '').length === P.MAX_CHARS && (long.exerciseName ?? '').endsWith('…'),
    'cortar: un nombre larguísimo se corta a 60 con «…»',
    long.exerciseName ?? '',
  )
  ok(
    Array.from(long.body).length <= P.MAX_CHARS && long.body.endsWith(' · Serie 2 de 3'),
    'cortar: el texto de Android cabe y conserva entera la serie',
    long.body,
  )
  eq(P.clip('😀'.repeat(70)).length, 59 * 2 + 1, 'cortar: cuenta caracteres, no medio emoji')
  eq(P.clip('corto'), 'corto', 'cortar: lo que cabe no se toca')

  /* --- clave de deduplicado */
  const key = (s: WorkoutSession, rest: { total: number; endsAt: number; paused: boolean; remaining: number } | null = null, t = tEs, language: 'es' | 'en' = 'es') =>
    P.presenceKey(P.buildWorkoutPresence({ ...base, session: s, rest, exerciseNameById: namesEs, t, language, android: true }))
  const typed = structuredClone(push)
  typed.exercises[0].sets[2].weight = 102.5
  typed.exercises[0].sets[2].reps = 5
  typed.exercises[0].sets[1].weight = 85
  typed.exercises[0].sets[1].rir = 2
  typed.exercises[0].sets[1].note = 'buena'
  typed.updatedAt = 99
  eq(key(typed), key(push), 'clave: teclear pesos, repeticiones, RIR o notas no cambia nada visible')
  const ticked = structuredClone(push)
  ticked.exercises[0].sets[2].completed = true
  ok(key(ticked) !== key(push), 'clave: marcar una serie sí (cambia «Serie 2 de 3»)')
  eq(key(push, running), key(push, { ...running, remaining: 40 }), 'clave: un descanso en marcha no cambia cada segundo')
  ok(key(push, running) !== key(push, { ...running, endsAt: running.endsAt + 30_000 }), 'clave: ±30 s sí')
  const pausedRest = { total: 90, endsAt: now - 5_000, paused: true, remaining: 30 }
  ok(key(push, pausedRest) !== key(push, { ...pausedRest, remaining: 29 }), 'clave: en pausa cuenta lo que queda')
  ok(key(push, running) !== key(push, pausedRest), 'clave: pausar sí')
  ok(key(push) !== key(push, null, tEn, 'en'), 'clave: cambiar de idioma sí')

  /* --- aviso de descanso */
  const settings = { sounds: true, restSound: true, haptics: true, restVibrate: true }
  const alertEs = P.desiredRestAlert({ session: push, rest: running, now, t: tEs, settings, exerciseName: 'Press de banca', android: true })
  eq(
    alertEs,
    {
      sessionId: 'sesion-1',
      at: now + 60_000,
      title: 'Descanso terminado',
      body: 'Siguiente serie: Press de banca',
      sound: true,
      vibrate: true,
      channelName: 'Fin del descanso',
      channelDescription: 'Avisa cuando termina el descanso entre series.',
    },
    'aviso (es): a la hora del fin, con el ejercicio y el canal de Android',
  )
  const alertEn = P.desiredRestAlert({ session: push, rest: running, now, t: tEn, settings, exerciseName: 'Bench press', android: false })
  eq(
    alertEn,
    { sessionId: 'sesion-1', at: now + 60_000, title: 'Rest over', body: 'Next set: Bench press', sound: true, vibrate: true },
    'aviso (en): en inglés y sin canal en iOS',
  )
  ok(strings(alertEn).every((s) => !SPANISH.test(s)), 'aviso (en): ni una palabra en español')
  ok(strings(alertEs).every((s) => !ENGLISH.test(s) && !RAW_KEY.test(s)), 'aviso (es): ni inglés ni claves sin traducir')
  eq(
    P.desiredRestAlert({ session: push, rest: running, now, t: tEs, settings, exerciseName: null, android: false })?.body,
    'Toca para volver al entrenamiento.',
    'aviso: sin ejercicio, el texto genérico',
  )
  const flags = (s: typeof settings) => {
    const a = P.desiredRestAlert({ session: push, rest: running, now, t: tEs, settings: s, exerciseName: null, android: false })
    return [a?.sound, a?.vibrate]
  }
  eq(flags({ ...settings, sounds: false }), [false, true], 'aviso: sin sonidos en la app, el aviso no suena')
  eq(flags({ ...settings, restSound: false }), [false, true], 'aviso: sin sonido de descanso, tampoco')
  eq(flags({ ...settings, haptics: false }), [true, false], 'aviso: sin vibración en la app, no vibra')
  eq(flags({ ...settings, restVibrate: false }), [true, false], 'aviso: sin vibración de descanso, tampoco')
  eq(P.desiredRestAlert({ session: push, rest: pausedRest, now, t: tEs, settings, exerciseName: null, android: false }), null, 'aviso: en pausa no hay aviso')
  eq(
    P.desiredRestAlert({ session: push, rest: { ...running, endsAt: now }, now, t: tEs, settings, exerciseName: null, android: false }),
    null,
    'aviso: un descanso vencido no se programa',
  )
  eq(P.desiredRestAlert({ session: push, rest: null, now, t: tEs, settings, exerciseName: null, android: false }), null, 'aviso: sin descanso, nada')

  /* --- programar, cancelar o nada */
  const A = alertEs as NonNullable<typeof alertEs>
  eq(P.restAlertTransition(null, A, now), 'schedule', 'transición: empieza un descanso → programar')
  eq(P.restAlertTransition(A, { ...A }, now), 'none', 'transición: el mismo aviso → nada (cada tic del descanso no llama a nadie)')
  eq(P.restAlertTransition(A, { ...A, at: A.at + 30_000 }, now), 'schedule', 'transición: +30 s → reprogramar')
  eq(P.restAlertTransition(A, { ...A, title: 'Rest over', body: 'Next set: Bench press' }, now), 'schedule', 'transición: cambio de idioma → reprogramar')
  eq(P.restAlertTransition(A, { ...A, sound: false }, now), 'schedule', 'transición: cambio de ajustes → reprogramar')
  eq(P.restAlertTransition(A, null, now), 'cancel', 'transición: pausar, saltar o terminar antes → cancelar')
  eq(P.restAlertTransition(A, null, A.at), 'none', 'transición: fin natural → NO se cancela, lo da el sistema')
  eq(P.restAlertTransition(A, null, A.at - 400), 'none', 'transición: a medio segundo del fin tampoco se cancela')
  eq(P.restAlertTransition(A, null, A.at + 5_000), 'none', 'transición: ya pasado, tampoco')
  eq(P.restAlertTransition(null, null, now), 'none', 'transición: sin aviso ni antes ni ahora → nada')

  /* --- tocar el aviso */
  const asked: string[] = []
  const known: Record<string, 'completed' | 'other'> = { 'hecha-1': 'completed', 'otra-2': 'other' }
  const lookup = async (id: string) => {
    asked.push(id)
    return known[id] ?? null
  }
  eq(await P.routeForWorkoutTap(undefined, 'activa-1', lookup), '/workout/active', 'toque: sin id → la sesión en curso')
  eq(await P.routeForWorkoutTap(undefined, null, lookup), '/workout/active', 'toque: sin id y sin sesión → /workout/active (que manda a /workout)')
  eq(await P.routeForWorkoutTap('', 'activa-1', lookup), '/workout/active', 'toque: id vacío cuenta como ausente')
  eq(await P.routeForWorkoutTap('activa-1', 'activa-1', lookup), '/workout/active', 'toque: el id de la sesión en curso → la sesión')
  eq(await P.routeForWorkoutTap('hecha-1', 'activa-1', lookup), '/history/hecha-1', 'toque: una sesión ya terminada → su detalle')
  eq(await P.routeForWorkoutTap('hecha-1', null, lookup), '/history/hecha-1', 'toque: también sin sesión en curso')
  eq(await P.routeForWorkoutTap('desconocida-3', 'activa-1', lookup), '/', 'toque: desconocida (descartada, de otra cuenta) → inicio')
  eq(await P.routeForWorkoutTap('otra-2', 'activa-1', lookup), '/', 'toque: una que existe pero no está terminada → inicio')
  asked.length = 0
  eq(await P.routeForWorkoutTap('../history', 'activa-1', lookup), '/', 'toque: un id con barras → inicio')
  eq(await P.routeForWorkoutTap('a b', 'activa-1', lookup), '/', 'toque: un id con espacios → inicio')
  eq(await P.routeForWorkoutTap('a'.repeat(65), 'activa-1', lookup), '/', 'toque: un id de 65 caracteres → inicio')
  eq(asked, [], 'toque: un id mal formado ni siquiera se busca en la base de datos')
  eq(await P.routeForWorkoutTap('a'.repeat(64), 'activa-1', lookup), '/', 'toque: 64 caracteres es un id válido (se busca)')
  eq(asked, ['a'.repeat(64)], 'toque: y sí se busca')
  eq(
    await P.routeForWorkoutTap('hecha-1', 'activa-1', async () => {
      throw new Error('IndexedDB cerrada')
    }),
    '/',
    'toque: si la búsqueda falla, inicio',
  )
}

/* ============================================ 2. el plugin en iOS */
{
  const { isNative, isNativeIOS, isNativeAndroid } = await import('../src/lib/native/platform')
  const N = await import('../src/lib/native/workoutNotification')
  const P = await import('../src/lib/native/workoutPresence')
  const { makeT } = await import('../src/lib/i18n')
  N.setNativeTimeoutsForTests(200, 5_000)

  eq([isNative(), isNativeIOS(), isNativeAndroid()], [true, true, false], 'iOS: la app se ve a sí misma como iPhone, no como Android')

  const presence = P.buildWorkoutPresence({
    session: session([exercise('bench', 'Press de banca', [set({ completed: true }), set(), set()])]),
    rest: null,
    currentIndex: 0,
    exerciseNameById: undefined,
    t: makeT('es'),
    language: 'es',
    excludeWarmups: true,
    now: 1_700_000_100_000,
    android: false,
  })
  const alert = {
    sessionId: 'sesion-1',
    at: 1_700_000_190_000,
    title: 'Descanso terminado',
    body: 'Siguiente serie: Press de banca',
    sound: true,
    vibrate: true,
  }

  // Sin permiso de notificaciones la Live Activity se pide igual.
  scenario.permission = 'denied'
  await N.showWorkoutPresence(presence)
  eq(methods(), ['checkPermissions', 'start'], 'iOS: con el permiso denegado, la Live Activity se pide igualmente')
  eq(calls[1]?.options, presence, 'iOS: llega tal cual, sin campos de canal')

  calls.length = 0
  eq(await N.scheduleRestAlert(alert), null, 'iOS: con el permiso denegado no se programa el aviso de descanso')
  eq(methods(), ['checkPermissions'], 'iOS: y no se llega a llamar a scheduleRestAlert')

  scenario.permission = 'granted'
  calls.length = 0
  eq(await N.scheduleRestAlert(alert), { scheduled: true, exact: true }, 'iOS: con permiso se programa (y en iOS siempre es exacto)')
  eq(methods(), ['checkPermissions', 'scheduleRestAlert'], 'iOS: comprobar el permiso y programar')

  // Lo mismo otra vez no llama a nada; al volver a primer plano, sí.
  calls.length = 0
  await N.showWorkoutPresence(presence)
  eq(methods(), [], 'iOS: la misma presencia no cruza el puente')
  ok(await waitFor(() => appState !== null), 'iOS: se vigila la vuelta a primer plano')
  const fire = appState as ((data: unknown) => void) | null
  fire?.({ isActive: false })
  await sleep(20)
  eq(methods(), [], 'iOS: irse a segundo plano no llama a nada')
  fire?.({ isActive: true })
  await waitFor(() => methods().includes('start'))
  eq(methods(), ['checkPermissions', 'start'], 'iOS: al volver, se repone la Live Activity (iOS pudo terminarla)')

  // Un método que no contesta nunca no deja la fila parada.
  scenario.hang.add('start')
  calls.length = 0
  const hung = N.showWorkoutPresence({ ...presence, setLabel: 'Serie 3 de 3', body: 'Press de banca · Serie 3 de 3' })
  await waitFor(() => methods().includes('start'))
  const t0 = Date.now()
  await N.hideWorkoutPresence()
  const waited = Date.now() - t0
  await hung
  eq(methods(), ['checkPermissions', 'start', 'stop'], 'iOS: un start colgado no se queda con la fila: el stop llega')
  ok(waited >= 100 && waited < 2_000, `iOS: la fila se libera al agotar el tiempo (${waited} ms)`)
  scenario.hang.delete('start')

  // La retirada urgente no espera al diálogo de permiso.
  store.delete('training-os:workout-notification-asked')
  scenario.permission = 'prompt'
  scenario.holdRequest = true
  calls.length = 0
  const asking = N.showWorkoutPresence({ ...presence, sessionId: 'sesion-2' })
  await waitFor(() => methods().includes('requestPermissions'))
  const t1 = Date.now()
  await N.forceStopNative()
  const stopWaited = Date.now() - t1
  eq(methods(), ['checkPermissions', 'requestPermissions', 'stop'], 'iOS: forceStopNative manda el stop con el diálogo de permiso aún abierto')
  ok(stopWaited < 150, `iOS: sin esperar a la fila (${stopWaited} ms)`)

  // La háptica tampoco espera a la fila.
  await N.nativeHaptic('success')
  eq(calls.at(-1), { method: 'haptic', options: { kind: 'success' } }, 'iOS: la háptica va por fuera de la fila')

  scenario.release?.()
  await asking
  await waitFor(() => methods().filter((m) => m === 'stop').length === 2)
  eq(methods().includes('start'), false, 'iOS: contestado el permiso, el start pendiente ya no resucita el entrenamiento')
  eq(methods().at(-1), 'stop', 'iOS: y el último mensaje sigue siendo stop')
  scenario.holdRequest = false

  calls.length = 0
  eq(await N.isSupported(), { presence: true, restAlerts: true, exactAlarms: true }, 'iOS: isSupported')
  eq(await N.requestExactAlarm(), { exactAlarms: true }, 'iOS: requestExactAlarm contesta true sin preguntar nada')
  eq(await N.cancelRestAlert(), { delivered: false }, 'iOS: cancelar el aviso dice si ya había salido')

  const taps: unknown[] = []
  const off = N.onWorkoutNoticeTap((e) => taps.push(e))
  await waitFor(() => tap !== null)
  const emit = tap as ((data: unknown) => void) | null
  emit?.({ sessionId: 'sesion-1' })
  emit?.({})
  eq(taps, [{ sessionId: 'sesion-1' }, {}], 'iOS: el toque en la Live Activity llega con su sesión')
  off()
}

/* --------------------------------------------------------------- report */

console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
