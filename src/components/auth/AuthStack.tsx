import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from '../ui/primitives'

/** Must match the animation duration in index.css. */
const DURATION = 520

type Dir = 'up' | 'down'

/**
 * Holds the signed-out screens and pushes them vertically past one another.
 *
 * Two details matter here and neither is decoration:
 *
 * 1. The panes are rendered from a keyed array, not from two separate JSX
 *    slots. React then reconciles them by key, so the welcome screen keeps
 *    the same DOM node when it goes from "the only pane" to "the pane that
 *    is leaving" — and its WebGL context survives the transition instead of
 *    being torn down and rebuilt mid-flight.
 *
 * 2. The swap is committed in useLayoutEffect, not useEffect. With useEffect
 *    the browser gets one paint showing the new pane already at rest before
 *    the outgoing one is added, which reads as a flash. Layout effects run
 *    before that paint.
 */
export function AuthStack<K extends string>({
  view,
  depth,
  render,
}: {
  view: K
  /** How deep the screen is. Deeper pushes up; shallower comes back down. */
  depth: (view: K) => number
  render: (view: K) => ReactNode
}) {
  const [leaving, setLeaving] = useState<{ key: K; dir: Dir } | null>(null)
  const shown = useRef(view)
  // Read inside the effect only, so changing them cannot re-trigger it.
  const latest = useRef({ depth })
  latest.current = { depth }

  useLayoutEffect(() => {
    if (shown.current === view) return
    const from = shown.current
    shown.current = view
    setLeaving({ key: from, dir: latest.current.depth(view) > latest.current.depth(from) ? 'up' : 'down' })
    const id = window.setTimeout(() => setLeaving(null), DURATION)
    return () => window.clearTimeout(id)
  }, [view])

  const panes: { key: K; cls: string; hidden: boolean }[] = []
  if (leaving) panes.push({ key: leaving.key, cls: `auth-leave-${leaving.dir}`, hidden: true })
  panes.push({ key: view, cls: leaving ? `auth-enter-${leaving.dir}` : '', hidden: false })

  return (
    <div className="relative h-dvh overflow-hidden bg-bg">
      {panes.map((p) => (
        <div
          key={p.key}
          // `inert` keeps the outgoing pane out of the tab order for the half
          // second it is still on screen. React 18's types predate it.
          {...(p.hidden ? ({ inert: '' } as Record<string, string>) : {})}
          aria-hidden={p.hidden || undefined}
          className={cx('auth-pane bg-bg', p.cls, p.hidden && 'pointer-events-none')}
        >
          {render(p.key)}
        </div>
      ))}
    </div>
  )
}
