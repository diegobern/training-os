import { useEffect } from 'react'
import { useWorkout } from '../../store/useWorkout'
import { fmtTimer } from '../../lib/format'
import { IconButton, cx } from '../ui/primitives'
import { IconPause, IconPlay, IconRefresh, IconSkip } from '../ui/Icon'
import { useT } from '../../store/useApp'

export function RestTimerBar() {
  const rest = useWorkout((s) => s.rest)
  const tick = useWorkout((s) => s.tickRest)
  const adjust = useWorkout((s) => s.adjustRest)
  const togglePause = useWorkout((s) => s.toggleRestPause)
  const restart = useWorkout((s) => s.restartRest)
  const stop = useWorkout((s) => s.stopRest)
  const t = useT()

  useEffect(() => {
    if (!rest) return
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [rest, tick])

  if (!rest) return null

  const pct = Math.max(0, Math.min(1, rest.remaining / Math.max(1, rest.total)))
  const urgent = rest.remaining <= 10 && !rest.paused

  return (
    <div
      className="fixed inset-x-0 z-40 mx-auto max-w-lg px-3"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
      role="timer"
      aria-live="off"
    >
      <div
        className={cx(
          'relative overflow-hidden rounded-2xl border bg-elevated/95 shadow-lift backdrop-blur-xl transition-colors',
          urgent ? 'border-accent/60' : 'border-line',
        )}
      >
        <div
          className="absolute inset-y-0 left-0 bg-accent/12 transition-[width] duration-300 ease-linear"
          style={{ width: `${pct * 100}%` }}
        />
        <div className="relative flex items-center gap-1 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="label-xs">{t('workout.restTimer')}</p>
            <p className={cx('tnum text-2xl font-bold leading-none tracking-tight', urgent ? 'text-accent' : 'text-ink')}>
              {fmtTimer(rest.remaining)}
            </p>
          </div>
          <button
            onClick={() => adjust(-30)}
            className="press h-10 rounded-lg px-2.5 text-xs font-bold text-muted hover:text-ink"
          >
            {t('workout.minus30')}
          </button>
          <button
            onClick={() => adjust(30)}
            className="press h-10 rounded-lg px-2.5 text-xs font-bold text-muted hover:text-ink"
          >
            {t('workout.plus30')}
          </button>
          <IconButton label={t('workout.restart')} size="sm" onClick={restart}>
            <IconRefresh size={17} />
          </IconButton>
          <IconButton label={rest.paused ? t('workout.resume') : t('workout.pause')} size="sm" onClick={togglePause}>
            {rest.paused ? <IconPlay size={17} /> : <IconPause size={17} />}
          </IconButton>
          <IconButton label={t('workout.skip')} size="sm" tone="accent" onClick={stop}>
            <IconSkip size={17} />
          </IconButton>
        </div>
      </div>
    </div>
  )
}
