import { useState } from 'react'
import { Button, Select, Sheet, TextArea, TextField } from '../ui/primitives'
import {
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
  type Equipment,
  type Exercise,
  type ExerciseType,
  type MuscleGroup,
} from '../../lib/db/schema'
import { createExercise } from '../../lib/db/repo.exercises'
import { useT } from '../../store/useApp'
import { incrementSourceForEquipment } from '../../lib/training/weights'
import { toast } from '../../store/useToast'

export function CustomExerciseForm({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (ex: Exercise) => void
}) {
  const t = useT()
  const [name, setName] = useState('')
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('chest')
  const [equipment, setEquipment] = useState<Equipment>('dumbbell')
  const [type, setType] = useState<ExerciseType>('compound')
  const [sets, setSets] = useState('3')
  const [repMin, setRepMin] = useState('8')
  const [repMax, setRepMax] = useState('12')
  const [rir, setRir] = useState('1')
  const [rest, setRest] = useState('120')
  const [instructions, setInstructions] = useState('')

  async function submit() {
    if (!name.trim()) return
    const ex = await createExercise({
      name: name.trim(),
      muscleGroup,
      equipment,
      type,
      primaryMuscle: t(`muscle.${muscleGroup}`),
      defaultSets: Math.max(1, Number(sets) || 3),
      repMin: Math.max(1, Number(repMin) || 8),
      repMax: Math.max(Number(repMin) || 8, Number(repMax) || 12),
      rirTarget: rir === '' ? null : Number(rir),
      restSeconds: Math.max(0, Number(rest) || 120),
      instructions,
      incrementSource: incrementSourceForEquipment(equipment),
    })
    toast(t('status.saved'), 'success')
    setName('')
    setInstructions('')
    onCreated(ex)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="full"
      title={t('library.custom')}
      footer={
        <Button full size="lg" variant="primary" disabled={!name.trim()} onClick={submit}>
          {t('common.create')}
        </Button>
      }
    >
      <div className="space-y-4">
        <TextField label={t('common.name')} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label={t('common.muscle')}
            value={muscleGroup}
            onChange={setMuscleGroup}
            options={MUSCLE_GROUPS.map((m) => ({ value: m, label: t(`muscle.${m}`) }))}
          />
          <Select
            label={t('common.equipment')}
            value={equipment}
            onChange={setEquipment}
            options={EQUIPMENT.map((e) => ({ value: e, label: t(`equipment.${e}`) }))}
          />
          <Select
            label={t('common.type')}
            value={type}
            onChange={setType}
            options={EXERCISE_TYPES.map((x) => ({ value: x, label: t(`type.${x}`) }))}
          />
          <TextField label={t('library.targetSets')} inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value)} />
          <TextField label={`${t('library.repRange')} ${t('common.min')}`} inputMode="numeric" value={repMin} onChange={(e) => setRepMin(e.target.value)} />
          <TextField label={`${t('library.repRange')} ${t('common.max')}`} inputMode="numeric" value={repMax} onChange={(e) => setRepMax(e.target.value)} />
          <TextField label={t('library.rirTarget')} inputMode="numeric" value={rir} onChange={(e) => setRir(e.target.value)} />
          <TextField label={`${t('library.restDefault')} (s)`} inputMode="numeric" value={rest} onChange={(e) => setRest(e.target.value)} />
        </div>
        <TextArea label={t('library.instructions')} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </div>
    </Sheet>
  )
}
