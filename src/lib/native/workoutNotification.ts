/**
 * El entrenamiento en curso fuera de la app: la notificación persistente de
 * Android, la Live Activity de iOS, el aviso de «Descanso terminado», la
 * háptica y el toque que devuelve al entrenamiento.
 *
 * Todo pasa por un único plugin propio, `WorkoutNotification`, con los mismos
 * métodos y los mismos datos en las dos plataformas
 * (`android/app/src/main/java/com/trainingos/app/WorkoutNotificationPlugin.java`
 * y su gemelo en Swift). El contrato completo está en
 * docs/NATIVE-CONTRACT.md; este fichero es su mitad JavaScript.
 *
 * Lo pinta el sistema, no nosotros: el plugin le da la hora a la que empezó
 * el entrenamiento (y, si hay descanso, la hora a la que acaba) y el sistema
 * pinta los cronómetros. La app no se despierta cada segundo y no hay ningún
 * servicio en segundo plano.
 *
 * Tres reglas, por este orden:
 *
 *   1. Nada de esto puede tumbar un entrenamiento. Cada llamada va envuelta,
 *      con un tiempo máximo, y cualquier fallo se queda en un aviso en
 *      consola. Sin permiso, sin plugin o con el plugin roto, la app hace
 *      exactamente lo mismo que hacía antes de que existiera este fichero.
 *   2. En el navegador es un no-op silencioso, y además no cuesta un byte:
 *      `@capacitor/core` se importa de forma dinámica y sólo después de que
 *      `isNative()` haya dicho que sí, igual que en `chrome.ts`.
 *   3. El permiso de notificaciones se pide UNA vez, la primera vez que se
 *      empieza un entrenamiento, no al abrir la app. Si se deniega no se
 *      vuelve a preguntar; si después se concede en los ajustes del sistema,
 *      el aviso aparece solo la próxima vez que la app vuelve a primer plano.
 */
import type { PermissionState, PluginListenerHandle } from '@capacitor/core'
import { isNative, isNativeAndroid } from './platform'
import { presenceKey } from './workoutPresence'

/**
 * El estado continuo del entrenamiento, tal y como lo pinta el sistema. Todo
 * texto llega ya traducido al idioma de la app (el nativo no tiene literales
 * de interfaz) y todo tiempo es una marca absoluta en ms de época.
 *
 * Se construye en `workoutPresence.ts` (`buildWorkoutPresence`), que es puro y
 * está probado; aquí sólo viaja.
 */
export interface WorkoutPresence {
  /** Id de la sesión activa: `start` es un upsert por sesión. */
  sessionId: string
  /**
   * Desde cuándo cuenta el cronómetro: el `startedAt` de la sesión más su
   * `pausedMs`. Es la misma cuenta que hace el cronómetro de la app, así que
   * los dos marcan lo mismo.
   */
  startedAt: number
  /** t('workout.notifTitle') */
  title: string
  /** La línea de texto de la notificación de Android. */
  body: string
  /** sessionTitle(session, t) */
  sessionName: string
  /** El ejercicio actual, traducido (exerciseTitle). */
  exerciseName: string | null
  /** t('live.setOf', { set, total }) */
  setLabel: string | null
  /** t('workout.progress', { done, total }) */
  progressLabel: string
  /** `null` sin descanso o si ya venció (sin pausa y `endsAt <= ahora`). */
  rest: null | {
    /** ms */
    endsAt: number
    /** s */
    total: number
    paused: boolean
    /** s; sólo significativo si `paused`. */
    remaining: number
  }
  labels: {
    rest: string
    restOver: string
    elapsed: string
    paused: string
    /**
     * «Descanso · hasta 10:42», ya formateado con la hora local. Sólo con un
     * descanso en marcha: es la línea que pinta Android cuando la alarma no es
     * exacta y no puede prometer una cuenta atrás.
     */
    restUntil?: string
  }
  /** 'es-ES' | 'en-GB' */
  locale: string
  /**
   * Nombre y descripción del canal, los que se ven en Ajustes del sistema →
   * Notificaciones. Sólo en Android, y en el idioma de la app, no en el del
   * teléfono: con la app en español nada de ella sale en inglés, y al revés.
   */
  channelName?: string
  channelDescription?: string
}

/** El aviso puntual de «Descanso terminado». No es la presencia: es otra cosa. */
export interface RestAlert {
  sessionId: string
  /** ms; `at <= ahora + 0,5 s` → el nativo lo cancela y contesta `{ scheduled: false }`. */
  at: number
  /** t('notif.restEndTitle') */
  title: string
  /** t('notif.restEndBody', { exercise }) o t('notif.restEndBodyGeneric') */
  body: string
  /** settings.sounds && settings.restSound */
  sound: boolean
  /** settings.haptics && settings.restVibrate (en iOS no se separa del sonido) */
  vibrate: boolean
  /** Android: t('notif.restChannel') */
  channelName?: string
  /** Android: t('notif.restChannelBody') */
  channelDescription?: string
}

export type HapticKind = 'tick' | 'success' | 'pr' | 'warn'

export interface NativeSupport {
  presence: boolean
  restAlerts: boolean
  exactAlarms: boolean
}

/** Lo que llega al tocar el aviso o la Live Activity. */
export interface WorkoutTap {
  sessionId?: string
}

interface WorkoutNotificationPlugin {
  start(options: WorkoutPresence): Promise<{ shown: boolean }>
  stop(): Promise<void>
  scheduleRestAlert(options: RestAlert): Promise<{ scheduled: boolean; exact: boolean }>
  cancelRestAlert(): Promise<{ delivered: boolean }>
  haptic(options: { kind: HapticKind }): Promise<void>
  isSupported(): Promise<NativeSupport>
  checkPermissions(): Promise<{ display: PermissionState }>
  requestPermissions(): Promise<{ display: PermissionState }>
  requestExactAlarm(): Promise<{ exactAlarms: boolean }>
  addListener(event: 'open', listener: (data: unknown) => void): Promise<PluginListenerHandle>
}

/** Se guarda en el dispositivo, no en la cuenta: el permiso es de este teléfono. */
const ASKED_KEY = 'training-os:workout-notification-asked'

/*
 * Tiempos máximos. Una promesa nativa que no contesta — un método que falta
 * en `pluginMethods` de iOS, un plugin a medio cargar — no puede dejar la
 * fila parada para siempre: pasado el tiempo, la llamada se da por fallida y
 * la siguiente sigue su camino. Los dos permisos esperan a una persona, así
 * que esos tienen dos minutos.
 */
let CALL_MS = 4_000
let PERSON_MS = 120_000

/** Sólo para los tests: acorta los tiempos máximos para no esperar de verdad. */
export function setNativeTimeoutsForTests(callMs: number, personMs: number): void {
  CALL_MS = callMs
  PERSON_MS = personMs
}

function timed<T>(what: string, ms: number, call: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what}: sin respuesta en ${ms} ms`)), ms)
    let pending: Promise<T>
    try {
      pending = call()
    } catch (err) {
      clearTimeout(timer)
      reject(err)
      return
    }
    pending.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err: unknown) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

function warn(what: string, err: unknown): void {
  console.warn(`[training-os:native] ${what}`, err)
}

/*
 * El plugin va DENTRO de un objeto, nunca suelto en la promesa.
 *
 * `registerPlugin` devuelve un Proxy que contesta a cualquier propiedad con un
 * método nativo — también a `then`. Si se devuelve tal cual desde un `.then()`
 * o un `async`, JavaScript lo toma por una promesa, llama a su `then()`, que
 * no existe en el lado nativo, y la promesa se queda colgada para siempre: el
 * aviso no aparecería nunca y nada fallaría a la vista. Lo cazó la prueba
 * unitaria de tests/unit.ts.
 */
type Holder = { api: WorkoutNotificationPlugin }
let pluginPromise: Promise<Holder | null> | null = null

/** Devuelve el envoltorio. Quien lo use lee `.api` DESPUÉS de esperar, nunca la devuelve. */
function plugin(): Promise<Holder | null> {
  if (!isNative()) return Promise.resolve(null)
  pluginPromise ??= import('@capacitor/core')
    .then(({ registerPlugin }) => {
      watchForeground()
      return { api: registerPlugin<WorkoutNotificationPlugin>('WorkoutNotification') }
    })
    .catch((err: unknown) => {
      warn('no se pudo cargar el aviso de entrenamiento', err)
      return null
    })
  return pluginPromise
}

function alreadyAsked(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) === '1'
  } catch {
    // Sin localStorage, mejor no volver a preguntar en cada entrenamiento.
    return true
  }
}

function markAsked(): void {
  try {
    localStorage.setItem(ASKED_KEY, '1')
  } catch {
    /* Ver alreadyAsked. */
  }
}

/* ------------------------------------------------------------- deduplicar */

/*
 * La presencia se deduplica con una clave hecha de lo que se VE
 * (`presenceKey`), no del objeto sesión: teclear un peso no cambia nada
 * visible y no llama a nada. La clave se fija sólo cuando `start` contesta
 * `{ shown: true }` y se borra al retirar la presencia, al denegarse el
 * permiso y cuando la app vuelve a primer plano: iOS puede haber terminado la
 * Live Activity mientras tanto (y Android, si se desliza la notificación).
 */
let lastPresenceKey: string | null = null

/** Lo último que se pidió enseñar y no se ha retirado: lo que hay que reponer al volver. */
let lastDesired: WorkoutPresence | null = null

let watchingForeground = false

function watchForeground(): void {
  if (watchingForeground) return
  watchingForeground = true
  void (async () => {
    try {
      const { App } = await import('@capacitor/app')
      await App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) return
        lastPresenceKey = null
        if (lastDesired) void showWorkoutPresence(lastDesired)
      })
    } catch (err) {
      warn('no se pudo vigilar la vuelta a primer plano', err)
    }
  })()
}

/* ---------------------------------------------------------------- la fila */

/**
 * Las llamadas van en fila. Un `start` puede quedarse esperando al diálogo de
 * permiso mientras la persona termina el entrenamiento; sin la fila, el `stop`
 * llegaría antes que el `start` y la notificación se quedaría en pantalla con
 * el entrenamiento ya guardado.
 *
 * Y cada retirada sube `generation`: lo que se puso en la fila ANTES de una
 * retirada ya no publica nada aunque le toque después (ver `stale`). Así un
 * `start` que esperaba al permiso no resucita un entrenamiento descartado.
 */
let queue: Promise<void> = Promise.resolve()
let generation = 0

type Task<T> = (p: WorkoutNotificationPlugin, stale: () => boolean) => Promise<T>

function enqueue<T>(fallback: T, task: Task<T>): Promise<T> {
  const mine = generation
  const stale = () => generation !== mine
  const run = queue.then(async (): Promise<T> => {
    try {
      const holder = await plugin()
      return holder ? await task(holder.api, stale) : fallback
    } catch (err) {
      warn('aviso de entrenamiento', err)
      return fallback
    }
  })
  queue = run.then(() => undefined)
  return run
}

async function permissionGranted(p: WorkoutNotificationPlugin): Promise<boolean> {
  let state = (await timed('checkPermissions', CALL_MS, () => p.checkPermissions())).display
  if ((state === 'prompt' || state === 'prompt-with-rationale') && !alreadyAsked()) {
    // Se marca ANTES de preguntar: si la app se cierra con el diálogo
    // abierto, no se vuelve a preguntar al siguiente arranque.
    markAsked()
    state = (await timed('requestPermissions', PERSON_MS, () => p.requestPermissions())).display
  }
  return state === 'granted'
}

/* ---------------------------------------------------------------- la API */

/**
 * Enseña la presencia del entrenamiento, o la actualiza si ya está. Se puede
 * llamar tantas veces como haga falta: es la misma notificación / la misma
 * Live Activity, no vuelve a sonar ni a vibrar, y si nada visible ha cambiado
 * no llega ni a cruzar el puente.
 *
 * Android: sin el permiso de notificaciones no se publica nada (como
 * siempre). iOS: la Live Activity no necesita ese permiso, así que se pide
 * igualmente; el permiso sólo decide el aviso de descanso.
 */
export function showWorkoutPresence(presence: WorkoutPresence): Promise<void> {
  lastDesired = presence
  return enqueue(undefined, async (p, stale) => {
    const key = presenceKey(presence)
    if (key === lastPresenceKey) return
    const granted = await permissionGranted(p)
    if (!granted) lastPresenceKey = null
    if (stale()) return
    if (!granted && isNativeAndroid()) return
    const result = await timed('start', CALL_MS, () => p.start(presence))
    // Una retirada pedida mientras tanto ya está en la fila detrás de esta
    // llamada; la clave no se fija para que nada se dé por publicado.
    if (!stale() && result?.shown === true) lastPresenceKey = key
  })
}

/**
 * La retira (terminar, descartar, sin sesión). El nativo termina también el
 * aviso de descanso pendiente y retira el ya entregado. Sin nada en pantalla,
 * no hace nada.
 */
export function hideWorkoutPresence(): Promise<void> {
  generation++
  lastDesired = null
  lastPresenceKey = null
  return enqueue(undefined, async (p) => {
    lastPresenceKey = null
    await timed('stop', CALL_MS, () => p.stop())
  })
}

/**
 * Retirada urgente: cerrar sesión, borrar la cuenta, «Borrar todo». No espera
 * a la fila — que puede estar parada hasta dos minutos delante del diálogo de
 * permiso — sino que manda el `stop` ya, y deja otro al final de la fila para
 * que siga siendo el último mensaje aunque haya un `start` a medio camino.
 *
 * Nunca lanza. Se puede esperar o no: la promesa se resuelve cuando el primer
 * `stop` ha contestado (o ha agotado su tiempo).
 */
export function forceStopNative(): Promise<void> {
  generation++
  lastDesired = null
  lastPresenceKey = null
  if (!isNative()) return Promise.resolve()
  const now = (async () => {
    try {
      const holder = await plugin()
      if (holder) await timed('stop', CALL_MS, () => holder.api.stop())
    } catch (err) {
      warn('no se pudo retirar el aviso de entrenamiento', err)
    }
  })()
  void enqueue(undefined, async (p) => {
    lastPresenceKey = null
    await timed('stop', CALL_MS, () => p.stop())
  })
  return now
}

/**
 * Programa (o reprograma: reemplaza al anterior) el aviso de «Descanso
 * terminado». Sólo con el permiso de notificaciones concedido, en las dos
 * plataformas.
 *
 * `null` si no se ha programado nada: web, sin permiso, plugin roto o una
 * retirada pedida mientras esperaba en la fila.
 */
export function scheduleRestAlert(alert: RestAlert): Promise<{ scheduled: boolean; exact: boolean } | null> {
  return enqueue<{ scheduled: boolean; exact: boolean } | null>(null, async (p, stale) => {
    if (!(await permissionGranted(p))) return null
    if (stale()) return null
    const result = await timed('scheduleRestAlert', CALL_MS, () => p.scheduleRestAlert(alert))
    return { scheduled: result?.scheduled === true, exact: result?.exact === true }
  })
}

/**
 * Cancela el aviso de descanso pendiente (pausa, saltar, terminar antes).
 * `delivered: true` significa que el de ese descanso ya había salido. `null`
 * en web o si el plugin no contesta.
 */
export function cancelRestAlert(): Promise<{ delivered: boolean } | null> {
  return enqueue<{ delivered: boolean } | null>(null, async (p) => {
    const result = await timed('cancelRestAlert', CALL_MS, () => p.cancelRestAlert())
    return { delivered: result?.delivered === true }
  })
}

/**
 * Vibración háptica nativa. Fuera de la fila — una vibración que llega tarde
 * ya no sirve — y nunca lanza. El ajuste `haptics` lo mira quien llama
 * (`src/lib/feedback.ts`).
 */
export function nativeHaptic(kind: HapticKind): Promise<void> {
  if (!isNative()) return Promise.resolve()
  return plugin()
    .then((holder) => (holder ? timed('haptic', CALL_MS, () => holder.api.haptic({ kind })) : undefined))
    .catch((err: unknown) => warn('háptica', err))
}

/** Qué sabe hacer este dispositivo. `null` en web o si el plugin no contesta. */
export async function isSupported(): Promise<NativeSupport | null> {
  try {
    const holder = await plugin()
    if (!holder) return null
    const result = await timed('isSupported', CALL_MS, () => holder.api.isSupported())
    return {
      presence: result?.presence === true,
      restAlerts: result?.restAlerts === true,
      exactAlarms: result?.exactAlarms === true,
    }
  } catch (err) {
    warn('isSupported', err)
    return null
  }
}

/**
 * ¿Está concedido el permiso de notificaciones? Sólo mira, nunca pregunta, y
 * va fuera de la fila para no esperar detrás de un diálogo. `null` en web o
 * si el plugin no contesta.
 */
export async function hasDisplayPermission(): Promise<boolean | null> {
  try {
    const holder = await plugin()
    if (!holder) return null
    const result = await timed('checkPermissions', CALL_MS, () => holder.api.checkPermissions())
    return result?.display === 'granted'
  } catch (err) {
    warn('checkPermissions', err)
    return null
  }
}

/**
 * Android 12+: abre Ajustes en «Alarmas y recordatorios» y contesta cuando la
 * persona vuelve. En el resto, `{ exactAlarms: true }` sin preguntar nada.
 * Fuera de la fila: mientras la persona está en Ajustes la presencia tiene
 * que poder seguir actualizándose.
 */
export async function requestExactAlarm(): Promise<{ exactAlarms: boolean } | null> {
  try {
    const holder = await plugin()
    if (!holder) return null
    const result = await timed('requestExactAlarm', PERSON_MS, () => holder.api.requestExactAlarm())
    return { exactAlarms: result?.exactAlarms === true }
  } catch (err) {
    warn('requestExactAlarm', err)
    return null
  }
}

/**
 * Avisa cuando la persona toca la notificación o la Live Activity. Si la app
 * estaba cerrada, el plugin guarda el toque hasta que haya alguien
 * escuchando, así que también llega en un arranque en frío.
 *
 * Lo que llega del nativo se limpia aquí: `sessionId` sólo si es una cadena.
 * Validar su forma y decidir adónde ir es cosa de `routeForWorkoutTap`.
 *
 * Devuelve la función para dejar de escuchar.
 */
export function onWorkoutNoticeTap(listener: (e: WorkoutTap) => void): () => void {
  let handle: PluginListenerHandle | null = null
  let cancelled = false
  void (async () => {
    try {
      const holder = await plugin()
      if (!holder || cancelled) return
      handle = await holder.api.addListener('open', (data: unknown) => {
        const id = typeof data === 'object' && data !== null ? (data as { sessionId?: unknown }).sessionId : undefined
        const tap: WorkoutTap = {}
        if (typeof id === 'string') tap.sessionId = id
        listener(tap)
      })
      if (cancelled) release(handle)
    } catch (err) {
      warn('no se pudo escuchar el aviso de entrenamiento', err)
    }
  })()
  return () => {
    cancelled = true
    if (handle) release(handle)
  }
}

/** Dejar de escuchar también es una llamada al nativo, y también puede fallar. */
function release(handle: PluginListenerHandle): void {
  handle.remove().catch((err: unknown) => {
    warn('no se pudo dejar de escuchar el aviso', err)
  })
}
