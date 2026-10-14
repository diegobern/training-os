import { es } from './es'
import { en } from './en'
import type { Exercise, Language, WorkoutSession } from '../db/schema'

const DICTS: Record<Language, Record<string, string>> = { es, en }

export const LOCALES: Record<Language, string> = { es: 'es-ES', en: 'en-GB' }

export type TParams = Record<string, string | number>

/*
 * Plurals.
 *
 * A count passed as the `n` parameter picks a variant of the key by the
 * language's own rules (Intl.PluralRules): `clave_one` says "1 serie" where
 * `clave` says "{n} series". A missing variant falls back to `clave_other` and
 * then to `clave` itself, so only the forms that actually differ need writing
 * — in practice `_one`, with the base key holding the plural. That fallback is
 * also what keeps Spanish right for its third category, `many` (1 000 000
 * ejercicios): it lands on the plural.
 *
 * Only a real number counts. A key without a count — `common.sets` used as a
 * column header — keeps reading the base key exactly as before.
 */
const pluralRules = new Map<Language, Intl.PluralRules>()

function pluralCategory(lang: Language, n: number): string {
  let rules = pluralRules.get(lang)
  if (!rules) {
    rules = new Intl.PluralRules(LOCALES[lang] ?? LOCALES.en)
    pluralRules.set(lang, rules)
  }
  return rules.select(n)
}

function lookup(lang: Language, key: string, count: number | undefined): string | undefined {
  const dict = DICTS[lang] ?? DICTS.en
  if (count === undefined) return dict[key]
  return dict[`${key}_${pluralCategory(lang, count)}`] ?? dict[`${key}_other`] ?? dict[key]
}

export function translate(lang: Language, key: string, params?: TParams): string {
  const n = params?.n
  const count = typeof n === 'number' && Number.isFinite(n) ? n : undefined
  let value = lookup(lang, key, count) ?? lookup('en', key, count)
  if (value === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`)
    return key
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return value
}

export type TFn = (key: string, params?: TParams) => string

export function makeT(lang: Language): TFn {
  return (key, params) => translate(lang, key, params)
}

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
]

/* ------------------------------------------------- text saved by the app */

/*
 * Some text is written into a record by the app itself, in whatever language
 * was active that day, and then shown for years: a free workout is saved as
 * "Entrenamiento libre", and every set log keeps the exercise's name as it was
 * spelled when it was logged. Shown as stored, a Spanish history reads Spanish
 * in an English app.
 *
 * The records are left exactly as they are — no schema change, nothing
 * rewritten. These helpers recognise that text when it is painted and put it
 * in the current language. What the person typed themselves (a routine day's
 * name, their own exercises) is never touched.
 */

/** What `key` says in every language the app speaks. */
export function inEveryLanguage(key: string, params?: TParams): string[] {
  return (Object.keys(DICTS) as Language[]).map((lang) => translate(lang, key, params))
}

/**
 * The name the app gives a free workout when nobody else names it. Before it
 * was translated, `startSession` fell back to this English word; sessions
 * saved that way must still be recognised.
 */
const LEGACY_FREE_WORKOUT_NAME = 'Workout'

/** True for the name the app saved for a free workout, in any language. */
export function isFreeWorkoutName(name: string): boolean {
  return name === LEGACY_FREE_WORKOUT_NAME || inEveryLanguage('workout.startFree').includes(name)
}

/**
 * A session's title in the current language. Only a session that belongs to
 * no routine day can be a free workout; a day the person happened to call
 * "Entrenamiento libre" is theirs and stays as written.
 */
export function sessionTitle(session: Pick<WorkoutSession, 'dayId' | 'dayName'>, t: TFn): string {
  if (session.dayId === null && isFreeWorkoutName(session.dayName)) return t('workout.startFree')
  return session.dayName
}

/**
 * An exercise's name in the current language, looked up by id in `current`
 * (the exercises as `getExercisesByIds` / `listExercises` resolve them now).
 *
 * The saved name is the fallback for anything the lookup no longer knows, and
 * it always wins for the person's own exercises: that is the name they wrote
 * at the time, not a translation.
 */
export function exerciseTitle(
  exerciseId: string,
  savedName: string,
  current: ReadonlyMap<string, Pick<Exercise, 'name' | 'isCustom'>> | undefined,
): string {
  const ex = current?.get(exerciseId)
  if (!ex || ex.isCustom || !ex.name) return savedName
  return ex.name
}
