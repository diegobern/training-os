import { useState } from 'react'
import type { ExerciseInsight } from '../../lib/training/overload'
import { useApp, useT } from '../../store/useApp'
import { fmtWeight, trimNum } from '../../lib/format'
import { IconAlert, IconArrowDown, IconArrowUp, IconInfo, IconTarget } from '../ui/Icon'
import { cx } from '../ui/primitives'

export function TrendBadge({ insight }: { insight: ExerciseInsight }) {
  const t = useT()
  const { trend, trendDeltaPct } = insight
  if (trend === 'insufficient') return null
  const tone =
    trend === 'progressing'
      ? 'text-up bg-up/10 border-up/30'
      : trend === 'lower'
        ? 'text-down bg-down/10 border-down/30'
        : 'text-muted bg-elevated border-line'
  const Arrow = trend === 'progressing' ? IconArrowUp : trend === 'lower' ? IconArrowDown : null
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-bold tracking-wide', tone)}>
      {Arrow ? <Arrow size={11} /> : <span className="text-caption leading-none">→</span>}
      {t(`progress.trend.${trend}`)}
      {trendDeltaPct !== null && Math.abs(trendDeltaPct) >= 0.5 && (
        <span className="tnum opacity-80">{trendDeltaPct > 0 ? '+' : ''}{trendDeltaPct.toFixed(1)}%</span>
      )}
    </span>
  )
}

export function TargetCard({ insight, compact }: { insight: ExerciseInsight; compact?: boolean }) {
  const t = useT()
  const units = useApp((s) => s.settings.units)
  const [showWhy, setShowWhy] = useState(false)
  const { suggestion, plateau } = insight

  const hasTarget = suggestion.weight !== null && suggestion.reps !== null

  return (
    <div className="card overflow-hidden">
      <div className="flex items-start gap-3 px-3.5 py-3">
        <IconTarget size={18} className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="label-xs text-accent">{t('workout.target')}</p>
          {hasTarget ? (
            <p className="tnum mt-1 text-xl font-bold leading-none tracking-tight">
              {fmtWeight(suggestion.weight as number, units, false)} {units} × {suggestion.reps}
            </p>
          ) : (
            <p className="mt-1 text-sm font-semibold text-muted">{t('common.notEnoughData')}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-line bg-elevated px-2 py-0.5 text-2xs font-bold tracking-wide text-muted">
              {t(`coach.kind.${suggestion.kind}`)}
            </span>
            {!compact && <TrendBadge insight={insight} />}
          </div>
          {suggestion.lastWeight !== null && (
            <p className="tnum mt-1.5 text-xs text-faint">
              {t('workout.lastTime')}: {fmtWeight(suggestion.lastWeight, units, false)} {units} × {suggestion.lastReps}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowWhy((v) => !v)}
          className="press flex shrink-0 items-center gap-1 rounded-lg border border-line px-2 py-1 text-2xs font-bold tracking-wide text-muted"
          aria-expanded={showWhy}
        >
          <IconInfo size={12} /> {t('workout.why')}
        </button>
      </div>

      {showWhy && (
        <div className="animate-fade-up border-t border-line bg-elevated/50 px-3.5 py-3">
          <p className="text-secondary text-muted">
            {t(suggestion.reasonKey, suggestion.reasonParams)}
          </p>
          <p className="mt-2 text-caption uppercase tracking-wide text-faint">{t('coach.suggestionLabel')}</p>
        </div>
      )}

      {plateau && (
        <div className="border-t border-warn/25 bg-warn/[0.07] px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-caption font-bold tracking-wide text-warn">
            <IconAlert size={13} /> {t('coach.plateau')}
          </p>
          <p className="tnum mt-1 text-secondary text-muted">
            {t('coach.plateauBody', {
              weight: `${trimNum(plateau.weight)} ${units === 'kg' ? 'kg' : 'kg'}`,
              reps: plateau.reps,
              sessions: plateau.sessions,
            })}
          </p>
          <ul className="mt-2 space-y-1 text-caption leading-relaxed text-muted">
            <li>· {t('coach.plateauIdea1')}</li>
            <li>· {t('coach.plateauIdea2')}</li>
            <li>· {t('coach.plateauIdea3')}</li>
            <li>· {t('coach.plateauIdea4')}</li>
          </ul>
          <p className="mt-2 text-caption text-faint">{t('coach.plateauDisclaimer')}</p>
        </div>
      )}
    </div>
  )
}
