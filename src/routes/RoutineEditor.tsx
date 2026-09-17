import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Sheet,
  TextArea,
  TextField,
  cx,
} from '../components/ui/primitives'
import {
  IconCopy,
  IconDots,
  IconList,
  IconPencil,
  IconPlus,
  IconRoutines,
  IconTrash,
} from '../components/ui/Icon'
import { SortableList, SortableRow } from '../components/ui/Sortable'
import { ExercisePicker } from '../components/workout/ExercisePicker'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { getRoutine, makeRoutineDay, makeRoutineExercise, saveRoutine } from '../lib/db/repo.routines'
import { getExercisesByIds } from '../lib/db/repo.exercises'
import { newId, type Routine, type RoutineExercise } from '../lib/db/schema'
import { useT } from '../store/useApp'
import { toast } from '../store/useToast'
import { fmtDuration } from '../lib/format'

export default function RoutineEditor() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const t = useT()

  const [routine, setRoutine] = useState<Routine | null>(null)
  const [dayIndex, setDayIndex] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [daysOpen, setDaysOpen] = useState(false)
  const [metaOpen, setMetaOpen] = useState(false)
  const [editing, setEditing] = useState<RoutineExercise | null>(null)
  const [confirmDeleteDay, setConfirmDeleteDay] = useState<string | null>(null)
  const [moveFor, setMoveFor] = useState<RoutineExercise | null>(null)

  const { data: loaded } = useLiveQuery(() => getRoutine(id), ['routines'], [id])

  useEffect(() => {
    if (loaded && !routine) setRoutine(loaded)
    if (loaded === undefined && !routine) {
      /* still loading */
    }
  }, [loaded, routine])

  const exerciseIds = useMemo(
    () => routine?.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)) ?? [],
    [routine],
  )
  const { data: library } = useLiveQuery(
    () => getExercisesByIds(exerciseIds),
    ['exercises'],
    [exerciseIds.join(',')],
  )

  async function persist(next: Routine) {
    setRoutine(next)
    await saveRoutine(next)
  }

  if (!routine) {
    return (
      <Page title={t('routines.title')} back>
        <div className="skeleton h-40 w-full" />
      </Page>
    )
  }

  const day = routine.days[dayIndex] ?? null

  function mutateDay(fn: (d: NonNullable<typeof day>) => void) {
    if (!day || !routine) return
    const next: Routine = {
      ...routine,
      days: routine.days.map((d) => (d.id === day.id ? { ...d, exercises: d.exercises.map((e) => ({ ...e })) } : d)),
    }
    const target = next.days.find((d) => d.id === day.id)!
    fn(target)
    void persist(next)
  }

  const totalSets = day?.exercises.reduce((a, e) => a + e.targetSets, 0) ?? 0

  return (
    <Page
      title={routine.name}
      subtitle={t('routines.dayCount', { n: routine.days.length })}
      back="/routines"
      actions={
        <>
          <IconButton label={t('common.edit')} onClick={() => setMetaOpen(true)}>
            <IconPencil size={19} />
          </IconButton>
          <IconButton label={t('routines.addDay')} onClick={() => setDaysOpen(true)}>
            <IconList size={20} />
          </IconButton>
        </>
      }
    >
      {routine.days.length === 0 ? (
        <EmptyState
          icon={<IconRoutines size={28} />}
          title={t('routines.noDays')}
          action={
            <Button
              variant="primary"
              onClick={() =>
                persist({ ...routine, days: [...routine.days, makeRoutineDay(t("routines.dayN", { n: routine.days.length + 1 }), routine.days.length)] })
              }
            >
              {t('routines.addDay')}
            </Button>
          }
        />
      ) : (
        <>
          <div className="scroll-x mb-4">
            {routine.days.map((d, i) => (
              <button
                key={d.id}
                onClick={() => setDayIndex(i)}
                className={cx(
                  'press flex shrink-0 flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors',
                  i === dayIndex ? 'border-accent/60 bg-accent/[0.08]' : 'border-line bg-surface',
                )}
              >
                <span className={cx('text-2xs font-bold tracking-wide', i === dayIndex ? 'text-accent' : 'text-faint')}>
                  {t('routines.dayN', { n: i + 1 })}
                </span>
                <span className="max-w-[9rem] truncate text-sm font-semibold">{d.name}</span>
              </button>
            ))}
            <button
              onClick={() =>
                persist({ ...routine, days: [...routine.days, makeRoutineDay(t("routines.dayN", { n: routine.days.length + 1 }), routine.days.length)] })
              }
              className="press flex shrink-0 items-center gap-1 rounded-xl border border-dashed border-line px-3 py-2 text-xs font-semibold text-faint"
            >
              <IconPlus size={14} /> {t('routines.addDay')}
            </button>
          </div>

          {day && (
            <>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-xl font-bold tracking-tight">{day.name}</h2>
                <p className="tnum text-xs text-faint">
                  {day.exercises.length} {t('common.exercises')} · {totalSets} {t('common.sets')}
                </p>
              </div>

              {day.exercises.length === 0 ? (
                <EmptyState title={t('routines.noExercises')} />
              ) : (
                <SortableList
                  ids={day.exercises.map((e) => e.id)}
                  onReorder={(from, to) =>
                    mutateDay((d) => {
                      const [m] = d.exercises.splice(from, 1)
                      d.exercises.splice(to, 0, m)
                      d.exercises = d.exercises.map((e, i) => ({ ...e, order: i }))
                    })
                  }
                >
                  <div className="flex flex-col gap-2">
                    {day.exercises.map((re) => {
                      const ex = library?.get(re.exerciseId)
                      return (
                        <SortableRow key={re.id} id={re.id} handleLabel={t('routines.reorderHint')}>
                          <Card className="flex items-center gap-2 px-3 py-2.5">
                            <button className="press min-w-0 flex-1 text-left" onClick={() => setEditing(re)}>
                              <p className="truncate text-card-sm">{ex?.name ?? t('common.unknown')}</p>
                              <p className="tnum truncate text-xs text-faint">
                                {re.targetSets} × {re.repMin}–{re.repMax}
                                {re.rirTarget !== null && ` · RIR ${re.rirTarget}`} · {fmtDuration(re.restSeconds)}
                              </p>
                            </button>
                            <IconButton label={t('common.more')} size="sm" onClick={() => setEditing(re)}>
                              <IconDots size={18} />
                            </IconButton>
                          </Card>
                        </SortableRow>
                      )
                    })}
                  </div>
                </SortableList>
              )}

              <Button full variant="outline" size="lg" className="mt-3" icon={<IconPlus size={18} />} onClick={() => setPickerOpen(true)}>
                {t('routines.addExercise')}
              </Button>
              <p className="mt-2 text-center text-caption text-faint">{t('routines.reorderHint')}</p>
            </>
          )}
        </>
      )}

      {/* ---------------------------------------------------- exercise picker */}
      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        multi
        excludeIds={day?.exercises.map((e) => e.exerciseId) ?? []}
        onPickMany={(list) => {
          mutateDay((d) => {
            list.forEach((ex, i) => d.exercises.push(makeRoutineExercise(ex, d.exercises.length + i)))
          })
          setPickerOpen(false)
        }}
      />

      {/* ------------------------------------------------- exercise settings */}
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={library?.get(editing?.exerciseId ?? '')?.name ?? ''}
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setMoveFor(editing)
                setEditing(null)
              }}
            >
              {t('routines.moveExercise')}
            </Button>
            <Button
              full
              variant="danger"
              icon={<IconTrash size={16} />}
              onClick={() => {
                const target = editing
                setEditing(null)
                mutateDay((d) => {
                  d.exercises = d.exercises.filter((e) => e.id !== target?.id).map((e, i) => ({ ...e, order: i }))
                })
              }}
            >
              {t('common.delete')}
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label={t('library.targetSets')}
                inputMode="numeric"
                defaultValue={String(editing.targetSets)}
                onChange={(e) => {
                  const v = Math.max(1, Number(e.target.value) || 1)
                  mutateDay((d) => {
                    const x = d.exercises.find((z) => z.id === editing.id)
                    if (x) x.targetSets = v
                  })
                }}
              />
              <TextField
                label={`${t('library.restDefault')} (s)`}
                inputMode="numeric"
                defaultValue={String(editing.restSeconds)}
                onChange={(e) => {
                  const v = Math.max(0, Number(e.target.value) || 0)
                  mutateDay((d) => {
                    const x = d.exercises.find((z) => z.id === editing.id)
                    if (x) x.restSeconds = v
                  })
                }}
              />
              <TextField
                label={`${t('library.repRange')} ${t('common.min')}`}
                inputMode="numeric"
                defaultValue={String(editing.repMin)}
                onChange={(e) => {
                  const v = Math.max(1, Number(e.target.value) || 1)
                  mutateDay((d) => {
                    const x = d.exercises.find((z) => z.id === editing.id)
                    if (x) x.repMin = v
                  })
                }}
              />
              <TextField
                label={`${t('library.repRange')} ${t('common.max')}`}
                inputMode="numeric"
                defaultValue={String(editing.repMax)}
                onChange={(e) => {
                  const v = Math.max(1, Number(e.target.value) || 1)
                  mutateDay((d) => {
                    const x = d.exercises.find((z) => z.id === editing.id)
                    if (x) x.repMax = v
                  })
                }}
              />
              <TextField
                label={t('library.rirTarget')}
                inputMode="numeric"
                defaultValue={editing.rirTarget === null ? '' : String(editing.rirTarget)}
                onChange={(e) => {
                  const v = e.target.value === '' ? null : Number(e.target.value)
                  mutateDay((d) => {
                    const x = d.exercises.find((z) => z.id === editing.id)
                    if (x) x.rirTarget = v
                  })
                }}
              />
              <TextField
                label={t('library.rpeTarget')}
                inputMode="numeric"
                defaultValue={editing.rpeTarget === null ? '' : String(editing.rpeTarget)}
                onChange={(e) => {
                  const v = e.target.value === '' ? null : Number(e.target.value)
                  mutateDay((d) => {
                    const x = d.exercises.find((z) => z.id === editing.id)
                    if (x) x.rpeTarget = v
                  })
                }}
              />
            </div>
            <TextArea
              label={t('common.notes')}
              defaultValue={editing.notes}
              onChange={(e) => {
                const v = e.target.value
                mutateDay((d) => {
                  const x = d.exercises.find((z) => z.id === editing.id)
                  if (x) x.notes = v
                })
              }}
            />
          </div>
        )}
      </Sheet>

      {/* ------------------------------------------------------- move to day */}
      <Sheet open={!!moveFor} onClose={() => setMoveFor(null)} title={t('routines.moveExercise')}>
        <div className="flex flex-col gap-2">
          {routine.days.map((d, i) => (
            <Button
              key={d.id}
              variant={i === dayIndex ? 'ghost' : 'secondary'}
              disabled={i === dayIndex}
              onClick={() => {
                if (!moveFor) return
                const next: Routine = {
                  ...routine,
                  days: routine.days.map((dd) => ({ ...dd, exercises: dd.exercises.map((e) => ({ ...e })) })),
                }
                const from = next.days[dayIndex]
                const to = next.days[i]
                from.exercises = from.exercises.filter((e) => e.id !== moveFor.id).map((e, k) => ({ ...e, order: k }))
                to.exercises.push({ ...moveFor, id: newId(), order: to.exercises.length })
                void persist(next)
                setMoveFor(null)
                toast(d.name, 'success')
              }}
            >
              {d.name}
            </Button>
          ))}
        </div>
      </Sheet>

      {/* ------------------------------------------------------- manage days */}
      <Sheet open={daysOpen} onClose={() => setDaysOpen(false)} title={t('routines.title')} size="full">
        <SortableList
          ids={routine.days.map((d) => d.id)}
          onReorder={(from, to) => {
            const days = [...routine.days]
            const [m] = days.splice(from, 1)
            days.splice(to, 0, m)
            void persist({ ...routine, days: days.map((d, i) => ({ ...d, order: i })) })
            setDayIndex(to)
          }}
        >
          <div className="flex flex-col gap-2">
            {routine.days.map((d, i) => (
              <SortableRow key={d.id} id={d.id}>
                <Card className="flex items-center gap-1.5 px-2.5 py-2">
                  <input
                    className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-card-sm outline-none"
                    defaultValue={d.name}
                    onChange={(e) => {
                      const v = e.target.value
                      const days = routine.days.map((x) => (x.id === d.id ? { ...x, name: v } : x))
                      void persist({ ...routine, days })
                    }}
                  />
                  <IconButton
                    label={t('routines.duplicateDay')}
                    size="sm"
                    onClick={() => {
                      const copy = {
                        ...d,
                        id: newId(),
                        name: `${d.name} (2)`,
                        exercises: d.exercises.map((e) => ({ ...e, id: newId() })),
                      }
                      const days = [...routine.days]
                      days.splice(i + 1, 0, copy)
                      void persist({ ...routine, days: days.map((x, k) => ({ ...x, order: k })) })
                    }}
                  >
                    <IconCopy size={16} />
                  </IconButton>
                  <IconButton
                    label={t('routines.deleteDay')}
                    size="sm"
                    tone="danger"
                    onClick={() => setConfirmDeleteDay(d.id)}
                  >
                    <IconTrash size={16} />
                  </IconButton>
                </Card>
              </SortableRow>
            ))}
          </div>
        </SortableList>
        <Button
          full
          variant="outline"
          className="mt-3"
          icon={<IconPlus size={16} />}
          onClick={() =>
            persist({ ...routine, days: [...routine.days, makeRoutineDay(t("routines.dayN", { n: routine.days.length + 1 }), routine.days.length)] })
          }
        >
          {t('routines.addDay')}
        </Button>
      </Sheet>

      {/* -------------------------------------------------------- routine meta */}
      <Sheet
        open={metaOpen}
        onClose={() => setMetaOpen(false)}
        title={t('common.edit')}
        footer={
          <Button full variant="primary" onClick={() => setMetaOpen(false)}>
            {t('common.done')}
          </Button>
        }
      >
        <div className="space-y-4">
          <TextField
            label={t('common.name')}
            defaultValue={routine.name}
            onChange={(e) => persist({ ...routine, name: e.target.value })}
          />
          <TextArea
            label={t('routines.description')}
            defaultValue={routine.description}
            onChange={(e) => persist({ ...routine, description: e.target.value })}
          />
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!confirmDeleteDay}
        title={t('routines.deleteDay')}
        body={t('common.deleteConfirm')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onCancel={() => setConfirmDeleteDay(null)}
        onConfirm={() => {
          const days = routine.days.filter((d) => d.id !== confirmDeleteDay).map((d, i) => ({ ...d, order: i }))
          void persist({ ...routine, days })
          setDayIndex(0)
          setConfirmDeleteDay(null)
        }}
      />

      <div className="h-2" />
      <button onClick={() => navigate('/library')} className="mt-6 w-full text-center text-xs font-semibold text-accent">
        {t('library.title')} →
      </button>
    </Page>
  )
}
