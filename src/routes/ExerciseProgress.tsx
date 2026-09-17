import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { Card, Chip, EmptyState, SectionTitle, Segmented, StatTile } from '../components/ui/primitives'
import { IconChart, IconTrophy } from '../components/ui/Icon'
import { LineChart } from '../components/charts/LineChart'
import { TargetCard } from '../components/workout/TargetCard'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { logsForExercise, prsForExercise } from '../lib/db/repo.sessions'
import { getExercise } from '../lib/db/repo.exercises'
import { useApp, useT } from '../store/useApp'
import { PERIODS, fmtDate, periodStart, type Period } from '../lib/dates'
import { fmtVolumeFull, fmtWeight, trimNum } from '../lib/format'
import { buildInsight } from '../lib/training/overload'
import { e1rmIsConfident } from '../lib/training/metrics'

type Metric = 'e1rm' | 'weight' | 'volume' | 'reps'

export default function ExerciseProgress() {
  const { exerciseId = '' } = useParams()
  const t = useT()
  const navigate = useNavigate()
  const { settings, locale } = useApp()
  const [period, setPeriod] = useState<Period>('3M')
  const [metric, setMetric] = useState<Metric>('e1rm')

  const { data } = useLiveQuery(
    async () => {
      const [exercise, logs, prs] = await Promise.all([
        getExercise(exerciseId),
        logsForExercise(exerciseId),
        prsForExercise(exerciseId),
      ])
      return { exercise, logs, prs }
    },
    ['exerciseLogs', 'personalRecords', 'exercises'],
    [exerciseId],
  )

  const allLogs = data?.logs ?? []
  const from = periodStart(period)
  const logs = useMemo(() => allLogs.filter((l) => l.performedAt >= from), [allLogs, from])

  const insight = useMemo(() => {
    if (!data?.exercise) return null
    return buildInsight({
      logs: allLogs,
      repMin: data.exercise.repMin,
      repMax: data.exercise.repMax,
      rirTarget: data.exercise.rirTarget,
      source: data.exercise.incrementSource,
      weights: settings.availableWeights,
    })
  }, [data, allLogs, settings.availableWeights])

  if (!data?.exercise) {
    return (
      <Page title={t('progress.title')} back>
        <div className="skeleton h-40 w-full" />
      </Page>
    )
  }

  if (allLogs.length === 0) {
    return (
      <Page title={data.exercise.name} back>
        <EmptyState icon={<IconChart size={26} />} title={t('progress.noData')} body={t('progress.noDataBody')} />
      </Page>
    )
  }

  const points = logs.map((l) => ({
    x: l.performedAt,
    y:
      metric === 'e1rm'
        ? l.bestE1rm
        : metric === 'weight'
          ? l.topSetWeight
          : metric === 'volume'
            ? l.volume
            : l.totalReps,
  }))

  const best = allLogs.reduce(
    (acc, l) => ({
      weight: Math.max(acc.weight, l.topSetWeight),
      e1rm: Math.max(acc.e1rm, l.bestE1rm),
      volume: Math.max(acc.volume, l.volume),
      reps: Math.max(acc.reps, l.totalReps),
    }),
    { weight: 0, e1rm: 0, volume: 0, reps: 0 },
  )
  const bestLog = allLogs.reduce((a, b) => (b.bestE1rm > a.bestE1rm ? b : a), allLogs[0])
  const lowConfidence = bestLog.topSetReps > 0 && !e1rmIsConfident(bestLog.topSetReps)

  const formatY = (v: number) =>
    metric === 'volume'
      ? fmtVolumeFull(v, settings.units)
      : metric === 'reps'
        ? String(Math.round(v))
        : fmtWeight(v, settings.units, false)

  return (
    <Page title={data.exercise.name} subtitle={t(`muscle.${data.exercise.muscleGroup}`)} back>
      {insight && (
        <div className="mb-4">
          <TargetCard insight={insight} />
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatTile
          label={t('progress.bestSet')}
          value={`${fmtWeight(best.weight, settings.units, false)} ${settings.units}`}
          sub={(() => {
            const heaviest = allLogs.reduce((a, b) => (b.topSetWeight > a.topSetWeight ? b : a), allLogs[0])
            return `× ${heaviest.topSetReps} ${t('common.reps')}`
          })()}
        />
        <StatTile
          label={t('progress.e1rm')}
          value={fmtWeight(best.e1rm, settings.units)}
          sub={lowConfidence ? `${bestLog.topSetReps} ${t('common.reps')} — ${t('common.notEnoughData').toLowerCase()}` : undefined}
        />
        <StatTile label={t('progress.sessions')} value={allLogs.length} />
        <StatTile label={t('progress.prs')} value={data.prs.length || '—'} tone={data.prs.length ? 'pr' : 'default'} />
      </div>

      <Card className="p-4">
        <div className="mb-3">
          <Segmented
            size="sm"
            value={metric}
            onChange={setMetric}
            options={[
              { value: 'e1rm', label: '1RM' },
              { value: 'weight', label: t('progress.weight') },
              { value: 'volume', label: t('progress.volume') },
              { value: 'reps', label: t('progress.reps') },
            ]}
          />
        </div>

        {points.length < 2 ? (
          <p className="py-8 text-center text-sm text-faint">{t('progress.oneSession')}</p>
        ) : (
          <LineChart
            points={points}
            height={210}
            ariaLabel={`${data.exercise.name} — ${metric}`}
            formatY={formatY}
            formatX={(v) => fmtDate(v, locale, { day: 'numeric', month: 'short' })}
            tooltipDetail={(_, i) => {
              const l = logs[i]
              if (!l) return null
              return `${fmtWeight(l.topSetWeight, settings.units, false)} × ${l.topSetReps}`
            }}
            yZero={metric === 'volume' || metric === 'reps'}
          />
        )}

        <div className="scroll-x mt-3">
          {PERIODS.map((p) => (
            <Chip key={p} active={period === p} onClick={() => setPeriod(p)}>
              {p}
            </Chip>
          ))}
        </div>

        {metric === 'e1rm' && <p className="mt-3 text-caption leading-relaxed text-faint">{t('progress.e1rmNote')}</p>}
      </Card>

      {data.prs.length > 0 && (
        <section className="mt-6">
          <SectionTitle>{t('pr.title')}</SectionTitle>
          <Card className="divide-y divide-line">
            {data.prs.map((pr) => (
              <div key={pr.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
                <IconTrophy size={15} className="shrink-0 text-pr" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t(`pr.${pr.type}`)}</p>
                  <p className="text-xs text-faint">{fmtDate(pr.date, locale, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tnum text-sm font-bold">
                    {pr.type === 'reps'
                      ? `${trimNum(pr.value)} ${t('common.reps')}`
                      : pr.type === 'volume'
                        ? fmtVolumeFull(pr.value, settings.units)
                        : fmtWeight(pr.value, settings.units)}
                  </p>
                  {pr.previousValue !== null && (
                    <p className="tnum text-caption text-faint">
                      {t('pr.previous')}:{' '}
                      {pr.type === 'reps' ? trimNum(pr.previousValue) : fmtWeight(pr.previousValue, settings.units)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section className="mt-6">
        <SectionTitle>{t('history.title')}</SectionTitle>
        <div className="flex flex-col gap-2">
          {[...logs].reverse().map((l) => (
            <button
              key={l.id}
              onClick={() => navigate(`/history/${l.sessionId}`)}
              className="press card px-3.5 py-3 text-left"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs text-faint">{fmtDate(l.date, locale, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                <p className="tnum text-xs text-faint">{fmtVolumeFull(l.volume, settings.units)}</p>
              </div>
              <div className="tnum mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
                {l.sets.map((s, i) => (
                  <span key={s.id} className="text-muted">
                    <span className="text-faint">{i + 1}</span> {fmtWeight(s.weight, settings.units, false)} × {s.reps}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </section>
    </Page>
  )
}
