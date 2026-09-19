import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkout } from '../store/useWorkout'
import { useApp, useT } from '../store/useApp'
import {
  Button,
  Card,
  ConfirmDialog,
  IconButton,
  Sheet,
  TextArea,
  cx,
} from '../components/ui/primitives'
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconDots,
  IconPlus,
  IconTrash,
  IconX,
  IconHelp,
} from '../components/ui/Icon'
import { SetRow } from '../components/workout/SetRow'
import { RestTimerBar } from '../components/workout/RestTimerBar'
import { TargetCard } from '../components/workout/TargetCard'
import { fmtDuration } from '../lib/format'
import { SET_TYPES, type Exercise, type SetType } from '../lib/db/schema'
import { isLogged } from '../lib/training/metrics'
import { ExercisePicker } from '../components/workout/ExercisePicker'
import { getExercise, saveExercise } from '../lib/db/repo.exercises'
import { toast } from '../store/useToast'
import { HowToSheet } from '../components/exercise/HowToSheet'

function useElapsed(startedAt: number | undefined, pausedMs: number) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  if (!startedAt) return 0
  return Math.max(0, Math.round((now - startedAt - pausedMs) / 1000))
}

export default function WorkoutActive() {
  const t = useT()
  const navigate = useNavigate()
  const settings = useApp((s) => s.settings)
  const {
    session,
    loaded,
    currentIndex,
    previous,
    insights,
    setCurrentIndex,
    updateSet,
    toggleComplete,
    addSet,
    duplicateSet,
    removeSet,
    setSetType,
    setSessionNote,
    setExerciseSessionNote,
    addExercise,
    removeExercise,
    finish,
  } = useWorkout()

  const [optionsFor, setOptionsFor] = useState<{ exerciseId: string; setId: string } | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [libraryExercise, setLibraryExercise] = useState<Exercise | null>(null)
  const [howTo, setHowTo] = useState(false)

  const elapsed = useElapsed(session?.startedAt, session?.pausedMs ?? 0)

  const current = session?.exercises[currentIndex] ?? null

  useEffect(() => {
    if (!current) {
      setLibraryExercise(null)
      return
    }
    let alive = true
    void getExercise(current.exerciseId).then((ex) => {
      if (alive) setLibraryExercise(ex ?? null)
    })
    return () => {
      alive = false
    }
  }, [current?.exerciseId])

  const totals = useMemo(() => {
    if (!session) return { done: 0, total: 0 }
    let done = 0
    let total = 0
    for (const ex of session.exercises) {
      for (const s of ex.sets) {
        if (s.type === 'warmup' && settings.excludeWarmupsFromStats) continue
        total++
        if (s.completed) done++
      }
    }
    return { done, total }
  }, [session, settings.excludeWarmupsFromStats])

  useEffect(() => {
    if (loaded && !session) navigate('/workout', { replace: true })
  }, [loaded, session, navigate])

  if (!session) return null

  const prevLog = current ? previous[current.exerciseId] : null
  const insight = current ? insights[current.exerciseId] : null

  async function handleFinish() {
    const anyLogged = session!.exercises.some((e) => e.sets.some(isLogged))
    if (!anyLogged) {
      setConfirmFinish(true)
      return
    }
    const result = await finish()
    if (result) navigate('/workout/summary', { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {/* ------------------------------------------------------------ header */}
      <header
        className="sticky top-0 z-30 border-b border-line bg-bg/92 backdrop-blur-xl"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex h-14 max-w-lg items-center gap-2 px-2">
          <IconButton label={t('common.back')} onClick={() => navigate('/')}>
            <IconChevronDown size={22} />
          </IconButton>
          <div className="min-w-0 flex-1">
            <p className="truncate text-card-sm font-bold leading-tight">{session.dayName}</p>
            <p className="tnum text-xs leading-tight text-faint">
              {fmtDuration(elapsed)} · {t('workout.progress', { done: totals.done, total: totals.total })}
            </p>
          </div>
          <Button size="sm" variant="primary" onClick={handleFinish}>
            {t('common.done')}
          </Button>
        </div>
        <div className="mx-auto max-w-lg px-3 pb-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-elevated">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
              style={{ width: `${totals.total ? (totals.done / totals.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </header>

      {/* ------------------------------------------------- exercise switcher
          The add button is pinned OUTSIDE the scroller on purpose. It used to
          be the last chip inside it, which meant that on a five-exercise day
          it sat off the right edge — present, and invisible unless you
          happened to swipe the row. It is also the one control here that is
          not a navigation, so it reads as accent rather than as another chip. */}
      <div className="mx-auto w-full max-w-lg px-3 pt-3">
        <div className="flex items-center gap-2">
        <div className="scroll-x min-w-0 flex-1">
          {session.exercises.map((ex, i) => {
            const done = ex.sets.filter((s) => s.completed).length
            const all = ex.sets.length
            return (
              <button
                key={ex.id}
                onClick={() => setCurrentIndex(i)}
                className={cx(
                  'press flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                  i === currentIndex
                    ? 'border-accent/60 bg-accent/10 text-accent'
                    : done === all && all > 0
                      ? 'border-line bg-elevated text-muted'
                      : 'border-line bg-surface text-muted',
                )}
              >
                <span className="max-w-[9rem] truncate">{ex.name}</span>
                <span className="tnum opacity-70">
                  {done}/{all}
                </span>
              </button>
            )
          })}
        </div>
          <button
            onClick={() => setPickerOpen(true)}
            aria-label={t('workout.addExercise')}
            className="press flex shrink-0 items-center gap-1 rounded-full border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent"
          >
            <IconPlus size={15} /> {t('workout.addShort')}
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------- main area */}
      <main className="mx-auto w-full max-w-lg flex-1 px-3 pb-44 pt-3">
        {!current ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted">{t('workout.noExercises')}</p>
            <Button className="mt-4" variant="primary" onClick={() => setPickerOpen(true)}>
              {t('workout.addExercise')}
            </Button>
          </Card>
        ) : (
          <>
            <div className="mb-3 flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="text-metric-lg">{current.name}</h2>
                <p className="mt-0.5 text-xs text-faint">
                  {t(`muscle.${current.muscleGroup}`)} · {current.repMin}–{current.repMax} {t('common.reps')}
                  {current.rirTarget !== null && ` · RIR ${current.rirTarget}`}
                </p>
              </div>
              <IconButton label={t('common.more')} onClick={() => setNotesOpen(true)}>
                <IconDots size={20} />
              </IconButton>
            </div>

            {insight && (
              <div className="mb-3">
                <TargetCard insight={insight} />
              </div>
            )}

            {/* last time vs today */}
            {prevLog && (
              <Card className="mb-3 px-3.5 py-3">
                <p className="label-xs mb-2">{t('workout.lastTime')}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {prevLog.sets.map((s, i) => (
                    <span key={s.id} className="tnum text-sm text-muted">
                      <span className="text-faint">{i + 1}</span>{' '}
                      {s.weight} × {s.reps}
                      {s.rir !== null && <span className="text-faint"> @{s.rir}</span>}
                    </span>
                  ))}
                </div>
              </Card>
            )}

            {/* set table */}
            <Card className="px-2 py-2">
              <div className="flex items-center gap-1.5 px-1 pb-1.5 pt-1">
                <span className="w-9 shrink-0 text-center text-2xs font-bold tracking-wide text-faint">#</span>
                <span className="min-w-0 flex-1 text-center text-2xs font-bold tracking-wide text-faint">
                  {settings.units.toUpperCase()}
                </span>
                <span className="w-[4.25rem] shrink-0 text-center text-2xs font-bold tracking-wide text-faint">
                  {t('workout.repsShort')}
                </span>
                <span className="w-12 shrink-0 text-center text-2xs font-bold tracking-wide text-faint">
                  {settings.intensityMetric.toUpperCase()}
                </span>
                <span className="w-11 shrink-0" />
              </div>

              <div className="flex flex-col gap-1.5">
                {current.sets.map((s, i) => (
                  <SetRow
                    key={s.id}
                    set={s}
                    index={i}
                    units={settings.units}
                    intensityMetric={settings.intensityMetric}
                    placeholderWeight={prevLog?.sets[i]?.weight ?? null}
                    placeholderReps={prevLog?.sets[i]?.reps ?? null}
                    onChange={(patch) => updateSet(current.exerciseId, s.id, patch)}
                    onToggle={() => void toggleComplete(current.exerciseId, s.id)}
                    onOpenOptions={() => setOptionsFor({ exerciseId: current.exerciseId, setId: s.id })}
                  />
                ))}
              </div>

              <button
                onClick={() => addSet(current.exerciseId)}
                className="press mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-sm font-semibold text-muted hover:text-ink"
              >
                <IconPlus size={16} /> {t('workout.addSet')}
              </button>
            </Card>

            {/* A discreet way in, right under the sets. It opens a sheet — the
                session screen stays mounted, so closing it returns to the very
                set that was being typed. */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setHowTo(true)}
                className="press flex items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-secondary font-semibold text-muted hover:text-ink"
              >
                <IconHelp size={16} />
                {t('howto.button')}
              </button>
              {/* The second way in, where you are when you decide you want one
                  more exercise: at the bottom of the sets you have just
                  finished, not at the far end of a row you have to swipe. */}
              <button
                onClick={() => setPickerOpen(true)}
                className="press flex items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-secondary font-semibold text-muted hover:text-ink"
              >
                <IconPlus size={16} />
                {t('workout.addExercise')}
              </button>
            </div>

            {libraryExercise?.instructions && (
              <Card className="mt-3 px-3.5 py-3">
                <p className="label-xs mb-1.5">{t('workout.exerciseNotes')}</p>
                <p className="text-secondary text-muted">{libraryExercise.instructions}</p>
              </Card>
            )}

            {current.sessionNote && (
              <Card className="mt-3 px-3.5 py-3">
                <p className="label-xs mb-1.5">{t('workout.sessionNotes')}</p>
                <p className="text-secondary text-muted">{current.sessionNote}</p>
              </Card>
            )}

            <div className="mt-4 flex gap-2">
              <Button
                variant="secondary"
                size="md"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                icon={<IconChevronLeft size={16} />}
              >
                {t('workout.prevExercise')}
              </Button>
              <Button
                full
                variant="secondary"
                size="md"
                disabled={currentIndex >= session.exercises.length - 1}
                onClick={() => setCurrentIndex(Math.min(session.exercises.length - 1, currentIndex + 1))}
              >
                {t('workout.nextExercise')}
                <IconChevronRight size={16} />
              </Button>
            </div>
          </>
        )}

        <Button
          full
          size="xl"
          variant="primary"
          className="mt-6"
          onClick={handleFinish}
        >
          {t('workout.finish')}
        </Button>
      </main>

      <RestTimerBar />

      {/* -------------------------------------------------------- set options */}
      <Sheet
        open={!!optionsFor}
        onClose={() => setOptionsFor(null)}
        title={t('workout.setType')}
      >
        {optionsFor && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {SET_TYPES.map((type: SetType) => {
                const active =
                  session.exercises
                    .find((e) => e.exerciseId === optionsFor.exerciseId)
                    ?.sets.find((s) => s.id === optionsFor.setId)?.type === type
                return (
                  <button
                    key={type}
                    onClick={() => {
                      setSetType(optionsFor.exerciseId, optionsFor.setId, type)
                      setOptionsFor(null)
                    }}
                    className={cx(
                      'press rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-colors',
                      active ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line bg-elevated text-muted',
                    )}
                  >
                    {t(`setType.${type}`)}
                  </button>
                )
              })}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                variant="secondary"
                icon={<IconCopy size={16} />}
                onClick={() => {
                  duplicateSet(optionsFor.exerciseId, optionsFor.setId)
                  setOptionsFor(null)
                }}
              >
                {t('workout.duplicateSet')}
              </Button>
              <Button
                variant="danger"
                icon={<IconTrash size={16} />}
                onClick={() => {
                  removeSet(optionsFor.exerciseId, optionsFor.setId)
                  setOptionsFor(null)
                }}
              >
                {t('workout.deleteSet')}
              </Button>
            </div>
          </>
        )}
      </Sheet>

      {/* ------------------------------------------------------------- notes */}
      <Sheet open={notesOpen} onClose={() => setNotesOpen(false)} title={current?.name ?? ''}>
        {current && (
          <div className="space-y-5">
            <div>
              <TextArea
                label={t('workout.exerciseNotes')}
                hint={t('workout.exerciseNotesHint')}
                defaultValue={libraryExercise?.instructions ?? ''}
                onBlur={async (e) => {
                  if (!libraryExercise) return
                  const value = e.target.value
                  if (value === libraryExercise.instructions) return
                  const saved = await saveExercise({ ...libraryExercise, instructions: value })
                  setLibraryExercise(saved)
                  toast(t('status.saved'), 'success')
                }}
              />
            </div>
            <div>
              <TextArea
                label={t('workout.sessionNotes')}
                hint={t('workout.sessionNotesHint')}
                defaultValue={current.sessionNote}
                onBlur={(e) => setExerciseSessionNote(current.exerciseId, e.target.value)}
              />
            </div>
            <div>
              <TextArea
                label={`${t('workout.sessionNotes')} — ${session.dayName}`}
                defaultValue={session.notes}
                onBlur={(e) => setSessionNote(e.target.value)}
              />
            </div>
            <Button
              full
              variant="danger"
              icon={<IconX size={16} />}
              onClick={() => {
                setNotesOpen(false)
                setConfirmRemove(current.exerciseId)
              }}
            >
              {t('workout.removeExercise')}
            </Button>
          </div>
        )}
      </Sheet>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        excludeIds={session.exercises.map((e) => e.exerciseId)}
        onPick={async (ex) => {
          await addExercise(ex)
          setPickerOpen(false)
          setCurrentIndex(session.exercises.length)
        }}
      />

      <ConfirmDialog
        open={!!confirmRemove}
        title={t('workout.removeExercise')}
        body={t('common.deleteConfirm')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => {
          if (confirmRemove) removeExercise(confirmRemove)
          setConfirmRemove(null)
        }}
      />

      <ConfirmDialog
        open={confirmFinish}
        title={t('workout.finish')}
        body={t('workout.finishEmpty')}
        confirmLabel={t('workout.discard2')}
        cancelLabel={t('common.cancel')}
        destructive
        onCancel={() => setConfirmFinish(false)}
        onConfirm={async () => {
          setConfirmFinish(false)
          await useWorkout.getState().discard()
          navigate('/', { replace: true })
        }}
      />

      {/* Mounted at the root of the screen, not inside the exercise card: the
          session stays exactly as it was underneath, so closing the sheet
          returns to the set that was being typed. */}
      <HowToSheet open={howTo} onClose={() => setHowTo(false)} exercise={libraryExercise} />
    </div>
  )
}
