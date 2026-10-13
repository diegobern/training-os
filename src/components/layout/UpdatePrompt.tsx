import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '../ui/primitives'
import { useT } from '../../store/useApp'
import { isNativeAndroid } from '../../lib/native/platform'

/**
 * Registering the service worker is what kicks off the precache, and the
 * precache competes for bandwidth with the screen the user is waiting for.
 * On a fast connection nobody notices; on a phone connection it is the
 * difference between the app appearing and the app eventually appearing.
 *
 * So the registration is held until the page has loaded and gone quiet. The
 * only thing this delays is caching for the *next* visit.
 */
function useAfterLoad(delay: number) {
  const [go, setGo] = useState(false)
  useEffect(() => {
    let timer = 0
    const arm = () => {
      timer = window.setTimeout(() => setGo(true), delay)
    }
    if (document.readyState === 'complete') arm()
    else window.addEventListener('load', arm, { once: true })
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('load', arm)
    }
  }, [delay])
  return go
}

export function UpdatePrompt() {
  const ready = useAfterLoad(2500)

  /*
   * Dentro de la app de Android NO se registra el service worker. A
   * propósito, y es importante entender por qué.
   *
   * En Capacitor la app se sirve desde `https://localhost` y los ficheros
   * salen del propio APK. Un service worker con precaché se quedaría con una
   * copia de esos ficheros en Cache Storage. Cuando Google Play instalara una
   * actualización, el APK traería ficheros nuevos **pero el service worker
   * seguiría sirviendo los viejos**, y con `registerType: 'prompt'` esperaría
   * a que el usuario pulsara un botón de "Actualizar" que quizá no vea nunca.
   * Resultado: una app actualizada que sigue ejecutando la versión anterior,
   * sin que nada falle de forma visible.
   *
   * Este proyecto ya se comió esa clase de fallo una vez en web, con la tira
   * de sprites del logotipo servida en CacheFirst bajo un nombre que no
   * cambiaba. No hay ninguna razón para volver a pasar por ahí.
   *
   * Y no se pierde nada: en Android el catálogo, las ilustraciones y el código
   * ya viajan dentro del APK, así que funciona sin conexión sin necesidad de
   * caché alguna. La web mantiene su PWA exactamente igual que hasta ahora.
   */
  if (isNativeAndroid()) return null

  // Montar el componente interno es lo que llama a useRegisterSW, así que
  // controlar el montaje es controlar el registro.
  return ready ? <UpdatePromptInner /> : null
}

function UpdatePromptInner() {
  const t = useT()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.warn('[training-os:sw] registration failed', error)
    },
  })

  if (!needRefresh) return null

  return (
    <div
      className="fixed inset-x-0 z-[55] mx-auto flex max-w-sm items-center gap-3 rounded-xl border border-line bg-elevated/95 px-3.5 py-2.5 shadow-lift backdrop-blur"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}
      role="status"
    >
      <span className="min-w-0 flex-1 text-sm font-medium text-ink">{t('status.updateAvailable')}</span>
      <Button size="sm" variant="primary" onClick={() => void updateServiceWorker(true)}>
        {t('status.update')}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
        {t('install.later')}
      </Button>
    </div>
  )
}
