import type { ReactNode } from 'react'
import { cx } from '../ui/primitives'

/** The frame every signed-out screen shares: brand mark, title, content. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  back,
}: {
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  back?: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <div
        className="mx-auto flex w-full max-w-md flex-1 flex-col px-6"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}
      >
        <div className="flex h-11 items-center">{back}</div>

        <header className="pt-lg">
          <BrandMark />
          <h1 className="mt-lg text-page text-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-page-sub text-muted">{subtitle}</p>}
        </header>

        <div className="flex-1 pt-lg">{children}</div>

        {footer && (
          <div className="pb-8 pt-lg" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cx('flex items-center gap-2.5', className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M14.2 1.6 3.9 12.1h4.5L7.8 22.4 18.1 11.9h-4.5Z" className="fill-brand-ink" />
        </svg>
      </span>
      <span className="text-section text-muted">TRAINING OS</span>
    </div>
  )
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="mb-md rounded-xl border border-down/30 bg-down/10 px-3.5 py-2.5 text-secondary text-down"
    >
      {message}
    </p>
  )
}
