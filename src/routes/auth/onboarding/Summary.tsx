import { Card } from '../../../components/ui/primitives'
import { useT } from '../../../store/useApp'
import { suggestTemplate } from '../../../lib/training/personalize'
import type { TrainingProfile } from '../../../lib/training/profile'

/**
 * Step 7. What the answers add up to, before anything is applied.
 *
 * It exists so the last thing someone sees is their own profile rather than a
 * loading spinner — and so a wrong answer three steps back is visible while
 * Back still works. Nothing new is asked here.
 */
export function Summary({ answers }: { answers: TrainingProfile }) {
  const t = useT()
  const template = suggestTemplate(answers)

  const rows: { label: string; value: string }[] = [
    { label: t('ob.s7.goal'), value: t(`goal.${answers.mainGoal}`) },
    { label: t('ob.s7.experience'), value: t(`exp.${answers.experienceLevel}`) },
    { label: t('ob.s7.training'), value: t('ob.s7.perWeek', { n: answers.daysPerWeek }) },
    { label: t('ob.s7.session'), value: t('ob.s7.minutes', { n: answers.sessionDuration }) },
    { label: t('ob.s7.equipment'), value: t(`env.${answers.trainingEnvironment}`) },
  ]

  if (answers.secondaryGoal) {
    rows.splice(1, 0, { label: '+', value: t(`goal.${answers.secondaryGoal}`) })
  }
  if (answers.trainingInterests.length) {
    rows.push({
      label: t('ob.s7.interests'),
      value: answers.trainingInterests.map((i) => t(`interest.${i}`)).join(' · '),
    })
  }

  return (
    <>
      <Card className="divide-y divide-line p-0">
        {rows.map((r, i) => (
          <div key={`${r.label}-${i}`} className="flex items-start justify-between gap-4 px-4 py-3.5">
            <span className="shrink-0 text-secondary text-muted">{r.label}</span>
            <span className="text-right text-card text-ink">{r.value}</span>
          </div>
        ))}
      </Card>

      {/* What we will actually do with the answers, stated plainly. A summary
          that only repeats them back does not tell anyone why they were
          asked — and this is the sentence that makes the questionnaire feel
          like it had a point. */}
      <Card className="border-accent/30 bg-accent/[0.05] p-4">
        <p className="text-secondary text-ink">
          {t('ob.s7.suggest', {
            template: t(template.templateId),
            days: template.days,
            n: template.exercisesPerDay,
          })}
        </p>
      </Card>
    </>
  )
}
