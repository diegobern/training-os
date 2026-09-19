/**
 * Second stage of the catalogue pipeline: give every exercise something to
 * show in HOW TO.
 *
 * The importer builds 1096 exercises; only 302 of them arrive with an
 * illustration, because that is all Workout Guide draws. Opening HOW TO on any
 * of the other 794 produced two grey sentences and nothing else — correct, and
 * useless.
 *
 * Three passes, in descending order of honesty, and every result records which
 * one produced it so the app can say so:
 *
 *   1. `illustrated`  the exercise's own illustration, from Workout Guide.
 *   2. also `illustrated`, from Everkinetic — the source the Workout Guide art
 *                 itself derives from. Same licence, CC BY-SA 4.0, and one
 *                 frame rather than three.
 *   3. `variant`  the illustration of a different but equivalent movement,
 *                 shown with the donor's name on screen. A dumbbell curl drawn
 *                 for a cable curl teaches the movement; pretending it is the
 *                 same exercise would not.
 *
 * Nothing here invents an image, a translation or a step. Everything either
 * comes from a licensed source or is a labelled reuse of one.
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tokens, similarity, slugify, DISCRIMINATORS } from './normalize.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRATCH = process.env.CATALOG_SOURCES || '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad'
const EK = join(SCRATCH, 'ek')
const SRC_DIR = join(ROOT, 'public', 'catalog', 'v1')
const OUT_VERSION = 2
const OUT_DIR = join(ROOT, 'public', 'catalog', `v${OUT_VERSION}`)
const MEDIA_DIR = join(ROOT, 'public', 'exercise-media')

/* ---------------------------------------------------------------- licence */

/**
 * Same rule the importer uses: no asset moves until its licence file has been
 * read and matched against what was reviewed. A licence that changed upstream
 * must stop the build, not slip through.
 */
function verifyEverkineticLicence() {
  const p = join(EK, 'LICENSE.md')
  if (!existsSync(p)) throw new Error('falta LICENSE.md de Everkinetic')
  const text = readFileSync(p, 'utf8')
  const required = ['Attribution-ShareAlike 4.0 International', 'ShareAlike', 'BY-SA']
  for (const needle of required) {
    if (!text.includes(needle)) throw new Error(`LICENSE.md de Everkinetic no contiene "${needle}"`)
  }
  return {
    name: 'everkinetic/data',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    author: 'Greg Priday',
    sourceUrl: 'https://github.com/everkinetic/data',
    verifiedAt: new Date().toISOString().slice(0, 10),
    bytes: text.length,
  }
}

/* ---------------------------------------------------------------- matching */

/** Equipment words the `eq` field already carries, so they cannot disagree. */
const EQUIP_WORDS = new Set([
  'machine', 'cable', 'barbell', 'dumbbell', 'kettlebell', 'ezbar',
  'bodyweight', 'smith', 'banded', 'band', 'landmine', 'trap', 'hex', 'goblet',
])

/**
 * Words that change how a movement is executed, not what it looks like.
 *
 * Dropped only in the variant pass, and only because the result is labelled:
 * showing the two-armed row for "Alternating Renegade Row" under the heading
 * "Ilustración de un movimiento equivalente: Renegade Row" teaches the shape
 * of the movement, which is what a drawing can do. The words that DO change
 * the shape — incline, reverse, sumo, behind — stay strict, because a drawing
 * of the wrong one teaches the wrong thing.
 */
const STYLE_WORDS = new Set([
  'alternating', 'single', 'one', 'unilateral', 'weighted', 'assisted',
  'banded', 'paused', 'pause', 'tempo', 'deficit', 'smith',
])

const discriminators = (name, { ignoreEquipment = false, ignoreStyle = false } = {}) =>
  new Set(
    tokens(name).filter(
      (t) =>
        DISCRIMINATORS.has(t) &&
        !(ignoreEquipment && EQUIP_WORDS.has(t)) &&
        !(ignoreStyle && STYLE_WORDS.has(t)),
    ),
  )

/**
 * Two names describe the same movement only if they agree on every
 * distinguishing word. `incline` never matches `flat`, `single` never matches
 * a two-armed movement. Equipment words are ignored only when the structured
 * equipment field already says the two agree, or when we are knowingly
 * borrowing across equipment for a variant illustration.
 */
function agree(a, b, opts) {
  const A = discriminators(a, opts)
  const B = discriminators(b, opts)
  if (A.size !== B.size) return false
  for (const t of A) if (!B.has(t)) return false
  return true
}

const coreSimilarity = (a, b) => {
  const drop = (t) => EQUIP_WORDS.has(t) || STYLE_WORDS.has(t)
  const A = new Set(tokens(a).filter((t) => !drop(t)))
  const B = new Set(tokens(b).filter((t) => !drop(t)))
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / (A.size + B.size - inter)
}

const namesOf = (e) => [e.n.en, e.n.es, ...(e.a ?? [])].filter(Boolean)


/* --------------------------------------------------- the last few by hand */

/**
 * Written here, by us, for the handful that neither source describes.
 *
 * After both passes six exercises had no drawing AND no text of any kind —
 * the one state where HOW TO has genuinely nothing to say. Five of them are
 * movements common enough to cue accurately in a sentence, so they are cued
 * here rather than left blank. They are marked as ours, exactly like the 33
 * cues the importer already carries; nothing is attributed to a source that
 * did not write it.
 *
 * The sixth, Iron Cross, is left alone on purpose. Writing a cue for a
 * movement whose execution we are not certain of would be inventing
 * technique advice, and that is worse than an empty card.
 */
const OUR_CUES = {
  'lib-cable-fly-low-high': {
    en: 'Pulleys at ankle height. Sweep up in an arc until your hands meet at eye level, elbows almost locked.',
    es: 'Poleas a la altura de los tobillos. Sube en arco hasta juntar las manos a la altura de los ojos, con los codos casi fijos.',
  },
  'lib-reverse-curl': {
    en: 'Overhand grip, wrists firm. Curl without swinging — the forearm does the work, not the back.',
    es: 'Agarre prono, muñecas firmes. Sube sin balancear: trabaja el antebrazo, no la espalda.',
  },
  'fx-side-bridge': {
    en: 'Forearm and the side of your foot on the floor. Hips high, a straight line from ankle to shoulder; hold without letting the hip drop.',
    es: 'Apóyate en el antebrazo y el canto del pie. Cadera alta, línea recta del tobillo al hombro; aguanta sin dejar caer la cadera.',
  },
  'fx-one-arm-kettlebell-swings': {
    en: 'The hips drive it, not the arm. Hinge back, push the floor away and let the bell float up; the free arm mirrors it.',
    es: 'Manda la cadera, no el brazo. Bisagra atrás, empuja el suelo y deja que la pesa suba sola; el brazo libre acompaña.',
  },
  'fx-side-jackknife': {
    en: 'Lying on your side. Bring leg and torso up together so hip and ribs meet; lower slowly.',
    es: 'Tumbado de lado. Sube pierna y torso a la vez para juntar cadera y costillas; baja despacio.',
  },
}

/* -------------------------------------------------------------------- run */

export function enrich({ dryRun = false } = {}) {
  const licence = verifyEverkineticLicence()

  const catalog = JSON.parse(readFileSync(join(SRC_DIR, 'exercises.json'), 'utf8'))
  const instructions = JSON.parse(readFileSync(join(SRC_DIR, 'instructions.json'), 'utf8'))
  const mediaIndex = JSON.parse(readFileSync(join(SRC_DIR, 'media-index.json'), 'utf8'))
  const attribution = JSON.parse(readFileSync(join(SRC_DIR, 'media-attribution.json'), 'utf8'))

  const ekRaw = JSON.parse(readFileSync(join(EK, 'exercises.json'), 'utf8'))
  const ekAll = Array.isArray(ekRaw) ? ekRaw : ekRaw.exercises ?? Object.values(ekRaw)
  const ekWithArt = ekAll.filter((e) => existsSync(join(EK, 'svg', `${e.id_num}-tension.svg`)))

  const report = {
    licence,
    everkinetic: { available: ekAll.length, withArt: ekWithArt.length, usedForMedia: [], usedForSteps: [] },
    variant: [],
    stillNothing: [],
    before: {},
    after: {},
  }

  const stepsOf = (id) => instructions[id]?.en?.length ?? 0
  report.before = {
    total: catalog.exercises.length,
    illustrated: catalog.exercises.filter((e) => e.m).length,
    withSteps: catalog.exercises.filter((e) => stepsOf(e.id) > 0).length,
  }

  /* ------------------------------------------ pass 2: Everkinetic's own art */

  const takenEk = new Set()
  for (const e of catalog.exercises) {
    const needsMedia = !e.m
    const needsSteps = stepsOf(e.id) === 0
    if (!needsMedia && !needsSteps) continue

    let best = null
    let bestScore = 0
    for (const d of ekWithArt) {
      for (const mine of namesOf(e)) {
        for (const theirs of [d.title, d.name.replace(/-/g, ' ')]) {
          if (!agree(mine, theirs, {})) continue
          const s = similarity(mine, theirs)
          if (s > bestScore) {
            bestScore = s
            best = d
          }
        }
      }
    }
    if (!best || bestScore < 0.6) continue

    if (needsMedia && !takenEk.has(best.id_num)) {
      const key = `ek-${slugify(best.name)}`
      const rel = `/exercise-media/everkinetic/${slugify(best.name)}/frame-1.svg`
      if (!dryRun) {
        const dest = join(MEDIA_DIR, 'everkinetic', slugify(best.name))
        mkdirSync(dest, { recursive: true })
        copyFileSync(join(EK, 'svg', `${best.id_num}-tension.svg`), join(dest, 'frame-1.svg'))
      }
      // One drawing, not three. The index keeps the same shape and the app
      // shows a still rather than pretending there is a sequence.
      mediaIndex.entries[key] = { s: rel, m: null, e: null }
      attribution.entries[key] = {
        exerciseId: e.id,
        externalId: `everkinetic-${best.id_num}`,
        slug: slugify(best.name),
        startImage: rel,
        midImage: null,
        endImage: null,
        frames: [{ index: 1, path: rel }],
        source: 'everkinetic',
        sourceUrl: licence.sourceUrl,
        originalAuthor: licence.author,
        originalSource: 'Everkinetic',
        originalSourceUrl: `https://github.com/everkinetic/data/blob/main/dist/svg/${best.id_num}-tension.svg`,
        license: licence.license,
        licenseUrl: licence.licenseUrl,
        attribution: `Ilustración: Greg Priday (Everkinetic). CC BY-SA 4.0.`,
        changes: null,
      }
      e.m = key
      e.mediaStatus = 'illustrated'
      takenEk.add(best.id_num)
      report.everkinetic.usedForMedia.push({ id: e.id, name: e.n.en, from: best.title, score: Number(bestScore.toFixed(2)) })
    }

    if (needsSteps && Array.isArray(best.steps) && best.steps.length) {
      instructions[e.id] = {
        ...(instructions[e.id] ?? {}),
        en: best.steps.map((s) => String(s).trim()).filter(Boolean),
        es: instructions[e.id]?.es ?? null,
        esStatus: instructions[e.id]?.esStatus ?? 'missing',
        source: { name: 'everkinetic', id: best.id_num, url: licence.sourceUrl, license: licence.license },
      }
      e.hasInstructions = true
      report.everkinetic.usedForSteps.push({ id: e.id, name: e.n.en, from: best.title })
    }
  }

  /* --------------------------------- pass 3: an equivalent movement's art */

  const donors = catalog.exercises.filter((e) => e.m)
  for (const e of catalog.exercises) {
    if (e.m) continue
    let best = null
    let bestScore = 0
    for (const d of donors) {
      if (d.kind !== e.kind || d.mg !== e.mg) continue
      for (const mine of namesOf(e)) {
        for (const theirs of namesOf(d)) {
          // Equipment may differ here — that is the whole point of a variant —
          // but nothing else may.
          if (!agree(mine, theirs, { ignoreEquipment: true, ignoreStyle: true })) continue
          const s = coreSimilarity(mine, theirs)
          if (s > bestScore) {
            bestScore = s
            best = d
          }
        }
      }
    }
    if (!best || bestScore < 0.5) {
      report.stillNothing.push({ id: e.id, name: e.n.en, kind: e.kind })
      continue
    }
    e.m = best.m
    e.mediaStatus = 'variant'
    // Carried so the sheet can name the movement it is actually showing.
    e.mv = { id: best.id, en: best.n.en, es: best.n.es }
    report.variant.push({ id: e.id, name: e.n.en, from: best.n.en, score: Number(bestScore.toFixed(2)) })
  }

  /* ------------------------------------------- the last few, written by us */

  let ourCues = 0
  for (const [id, cue] of Object.entries(OUR_CUES)) {
    const e = catalog.exercises.find((x) => x.id === id)
    if (!e) continue
    const current = instructions[id] ?? { en: [], es: null, esStatus: 'missing' }
    if (current.cueEn || current.cueEs) continue
    instructions[id] = {
      ...current,
      cueEn: cue.en,
      cueEs: cue.es,
      source: { name: 'training-os', id, url: null, license: 'proprietary' },
    }
    e.hasInstructions = true
    ourCues++
  }
  report.ourCues = ourCues

  /* ------------------------------------------------------------- finalise */

  for (const e of catalog.exercises) if (e.m && e.mediaStatus === 'none') e.mediaStatus = 'illustrated'

  catalog.catalogVersion = OUT_VERSION
  catalog.generatedAt = new Date().toISOString()
  catalog.counts = {
    ...catalog.counts,
    illustrated: catalog.exercises.filter((e) => e.m).length,
    illustratedOwn: catalog.exercises.filter((e) => e.mediaStatus === 'illustrated').length,
    illustratedVariant: catalog.exercises.filter((e) => e.mediaStatus === 'variant').length,
    withInstructions: catalog.exercises.filter((e) => stepsOf(e.id) > 0).length,
  }
  mediaIndex.version = OUT_VERSION
  attribution.version = OUT_VERSION

  report.after = {
    total: catalog.exercises.length,
    illustrated: catalog.counts.illustrated,
    illustratedOwn: catalog.counts.illustratedOwn,
    illustratedVariant: catalog.counts.illustratedVariant,
    withSteps: catalog.counts.withInstructions,
    nothingAtAll: report.stillNothing.length,
    noDrawingAndNoText: catalog.exercises.filter(
      (e) => e.mediaStatus === 'none' && stepsOf(e.id) === 0 && !instructions[e.id]?.cueEn && !instructions[e.id]?.cueEs,
    ).length,
  }

  if (!dryRun) {
    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(join(OUT_DIR, 'exercises.json'), JSON.stringify(catalog))
    writeFileSync(join(OUT_DIR, 'instructions.json'), JSON.stringify(instructions))
    writeFileSync(join(OUT_DIR, 'media-index.json'), JSON.stringify(mediaIndex))
    writeFileSync(join(OUT_DIR, 'media-attribution.json'), JSON.stringify(attribution, null, 1))
    writeFileSync(join(ROOT, 'docs', 'CATALOG-ENRICH-REPORT.json'), JSON.stringify(report, null, 1))
  }
  return { catalog, instructions, mediaIndex, attribution, report }
}

if (process.argv[1] && process.argv[1].endsWith('enrich.mjs')) {
  const { report } = enrich({ dryRun: process.argv.includes('--dry') })
  console.log('LICENCIA VERIFICADA')
  console.log(`  ${report.licence.name.padEnd(22)} ${report.licence.license}  (${report.licence.verifiedAt})`)
  console.log('\nANTES ', JSON.stringify(report.before))
  console.log('DESPUÉS', JSON.stringify(report.after))
  console.log('\nDE DÓNDE SALE CADA ILUSTRACIÓN')
  console.log(`  propia (Workout Guide + Everkinetic) ${report.after.illustratedOwn}`)
  console.log(`  de un movimiento equivalente         ${report.after.illustratedVariant}`)
  console.log(`  sin ninguna                          ${report.after.nothingAtAll}`)
  console.log(`\n  Everkinetic aportó ${report.everkinetic.usedForMedia.length} dibujos y ${report.everkinetic.usedForSteps.length} juegos de pasos`)
  console.log(`  escritas por nosotros                ${report.ourCues} claves de ejecución`)
  console.log(`  sin dibujo NI texto de ningún tipo   ${report.after.noDrawingAndNoText}`)
}
