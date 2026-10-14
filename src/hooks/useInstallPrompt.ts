import { useEffect, useState } from 'react'
import { isNative } from '../lib/native/platform'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null

export function useInstallPrompt() {
  /*
   * Dentro de la app de Android o de iPhone ya está instalada: es una app de
   * la tienda, no una web. Sin esto, el WebView de iOS (que no es
   * `standalone` ni conoce `beforeinstallprompt`) enseñaría «En iPhone:
   * Compartir → Añadir a pantalla de inicio» dentro de la propia app.
   */
  const native = isNative()
  const [available, setAvailable] = useState(!native && !!deferred)
  const [installed, setInstalled] = useState(
    native ||
      (typeof window !== 'undefined' &&
        (window.matchMedia('(display-mode: standalone)').matches ||
          (navigator as unknown as { standalone?: boolean }).standalone === true)),
  )

  useEffect(() => {
    if (native) return
    const onPrompt = (e: Event) => {
      e.preventDefault()
      deferred = e as BeforeInstallPromptEvent
      setAvailable(true)
    }
    const onInstalled = () => {
      deferred = null
      setAvailable(false)
      setInstalled(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [native])

  async function promptInstall() {
    if (!deferred) return false
    await deferred.prompt()
    const choice = await deferred.userChoice
    deferred = null
    setAvailable(false)
    return choice.outcome === 'accepted'
  }

  const isIOS =
    !native &&
    typeof navigator !== 'undefined' &&
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !('onbeforeinstallprompt' in window)

  return { available, installed, promptInstall, isIOS }
}
