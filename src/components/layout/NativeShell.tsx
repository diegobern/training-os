import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isNativeAndroid } from '../../lib/native/platform'
import { dismissTop } from '../../lib/ui/dismissStack'
import { useWorkout } from '../../store/useWorkout'
import { useT } from '../../store/useApp'
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

  return null
}
