/**
 * Integrity of the generated catalog.
 *
 * These run against the files that actually ship — `public/catalog/v1/*.json`
 * — not against the importer's in-memory result. An importer that is correct
 * and a published catalog that is broken are different problems, and only the
 * second one reaches a user.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const V = 'public/catalog/v1'

let pass = 0
let fail = 0
const out = []
function check(cond, label, detail) {
  if (cond) {
    pass++
    out.push(`PASS  ${label}`)
  } else {
    fail++
    out.push(`FAIL  ${label}${detail ? `\n      ${detail}` : ''}`)
  }
}

const read = (f) => JSON.parse(readFileSync(join(ROOT, V, f), 'utf8'))

const catalog = read('exercises.json')
const media = read('media-index.json')
const attribution = read('media-attribution.json')
const instructions = read('instructions.json')

const entries = catalog.exercises

/* --------------------------------------------------- the arithmetic closes */

for (const eq of catalog.reconciliation.equations) {
  check(eq.ok, `conciliación — ${eq.name}`, `${eq.left} (${eq.leftValue}) vs ${eq.right} (${eq.rightValue})`)
}
check(catalog.reconciliation.allBalance === true, 'conciliación — todas las ecuaciones cuadran')

const byOrigin = {}
for (const e of entries) byOrigin[e.origin] = (byOrigin[e.origin] ?? 0) + 1
check(
  Object.values(byOrigin).reduce((a, b) => a + b, 0) === entries.length,
  'conciliación — todo ejercicio tiene un origen',
  JSON.stringify(byOrigin),
)
check(
  byOrigin.curated + byOrigin['free-exercise-db'] + byOrigin.everkinetic === catalog.counts.total,
  'conciliación — los tres orígenes suman el total declarado',
  `${JSON.stringify(byOrigin)} vs ${catalog.counts.total}`,
)
check(
  entries.length === catalog.counts.total,
  'conciliación — el número de entradas coincide con el total declarado',
  `${entries.length} vs ${catalog.counts.total}`,
)
check(
  !entries.some((e) => e.origin === 'custom-user'),
  'conciliación — el catálogo compartido no contiene ejercicios de usuario',
)

/* ------------------------------------------------------------ uniqueness */

{
  const seen = new Map()
  const dupes = []
  for (const e of entries) {
    if (seen.has(e.canonicalId)) dupes.push(e.canonicalId)
    seen.set(e.canonicalId, e)
  }
  check(dupes.length === 0, 'unicidad — ningún canonicalId duplicado', dupes.slice(0, 5).join(', '))
  check(entries.every((e) => e.canonicalId === e.id), 'unicidad — canonicalId coincide con id en todas las entradas')
}

{
  const slugs = new Set()
  const dupes = []
  for (const e of entries) {
    if (slugs.has(e.slug)) dupes.push(e.slug)
    slugs.add(e.slug)
  }
  check(dupes.length === 0, 'unicidad — ningún slug duplicado', dupes.slice(0, 5).join(', '))
}

{
  // A source id only has to be unique WITHIN its source. Two different
  // datasets may legitimately both call an exercise "bench-press".
  const perSource = new Map()
  const dupes = []
  for (const e of entries) {
    const key = e.origin
    if (!perSource.has(key)) perSource.set(key, new Set())
    const set = perSource.get(key)
    if (e.sourceId && set.has(e.sourceId)) dupes.push(`${key}:${e.sourceId}`)
    if (e.sourceId) set.add(e.sourceId)
  }
  check(dupes.length === 0, 'unicidad — ningún sourceId duplicado dentro de la misma fuente', dupes.slice(0, 5).join(', '))
}

/* ---------------------------------------------------------------- media */

const ids = new Set(entries.map((e) => e.id))
const mediaKeys = new Set(Object.keys(media.entries))

{
  const orphans = Object.entries(attribution.entries)
    .filter(([, m]) => !ids.has(m.exerciseId))
    .map(([slug]) => slug)
  check(orphans.length === 0, 'media — ningún asset apunta a un ejercicio inexistente', orphans.slice(0, 5).join(', '))
}

{
  const illustrated = entries.filter((e) => e.mediaStatus === 'illustrated')
  const broken = illustrated.filter((e) => !e.m || !mediaKeys.has(e.m))
  check(broken.length === 0, 'media — ningún ejercicio ilustrado sin entrada en el índice', broken.slice(0, 5).map((e) => e.id).join(', '))

  const noFrames = illustrated.filter((e) => {
    const m = media.entries[e.m]
    return !m || !m.s || !m.e
  })
  check(noFrames.length === 0, 'media — todo ejercicio ilustrado tiene fotograma inicial y final', noFrames.slice(0, 5).map((e) => e.id).join(', '))

  const mismatch = entries.filter((e) => (e.mediaStatus === 'illustrated') !== !!e.m)
  check(mismatch.length === 0, 'media — mediaStatus concuerda con la referencia real', mismatch.slice(0, 5).map((e) => e.id).join(', '))

  check(
    illustrated.length === catalog.counts.illustrated,
    'media — el recuento de ilustrados coincide con el declarado',
    `${illustrated.length} vs ${catalog.counts.illustrated}`,
  )
  check(
    mediaKeys.size === catalog.counts.illustrated,
    'media — el índice tiene tantas entradas como ilustrados',
    `${mediaKeys.size} vs ${catalog.counts.illustrated}`,
  )
  check(
    Object.keys(attribution.entries).length === mediaKeys.size,
    'media — cada entrada del índice tiene atribución',
    `${Object.keys(attribution.entries).length} vs ${mediaKeys.size}`,
  )
}

{
  // Every file the index promises must exist on disk. A 404 on an
  // illustration is invisible in a build and obvious to a user.
  let missing = []
  for (const [slug, m] of Object.entries(media.entries)) {
    for (const path of [m.s, m.m, m.e]) {
      if (!path) continue
      if (!existsSync(join(ROOT, 'public', path.replace(/^\//, '')))) missing.push(`${slug}:${path}`)
    }
  }
  check(missing.length === 0, 'media — todos los SVG referenciados existen en disco', missing.slice(0, 5).join(', '))
}

{
  const noLicense = Object.entries(attribution.entries).filter(([, m]) => !m.license || !m.attribution || !m.sourceUrl)
  check(noLicense.length === 0, 'licencias — toda ilustración lleva licencia, atribución y URL de origen', noLicense.slice(0, 3).map(([s]) => s).join(', '))
  const wrongLicense = Object.entries(attribution.entries).filter(([, m]) => m.license !== 'CC BY-SA 4.0')
  check(wrongLicense.length === 0, 'licencias — todas las ilustraciones son CC BY-SA 4.0', wrongLicense.slice(0, 3).map(([s]) => s).join(', '))
}

/* ------------------------------------------------------------ provenance */

{
  const bad = entries.filter((e) => !e.translationStatus || !['missing', 'machine', 'reviewed'].includes(e.translationStatus.name))
  check(bad.length === 0, 'traducción — todo ejercicio declara el estado de su nombre', bad.slice(0, 3).map((e) => e.id).join(', '))

  // A curated entry claiming a machine translation would mean the hand-written
  // Spanish was lost somewhere in the pipeline.
  const curatedNotReviewed = entries.filter((e) => e.origin === 'curated' && e.translationStatus.name !== 'reviewed')
  check(curatedNotReviewed.length === 0, 'traducción — toda entrada curada tiene español revisado', curatedNotReviewed.slice(0, 3).map((e) => e.id).join(', '))

  const claimsSpanishButIsEnglish = entries.filter((e) => e.translationStatus.name !== 'missing' && e.n.es === e.n.en && e.origin !== 'curated')
  check(
    claimsSpanishButIsEnglish.length === 0,
    'traducción — nada marcado como traducido conserva el nombre inglés',
    claimsSpanishButIsEnglish.slice(0, 3).map((e) => e.id).join(', '),
  )
}

{
  const noNames = entries.filter((e) => !e.n?.en || !e.n?.es)
  check(noNames.length === 0, 'datos — todo ejercicio tiene nombre en los dos idiomas', noNames.slice(0, 3).map((e) => e.id).join(', '))
  const noKind = entries.filter((e) => !['strength', 'cardio', 'mobility'].includes(e.kind))
  check(noKind.length === 0, 'datos — todo ejercicio declara un kind válido', noKind.slice(0, 3).map((e) => e.id).join(', '))
  const cardioNoMetrics = entries.filter((e) => e.kind === 'cardio' && !(e.cm?.length))
  check(cardioNoMetrics.length === 0, 'datos — todo cardio declara qué métricas registra', cardioNoMetrics.slice(0, 3).map((e) => e.id).join(', '))
  const strengthWithMetrics = entries.filter((e) => e.kind === 'strength' && e.cm?.length)
  check(strengthWithMetrics.length === 0, 'datos — ningún ejercicio de fuerza declara métricas de cardio', strengthWithMetrics.slice(0, 3).map((e) => e.id).join(', '))
}

{
  const claimed = entries.filter((e) => e.hasInstructions)
  const missing = claimed.filter((e) => !instructions[e.id])
  check(missing.length === 0, 'instrucciones — todo ejercicio que las promete las tiene', missing.slice(0, 5).map((e) => e.id).join(', '))
  const orphanInstructions = Object.keys(instructions).filter((id) => !ids.has(id))
  check(orphanInstructions.length === 0, 'instrucciones — ninguna apunta a un ejercicio inexistente', orphanInstructions.slice(0, 5).join(', '))
}

{
  const unresolved = Object.entries(catalog.aliasToCanonical).filter(([, id]) => !ids.has(id))
  check(unresolved.length === 0, 'alias — todo alias resuelve a un ejercicio existente', unresolved.slice(0, 5).map(([a]) => a).join(', '))
}

console.log(out.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
