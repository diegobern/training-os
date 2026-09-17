import { useDeferredValue, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { Button, Card, Chip, EmptyState, IconButton, Select, Sheet, TextField, cx } from '../components/ui/primitives'
import { IconFilter, IconPlus, IconSearch, IconStar } from '../components/ui/Icon'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useIncremental } from '../hooks/useIncremental'
import { listExercises, toggleFavoriteExercise } from '../lib/db/repo.exercises'
import { exerciseUsageCounts, recentExerciseIds } from '../lib/db/repo.sessions'
import {
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
  type Equipment,
  type ExerciseType,
  type MuscleGroup,
} from '../lib/db/schema'
import { useT } from '../store/useApp'
import { CustomExerciseForm } from '../components/workout/CustomExerciseForm'

type Tab = 'all' | 'favorites' | 'recent' | 'custom'
type Kind = 'all' | 'strength' | 'cardio' | 'mobility'
type Difficulty = 'all' | 'beginner' | 'intermediate' | 'advanced'

const KINDS: Kind[] = ['all', 'strength', 'cardio', 'mobility']
const DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced']

/**
 * The library, now reading the shared catalog.
 *
 * Every filter that the catalog itself understands — kind, muscle, equipment,
 * movement type, difficulty, favourites, custom-only, and the search — is
 * handed to `listExercises` rather than applied to an array here. Two reasons:
 * difficulty only exists on the catalog entry and never reaches the `Exercise`
 * shape, and filtering 1096 entries once inside the resolver is cheaper than
 * resolving 1096 into objects in order to throw most of them away.
 *
 * Only "recent" stays local: it is an ordering over the user's own history,
 * which the catalog knows nothing about.
 */
export default function Library() {
  const t = useT()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all')
  const [equipment, setEquipment] = useState<Equipment | 'all'>('all')
  const [type, setType] = useState<ExerciseType | 'all'>('all')
  const [difficulty, setDifficulty] = useState<Difficulty>('all')
  const [kind, setKind] = useState<Kind>('all')
  const [tab, setTab] = useState<Tab>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  // Keeps typing smooth: the field updates on every keystroke, the 1096-entry
  // query runs on the value React has caught up to.
  const query = useDeferredValue(search)

  const { data, loading } = useLiveQuery(
    async () => {
      const [exercises, recent, usage] = await Promise.all([
        listExercises({
          search: query.trim() || undefined,
          muscleGroup: muscle,
          equipment,
          type,
          kind,
          difficulty,
          favoritesOnly: tab === 'favorites',
          customOnly: tab === 'custom',
        }),
        recentExerciseIds(40),
        exerciseUsageCounts(),
      ])
      return { exercises, recent, usage }
    },
    ['exercises', 'exerciseLogs', 'exercisePrefs'],
    [query, muscle, equipment, type, kind, difficulty, tab],
  )

  const list = useMemo(() => {
    const all = data?.exercises ?? []
    if (tab !== 'recent') return all
    const order = new Map((data?.recent ?? []).map((id, i) => [id, i]))
    return all.filter((e) => order.has(e.id)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  }, [data, tab])

  // Grouped by muscle the list is already broken into digestible sections, but
  // "all" is still 1096 rows of DOM. It grows as the user reaches the bottom.
  const { visible, sentinel, hasMore } = useIncremental(list, [query, muscle, equipment, type, kind, difficulty, tab], 60)

  const activeFilters =
    (muscle !== 'all' ? 1 : 0) +
    (equipment !== 'all' ? 1 : 0) +
    (type !== 'all' ? 1 : 0) +
    (difficulty !== 'all' ? 1 : 0)

  const grouped = useMemo(() => {
    if (tab === 'recent') return null
    const map = new Map<MuscleGroup, typeof list>()
    for (const e of visible) {
      if (!map.has(e.muscleGroup)) map.set(e.muscleGroup, [])
      map.get(e.muscleGroup)!.push(e)
    }
    return [...map.entries()].sort((a, b) => MUSCLE_GROUPS.indexOf(a[0]) - MUSCLE_GROUPS.indexOf(b[0]))
  }, [visible, tab])

  return (
    <Page
      title={t('library.title')}
      subtitle={t('library.subtitle')}
      back
      actions={
        <>
          <IconButton label={t('library.filters')} onClick={() => setFiltersOpen(true)}>
            <span className="relative">
              <IconFilter size={20} />
              {activeFilters > 0 && (
                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-accent" />
              )}
            </span>
          </IconButton>
          <IconButton label={t('library.custom')} tone="accent" onClick={() => setCreating(true)}>
            <IconPlus size={22} />
          </IconButton>
        </>
      }
    >
      <TextField
        placeholder={t('common.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoComplete="off"
      />

      {/* What it is — the axis cardio and mobility needed to become visible. */}
      <div className="scroll-x mt-3">
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

      <p className="mt-3 text-caption text-faint">
        {loading && !data ? t('library.loading') : t('library.count', { n: list.length })}
      </p>

      <div className="mt-3">
        {list.length === 0 ? (
          <EmptyState
            icon={<IconSearch size={26} />}
            title={t('library.empty')}
            body={t('library.emptyBody')}
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                {t('library.custom')}
              </Button>
            }
          />
        ) : grouped ? (
          grouped.map(([group, items]) => (
            <section key={group} className="mb-5">
              <h2 className="label-xs mb-2">
                {t(`muscle.${group}`)} <span className="text-faint/70">· {items.length}</span>
              </h2>
              <div className="flex flex-col gap-1.5">
                {items.map((ex) => (
                  <Card key={ex.id} className="flex items-center gap-2 px-3 py-2.5">
                    <button className="press min-w-0 flex-1 text-left" onClick={() => navigate(`/library/${ex.id}`)}>
                      <p className="truncate text-card-sm">{ex.name}</p>
                      <p className="truncate text-xs text-faint">
                        {t(`equipment.${ex.equipment}`)} · {ex.repMin}–{ex.repMax} {t('common.reps')}
                        {(data?.usage.get(ex.id) ?? 0) > 0 && ` · ${t('library.usedIn', { n: data!.usage.get(ex.id)! })}`}
                      </p>
                    </button>
                    <button
                      aria-label={t('common.favorite')}
                      onClick={() => void toggleFavoriteExercise(ex.id)}
                      className={cx('press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', ex.isFavorite ? 'text-pr' : 'text-faint')}
                    >
                      <IconStar size={17} />
                    </button>
                  </Card>
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="flex flex-col gap-1.5">
            {visible.map((ex) => (
              <Card key={ex.id} className="flex items-center gap-2 px-3 py-2.5">
                <button className="press min-w-0 flex-1 text-left" onClick={() => navigate(`/library/${ex.id}`)}>
                  <p className="truncate text-card-sm">{ex.name}</p>
                  <p className="truncate text-xs text-faint">
                    {t(`muscle.${ex.muscleGroup}`)} · {t(`equipment.${ex.equipment}`)}
                  </p>
                </button>
                <button
                  aria-label={t('common.favorite')}
                  onClick={() => void toggleFavoriteExercise(ex.id)}
                  className={cx('press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', ex.isFavorite ? 'text-pr' : 'text-faint')}
                >
                  <IconStar size={17} />
                </button>
              </Card>
            ))}
          </div>
        )}
        {hasMore && <div ref={sentinel} className="h-10" aria-hidden="true" />}
      </div>

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t('library.filters')}
        footer={
          <div className="flex gap-2">
            <Button
              full
              variant="secondary"
              onClick={() => {
                setMuscle('all')
                setEquipment('all')
                setType('all')
                setDifficulty('all')
              }}
            >
              {t('common.reset')}
            </Button>
            <Button full variant="primary" onClick={() => setFiltersOpen(false)}>
              {t('common.apply')}
            </Button>
          </div>
        }
      >
        <p className="label-xs mb-2">{t('common.muscle')}</p>
        <div className="flex flex-wrap gap-2">
          <Chip active={muscle === 'all'} onClick={() => setMuscle('all')}>
            {t('common.all')}
          </Chip>
          {MUSCLE_GROUPS.map((m) => (
            <Chip key={m} active={muscle === m} onClick={() => setMuscle(m)}>
              {t(`muscle.${m}`)}
            </Chip>
          ))}
        </div>

        <p className="label-xs mb-2 mt-5">{t('library.difficulty')}</p>
        <div className="flex flex-wrap gap-2">
          <Chip active={difficulty === 'all'} onClick={() => setDifficulty('all')}>
            {t('common.all')}
          </Chip>
          {DIFFICULTIES.map((d) => (
            <Chip key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>
              {t(`difficulty.${d}`)}
            </Chip>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Select
            label={t('common.equipment')}
            value={equipment}
            onChange={setEquipment}
            options={[{ value: 'all' as const, label: t('common.all') }, ...EQUIPMENT.map((e) => ({ value: e, label: t(`equipment.${e}`) }))]}
          />
          <Select
            label={t('common.type')}
            value={type}
            onChange={setType}
            options={[{ value: 'all' as const, label: t('common.all') }, ...EXERCISE_TYPES.map((e) => ({ value: e, label: t(`type.${e}`) }))]}
          />
        </div>
      </Sheet>

      <CustomExerciseForm
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(ex) => {
          setCreating(false)
          navigate(`/library/${ex.id}`)
        }}
      />
    </Page>
  )
}
