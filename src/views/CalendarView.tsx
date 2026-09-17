import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, IconButton, StatTile, cx } from '../components/ui/primitives'
import { IconChevronLeft, IconChevronRight } from '../components/ui/Icon'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { listSessions, sessionTotals } from '../lib/db/repo.sessions'
import { useApp, useT } from '../store/useApp'
import { addDays, dateKey, endOfMonth, fmtDate, startOfMonth, startOfWeek } from '../lib/dates'
import { fmtDuration, fmtVolume } from '../lib/format'
import { weekStreak } from '../lib/training/stats'

export function CalendarView() {
  const t = useT()
  const navigate = useNavigate()
  const { settings, locale } = useApp()
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState<string | null>(null)

  const { data: sessions } = useLiveQuery(() => listSessions(), ['sessions'])

  const byDay = useMemo(() => {
    const map = new Map<string, typeof list>()
    const list = sessions ?? []
    for (const s of list) {
      const k = dateKey(s.startedAt)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(s)
    }
    return map
  }, [sessions])

  const monthStart = startOfMonth(cursor)
  const monthEnd = endOfMonth(cursor)
  const gridStart = startOfWeek(monthStart, settings.weekStartsOn)
  const cells = useMemo(() => {
    const out: Date[] = []
    let d = gridStart
    while (d <= monthEnd || out.length % 7 !== 0) {
      out.push(new Date(d))
      d = addDays(d, 1)
      if (out.length > 42) break
    }
    return out
  }, [gridStart.getTime(), monthEnd.getTime()])

  const monthSessions = (sessions ?? []).filter(
    (s) => s.startedAt >= monthStart.getTime() && s.startedAt <= monthEnd.getTime(),
  )
  const monthTime = monthSessions.reduce((a, s) => a + s.durationSec, 0)
  const streak = weekStreak(sessions ?? [], settings.weekStartsOn)

  const weekdayLabels = useMemo(() => {
    const base = startOfWeek(new Date(), settings.weekStartsOn)
    return Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(addDays(base, i)),
    )
  }, [locale, settings.weekStartsOn])

  const selectedSessions = selected ? (byDay.get(selected) ?? []) : []

  return (
    <>
      {/*
        Root cause of the old overflow: three tiles were forced into three
        columns at every width. At 360 px each column is ~104 px, and the label
        "Entrenamientos" is a single 14-character word with letter-spacing that
        has nowhere to break — so it ran straight out of its card. The fix is
        both halves of the problem: shorter labels for this compact row, and
        `break-words` on the tile itself (see StatTile) so no label can ever
        escape its box again, whatever text lands in it.
      */}
      <div className="mb-md grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <StatTile
          label={t('calendar.thisMonthShort')}
          value={monthSessions.length}
          sub={t('common.workouts')}
          tone={monthSessions.length ? 'accent' : 'default'}
        />
        <StatTile label={t('calendar.streakShort')} value={t('home.streakWeeks', { n: streak })} />
        <StatTile
          label={t('calendar.timeShort')}
          value={fmtDuration(monthTime, 'compact')}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <Card className="p-2 sm:p-3">
        <div className="mb-2 flex items-center justify-between">
          <IconButton label="prev" size="sm" onClick={() => setCursor(startOfMonth(addDays(monthStart, -1)))}>
            <IconChevronLeft size={18} />
          </IconButton>
          <p className="min-w-0 truncate px-1 text-card-sm first-letter:uppercase">
            {fmtDate(monthStart.getTime(), locale, { month: 'long', year: 'numeric' })}
          </p>
          <IconButton label="next" size="sm" onClick={() => setCursor(startOfMonth(addDays(monthEnd, 1)))}>
            <IconChevronRight size={18} />
          </IconButton>
        </div>

        <div className="grid grid-cols-7 gap-[3px] sm:gap-1">
          {weekdayLabels.map((w, i) => (
            <div key={i} className="py-1 text-center text-2xs font-bold uppercase text-faint">
              {w}
            </div>
          ))}
          {cells.map((d) => {
            const key = dateKey(d)
            const inMonth = d.getMonth() === monthStart.getMonth()
            const list = byDay.get(key)
            const isToday = key === dateKey(new Date())
            return (
              <button
                key={key}
                onClick={() => setSelected(list ? key : null)}
                className={cx(
                  'press relative flex aspect-square items-center justify-center rounded-lg text-secondary tabular-nums transition-colors',
                  !inMonth && 'opacity-30',
                  list
                    ? 'bg-accent text-accent-ink font-bold'
                    : isToday
                      ? 'border border-accent/50 text-ink'
                      : 'text-muted hover:bg-elevated',
                  selected === key && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
                )}
                aria-label={key}
              >
                {d.getDate()}
                {list && list.length > 1 && (
                  <span className="absolute bottom-0.5 right-1 text-2xs font-bold">{list.length}</span>
                )}
              </button>
            )
          })}
        </div>

        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-caption text-faint">
          <span className="inline-block h-3 w-3 rounded bg-accent" /> {t('calendar.legend')}
        </p>
      </Card>

      {selected && (
        <section className="mt-4">
          <p className="label-xs mb-2">{fmtDate(selected, locale, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          {selectedSessions.length === 0 ? (
            <p className="text-sm text-faint">{t('calendar.noWorkout')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {selectedSessions.map((s) => {
                const totals = sessionTotals(s, settings.excludeWarmupsFromStats)
                return (
                  <button key={s.id} onClick={() => navigate(`/history/${s.id}`)} className="press w-full text-left">
                    <Card className="flex items-center gap-3 p-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-card">{s.dayName}</p>
                        <p className="tnum text-xs text-faint">
                          {fmtDuration(s.durationSec, 'compact')} · {totals.effectiveSets} {t('common.sets')} ·{' '}
                          {fmtVolume(totals.volume, settings.units)}
                        </p>
                      </div>
                      <IconChevronRight size={18} className="shrink-0 text-faint" />
                    </Card>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      )}
    </>
  )
}
