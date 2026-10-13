/**
 * Las instrucciones en español: dónde viven, cómo se comprueban y cómo llegan
 * al catálogo que se publica.
 *
 * La fuente de verdad es `scripts/catalog/instructions-es.json`, no el
 * catálogo publicado. El catálogo lo regeneran `import.mjs` y `enrich.mjs`, y
 * los dos escriben `es: null` en todas las fichas; si la traducción viviera
 * sólo en `public/catalog/v2/instructions.json`, el siguiente
 * `npm run catalog:build` la borraría sin avisar. Por eso esto es una etapa
 * más del pipeline, la última, y se puede volver a aplicar siempre:
 *
 *     npm run catalog:es          aplica las traducciones al catálogo
 *     npm run catalog:es -- --check   sólo comprueba; falla si algo no cuadra
 *
 * Cada traducción guarda la huella (`en`) del texto inglés que traduce. Si el
 * original cambia en una importación futura, la huella deja de coincidir y la
 * ficha vuelve a `missing` en vez de enseñar en español una técnica que ya no
 * es la del original. Ninguna traducción se aplica si no pasa las
 * comprobaciones estrictas de `checkTranslation`.
 *
 * El inglés no se toca nunca (decisión D6 de docs/ARQUITECTURA.md).
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GLOSSARY, TIP_EN, TIP_ES, englishLeaks, meaningfulSteps } from './es-glossary.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const TRANSLATIONS_PATH = join(ROOT, 'scripts', 'catalog', 'instructions-es.json')
export const CATALOG_INSTRUCTIONS_PATH = join(ROOT, 'public', 'catalog', 'v2', 'instructions.json')

/** Huella del original. Sobre el array tal cual, pasos vacíos incluidos. */
export function englishFingerprint(en) {
  return createHash('sha1').update(JSON.stringify(en ?? [])).digest('hex').slice(0, 16)
}

/**
 * Todo lo que está mal en una traducción. `strict` marca lo que impide
 * aplicarla; lo demás es un aviso para quien la revise.
 *
 * @param {string[]} enRaw  los pasos del original, tal como vienen
 * @param {unknown} es      la traducción propuesta
 * @returns {{ kind: string, detail: string, strict: boolean }[]}
 */
export function checkTranslation(enRaw, es) {
  const problems = []
  const en = meaningfulSteps(enRaw)

  if (!Array.isArray(es)) return [{ kind: 'missing', detail: 'no hay traducción', strict: true }]

  if (es.length !== en.length) {
    problems.push({ kind: 'steps', detail: `${es.length} pasos; el original tiene ${en.length}`, strict: true })
  }

  es.forEach((step, i) => {
    const n = i + 1
    if (typeof step !== 'string' || step.trim().length === 0) {
      problems.push({ kind: 'empty', detail: `paso ${n} vacío`, strict: true })
      return
    }
    if (step !== step.trim()) problems.push({ kind: 'whitespace', detail: `paso ${n} con espacios al principio o al final`, strict: true })
    if (en[i] && step.trim() === en[i].trim()) problems.push({ kind: 'identical', detail: `paso ${n} idéntico al original`, strict: true })
    if (/[<>]/.test(step)) problems.push({ kind: 'html', detail: `paso ${n} con restos de HTML`, strict: true })
    const leaks = englishLeaks(step)
    if (leaks.length) problems.push({ kind: 'english', detail: `paso ${n}: ${leaks.join(', ')}`, strict: true })
  })

  const enText = en.join('\n')
  const esText = es.filter((s) => typeof s === 'string').join('\n')

  for (const rule of GLOSSARY) {
    if (rule.en.test(enText) && !rule.es.test(esText)) {
      problems.push({ kind: 'glossary', detail: rule.id, strict: rule.strict })
    }
  }

  const tipsEn = enText.match(TIP_EN)?.length ?? 0
  const tipsEs = esText.match(TIP_ES)?.length ?? 0
  if (tipsEn !== tipsEs) {
    problems.push({ kind: 'tip', detail: `${tipsEn} «Tip» en el original, ${tipsEs} «Consejo:» en la traducción`, strict: true })
  }

  const ratio = esText.length / Math.max(1, enText.length)
  if (ratio < 0.7 || ratio > 1.9) {
    problems.push({ kind: 'length', detail: `longitud ${ratio.toFixed(2)}× la del original`, strict: false })
  }

  return problems
}

export function readTranslations(path = TRANSLATIONS_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * Aplica las traducciones a un fichero de instrucciones ya cargado. Devuelve
 * uno nuevo; no modifica el que recibe.
 *
 * Es autoritativo: una ficha sin traducción válida queda en `es: null` y
 * `esStatus: 'missing'`, aunque antes tuviera algo. Así el catálogo publicado
 * nunca puede llevar español que no esté en la fuente de verdad.
 */
export function applyTranslations(instructions, translations) {
  const out = {}
  const report = { applied: 0, stale: [], invalid: [], untranslated: [], orphan: [] }

  for (const [id, entry] of Object.entries(instructions)) {
    const next = { ...entry }
    const steps = meaningfulSteps(entry.en)
    const t = translations[id]

    let es = null
    let status = 'missing'
    if (t && steps.length > 0) {
      if (t.en !== englishFingerprint(entry.en)) {
        report.stale.push(id)
      } else {
        const strict = checkTranslation(entry.en, t.es).filter((p) => p.strict)
        if (strict.length) report.invalid.push({ id, problems: strict })
        else {
          es = t.es
          status = t.status === 'reviewed' ? 'reviewed' : 'machine'
          report.applied++
        }
      }
    } else if (steps.length > 0) {
      report.untranslated.push(id)
    }

    // Se asigna sobre las claves que ya existen para conservar su orden: el
    // fichero publicado sigue teniendo exactamente la misma forma.
    next.es = es
    next.esStatus = status
    out[id] = next
  }

  for (const id of Object.keys(translations)) if (!(id in instructions)) report.orphan.push(id)
  return { instructions: out, report }
}

/* ------------------------------------------------------------------- CLI */

function printReport(report) {
  console.log(`Aplicadas:      ${report.applied}`)
  console.log(`Sin traducir:   ${report.untranslated.length}`)
  console.log(`Desfasadas:     ${report.stale.length}${report.stale.length ? '  ' + report.stale.join(', ') : ''}`)
  console.log(`No válidas:     ${report.invalid.length}`)
  for (const { id, problems } of report.invalid) console.log(`  ${id}: ${problems.map((p) => p.detail).join(' · ')}`)
  console.log(`Huérfanas:      ${report.orphan.length}${report.orphan.length ? '  ' + report.orphan.join(', ') : ''}`)
}

/**
 * `chunk <original.json> <traducción.json>...` — lo usan los traductores
 * para comprobar su trozo antes de entregarlo. El original es
 * `{ id: { en: [...] } }`; la traducción, `{ id: [...] }`, repartida en uno o
 * varios ficheros.
 */
function runChunk(args) {
  const [sourcePath, ...outPaths] = args
  const source = JSON.parse(readFileSync(sourcePath, 'utf8'))
  const merged = {}
  for (const p of outPaths) Object.assign(merged, JSON.parse(readFileSync(p, 'utf8')))

  let strictCount = 0
  let warnCount = 0
  for (const [id, item] of Object.entries(source)) {
    const problems = checkTranslation(item.en, merged[id])
    for (const p of problems) {
      if (p.strict) strictCount++
      else warnCount++
      console.log(`${p.strict ? 'ERROR' : 'aviso'}  ${id}  [${p.kind}] ${p.detail}`)
    }
  }
  const extra = Object.keys(merged).filter((id) => !(id in source))
  for (const id of extra) {
    strictCount++
    console.log(`ERROR  ${id}  [extra] no está en el original de este trozo`)
  }
  console.log(`\n${Object.keys(source).length} fichas · ${Object.keys(merged).length} traducidas · ${strictCount} errores · ${warnCount} avisos`)
  process.exit(strictCount ? 1 : 0)
}

function runApply(check) {
  const current = readFileSync(CATALOG_INSTRUCTIONS_PATH, 'utf8')
  const { instructions, report } = applyTranslations(JSON.parse(current), readTranslations())
  const next = JSON.stringify(instructions)
  printReport(report)
  if (check) {
    const ok = next === current && report.invalid.length === 0 && report.stale.length === 0 && report.orphan.length === 0
    console.log(ok ? '\nEl catálogo publicado coincide con las traducciones.' : '\nEl catálogo publicado NO coincide: ejecuta `npm run catalog:es`.')
    process.exit(ok ? 0 : 1)
  }
  if (next !== current) writeFileSync(CATALOG_INSTRUCTIONS_PATH, next)
  console.log(next === current ? '\nSin cambios.' : `\nEscrito ${CATALOG_INSTRUCTIONS_PATH}`)
}

if (process.argv[1] && process.argv[1].endsWith('es-instructions.mjs')) {
  const [mode, ...rest] = process.argv.slice(2)
  if (mode === 'chunk') runChunk(rest)
  else runApply(process.argv.includes('--check'))
}
