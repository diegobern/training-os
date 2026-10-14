import { memo, useEffect, useId, useState } from 'react'
import type { SetEntry, SetType, Units } from '../../lib/db/schema'
import { SET_TYPE_SHORT } from '../../lib/training/metrics'
// `inputNum`, not `trimNum`: what goes into these fields keeps its point in
// every language (trimNum writes "32,5" for reading in Spanish).
import { fromDisplayWeight, inputNum, toDisplayWeight } from '../../lib/format'
import { canCompleteSet, parseSetField } from '../../lib/training/setInput'
import { CheckPill, cx } from '../ui/primitives'
import { haptic } from '../../lib/feedback'
import { useT } from '../../store/useApp'

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
  /**
   * A bodyweight exercise (push-ups, pull-ups…). An empty weight field then
   * means "no extra load": the tick works with reps alone and stores 0.
   */
  bodyweight?: boolean
  onChange: (patch: Partial<SetEntry>) => void
  onToggle: () => void
  onOpenOptions: () => void
}

const weightToText = (kg: number | null, units: Units) =>
  kg === null ? '' : inputNum(toDisplayWeight(kg, units), units === 'kg' ? 2 : 1)

/** Whether the typed text already stands for this stored weight (kg). */
function weightTextMatches(text: string, kg: number | null, units: Units): boolean {
  const typed = parseSetField('weight', text).value
  return typed === null ? kg === null : fromDisplayWeight(typed, units) === kg
}

export const SetRow = memo(function SetRow({
  set,
  index,
  units,
  intensityMetric,
  placeholderWeight,
  placeholderReps,
  bodyweight = false,
  onChange,
  onToggle,
  onOpenOptions,
}: SetRowProps) {
  const t = useT()
  const problemId = useId()
  const [weightText, setWeightText] = useState(() => weightToText(set.weight, units))
  const [repsText, setRepsText] = useState(set.reps === null ? '' : String(set.reps))
  const [intensityText, setIntensityText] = useState(() => {
    const v = intensityMetric === 'rir' ? set.rir : set.rpe
    return v === null ? '' : String(v)
  })

  // Keep local text in sync when the value changes from outside (autofill,
  // undo, the 0 a bodyweight tick writes). Text that already stands for the
  // stored value is left as typed — and that includes an out-of-range value,
  // which is stored as null: it has to stay on screen, marked, so the person
  // sees what was wrong instead of watching it vanish.
  useEffect(() => {
    setWeightText((prev) => (weightTextMatches(prev, set.weight, units) ? prev : weightToText(set.weight, units)))
  }, [set.weight, units])
  useEffect(() => {
    setRepsText((prev) => (parseSetField('reps', prev).value === set.reps ? prev : set.reps === null ? '' : String(set.reps)))
  }, [set.reps])
  useEffect(() => {
    const v = intensityMetric === 'rir' ? set.rir : set.rpe
    setIntensityText((prev) => (parseSetField(intensityMetric, prev).value === v ? prev : v === null ? '' : String(v)))
  }, [set.rir, set.rpe, intensityMetric])

  // SET_TYPE_SHORT says which types wear a letter; the letter itself is the
  // app's language — a warm-up is "C" (calentamiento) in Spanish, not "W".
  const short = SET_TYPE_SHORT[set.type] ? t(`setTypeShort.${set.type}`) : ''
  const done = set.completed

  const weightInvalid = parseSetField('weight', weightText).invalid
  const repsInvalid = parseSetField('reps', repsText).invalid
  const intensityInvalid = parseSetField(intensityMetric, intensityText).invalid
  const problems = [
    weightInvalid && t('workout.invalidWeight'),
    repsInvalid && t('workout.invalidReps'),
    intensityInvalid && t(intensityMetric === 'rir' ? 'workout.invalidRir' : 'workout.invalidRpe'),
  ].filter((p): p is string => typeof p === 'string')

  // An invalid field is marked in place; the done tint is dropped from it so
  // the two border colours never fight over the same box.
  const fieldTone = (invalid: boolean) =>
    invalid ? 'border-down text-down focus:border-down' : done ? 'border-accent/30' : undefined

  // With no weight from last time, a bodyweight row says so instead of "—":
  // the empty box is the expected answer, not a missing one.
  const weightPlaceholder =
    bodyweight && (placeholderWeight === null || placeholderWeight === 0)
      ? t('workout.bodyweightShort')
      : placeholderWeight === null
        ? '—'
        : inputNum(toDisplayWeight(placeholderWeight, units), 2)

  return (
    <div>
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
          aria-label={t('workout.weightAria')}
          aria-invalid={weightInvalid || undefined}
          aria-describedby={weightInvalid ? problemId : undefined}
          className={cx('field h-11 min-w-0 flex-1 text-[1.0625rem] font-semibold', fieldTone(weightInvalid))}
          placeholder={weightPlaceholder}
          value={weightText}
          onChange={(e) => {
            setWeightText(e.target.value)
            const v = parseSetField('weight', e.target.value).value
            onChange({ weight: v === null ? null : fromDisplayWeight(v, units) })
          }}
        />

        <input
          inputMode="numeric"
          enterKeyHint="next"
          aria-label={t('workout.repsAria')}
          aria-invalid={repsInvalid || undefined}
          aria-describedby={repsInvalid ? problemId : undefined}
          className={cx('field h-11 w-[4.25rem] shrink-0 text-[1.0625rem] font-semibold', fieldTone(repsInvalid))}
          placeholder={placeholderReps === null ? '—' : String(placeholderReps)}
          value={repsText}
          onChange={(e) => {
            setRepsText(e.target.value)
            onChange({ reps: parseSetField('reps', e.target.value).value })
          }}
        />

        <input
          inputMode="decimal"
          enterKeyHint="done"
          aria-label={t(intensityMetric === 'rir' ? 'workout.rirAria' : 'workout.rpeAria')}
          aria-invalid={intensityInvalid || undefined}
          aria-describedby={intensityInvalid ? problemId : undefined}
          className={cx('field h-11 w-12 shrink-0 text-body', fieldTone(intensityInvalid))}
          placeholder="—"
          value={intensityText}
          onChange={(e) => {
            setIntensityText(e.target.value)
            const v = parseSetField(intensityMetric, e.target.value).value
            onChange(intensityMetric === 'rir' ? { rir: v } : { rpe: v })
          }}
        />

        <CheckPill
          checked={done}
          label={t('workout.setDoneAria', { n: index + 1 })}
          onClick={() => {
            // The empty weight of a bodyweight set becomes an explicit 0 before
            // the tick, so the set is stored — and counted — like any other.
            if (!done && bodyweight && set.weight === null) onChange({ weight: 0 })
            onToggle()
          }}
          disabled={!done && (problems.length > 0 || !canCompleteSet(set, bodyweight))}
        />
      </div>
      {/* Always mounted, empty when all is well (an empty paragraph takes no
          height): a live region has to exist before its text changes for a
          screen reader to announce it. */}
      <p
        id={problemId}
        aria-live="polite"
        className={cx('pl-11 pr-1 text-caption font-medium text-down', problems.length > 0 && 'pb-0.5')}
      >
        {problems.join(' · ')}
      </p>
    </div>
  )
})
