import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { IconBolt, IconChart, IconGrid, IconHome, IconRoutines } from '../ui/Icon'
import { cx } from '../ui/primitives'
import { useApp, useT } from '../../store/useApp'
import { haptic } from '../../lib/feedback'

const ITEMS = [
  { to: '/', key: 'nav.home', Icon: IconHome, end: true },
  { to: '/routines', key: 'nav.routines', Icon: IconRoutines, end: false },
  { to: '/workout', key: 'nav.workout', Icon: IconBolt, end: false, center: true },
  { to: '/progress', key: 'nav.progress', Icon: IconChart, end: false },
  { to: '/more', key: 'nav.more', Icon: IconGrid, end: false },
] as const


/**
 * The 3D mark in the middle of the tab bar.
 *
 * It is the real logo, rendered once by `e2e/bake-nav-sprite.mjs` and shipped
 * as an animated WebP rather than a live canvas — see that script for why a
 * permanent WebGL context in the tab bar was the wrong trade.
 *
 * A sprite strip scrubbed by a compositor transform — see `.nav-logo3d` in
 * index.css for why that beats both the twelve-frame flip-book it replaced and
 * the animated WebP that replaced that.
 *
 * The flat icon is the fallback and is rendered only if the image fails to
 * load. Drawing both and stacking them looked fine in a still and wrong in
 * motion: the green bolt showed through the tile's transparent corners as a
 * ghost that turned with it.
 */
function CenterMark({ Icon }: { Icon: (p: { size?: number; strokeWidth?: number }) => JSX.Element }) {
  const [failed, setFailed] = useState(false)
  const animations = useApp((s) => s.settings.animations)
  const [systemReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  if (failed) return <Icon size={24} strokeWidth={2} />

  // A different file rather than a stopped animation: a strip halted by CSS
  // freezes wherever it was, and 2 KB is also a kinder thing to send someone
  // who has asked for no motion than 174 KB of frames they will never see.
  const still = systemReduced || !animations

  return (
    <span className="nav-logo3d">
      <img
        className={still ? 'still' : 'spin'}
        src={still ? '/brand/nav-logo-still.webp' : '/brand/nav-logo.webp'}
        alt=""
        aria-hidden="true"
        width={144}
        height={still ? 144 : 13824}
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  )
}

export function BottomNav({ hasActiveSession }: { hasActiveSession: boolean }) {
  const t = useT()
  const { pathname } = useLocation()
  if (pathname.startsWith('/workout/active')) return null

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/92 backdrop-blur-xl"
      // The full home-indicator inset left a visible band of empty bar under
      // the labels. Trimming it drops the row closer to the edge of the screen
      // while still clearing the indicator itself.
      style={{ paddingBottom: 'max(0px, calc(env(safe-area-inset-bottom, 0px) - 0.9rem))' }}
      aria-label={t('nav.home')}
    >
      <ul className="mx-auto flex h-[4.25rem] max-w-lg items-stretch">
        {ITEMS.map(({ to, key, Icon, end, ...rest }) => {
          const center = 'center' in rest && rest.center
          return (
            <li key={to} className="flex flex-1 items-center justify-center">
              <NavLink
                to={to}
                end={end}
                onClick={() => haptic('tick')}
                className={({ isActive }) =>
                  cx(
                    'press relative flex w-full flex-col items-center justify-center gap-1 py-2 transition-colors',
                    isActive ? 'text-accent' : 'text-faint hover:text-muted',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {center ? (
                      <span
                        className={cx(
                          'relative -mt-5 flex h-13 w-13 items-center justify-center overflow-hidden rounded-2xl bg-brand text-brand-ink transition-all duration-200',
                          isActive || hasActiveSession ? 'shadow-glow' : 'shadow-card',
                        )}
                      >
                        <CenterMark Icon={Icon} />
                        {hasActiveSession && (
                          <span className="absolute -right-0.5 -top-0.5 z-10 h-2.5 w-2.5 rounded-full border-2 border-bg bg-pr" />
                        )}
                      </span>
                    ) : (
                      <Icon size={22} />
                    )}
                    <span className={cx('text-nav', center && '-mt-0.5')}>{t(key)}</span>
                  </>
                )}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
