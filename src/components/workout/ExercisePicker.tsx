import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Button, Chip, Sheet, TextField, cx } from '../ui/primitives'
import { IconCheck, IconPlus, IconStar } from '../ui/Icon'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useIncremental } from '../../hooks/useIncremental'
import { listExercises, toggleFavoriteExercise } from '../../lib/db/repo.exercises'
import { recentExerciseIds } from '../../lib/db/repo.sessions'
import { MUSCLE_GROUPS, type Exercise, type MuscleGroup } from '../../lib/db/schema'
import { useT } from '../../store/useApp'
import { CustomExerciseForm } from './CustomExerciseForm'

type Tab = 'all' | 'favorites' | 'recent' | 'custom'
type Kind = 'all' | 'strength' | 'cardio' | 'mobility'

const KINDS: Kind[] = ['all', 'strength', 'cardio', 'mobility']

/**
 * Where an exercise is chosen — from a routine day, or mid-workout.
 *
 * It reads the same `listExercises` the library does, so the routine editor
 * and the session cannot end up offering different catalogs. The kind row is
 * what lets a cardio or mobility exercise be added to the very same routine
 * day as a bench press, which is the whole point of the catalog having those
 * three kinds in the first place.
 */
export function ExercisePicker({
  open,
  onClose,
  onPick,
  onPickMany,
  excludeIds = [],
  multi = false,
}: {
  open: boolean
  onClose: () => void
  onPick?: (ex: Exercise) => void | Promise<void>
  onPickMany?: (list: Exercise[]) => void | Promise<void>
  excludeIds?: string[]
  multi?: boolean
}) {
  const t = useT()
  const [search, setSearch] = useState('')
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all')
  const [kind, setKind] = useState<Kind>('all')
  const [tab, setTab] = useState<Tab>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  const query = useDeferredValue(search)

  // Each time the picker is opened it starts clean. Reopening it still filtered
  // by the last search is how someone adds one exercise, comes back for a
  // second and is told there is nothing to add.
  useEffect(() => {
    if (!open) return
    setSearch('')
    setMuscle('all')
    setKind('all')
    setTab('all')
    setSelected([])
  }, [open])

  const { data } = useLiveQuery(
    async () => {
      // Nothing is fetched until the sheet is opened: the catalog must never
      // be on the path of a screen that merely contains this component.
      if (!open) return { exercises: [], recent: [] as string[] }
      const [exercises, recent] = await Promise.all([
        listExercises({
          search: query.trim() || undefined,
          muscleGroup: muscle,
          kind,
          favoritesOnly: tab === 'favorites',
          customOnly: tab === 'custom',
        }),
        recentExerciseIds(30),
      ])
      return { exercises, recent }
    },
    ['exercises', 'exerciseLogs', 'exercisePrefs'],
    [open, query, muscle, kind, tab],
  )

  const list = useMemo(() => {
    const all = (data?.exercises ?? []).filter((e) => !excludeIds.includes(e.id))
    if (tab !== 'recent') return all
    const order = new Map((data?.recent ?? []).map((id, i) => [id, i]))
    return all.filter((e) => order.has(e.id)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, tab, excludeIds.join(',')])

  const { visible, sentinel, hasMore, total } = useIncremental(list, [query, muscle, kind, tab])

  const selectedExercises = (data?.exercises ?? []).filter((e) => selected.includes(e.id))

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="full"
      title={t('routines.addExercise')}
      footer={
        multi ? (
          <Button
            full
            size="lg"
            variant="primary"
            disabled={selected.length === 0}
            onClick={async () => {
              await onPickMany?.(selectedExercises)
              setSelected([])
            }}
          >
            {t('common.add')} {selected.length > 0 && `(${selected.length})`}
          </Button>
        ) : undefined
      }
    >
      <div className="sticky -top-4 z-10 -mx-4 -mt-4 mb-3 bg-surface px-4 pb-2 pt-4">
        <TextField
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
        <div className="scroll-x mt-2.5">
          {KINDS.map((k) => (
            <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
              {k === 'all' ? t('common.all') : t(`kind.${k}`)}
            </Chip>
          ))}
        </div>
        <div className="scroll-x mt-2">
          {(['all', 'favorites', 'recent', 'custom'] as Tab[]).map((k) => (
            <Chip key={k} active={tab === k} onClick={() => setTab(k)}>
              {k === 'all' ? t('common.all') : k === 'favorites' ? t('common.favorites') : k === 'recent' ? t('common.recent') : t('common.custom')}
            </Chip>
          ))}
        </div>
        <div className="scroll-x mt-2">
          <Chip active={muscle === 'all'} onClick={() => setMuscle('all')}>
            {t('common.muscle')}
          </Chip>
          {MUSCLE_GROUPS.map((m) => (
            <Chip key={m} active={muscle === m} onClick={() => setMuscle(muscle === m ? 'all' : m)}>
              {t(`muscle.${m}`)}
            </Chip>
          ))}
        </div>
      </div>

      <button
        onClick={() => setCreating(true)}
        className="press mb-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-3 text-sm font-semibold text-accent"
      >
        <IconPlus size={16} /> {t('library.custom')}
      </button>

      {list.length === 0 ? (
        <p className="py-10 text-center text-sm text-faint">{t('library.empty')}</p>
      ) : (
        <>
          <p className="mb-2 text-caption text-faint">{t('library.count', { n: total })}</p>
          <ul className="flex flex-col gap-1.5">
            {visible.map((ex) => {
              const isSelected = selected.includes(ex.id)
              return (
                <li key={ex.id}>
                  <div
                    className={cx(
                      'flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors',
                      isSelected ? 'border-accent/50 bg-accent/[0.07]' : 'border-line bg-elevated',
                    )}
                  >
                    <button
                      className="press min-w-0 flex-1 text-left"
                      onClick={() => {
                        if (multi) {
                          setSelected((s) => (s.includes(ex.id) ? s.filter((x) => x !== ex.id) : [...s, ex.id]))
                        } else {
                          void onPick?.(ex)
                        }
                      }}
                    >
                      <p className="truncate text-card-sm">{ex.name}</p>
                      <p className="truncate text-xs text-faint">
                        {t(`muscle.${ex.muscleGroup}`)} · {t(`equipment.${ex.equipment}`)} · {ex.repMin}–{ex.repMax}{' '}
                        {t('common.reps')}
                      </p>
                    </button>
                    {multi && isSelected && <IconCheck size={18} className="shrink-0 text-accent" />}
                    <button
                      aria-label={t('common.favorite')}
                      onClick={() => void toggleFavoriteExercise(ex.id)}
                      className={cx('press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', ex.isFavorite ? 'text-pr' : 'text-faint')}
                    >
                      <IconStar size={17} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          {hasMore && <div ref={sentinel} className="h-10" aria-hidden="true" />}
        </>
      )}

      <CustomExerciseForm
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(ex) => {
          setCreating(false)
          if (multi) setSelected((s) => [...s, ex.id])
          else void onPick?.(ex)
        }}
      />
    </Sheet>
  )
}
