import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useWorkout } from '../../store/useWorkout'
import { useT } from '../../store/useApp'
import { useElapsed } from '../../hooks/useElapsed'
import { fmtDuration } from '../../lib/format'
import { IconChevronRight } from '../ui/Icon'
import { BOTTOM_NAV_HEIGHT } from '../nav/BottomNav'

/**
 * Room the bar takes above the tab bar: 3rem of bar plus a 1.25rem gap — the
 * centre tile of the tab bar rises 1.25rem above it, and the bar must clear
 * that too, not just the bar's top border.
 *
 * Published on the root element as `--workout-bar-space` while the bar is on
 * screen, so the two things that also live at the bottom of the screen can
 * make room for it without importing this file: the update prompt lifts
 * itself by this much, and the spacer below lets the end of every page scroll
 * clear of the bar instead of hiding under it.
 */
export const WORKOUT_BAR_SPACE = '4.25rem'

/**
 * The workout clock, everywhere in the app while a session is open.
 *
 * Fixed just above the tab bar — never in the page flow, so scrolling cannot
 * move it or hide it — and gone the moment the session is finished or
 * discarded, because it renders straight from the workout store.
 *
 * Not on the session screen itself: there the tab bar is hidden, the rest
 * timer owns the bottom edge and the header already shows the same clock from
 * the same hook. Two clocks one above the other would only be noise.
 *
 * Bottom rather than top on purpose. The top of the screen already stacks the
 * sync and offline banners, the toasts and every page's own sticky bar, all of
 * them under the status-bar inset; one more fixed strip there would have
 * meant shifting each of them. Down here the only neighbour is the tab bar,
 * and its height is shared through BOTTOM_NAV_HEIGHT rather than copied.
 */
export function WorkoutTimerBar() {
  const session = useWorkout((s) => s.session)
  const { pathname } = useLocation()
  const visible = session !== null && !pathname.startsWith('/workout/active')

  useEffect(() => {
    if (!visible) return
    const root = document.documentElement
    root.style.setProperty('--workout-bar-space', WORKOUT_BAR_SPACE)
    return () => {
      root.style.removeProperty('--workout-bar-space')
    }
  }, [visible])

  if (!visible || !session) return null
  return <Bar dayName={session.dayName} startedAt={session.startedAt} pausedMs={session.pausedMs} />
}

function Bar({ dayName, startedAt, pausedMs }: { dayName: string; startedAt: number; pausedMs: number }) {
  const t = useT()
  // Mounted only while there is a session, so nothing ticks when there is not.
  const elapsed = fmtDuration(useElapsed(startedAt, pausedMs))

  return (
    <>
      {/* In the page flow, after the page: the last thing on every screen can
          scroll up past the bar instead of ending underneath it. */}
      <div aria-hidden="true" style={{ height: WORKOUT_BAR_SPACE }} />

      <div
        className="fixed inset-x-0 z-40 mx-auto max-w-lg"
        style={{
          bottom: `calc(${BOTTOM_NAV_HEIGHT} + 1.25rem)`,
          paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 0.75rem)',
          paddingRight: 'calc(env(safe-area-inset-right, 0px) + 0.75rem)',
        }}
      >
        <Link
          to="/workout/active"
          aria-label={t('workout.barAria', { time: elapsed })}
          className="press flex h-12 items-center gap-3 rounded-2xl border border-line bg-elevated/95 pl-2 pr-3 shadow-lift backdrop-blur-xl"
        >
          {/* The brand tile, the same bolt as the boot screen and the icon. */}
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-brand">
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path d="M14.2 1.6 3.9 12.1h4.5L7.8 22.4 18.1 11.9h-4.5Z" className="fill-brand-ink" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden="true" />
              <span className="label-xs truncate text-accent">{t('workout.barLabel')}</span>
            </span>
            <span className="block truncate text-secondary font-semibold leading-tight text-ink">{dayName}</span>
          </span>
          <span className="tnum text-xl font-bold leading-none tracking-tight text-ink" role="timer" aria-live="off">
            {elapsed}
          </span>
          <IconChevronRight size={18} className="shrink-0 text-faint" />
        </Link>
      </div>
    </>
  )
}
