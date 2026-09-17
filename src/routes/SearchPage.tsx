import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { Card, EmptyState, SectionTitle, TextField } from '../components/ui/primitives'
import { IconSearch } from '../components/ui/Icon'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { listExercises } from '../lib/db/repo.exercises'
import { listRoutines } from '../lib/db/repo.routines'
import { listSessions } from '../lib/db/repo.sessions'
import { useApp, useT } from '../store/useApp'
import { fmtDate } from '../lib/dates'

export default function SearchPage() {
  const t = useT()
  const navigate = useNavigate()
  const locale = useApp((s) => s.locale)
  const [q, setQ] = useState('')

  const { data } = useLiveQuery(
    async () => {
      const [exercises, routines, sessions] = await Promise.all([listExercises(), listRoutines(true), listSessions()])
      return { exercises, routines, sessions }
    },
    ['exercises', 'routines', 'sessions'],
  )

  const query = q.trim().toLowerCase()
  const ready = query.length >= 2

  const results = useMemo(() => {
    if (!ready || !data) return null
    const exercises = data.exercises.filter(
      (e) => e.name.toLowerCase().includes(query) || e.instructions.toLowerCase().includes(query),
    )
    const routines = data.routines.filter(
      (r) =>
        r.name.toLowerCase().includes(query) ||
        r.description.toLowerCase().includes(query) ||
        r.days.some((d) => d.name.toLowerCase().includes(query)),
    )
    const sessions = data.sessions.filter(
      (s) =>
        s.dayName.toLowerCase().includes(query) ||
        s.routineName.toLowerCase().includes(query) ||
        s.exercises.some((e) => e.name.toLowerCase().includes(query)),
    )
    const notes = data.sessions
      .flatMap((s) => [
        ...(s.notes.toLowerCase().includes(query) ? [{ session: s, text: s.notes, exercise: null as string | null }] : []),
        ...s.exercises
          .filter((e) => e.sessionNote.toLowerCase().includes(query))
          .map((e) => ({ session: s, text: e.sessionNote, exercise: e.name })),
      ])
      .slice(0, 20)
    return { exercises, routines, sessions, notes }
  }, [data, query, ready])

  const total = results ? results.exercises.length + results.routines.length + results.sessions.length + results.notes.length : 0

  return (
    <Page title={t('search.title')} back>
      <TextField
        placeholder={t('search.placeholder')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
        autoComplete="off"
      />

      {!ready && (
        <div className="mt-6">
          <EmptyState icon={<IconSearch size={26} />} title={t('search.empty')} body={t('search.typeMore')} />
        </div>
      )}

      {ready && total === 0 && (
        <div className="mt-6">
          <EmptyState title={t('common.noResults')} />
        </div>
      )}

      {results && results.exercises.length > 0 && (
        <section className="mt-6">
          <SectionTitle>{t('search.exercises')}</SectionTitle>
          <Card className="divide-y divide-line">
            {results.exercises.slice(0, 12).map((e) => (
              <button
                key={e.id}
                onClick={() => navigate(`/library/${e.id}`)}
                className="press flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{e.name}</span>
                <span className="shrink-0 text-xs text-faint">{t(`muscle.${e.muscleGroup}`)}</span>
              </button>
            ))}
          </Card>
        </section>
      )}

      {results && results.routines.length > 0 && (
        <section className="mt-6">
          <SectionTitle>{t('search.routines')}</SectionTitle>
          <Card className="divide-y divide-line">
            {results.routines.map((r) => (
              <button
                key={r.id}
                onClick={() => navigate(`/routines/${r.id}`)}
                className="press flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
                <span className="shrink-0 text-xs text-faint">{t('routines.dayCount', { n: r.days.length })}</span>
              </button>
            ))}
          </Card>
        </section>
      )}

      {results && results.sessions.length > 0 && (
        <section className="mt-6">
          <SectionTitle>{t('search.sessions')}</SectionTitle>
          <Card className="divide-y divide-line">
            {results.sessions.slice(0, 15).map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/history/${s.id}`)}
                className="press flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{s.dayName}</span>
                <span className="shrink-0 text-xs text-faint">{fmtDate(s.startedAt, locale)}</span>
              </button>
            ))}
          </Card>
        </section>
      )}

      {results && results.notes.length > 0 && (
        <section className="mt-6">
          <SectionTitle>{t('search.notes')}</SectionTitle>
          <Card className="divide-y divide-line">
            {results.notes.map((n, i) => (
              <button
                key={i}
                onClick={() => navigate(`/history/${n.session.id}`)}
                className="press w-full px-3.5 py-2.5 text-left"
              >
                <p className="text-xs text-faint">
                  {n.exercise ? `${n.exercise} · ` : ''}
                  {fmtDate(n.session.startedAt, locale)}
                </p>
                <p className="mt-0.5 line-clamp-2 text-sm text-muted">{n.text}</p>
              </button>
            ))}
          </Card>
        </section>
      )}
    </Page>
  )
}
