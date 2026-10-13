import { useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isNativeAndroid } from '../../lib/native/platform'
import { hideWorkoutNotice, onWorkoutNoticeTap, showWorkoutNotice } from '../../lib/native/workoutNotification'
import { dismissTop } from '../../lib/ui/dismissStack'
import { sessionProgress } from '../../lib/training/sessionProgress'
import { useWorkout } from '../../store/useWorkout'
import { useApp, useT } from '../../store/useApp'
import { toast } from '../../store/useToast'

/**
 * Lo que la aplicación necesita hacer sólo cuando corre dentro de la app de
 * Android. En el navegador este componente se monta, comprueba que no es
 * nativo y no hace nada más.
 *
 * No pinta nada: es sólo el sitio donde viven los efectos que necesitan a la
 * vez el router y los almacenes de estado.
 */
export function NativeShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const t = useT()

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
          navigate(-1)
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
          toast(t('native.pressBackAgain'))
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
    // `navigate` y `t` son estables entre renders de esta aplicación, pero se
    // declaran igualmente: si alguna vez dejaran de serlo, el oyente se
    // reinstalaría en vez de quedarse con una versión vieja.
  }, [navigate, t])

  /* ------------------------------------------- teclado y cambios de ruta */
  useEffect(() => {
    if (!isNativeAndroid()) return
    // Al cambiar de pantalla con el teclado abierto, Android lo deja abierto
    // sobre la pantalla nueva. Se cierra al navegar.
    void (async () => {
      try {
        const { Keyboard } = await import('@capacitor/keyboard')
        await Keyboard.hide()
      } catch {
        /* El teclado no estaba abierto, o el plugin no está: da igual. */
      }
    })()
  }, [location.pathname])

  /* ------------------------------- aviso de entrenamiento en curso */
  const session = useWorkout((s) => s.session)
  const loaded = useWorkout((s) => s.loaded)
  const excludeWarmups = useApp((s) => s.settings.excludeWarmupsFromStats)
  const notice = useMemo(() => {
    if (!session) return null
    const p = sessionProgress(session, excludeWarmups)
    return {
      // La misma cuenta que el cronómetro de la app (useElapsed): inicio más
      // lo que haya estado en pausa.
      startedAt: Math.round(session.startedAt + session.pausedMs),
      title: t('workout.notifTitle'),
      body: `${session.dayName} · ${t('workout.progress', { done: p.doneSets, total: p.totalSets })}`,
    }
  }, [session, excludeWarmups, t])

  useEffect(() => {
    if (!isNativeAndroid()) return
    // Hasta que no se ha leído la sesión guardada no se sabe si hay
    // entrenamiento; retirar el aviso antes de saberlo lo haría parpadear en
    // cada arranque.
    if (!loaded) return
    // Sin entrenamiento — terminado, descartado o que nunca lo hubo — el aviso
    // se retira. Con él, se publica o se actualiza: es la misma notificación.
    if (notice) void showWorkoutNotice(notice)
    else void hideWorkoutNotice()
  }, [loaded, notice?.startedAt, notice?.title, notice?.body])

  // React Router entrega un `navigate` nuevo en cada cambio de ruta. Pasarlo
  // por una referencia deja el oyente puesto una sola vez, en lugar de
  // quitarlo y volverlo a poner — dos llamadas al nativo — en cada pantalla.
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  useEffect(() => {
    if (!isNativeAndroid()) return
    // Tocar el aviso trae aquí. Si la app estaba cerrada, el toque llega en
    // cuanto el plugin tiene a alguien escuchando, antes incluso de que la
    // sesión se haya leído: por eso se navega siempre y es la propia pantalla
    // de la sesión la que manda a /workout si ya no hay ninguna.
    return onWorkoutNoticeTap(() => navigateRef.current('/workout/active'))
  }, [])

  return null
}
