import { es } from './es'
import { en } from './en'
import type { Language } from '../db/schema'

const DICTS: Record<Language, Record<string, string>> = { es, en }

export const LOCALES: Record<Language, string> = { es: 'es-ES', en: 'en-GB' }

export type TParams = Record<string, string | number>

export function translate(lang: Language, key: string, params?: TParams): string {
  const dict = DICTS[lang] ?? DICTS.en
  let value = dict[key] ?? DICTS.en[key]
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
