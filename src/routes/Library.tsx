import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { Button, Card, Chip, EmptyState, IconButton, Select, Sheet, TextField, cx } from '../components/ui/primitives'
import { IconFilter, IconPlus, IconSearch, IconStar } from '../components/ui/Icon'
import { useLiveQuery } from '../hooks/useLiveQuery'
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

export default function Library() {
  const t = useT()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all')
  const [equipment, setEquipment] = useState<Equipment | 'all'>('all')
  const [type, setType] = useState<ExerciseType | 'all'>('all')
  const [tab, setTab] = useState<Tab>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const { data } = useLiveQuery(
    async () => {
      const [exercises, recent, usage] = await Promise.all([
        listExercises(),
        recentExerciseIds(40),
        exerciseUsageCounts(),
      ])
      return { exercises, recent, usage }
    },
    ['exercises', 'exerciseLogs'],
  )

  const list = useMemo(() => {
    const all = data?.exercises ?? []
    const recentOrder = new Map((data?.recent ?? []).map((id, i) => [id, i]))
    const q = search.trim().toLowerCase()
    let out = all
    if (muscle !== 'all') out = out.filter((e) => e.muscleGroup === muscle)
    if (equipment !== 'all') out = out.filter((e) => e.equipment === equipment)
    if (type !== 'all') out = out.filter((e) => e.type === type)
    if (tab === 'favorites') out = out.filter((e) => e.isFavorite)
    if (tab === 'custom') out = out.filter((e) => e.isCustom)
    if (tab === 'recent') {
      out = out.filter((e) => recentOrder.has(e.id))
      out = [...out].sort((a, b) => (recentOrder.get(a.id) ?? 0) - (recentOrder.get(b.id) ?? 0))
    }
    if (q) out = out.filter((e) => e.name.toLowerCase().includes(q) || e.primaryMuscle.toLowerCase().includes(q))
    return out
  }, [data, search, muscle, equipment, type, tab])

  const activeFilters = (muscle !== 'all' ? 1 : 0) + (equipment !== 'all' ? 1 : 0) + (type !== 'all' ? 1 : 0)

  const grouped = useMemo(() => {
    if (tab === 'recent') return null
    const map = new Map<MuscleGroup, typeof list>()
    for (const e of list) {
      if (!map.has(e.muscleGroup)) map.set(e.muscleGroup, [])
      map.get(e.muscleGroup)!.push(e)
    }
    return [...map.entries()].sort((a, b) => MUSCLE_GROUPS.indexOf(a[0]) - MUSCLE_GROUPS.indexOf(b[0]))
  }, [list, tab])

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

      <div className="scroll-x mt-3">
        {(['all', 'favorites', 'recent', 'custom'] as Tab[]).map((k) => (
          <Chip key={k} active={tab === k} onClick={() => setTab(k)}>
            {k === 'all' ? t('common.all') : k === 'favorites' ? t('common.favorites') : k === 'recent' ? t('common.recent') : t('common.custom')}
          </Chip>
        ))}
      </div>

      <div className="mt-4">
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
            {list.map((ex) => (
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
