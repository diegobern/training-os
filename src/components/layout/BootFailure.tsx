import { useEffect, useState } from 'react'
import { Button } from '../ui/primitives'
import { IconAlert } from '../ui/Icon'
import { useT } from '../../store/useApp'

/**
 * Shown when the app could not start.
 *
 * It exists because the alternative is what shipped: a logo on screen with no
 * error, no console message and no way forward. A failure the user can see and
 * act on is worth more than a failure that looks like loading.
 *
 * What it deliberately does NOT do: touch the user's data. There is no "reset
 * app" button here and there must never be one. Every cause this screen covers
 * — a second tab holding the old database, a slow migration, a network that is
 * not there — is fixed by closing a tab or reloading. Clearing IndexedDB as a
 * generic recovery would destroy months of training to fix a tab conflict.
 */
export function BootFailure({
  code,
  detail,
  onRetry,
}: {
  /** A short machine-readable reason, shown so a bug report can name it. */
  code: string
  detail?: string | null
  onRetry: () => void
}) {
  const t = useT()
  const [retrying, setRetrying] = useState(false)

  // The commonest cause by far, and the only one with a specific instruction.
  const blocked = code.includes('BLOCKED')

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-7 text-center">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-warn/12">
            <IconAlert size={30} className="text-warn" />
          </span>
        </div>

        <h1 className="mt-lg text-page text-ink">{t('boot.failTitle')}</h1>
        <p className="mt-md text-page-sub text-muted">
          {blocked ? t('boot.blockedBody') : t('boot.failBody')}
        </p>

        <div className="mt-xl space-y-md">
          <Button
            full
            size="xl"
            variant="primary"
            disabled={retrying}
            onClick={() => {
              setRetrying(true)
              onRetry()
              // Re-enabled shortly: a retry that fails instantly must not
              // leave a permanently dead button.
              window.setTimeout(() => setRetrying(false), 2500)
            }}
          >
            {t('common.retry')}
          </Button>
          <Button full size="lg" variant="secondary" onClick={() => window.location.reload()}>
            {t('boot.reload')}
          </Button>
        </div>

        <p className="mt-lg select-all text-caption text-faint">
          {t('boot.code')}: {code}
          {detail ? ` · ${detail.slice(0, 80)}` : ''}
        </p>
      </div>
    </div>
  )
}

/**
 * Watches the boot and reports when it has taken too long.
 *
 * Separate from the database's own timeout on purpose: that one catches a
 * database that will not open, this one catches everything else — a dynamic
 * import that never resolves, an auth listener that never fires, a promise
 * chain with a missing branch. Any of those used to end in the same silent
 * logo screen.
 */
export function useBootWatchdog(active: boolean, ms = 12_000): boolean {
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    if (!active) {
      setExpired(false)
      return
    }
    const timer = window.setTimeout(() => setExpired(true), ms)
    return () => window.clearTimeout(timer)
  }, [active, ms])

  return expired
}
