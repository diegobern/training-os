import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, EmptyState, SectionTitle, Select, StatTile } from '../components/ui/primitives'
import { IconChart } from '../components/ui/Icon'
import { BarChart } from '../components/charts/BarChart'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { listPRs, listSessions, logsInRange } from '../lib/db/repo.sessions'
import { useApp, useT } from '../store/useApp'
import { endOfMonth, fmtDate, monthKey, startOfMonth } from '../lib/dates'
import { fmtDuration, fmtVolume, fmtVolumeFull } from '../lib/format'
import { statsFrom, weeklySetsPerMuscle } from '../lib/training/stats'
import { MUSCLE_GROUPS } from '../lib/db/schema'

export function StatsView() {
  const t = useT()
  const navigate = useNavigate()
  const { settings, locale } = useApp()

  const { data } = useLiveQuery(
    async () => {
      const [sessions, prs, logs] = await Promise.all([listSessions(), listPRs(), logsInRange(0)])
      return { sessions, prs, logs }
    },
    ['sessions', 'personalRecords', 'exerciseLogs'],
  )

  const sessions = data?.sessions ?? []
  const logs = data?.logs ?? []

  const months = useMemo(() => {
    const set = new Set(sessions.map((s) => monthKey(s.startedAt)))
    return [...set].sort().reverse()
  }, [sessions])

  const [monthA, setMonthA] = useState<string>('')
  const [monthB, setMonthB] = useState<string>('')
  const a = monthA || months[0] || ''
  const b = monthB || months[1] || months[0] || ''

  const all = statsFrom(sessions, logs)
  const thisMonthStart = startOfMonth(new Date()).getTime()
  const thisMonth = statsFrom(
    sessions.filter((s) => s.startedAt >= thisMonthStart),
    logs,
  )

  function monthStats(key: string) {
    if (!key) return null
    const [y, m] = key.split('-').map(Number)
    const start = new Date(y, m - 1, 1).getTime()
    const end = endOfMonth(start).getTime()
    const list = sessions.filter((s) => s.startedAt >= start && s.startedAt <= end)
    const scoped = statsFrom(list, logs)
    const prCount = (data?.prs ?? []).filter((p) => p.achievedAt >= start && p.achievedAt <= end).length
    return { ...scoped, prCount, start }
  }

  const statsA = monthStats(a)
  const statsB = monthStats(b)

  const mostTrained = useMemo(() => {
    const counts = new Map<string, { name: string; n: number }>()
    for (const l of logs) {
      const e = counts.get(l.exerciseId) ?? { name: l.exerciseName, n: 0 }
      e.n++
      counts.set(l.exerciseId, e)
    }
    return [...counts.entries()]
      .sort((x, y) => y[1].n - x[1].n)
      .slice(0, 8)
      .map(([id, v]) => ({ id, ...v }))
  }, [logs])

  const distribution = useMemo(() => {
    const m = weeklySetsPerMuscle(logs)
    return MUSCLE_GROUPS.filter((g) => (m.get(g) ?? 0) > 0)
      .map((g) => ({ label: t(`muscle.${g}`), value: m.get(g) ?? 0 }))
      .sort((x, y) => y.value - x.value)
  }, [logs, t])

  if (sessions.length === 0) {
    return (
      <>
        <EmptyState icon={<IconChart size={26} />} title={t('stats.empty')} body={t('history.emptyBody')} />
      </>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatTile label={t('stats.totalWorkouts')} value={all.workouts} tone="accent" />
        <StatTile label={t('stats.thisMonth')} value={thisMonth.workouts} />
        <StatTile label={t('stats.trainingTime')} value={fmtDuration(all.durationSec, 'compact')} />
        <StatTile
          label={t('stats.avgDuration')}
          value={fmtDuration(all.workouts ? all.durationSec / all.workouts : 0, 'compact')}
        />
        <StatTile label={t('stats.totalSets')} value={all.effectiveSets} sub={t('stats.avgSets') + ': ' + (all.workouts ? Math.round(all.effectiveSets / all.workouts) : 0)} />
        <StatTile label={t('stats.totalReps')} value={all.reps} />
        <StatTile label={t('stats.totalVolume')} value={fmtVolume(all.volume, settings.units)} />
        <StatTile label={t('stats.prs')} value={data?.prs.length ?? 0} tone="pr" />
      </div>

      {months.length > 1 && (
        <section className="mt-6">
          <SectionTitle>{t('progress.compare')}</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t('progress.pickA')}
              value={a}
              onChange={setMonthA}
              options={months.map((m) => ({ value: m, label: fmtDate(monthStats(m)!.start, locale, { month: 'long', year: 'numeric' }) }))}
            />
            <Select
              label={t('progress.pickB')}
              value={b}
              onChange={setMonthB}
              options={months.map((m) => ({ value: m, label: fmtDate(monthStats(m)!.start, locale, { month: 'long', year: 'numeric' }) }))}
            />
          </div>
          {statsA && statsB && (
            <Card className="mt-3 divide-y divide-line">
              {/* Which column is which was never labelled — and at 320 px the
                  two fixed 96 px value columns pushed the row wider than the
                  screen. Both fixed here. */}
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-2 px-3.5 py-2">
                <span />
                <span className="w-[4.5rem] truncate text-right text-2xs font-bold uppercase tracking-wide text-faint">
                  {fmtDate(statsA.start, locale, { month: 'short' })}
                </span>
                <span className="w-[4.5rem] truncate text-right text-2xs font-bold uppercase tracking-wide text-faint">
                  {fmtDate(statsB.start, locale, { month: 'short' })}
                </span>
              </div>
              {[
                { label: t('common.workouts'), av: statsA.workouts, bv: statsB.workouts, fmt: (v: number) => String(v) },
                { label: t('common.volume'), av: statsA.volume, bv: statsB.volume, fmt: (v: number) => fmtVolumeFull(v, settings.units) },
                { label: t('stats.totalSets'), av: statsA.effectiveSets, bv: statsB.effectiveSets, fmt: (v: number) => String(v) },
                { label: t('stats.prs'), av: statsA.prCount, bv: statsB.prCount, fmt: (v: number) => String(v) },
                {
                  label: t('stats.trainingTime'),
                  av: statsA.durationSec,
                  bv: statsB.durationSec,
                  fmt: (v: number) => fmtDuration(v, 'compact'),
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-2 px-3.5 py-2.5"
                >
                  <span className="min-w-0 truncate text-secondary text-muted">{row.label}</span>
                  <span className="tnum w-[4.5rem] truncate text-right text-secondary font-semibold text-ink">
                    {row.fmt(row.av)}
                  </span>
                  <span className="tnum w-[4.5rem] truncate text-right text-secondary text-faint">
                    {row.fmt(row.bv)}
                  </span>
                </div>
              ))}
            </Card>
          )}
        </section>
      )}

      {distribution.length > 0 && (
        <section className="mt-6">
          <SectionTitle>{t('stats.muscleDistribution')}</SectionTitle>
          <Card className="p-4">
            <BarChart
              data={distribution}
              ariaLabel={t('stats.muscleDistribution')}
              formatValue={(v) => `${Math.round(v)} ${t('common.sets')}`}
            />
          </Card>
        </section>
      )}

      {mostTrained.length > 0 && (
        <section className="mt-6">
          <SectionTitle>{t('stats.mostTrained')}</SectionTitle>
          <Card className="divide-y divide-line">
            {mostTrained.map((x, i) => (
              <button
                key={x.id}
                onClick={() => navigate(`/progress/${x.id}`)}
                className="press flex w-full items-center gap-3 px-3.5 py-2.5 text-left"
              >
                <span className="tnum w-5 shrink-0 text-xs font-bold text-faint">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{x.name}</span>
                <span className="tnum shrink-0 text-sm font-semibold">{x.n}</span>
              </button>
            ))}
          </Card>
        </section>
      )}
    </>
  )
}
