import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { Card, ConfirmDialog, IconButton, SectionTitle, StatTile } from '../components/ui/primitives'
import { IconTrash, IconTrophy } from '../components/ui/Icon'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { deleteSession, getSession, prsForSession, sessionTotals } from '../lib/db/repo.sessions'
import { useApp, useT } from '../store/useApp'
import { fmtDate, fmtTime } from '../lib/dates'
import { fmtDuration, fmtVolumeFull, fmtWeight, trimNum } from '../lib/format'
import { isLogged, SET_TYPE_SHORT } from '../lib/training/metrics'
import { aggregateSets } from '../lib/training/metrics'

export default function SessionDetail() {
  const { id = '' } = useParams()
  const t = useT()
  const navigate = useNavigate()
  const { settings, locale } = useApp()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data } = useLiveQuery(
    async () => {
      const [session, prs] = await Promise.all([getSession(id), prsForSession(id)])
      return { session, prs }
    },
    ['sessions', 'personalRecords'],
    [id],
  )

  const session = data?.session
  if (!session) {
    return (
      <Page title={t('history.title')} back>
        <div className="skeleton h-40 w-full" />
      </Page>
    )
  }

  const totals = sessionTotals(session, settings.excludeWarmupsFromStats)
  const prsByExercise = new Map<string, number>()
  for (const pr of data?.prs ?? []) prsByExercise.set(pr.exerciseId, (prsByExercise.get(pr.exerciseId) ?? 0) + 1)

  return (
    <Page
      title={session.dayName}
      subtitle={`${fmtDate(session.startedAt, locale, { weekday: 'short', day: 'numeric', month: 'long' })} · ${fmtTime(session.startedAt, locale)}`}
      back
      actions={
        <IconButton label={t('history.deleteSession')} tone="danger" onClick={() => setConfirmDelete(true)}>
          <IconTrash size={19} />
        </IconButton>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatTile label={t('common.duration')} value={fmtDuration(session.durationSec)} />
        <StatTile label={t('summary.workingSets')} value={totals.effectiveSets} sub={`${totals.totalReps} ${t('common.reps')}`} />
        <StatTile label={t('common.volume')} value={fmtVolumeFull(totals.volume, settings.units)} />
        <StatTile
          label={t('progress.prs')}
          value={data?.prs.length || '—'}
          tone={data?.prs.length ? 'pr' : 'default'}
        />
      </div>

      {session.notes && (
        <Card className="mt-4 px-3.5 py-3">
          <p className="label-xs mb-1.5">{t('workout.sessionNotes')}</p>
          <p className="text-secondary text-muted">{session.notes}</p>
        </Card>
      )}

      <section className="mt-6">
        <SectionTitle>{t('workout.exerciseList')}</SectionTitle>
        <div className="flex flex-col gap-2.5">
          {session.exercises.map((ex) => {
            const logged = ex.sets.filter(isLogged)
            const agg = aggregateSets(ex.sets, settings.excludeWarmupsFromStats)
            if (!logged.length) return null
            return (
              <Card key={ex.id} className="px-3.5 py-3">
                <div className="mb-2 flex items-start gap-2">
                  <button
                    className="press min-w-0 flex-1 text-left"
                    onClick={() => navigate(`/progress/${ex.exerciseId}`)}
                  >
                    <p className="truncate text-card">{ex.name}</p>
                    <p className="tnum text-xs text-faint">
                      {agg.effectiveSets} {t('common.sets')} · {fmtVolumeFull(agg.volume, settings.units)}
                    </p>
                  </button>
                  {prsByExercise.has(ex.exerciseId) && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-pr/15 px-1.5 py-0.5 text-2xs font-bold text-pr">
                      <IconTrophy size={10} /> {prsByExercise.get(ex.exerciseId)}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {logged.map((s, i) => (
                    <div key={s.id} className="tnum flex items-center gap-3 text-sm">
                      <span className="w-6 shrink-0 text-xs text-faint">{SET_TYPE_SHORT[s.type] || i + 1}</span>
                      <span className="font-semibold">
                        {fmtWeight(s.weight, settings.units, false)} {settings.units}
                      </span>
                      <span className="text-muted">× {s.reps}</span>
                      {settings.intensityMetric === 'rir' && s.rir !== null && (
                        <span className="text-faint">RIR {trimNum(s.rir)}</span>
                      )}
                      {settings.intensityMetric === 'rpe' && s.rpe !== null && (
                        <span className="text-faint">RPE {trimNum(s.rpe)}</span>
                      )}
                    </div>
                  ))}
                </div>
                {ex.sessionNote && <p className="mt-2 text-xs leading-relaxed text-muted">{ex.sessionNote}</p>}
              </Card>
            )
          })}
        </div>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title={t('history.deleteSession')}
        body={t('common.deleteConfirm')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteSession(session.id)
          navigate('/history', { replace: true })
        }}
      />
    </Page>
  )
}
