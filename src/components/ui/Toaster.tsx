import { createPortal } from 'react-dom'
import { useToast } from '../../store/useToast'
import { cx } from './primitives'
import { IconCheck, IconAlert, IconTrophy } from './Icon'

export function Toaster() {
  const toasts = useToast((s) => s.toasts)
  const dismiss = useToast((s) => s.dismiss)
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-3"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => {
            t.onAction?.()
            dismiss(t.id)
          }}
          className={cx(
            'anim-slide-down pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium shadow-lift backdrop-blur',
            t.tone === 'error'
              ? 'border-down/40 bg-down/15 text-down'
              : t.tone === 'success'
                ? 'border-up/40 bg-up/15 text-up'
                : t.tone === 'pr'
                  ? 'border-pr/40 bg-pr/15 text-pr'
                  : 'border-line bg-elevated/95 text-ink',
          )}
        >
          {t.tone === 'success' && <IconCheck size={16} />}
          {t.tone === 'error' && <IconAlert size={16} />}
          {t.tone === 'pr' && <IconTrophy size={16} />}
          <span className="min-w-0 flex-1">{t.message}</span>
          {t.actionLabel && <span className="shrink-0 text-xs font-bold uppercase tracking-wide opacity-80">{t.actionLabel}</span>}
        </button>
      ))}
    </div>,
    document.body,
  )
}
