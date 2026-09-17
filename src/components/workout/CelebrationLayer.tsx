import { useEffect, useMemo } from 'react'
import { useWorkout } from '../../store/useWorkout'
import { useApp } from '../../store/useApp'
import { fmtWeight, trimNum } from '../../lib/format'
import { IconArrowUp, IconTrophy } from '../ui/Icon'
import { useCountUp } from '../../hooks/useCountUp'
import { animationsOn } from '../../lib/feedback'

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        id: i,
        dx: `${(Math.random() - 0.5) * 260}px`,
        dy: `${-60 - Math.random() * 180}px`,
        rot: `${(Math.random() - 0.5) * 540}deg`,
        delay: `${Math.random() * 90}ms`,
        color: i % 3 === 0 ? 'rgb(var(--c-pr))' : i % 3 === 1 ? 'rgb(var(--c-accent))' : 'rgb(var(--c-ink))',
        size: 4 + Math.random() * 4,
      })),
    [],
  )
  if (!animationsOn()) return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute left-1/2 top-1/2 rounded-[1px]"
          style={{
            width: p.size,
            height: p.size * 2.2,
            background: p.color,
            ['--dx' as string]: p.dx,
            ['--dy' as string]: p.dy,
            ['--rot' as string]: p.rot,
            animation: `to-confetti 1100ms cubic-bezier(0.16,1,0.3,1) ${p.delay} both`,
          }}
        />
      ))}
    </div>
  )
}

function PRCard({ name, headline, delta }: { name: string; headline: string; delta: string | null }) {
  return (
    <div className="anim-pop anim-pr-glow relative flex flex-col items-center gap-1 rounded-3xl border border-pr/40 bg-elevated/95 px-8 py-6 text-center shadow-lift backdrop-blur-xl">
      <Confetti />
      <span className="absolute inset-0 -z-10 rounded-3xl bg-pr/5" />
      <IconTrophy size={26} className="text-pr" />
      <p className="mt-1 text-xs font-bold tracking-[0.18em] text-pr">NEW PR</p>
      <p className="max-w-[16rem] text-sm font-semibold leading-tight text-muted">{name}</p>
      <p className="tnum mt-1 text-3xl font-bold leading-none tracking-tight text-ink">{headline}</p>
      {delta && (
        <p className="tnum mt-1.5 flex items-center gap-1 text-sm font-bold text-up">
          <IconArrowUp size={15} /> {delta}
        </p>
      )}
    </div>
  )
}

function WeightUpBadge({ from, to, units }: { from: number; to: number; units: 'kg' | 'lb' }) {
  const shown = useCountUp(from, to, 520)
  return (
    <div className="anim-pop anim-glow flex items-center gap-3 rounded-2xl border border-accent/40 bg-elevated/95 px-5 py-3 shadow-lift backdrop-blur-xl">
      <IconArrowUp size={18} className="text-accent" />
      <div>
        <p className="text-2xs font-bold tracking-[0.16em] text-accent">WEIGHT UP</p>
        <p className="tnum text-xl font-bold leading-tight tracking-tight text-ink">
          {fmtWeight(shown, units)}
        </p>
      </div>
      <p className="tnum text-sm font-bold text-up">+{trimNum(to - from)}</p>
    </div>
  )
}

/**
 * Celebrations sit above the workout but never block it: the layer is
 * pointer-transparent and dismisses itself.
 */
export function CelebrationLayer() {
  const celebration = useWorkout((s) => s.celebration)
  const dismiss = useWorkout((s) => s.dismissCelebration)
  const units = useApp((s) => s.settings.units)

  useEffect(() => {
    if (!celebration) return
    const ms = celebration.kind === 'pr' ? 2100 : 1100
    const id = window.setTimeout(dismiss, ms)
    return () => window.clearTimeout(id)
  }, [celebration, dismiss])

  if (!celebration) return null

  if (celebration.kind === 'weight-up') {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[58] flex justify-center px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 4.5rem)' }}>
        <WeightUpBadge from={celebration.from} to={celebration.to} units={units} />
      </div>
    )
  }

  const pr = celebration.pr
  const headline =
    pr.type === 'volume'
      ? fmtWeight(pr.value, units)
      : pr.type === 'e1rm'
        ? `${fmtWeight(pr.value, units)} e1RM`
        : `${fmtWeight(pr.weight ?? 0, units, false)} ${units} × ${pr.reps ?? 0}`
  const delta =
    pr.delta === null
      ? null
      : pr.type === 'reps'
        ? `+${trimNum(pr.delta)} ${pr.delta === 1 ? 'rep' : 'reps'}`
        : `+${fmtWeight(pr.delta, units)}`

  return (
    <div className="pointer-events-none fixed inset-0 z-[58] flex items-center justify-center px-6">
      <PRCard name={pr.exerciseName} headline={headline} delta={delta} />
    </div>
  )
}
