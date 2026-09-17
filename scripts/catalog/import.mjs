/**
 * Builds the built-in exercise catalog.
 *
 *   OPEN DATASET → VALIDATE LICENSE → NORMALIZE → MAP → DEDUPE
 *   → COPY MEDIA → GENERATE MANIFEST → VERIFY → REPORT
 *
 * Three sources go in and one catalog comes out:
 *
 *   · our own 68 curated entries — hand-written, bilingual, and authoritative
 *     wherever they overlap with anything else;
 *   · Free Exercise DB — 876 entries, Unlicense, metadata and English
 *     instructions only. No images are taken from it (see THIRD_PARTY_ASSETS);
 *   · Workout Guide — 302 illustrated exercises, CC BY-SA 4.0, images only.
 *
 * Nothing here writes to Firestore or to a user's database. The output is a
 * static, versioned asset: updating the catalog is publishing a new file, not
 * rewriting 876 documents in every account.
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normKey, similarity, discriminatorsAgree, slugify } from './normalize.mjs'
import { translateName } from './es-names.mjs'
import { MUSCLE_MAP, MUSCLE_LABEL, EQUIPMENT_MAP, KIND_MAP, LEVEL_MAP, INCREMENT_SOURCE, CARDIO_CATALOG } from './mappings.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const SCRATCH = process.env.CATALOG_SOURCES || '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad'

const FEDB_JSON = join(SCRATCH, 'fedb', 'exercises.json')
const WG_ROOT = join(SCRATCH, 'wgrepo', 'packages', 'workout-guide')
const WG_ASSETS = join(WG_ROOT, 'assets')
const WG_MANIFEST = join(SCRATCH, 'wg', 'package', 'manifest.json')

export const CATALOG_VERSION = 1
const OUT_DIR = join(ROOT, 'public', 'catalog', `v${CATALOG_VERSION}`)
const MEDIA_DIR = join(ROOT, 'public', 'exercise-media')

/* ------------------------------------------------------- 1. license gate */

/**
 * Refuses to run against a source whose license is not the one this pipeline
 * was reviewed for. A dataset that silently relicenses between runs is exactly
 * the failure this project cannot afford, so it is a hard stop, not a warning.
 */
function validateLicenses(report) {
  const checks = [
    {
      name: 'free-exercise-db',
      path: join(SCRATCH, 'fedb', 'LICENSE.md'),
      expect: 'free and unencumbered software released into the public domain',
      license: 'Unlicense',
      note: 'METADATA AND TEXT ONLY. Photographs are deliberately not imported.',
    },
    {
      name: 'workout-guide (assets)',
      path: join(SCRATCH, 'wg', 'package', 'LICENSE-ASSETS'),
      expect: 'Attribution-ShareAlike 4.0 International',
      license: 'CC BY-SA 4.0',
      note: 'Images. Attribution and share-alike required.',
    },
  ]
  for (const c of checks) {
    if (!existsSync(c.path)) throw new Error(`LICENSE missing for ${c.name} at ${c.path} — refusing to import`)
    const text = readFileSync(c.path, 'utf8')
    if (!text.includes(c.expect)) {
      throw new Error(`LICENSE for ${c.name} does not contain the expected text — refusing to import`)
    }
    report.licenses.push({ ...c, verifiedAt: new Date().toISOString().slice(0, 10) })
  }
}

/* ---------------------------------------------------- 2. our own entries */

function loadCurated() {
  const src = readFileSync(join(ROOT, 'src', 'lib', 'db', 'catalog.ts'), 'utf8')
  // One entry per line, so the parse is a line scan rather than a regex over
  // the whole file — which is what went wrong the first time: a non-greedy
  // match stopped at the first `),` inside a nested array.
  const out = []
  for (const line of src.split('\n')) {
    const m = line.match(/^\s*E\((.*)\),\s*$/)
    if (!m) continue
    const args = splitArgs(m[1])
    if (args.length < 12) continue
    out.push({
      slug: lit(args[0]), en: lit(args[1]), es: lit(args[2]), muscleGroup: lit(args[3]),
      primaryEn: lit(args[4]), primaryEs: lit(args[5]), equipment: lit(args[6]), type: lit(args[7]),
      repMin: Number(args[8]), repMax: Number(args[9]), sets: Number(args[10]), rest: Number(args[11]),
      secondary: args[12] ? parseArr(args[12]) : [],
      cueEn: args[13] ? lit(args[13]) : '', cueEs: args[14] ? lit(args[14]) : '',
    })
  }
  return out
}

function splitArgs(s) {
  const out = []
  let depth = 0, cur = '', q = null
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q && cur.at(-2) !== '\\') q = null; continue }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; continue }
    if (ch === '[' || ch === '(') depth++
    if (ch === ']' || ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}
const lit = (s) => String(s).trim().replace(/^['"]|['"]$/g, '')
const parseArr = (s) => (String(s).match(/'([^']+)'/g) || []).map((x) => x.slice(1, -1))

/* ------------------------------------------------------------ 3. dedupe */

/**
 * Decides whether an incoming exercise is one we already have.
 *
 * A normalised-key hit is conclusive. Otherwise a high token overlap is only
 * accepted when every discriminating word agrees — otherwise "Incline Dumbbell
 * Press" and "Flat Dumbbell Press" would merge, which is worse than a
 * duplicate.
 */
function findExisting(byKey, list, name, equipment) {
  const key = normKey(name)
  const exact = byKey.get(key)
  if (exact) return { hit: exact, how: 'key' }
  let best = null, bestScore = 0
  for (const c of list) {
    const score = similarity(name, c.name.en)
    if (score > bestScore) { bestScore = score; best = c }
  }
  if (best && bestScore >= 0.8 && discriminatorsAgree(name, best.name.en)) {
    if (!equipment || !best.equipment || equipment === best.equipment) return { hit: best, how: 'fuzzy' }
  }
  return { hit: null, how: null, near: best, nearScore: bestScore }
}

/* ------------------------------------------------------------- 4. build */

export function build({ dryRun = false } = {}) {
  const report = {
    licenses: [], imported: [], merged: [], skipped: [], review: [], media: [],
  }
  validateLicenses(report)

  const catalog = []
  const byKey = new Map()
  const bySlug = new Map()

  const add = (entry) => {
    catalog.push(entry)
    bySlug.set(entry.slug, entry)
    byKey.set(normKey(entry.name.en), entry)
    for (const a of entry.aliases) byKey.set(normKey(a), entry)
    return entry
  }

  /* --- our 68, first and authoritative ---------------------------------- */
  for (const c of loadCurated()) {
    add({
      id: `lib-${c.slug}`,
      slug: c.slug,
      kind: c.type === 'cardio' ? 'cardio' : c.type === 'stretch' ? 'mobility' : 'strength',
      name: { en: c.en, es: c.es },
      nameEsStatus: 'reviewed',
      aliases: [],
      muscleGroup: c.muscleGroup,
      primaryMuscle: { en: c.primaryEn, es: c.primaryEs },
      secondaryMuscles: c.secondary,
      equipment: c.equipment,
      type: c.type,
      difficulty: 'intermediate',
      mechanic: c.type === 'isolation' ? 'isolation' : 'compound',
      force: null,
      defaults: { sets: c.sets, repMin: c.repMin, repMax: c.repMax, restSeconds: c.rest },
      incrementSource: INCREMENT_SOURCE[c.equipment] || 'machine',
      instructions: { en: [], es: null, esStatus: 'missing' },
      cues: { en: c.cueEn || null, es: c.cueEs || null },
      media: null,
      source: { name: 'training-os', id: c.slug, url: null, license: 'proprietary' },
      curated: true,
    })
  }
  const curatedCount = catalog.length

  /* --- hand-written cardio ---------------------------------------------- */
  for (const c of CARDIO_CATALOG) {
    add({
      id: `lib-${c.slug}`,
      slug: c.slug,
      kind: 'cardio',
      name: { en: c.en, es: c.es },
      nameEsStatus: 'reviewed',
      aliases: [],
      muscleGroup: 'other',
      primaryMuscle: { en: 'Cardiovascular', es: 'Cardiovascular' },
      secondaryMuscles: [],
      equipment: c.mode === 'outdoor' ? 'bodyweight' : 'machine',
      type: 'cardio',
      difficulty: 'beginner',
      mechanic: null,
      force: null,
      defaults: { sets: 1, repMin: 0, repMax: 0, restSeconds: 0 },
      incrementSource: 'machine',
      cardioMode: c.mode,
      cardioMetrics: c.metrics,
      instructions: { en: [], es: null, esStatus: 'missing' },
      cues: { en: c.cueEn, es: c.cueEs },
      media: null,
      source: { name: 'training-os', id: c.slug, url: null, license: 'proprietary' },
      curated: true,
    })
  }

  /* --- Free Exercise DB -------------------------------------------------- */
  const fedb = JSON.parse(readFileSync(FEDB_JSON, 'utf8'))
  for (const e of fedb) {
    const problems = []
    if (!e.name) { report.skipped.push({ name: e.id, reason: 'sin nombre' }); continue }
    if (!e.primaryMuscles?.length) problems.push('sin músculo primario')
    if (!e.instructions?.length) problems.push('sin instrucciones')
    if (e.equipment && !EQUIPMENT_MAP[e.equipment]) problems.push(`equipamiento desconocido: ${e.equipment}`)
    const kind = KIND_MAP[e.category]
    if (!kind) { report.skipped.push({ name: e.name, reason: `categoría no soportada: ${e.category}` }); continue }

    const equipment = EQUIPMENT_MAP[e.equipment] ?? 'other'
    const found = findExisting(byKey, catalog, e.name, equipment)

    if (found.hit) {
      // Ours wins on everything it already has; the dataset only fills gaps.
      const t = found.hit
      if (!t.aliases.includes(e.name)) t.aliases.push(e.name)
      if (!t.instructions.en.length && e.instructions?.length) t.instructions.en = e.instructions
      t.external = { ...(t.external || {}), fedb: e.id }
      if (!t.force && e.force) t.force = e.force
      report.merged.push({ name: e.name, into: t.id, how: found.how })
      byKey.set(normKey(e.name), t)
      continue
    }

    const primary = e.primaryMuscles[0]
    const mg = MUSCLE_MAP[primary] ?? 'other'
    const tr = translateName(e.name)
    const slug = slugify(e.name)
    if (bySlug.has(slug)) { report.skipped.push({ name: e.name, reason: 'slug duplicado' }); continue }

    const type = kind === 'mobility' ? 'stretch' : kind === 'cardio' ? 'cardio' : e.mechanic === 'isolation' ? 'isolation' : 'compound'

    const entry = add({
      id: `fx-${slug}`,
      slug,
      kind,
      name: { en: e.name, es: tr.es },
      nameEsStatus: tr.es === e.name ? 'missing' : 'machine',
      aliases: [],
      muscleGroup: mg,
      primaryMuscle: MUSCLE_LABEL[primary] ?? { en: primary, es: primary },
      secondaryMuscles: [...new Set((e.secondaryMuscles || []).map((s) => MUSCLE_MAP[s]).filter(Boolean))],
      equipment,
      type,
      difficulty: LEVEL_MAP[e.level] ?? 'intermediate',
      mechanic: e.mechanic ?? null,
      force: e.force ?? null,
      defaults: defaultsFor(kind, type),
      incrementSource: INCREMENT_SOURCE[equipment] || 'machine',
      ...(kind === 'cardio' ? { cardioMode: 'other', cardioMetrics: ['duration', 'distance', 'avgHr', 'calories'] } : {}),
      // The original English is stored untouched and is never rewritten.
      instructions: { en: e.instructions || [], es: null, esStatus: 'missing' },
      cues: { en: null, es: null },
      media: null,
      source: {
        name: 'free-exercise-db',
        id: e.id,
        url: `https://github.com/yuhonas/free-exercise-db/blob/main/exercises/${e.id}.json`,
        license: 'Unlicense',
      },
      external: { fedb: e.id },
      curated: false,
    })
    report.imported.push({ name: e.name, id: entry.id })
    if (problems.length) report.review.push({ name: e.name, id: entry.id, problems })
  }

  /* --- Workout Guide media ---------------------------------------------- */
  const wg = JSON.parse(readFileSync(WG_MANIFEST, 'utf8'))
  const mediaManifest = { version: CATALOG_VERSION, generatedAt: new Date().toISOString(), entries: {} }
  let matched = 0

  for (const w of wg) {
    // Workout Guide names the movement ("Bench Press"); our catalogue often
    // names the implement too ("Barbell Bench Press"). So the equipment is
    // folded into the name before matching, and the match is allowed to be
    // looser than the exercise-level dedupe — attaching a picture of a bench
    // press to a bench press is a far cheaper mistake than merging two
    // different exercises, and a wrong picture is still caught by review.
    const withEquip = w.equipment && w.equipment !== 'Bodyweight' ? `${w.equipment} ${w.name}` : w.name
    let found = findExisting(byKey, catalog, withEquip, null)
    if (!found.hit) found = findExisting(byKey, catalog, w.name, null)
    if (!found.hit) {
      let best = null, bestScore = 0
      for (const c of catalog) {
        if (c.media) continue
        const score = Math.max(similarity(w.name, c.name.en), similarity(withEquip, c.name.en))
        if (score > bestScore) { bestScore = score; best = c }
      }
      // The same discriminating-word rule the exercise dedupe uses. Without it
      // a split squat inherits a pistol squat's picture, and a cable row a
      // dumbbell row's — a wrong illustration is worse than none, because the
      // user believes it.
      if (best && bestScore >= 0.6 && discriminatorsAgree(withEquip, best.name.en)) {
        found = { hit: best, how: 'media-fuzzy', nearScore: bestScore }
      } else {
        // An illustration with no exercise behind it is not a failure — it is
        // an exercise we simply do not have yet, and Workout Guide's manifest
        // carries enough metadata to create one. Discarding it would throw
        // away a perfectly good illustrated exercise.
        const created = createFromWorkoutGuide(w, bySlug)
        if (!created) {
          report.review.push({ name: w.name, problems: ['imagen sin ejercicio y sin metadatos suficientes'], near: best?.name?.en, score: Number(bestScore.toFixed(2)) })
          continue
        }
        add(created)
        report.imported.push({ name: w.name, id: created.id, from: 'workout-guide' })
        found = { hit: created, how: 'created' }
      }
    }
    const target = found.hit
    if (target.media) continue // already illustrated; first match wins

    // Frame 1 is the start position and frame 3 the end. Frame 2 is the
    // mid-point, kept because a three-frame loop reads as movement where two
    // frames read as a flicker.
    const frames = []
    for (const f of w.frames) {
      const srcPath = join(WG_ASSETS, w.slug, `frame-${f.index}.svg`)
      if (!existsSync(srcPath)) continue
      const bytes = readFileSync(srcPath)
      const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
      const rel = `exercise-media/${w.slug}/frame-${f.index}.svg`
      frames.push({ index: f.index, path: `/${rel}`, hash, bytes: bytes.length })
      if (!dryRun) {
        mkdirSync(join(MEDIA_DIR, w.slug), { recursive: true })
        copyFileSync(srcPath, join(ROOT, 'public', rel))
      }
    }
    if (!frames.length) {
      report.review.push({ name: w.name, problems: ['sin ficheros SVG en disco'] })
      continue
    }

    const att = w.frames[0]?.attribution || {}
    target.media = w.slug
    mediaManifest.entries[w.slug] = {
      exerciseId: target.id,
      externalId: w.id,
      slug: w.slug,
      startImage: frames[0]?.path ?? null,
      midImage: frames[1]?.path ?? null,
      endImage: frames[frames.length - 1]?.path ?? null,
      frames,
      source: 'workout-guide',
      sourceUrl: 'https://github.com/bryllim/workout-guide',
      originalAuthor: att.creator ?? 'Bryl Lim',
      originalSource: att.source?.name ?? null,
      originalSourceUrl: att.source?.url ?? null,
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      attribution: att.source?.name
        ? `Ilustración: ${att.creator ?? 'Bryl Lim'} (Workout Guide), a partir de ${att.source.name}. CC BY-SA 4.0.`
        : `Ilustración: ${att.creator ?? 'Bryl Lim'} (Workout Guide). CC BY-SA 4.0.`,
      changes: att.source?.changes ?? null,
      matchedBy: found.how ?? 'key',
      matchScore: found.nearScore ? Number(found.nearScore.toFixed(2)) : 1,
    }
    matched++
    report.media.push({ exercise: target.id, slug: w.slug, frames: frames.length, how: found.how ?? 'key' })
  }

  /* --- verify ------------------------------------------------------------ */
  const ids = new Set()
  const slugs = new Set()
  for (const e of catalog) {
    if (ids.has(e.id)) throw new Error(`id duplicado en el catálogo: ${e.id}`)
    if (slugs.has(e.slug)) throw new Error(`slug duplicado en el catálogo: ${e.slug}`)
    ids.add(e.id); slugs.add(e.slug)
    if (!e.name.en || !e.name.es) throw new Error(`${e.id} sin nombre en los dos idiomas`)
    if (!e.kind) throw new Error(`${e.id} sin kind`)
    if (e.kind === 'cardio' && !e.cardioMetrics?.length) throw new Error(`${e.id} es cardio y no declara métricas`)
  }

  /* --- split the output ---------------------------------------------------
     The catalogue is deliberately not one file. The library list needs a name,
     a muscle, an equipment and a picture reference for every exercise; it does
     not need 1013 sets of English instructions, which are four fifths of the
     bytes and are read one exercise at a time, only when someone opens HOW TO.

     Same reasoning for the media manifest: rendering needs three paths, while
     the licence and attribution block is only ever read by the attributions
     screen. Splitting them keeps the first load small without hiding anything. */

  /**
   * Where an entry came from.
   *
   *   curated          written by hand for TRAINING OS, bilingual and reviewed
   *   free-exercise-db imported from the Unlicense dataset (metadata only)
   *   everkinetic      created from a Workout Guide illustration, whose art
   *                    lineage runs back to Everkinetic
   *   custom-user      never present in the catalog file; it is the origin a
   *                    user's own exercise carries at runtime
   */
  const originOf = (e) =>
    e.curated ? 'curated' : e.id.startsWith('fx-') ? 'free-exercise-db' : 'everkinetic'

  const index = catalog.map((e) => ({
    id: e.id, slug: e.slug, kind: e.kind, n: e.name, ns: e.nameEsStatus,
    // Provenance. `canonicalId` is what every reference must use; it equals
    // `id` for every entry in this file, and differs only for the alias map
    // below, where a merged source id points at the entry that absorbed it.
    origin: originOf(e),
    canonicalId: e.id,
    sourceId: e.source.id,
    translationStatus: { name: e.nameEsStatus, instructions: e.instructions.esStatus },
    mediaStatus: e.media ? 'illustrated' : 'none',
    a: e.aliases.length ? e.aliases : undefined,
    mg: e.muscleGroup, pm: e.primaryMuscle,
    sm: e.secondaryMuscles.length ? e.secondaryMuscles : undefined,
    eq: e.equipment, t: e.type, d: e.difficulty, inc: e.incrementSource,
    def: e.defaults,
    cm: e.cardioMetrics, cmo: e.cardioMode,
    m: e.media || undefined,
    src: e.source.name,
    hasInstructions: e.instructions.en.length > 0 || !!e.cues.en,
    curated: e.curated || undefined,
  }))

  const instructions = {}
  for (const e of catalog) {
    if (!e.instructions.en.length && !e.cues.en && !e.cues.es) continue
    instructions[e.id] = {
      en: e.instructions.en,
      es: e.instructions.es,
      esStatus: e.instructions.esStatus,
      cueEn: e.cues.en || undefined,
      cueEs: e.cues.es || undefined,
      source: e.source,
    }
  }

  const mediaIndex = { version: CATALOG_VERSION, entries: {} }
  const mediaAttribution = { version: CATALOG_VERSION, generatedAt: mediaManifest.generatedAt, entries: {} }
  for (const [slug, m] of Object.entries(mediaManifest.entries)) {
    mediaIndex.entries[slug] = { s: m.startImage, m: m.midImage, e: m.endImage }
    mediaAttribution.entries[slug] = m
  }

  /**
   * Every external id that resolves to an entry, including the ones absorbed
   * by a merge. Without this, a reference to a Free Exercise DB id that got
   * merged into one of our curated entries would resolve to nothing.
   */
  const aliasToCanonical = {}
  for (const e of catalog) {
    for (const [src, id] of Object.entries(e.external || {})) aliasToCanonical[`${src}:${id}`] = e.id
  }

  /**
   * The arithmetic, computed rather than asserted.
   *
   * Every input either becomes an entry or is accounted for as merged or
   * skipped, and the totals have to close. A catalog that quietly loses 30
   * exercises between two runs is the kind of thing nobody notices until a
   * user searches for one of them.
   */
  const fedbInput = fedb.length
  const wgInput = wg.length
  const newFromFedb = catalog.filter((e) => e.id.startsWith('fx-')).length
  const newFromWg = catalog.filter((e) => e.id.startsWith('wg-')).length
  const curatedEntries = catalog.filter((e) => e.curated).length
  const wgMatchedExisting = wgInput - newFromWg

  const reconciliation = {
    inputs: {
      curatedSource: curatedCount,
      cardioHandWritten: CARDIO_CATALOG.length,
      freeExerciseDb: fedbInput,
      workoutGuideIllustrations: wgInput,
    },
    outcomes: {
      curatedEntries,
      importedFromFreeExerciseDb: newFromFedb,
      createdFromWorkoutGuide: newFromWg,
      mergedIntoExisting: report.merged.length,
      workoutGuideMatchedExisting: wgMatchedExisting,
      skipped: report.skipped.length,
      requiresReview: report.review.length,
    },
    equations: [
      {
        name: 'free-exercise-db se conserva entero',
        left: `${newFromFedb} nuevos + ${report.merged.length} fusionados`,
        leftValue: newFromFedb + report.merged.length,
        right: `${fedbInput} de entrada`,
        rightValue: fedbInput,
        ok: newFromFedb + report.merged.length === fedbInput,
      },
      {
        name: 'cada ilustracion acaba en un ejercicio',
        left: `${newFromWg} crearon entrada + ${wgMatchedExisting} encajaron en una existente`,
        leftValue: newFromWg + wgMatchedExisting,
        right: `${wgInput} ilustraciones`,
        rightValue: wgInput,
        ok: newFromWg + wgMatchedExisting === wgInput,
      },
      {
        name: 'el total es la suma de los tres origenes',
        left: `${curatedEntries} curados + ${newFromFedb} free-exercise-db + ${newFromWg} everkinetic`,
        leftValue: curatedEntries + newFromFedb + newFromWg,
        right: `${catalog.length} en el catalogo`,
        rightValue: catalog.length,
        ok: curatedEntries + newFromFedb + newFromWg === catalog.length,
      },
      {
        name: 'ilustrados coincide con el manifiesto',
        left: `${catalog.filter((e) => e.media).length} con media`,
        leftValue: catalog.filter((e) => e.media).length,
        right: `${Object.keys(mediaManifest.entries).length} en el manifiesto`,
        rightValue: Object.keys(mediaManifest.entries).length,
        ok: catalog.filter((e) => e.media).length === Object.keys(mediaManifest.entries).length,
      },
    ],
  }
  reconciliation.allBalance = reconciliation.equations.every((e) => e.ok)
  if (!reconciliation.allBalance) {
    throw new Error('la conciliacion del catalogo no cuadra: ' + JSON.stringify(reconciliation.equations.filter((e) => !e.ok)))
  }

  const out = {
    catalogVersion: CATALOG_VERSION,
    generatedAt: new Date().toISOString(),
    reconciliation,
    aliasToCanonical,
    counts: {
      total: catalog.length,
      // Everything written by hand: the 69 strength entries plus the 14 cardio
      // ones. `curatedSource` is only the first group, which is what the
      // reconciliation calls an input.
      curated: catalog.filter((e) => e.curated).length,
      curatedSource: curatedCount,
      cardioHandWritten: CARDIO_CATALOG.length,
      cardio: catalog.filter((e) => e.kind === 'cardio').length,
      mobility: catalog.filter((e) => e.kind === 'mobility').length,
      strength: catalog.filter((e) => e.kind === 'strength').length,
      illustrated: matched,
    },
    exercises: index,
  }

  if (!dryRun) {
    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(join(OUT_DIR, 'exercises.json'), JSON.stringify(out))
    writeFileSync(join(OUT_DIR, 'instructions.json'), JSON.stringify(instructions))
    writeFileSync(join(OUT_DIR, 'media-index.json'), JSON.stringify(mediaIndex))
    writeFileSync(join(OUT_DIR, 'media-attribution.json'), JSON.stringify(mediaAttribution, null, 1))
    writeFileSync(join(ROOT, 'docs', 'CATALOG-IMPORT-REPORT.json'), JSON.stringify(report, null, 1))
  }
  return { out, mediaManifest, mediaIndex, instructions, report, full: catalog }
}


/** Workout Guide's own vocabulary, mapped onto ours. */
const WG_MUSCLE = {
  Chest: 'chest', Back: 'back', Lats: 'back', Traps: 'back', Shoulders: 'shoulders',
  Biceps: 'biceps', Triceps: 'triceps', Forearms: 'forearms', Quads: 'quads',
  Hamstrings: 'hamstrings', Glutes: 'glutes', Calves: 'calves', Core: 'core',
  Abs: 'core', Abdominals: 'core', Obliques: 'core', 'Lower Back': 'back',
  'Full Body': 'other', Cardio: 'other', Neck: 'other', Hips: 'glutes', Adductors: 'quads',
}
const WG_EQUIP = {
  Barbell: 'barbell', Dumbbell: 'dumbbell', Dumbbells: 'dumbbell', Machine: 'machine',
  Cable: 'cable', Bodyweight: 'bodyweight', 'Smith Machine': 'smith', Kettlebell: 'kettlebell',
  Band: 'band', Bands: 'band', 'Resistance Band': 'band', 'EZ Bar': 'barbell',
  'Medicine Ball': 'other', Bench: 'bodyweight', 'Pull-up Bar': 'bodyweight', Other: 'other',
}

/**
 * Builds a catalog entry from a Workout Guide manifest record.
 *
 * Its metadata comes from the npm package, which is MIT; only the images are
 * CC BY-SA. Both are recorded separately so the distinction survives into
 * THIRD_PARTY_ASSETS.md.
 */
function createFromWorkoutGuide(w, bySlug) {
  if (!w.name || !w.primaryMuscle) return null
  const slug = slugify(w.name)
  if (bySlug.has(slug)) return null
  const equipment = WG_EQUIP[w.equipment] ?? 'other'
  const mg = WG_MUSCLE[w.primaryMuscle] ?? 'other'
  const kind = w.isStretch ? 'mobility' : w.exerciseType === 'duration' ? 'cardio' : 'strength'
  const type = kind === 'mobility' ? 'stretch' : kind === 'cardio' ? 'cardio' : 'compound'
  const tr = translateName(w.name)
  return {
    id: `wg-${slug}`,
    slug,
    kind,
    name: { en: w.name, es: tr.es },
    nameEsStatus: tr.es === w.name ? 'missing' : 'machine',
    aliases: [],
    muscleGroup: mg,
    primaryMuscle: { en: w.primaryMuscle, es: w.primaryMuscle },
    secondaryMuscles: [...new Set((w.secondaryMuscles || []).map((x) => WG_MUSCLE[x]).filter(Boolean))],
    equipment,
    type,
    difficulty: 'intermediate',
    mechanic: null,
    force: null,
    defaults: defaultsFor(kind, type),
    incrementSource: INCREMENT_SOURCE[equipment] || 'machine',
    ...(kind === 'cardio' ? { cardioMode: 'other', cardioMetrics: ['duration', 'distance', 'avgHr', 'calories'] } : {}),
    instructions: { en: [], es: null, esStatus: 'missing' },
    cues: { en: null, es: null },
    media: null,
    source: { name: 'workout-guide', id: w.id, url: 'https://github.com/bryllim/workout-guide', license: 'MIT (metadatos)' },
    external: { workoutGuide: w.id },
    curated: false,
  }
}

function defaultsFor(kind, type) {
  if (kind === 'cardio') return { sets: 1, repMin: 0, repMax: 0, restSeconds: 0 }
  if (kind === 'mobility') return { sets: 1, repMin: 0, repMax: 0, restSeconds: 30 }
  if (type === 'isolation') return { sets: 3, repMin: 10, repMax: 15, restSeconds: 90 }
  return { sets: 3, repMin: 6, repMax: 10, restSeconds: 150 }
}

if (process.argv[1] && process.argv[1].endsWith('import.mjs')) {
  const { out, mediaManifest, report } = build({ dryRun: process.argv.includes('--dry') })
  console.log('LICENCIAS VERIFICADAS:')
  for (const l of report.licenses) console.log(`  ${l.name.padEnd(24)} ${l.license}  (${l.verifiedAt})`)
  console.log('\nRESULTADO')
  console.log(`  IMPORTED        ${report.imported.length}`)
  console.log(`  MERGED          ${report.merged.length}`)
  console.log(`  SKIPPED         ${report.skipped.length}`)
  console.log(`  REQUIRES REVIEW ${report.review.length}`)
  console.log('\nCATÁLOGO')
  console.log(' ', JSON.stringify(out.counts))
  console.log(`  con ilustración ${Object.keys(mediaManifest.entries).length}`)
}
