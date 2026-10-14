/**
 * Units, number format and the session's texts — what batch A of the audit fixed.
 *
 *   1. Settings: the weight lists take a decimal comma ("1,25; 2,5" is two
 *      weights, not four), the hint says how to write them, the photos switch
 *      says it is about the exported backup, storage is in GB, and the boxes
 *      of the two-column grids stay level when a label wraps.
 *   2. Exercise card: "Categoría" and "Tipo" are two different rows, no
 *      "separate with commas" over chips nobody can type into, and a cardio
 *      exercise has no RIR target, no weight ladder and no "0s rest" line.
 *   3. A real history, built through the UI: in Spanish every decimal has a
 *      comma; in LB nothing shows raw kilos — "last time", the coach's WHY,
 *      the plateau, the weight-up and PR celebrations — and volume reads
 *      "k lb", not tonnes. No "RIR —" when no RIR was written down.
 *   4. The same in English: points, "NEW PR", "WEIGHT UP".
 *
 * Requires a local-only build served at BASE (default :4330):
 *   npx vite build --mode localonly --outDir <dir>
 *   npx vite preview --outDir <dir> --host 127.0.0.1 --port 4330
 *
 * Selectors avoid the set row's accessibility labels on purpose: another batch
 * translates them. Rows are found by structure (inputs + the tick button).
 */
import { chromium } from 'playwright'
import { CHROMIUM_EXE } from './chromium.mjs'

const BASE = process.env.BASE || 'http://127.0.0.1:4330'
// The browser comes from e2e/chromium.mjs (CHROMIUM_EXE).
const EXE = CHROMIUM_EXE

const out = []
let failures = 0
const check = (cond, msg, detail) => {
  if (cond) out.push('PASS  ' + msg)
  else {
    failures++
    out.push('FAIL  ' + msg + (detail !== undefined ? `\n      ${detail}` : ''))
  }
}
function report() {
  console.log(out.join('\n'))
  console.log(`\n${out.length - failures} passed, ${failures} failed`)
}
process.on('uncaughtException', (err) => {
  out.push('FAIL  el guion se detuvo: ' + String(err).split('\n')[0])
  failures++
  report()
  process.exit(1)
})
process.on('unhandledRejection', (err) => {
  out.push('FAIL  el guion se detuvo: ' + String(err).split('\n')[0])
  failures++
  report()
  process.exit(1)
})

const dialog = (page) => page.locator('[role="dialog"]')
const text = async (page) => (await page.locator('body').textContent()) ?? ''

/** Same shortcut as e2e/workout-session.mjs: write the settings row the questionnaire writes. */
async function skipOnboarding(page) {
  await page.goto(BASE, { waitUntil: 'commit' })
  await page.waitForTimeout(3500)
  await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('training-os')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const row = await new Promise((res) => {
      const r = db.transaction('settings').objectStore('settings').get('app')
      r.onsuccess = () => res(r.result)
      r.onerror = () => res(null)
    })
    if (!row) return
    row.onboardingVersion = 1
    await new Promise((res) => {
      const r = db.transaction('settings', 'readwrite').objectStore('settings').put(row)
      r.onsuccess = () => res()
      r.onerror = () => res()
    })
  })
  await page.reload({ waitUntil: 'commit' })
  await page.waitForTimeout(3000)
}

/** The settings row as stored. */
async function storedSettings(page) {
  return page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('training-os')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    return new Promise((res) => {
      const r = db.transaction('settings').objectStore('settings').get('app')
      r.onsuccess = () => res(r.result)
      r.onerror = () => res(null)
    })
  })
}

/** Tops of the boxes of a two-column grid, as [left, right] pairs per row. */
async function gridRows(page, inputLabel) {
  return page.getByLabel(inputLabel, { exact: true }).evaluate((input) => {
    const grid = input.closest('.grid')
    const tops = [...grid.querySelectorAll('input')].map((i) => Math.round(i.getBoundingClientRect().top * 10) / 10)
    const rows = []
    for (let i = 0; i + 1 < tops.length; i += 2) rows.push([tops[i], tops[i + 1]])
    const labels = [...grid.querySelectorAll('label')].map((l) => Math.round(l.getBoundingClientRect().height))
    return { rows, labels }
  })
}

async function goSettings(page) {
  await page.goto(`${BASE}/settings`, { waitUntil: 'commit' })
  await page.waitForTimeout(2500)
}

async function setUnits(page, units) {
  await goSettings(page)
  await page.getByRole('tab', { name: units.toUpperCase(), exact: true }).click()
  await page.waitForTimeout(800)
}

async function setLanguage(page, lang) {
  await goSettings(page)
  await page.locator('select:has(option[value="en"])').selectOption(lang)
  await page.waitForTimeout(1200)
}

async function startFreeWorkout(page) {
  await page.goto(`${BASE}/workout`, { waitUntil: 'commit' })
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /Entrenamiento libre|Free workout/ }).first().click()
  await page.waitForTimeout(2500)
}

async function addExercise(page, query) {
  await page.getByRole('button', { name: /Añadir ejercicio|Add exercise/ }).first().click()
  await page.waitForTimeout(2500)
  await page.getByPlaceholder(/^(Buscar|Search)/).fill(query)
  await page.waitForTimeout(2200)
  await page.locator('div.fixed.inset-0.z-50 p.text-card-sm').first().click()
  await page.waitForTimeout(3000)
}

/**
 * Tags every set row with data-e2e-row="i": the smallest element around a
 * tick button (aria-pressed) that also holds the row's inputs.
 */
async function markRows(page) {
  return page.evaluate(() => {
    document.querySelectorAll('[data-e2e-row]').forEach((n) => n.removeAttribute('data-e2e-row'))
    let k = 0
    for (const b of document.querySelectorAll('button[aria-pressed]')) {
      let n = b.parentElement
      while (n && n.querySelectorAll('input').length < 2) n = n.parentElement
      if (!n || n.querySelectorAll('button[aria-pressed]').length !== 1) continue
      n.setAttribute('data-e2e-row', String(k++))
    }
    return k
  })
}

async function logSet(page, i, weight, reps) {
  await markRows(page)
  const inputs = page.locator(`[data-e2e-row="${i}"] input`)
  await inputs.nth(0).fill(weight)
  await inputs.nth(1).fill(reps)
  await page.waitForTimeout(300)
  await markRows(page)
  await page.locator(`[data-e2e-row="${i}"] button[aria-pressed]`).click()
  await page.waitForTimeout(1200)
  const skip = page.getByRole('button', { name: /^(Saltar|Skip)$/ })
  if (await skip.count()) await skip.first().click().catch(() => {})
  await page.waitForTimeout(300)
}

async function finishWorkout(page) {
  await page.getByRole('button', { name: /^(Hecho|Done)$/ }).click()
  await page.waitForTimeout(800)
  await dialog(page).getByRole('button', { name: /^(FINALIZAR|FINISH)$/ }).click()
  await page.waitForTimeout(2500)
}

/** One finished session of the incline press: two sets at `weight` × `reps`. */
async function pressSession(page, weight, reps) {
  await startFreeWorkout(page)
  await addExercise(page, 'press inclinado mancuernas')
  await logSet(page, 0, weight, reps)
  await logSet(page, 1, weight, reps)
  await finishWorkout(page)
}

/** Text of the card whose small heading is exactly `heading`. */
async function cardText(page, heading) {
  return page.evaluate((h) => {
    const p = [...document.querySelectorAll('p')].find((el) => (el.textContent ?? '').trim() === h)
    return p?.closest('.card')?.textContent ?? null
  }, heading)
}

/** The coach's card with its WHY open. */
async function targetCardText(page) {
  const btn = page.locator('button[aria-expanded]').filter({ hasText: /POR QUÉ|WHY/ }).first()
  if ((await btn.count()) === 0) return null
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click()
  await page.waitForTimeout(400)
  return btn.evaluate((b) => b.closest('.card')?.textContent ?? '')
}

/** Records every text the celebration layer shows from now on. */
async function recordCelebrations(page) {
  await page.evaluate(() => {
    window.__celebrations = []
    const seen = new Set()
    const grab = () => {
      for (const el of document.querySelectorAll('div.fixed')) {
        if (!String(el.className).includes('z-[58]')) continue
        const txt = el.textContent ?? ''
        if (txt && !seen.has(txt)) {
          seen.add(txt)
          window.__celebrations.push(txt)
        }
      }
    }
    new MutationObserver(grab).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
}
const celebrations = (page) => page.evaluate(() => window.__celebrations ?? [])

/* =================================================================== run */

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'es-ES',
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 160)))

await skipOnboarding(page)

/* ------------------------------------------------------------ 1. Ajustes */
{
  await goSettings(page)
  const body = await text(page)
  check(/Incluir las fotos de progreso en la copia/.test(body), 'ajustes — el interruptor de fotos dice que es para la copia')
  check(/«Exportar copia de seguridad»/.test(body), 'ajustes — y explica que las añade al archivo exportado')
  check(!/Separa los valores con comas\./.test(body), 'ajustes — la ayuda ya no dice «separa con comas»')
  check(/punto y coma/.test(body) && /decimales pueden llevar coma o punto/.test(body), 'ajustes — la ayuda explica separadores y coma decimal')

  // Storage, in the largest unit that reads well.
  const quota = await page.evaluate(async () => (await navigator.storage.estimate()).quota ?? 0)
  const storage = await page.evaluate(
    () => [...document.querySelectorAll('p.tnum')].map((p) => p.textContent ?? '').find((s) => / de /.test(s)) ?? '',
  )
  check(!/\d{4,}(?:[.,]\d)? MB/.test(storage), 'ajustes — el almacenamiento no dice miles de MB', storage)
  if (quota >= 1024 ** 3) check(/ de \d+(?:,\d)? GB$/.test(storage), 'ajustes — una cuota de gigas se dice en GB', storage)
  check(!/\d\.\d/.test(storage), 'ajustes — en español, sin punto decimal en el almacenamiento', storage)

  // A decimal comma is a decimal: two weights, not four.
  // What the app writes into the field keeps its point, as it always did.
  const plates = await page.getByLabel('Discos por lado (kg)', { exact: true }).inputValue()
  check(/^1\.25, 2\.5, 5\b/.test(plates), 'ajustes — la lista se escribe en el campo con punto, como siempre', plates)
  const field = page.getByLabel('Micro-discos (kg)', { exact: true })
  const original = await field.inputValue()
  await field.fill('0,5; 1,25')
  await page.waitForTimeout(800)
  let micro = (await storedSettings(page))?.availableWeights?.microPlates
  check(JSON.stringify(micro) === '[0.5,1.25]', 'ajustes — «0,5; 1,25» guarda 0.5 y 1.25', JSON.stringify(micro))
  await field.fill('1,25, 2,5')
  await page.waitForTimeout(800)
  micro = (await storedSettings(page))?.availableWeights?.microPlates
  check(JSON.stringify(micro) === '[1.25,2.5]', 'ajustes — «1,25, 2,5» son dos pesos, no cuatro', JSON.stringify(micro))
  await field.fill(original)
  await page.waitForTimeout(800)

  // The two-column grid stays level even where a label wraps.
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 })
    await page.waitForTimeout(400)
    const g = await gridRows(page, 'Peso de la barra (kg)')
    const off = g.rows.filter(([a, b]) => Math.abs(a - b) > 1)
    check(off.length === 0, `ajustes — a ${width}px las casillas de los pesos quedan alineadas`, JSON.stringify(g))
  }
  await page.setViewportSize({ width: 390, height: 844 })
}

/* ------------------------------------------------------ 2. Ficha (kg) */
{
  await page.goto(`${BASE}/library/lib-incline-dumbbell-press`, { waitUntil: 'commit' })
  await page.waitForTimeout(3500)
  const facts = await page.evaluate(() =>
    [...document.querySelectorAll('dt')].map((dt) => `${dt.textContent}=${dt.nextElementSibling?.textContent ?? ''}`),
  )
  check(facts.includes('Categoría=Compuesto'), 'ficha — «Compuesto» va en «Categoría»', facts.join(' | '))
  check(facts.includes('Tipo=Fuerza'), 'ficha — «Fuerza» va en «Tipo»', facts.join(' | '))
  check(facts.filter((f) => f.startsWith('Tipo=')).length === 1, 'ficha — ya no hay dos filas «Tipo»', facts.join(' | '))
  const body = await text(page)
  check(!/Separa los valores/.test(body), 'ficha — sin «separa los valores» sobre chips que no se editan')
  check(/RIR objetivo/.test(body) && /Pesos disponibles/.test(body), 'ficha — un ejercicio de fuerza sí tiene RIR objetivo y pesos')
  const chips = await page.evaluate(() =>
    [...document.querySelectorAll('span.tnum.rounded-md')].map((s) => s.textContent ?? ''),
  )
  check(chips.length > 3, 'ficha — se ven los pesos disponibles', chips.join(' '))
  check(chips.every((c) => !/\./.test(c)), 'ficha — los pesos con decimales llevan coma en español', chips.join(' '))

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 })
    await page.waitForTimeout(400)
    const g = await gridRows(page, 'Descanso por defecto (s)')
    const off = g.rows.filter(([a, b]) => Math.abs(a - b) > 1)
    check(off.length === 0, `ficha — a ${width}px «Tus valores por defecto» queda alineado`, JSON.stringify(g))
  }
  await page.setViewportSize({ width: 390, height: 844 })

  // Cardio: no RIR, no weight ladder, no "0s rest".
  await page.goto(`${BASE}/library/lib-treadmill`, { waitUntil: 'commit' })
  await page.waitForTimeout(3500)
  const cardio = await text(page)
  check(/Cinta|Treadmill/.test(cardio), 'cardio — abre la ficha de la cinta', cardio.slice(0, 80))
  check(!/RIR objetivo/.test(cardio), 'cardio — sin «RIR objetivo»')
  check(!/Pesos disponibles/.test(cardio), 'cardio — sin «Pesos disponibles»')
  await page.getByRole('button', { name: /Cómo hacerlo/ }).first().click()
  await page.waitForTimeout(3000)
  const how = (await dialog(page).textContent()) ?? ''
  check(/Ficha del ejercicio/.test(how), 'cardio — la hoja «Cómo hacerlo» enseña su ficha', how.slice(0, 120))
  check(!/Series y repeticiones/.test(how) && !/0s de descanso/.test(how), 'cardio — sin «Series y repeticiones: 0s de descanso»', how.slice(0, 300))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
}

/* ------------------------------------- 3. Historia real, español (kg) */
{
  // Session 1 also checks the notes sheet: three notes, three titles.
  await startFreeWorkout(page)
  await addExercise(page, 'press inclinado mancuernas')
  check(page.url().endsWith('/workout/active'), 'sesión — empieza un entrenamiento con el press inclinado', page.url())
  await page.getByRole('button', { name: 'Más', exact: true }).first().click()
  await page.waitForTimeout(800)
  const notes = (await dialog(page).textContent()) ?? ''
  check(/NOTAS DEL EJERCICIO/.test(notes), 'notas — la nota fija del ejercicio', notes.slice(0, 200))
  check(/NOTA DE ESTE EJERCICIO HOY/.test(notes), 'notas — la de este ejercicio hoy se llama así', notes.slice(0, 300))
  check(/NOTA DEL ENTRENAMIENTO/.test(notes), 'notas — la del entrenamiento entero se llama así', notes.slice(0, 300))
  check(!/NOTAS DE LA SESIÓN/.test(notes), 'notas — ya no hay dos «NOTAS DE LA SESIÓN»', notes.slice(0, 300))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  await logSet(page, 0, '32,5', '8')
  await logSet(page, 1, '32,5', '8')
  const typed = await page.locator('[data-e2e-row="0"] input').first().inputValue()
  check(typed === '32.5' || typed === '32,5', 'sesión — el campo de peso conserva lo escrito', typed)
  await finishWorkout(page)
  check(page.url().endsWith('/workout/summary'), 'sesión — la primera sesión se guarda', page.url())

  // Session 2: what the screen says about session 1.
  await startFreeWorkout(page)
  await addExercise(page, 'press inclinado mancuernas')
  const last = (await cardText(page, 'ÚLTIMA VEZ')) ?? ''
  check(/32,5 × 8/.test(last) && !/32\.5/.test(last), 'última vez — «32,5 × 8» con coma', last)
  const why = (await targetCardText(page)) ?? ''
  check(/32,5 kg × 8/.test(why), 'por qué — nombra el peso con su unidad: «32,5 kg × 8»', why)
  check(!/RIR —/.test(why) && !/con RIR/.test(why), 'por qué — sin RIR anotado no dice «con RIR —»', why)
  await logSet(page, 0, '32,5', '8')
  await logSet(page, 1, '32,5', '8')
  await finishWorkout(page)

  // Session 3, same again: three sessions without progress.
  await pressSession(page, '32,5', '8')

  // Session 4 opens on a plateau.
  await startFreeWorkout(page)
  await addExercise(page, 'press inclinado mancuernas')
  const kgCard = (await targetCardText(page)) ?? ''
  check(/POSIBLE ESTANCAMIENTO/.test(kgCard), 'meseta — tres sesiones iguales avisan de estancamiento', kgCard.slice(0, 200))
  check(/32,5 kg × 8 en las últimas 3 sesiones/.test(kgCard), 'meseta — «32,5 kg × 8 en las últimas 3 sesiones»', kgCard)

  /* ---- the same screens in LB */
  await setUnits(page, 'lb')
  await page.goto(`${BASE}/workout/active`, { waitUntil: 'commit' })
  await page.waitForTimeout(3500)
  const lastLb = (await cardText(page, 'ÚLTIMA VEZ')) ?? ''
  check(/71,7 × 8/.test(lastLb), 'LB — «última vez» en libras: 71,7 × 8', lastLb)
  check(!/32[.,]5/.test(lastLb), 'LB — «última vez» ya no enseña los kilos crudos', lastLb)
  const lbCard = (await targetCardText(page)) ?? ''
  check(/71,7 lb × 8/.test(lbCard), 'LB — el «¿por qué?» dice «71,7 lb × 8»', lbCard)
  check(/71,7 lb × 8 en las últimas 3 sesiones/.test(lbCard), 'LB — la meseta en libras', lbCard)
  check(!/\bkg\b/.test(lbCard) && !/32[.,]5/.test(lbCard), 'LB — en la tarjeta del objetivo no queda ningún kilo', lbCard)

  // Heavier than last time: the weight-up badge and a weight PR.
  await recordCelebrations(page)
  await logSet(page, 0, '77,5', '8')
  await page.waitForTimeout(400)
  const party = await celebrations(page)
  const all = party.join(' ‖ ')
  check(/NUEVO RÉCORD/.test(all), 'celebración — «NUEVO RÉCORD» en español', all)
  check(/MÁS PESO/.test(all), 'celebración — «MÁS PESO» en español', all)
  check(/\+5,8 lb/.test(all), 'celebración — la subida en libras: «+5,8 lb»', all)
  check(!/NEW PR|WEIGHT UP|\bkg\b|\brep\b|\breps\b/.test(all), 'celebración — nada en inglés ni en kilos', all)
  await finishWorkout(page)

  // Volume in pounds is thousands of pounds, not tonnes.
  await page.goto(`${BASE}/`, { waitUntil: 'commit' })
  await page.waitForTimeout(3500)
  const home = await text(page)
  check(/\d+(?:,\d)?k lb/.test(home), 'volumen — en LB se dice «k lb»', home.match(/[\d.,]+\s?k? ?(?:lb|t)\b/g)?.join(' | '))
  check(!/\d(?:[.,]\d)?t\b/.test(home), 'volumen — en LB no aparecen toneladas', home.match(/\d(?:[.,]\d)?t\b/g)?.join(' | '))
  // A point followed by three digits is the Spanish thousands separator.
  check(!/\d\.\d{1,2}(?!\d)/.test(home), 'volumen — en español ningún decimal con punto en Inicio', home.match(/\d\.\d+\S*/g)?.join(' | '))
  await page.goto(`${BASE}/history`, { waitUntil: 'commit' })
  await page.waitForTimeout(3000)
  const history = await text(page)
  check(/1,1k lb/.test(history), 'volumen — cada sesión del historial en «k lb» (1,1k lb)', history.match(/[\d.,]+\s?k? ?(?:lb|t)\b/g)?.join(' | '))

  // The exercise card in LB: chips and min/max in the same unit.
  await page.goto(`${BASE}/library/lib-incline-dumbbell-press`, { waitUntil: 'commit' })
  await page.waitForTimeout(3500)
  const ladder = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('span.tnum.rounded-md')].map((s) => s.textContent ?? '')
    const minmax = [...document.querySelectorAll('p')].map((p) => p.textContent ?? '').find((s) => /mín: /.test(s)) ?? ''
    return { chips, minmax }
  })
  check(
    ladder.minmax.startsWith(`mín: ${ladder.chips[0]} lb`),
    'ficha LB — el primer chip y el mínimo dicen el mismo peso en libras',
    JSON.stringify(ladder),
  )
}

/* ------------------------------------------------------- 4. In English */
{
  await setLanguage(page, 'en')
  await page.goto(`${BASE}/`, { waitUntil: 'commit' })
  await page.waitForTimeout(3500)
  const homeLb = await text(page)
  check(/\d+(?:\.\d)?k lb/.test(homeLb), 'inglés — volumen «k lb» con punto', homeLb.match(/[\d.,]+\s?k? ?(?:lb|t)\b/g)?.join(' | '))
  check(!/\d,\d/.test(homeLb.replace(/\d{1,3}(,\d{3})+/g, '')), 'inglés — ningún decimal con coma', homeLb.match(/\d,\d+\S*/g)?.join(' | '))

  await setUnits(page, 'kg')
  await page.goto(`${BASE}/`, { waitUntil: 'commit' })
  await page.waitForTimeout(3500)
  const homeKg = await text(page)
  check(/1\.8t/.test(homeKg), 'inglés — en kg, toneladas con punto: «1.8t»', homeKg.match(/[\d.,]+\s?k? ?(?:kg|t)\b/g)?.join(' | '))

  await startFreeWorkout(page)
  await addExercise(page, 'incline dumbbell press')
  const last = (await cardText(page, 'LAST TIME')) ?? ''
  check(/35\.2 × 8/.test(last), 'inglés — «last time» con punto: 35.2 × 8', last)
  const why = (await targetCardText(page)) ?? ''
  check(/35\.2 kg × 8/.test(why) && !/RIR —/.test(why), 'inglés — el WHY con su unidad y sin «RIR —»', why)
  await recordCelebrations(page)
  await logSet(page, 0, '40', '8')
  await page.waitForTimeout(400)
  const all = (await celebrations(page)).join(' ‖ ')
  check(/NEW PR/.test(all) && /WEIGHT UP/.test(all), 'inglés — «NEW PR» y «WEIGHT UP»', all)
  check(/\+4\.8 kg/.test(all), 'inglés — la subida con punto: «+4.8 kg»', all)
  check(!/NUEVO|MÁS PESO|repetici/.test(all), 'inglés — nada en español en las celebraciones', all)
  await finishWorkout(page)
}

check(errors.length === 0, 'sin errores en la página', errors.slice(0, 3).join(' | '))
await ctx.close().catch(() => {})
await browser.close().catch(() => {})

report()
if (failures > 0) process.exit(1)
