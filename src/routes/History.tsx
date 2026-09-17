import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { Card, EmptyState, IconButton, SectionTitle } from '../components/ui/primitives'
import { IconCalendar, IconClock, IconTrophy } from '../components/ui/Icon'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { listPRs, listSessions, sessionTotals } from '../lib/db/repo.sessions'
import { useApp, useT } from '../store/useApp'
import { fmtDate, fmtTime, monthKey } from '../lib/dates'
import { fmtDuration, fmtVolume } from '../lib/format'

export default function History() {
  const t = useT()
  const navigate = useNavigate()
  const { settings, locale } = useApp()

  const { data } = useLiveQuery(
    async () => {
      const [sessions, prs] = await Promise.all([listSessions(), listPRs()])
      return { sessions, prs }
    },
    ['sessions', 'personalRecords'],
  )

  const prCountBySession = useMemo(() => {
    const m = new Map<string, number>()
    for (const pr of data?.prs ?? []) m.set(pr.sessionId, (m.get(pr.sessionId) ?? 0) + 1)
    return m
  }, [data])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof sessions>()
    const sessions = data?.sessions ?? []
    for (const s of sessions) {
      const k = monthKey(s.startedAt)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(s)
    }
    return [...map.entries()]
  }, [data])

  const sessions = data?.sessions ?? []

  return (
    <Page
      title={t('history.title')}
      subtitle={sessions.length > 0 ? t('history.sessionsCount', { n: sessions.length }) : t('history.subtitle')}
      back
      actions={
        <IconButton label={t('calendar.title')} onClick={() => navigate('/calendar')}>
          <IconCalendar size={20} />
        </IconButton>
      }
    >
      {sessions.length === 0 ? (
        <EmptyState icon={<IconClock size={26} />} title={t('history.empty')} body={t('history.emptyBody')} />
      ) : (
        grouped.map(([month, list]) => (
          <section key={month} className="mb-6">
            <SectionTitle>
              {fmtDate(list[0].startedAt, locale, { month: 'long', year: 'numeric' })}
              <span className="ml-2 text-faint/70">· {list.length}</span>
            </SectionTitle>
            <div className="flex flex-col gap-2">
              {list.map((s) => {
                const totals = sessionTotals(s, settings.excludeWarmupsFromStats)
                const prCount = prCountBySession.get(s.id) ?? 0
                return (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/history/${s.id}`)}
                    className="press w-full text-left"
                  >
                    <Card className="flex items-center gap-3 p-3.5">
                      <div className="flex w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-elevated py-1.5">
                        <span className="tnum text-base font-bold leading-none">
                          {new Date(s.startedAt).getDate()}
                        </span>
                        <span className="text-2xs uppercase text-faint">
                          {fmtDate(s.startedAt, locale, { month: 'short' })}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-card">{s.dayName}</p>
                          {prCount > 0 && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-pr/15 px-1.5 py-0.5 text-2xs font-bold text-pr">
                              <IconTrophy size={10} /> {prCount}
                            </span>
                          )}
                          {s.demo && (
                            <span className="shrink-0 rounded-full bg-info/15 px-1.5 py-0.5 text-2xs font-bold text-info">
                              {t('common.demo')}
                            </span>
                          )}
                        </div>
                        <p className="tnum mt-0.5 text-xs text-faint">
                          {fmtTime(s.startedAt, locale)} · {fmtDuration(s.durationSec, 'compact')} ·{' '}
                          {totals.effectiveSets} {t('common.sets')} · {fmtVolume(totals.volume, settings.units)}
                        </p>
                      </div>
                    </Card>
                  </button>
                )
              })}
            </div>
          </section>
        ))
      )}
    </Page>
  )
}
