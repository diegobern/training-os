import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { Button, Card, ConfirmDialog, EmptyState, SectionTitle } from '../components/ui/primitives'
import { IconBolt, IconRoutines, IconTarget } from '../components/ui/Icon'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { listRoutines, nextDayIndex } from '../lib/db/repo.routines'
import { listSessions } from '../lib/db/repo.sessions'
import { useT, useApp } from '../store/useApp'
import { useWorkout } from '../store/useWorkout'
import { estimateDurationMinutes } from '../lib/training/stats'
import { fmtDuration } from '../lib/format'

export default function WorkoutStart() {
  const t = useT()
  const settings = useApp((s) => s.settings)
  const navigate = useNavigate()
  const session = useWorkout((s) => s.session)
  const begin = useWorkout((s) => s.begin)
  const discard = useWorkout((s) => s.discard)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [starting, setStarting] = useState(false)

  const { data } = useLiveQuery(
    async () => {
      const [routines, sessions] = await Promise.all([listRoutines(), listSessions({ limit: 1 })])
      return { routines, last: sessions[0] ?? null }
    },
    ['routines', 'sessions'],
  )

  const routines = data?.routines ?? []
  const active = routines.find((r) => r.isActive) ?? routines[0]
  const suggestedIdx = active ? nextDayIndex(active, data?.last?.dayId ?? null) : -1

  async function start(routineId: string | null, dayId: string | null) {
    if (starting) return
    setStarting(true)
    try {
      const routine = routineId ? (routines.find((r) => r.id === routineId) ?? null) : null
      const day = routine?.days.find((d) => d.id === dayId) ?? null
      await begin(routine, day, t('workout.startFree'))
      navigate('/workout/active')
    } finally {
      setStarting(false)
    }
  }

  if (session) {
    const elapsed = Math.round((Date.now() - session.startedAt - session.pausedMs) / 1000)
    return (
      <Page title={t('workout.title')}>
        <Card className="border-accent/40 bg-accent/[0.07] p-5">
          <p className="label-xs text-accent">{t('workout.inProgressTitle')}</p>
          <h2 className="mt-1.5 text-2xl font-bold tracking-tight">{session.dayName}</h2>
          <p className="tnum mt-1 text-sm text-muted">{fmtDuration(elapsed)}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">{t('workout.inProgressBody')}</p>
          <div className="mt-5 flex gap-2">
            <Button full size="lg" variant="primary" onClick={() => navigate('/workout/active')}>
              {t('workout.resume2')}
            </Button>
            <Button size="lg" variant="danger" onClick={() => setConfirmDiscard(true)}>
              {t('workout.discard2')}
            </Button>
          </div>
        </Card>

        <ConfirmDialog
          open={confirmDiscard}
          title={t('workout.discard')}
          body={t('workout.discardConfirm')}
          confirmLabel={t('workout.discard2')}
          cancelLabel={t('common.cancel')}
          destructive
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={async () => {
            setConfirmDiscard(false)
            await discard()
          }}
        />
      </Page>
    )
  }

  return (
    <Page title={t('workout.title')} subtitle={t('workout.chooseDay')}>
      {routines.length === 0 ? (
        <EmptyState
          icon={<IconRoutines size={28} />}
          title={t('workout.noRoutine')}
          body={t('workout.noRoutineBody')}
          action={
            <div className="flex flex-col gap-2">
              <Button variant="primary" onClick={() => navigate('/routines')}>
                {t('home.createRoutine')}
              </Button>
              <Button variant="secondary" onClick={() => start(null, null)} disabled={starting}>
                {t('workout.startFree')}
              </Button>
            </div>
          }
        />
      ) : (
        <>
          {routines.map((routine) => (
            <section key={routine.id} className="mb-5">
              <SectionTitle>
                {routine.name}
                {routine.isActive && <span className="ml-2 text-accent">· {t('routines.active')}</span>}
              </SectionTitle>
              {routine.days.length === 0 ? (
                <p className="text-sm text-faint">{t('routines.noDays')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {routine.days.map((day, i) => {
                    const sets = day.exercises.reduce((a, e) => a + e.targetSets, 0)
                    const est = estimateDurationMinutes(day.exercises.length, sets, settings.defaultRestSeconds)
                    const suggested = routine.id === active?.id && i === suggestedIdx
                    return (
                      <button
                        key={day.id}
                        disabled={starting}
                        onClick={() => start(routine.id, day.id)}
                        className={`press card flex w-full items-center gap-3 p-4 text-left transition-colors ${
                          suggested ? 'border-accent/50 bg-accent/[0.06]' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-card">{day.name}</p>
                            {suggested && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-2xs font-bold tracking-wide text-accent">
                                <IconTarget size={11} /> {t('home.nextWorkout')}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-faint">
                            {day.exercises.length} {t('common.exercises')} · {sets} {t('common.sets')}
                            {est > 0 && ` · ${t('home.estimated', { min: est })}`}
                          </p>
                        </div>
                        <IconBolt size={20} className={suggested ? 'text-accent' : 'text-faint'} />
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          ))}

          <Button full variant="outline" size="lg" onClick={() => start(null, null)} disabled={starting}>
            {t('workout.startFree')}
          </Button>
        </>
      )}
    </Page>
  )
}
