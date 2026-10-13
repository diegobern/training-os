/**
 * Integrity of the generated catalog.
 *
 * These run against the files that actually ship — `public/catalog/v2/*.json`
 * — not against the importer's in-memory result. An importer that is correct
 * and a published catalog that is broken are different problems, and only the
 * second one reaches a user.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const V = `public/catalog/v${process.env.CATALOG_V || 2}`

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
  // 'illustrated' is the exercise's own drawing; 'variant' borrows an
  // equivalent movement's. Both put a picture on the screen, so both count as
  // having media — but only the first owns an entry in the index.
  const illustrated = entries.filter((e) => e.mediaStatus === 'illustrated')
  const shown = entries.filter((e) => e.mediaStatus === 'illustrated' || e.mediaStatus === 'variant')
  const broken = illustrated.filter((e) => !e.m || !mediaKeys.has(e.m))
  check(broken.length === 0, 'media — ningún ejercicio ilustrado sin entrada en el índice', broken.slice(0, 5).map((e) => e.id).join(', '))

  // Workout Guide draws three poses; Everkinetic publishes one. What has to
  // be true of every one of them is that there is something to show.
  const noFrames = shown.filter((e) => {
    const m = media.entries[e.m]
    return !m || !(m.s || m.m || m.e)
  })
  check(noFrames.length === 0, 'media — todo ejercicio con dibujo tiene al menos un fotograma', noFrames.slice(0, 5).map((e) => e.id).join(', '))

  const wgSequences = Object.entries(media.entries).filter(([k]) => !k.startsWith('ek-'))
  check(
    wgSequences.every(([, m]) => m.s && m.e),
    'media — las secuencias de Workout Guide conservan inicio y final',
    JSON.stringify(wgSequences.filter(([, m]) => !m.s || !m.e).slice(0, 3).map(([k]) => k)),
  )

  const mismatch = entries.filter((e) => (e.mediaStatus !== 'none') !== !!e.m)
  check(mismatch.length === 0, 'media — mediaStatus concuerda con la referencia real', mismatch.slice(0, 5).map((e) => e.id).join(', '))

  check(
    shown.length === catalog.counts.illustrated,
    'media — el recuento de ilustrados coincide con el declarado',
    `${shown.length} vs ${catalog.counts.illustrated}`,
  )
  check(
    illustrated.length === catalog.counts.illustratedOwn,
    'media — el recuento de dibujos propios coincide con el declarado',
    `${illustrated.length} vs ${catalog.counts.illustratedOwn}`,
  )
  check(
    // Variants reuse a key rather than adding one, so the index is exactly as
    // big as the set of exercises that own a drawing.
    mediaKeys.size === catalog.counts.illustratedOwn,
    'media — el índice tiene una entrada por dibujo propio, sin duplicar por variante',
    `${mediaKeys.size} vs ${catalog.counts.illustratedOwn}`,
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


/* ------------------------------------------------- provenance of the art */

{
  const withMedia = entries.filter((e) => e.m)
  check(
    withMedia.every((e) => e.mediaStatus === 'illustrated' || e.mediaStatus === 'variant'),
    'procedencia — toda ilustración declara si es propia o de una variante',
    JSON.stringify(withMedia.filter((e) => e.mediaStatus !== 'illustrated' && e.mediaStatus !== 'variant').slice(0, 3).map((e) => e.id)),
  )

  const variants = withMedia.filter((e) => e.mediaStatus === 'variant')
  check(
    variants.every((e) => e.mv && e.mv.id && e.mv.en && e.mv.es),
    'procedencia — toda variante dice de qué movimiento es el dibujo',
    JSON.stringify(variants.filter((e) => !e.mv?.id).slice(0, 3).map((e) => e.id)),
  )

  const byId = new Map(entries.map((e) => [e.id, e]))
  check(
    variants.every((e) => byId.has(e.mv.id) && byId.get(e.mv.id).mediaStatus === 'illustrated'),
    'procedencia — el donante existe y tiene dibujo propio (nada de cadenas de préstamos)',
    JSON.stringify(variants.filter((e) => !byId.has(e.mv.id) || byId.get(e.mv.id).mediaStatus !== 'illustrated').slice(0, 3).map((e) => e.id)),
  )

  // A borrowed drawing of a different muscle group would teach the wrong
  // movement, which is worse than no drawing at all.
  check(
    variants.every((e) => byId.get(e.mv.id)?.mg === e.mg && byId.get(e.mv.id)?.kind === e.kind),
    'procedencia — el donante trabaja el mismo grupo muscular y es del mismo tipo',
    JSON.stringify(
      variants
        .filter((e) => byId.get(e.mv.id)?.mg !== e.mg || byId.get(e.mv.id)?.kind !== e.kind)
        .slice(0, 3)
        .map((e) => `${e.n.en} ← ${byId.get(e.mv.id)?.n.en}`),
    ),
  )

  check(
    withMedia.every((e) => media.entries[e.m]),
    'procedencia — toda clave de media resuelve en el manifiesto',
    JSON.stringify(withMedia.filter((e) => !media.entries[e.m]).slice(0, 3).map((e) => e.m)),
  )

  const ekKeys = Object.keys(media.entries).filter((k) => k.startsWith('ek-'))
  check(
    ekKeys.every((k) => attribution.entries[k]?.license === 'CC BY-SA 4.0' && attribution.entries[k]?.originalAuthor),
    'licencias — cada ilustración de Everkinetic lleva autor y CC BY-SA 4.0',
    JSON.stringify(ekKeys.filter((k) => !attribution.entries[k]?.originalAuthor).slice(0, 3)),
  )

  check(
    ekKeys.every((k) => {
      const e = media.entries[k]
      return e.s && !e.m && !e.e
    }),
    'media — las de Everkinetic declaran un solo fotograma, no una secuencia falsa',
  )

  // The number the report and the docs quote. If the pipeline silently loses
  // illustrations, this is what says so.
  const illustrated = withMedia.length
  check(illustrated >= 660, `cobertura — al menos 660 ejercicios con ilustración (hay ${illustrated})`, String(illustrated))
}

/* ------------------------------------------------ instrucciones en español */
/*
 * The step-by-step instructions translated into Spanish, checked on the file
 * that ships. Every rule here is one of the promises written down in
 * docs/GLOSARIO-INSTRUCCIONES-ES.md, and the glossary itself is read from
 * scripts/catalog/es-glossary.mjs so the two cannot drift apart.
 */
{
  const { applyTranslations, englishFingerprint, readTranslations } = await import('../scripts/catalog/es-instructions.mjs')
  const { GLOSSARY, TIP_EN, TIP_ES, englishLeaks, meaningfulSteps } = await import('../scripts/catalog/es-glossary.mjs')

  const all = Object.entries(instructions)
  const withSteps = all.filter(([, e]) => meaningfulSteps(e.en).length > 0)
  const translated = all.filter(([, e]) => e.esStatus !== 'missing')
  const ids = (list) => list.slice(0, 5).map(([id]) => id).join(', ')

  const untranslated = withSteps.filter(([, e]) => e.esStatus === 'missing' || !Array.isArray(e.es))
  check(
    untranslated.length === 0,
    `instrucciones ES — toda ficha con pasos en inglés está traducida (${withSteps.length - untranslated.length} de ${withSteps.length})`,
    ids(untranslated),
  )
  check(
    translated.every(([, e]) => e.esStatus === 'machine' || e.esStatus === 'reviewed'),
    'instrucciones ES — las traducidas declaran un estado válido (machine o reviewed)',
  )
  const invented = all.filter(([, e]) => meaningfulSteps(e.en).length === 0 && (e.es !== null || e.esStatus !== 'missing'))
  check(invented.length === 0, 'instrucciones ES — ninguna ficha sin pasos en inglés tiene pasos inventados en español', ids(invented))
  const emptyButMarked = translated.filter(([, e]) => !Array.isArray(e.es) || e.es.length === 0)
  check(emptyButMarked.length === 0, 'instrucciones ES — nada marcado como traducido está vacío', ids(emptyButMarked))

  const stepCount = translated.filter(([, e]) => e.es.length !== meaningfulSteps(e.en).length)
  check(stepCount.length === 0, 'instrucciones ES — mismo número de pasos que el original en todas', ids(stepCount))
  const blank = translated.filter(([, e]) => e.es.some((s) => typeof s !== 'string' || s.trim() === ''))
  check(blank.length === 0, 'instrucciones ES — ningún paso vacío', ids(blank))
  const same = translated.filter(([, e]) => {
    const en = meaningfulSteps(e.en)
    return e.es.some((s, i) => s.trim() === en[i]?.trim())
  })
  check(same.length === 0, 'instrucciones ES — ningún paso se ha quedado igual que el inglés', ids(same))
  const leaks = translated
    .map(([id, e]) => [id, [...new Set(e.es.flatMap((s) => englishLeaks(s)))]])
    .filter(([, words]) => words.length > 0)
  check(
    leaks.length === 0,
    'instrucciones ES — no se ha colado inglés sin traducir',
    leaks.slice(0, 5).map(([id, w]) => `${id}: ${w.join(', ')}`).join(' · '),
  )
  const html = translated.filter(([, e]) => e.es.some((s) => /[<>]/.test(s)))
  check(html.length === 0, 'instrucciones ES — sin restos de HTML', ids(html))
  const tips = translated.filter(([, e]) => {
    const en = meaningfulSteps(e.en).join('\n').match(TIP_EN)?.length ?? 0
    const es = e.es.join('\n').match(TIP_ES)?.length ?? 0
    return en !== es
  })
  check(tips.length === 0, 'instrucciones ES — cada «Tip» del original es un «Consejo:» dentro del paso', ids(tips))

  for (const rule of GLOSSARY.filter((r) => r.strict)) {
    const applies = translated.filter(([, e]) => rule.en.test(meaningfulSteps(e.en).join('\n')))
    const broken = applies.filter(([, e]) => !rule.es.test(e.es.join('\n')))
    check(broken.length === 0, `instrucciones ES — glosario «${rule.id}» (${applies.length} fichas)`, ids(broken))
  }

  const lowerAfterLabel = translated.filter(([, e]) =>
    e.es.some((s) => /(?<!\p{L})(Consejos?|Nota|Precaución|Variantes?):\s+\p{Ll}/u.test(s)),
  )
  check(lowerAfterLabel.length === 0, 'instrucciones ES — mayúscula tras «Consejo:», «Nota:» y «Precaución:»', ids(lowerAfterLabel))
  const accentSolo = translated.filter(([, e]) => e.es.some((s) => /(?<!\p{L})[sS]ólo(?!\p{L})/u.test(s)))
  check(accentSolo.length === 0, 'instrucciones ES — «solo» sin tilde, como el resto de la interfaz', ids(accentSolo))
  const ratio = translated.filter(([, e]) => {
    const r = e.es.join(' ').length / Math.max(1, meaningfulSteps(e.en).join(' ').length)
    return r < 0.7 || r > 1.9
  })
  check(ratio.length === 0, 'instrucciones ES — ninguna traducción es sospechosamente corta o larga', ids(ratio))

  const cues = all.filter(([, e]) => e.cueEn || e.cueEs)
  check(
    cues.every(([, e]) => e.cueEn && e.cueEs),
    `instrucciones ES — las ${cues.length} claves de ejecución propias siguen siendo bilingües`,
  )

  // The shipped file is exactly what the source of truth produces. A hand
  // edit to public/catalog/v2/instructions.json — or an English original that
  // changed under a translation — shows up here.
  const source = readTranslations()
  const stale = Object.entries(source).filter(([id, t]) => instructions[id] && t.en !== englishFingerprint(instructions[id].en))
  check(stale.length === 0, 'instrucciones ES — ninguna traducción está desfasada respecto a su original', ids(stale))
  const orphan = Object.keys(source).filter((id) => !(id in instructions))
  check(orphan.length === 0, 'instrucciones ES — la fuente de traducciones no tiene fichas huérfanas', orphan.slice(0, 5).join(', '))
  const regenerated = applyTranslations(instructions, source).instructions
  check(
    JSON.stringify(regenerated) === JSON.stringify(instructions),
    'instrucciones ES — el catálogo publicado es exactamente lo que genera scripts/catalog/instructions-es.json',
  )
}

console.log(out.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)