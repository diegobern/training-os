import { getDB } from './database'
import { deleteSynced, putSynced } from '../sync/queue'
import {
  newId,
  type BodyweightEntry,
  type MeasurementEntry,
  type MeasurementSite,
  type Milestone,
  type PhotoPose,
  type ProgressPhoto,
} from './schema'
import { dateKey } from '../dates'

/* -------------------------------------------------------------- bodyweight */

export async function listBodyweight(from = 0): Promise<BodyweightEntry[]> {
  const db = await getDB()
  const all = await db.getAll('bodyweight')
  return all
    .filter((b) => new Date(b.date).getTime() >= from || from === 0)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function addBodyweight(weightKg: number, date = dateKey(), notes = ''): Promise<void> {
  const db = await getDB()
  const all = await db.getAllFromIndex('bodyweight', 'by-date', date)
  const existing = all[0]
  const entry: BodyweightEntry = {
    id: existing?.id ?? newId(),
    date,
    weight: weightKg,
    notes,
    demo: false,
    createdAt: existing?.createdAt ?? Date.now(),
  }
  await putSynced('bodyweight', entry)
}

export async function deleteBodyweight(id: string): Promise<void> {
  await deleteSynced('bodyweight', id)
}

export function movingAverage(points: { x: number; y: number }[], window: number) {
  if (points.length < window) return []
  const out: { x: number; y: number }[] = []
  for (let i = window - 1; i < points.length; i++) {
    let sum = 0
    for (let j = i - window + 1; j <= i; j++) sum += points[j].y
    out.push({ x: points[i].x, y: sum / window })
  }
  return out
}

/* ------------------------------------------------------------ measurements */

export async function listMeasurements(): Promise<MeasurementEntry[]> {
  const db = await getDB()
  return (await db.getAll('measurements')).sort((a, b) => a.date.localeCompare(b.date))
}

export async function saveMeasurement(
  date: string,
  values: Partial<Record<MeasurementSite, number>>,
  notes = '',
): Promise<void> {
  const db = await getDB()
  const existing = (await db.getAllFromIndex('measurements', 'by-date', date))[0]
  const entry: MeasurementEntry = {
    id: existing?.id ?? newId(),
    date,
    values: { ...(existing?.values ?? {}), ...values },
    notes,
    demo: false,
    createdAt: existing?.createdAt ?? Date.now(),
  }
  await putSynced('measurements', entry)
}

export async function deleteMeasurement(id: string): Promise<void> {
  await deleteSynced('measurements', id)
}

/* ------------------------------------------------------------------ photos */

export async function listPhotos(): Promise<ProgressPhoto[]> {
  const db = await getDB()
  return (await db.getAll('photos')).sort((a, b) => b.date.localeCompare(a.date))
}

export async function addPhoto(
  blob: Blob,
  pose: PhotoPose,
  date = dateKey(),
  weight: number | null = null,
  notes = '',
  size: { width: number; height: number } = { width: 0, height: 0 },
): Promise<void> {
  const now = Date.now()
  await putSynced('photos', {
    id: newId(),
    date,
    pose,
    blob,
    storagePath: null,
    width: size.width,
    height: size.height,
    weight,
    notes,
    createdAt: now,
    updatedAt: now,
  })
}

export async function deletePhoto(id: string): Promise<void> {
  await deleteSynced('photos', id)
}

/** Downscale before storing — a phone photo is 4 MB and we only need a preview. */
export async function compressImage(file: File, maxSide = 1280, quality = 0.82): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return { blob: file as Blob, width: bitmap.width, height: bitmap.height }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  return { blob: blob ?? file, width: w, height: h }
}

/* -------------------------------------------------------------- milestones */

export async function listMilestones(): Promise<Milestone[]> {
  const db = await getDB()
  return (await db.getAll('milestones')).sort((a, b) => b.achievedAt - a.achievedAt)
}

export async function awardMilestone(
  key: string,
  meta: Record<string, string | number> = {},
): Promise<Milestone | null> {
  const db = await getDB()
  const existing = await db.getAllFromIndex('milestones', 'by-key', key)
  if (existing.length) return null
  const m: Milestone = { id: newId(), key, achievedAt: Date.now(), meta }
  await putSynced('milestones', m)
  return m
}
