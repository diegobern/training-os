/**
 * El aviso de «entrenamiento en curso» de la pantalla de bloqueo de Android.
 *
 * La notificación la pinta Android, no nosotros: el plugin nativo
 * (`android/app/src/main/java/com/trainingos/app/WorkoutNotificationPlugin.java`)
 * le da al sistema la hora a la que empezó el entrenamiento y le pide un
 * cronómetro (`setUsesChronometer`). A partir de ahí el tiempo sube solo en la
 * pantalla de bloqueo, sin que la app tenga que despertarse cada segundo y sin
 * ningún servicio en segundo plano.
 *
 * Tres reglas, por este orden:
 *
 *   1. Nada de esto puede tumbar un entrenamiento. Cada llamada va envuelta
 *      y cualquier fallo se queda en un aviso en consola. Sin permiso, sin
 *      plugin o con el plugin roto, la app hace exactamente lo mismo que
 *      hacía antes de que existiera este fichero.
 *   2. En el navegador es un no-op silencioso, y además no cuesta un byte:
 *      `@capacitor/core` se importa de forma dinámica y sólo después de que
 *      `isNativeAndroid()` haya dicho que sí, igual que en `chrome.ts`.
 *   3. El permiso se pide UNA vez, la primera vez que se empieza un
 *      entrenamiento, no al abrir la app. Si se deniega no se vuelve a
 *      preguntar; si después se concede en los ajustes del sistema, el aviso
 *      aparece solo en el siguiente entrenamiento.
 */
import type { PermissionState, PluginListenerHandle } from '@capacitor/core'
import { isNativeAndroid } from './platform'

export interface WorkoutNotice {
  /**
   * Desde cuándo cuenta el cronómetro, en milisegundos de época: el
   * `startedAt` de la sesión más su `pausedMs`. Es la misma cuenta que hace
   * el cronómetro de la app, así que los dos marcan lo mismo.
   */
  startedAt: number
  title: string
  body: string
  /**
   * Nombre y descripción del canal, los que se ven en Ajustes del sistema →
   * Notificaciones. Van en el idioma de la app, no en el del teléfono: con la
   * app en español nada de ella sale en inglés, y al revés. Opcionales: si no
   * llegan, el plugin usa los textos de los recursos de Android.
   */
  channelName?: string
  channelDescription?: string
}

interface WorkoutNotificationPlugin {
  start(options: WorkoutNotice): Promise<{ shown: boolean }>
  stop(): Promise<void>
  checkPermissions(): Promise<{ display: PermissionState }>
  requestPermissions(): Promise<{ display: PermissionState }>
  addListener(event: 'open', listener: () => void): Promise<PluginListenerHandle>
}

/** Se guarda en el dispositivo, no en la cuenta: el permiso es de este teléfono. */
const ASKED_KEY = 'training-os:workout-notification-asked'

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
  if (!isNativeAndroid()) return Promise.resolve(null)
  pluginPromise ??= import('@capacitor/core')
    .then(({ registerPlugin }) => ({ api: registerPlugin<WorkoutNotificationPlugin>('WorkoutNotification') }))
    .catch((err: unknown) => {
      console.warn('[training-os:native] no se pudo cargar el aviso de entrenamiento', err)
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

/**
 * Las llamadas van en fila. Un `start` puede quedarse esperando al diálogo de
 * permiso mientras la persona termina el entrenamiento; sin la fila, el `stop`
 * llegaría antes que el `start` y la notificación se quedaría en pantalla con
 * el entrenamiento ya guardado.
 */
let queue: Promise<void> = Promise.resolve()

function enqueue(task: (p: WorkoutNotificationPlugin) => Promise<void>): Promise<void> {
  queue = queue.then(async () => {
    try {
      const holder = await plugin()
      if (holder) await task(holder.api)
    } catch (err) {
      console.warn('[training-os:native] aviso de entrenamiento', err)
    }
  })
  return queue
}

async function permissionGranted(p: WorkoutNotificationPlugin): Promise<boolean> {
  let state = (await p.checkPermissions()).display
  if ((state === 'prompt' || state === 'prompt-with-rationale') && !alreadyAsked()) {
    // Se marca ANTES de preguntar: si la app se cierra con el diálogo
    // abierto, no se vuelve a preguntar al siguiente arranque.
    markAsked()
    state = (await p.requestPermissions()).display
  }
  return state === 'granted'
}

/**
 * Enseña el aviso, o lo actualiza si ya está. Se puede llamar tantas veces
 * como haga falta: es la misma notificación, y no vuelve a sonar ni a vibrar.
 */
export function showWorkoutNotice(notice: WorkoutNotice): Promise<void> {
  return enqueue(async (p) => {
    if (!(await permissionGranted(p))) return
    await p.start(notice)
  })
}

/** Lo retira. Sin aviso en pantalla, no hace nada. */
export function hideWorkoutNotice(): Promise<void> {
  return enqueue((p) => p.stop())
}

/**
 * Avisa cuando la persona toca la notificación. Si la app estaba cerrada, el
 * plugin guarda el toque hasta que haya alguien escuchando, así que también
 * llega en un arranque en frío.
 *
 * Devuelve la función para dejar de escuchar.
 */
export function onWorkoutNoticeTap(listener: () => void): () => void {
  let handle: PluginListenerHandle | null = null
  let cancelled = false
  void (async () => {
    try {
      const holder = await plugin()
      if (!holder || cancelled) return
      handle = await holder.api.addListener('open', listener)
      if (cancelled) release(handle)
    } catch (err) {
      console.warn('[training-os:native] no se pudo escuchar el aviso de entrenamiento', err)
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
    console.warn('[training-os:native] no se pudo dejar de escuchar el aviso', err)
  })
}
