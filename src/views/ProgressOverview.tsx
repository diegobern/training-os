import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, EmptyState, SectionTitle, TextField } from '../components/ui/primitives'
import { IconChart, IconChevronRight, IconTrophy } from '../components/ui/Icon'
import { ColumnChart } from '../components/charts/ColumnChart'
import { BarChart } from '../components/charts/BarChart'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { exerciseUsageCounts, listPRs, logsInRange } from '../lib/db/repo.sessions'
import { listExercises } from '../lib/db/repo.exercises'
import { useApp, useT } from '../store/useApp'
import { addDays, fmtDate, startOfWeek } from '../lib/dates'
import { fmtVolume } from '../lib/format'
import { volumeByWeek, weeklySetsPerMuscle } from '../lib/training/stats'
import { MUSCLE_GROUPS } from '../lib/db/schema'

export function ProgressOverview() {
  const t = useT()
  const navigate = useNavigate()
  const { settings, locale } = useApp()
  const [search, setSearch] = useState('')

  const { data } = useLiveQuery(
    async () => {
      const [exercises, usage, prs] = await Promise.all([listExercises(), exerciseUsageCounts(), listPRs(50)])
      const logs = await logsInRange(addDays(new Date(), -370).getTime())
      return { exercises, usage, logs, prs }
    },
    ['exercises', 'exerciseLogs', 'personalRecords'],
  )

  const weekStart = startOfWeek(Date.now(), settings.weekStartsOn).getTime()
  const weekLogs = (data?.logs ?? []).filter((l) => l.performedAt >= weekStart)
  const setsPerMuscle = weeklySetsPerMuscle(weekLogs)
  const weekly = volumeByWeek(data?.logs ?? [], settings.weekStartsOn, 8)
  const hasHistory = (data?.logs.length ?? 0) > 0

  const trained = useMemo(() => {
    const usage = data?.usage ?? new Map()
    const q = search.trim().toLowerCase()
    return (data?.exercises ?? [])
      .filter((e) => (usage.get(e.id) ?? 0) > 0)
      .filter((e) => (q ? e.name.toLowerCase().includes(q) : true))
      .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0))
  }, [data, search])

  const muscleData = MUSCLE_GROUPS.filter((m) => (setsPerMuscle.get(m) ?? 0) > 0 || settings.weeklySetTargets[m])
    .map((m) => ({
      label: t(`muscle.${m}`),
      value: setsPerMuscle.get(m) ?? 0,
      target: settings.weeklySetTargets[m],
    }))
    .sort((a, b) => b.value - a.value)

  return (
    <>
      {!hasHistory ? (
        <EmptyState icon={<IconChart size={28} />} title={t('common.notEnoughData')} body={t('progress.noDataBody')} />
      ) : (
        <>
          <section className="mb-6">
            <SectionTitle>{t('progress.weeklyVolumeTitle')}</SectionTitle>
            <Card className="p-4">
              <p className="mb-3 text-xs text-faint">{t('progress.last8Weeks')}</p>
              <ColumnChart
                ariaLabel={t('progress.weeklyVolumeTitle')}
                data={weekly.map((w) => ({
                  label: fmtDate(w.start, locale, { day: 'numeric', month: 'numeric' }),
                  value: w.volume,
                }))}
                formatValue={(v) => fmtVolume(v, settings.units)}
              />
            </Card>
          </section>

          <section className="mb-6">
            <SectionTitle>{t('progress.muscleVolume')}</SectionTitle>
            <Card className="p-4">
              {muscleData.length === 0 ? (
                <p className="text-sm text-faint">{t('common.notEnoughData')}</p>
              ) : (
                <BarChart
                  data={muscleData}
                  ariaLabel={t('progress.muscleVolume')}
                  formatValue={(v) => String(Math.round(v))}
                  targetLabel={t('progress.weeklyTarget')}
                />
              )}
            </Card>
          </section>

          {(data?.prs.length ?? 0) > 0 && (
            <section className="mb-6">
              <SectionTitle
                action={
                  <button onClick={() => navigate('/prs')} className="-my-2 inline-flex min-h-[36px] items-center rounded-lg px-2 text-xs font-semibold text-accent">
                    {t('home.viewAll')}
                  </button>
                }
              >
                {t('pr.title')}
              </SectionTitle>
              <Card className="divide-y divide-line">
                {data!.prs.slice(0, 3).map((pr) => (
                  <button
                    key={pr.id}
                    onClick={() => navigate(`/progress/${pr.exerciseId}`)}
                    className="press flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
                  >
                    <IconTrophy size={15} className="shrink-0 text-pr" />
                    <span className="min-w-0 flex-1 truncate text-sm">{pr.exerciseName}</span>
                    <span className="shrink-0 text-xs text-faint">{fmtDate(pr.date, locale)}</span>
                  </button>
                ))}
              </Card>
            </section>
          )}

          <section>
            <SectionTitle>{t('progress.selectExercise')}</SectionTitle>
            <TextField
              placeholder={t('common.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
            <div className="mt-3 flex flex-col gap-1.5">
              {trained.length === 0 ? (
                <p className="py-6 text-center text-sm text-faint">{t('common.noResults')}</p>
              ) : (
                trained.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => navigate(`/progress/${ex.id}`)}
                    className="press card flex items-center gap-3 px-3.5 py-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-card-sm">{ex.name}</p>
                      <p className="text-xs text-faint">
                        {t(`muscle.${ex.muscleGroup}`)} · {t('library.usedIn', { n: data?.usage.get(ex.id) ?? 0 })}
                      </p>
                    </div>
                    <IconChevronRight size={18} className="shrink-0 text-faint" />
                  </button>
                ))
              )}
            </div>
          </section>
        </>
      )}

    </>
  )
}
