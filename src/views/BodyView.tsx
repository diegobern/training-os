import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  IconButton,
  SectionTitle,
  Segmented,
  Sheet,
  TextArea,
  TextField,
  cx,
} from '../components/ui/primitives'
import { IconBody, IconCamera, IconPlus, IconRuler, IconTrash } from '../components/ui/Icon'
import { LineChart } from '../components/charts/LineChart'
import { useLiveQuery } from '../hooks/useLiveQuery'
import {
  addBodyweight,
  addPhoto,
  compressImage,
  deleteBodyweight,
  deleteMeasurement,
  deletePhoto,
  listBodyweight,
  listMeasurements,
  listPhotos,
  movingAverage,
  saveMeasurement,
} from '../lib/db/repo.body'
import { MEASUREMENT_SITES, type MeasurementSite, type PhotoPose, type ProgressPhoto } from '../lib/db/schema'
import { ensurePhotoBlob } from '../lib/sync/engine'
import { useApp, useT } from '../store/useApp'
import { BODY_PERIODS, bodyPeriodStart, dateKey, fmtDate, fromDateKey, type BodyPeriod } from '../lib/dates'
import { fmtWeight, fromDisplayWeight, toDisplayWeight, trimNum } from '../lib/format'
import { toast } from '../store/useToast'

type Tab = 'weight' | 'measurements' | 'photos'

/**
 * Shows a progress photo. When the photo belongs to the account but its bytes
 * are not on this device yet, they are fetched once from private Storage and
 * cached locally — nothing is downloaded until the photo is actually shown.
 */
function PhotoImage({ photo, alt, className }: { photo: ProgressPhoto; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let revoke: string | null = null
    let alive = true
    void (async () => {
      const blob = photo.blob ?? (await ensurePhotoBlob(photo))
      if (!alive) return
      if (!blob) {
        setFailed(true)
        return
      }
      revoke = URL.createObjectURL(blob)
      setUrl(revoke)
    })()
    return () => {
      alive = false
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [photo])

  if (failed) {
    return (
      <div className={cx(className, 'flex items-center justify-center bg-elevated text-faint')}>
        <IconCamera size={18} />
      </div>
    )
  }
  if (!url) return <div className={cx(className, 'skeleton')} />
  return <img src={url} alt={alt} className={className} loading="lazy" />
}

export function BodyView({ initialTab = 'weight' }: { initialTab?: Tab }) {
  const t = useT()
  const { settings, locale } = useApp()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [period, setPeriod] = useState<BodyPeriod>('30D')
  const [addOpen, setAddOpen] = useState(false)
  const [measureOpen, setMeasureOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ kind: Tab; id: string } | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [pendingPose, setPendingPose] = useState<PhotoPose>('front')

  const [weightInput, setWeightInput] = useState('')
  const [dateInput, setDateInput] = useState(dateKey())
  const [noteInput, setNoteInput] = useState('')
  const [measureDate, setMeasureDate] = useState(dateKey())
  const [measureValues, setMeasureValues] = useState<Partial<Record<MeasurementSite, string>>>({})

  const { data } = useLiveQuery(
    async () => {
      const [weights, measurements, photos] = await Promise.all([
        listBodyweight(),
        listMeasurements(),
        listPhotos(),
      ])
      return { weights, measurements, photos }
    },
    ['bodyweight', 'measurements', 'photos'],
  )

  const weights = data?.weights ?? []
  const from = bodyPeriodStart(period)
  const points = useMemo(
    () =>
      weights
        .map((w) => ({ x: fromDateKey(w.date).getTime(), y: w.weight }))
        .filter((p) => p.x >= from)
        .sort((a, b) => a.x - b.x),
    [weights, from],
  )
  const avg = useMemo(() => (points.length >= 7 ? movingAverage(points, 7) : []), [points])

  async function submitWeight() {
    const v = Number(weightInput.replace(',', '.'))
    if (!Number.isFinite(v) || v <= 0) return
    await addBodyweight(fromDisplayWeight(v, settings.units), dateInput, noteInput)
    setWeightInput('')
    setNoteInput('')
    setAddOpen(false)
    toast(t('status.saved'), 'success')
  }

  async function submitMeasurement() {
    const values: Partial<Record<MeasurementSite, number>> = {}
    for (const [k, v] of Object.entries(measureValues)) {
      const n = Number(String(v).replace(',', '.'))
      if (Number.isFinite(n) && n > 0) values[k as MeasurementSite] = n
    }
    if (Object.keys(values).length === 0) return
    await saveMeasurement(measureDate, values)
    setMeasureValues({})
    setMeasureOpen(false)
    toast(t('status.saved'), 'success')
  }

  async function onPickPhoto(file: File | undefined) {
    if (!file) return
    const { blob, width, height } = await compressImage(file)
    const latest = weights[weights.length - 1]
    await addPhoto(blob, pendingPose, dateKey(), latest?.weight ?? null, '', { width, height })
    toast(t('status.saved'), 'success')
  }

  const photosByDate = useMemo(() => {
    const map = new Map<string, typeof list>()
    const list = data?.photos ?? []
    for (const p of list) {
      if (!map.has(p.date)) map.set(p.date, [])
      map.get(p.date)!.push(p)
    }
    return [...map.entries()]
  }, [data])

  return (
    <>
      <div className="mb-md flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'weight', label: t('body.bodyweight') },
              { value: 'measurements', label: t('body.measurements') },
              { value: 'photos', label: t('body.photos') },
            ]}
          />
        </div>
        <IconButton
          label={tab === 'weight' ? t('body.addWeight') : tab === 'measurements' ? t('body.measurements') : t('body.addPhoto')}
          tone="accent"
          onClick={() =>
            tab === 'weight' ? setAddOpen(true) : tab === 'measurements' ? setMeasureOpen(true) : fileRef.current?.click()
          }
        >
          {tab === 'photos' ? <IconCamera size={21} /> : <IconPlus size={22} />}
        </IconButton>
      </div>

      {tab === 'weight' && (
        <div className="mt-4">
          {weights.length === 0 ? (
            <EmptyState
              icon={<IconBody size={26} />}
              title={t('body.empty')}
              body={t('body.emptyBody')}
              action={
                <Button variant="primary" onClick={() => setAddOpen(true)}>
                  {t('body.addWeight')}
                </Button>
              }
            />
          ) : (
            <>
              <Card className="p-4">
                {points.length < 2 ? (
                  <p className="py-8 text-center text-sm text-faint">{t('common.notEnoughData')}</p>
                ) : (
                  <LineChart
                    points={points}
                    baseline={avg.length ? avg : undefined}
                    height={200}
                    ariaLabel={t('body.bodyweight')}
                    formatY={(v) => fmtWeight(v, settings.units, false)}
                    formatX={(v) => fmtDate(v, locale, { day: 'numeric', month: 'short' })}
                  />
                )}
                <div className="scroll-x mt-3">
                  {BODY_PERIODS.map((p) => (
                    <Chip key={p} active={period === p} onClick={() => setPeriod(p)}>
                      {p}
                    </Chip>
                  ))}
                </div>
                {avg.length > 0 && (
                  <p className="mt-3 flex items-center gap-1.5 text-caption text-faint">
                    <span className="inline-block h-0.5 w-4 rounded bg-muted/60" /> {t('body.movingAvg')}
                  </p>
                )}
              </Card>

              <SectionTitle>{t('history.title')}</SectionTitle>
              <Card className="divide-y divide-line">
                {[...weights].reverse().map((w) => (
                  <div key={w.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className="min-w-0 flex-1 text-sm text-muted">
                      {fmtDate(w.date, locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span className="tnum text-sm font-semibold">{fmtWeight(w.weight, settings.units)}</span>
                    <IconButton
                      label={t('common.delete')}
                      size="sm"
                      tone="danger"
                      onClick={() => setConfirmDelete({ kind: 'weight', id: w.id })}
                    >
                      <IconTrash size={15} />
                    </IconButton>
                  </div>
                ))}
              </Card>
            </>
          )}
        </div>
      )}

      {tab === 'measurements' && (
        <div className="mt-4">
          {(data?.measurements.length ?? 0) === 0 ? (
            <EmptyState
              icon={<IconRuler size={26} />}
              title={t('body.measurementsEmpty')}
              action={
                <Button variant="primary" onClick={() => setMeasureOpen(true)}>
                  {t('common.add')}
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {[...(data?.measurements ?? [])].reverse().map((m) => (
                <Card key={m.id} className="px-3.5 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold">
                      {fmtDate(m.date, locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    <IconButton
                      label={t('common.delete')}
                      size="sm"
                      tone="danger"
                      onClick={() => setConfirmDelete({ kind: 'measurements', id: m.id })}
                    >
                      <IconTrash size={15} />
                    </IconButton>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {Object.entries(m.values).map(([site, value]) => (
                      <span key={site} className="tnum text-sm text-muted">
                        <span className="text-faint">{t(`site.${site}`)}</span> {trimNum(value as number)} {t('body.cm')}
                      </span>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'photos' && (
        <div className="mt-4">
          <Card className="mb-3 px-3.5 py-3">
            <p className="text-xs leading-relaxed text-muted">{t('body.photoPrivacy')}</p>
          </Card>
          <div className="scroll-x mb-3">
            {(['front', 'side', 'back'] as PhotoPose[]).map((p) => (
              <Chip key={p} active={pendingPose === p} onClick={() => setPendingPose(p)}>
                {t(`body.pose.${p}`)}
              </Chip>
            ))}
            <Chip onClick={() => fileRef.current?.click()}>
              <IconCamera size={14} /> {t('body.addPhoto')}
            </Chip>
          </div>
          {photosByDate.length === 0 ? (
            <EmptyState icon={<IconCamera size={26} />} title={t('body.noPhotos')} />
          ) : (
            photosByDate.map(([date, list]) => (
              <section key={date} className="mb-5">
                <p className="label-xs mb-2">{fmtDate(date, locale, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                <div className="grid grid-cols-3 gap-2">
                  {list.map((p) => (
                    <div key={p.id} className="relative overflow-hidden rounded-xl border border-line">
                      <PhotoImage photo={p} alt={t(`body.pose.${p.pose}`)} className="aspect-[3/4] w-full object-cover" />
                      <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-2xs font-bold text-white">
                        {t(`body.pose.${p.pose}`)}
                      </span>
                      <button
                        aria-label={t('common.delete')}
                        onClick={() => setConfirmDelete({ kind: 'photos', id: p.id })}
                        className="absolute bottom-1.5 right-1.5 rounded-lg bg-black/60 p-1.5 text-white"
                      >
                        <IconTrash size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void onPickPhoto(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
      )}

      {/* --------------------------------------------------------- add weight */}
      <Sheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t('body.addWeight')}
        footer={
          <Button full size="lg" variant="primary" onClick={submitWeight}>
            {t('common.save')}
          </Button>
        }
      >
        <div className="space-y-4">
          <TextField
            label={t('body.weightKg', { unit: settings.units })}
            inputMode="decimal"
            autoFocus
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            placeholder={
              weights.length
                ? trimNum(toDisplayWeight(weights[weights.length - 1].weight, settings.units), 1)
                : '75'
            }
          />
          <TextField label={t('common.date')} type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} />
          <TextArea label={t('common.notes')} value={noteInput} onChange={(e) => setNoteInput(e.target.value)} />
        </div>
      </Sheet>

      {/* --------------------------------------------------- add measurements */}
      <Sheet
        open={measureOpen}
        onClose={() => setMeasureOpen(false)}
        title={t('body.measurements')}
        size="full"
        footer={
          <Button full size="lg" variant="primary" onClick={submitMeasurement}>
            {t('common.save')}
          </Button>
        }
      >
        <TextField
          label={t('body.measurementDate')}
          type="date"
          value={measureDate}
          onChange={(e) => setMeasureDate(e.target.value)}
        />
        <div className="mt-4 grid grid-cols-2 gap-3">
          {MEASUREMENT_SITES.map((site) => (
            <TextField
              key={site}
              label={`${t(`site.${site}`)} (${t('body.cm')})`}
              inputMode="decimal"
              value={measureValues[site] ?? ''}
              onChange={(e) => setMeasureValues((v) => ({ ...v, [site]: e.target.value }))}
            />
          ))}
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!confirmDelete}
        title={t('common.delete')}
        body={t('common.deleteConfirm')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return
          if (confirmDelete.kind === 'weight') await deleteBodyweight(confirmDelete.id)
          if (confirmDelete.kind === 'measurements') await deleteMeasurement(confirmDelete.id)
          if (confirmDelete.kind === 'photos') await deletePhoto(confirmDelete.id)
          setConfirmDelete(null)
        }}
      />
    </>
  )
}
