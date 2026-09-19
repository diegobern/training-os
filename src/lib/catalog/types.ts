import type {
  CardioMetric,
  CardioMode,
  Equipment,
  ExerciseKind,
  ExerciseType,
  MuscleGroup,
} from '../db/schema'

/** Which of a translation's two states a string is in. */
export type TranslationStatus = 'missing' | 'machine' | 'reviewed'

export interface LocalizedText {
  en: string
  es: string
}

/**
 * One entry of the built-in catalog, exactly as it is stored in
 * `public/catalog/v{n}/exercises.json`.
 *
 * The field names are short because there are 1096 of these and the file is
 * downloaded over a phone connection; `n` for name saves 25KB across the
 * catalog. They are expanded into a normal shape by `toExercise()` the moment
 * they are read, so nothing outside this module sees the abbreviations.
 */
export interface CatalogEntryRaw {
  id: string
  slug: string
  kind: ExerciseKind
  /** name */
  n: LocalizedText
  /** name translation status */
  ns: TranslationStatus
  /** aliases, for search and for deduplication */
  a?: string[]
  /** muscle group */
  mg: MuscleGroup
  /** primary muscle label */
  pm: LocalizedText
  /** secondary muscle groups */
  sm?: MuscleGroup[]
  /** equipment */
  eq: Equipment
  /** movement type */
  t: ExerciseType
  /** difficulty */
  d: 'beginner' | 'intermediate' | 'advanced'
  /** weight increment ladder */
  inc: 'dumbbell' | 'barbell' | 'machine' | 'cable' | 'bodyweight'
  /** defaults copied into a routine */
  def: { sets: number; repMin: number; repMax: number; restSeconds: number }
  /** cardio metrics this exercise can record */
  cm?: CardioMetric[]
  /** cardio mode, for filtering */
  cmo?: CardioMode
  /** media manifest key, absent when the exercise has no illustration */
  m?: string
  /**
   * Where that illustration comes from.
   *   illustrated  this exercise's own drawing (Workout Guide or Everkinetic)
   *   variant      an equivalent movement's drawing, named on screen
   *   none         no drawing at all
   */
  mediaStatus?: 'illustrated' | 'variant' | 'none'
  /** The movement actually drawn, when `mediaStatus` is 'variant'. */
  mv?: { id: string; en: string; es: string }
  /** which source this came from */
  src: string
  hasInstructions: boolean
  /** true for the hand-written, bilingual, reviewed entries */
  curated?: boolean
}

export interface CatalogFile {
  catalogVersion: number
  generatedAt: string
  counts: Record<string, number>
  exercises: CatalogEntryRaw[]
}

export interface MediaIndex {
  version: number
  entries: Record<string, { s: string | null; m: string | null; e: string | null }>
}

export interface InstructionEntry {
  en: string[]
  es: string[] | null
  esStatus: TranslationStatus
  cueEn?: string
  cueEs?: string
  source: { name: string; id: string; url: string | null; license: string }
}

export type InstructionFile = Record<string, InstructionEntry>

export interface MediaAttribution {
  exerciseId: string
  externalId: string
  slug: string
  startImage: string | null
  midImage: string | null
  endImage: string | null
  source: string
  sourceUrl: string
  originalAuthor: string
  originalSource: string | null
  originalSourceUrl: string | null
  license: string
  licenseUrl: string
  attribution: string
  changes: string | null
}

export interface MediaAttributionFile {
  version: number
  generatedAt: string
  entries: Record<string, MediaAttribution>
}
