import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '../ui/primitives'
import { useT } from '../../store/useApp'

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
  // Mounting the inner component is what calls useRegisterSW, so gating the
  // mount is what gates the registration.
  return useAfterLoad(2500) ? <UpdatePromptInner /> : null
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
