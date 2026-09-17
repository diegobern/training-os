import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null

export function useInstallPrompt() {
  const [available, setAvailable] = useState(!!deferred)
  const [installed, setInstalled] = useState(
    typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true),
  )

  useEffect(() => {
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
  }, [])

  async function promptInstall() {
    if (!deferred) return false
    await deferred.prompt()
    const choice = await deferred.userChoice
    deferred = null
    setAvailable(false)
    return choice.outcome === 'accepted'
  }

  const isIOS =
    typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !('onbeforeinstallprompt' in window)

  return { available, installed, promptInstall, isIOS }
}
