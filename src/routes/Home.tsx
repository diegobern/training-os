import { useNavigate } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { Button, Card, EmptyState, IconButton, SectionTitle, StatTile } from '../components/ui/primitives'
import {
  IconArrowRight,
  IconBolt,
  IconFlame,
  IconRoutines,
  IconSearch,
  IconTrophy,
} from '../components/ui/Icon'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { getActiveRoutine, listRoutines, nextDayIndex } from '../lib/db/repo.routines'
import { listPRs, listSessions, logsInRange, sessionTotals } from '../lib/db/repo.sessions'
import { useApp, useT } from '../store/useApp'
import { useWorkout } from '../store/useWorkout'
import { fmtDate, partOfDay, relativeDay, startOfWeek, addDays } from '../lib/dates'
import { fmtDuration, fmtVolume, fmtWeight, trimNum } from '../lib/format'
import { estimateDurationMinutes, statsFrom, volumeByWeek, weekStreak } from '../lib/training/stats'
import { ColumnChart } from '../components/charts/ColumnChart'

export default function Home() {
  const t = useT()
  const { settings, locale } = useApp()
  const navigate = useNavigate()
  const session = useWorkout((s) => s.session)

  const weekStart = startOfWeek(Date.now(), settings.weekStartsOn).getTime()

  const { data } = useLiveQuery(
    async () => {
      const [routines, activeRoutine, sessions, prs] = await Promise.all([
        listRoutines(),
        getActiveRoutine(),
        listSessions(),
        listPRs(4),
      ])
      const logs = await logsInRange(addDays(weekStart, -7 * 9).getTime())
      return { routines, activeRoutine, sessions, prs, logs }
    },
    ['routines', 'sessions', 'exerciseLogs', 'personalRecords'],
    [weekStart],
  )

  const greeting =
    partOfDay() === 'morning'
      ? t('home.goodMorning')
      : partOfDay() === 'afternoon'
        ? t('home.goodAfternoon')
        : t('home.goodEvening')

  const today = fmtDate(Date.now(), locale, { weekday: 'long', day: 'numeric', month: 'long' })

  const routine = data?.activeRoutine
  const sessions = data?.sessions ?? []
  const lastSession = sessions[0]
  const nextIdx = routine ? nextDayIndex(routine, lastSession?.dayId ?? null) : -1
  const nextDay = routine && nextIdx >= 0 ? routine.days[nextIdx] : null

  const weekSessions = sessions.filter((s) => s.startedAt >= weekStart)
  const weekStats = statsFrom(weekSessions, data?.logs ?? [])
  const prevWeekStart = addDays(weekStart, -7).getTime()
  const prevWeekSessions = sessions.filter((s) => s.startedAt >= prevWeekStart && s.startedAt < weekStart)
  const prevWeekStats = statsFrom(prevWeekSessions, data?.logs ?? [])
  const streak = weekStreak(sessions, settings.weekStartsOn)

  const plannedSets = nextDay?.exercises.reduce((a, e) => a + e.targetSets, 0) ?? 0
  const estMin = estimateDurationMinutes(nextDay?.exercises.length ?? 0, plannedSets, settings.defaultRestSeconds)

  const weekly = volumeByWeek(data?.logs ?? [], settings.weekStartsOn, 8)
  const hasVolumeHistory = weekly.some((w) => w.volume > 0)

  const lastTotals = lastSession ? sessionTotals(lastSession, settings.excludeWarmupsFromStats) : null

  const noRoutines = (data?.routines.length ?? 0) === 0

  return (
    <Page
      title={t('app.name')}
      subtitle={today}
      actions={
        <IconButton label={t('nav.search')} onClick={() => navigate('/search')}>
          <IconSearch size={20} />
        </IconButton>
      }
    >
      <p className="label-xs mb-3">{greeting}</p>

      {settings.demoDataPresent && (
        <button
          onClick={() => navigate('/settings')}
          className="press mb-4 flex w-full items-center gap-2 rounded-xl border border-info/40 bg-info/10 px-3 py-2 text-left"
        >
          <span className="shrink-0 rounded-md bg-info/20 px-1.5 py-0.5 text-2xs font-bold tracking-wide text-info">
            {t('common.demo')}
          </span>
          <span className="min-w-0 flex-1 text-xs leading-snug text-info">{t('home.demoActive')}</span>
        </button>
      )}

      {session && (
        <Card className="mb-4 border-accent/40 bg-accent/[0.07] p-4">
          <p className="label-xs text-accent">{t('home.inProgress')}</p>
          <p className="mt-1 text-lg font-bold tracking-tight">{session.dayName}</p>
          <Button
            full
            size="lg"
            variant="primary"
            className="mt-3"
            icon={<IconBolt size={18} />}
            onClick={() => navigate('/workout/active')}
          >
            {t('home.resumeWorkout')}
          </Button>
        </Card>
      )}

      {!session && noRoutines && (
        <EmptyState
          icon={<IconRoutines size={28} />}
          title={t('home.noWorkoutsYet')}
          body={t('home.noWorkoutsBody')}
          action={
            <Button variant="primary" size="lg" onClick={() => navigate('/routines')}>
              {t('home.createRoutine')}
            </Button>
          }
        />
      )}

      {!session && !noRoutines && (
        <Card className="mb-4 overflow-hidden">
          <div className="grid-noise px-4 pb-4 pt-4">
            <p className="label-xs">{t('home.nextWorkout')}</p>
            {nextDay ? (
              <>
                <h2 className="mt-1.5 text-hero">{nextDay.name}</h2>
                <p className="mt-2 text-sm text-muted">
                  {nextDay.exercises.length} {t('common.exercises')} · {plannedSets} {t('common.sets')}
                  {estMin > 0 && ` · ${t('home.estimated', { min: estMin })}`}
                </p>
                <p className="mt-0.5 text-xs text-faint">
                  {routine?.name}
                  {lastSession && ` · ${t('home.lastWorkout')}: ${relativeDay(lastSession.startedAt, locale)}`}
                </p>
              </>
            ) : (
              <>
                <h2 className="mt-1.5 text-xl font-bold tracking-tight">{t('home.noActiveRoutine')}</h2>
                <p className="mt-1.5 text-sm text-muted">{t('workout.noRoutineBody')}</p>
              </>
            )}
            <Button
              full
              size="xl"
              variant="primary"
              className="mt-4"
              icon={<IconBolt size={20} />}
              onClick={() => navigate('/workout')}
            >
              {t('home.startWorkout')}
            </Button>
          </div>
        </Card>
      )}

      {sessions.length > 0 && (
        <>
          <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <StatTile
              label={t('home.thisWeek')}
              value={weekStats.workouts}
              sub={
                weekStats.workouts === 0
                  ? t('home.noSessionsWeek')
                  : `${weekStats.effectiveSets} ${t('home.setsShort')}`
              }
              tone={weekStats.workouts > 0 ? 'accent' : 'default'}
            />
            <StatTile
              label={t('home.streak')}
              value={t('home.streakWeeks', { n: streak })}
              sub={streak > 0 ? undefined : t('common.notEnoughData')}
              tone={streak >= 2 ? 'accent' : 'default'}
            />
            <StatTile
              label={t('home.weeklyVolume')}
              value={fmtVolume(weekStats.volume, settings.units)}
              sub={
                prevWeekStats.volume > 0
                  ? `${weekStats.volume >= prevWeekStats.volume ? '↑' : '↓'} ${fmtVolume(Math.abs(weekStats.volume - prevWeekStats.volume), settings.units)} ${t('home.vsLastWeek')}`
                  : undefined
              }
            />
            <StatTile
              label={t('common.duration')}
              value={fmtDuration(weekStats.durationSec, 'compact')}
              sub={`${weekStats.reps} ${t('common.reps')}`}
            />
          </div>

          {lastSession && lastTotals && (
            <section className="mb-4">
              <SectionTitle>{t('home.lastWorkout')}</SectionTitle>
              <button
                onClick={() => navigate(`/history/${lastSession.id}`)}
                className="press card flex w-full items-center gap-3 p-4 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-card">{lastSession.dayName}</p>
                  <p className="mt-0.5 text-xs text-faint">
                    {fmtDate(lastSession.startedAt, locale, { day: 'numeric', month: 'short' })} ·{' '}
                    {fmtDuration(lastSession.durationSec, 'compact')}
                  </p>
                  <p className="tnum mt-1.5 text-sm text-muted">
                    {lastTotals.effectiveSets} {t('common.sets')} · {fmtVolume(lastTotals.volume, settings.units)}
                  </p>
                </div>
                <IconArrowRight size={18} className="shrink-0 text-faint" />
              </button>
            </section>
          )}

          {(data?.prs.length ?? 0) > 0 && (
            <section className="mb-4">
              <SectionTitle
                action={
                  <button onClick={() => navigate('/prs')} className="-my-2 inline-flex min-h-[36px] items-center rounded-lg px-2 text-xs font-semibold text-accent">
                    {t('home.viewAll')}
                  </button>
                }
              >
                {t('home.recentPRs')}
              </SectionTitle>
              <div className="flex flex-col gap-2">
                {data!.prs.map((pr) => (
                  <div key={pr.id} className="card flex items-center gap-3 px-3.5 py-3">
                    <IconTrophy size={18} className="shrink-0 text-pr" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{pr.exerciseName}</p>
                      <p className="text-xs text-faint">
                        {t(`pr.${pr.type}`)} · {fmtDate(pr.date, locale)}
                      </p>
                    </div>
                    <p className="tnum shrink-0 text-sm font-bold text-ink">
                      {pr.type === 'reps'
                        ? `${trimNum(pr.value)} ${t('common.reps')}`
                        : pr.type === 'volume'
                          ? fmtVolume(pr.value, settings.units)
                          : fmtWeight(pr.value, settings.units)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {hasVolumeHistory && (
            <section>
              <SectionTitle>{t('home.recentEvolution')}</SectionTitle>
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
          )}
        </>
      )}

      {sessions.length === 0 && !noRoutines && !session && (
        <div className="mt-4">
          <EmptyState
            icon={<IconFlame size={26} />}
            title={t('history.empty')}
            body={t('history.emptyBody')}
          />
        </div>
      )}
    </Page>
  )
}
