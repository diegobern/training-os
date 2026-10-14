import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isNative, isNativeAndroid, isNativeIOS } from '../../lib/native/platform'
import {
  cancelRestAlert,
  hasDisplayPermission,
  hideWorkoutPresence,
  isSupported,
  onWorkoutNoticeTap,
  requestExactAlarm,
  scheduleRestAlert,
  showWorkoutPresence,
  type RestAlert,
  type WorkoutTap,
} from '../../lib/native/workoutNotification'
import {
  buildWorkoutPresence,
  desiredRestAlert,
  presenceKey,
  restAlertTransition,
  routeForWorkoutTap,
} from '../../lib/native/workoutPresence'
import { dismissTop, hasDismissable } from '../../lib/ui/dismissStack'
import { getExercisesByIds } from '../../lib/db/repo.exercises'
import { getSession } from '../../lib/db/repo.sessions'
import type { Exercise } from '../../lib/db/schema'
import { useWorkout } from '../../store/useWorkout'
import { useAuth } from '../../store/useAuth'
import { useApp, useT } from '../../store/useApp'
import { toast } from '../../store/useToast'
import { ExactAlarmSheet } from '../native/ExactAlarmSheet'

/** Se guarda en el dispositivo: la hoja de la alarma exacta sale una sola vez. */
const EXACT_ALARM_ASKED_KEY = 'training-os:exact-alarm-asked'

function exactAlarmAsked(): boolean {
  try {
    return localStorage.getItem(EXACT_ALARM_ASKED_KEY) === '1'
  } catch {
    // Sin localStorage, mejor no insistir en cada descanso.
    return true
  }
}

function markExactAlarmAsked(): void {
  try {
    localStorage.setItem(EXACT_ALARM_ASKED_KEY, '1')
  } catch {
    /* Ver exactAlarmAsked. */
  }
}

/** Qué es un id de sesión en la base de datos de ESTE dispositivo. */
async function lookupSession(id: string): Promise<'completed' | 'other' | null> {
  const s = await getSession(id)
  if (!s) return null
  return s.status === 'completed' ? 'completed' : 'other'
}

/**
 * Lo que la aplicación necesita hacer sólo cuando corre dentro de la app de
 * Android o de iPhone. En el navegador este componente se monta, comprueba
 * que no es nativo y no hace nada más.
 *
 * No pinta nada salvo, en Android, la hoja que explica el permiso de alarma
 * exacta: es sólo el sitio donde viven los efectos que necesitan a la vez el
 * router y los almacenes de estado.
 *
 * La presencia del entrenamiento (notificación / Live Activity) y el aviso de
 * descanso se aplican de forma declarativa: en cada render se calcula lo que
 * DEBERÍA verse y se compara con lo último que se mandó. Ver
 * docs/NATIVE-CONTRACT.md, «JavaScript: quién llama a qué».
 */
export function NativeShell() {
  const native = isNative()
  const android = isNativeAndroid()
  const navigate = useNavigate()
  const location = useLocation()
  const t = useT()

  // React Router entrega un `navigate` nuevo en cada cambio de ruta. Pasarlo
  // por una referencia deja los oyentes puestos una sola vez, en lugar de
  // quitarlos y volverlos a poner — dos llamadas al nativo — en cada pantalla.
  // `t` va igual: el oyente lee siempre el idioma de ahora.
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const tRef = useRef(t)
  tRef.current = t

  /* ---------------------------------------------------- botón atrás físico */
  useEffect(() => {
    if (!isNativeAndroid()) return

    let cancelled = false
    let remove: (() => void) | null = null
    let exitArmedUntil = 0

    void (async () => {
      try {
        await installBackButton()
      } catch (err) {
        // Sin el puente nativo no hay botón físico que escuchar. Pasa en las
        // pruebas y pasaría si el plugin fallara al cargar; en ninguno de los
        // dos casos es motivo para tumbar la aplicación entera con una
        // promesa rechazada sin capturar.
        console.warn('[training-os:native] no se pudo instalar el botón atrás', err)
      }
    })()

    async function installBackButton() {
      const { App } = await import('@capacitor/app')

      const handle = await App.addListener('backButton', ({ canGoBack }) => {
        /*
         * El orden importa y es el que espera cualquiera que use Android:
         *
         * 1. Si hay algo abierto encima — una hoja, un diálogo de confirmar —
         *    atrás lo cierra. Sólo lo de más arriba, uno por pulsación.
         */
        if (dismissTop()) return

        /*
         * 2. Si hay a dónde volver dentro de la app, se vuelve. `canGoBack` lo
         *    calcula el propio WebView sobre su historial, que es el mismo que
         *    maneja React Router.
         */
        if (canGoBack) {
          navigateRef.current(-1)
          return
        }

        /*
         * 3. Ya en la raíz, atrás sale de la aplicación. Con una excepción: si
         *    hay un entrenamiento en marcha, la primera pulsación sólo avisa.
         *    Salir por error a mitad de una serie es perder el hilo de lo que
         *    estabas haciendo, y basta rozar el borde de la pantalla.
         *
         *    El entrenamiento NO se perdería — vive en IndexedDB y se
         *    recupera al volver a abrir — pero el susto es real y evitarlo
         *    cuesta una línea.
         */
        const training = useWorkout.getState().session !== null
        if (training && Date.now() > exitArmedUntil) {
          exitArmedUntil = Date.now() + 2000
          toast(tRef.current('native.pressBackAgain'))
          return
        }

        void App.exitApp()
      })

      if (cancelled) void handle.remove()
      else remove = () => void handle.remove()
    }

    return () => {
      cancelled = true
      remove?.()
    }
    // Se instala UNA vez: `navigate` y `t` se leen por referencia. Antes
    // dependía de [navigate, t] y se quitaba y volvía a poner en cada pantalla.
  }, [])

  /* ------------------------------------------- iOS: barra del teclado */
  useEffect(() => {
    if (!isNativeIOS()) return
    // La barra de accesorios (flechas y «OK») encima del teclado: sin ella,
    // en un campo numérico de iPhone no hay forma de cerrar el teclado.
    void (async () => {
      try {
        const { Keyboard } = await import('@capacitor/keyboard')
        await Keyboard.setAccessoryBarVisible({ isVisible: true })
      } catch {
        /* Sin plugin, el teclado de siempre. */
      }
    })()
  }, [])

  /* ------------------------------------- iOS: deslizar para volver */
  /*
   * En iPhone «atrás» es el gesto de deslizar desde el borde, y el WebView lo
   * convierte en un `history.back()`. Con una hoja abierta eso navegaría a la
   * pantalla anterior con la hoja todavía encima. Lo correcto — lo mismo que
   * hace el botón atrás de Android — es cerrar la hoja y quedarse donde se
   * estaba.
   *
   * El oyente se pone en fase de captura y en un `useLayoutEffect`: los de
   * los hijos corren antes que el de `BrowserRouter`, así que este va primero
   * con cualquier orden de oyentes, y `stopImmediatePropagation` impide que
   * React Router llegue a enterarse del paso atrás. Después se repone la
   * entrada del historial en la que se estaba, con su estado.
   */
  const hereRef = useRef<{ state: unknown; url: string } | null>(null)
  useEffect(() => {
    if (!isNativeIOS()) return
    hereRef.current = {
      state: window.history.state as unknown,
      url: location.pathname + location.search + location.hash,
    }
  }, [location])

  useLayoutEffect(() => {
    if (!isNativeIOS()) return
    const onPop = (e: PopStateEvent) => {
      const here = hereRef.current
      if (!here || !hasDismissable()) return
      e.stopImmediatePropagation()
      window.history.pushState(here.state, '', here.url)
      dismissTop()
    }
    window.addEventListener('popstate', onPop, true)
    return () => window.removeEventListener('popstate', onPop, true)
  }, [])

  /* ------------------------------------------- teclado y cambios de ruta */
  useEffect(() => {
    if (!isNative()) return
    // Al cambiar de pantalla con el teclado abierto, el sistema lo deja
    // abierto sobre la pantalla nueva. Se cierra al navegar.
    void (async () => {
      try {
        const { Keyboard } = await import('@capacitor/keyboard')
        await Keyboard.hide()
      } catch {
        /* El teclado no estaba abierto, o el plugin no está: da igual. */
      }
    })()
  }, [location.pathname])

  /* ---------------------------------- entrenamiento en curso: el estado */
  const phase = useAuth((s) => s.phase)
  const session = useWorkout((s) => s.session)
  const loaded = useWorkout((s) => s.loaded)
  const rest = useWorkout((s) => s.rest)
  const currentIndex = useWorkout((s) => s.currentIndex)
  const language = useApp((s) => s.settings.language)
  const excludeWarmups = useApp((s) => s.settings.excludeWarmupsFromStats)
  const sounds = useApp((s) => s.settings.sounds)
  const restSound = useApp((s) => s.settings.restSound)
  const haptics = useApp((s) => s.settings.haptics)
  const restVibrate = useApp((s) => s.settings.restVibrate)

  /*
   * Hasta que no se ha leído la sesión guardada y se sabe quién es el dueño,
   * no se sabe si hay entrenamiento: tocar la presencia antes la haría
   * parpadear (o, en iOS, terminar y volver a crear la Live Activity) en cada
   * arranque. Mientras tanto no se manda nada. Decidido eso, la regla es la
   * del contrato: presencia sólo con fase 'ready' o 'local-only' y sesión; en
   * cualquier otro caso, `stop`.
   */
  const settled = loaded && phase !== 'checking'
  const phaseOk = phase === 'ready' || phase === 'local-only'
  const wanted = native && settled && phaseOk && session !== null

  // La sesión guarda cada ejercicio con el nombre del día en que se añadió;
  // el sistema lo enseña en el idioma de ahora, como la pantalla de la sesión.
  const exerciseIds = session?.exercises.map((e) => e.exerciseId).join('|') ?? ''
  const namesKey = `${language}|${exerciseIds}`
  const [names, setNames] = useState<{ key: string; map: Map<string, Exercise> | undefined }>({
    key: '',
    map: undefined,
  })
  useEffect(() => {
    if (!native || !exerciseIds) return
    let alive = true
    const settle = (map: Map<string, Exercise> | undefined) => {
      if (alive) setNames((prev) => (prev.key === namesKey ? prev : { key: namesKey, map: map ?? prev.map }))
    }
    getExercisesByIds(exerciseIds.split('|')).then(
      (map) => {
        if (alive) setNames({ key: namesKey, map })
      },
      (err: unknown) => {
        console.warn('[training-os:native] no se pudieron traducir los ejercicios', err)
        settle(undefined)
      },
    )
    // Una base de datos que no contesta no puede dejar el aviso congelado:
    // pasado un momento se publica con los nombres que haya.
    const fallback = window.setTimeout(() => settle(undefined), 1500)
    return () => {
      alive = false
      window.clearTimeout(fallback)
    }
  }, [native, namesKey, exerciseIds])
  const namesReady = exerciseIds === '' || names.key === namesKey

  /*
   * Mientras se traducen los nombres (al empezar, al añadir un ejercicio, al
   * cambiar de idioma) se espera: mejor un instante tarde que publicar un
   * nombre en el otro idioma.
   */
  const holding = !settled || (wanted && !namesReady)

  // El descanso que acaba con la app en otra pantalla (o sin nadie que lo
  // vigile) también tiene que salir de la presencia a su hora.
  const [restClock, setRestClock] = useState(0)
  const restEndsAt = rest && !rest.paused ? rest.endsAt : null
  useEffect(() => {
    if (!native || restEndsAt === null) return
    const wait = restEndsAt - Date.now()
    if (wait <= 0) return
    const timer = window.setTimeout(() => setRestClock((n) => n + 1), wait + 50)
    return () => window.clearTimeout(timer)
  }, [native, restEndsAt])

  const presence = useMemo(
    () =>
      wanted && session
        ? buildWorkoutPresence({
            session,
            rest,
            currentIndex,
            exerciseNameById: names.map,
            t,
            language,
            excludeWarmups,
            now: Date.now(),
            android,
          })
        : null,
    // `restClock` no se lee: está para recalcular cuando vence el descanso.
    [wanted, session, rest, currentIndex, names.map, t, language, excludeWarmups, android, restClock],
  )

  const desiredAlert = useMemo(
    () =>
      presence && session
        ? desiredRestAlert({
            session,
            rest,
            now: Date.now(),
            t,
            settings: { sounds, restSound, haptics, restVibrate },
            exerciseName: presence.exerciseName,
            android,
          })
        : null,
    [presence, session, rest, t, sounds, restSound, haptics, restVibrate, android],
  )

  // Las claves deciden cuándo se llama al nativo; los objetos viajan por
  // referencia. Teclear un peso cambia la sesión, pero no la clave.
  const key = presence ? presenceKey(presence) : null
  const alertKey = desiredAlert ? JSON.stringify(desiredAlert) : null
  const presenceRef = useRef(presence)
  presenceRef.current = presence
  const alertRef = useRef(desiredAlert)
  alertRef.current = desiredAlert
  /** El último aviso programado (o `null`), para saber si toca cancelar. */
  const lastAlertRef = useRef<RestAlert | null>(null)

  /* ---------------------------- entrenamiento en curso: la presencia */
  useEffect(() => {
    if (!native || holding) return
    const next = presenceRef.current
    if (key !== null && next) {
      void showWorkoutPresence(next)
    } else {
      // Sin presencia no hay aviso de descanso: `stop` también cancela el
      // pendiente y retira el ya entregado, y es el último mensaje.
      lastAlertRef.current = null
      void hideWorkoutPresence()
    }
  }, [native, holding, key])

  /* ----------------------------- entrenamiento en curso: el descanso */
  useEffect(() => {
    if (!native || holding || key === null) return
    const prev = lastAlertRef.current
    const next = alertRef.current
    const action = restAlertTransition(prev, next, Date.now())
    lastAlertRef.current = next
    if (action === 'schedule' && next) {
      void scheduleRestAlert(next)
      // Un descanso que empieza (no uno que se ajusta): el momento de ofrecer
      // la alarma exacta en Android, si hace falta.
      if (prev === null) offerExactAlarm()
    } else if (action === 'cancel') {
      void cancelRestAlert()
    }
    // `offerExactAlarm` no va en las dependencias: sólo usa referencias y
    // setters estables. Los objetos se leen de sus referencias; las claves
    // dicen cuándo han cambiado.
  }, [native, holding, key, alertKey])

  /* ------------------------------------- Android: alarma exacta */
  const [exactSheet, setExactSheet] = useState(false)
  const exactCheckRef = useRef(false)

  /*
   * La primera vez que empieza un descanso sin permiso de alarma exacta (y
   * con el de notificaciones concedido) se explica y se ofrece ir a Ajustes.
   * Nunca bloquea: el aviso ya se ha programado aproximado. Una sola vez por
   * dispositivo, y se apunta ANTES de enseñarla.
   */
  function offerExactAlarm() {
    if (!isNativeAndroid() || exactCheckRef.current || exactAlarmAsked()) return
    exactCheckRef.current = true
    void (async () => {
      try {
        const support = await isSupported()
        if (!support || support.exactAlarms) return
        if ((await hasDisplayPermission()) !== true) return
        if (exactAlarmAsked()) return
        markExactAlarmAsked()
        setExactSheet(true)
      } finally {
        exactCheckRef.current = false
      }
    })()
  }

  function allowExactAlarm() {
    setExactSheet(false)
    void (async () => {
      // Contesta cuando la persona vuelve de Ajustes.
      const result = await requestExactAlarm()
      if (!result?.exactAlarms) return
      // Concedido: el descanso en curso se reprograma, ahora exacto.
      const current = alertRef.current
      if (current && current.at > Date.now() + 500) {
        lastAlertRef.current = current
        void scheduleRestAlert(current)
      }
    })()
  }

  /* ---------------------------------- tocar el aviso o la Live Activity */
  /*
   * Si la app estaba cerrada, el toque llega en cuanto el plugin tiene a
   * alguien escuchando, antes incluso de que la sesión se haya leído o de
   * saber quién ha entrado. Se guarda hasta entonces y sólo después se decide
   * adónde ir (`routeForWorkoutTap`).
   */
  const pendingTapRef = useRef<WorkoutTap | null>(null)
  const [tapSeq, setTapSeq] = useState(0)

  useEffect(() => {
    if (!isNative()) return
    return onWorkoutNoticeTap((tap) => {
      pendingTapRef.current = tap
      setTapSeq((n) => n + 1)
    })
  }, [])

  useEffect(() => {
    if (!native || !settled || !phaseOk) return
    const tap = pendingTapRef.current
    if (!tap) return
    pendingTapRef.current = null
    const activeId = useWorkout.getState().session?.id ?? null
    void routeForWorkoutTap(tap.sessionId, activeId, lookupSession).then((route) => {
      if (window.location.pathname !== route) navigateRef.current(route)
    })
  }, [native, settled, phaseOk, tapSeq])

  if (!android) return null
  return <ExactAlarmSheet open={exactSheet} onAllow={allowExactAlarm} onLater={() => setExactSheet(false)} />
}
