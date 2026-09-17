import { useState } from 'react'
import { ChoiceCard, ChoiceChip, FieldLabel, WhyNote } from '../../../components/onboarding/StepShell'
import { Segmented, TextField, cx } from '../../../components/ui/primitives'
import { useT } from '../../../store/useApp'
import {
  AGE_RANGES,
  AVAILABLE_EQUIPMENT,
  CARDIO_PREFERENCES,
  ENVIRONMENT_EQUIPMENT,
  EXPERIENCE_LEVELS,
  MAIN_GOALS,
  SESSION_DURATIONS,
  TRAINING_ENVIRONMENTS,
  TRAINING_INTERESTS,
  TRAINING_YEARS,
  type AvailableEquipment,
  type MainGoal,
  type TrainingProfile,
  type Weekday,
} from '../../../lib/training/profile'
import type { Units } from '../../../lib/db/schema'

export interface StepProps {
  answers: TrainingProfile
  set: (patch: Partial<TrainingProfile>) => void
}

const toggle = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter((x) => x !== value) : [...list, value]

/* ============================================================ 1. about you */

/**
 * Height and weight are entered in the unit the person just chose, and stored
 * in metric. Doing the conversion here rather than at save time means the
 * number on screen is always the number they typed, even after they switch
 * units mid-step.
 */
export function Step1({ answers, set }: StepProps) {
  const t = useT()
  const imperial = answers.units === 'lb'

  const [heightText, setHeightText] = useState(() =>
    answers.heightCm == null ? '' : imperial ? String(Math.round(answers.heightCm / 2.54)) : String(answers.heightCm),
  )
  const [weightText, setWeightText] = useState(() =>
    answers.bodyweightKg == null
      ? ''
      : imperial
        ? String(Math.round(answers.bodyweightKg * 2.2046 * 10) / 10)
        : String(answers.bodyweightKg),
  )

  const commitHeight = (raw: string) => {
    setHeightText(raw)
    const n = Number(raw.replace(',', '.'))
    if (!raw.trim() || !Number.isFinite(n) || n <= 0) return set({ heightCm: null })
    set({ heightCm: Math.round(imperial ? n * 2.54 : n) })
  }
  const commitWeight = (raw: string) => {
    setWeightText(raw)
    const n = Number(raw.replace(',', '.'))
    if (!raw.trim() || !Number.isFinite(n) || n <= 0) return set({ bodyweightKg: null })
    set({ bodyweightKg: Math.round((imperial ? n / 2.2046 : n) * 10) / 10 })
  }

  return (
    <>
      <div>
        <FieldLabel>{t('ob.s1.units')}</FieldLabel>
        <div className="mt-3">
          <Segmented<Units>
            value={answers.units}
            onChange={(v) => set({ units: v })}
            options={[
              { value: 'kg', label: 'KG' },
              { value: 'lb', label: 'LB' },
            ]}
          />
        </div>
        <WhyNote>{t('ob.s1.unitsWhy')}</WhyNote>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <TextField
            label={t('ob.s1.height')}
            inputMode="decimal"
            value={heightText}
            onChange={(e) => commitHeight(e.target.value)}
            placeholder={imperial ? 'in' : 'cm'}
          />
        </div>
        <div>
          <TextField
            label={t('ob.s1.weight')}
            inputMode="decimal"
            value={weightText}
            onChange={(e) => commitWeight(e.target.value)}
            placeholder={imperial ? 'lb' : 'kg'}
          />
        </div>
      </div>
      <WhyNote optional>{t('ob.s1.weightWhy')}</WhyNote>

      <div>
        <FieldLabel>{t('ob.s1.age')}</FieldLabel>
        <div className="mt-3 flex flex-wrap gap-2">
          {AGE_RANGES.map((r) => (
            <ChoiceChip
              key={r}
              label={t(`age.${r}`)}
              selected={answers.ageRange === r}
              onClick={() => set({ ageRange: answers.ageRange === r ? null : r })}
            />
          ))}
        </div>
        <WhyNote optional>{t('ob.s1.ageWhy')}</WhyNote>
      </div>
    </>
  )
}

/* ================================================================ 2. goal */

export function Step2({ answers, set }: StepProps) {
  const t = useT()
  return (
    <>
      <div className="space-y-2.5">
        {MAIN_GOALS.map((g) => (
          <ChoiceCard
            key={g}
            label={t(`goal.${g}`)}
            hint={t(`goal.${g}.sub`)}
            selected={answers.mainGoal === g}
            onClick={() =>
              set({
                mainGoal: g,
                // A secondary goal identical to the main one says nothing, so
                // choosing it as the main goal clears it.
                secondaryGoal: answers.secondaryGoal === g ? null : answers.secondaryGoal,
              })
            }
          />
        ))}
      </div>

      <div>
        <FieldLabel>{t('ob.s2.second')}</FieldLabel>
        <p className="mt-1 text-secondary text-muted">{t('ob.s2.secondSub')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ChoiceChip
            label={t('ob.s2.none')}
            selected={answers.secondaryGoal === null}
            onClick={() => set({ secondaryGoal: null })}
          />
          {MAIN_GOALS.filter((g) => g !== answers.mainGoal).map((g) => (
            <ChoiceChip
              key={g}
              label={t(`goal.${g}`)}
              selected={answers.secondaryGoal === g}
              onClick={() => set({ secondaryGoal: answers.secondaryGoal === g ? null : (g as MainGoal) })}
            />
          ))}
        </div>
      </div>
    </>
  )
}

/* ========================================================== 3. experience */

export function Step3({ answers, set }: StepProps) {
  const t = useT()
  return (
    <>
      <div className="space-y-2.5">
        {EXPERIENCE_LEVELS.map((l) => (
          <ChoiceCard
            key={l}
            label={t(`exp.${l}`)}
            hint={t(`exp.${l}.sub`)}
            selected={answers.experienceLevel === l}
            onClick={() => set({ experienceLevel: l })}
          />
        ))}
      </div>

      <div>
        <FieldLabel>{t('ob.s3.years')}</FieldLabel>
        <p className="mt-1 text-secondary text-muted">{t('ob.s3.yearsSub')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {TRAINING_YEARS.map((y) => (
            <ChoiceChip
              key={y}
              label={t(`years.${y}`)}
              selected={answers.trainingYears === y}
              onClick={() => set({ trainingYears: answers.trainingYears === y ? null : y })}
            />
          ))}
        </div>
      </div>
    </>
  )
}

/* ======================================================== 4. availability */

const WEEKDAYS: { day: Weekday; key: string }[] = [
  { day: 1, key: 'day.mon' },
  { day: 2, key: 'day.tue' },
  { day: 3, key: 'day.wed' },
  { day: 4, key: 'day.thu' },
  { day: 5, key: 'day.fri' },
  { day: 6, key: 'day.sat' },
  { day: 0, key: 'day.sun' },
]

export function Step4({ answers, set }: StepProps) {
  const t = useT()
  return (
    <>
      <div>
        <FieldLabel>{t('ob.s4.days')}</FieldLabel>
        <div className="mt-3 grid grid-cols-6 gap-2">
          {[2, 3, 4, 5, 6, 7].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => set({ daysPerWeek: n })}
              aria-pressed={answers.daysPerWeek === n}
              className={cx(
                'press flex h-14 items-center justify-center rounded-xl border text-card transition-colors',
                answers.daysPerWeek === n
                  ? 'border-accent bg-accent/[0.1] text-ink'
                  : 'border-line bg-surface text-muted',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>{t('ob.s4.duration')}</FieldLabel>
        <p className="mt-1 text-secondary text-muted">{t('ob.s4.durationSub')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SESSION_DURATIONS.map((d) => (
            <ChoiceChip
              key={d}
              label={d === 90 ? '90+ min' : `${d} min`}
              selected={answers.sessionDuration === d}
              onClick={() => set({ sessionDuration: d })}
            />
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>{t('ob.s4.preferred')}</FieldLabel>
        <p className="mt-1 text-secondary text-muted">{t('ob.s4.preferredSub')}</p>
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map(({ day, key }) => (
            <button
              key={day}
              type="button"
              onClick={() => set({ preferredDays: toggle(answers.preferredDays, day) })}
              aria-pressed={answers.preferredDays.includes(day)}
              className={cx(
                'press flex h-12 items-center justify-center rounded-lg border text-caption font-bold transition-colors',
                answers.preferredDays.includes(day)
                  ? 'border-accent bg-accent/[0.1] text-ink'
                  : 'border-line bg-surface text-faint',
              )}
            >
              {t(key)}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

/* ========================================================= 5. environment */

export function Step5({ answers, set }: StepProps) {
  const t = useT()
  return (
    <>
      <div className="space-y-2.5">
        {TRAINING_ENVIRONMENTS.map((e) => (
          <ChoiceCard
            key={e}
            label={t(`env.${e}`)}
            hint={t(`env.${e}.sub`)}
            selected={answers.trainingEnvironment === e}
            onClick={() =>
              set({
                trainingEnvironment: e,
                // Choosing an environment refills the equipment list, because
                // the previous selection belonged to a different place. It is
                // a starting point — every item is still togglable below.
                availableEquipment: [...ENVIRONMENT_EQUIPMENT[e]],
              })
            }
          />
        ))}
      </div>

      <div>
        <FieldLabel>{t('ob.s5.equipment')}</FieldLabel>
        <p className="mt-1 text-secondary text-muted">{t('ob.s5.equipmentSub')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {AVAILABLE_EQUIPMENT.map((e) => (
            <ChoiceChip
              key={e}
              label={t(`equip.${e}`)}
              selected={answers.availableEquipment.includes(e)}
              onClick={() => set({ availableEquipment: toggle(answers.availableEquipment, e as AvailableEquipment) })}
            />
          ))}
        </div>
      </div>
    </>
  )
}

/* =========================================================== 6. interests */

export function Step6({ answers, set }: StepProps) {
  const t = useT()
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {TRAINING_INTERESTS.map((i) => (
          <ChoiceChip
            key={i}
            label={t(`interest.${i}`)}
            selected={answers.trainingInterests.includes(i)}
            onClick={() => set({ trainingInterests: toggle(answers.trainingInterests, i) })}
          />
        ))}
      </div>

      <div>
        <FieldLabel>{t('ob.s6.cardio')}</FieldLabel>
        <div className="mt-3 flex flex-wrap gap-2">
          {CARDIO_PREFERENCES.map((c) => (
            <ChoiceChip
              key={c}
              label={t(`cardio.${c}`)}
              selected={answers.preferredCardio.includes(c)}
              onClick={() => set({ preferredCardio: toggle(answers.preferredCardio, c) })}
            />
          ))}
        </div>
        <WhyNote optional>{t('ob.why')}</WhyNote>
      </div>
    </>
  )
}
