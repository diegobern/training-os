import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { cx } from '../ui/primitives'
import { useApp } from '../../store/useApp'

const LogoTotem3D = lazy(() => import('./LogoTotem3D'))

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

/**
 * The mark as flat geometry. It is on screen from the very first paint, and on
 * anything that cannot run WebGL it is the whole hero.
 */
function FlatMark({ className }: { className?: string }) {
  return (
    <div className={cx('flex h-full w-full items-center justify-center', className)}>
      <span className="flex h-24 w-24 items-center justify-center rounded-[1.75rem] bg-brand shadow-lift">
        <svg viewBox="0 0 24 24" width="46" height="46" aria-hidden="true">
          <path d="M14.2 1.6 3.9 12.1h4.5L7.8 22.4 18.1 11.9h-4.5Z" className="fill-brand-ink" />
        </svg>
      </span>
    </div>
  )
}

/**
 * The hero object on the welcome screen.
 *
 * three.js weighs about 140KB gzipped, which on a phone-grade connection is
 * seconds. So the screen does not wait for it: the flat mark paints with the
 * rest of the page, at full strength, and the 3D object crossfades over it
 * once its first frame is genuinely on the canvas. There is never a moment
 * with no logo, and never a dimmed placeholder standing in for one.
 *
 * WebGL support is probed in the state initialiser rather than an effect —
 * from an effect the first committed render would have to guess, and it would
 * guess wrong for one frame on every device.
 */
export function LogoTotem({ className }: { className?: string }) {
  const animations = useApp((s) => s.settings.animations)
  const [supported] = useState(webglAvailable)
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  // Below this the object would crowd out the button this screen exists for,
  // so it is not merely hidden — it never mounts, and three.js is never
  // fetched on a phone that was not going to show it.
  const [tallEnough, setTallEnough] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-height: 700px)').matches,
  )
  const [live, setLive] = useState(false)
  const fading = useRef(false)

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const tall = window.matchMedia('(min-height: 700px)')
    const sync = () => {
      setReduced(motion.matches)
      setTallEnough(tall.matches)
    }
    sync()
    motion.addEventListener('change', sync)
    tall.addEventListener('change', sync)
    return () => {
      motion.removeEventListener('change', sync)
      tall.removeEventListener('change', sync)
    }
  }, [])

  if (!tallEnough) return null

  return (
    <div className={cx('relative w-full', className)}>
      {/* The glow lives in CSS rather than in a post-processing pass: same
          result on screen, none of the cost of a bloom render target. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[15rem] w-[15rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-2xl"
        style={{
          background:
            'radial-gradient(circle, rgb(var(--c-accent) / 0.22) 0%, rgb(var(--c-accent) / 0.07) 45%, transparent 70%)',
        }}
      />

      {/* Always mounted, underneath. It is what you see instantly, and it is
          still there behind the canvas afterwards — costing nothing, and
          covering the gap if a context is ever lost. */}
      <div
        className={cx(
          'absolute inset-0 transition-opacity duration-500',
          live ? 'opacity-0' : 'opacity-100',
        )}
      >
        <FlatMark />
      </div>

      {supported && (
        <div
          className={cx(
            'absolute inset-0 transition-opacity duration-500',
            live ? 'opacity-100' : 'opacity-0',
          )}
        >
          <Suspense fallback={null}>
            <LogoTotem3D
              still={reduced || !animations}
              className="h-full w-full"
              onReady={() => {
                if (fading.current) return
                fading.current = true
                setLive(true)
              }}
            />
          </Suspense>
        </div>
      )}
    </div>
  )
}
