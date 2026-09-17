import type { ReactNode } from 'react'
import { Button, cx } from '../ui/primitives'
import { IconCheck, IconChevronLeft } from '../ui/Icon'
import { useT } from '../../store/useApp'
import { TOTAL_STEPS } from '../../store/useOnboarding'

/**
 * The frame every onboarding step shares.
 *
 * Mobile-first and built around one rule: the primary action is always in the
 * same place, at the bottom, above the safe area, and it never moves when the
 * content above it grows. A questionnaire where "Next" jumps around is a
 * questionnaire people abandon.
 *
 * The content area scrolls on its own so a long list of equipment never
 * pushes the button off screen — which is the same mistake the welcome hero
 * made on a small phone.
 */
export function StepShell({
  step,
  title,
  subtitle,
  children,
  onBack,
  onNext,
  onSkip,
  nextLabel,
  nextDisabled,
  busy,
  note,
}: {
  step: number
  title: string
  subtitle?: string
  children: ReactNode
  onBack?: () => void
  onNext: () => void
  /** Present only on steps where every question is optional. */
  onSkip?: () => void
  nextLabel?: string
  nextDisabled?: boolean
  busy?: boolean
  note?: string
}) {
  const t = useT()

  return (
    <div className="flex h-dvh flex-col bg-bg">
      {/* Header: back, progress, and the bar. Fixed height so nothing below shifts. */}
      <div
        className="shrink-0 px-5"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      >
        <div className="flex h-11 items-center gap-2">
          {onBack ? (
            <button
              onClick={onBack}
              aria-label={t('ob.back')}
              className="press -ml-2 flex h-11 w-11 items-center justify-center rounded-full text-muted"
            >
              <IconChevronLeft size={22} />
            </button>
          ) : (
            <span className="h-11 w-9" />
          )}
          <span className="text-caption font-semibold tracking-wide text-faint">
            {t('ob.step', { n: step, total: TOTAL_STEPS })}
          </span>
          <div className="flex-1" />
          {onSkip && (
            <button onClick={onSkip} className="press -mr-2 px-2 py-2 text-secondary font-semibold text-muted">
              {t('ob.skip')}
            </button>
          )}
        </div>

        <div
          className="mt-1 h-1 w-full overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {/* The only part that scrolls. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-lg">
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-page text-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-page-sub text-muted">{subtitle}</p>}
          <div className="mt-xl space-y-lg">{children}</div>
        </div>
      </div>

      <div
        className="shrink-0 border-t border-line bg-bg px-5 pt-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
      >
        <div className="mx-auto w-full max-w-md">
          {note && <p className="mb-2 text-center text-caption text-faint">{note}</p>}
          <Button
            full
            size="xl"
            variant="primary"
            onClick={onNext}
            disabled={nextDisabled || busy}
            icon={step === TOTAL_STEPS ? <IconCheck size={18} /> : undefined}
          >
            {nextLabel ?? t('ob.next')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * A choice you tap, not a dropdown you open.
 *
 * Every option is visible at once, each with its own consequence spelled out
 * underneath. A select would hide the options behind an interaction and hide
 * the explanations entirely — and the explanation is the point: someone
 * choosing "Get stronger" should be able to see that it means heavy loads and
 * low reps before they commit to it.
 */
export function ChoiceCard({
  selected,
  onClick,
  label,
  hint,
  compact,
}: {
  selected: boolean
  onClick: () => void
  label: string
  hint?: string
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'press relative w-full rounded-2xl border text-left transition-colors',
        // 56px minimum, comfortably over the 44px touch target floor.
        compact ? 'min-h-[3.25rem] px-4 py-3' : 'min-h-[4rem] px-4 py-3.5',
        selected
          ? 'border-accent bg-accent/[0.08]'
          : 'border-line bg-surface hover:border-faint',
      )}
    >
      <span className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cx(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            selected ? 'border-accent bg-accent' : 'border-line',
          )}
        >
          {selected && <IconCheck size={12} className="text-brand-ink" strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cx('block text-card', selected ? 'text-ink' : 'text-ink')}>{label}</span>
          {hint && <span className="mt-0.5 block text-secondary text-muted">{hint}</span>}
        </span>
      </span>
    </button>
  )
}

/** A multi-select chip. Same target size rules as ChoiceCard. */
export function ChoiceChip({
  selected,
  onClick,
  label,
}: {
  selected: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        'press min-h-[2.75rem] rounded-full border px-4 py-2 text-secondary font-semibold transition-colors',
        selected ? 'border-accent bg-accent/[0.12] text-ink' : 'border-line bg-surface text-muted',
      )}
    >
      {label}
    </button>
  )
}

/**
 * The one-line answer to "why are you asking me this?".
 *
 * Every optional question carries one. It is not decoration — a questionnaire
 * that explains what it does with an answer gets better answers, and it is the
 * visible half of the rule that nothing is collected without a consumer.
 */
export function WhyNote({ children, optional }: { children: ReactNode; optional?: boolean }) {
  const t = useT()
  return (
    <p className="mt-2 text-caption text-faint">
      {optional && (
        <span className="mr-1.5 rounded bg-line px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide">
          {t('ob.optional')}
        </span>
      )}
      {children}
    </p>
  )
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <h2 className="text-card text-ink">{children}</h2>
}
