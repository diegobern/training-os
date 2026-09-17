import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { Button, Card, SectionTitle, StatTile } from '../components/ui/primitives'
import { IconArrowUp, IconTarget, IconTrophy } from '../components/ui/Icon'
import { useWorkout } from '../store/useWorkout'
import { useApp, useT } from '../store/useApp'
import { fmtDuration, fmtVolumeFull, fmtWeight, trimNum } from '../lib/format'
import { logsForExercise } from '../lib/db/repo.sessions'
import { getExercise } from '../lib/db/repo.exercises'
import { buildInsight, type Suggestion } from '../lib/training/overload'
import { awardMilestone } from '../lib/db/repo.body'
import { listSessions } from '../lib/db/repo.sessions'
import { animationsOn } from '../lib/feedback'

interface NextTarget {
  name: string
  suggestion: Suggestion
}

export default function WorkoutSummary() {
  const t = useT()
  const navigate = useNavigate()
  const settings = useApp((s) => s.settings)
  const result = useWorkout((s) => s.finishResult)
  const clearFinish = useWorkout((s) => s.clearFinish)
  const [targets, setTargets] = useState<NextTarget[]>([])

  useEffect(() => {
    if (!result) {
      navigate('/', { replace: true })
      return
    }
    let alive = true
    void (async () => {
      const out: NextTarget[] = []
      for (const se of result.session.exercises) {
        const [logs, ex] = await Promise.all([logsForExercise(se.exerciseId), getExercise(se.exerciseId)])
        if (!logs.length) continue
        const insight = buildInsight({
          logs,
          repMin: se.repMin,
          repMax: se.repMax,
          rirTarget: se.rirTarget,
          source: ex?.incrementSource ?? 'machine',
          weights: settings.availableWeights,
        })
        if (insight.suggestion.weight !== null) out.push({ name: se.name, suggestion: insight.suggestion })
      }
      if (alive) setTargets(out)
    })()
    return () => {
      alive = false
    }
  }, [result, navigate, settings.availableWeights])

  // Milestones are awarded once, on the summary screen, from real counts.
  useEffect(() => {
    if (!result) return
    void (async () => {
      const sessions = await listSessions()
      const n = sessions.length
      await awardMilestone('first-workout', { at: n })
      if (n >= 10) await awardMilestone('workouts-10')
      if (n >= 50) await awardMilestone('workouts-50')
      if (n >= 100) await awardMilestone('workouts-100')
      if (result.prs.length > 0) await awardMilestone('first-pr', { exercise: result.prs[0].exerciseName })
    })()
  }, [result])

  if (!result) return null

  const { session, totals, prs, previousVolume } = result
  const delta = previousVolume === null ? null : totals.volume - previousVolume

  return (
    <Page noNavPadding>
      <div className={animationsOn() ? 'animate-fade-up' : ''}>
        <p className="label-xs mt-6 text-accent">{t('summary.done')}</p>
        <h1 className="mt-1 text-hero">
          {t('summary.complete', { name: session.dayName })}
        </h1>
        <p className="tnum mt-1 text-4xl font-bold leading-none tracking-tight text-accent">
          {fmtDuration(totals.durationSec)}
        </p>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <StatTile label={t('summary.workingSets')} value={totals.effectiveSets} sub={`${totals.totalReps} ${t('common.reps')}`} />
          <StatTile label={t('summary.volume')} value={fmtVolumeFull(totals.volume, settings.units)} />
          <StatTile
            label={t('summary.vsPrevious', { name: session.dayName })}
            value={
              delta === null ? '—' : `${delta >= 0 ? '↑' : '↓'} ${fmtVolumeFull(Math.abs(delta), settings.units)}`
            }
            tone={delta === null ? 'default' : delta >= 0 ? 'up' : 'down'}
            sub={delta === null ? t('summary.firstSession') : undefined}
          />
          <StatTile
            label={t('progress.prs')}
            value={prs.length === 0 ? '—' : prs.length}
            tone={prs.length ? 'pr' : 'default'}
            sub={prs.length === 0 ? t('summary.noPrs') : undefined}
          />
        </div>

        {prs.length > 0 && (
          <section className="mt-6">
            <SectionTitle>{prs.length === 1 ? t('summary.pr') : t('summary.prs', { n: prs.length })}</SectionTitle>
            <div className="flex flex-col gap-2">
              {prs.map((pr) => (
                <Card key={pr.id} className="flex items-center gap-3 border-pr/30 px-3.5 py-3">
                  <IconTrophy size={20} className="shrink-0 text-pr" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{pr.exerciseName}</p>
                    <p className="text-xs text-faint">{t(`pr.${pr.type}`)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum text-sm font-bold">
                      {pr.type === 'reps'
                        ? `${trimNum(pr.value)} ${t('common.reps')}`
                        : pr.type === 'volume'
                          ? fmtVolumeFull(pr.value, settings.units)
                          : fmtWeight(pr.value, settings.units)}
                    </p>
                    {pr.delta !== null && (
                      <p className="tnum flex items-center justify-end gap-0.5 text-xs font-semibold text-up">
                        <IconArrowUp size={11} />
                        {pr.type === 'reps' ? trimNum(pr.delta) : fmtWeight(pr.delta, settings.units)}
                      </p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        {targets.length > 0 && (
          <section className="mt-6">
            <SectionTitle>{t('summary.nextTargets', { name: session.dayName })}</SectionTitle>
            <Card className="divide-y divide-line">
              {targets.map((x, i) => (
                <div key={i} className="flex items-center gap-3 px-3.5 py-2.5">
                  <IconTarget size={15} className="shrink-0 text-accent" />
                  <p className="min-w-0 flex-1 truncate text-sm">{x.name}</p>
                  <p className="tnum shrink-0 text-sm font-bold">
                    {fmtWeight(x.suggestion.weight as number, settings.units, false)} × {x.suggestion.reps}
                  </p>
                </div>
              ))}
            </Card>
            <p className="mt-2 text-caption text-faint">{t('coach.suggestionLabel')}</p>
          </section>
        )}

        <div className="mt-8 flex flex-col gap-2 pb-10">
          <Button
            full
            size="lg"
            variant="primary"
            onClick={() => {
              clearFinish()
              navigate('/', { replace: true })
            }}
          >
            {t('common.done')}
          </Button>
          <Button
            full
            variant="ghost"
            onClick={() => {
              clearFinish()
              navigate(`/history/${session.id}`, { replace: true })
            }}
          >
            {t('history.title')}
          </Button>
        </div>
      </div>
    </Page>
  )
}
