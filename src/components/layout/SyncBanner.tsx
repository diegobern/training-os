import { useSyncStatus } from '../../store/useSync'
import { useT } from '../../store/useApp'
import { syncNow } from '../../lib/sync/engine'
import { IconAlert, IconCheck, IconOffline, IconRefresh } from '../ui/Icon'
import { cx } from '../ui/primitives'
import { useEffect, useState } from 'react'

/**
 * A thin strip that only appears when there is something honest to say:
 * data being restored, changes queued offline, or a sync that failed.
 * "Synced" shows briefly and then gets out of the way.
 */
export function SyncBanner() {
  const t = useT()
  const status = useSyncStatus()
  const [showSynced, setShowSynced] = useState(false)

  useEffect(() => {
    if (status.phase !== 'synced') return
    setShowSynced(true)
    const id = window.setTimeout(() => setShowSynced(false), 2000)
    return () => window.clearTimeout(id)
  }, [status.phase, status.lastSyncedAt])

  const visible =
    status.phase === 'restoring' ||
    status.phase === 'error' ||
    (status.phase === 'syncing' && status.pending > 0) ||
    (status.phase === 'offline' && status.pending > 0) ||
    (status.phase === 'synced' && showSynced)

  if (!visible) return null

  const tone =
    status.phase === 'error'
      ? 'bg-down/12 text-down'
      : status.phase === 'offline'
        ? 'bg-warn/12 text-warn'
        : status.phase === 'synced'
          ? 'bg-up/12 text-up'
          : 'bg-accent/12 text-accent'

  return (
    <div
      className={cx(
        'sticky top-0 z-40 flex items-center justify-center gap-2 px-3 py-1.5 text-caption font-semibold',
        tone,
      )}
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.375rem)' }}
      role="status"
      aria-live="polite"
    >
      {status.phase === 'restoring' && (
        <>
          <IconRefresh size={13} className="animate-spin" />
          {t('sync.restoring')}
          {status.restoreTotal > 0 && (
            <span className="tnum opacity-80">
              {t('sync.restoringOf', { done: status.restoreDone, total: status.restoreTotal })}
            </span>
          )}
        </>
      )}
      {status.phase === 'syncing' && status.pending > 0 && (
        <>
          <IconRefresh size={13} className="animate-spin" />
          {t('sync.syncing')} <span className="tnum opacity-80">{t('sync.pending', { n: status.pending })}</span>
        </>
      )}
      {status.phase === 'offline' && status.pending > 0 && (
        <>
          <IconOffline size={13} />
          {t('sync.offlineQueued', { n: status.pending })}
        </>
      )}
      {status.phase === 'synced' && showSynced && (
        <>
          <IconCheck size={13} />
          {t('sync.synced')}
        </>
      )}
      {status.phase === 'error' && (
        <>
          <IconAlert size={13} />
          {t('sync.error')}
          <button onClick={() => void syncNow()} className="underline underline-offset-2">
            {t('sync.retry')}
          </button>
        </>
      )}
    </div>
  )
}
