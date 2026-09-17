import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { Button, Card, ConfirmDialog, IconButton, Select, TextArea, TextField, cx } from '../components/ui/primitives'
import { IconArrowRight, IconChart, IconStar, IconTrash } from '../components/ui/Icon'
import {
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
  type Equipment,
  type Exercise,
  type ExerciseType,
  type MuscleGroup,
} from '../lib/db/schema'
import { deleteExercise, getExercise, saveExercise, toggleFavoriteExercise } from '../lib/db/repo.exercises'
import { logsForExercise } from '../lib/db/repo.sessions'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useApp, useT } from '../store/useApp'
import { incrementSourceForEquipment, ladderFor } from '../lib/training/weights'
import { fmtWeight, trimNum } from '../lib/format'
import { toast } from '../store/useToast'

export default function ExerciseDetail() {
  const { id = '' } = useParams()
  const t = useT()
  const navigate = useNavigate()
  const settings = useApp((s) => s.settings)
  const [ex, setEx] = useState<Exercise | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data } = useLiveQuery(
    async () => {
      const [exercise, logs] = await Promise.all([getExercise(id), logsForExercise(id)])
      return { exercise, logs }
    },
    ['exercises', 'exerciseLogs'],
    [id],
  )

  useEffect(() => {
    if (data?.exercise && !ex) setEx(data.exercise)
  }, [data, ex])

  if (!ex) {
    return (
      <Page title={t('library.title')} back>
        <div className="skeleton h-40 w-full" />
      </Page>
    )
  }

  async function update(patch: Partial<Exercise>) {
    if (!ex) return
    const next = { ...ex, ...patch }
    setEx(next)
    await saveExercise(next)
  }

  const ladder = ladderFor(ex.incrementSource, settings.availableWeights)
  const sessions = data?.logs.length ?? 0

  return (
    <Page
      title={ex.name}
      subtitle={`${t(`muscle.${ex.muscleGroup}`)} · ${sessions} ${t('progress.sessions').toLowerCase()}`}
      back
      actions={
        <>
          <IconButton
            label={t('common.favorite')}
            onClick={async () => {
              await toggleFavoriteExercise(ex.id)
              setEx({ ...ex, isFavorite: !ex.isFavorite })
            }}
          >
            <IconStar size={20} className={ex.isFavorite ? 'text-pr' : ''} />
          </IconButton>
          <IconButton label={t('common.delete')} tone="danger" onClick={() => setConfirmDelete(true)}>
            <IconTrash size={19} />
          </IconButton>
        </>
      }
    >
      {sessions > 0 && (
        <button
          onClick={() => navigate(`/progress/${ex.id}`)}
          className="press card mb-4 flex w-full items-center gap-3 p-4 text-left"
        >
          <IconChart size={20} className="text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-card-sm">{t('progress.title')}</span>
            <span className="block text-xs text-faint">{t('library.usedIn', { n: sessions })}</span>
          </span>
          <IconArrowRight size={18} className="text-faint" />
        </button>
      )}

      <div className="space-y-4">
        <TextField label={t('common.name')} defaultValue={ex.name} onChange={(e) => update({ name: e.target.value })} />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label={t('common.muscle')}
            value={ex.muscleGroup}
            onChange={(v: MuscleGroup) => update({ muscleGroup: v })}
            options={MUSCLE_GROUPS.map((m) => ({ value: m, label: t(`muscle.${m}`) }))}
          />
          <Select
            label={t('common.equipment')}
            value={ex.equipment}
            onChange={(v: Equipment) =>
              update({ equipment: v, incrementSource: incrementSourceForEquipment(v) })
            }
            options={EQUIPMENT.map((e) => ({ value: e, label: t(`equipment.${e}`) }))}
          />
          <Select
            label={t('common.type')}
            value={ex.type}
            onChange={(v: ExerciseType) => update({ type: v })}
            options={EXERCISE_TYPES.map((x) => ({ value: x, label: t(`type.${x}`) }))}
          />
          <Select
            label={t('library.incrementSource')}
            value={ex.incrementSource}
            onChange={(v) => update({ incrementSource: v })}
            options={(['dumbbell', 'barbell', 'machine', 'cable', 'bodyweight'] as const).map((s) => ({
              value: s,
              label: t(`source.${s}`),
            }))}
          />
        </div>

        <TextField
          label={t('library.primaryMuscle')}
          defaultValue={ex.primaryMuscle}
          onChange={(e) => update({ primaryMuscle: e.target.value })}
        />

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('library.targetSets')}
            inputMode="numeric"
            defaultValue={String(ex.defaultSets)}
            onChange={(e) => update({ defaultSets: Math.max(1, Number(e.target.value) || 1) })}
          />
          <TextField
            label={`${t('library.restDefault')} (s)`}
            inputMode="numeric"
            defaultValue={String(ex.restSeconds)}
            onChange={(e) => update({ restSeconds: Math.max(0, Number(e.target.value) || 0) })}
          />
          <TextField
            label={`${t('library.repRange')} ${t('common.min')}`}
            inputMode="numeric"
            defaultValue={String(ex.repMin)}
            onChange={(e) => update({ repMin: Math.max(1, Number(e.target.value) || 1) })}
          />
          <TextField
            label={`${t('library.repRange')} ${t('common.max')}`}
            inputMode="numeric"
            defaultValue={String(ex.repMax)}
            onChange={(e) => update({ repMax: Math.max(1, Number(e.target.value) || 1) })}
          />
          <TextField
            label={t('library.rirTarget')}
            inputMode="numeric"
            defaultValue={ex.rirTarget === null ? '' : String(ex.rirTarget)}
            onChange={(e) => update({ rirTarget: e.target.value === '' ? null : Number(e.target.value) })}
          />
          <TextField
            label={t('library.rpeTarget')}
            inputMode="numeric"
            defaultValue={ex.rpeTarget === null ? '' : String(ex.rpeTarget)}
            onChange={(e) => update({ rpeTarget: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </div>

        <TextArea
          label={t('library.instructions')}
          defaultValue={ex.instructions}
          onChange={(e) => update({ instructions: e.target.value })}
        />

        <TextField
          label={t('library.referenceUrl')}
          placeholder="https://"
          defaultValue={ex.referenceUrl}
          onChange={(e) => update({ referenceUrl: e.target.value })}
        />

        <Card className="p-4">
          <p className="label-xs mb-2">{t('settings.availableWeights')}</p>
          <p className="text-xs leading-relaxed text-faint">
            {t('settings.weightsHint')}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ladder.slice(0, 18).map((w) => (
              <span key={w} className="tnum rounded-md bg-elevated px-2 py-0.5 text-caption text-muted">
                {trimNum(w)}
              </span>
            ))}
            {ladder.length > 18 && <span className="text-caption text-faint">+{ladder.length - 18}</span>}
          </div>
          <p className="mt-2 text-caption text-faint">
            {t('common.min')}: {fmtWeight(ladder[0] ?? 0, settings.units)} · {t('common.max')}:{' '}
            {fmtWeight(ladder[ladder.length - 1] ?? 0, settings.units)}
          </p>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => navigate('/settings')}>
            {t('settings.title')} →
          </Button>
        </Card>

        <p className={cx('text-center text-caption', ex.isCustom ? 'text-accent' : 'text-faint')}>
          {ex.isCustom ? t('common.custom') : t('library.builtIn')}
        </p>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={t('common.delete')}
        body={t('library.deleteWarning')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteExercise(ex.id)
          toast(t('common.delete'), 'success')
          navigate('/library', { replace: true })
        }}
      />
    </Page>
  )
}
