/**
 * Los nombres de los ejercicios en español, y lo que cuelga de ellos.
 *
 * El importador traducía los nombres con reglas (`es-names.mjs`): 814 salían
 * marcados `machine` y muchos rotos — «Press de Banca con Barra Guillotine»,
 * «Sentadilla Completo», «Aductores de Aductores» — y 199 se quedaban en
 * inglés. La fuente de verdad pasa a ser `scripts/catalog/names-es.json`, que
 * esta etapa aplica sobre el catálogo publicado igual que
 * `es-instructions.mjs` aplica las instrucciones:
 *
 *     npm run catalog:es              aplica traducciones de nombres e instrucciones
 *     node scripts/catalog/es-exercise-names.mjs --check   sólo comprueba
 *
 * Lo que hace, y nada más:
 *   · `n.es` de cada ejercicio NO revisado por una persona sale de la fuente
 *     (los 83 `reviewed` no se tocan nunca); su `ns` pasa a `machine`, o se
 *     queda en `missing` si la traducción es idéntica al inglés.
 *   · `pm.es` (el músculo principal) cuando seguía en inglés: un diccionario
 *     fijo de 21 etiquetas, con las mismas palabras que ya usa el catálogo.
 *   · `mv.es`, el nombre del movimiento cuyo dibujo se reutiliza, se copia
 *     del nombre actual de ese ejercicio, para que nunca diga otra cosa.
 *   · `translationStatus` (`name` e `instructions`) vuelve a decir la verdad.
 *
 * El inglés, los ids y todo lo demás quedan como estaban.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { englishLeaks } from './es-glossary.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const NAMES_PATH = join(ROOT, 'scripts', 'catalog', 'names-es.json')
export const EXERCISES_PATH = join(ROOT, 'public', 'catalog', 'v2', 'exercises.json')
const INSTRUCTIONS_PATH = join(ROOT, 'public', 'catalog', 'v2', 'instructions.json')

/** El músculo principal que quedaba en inglés. Mismas palabras que el resto del catálogo. */
export const PRIMARY_MUSCLE_ES = {
  Cardiovascular: 'Cardiovascular',
  Chest: 'Pectoral',
  Shoulders: 'Hombros',
  Back: 'Espalda',
  Lats: 'Dorsales',
  Quads: 'Cuádriceps',
  Hamstrings: 'Isquiotibiales',
  Triceps: 'Tríceps',
  Core: 'Core',
  Legs: 'Piernas',
  'Rear Delts': 'Deltoides posterior',
  Biceps: 'Bíceps',
  Glutes: 'Glúteos',
  Adductors: 'Aductores',
  'Posterior Chain': 'Cadena posterior',
  Forearms: 'Antebrazos',
  'Upper Back': 'Espalda alta',
  'Lower Back': 'Lumbares',
  Calves: 'Gemelos',
  Mobility: 'Movilidad',
  Hips: 'Cadera',
}

/** Las que se dicen igual en los dos idiomas. */
export const SAME_IN_BOTH = new Set(['Cardiovascular', 'Core'])

/**
 * Nombres de ejercicio que en español se dicen en inglés y que, por eso, sí
 * pueden llevar palabras que en una frase serían inglés colado («up», «hip»).
 * Los mismos que admite el glosario (docs/GLOSARIO-INSTRUCCIONES-ES.md).
 */
export const LOAN_NAMES = ['hip thrust', 'muscle up', 'push press', 'face pull', 'good morning', 'hack squat']

/** Problemas de un nombre traducido; vacío si está bien. */
export function checkName(en, es) {
  const problems = []
  if (typeof es !== 'string' || !es.trim()) return ['vacío']
  if (es !== es.trim()) problems.push('espacios al principio o al final')
  if (/["<>]/.test(es)) problems.push('caracteres no permitidos')
  let rest = es.toLowerCase()
  for (const loan of LOAN_NAMES) rest = rest.split(loan).join(' ')
  const leaks = englishLeaks(rest)
  if (leaks.length) problems.push(`inglés: ${leaks.join(', ')}`)
  return problems
}

/**
 * Aplica la fuente de nombres a un catálogo ya cargado. Devuelve uno nuevo.
 */
export function applyNames(catalog, names, instructions) {
  const out = structuredClone(catalog)
  const report = { applied: 0, keptReviewed: 0, sameAsEnglish: [], invalid: [], untranslated: [], orphan: [], pm: 0 }

  for (const e of out.exercises) {
    if (e.ns === 'reviewed') {
      report.keptReviewed++
    } else if (typeof names[e.id] === 'string') {
      const es = names[e.id]
      const problems = checkName(e.n.en, es)
      if (problems.length) report.invalid.push({ id: e.id, problems })
      else {
        e.n = { ...e.n, es }
        e.ns = es === e.n.en ? 'missing' : 'machine'
        if (e.ns === 'missing') report.sameAsEnglish.push(e.id)
        else report.applied++
      }
    } else {
      report.untranslated.push(e.id)
    }

    if (e.pm && e.pm.es === e.pm.en && PRIMARY_MUSCLE_ES[e.pm.en] && PRIMARY_MUSCLE_ES[e.pm.en] !== e.pm.es) {
      e.pm = { ...e.pm, es: PRIMARY_MUSCLE_ES[e.pm.en] }
      report.pm++
    }
  }

  // Después de cambiar los nombres: el del dibujo prestado sale del donante.
  const byId = new Map(out.exercises.map((e) => [e.id, e]))
  for (const e of out.exercises) {
    if (!e.mv) continue
    const donor = byId.get(e.mv.id)
    if (donor) e.mv = { ...e.mv, en: donor.n.en, es: donor.n.es }
  }

  for (const e of out.exercises) {
    if (!e.translationStatus) continue
    e.translationStatus = {
      ...e.translationStatus,
      name: e.ns,
      instructions: instructions?.[e.id]?.esStatus ?? e.translationStatus.instructions,
    }
  }

  const ids = new Set(out.exercises.map((e) => e.id))
  for (const id of Object.keys(names)) if (!ids.has(id)) report.orphan.push(id)
  return { catalog: out, report }
}

function run(check) {
  const current = readFileSync(EXERCISES_PATH, 'utf8')
  const names = existsSync(NAMES_PATH) ? JSON.parse(readFileSync(NAMES_PATH, 'utf8')) : {}
  const instructions = JSON.parse(readFileSync(INSTRUCTIONS_PATH, 'utf8'))
  const { catalog, report } = applyNames(JSON.parse(current), names, instructions)
  const next = JSON.stringify(catalog)

  console.log(`Nombres aplicados:      ${report.applied}`)
  console.log(`Revisados (intactos):   ${report.keptReviewed}`)
  console.log(`Iguales al inglés:      ${report.sameAsEnglish.length}${report.sameAsEnglish.length ? '  ' + report.sameAsEnglish.join(', ') : ''}`)
  console.log(`Sin traducción:         ${report.untranslated.length}`)
  console.log(`No válidos:             ${report.invalid.length}`)
  for (const { id, problems } of report.invalid) console.log(`  ${id}: ${problems.join(' · ')}`)
  console.log(`Huérfanos:              ${report.orphan.length}`)
  console.log(`Músculos traducidos:    ${report.pm}`)

  if (check) {
    const ok = next === current && report.invalid.length === 0 && report.orphan.length === 0
    console.log(ok ? '\nEl catálogo publicado coincide con los nombres.' : '\nEl catálogo publicado NO coincide: ejecuta `npm run catalog:es`.')
    process.exit(ok ? 0 : 1)
  }
  if (next !== current) writeFileSync(EXERCISES_PATH, next)
  console.log(next === current ? '\nSin cambios.' : `\nEscrito ${EXERCISES_PATH}`)
}

if (process.argv[1] && process.argv[1].endsWith('es-exercise-names.mjs')) run(process.argv.includes('--check'))
