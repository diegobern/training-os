import { memo, useEffect, useState } from 'react'
import type { SetEntry, SetType, Units } from '../../lib/db/schema'
import { SET_TYPE_SHORT } from '../../lib/training/metrics'
import { fromDisplayWeight, toDisplayWeight, trimNum } from '../../lib/format'
import { CheckPill, cx } from '../ui/primitives'
import { haptic } from '../../lib/feedback'

const TYPE_TONE: Record<SetType, string> = {
  warmup: 'text-info border-info/40 bg-info/10',
  working: 'text-muted border-line bg-elevated',
  top: 'text-accent border-accent/40 bg-accent/10',
  backoff: 'text-warn border-warn/40 bg-warn/10',
  drop: 'text-warn border-warn/40 bg-warn/10',
  failure: 'text-down border-down/40 bg-down/10',
  restpause: 'text-pr border-pr/40 bg-pr/10',
}

export interface SetRowProps {
  set: SetEntry
  index: number
  units: Units
  intensityMetric: 'rir' | 'rpe'
  placeholderWeight: number | null
  placeholderReps: number | null
  onChange: (patch: Partial<SetEntry>) => void
  onToggle: () => void
  onOpenOptions: () => void
}

function num(value: string): number | null {
  const cleaned = value.replace(',', '.').trim()
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export const SetRow = memo(function SetRow({
  set,
  index,
  units,
  intensityMetric,
  placeholderWeight,
  placeholderReps,
  onChange,
  onToggle,
  onOpenOptions,
}: SetRowProps) {
  const [weightText, setWeightText] = useState(
    set.weight === null ? '' : trimNum(toDisplayWeight(set.weight, units), units === 'kg' ? 2 : 1),
  )
  const [repsText, setRepsText] = useState(set.reps === null ? '' : String(set.reps))
  const [intensityText, setIntensityText] = useState(() => {
    const v = intensityMetric === 'rir' ? set.rir : set.rpe
    return v === null ? '' : String(v)
  })

  // Keep local text in sync when the value changes from outside (autofill, undo).
  useEffect(() => {
    setWeightText(set.weight === null ? '' : trimNum(toDisplayWeight(set.weight, units), units === 'kg' ? 2 : 1))
  }, [set.weight, units])
  useEffect(() => {
    setRepsText(set.reps === null ? '' : String(set.reps))
  }, [set.reps])
  useEffect(() => {
    const v = intensityMetric === 'rir' ? set.rir : set.rpe
    setIntensityText(v === null ? '' : String(v))
  }, [set.rir, set.rpe, intensityMetric])

  const short = SET_TYPE_SHORT[set.type]
  const done = set.completed

  return (
    <div
      className={cx(
        'flex items-center gap-1.5 rounded-xl px-1 py-1 transition-colors duration-200',
        done && 'bg-accent/[0.07]',
      )}
    >
      <button
        onClick={() => {
          haptic('tick')
          onOpenOptions()
        }}
        aria-label={`${index + 1}`}
        className={cx(
          'press h-11 w-9 shrink-0 rounded-lg border text-xs font-bold tabular-nums transition-colors',
          TYPE_TONE[set.type],
        )}
      >
        {short || index + 1}
      </button>

      <input
        inputMode="decimal"
        enterKeyHint="next"
        aria-label="weight"
        className={cx('field h-11 min-w-0 flex-1 text-[1.0625rem] font-semibold', done && 'border-accent/30')}
        placeholder={placeholderWeight === null ? '—' : trimNum(toDisplayWeight(placeholderWeight, units), 2)}
        value={weightText}
        onChange={(e) => {
          setWeightText(e.target.value)
          const v = num(e.target.value)
          onChange({ weight: v === null ? null : fromDisplayWeight(v, units) })
        }}
      />

      <input
        inputMode="numeric"
        enterKeyHint="next"
        aria-label="reps"
        className={cx('field h-11 w-[4.25rem] shrink-0 text-[1.0625rem] font-semibold', done && 'border-accent/30')}
        placeholder={placeholderReps === null ? '—' : String(placeholderReps)}
        value={repsText}
        onChange={(e) => {
          setRepsText(e.target.value)
          const v = num(e.target.value)
          onChange({ reps: v === null ? null : Math.round(v) })
        }}
      />

      <input
        inputMode="decimal"
        enterKeyHint="done"
        aria-label={intensityMetric}
        className={cx('field h-11 w-12 shrink-0 text-body', done && 'border-accent/30')}
        placeholder="—"
        value={intensityText}
        onChange={(e) => {
          setIntensityText(e.target.value)
          const v = num(e.target.value)
          onChange(intensityMetric === 'rir' ? { rir: v } : { rpe: v })
        }}
      />

      <CheckPill
        checked={done}
        label={`set ${index + 1}`}
        onClick={onToggle}
        disabled={!done && (set.weight === null || set.reps === null)}
      />
    </div>
  )
})
