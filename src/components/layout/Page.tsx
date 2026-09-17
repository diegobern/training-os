import { useEffect, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconChevronLeft } from '../ui/Icon'
import { IconButton, cx } from '../ui/primitives'

/**
 * One page frame for the whole app, so no screen invents its own margins.
 *
 * Layout, top to bottom:
 *   top bar      — back button and actions only, kept slim
 *   title block  — the page title, set well below the bar but close to the
 *                  content it introduces
 *   content
 *
 * The title used to live inside the bar, which made every screen open with a
 * small label pinned to the notch. Moving it down and scaling it up is what
 * gives each screen a beginning.
 *
 * It then lifts and fades as you scroll — see useTitleFade.
 */

/**
 * Lifts the title block and fades it out over the first stretch of scroll, so
 * the screen's name gives way to its content.
 *
 * Two things are deliberate:
 *
 * · It finishes early — 56px — so the title is already invisible by the time
 *   it would slide under the status bar. A big title cut in half by the clock
 *   is the failure mode this exists to avoid.
 * · It writes straight to the element's style inside a rAF instead of holding
 *   the position in state. A React render per scroll frame is what makes a
 *   list feel sticky on a phone, and nothing else on screen depends on this
 *   value.
 */
function useTitleFade() {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const apply = () => {
      raf = 0
      const p = Math.min(1, Math.max(0, window.scrollY / 56))
      // Eased so it starts disappearing immediately rather than lingering at
      // full strength and then vanishing all at once.
      const e = p * (2 - p)
      el.style.opacity = String(1 - e)
      el.style.transform = `translate3d(0, ${-16 * e}px, 0)`
      // An invisible block should not still be swallowing taps.
      el.style.pointerEvents = e > 0.9 ? 'none' : ''
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply)
    }
    apply()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return ref
}
export function Page({
  title,
  subtitle,
  back,
  actions,
  children,
  wide,
  noNavPadding,
  titleSlot,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  back?: boolean | string
  actions?: ReactNode
  children: ReactNode
  wide?: boolean
  noNavPadding?: boolean
  /** Replaces the plain title, e.g. with the Progress view selector. */
  titleSlot?: ReactNode
}) {
  const navigate = useNavigate()
  const hasBar = Boolean(back || actions)
  const titleRef = useTitleFade()

  return (
    <div className={cx('mx-auto w-full flex-1', wide ? 'max-w-4xl' : 'max-w-lg md:max-w-2xl')}>
      {hasBar && (
        <div
          className="sticky top-0 z-30 bg-bg/90 backdrop-blur-xl"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="flex h-12 items-center gap-1 px-2">
            {back ? (
              <IconButton
                label="Back"
                onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
              >
                <IconChevronLeft size={22} />
              </IconButton>
            ) : (
              <span className="h-11 w-1" />
            )}
            <div className="flex-1" />
            {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
          </div>
        </div>
      )}

      <div className={cx('px-5', noNavPadding ? 'pb-lg' : 'pb-28')}>
        {(title || titleSlot) && (
          <header
            ref={titleRef}
            className={cx('pb-md will-change-[opacity,transform]', hasBar ? 'pt-2' : 'pt-lg')}
            style={hasBar ? undefined : { paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)' }}
          >
            {titleSlot ?? <h1 className="text-page text-ink">{title}</h1>}
            {subtitle && <p className="mt-1.5 text-page-sub text-muted">{subtitle}</p>}
          </header>
        )}
        {children}
      </div>
    </div>
  )
}

/** Used inside a page for a heading that is not the page title. */
export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-md flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-card text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-secondary text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
