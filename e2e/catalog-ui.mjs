/**
 * The catalog, seen from the app.
 *
 * Everything below was already built and invisible: 1096 exercises, 906
 * illustrations, bilingual names and instructions. These assertions are about
 * whether a person using Training OS can actually reach any of it — and about
 * the three rules that must not be broken on the way:
 *
 *   · the catalog never blocks boot;
 *   · an exercise without an illustration says so, it does not show a hole;
 *   · opening HOW TO during a workout does not cost a single logged set.
 */
import { chromium } from 'playwright'

const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const SHOTS = '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots'
const BASE = process.env.BASE || 'http://127.0.0.1:4330'

const out = []
let failures = 0
const check = (c, m, d) => {
  if (c) out.push('PASS  ' + m)
  else {
    failures++
    out.push('FAIL  ' + m + (d ? `\n      ${d}` : ''))
  }
}

/**
 * `ONLY=6,7` runs just those scenarios.
 *
 * Each one is self-contained — its own browser, its own profile — so running a
 * subset is exactly the same as running it inside the whole suite. That is what
 * makes chasing one flaky scenario cheap instead of a ten-minute round trip.
 */
const ONLY = (process.env.ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const only = (n) => ONLY.length === 0 || ONLY.includes(String(n))

/** Always print what did run — a timeout halfway through must not hide it. */
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

/**
 * One browser per scenario, closed with it.
 *
 * Sharing a single browser across all of them left the last scenario talking
 * to a process that had quietly gone: a whole section of the suite reported as
 * "browser has been closed" rather than as a result. A scenario that starts
 * its own browser cannot be poisoned by the one before it.
 */
async function openApp({ locale = 'es-ES', width = 390 } = {}) {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })
  const ctx = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale,
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 160)))
  page.on('response', (r) => {
    // A broken illustration is exactly the thing Priority 3 forbids.
    if (r.status() >= 400 && r.url().includes('/exercise-media/')) errors.push(`HTTP ${r.status()} ${r.url().slice(-50)}`)
  })
  const close = async () => {
    await ctx.close().catch(() => {})
    await browser.close().catch(() => {})
  }
  return { ctx, page, errors, close }
}

const body = (page) => page.textContent('body')

/**
 * Rows inside the open sheet, never the screen behind it.
 *
 * Once a routine day has exercises, a bare `p.text-card-sm` matches the rows
 * of the editor underneath the picker — Playwright then clicks something the
 * overlay is covering and the run stalls on an intercepted click. Scoping to
 * the sheet is the difference between testing the picker and testing whatever
 * happened to be behind it.
 */
const sheetRows = (page) => page.locator('div.fixed.inset-0.z-50 p.text-card-sm')
const sheetAdd = (page) => page.locator('div.fixed.inset-0.z-50').getByRole('button', { name: /^Añadir \(/ })

/**
 * Skips the questionnaire by writing the settings row the app writes itself.
 *
 * These tests are about the catalog, and seven taps of an unrelated flow in
 * front of every scenario is how a suite becomes slow and fragile. The shape
 * written here is the same one `e2e/onboarding.mjs` asserts the app produces.
 */
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

/* =============================================== 1. boot is not slowed down */
if (only(1))
{
  const { page, errors, close } = await openApp()
  const catalogRequests = []
  page.on('request', (r) => {
    if (r.url().includes('/catalog/v2/')) catalogRequests.push({ url: r.url(), at: Date.now() })
  })
  const t0 = Date.now()
  await page.goto(BASE, { waitUntil: 'commit' })
  await page.waitForFunction(() => !document.getElementById('boot-mark'), null, { timeout: 20_000 }).catch(() => {})
  const bootMs = Date.now() - t0
  check(bootMs < 8000, `arranque — la app aparece en menos de 8 s (${bootMs} ms)`, String(bootMs))
  check(
    catalogRequests.length === 0,
    'arranque — el catálogo NO se descarga en el arranque',
    catalogRequests.map((r) => r.url.slice(-40)).join(' | '),
  )
  check(errors.length === 0, 'arranque — sin errores', errors.slice(0, 2).join(' | '))
  await close()
}

/* ============================================ 2. the library shows the 1096 */
let libraryCount = 0
if (only(2))
{
  const { page, errors, close } = await openApp()
  await skipOnboarding(page)
  await page.goto(`${BASE}/library`, { waitUntil: 'commit' })
  await page.waitForTimeout(4000)

  const txt = await body(page)
  const m = txt.match(/(\d+)\s+ejercicios/)
  libraryCount = m ? Number(m[1]) : 0
  check(libraryCount > 1000, 'biblioteca — muestra más de mil ejercicios', `contados=${libraryCount}`)
  await page.screenshot({ path: `${SHOTS}/cat-01-library.png` })

  /* --- the kind filter, which is how cardio became reachable at all */
  await page.getByRole('button', { name: 'Cardio', exact: true }).first().click()
  await page.waitForTimeout(1500)
  const cardioTxt = await body(page)
  const cm = cardioTxt.match(/(\d+)\s+ejercicios/)
  const cardioCount = cm ? Number(cm[1]) : 0
  check(cardioCount > 0 && cardioCount < libraryCount, 'biblioteca — el filtro Cardio acota la lista', `cardio=${cardioCount} total=${libraryCount}`)
  await page.screenshot({ path: `${SHOTS}/cat-02-cardio.png` })

  await page.getByRole('button', { name: 'Movilidad', exact: true }).first().click()
  await page.waitForTimeout(1500)
  const mob = (await body(page)).match(/(\d+)\s+ejercicios/)
  check(mob && Number(mob[1]) > 0, 'biblioteca — el filtro Movilidad devuelve resultados', mob ? mob[1] : 'ninguno')

  /* --- search, in the language being used */
  await page.getByRole('button', { name: 'Todo', exact: true }).first().click()
  await page.waitForTimeout(800)
  await page.getByPlaceholder('Buscar').fill('press banca')
  await page.waitForTimeout(1800)
  const searched = await body(page)
  check(/banca/i.test(searched), 'biblioteca — buscar en español encuentra resultados', searched.slice(0, 160))

  // Accents must not be required on a phone keyboard.
  await page.getByPlaceholder('Buscar').fill('biceps')
  await page.waitForTimeout(1800)
  const folded = (await body(page)).match(/(\d+)\s+ejercicios/)
  check(folded && Number(folded[1]) > 0, 'biblioteca — buscar sin tildes encuentra "bíceps"', folded ? folded[1] : 'ninguno')

  check(errors.length === 0, 'biblioteca — sin errores ni imágenes rotas', errors.slice(0, 2).join(' | '))
  await close()
}

/* ============================== 3. HOW TO from the detail screen, with SVGs */
if (only(3))
{
  const { page, errors, close } = await openApp()
  await skipOnboarding(page)

  // Asked of the catalog rather than hard-coded: an entry that has BOTH an
  // illustration and written steps. Not every exercise has steps — many carry
  // only a cue — and a test that happened to land on one of those would be
  // asserting the wrong thing about the sheet.
  const withBoth = await page.evaluate(async () => {
    const [ex, ins] = await Promise.all([
      fetch('/catalog/v2/exercises.json').then((r) => r.json()),
      fetch('/catalog/v2/instructions.json').then((r) => r.json()),
    ])
    // A Workout Guide one specifically: three frames plus written steps, the
    // richest state the sheet can be in.
    const hit = ex.exercises.find(
      (e) => e.mediaStatus === 'illustrated' && !e.m.startsWith('ek-') && (ins[e.id]?.en?.length ?? 0) > 0,
    )
    return hit ? { id: hit.id, name: hit.n.es } : null
  })
  check(!!withBoth, 'catálogo — hay ejercicios con ilustración e instrucciones', JSON.stringify(withBoth))

  await page.goto(`${BASE}/library/${withBoth.id}`, { waitUntil: 'commit' })
  await page.waitForTimeout(3000)
  check((await body(page)).includes('Cómo hacerlo'), 'ficha — ofrece CÓMO HACERLO')

  await page.getByRole('button', { name: /Cómo hacerlo/ }).first().click()
  await page.waitForTimeout(3000)

  const sheet = await body(page)
  const imgs = await page.locator('img[src^="/exercise-media/"]').count()
  check(imgs >= 1, 'CÓMO HACERLO — muestra la ilustración del ejercicio', `imágenes=${imgs}`)
  check(imgs <= 3, 'CÓMO HACERLO — son tres fotogramas, no un vídeo', `imágenes=${imgs}`)
  check(sheet.includes('Instrucciones'), 'CÓMO HACERLO — muestra las instrucciones')
  check(sheet.includes('CC BY-SA 4.0'), 'CÓMO HACERLO — acredita la ilustración, como exige la licencia')
  check(sheet.includes('Cerrar y seguir'), 'CÓMO HACERLO — se puede cerrar sin salir')

  // Every frame really resolves — a 404 would have been recorded above.
  const broken = await page.evaluate(() =>
    [...document.querySelectorAll('img[src^="/exercise-media/"]')].filter((i) => i.complete && i.naturalWidth === 0).length,
  )
  check(broken === 0, 'CÓMO HACERLO — ninguna imagen rota', `rotas=${broken}`)

  /**
   * Loaded is not the same as visible.
   *
   * The illustrations are a single white silhouette. On the light card they
   * first shipped against, every assertion above passed and the box was
   * blank. So the plate's own brightness is asserted: white artwork needs a
   * dark backing, whichever theme is in use.
   */
  const plate = await page.evaluate(() => {
    const el = document.querySelector('.demo-plate')
    if (!el) return null
    const style = getComputedStyle(el)
    const rgb = (style.backgroundColor.match(/\d+/g) ?? []).map(Number)
    const lum = rgb.length >= 3 ? (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 : null
    return { lum, image: style.backgroundImage !== 'none' }
  })
  check(!!plate, 'CÓMO HACERLO — la ilustración va sobre una placa propia', JSON.stringify(plate))
  check(
    !!plate && (plate.image || (plate.lum !== null && plate.lum < 0.35)),
    'CÓMO HACERLO — la placa es oscura, así el trazo blanco se ve',
    JSON.stringify(plate),
  )
  await page.screenshot({ path: `${SHOTS}/cat-03-howto.png` })
  check(errors.length === 0, 'CÓMO HACERLO — sin errores', errors.slice(0, 2).join(' | '))
  await close()
}

/* ================================ 4. an exercise with no illustration at all */
if (only(4))
{
  const { page, errors, close } = await openApp()
  await skipOnboarding(page)

  // Ask the catalog itself for an entry that declares no media, so the test
  // cannot silently stop covering this case when the catalog changes.
  const slug = await page.evaluate(async () => {
    const res = await fetch('/catalog/v2/exercises.json')
    const file = await res.json()
    const hit = file.exercises.find((e) => !e.m && e.hasInstructions)
    return hit ? { id: hit.id, name: hit.n.es } : null
  })
  check(!!slug, 'catálogo — existe algún ejercicio sin ilustración para probarlo', JSON.stringify(slug))

  if (slug) {
    await page.goto(`${BASE}/library/${slug.id}`, { waitUntil: 'commit' })
    await page.waitForTimeout(3000)
    await page.getByRole('button', { name: /Cómo hacerlo/ }).first().click()
    await page.waitForTimeout(2500)
    const txt = await body(page)
    check(txt.includes('Todavía no hay demostración visual'), 'sin ilustración — lo dice con palabras', txt.slice(0, 200))
    const imgs = await page.locator('img[src^="/exercise-media/"]').count()
    check(imgs === 0, 'sin ilustración — no intenta cargar ninguna imagen', `imágenes=${imgs}`)
    await page.screenshot({ path: `${SHOTS}/cat-04-nomedia.png` })
  }
  check(errors.length === 0, 'sin ilustración — sin errores', errors.slice(0, 2).join(' | '))
  await close()
}

/* ========================= 4 bis. cobertura y procedencia, vistas desde la app */
if (only(4))
{
  const { page, errors, close } = await openApp()
  await skipOnboarding(page)

  const stats = await page.evaluate(async () => {
    const [ex, ins] = await Promise.all([
      fetch('/catalog/v2/exercises.json').then((r) => r.json()),
      fetch('/catalog/v2/instructions.json').then((r) => r.json()),
    ])
    const text = (e) => (ins[e.id]?.en?.length ?? 0) > 0 || !!ins[e.id]?.cueEn || !!ins[e.id]?.cueEs
    return {
      total: ex.exercises.length,
      drawn: ex.exercises.filter((e) => e.mediaStatus !== 'none').length,
      own: ex.exercises.filter((e) => e.mediaStatus === 'illustrated').length,
      variant: ex.exercises.filter((e) => e.mediaStatus === 'variant').length,
      nothing: ex.exercises.filter((e) => e.mediaStatus === 'none' && !text(e)).length,
      variantsLabelled: ex.exercises.filter((e) => e.mediaStatus === 'variant').every((e) => e.mv?.es),
    }
  })
  check(stats.drawn >= 660, `cobertura — ${stats.drawn} de ${stats.total} muestran un dibujo`, JSON.stringify(stats))
  check(stats.nothing <= 1, `cobertura — como mucho un ejercicio sin dibujo ni texto (hay ${stats.nothing})`, JSON.stringify(stats))
  check(stats.variantsLabelled, 'procedencia — toda variante trae el nombre del movimiento dibujado')

  /* --- a borrowed illustration must say so, on screen --- */
  const variant = await page.evaluate(async () => {
    const ex = await fetch('/catalog/v2/exercises.json').then((r) => r.json())
    const hit = ex.exercises.find((e) => e.mediaStatus === 'variant')
    return hit ? { id: hit.id, from: hit.mv.es } : null
  })
  check(!!variant, 'hay ejercicios que reutilizan el dibujo de un equivalente')
  if (variant) {
    await page.goto(`${BASE}/library/${variant.id}`, { waitUntil: 'commit' })
    await page.waitForTimeout(3000)
    await page.getByRole('button', { name: /Cómo hacerlo/ }).first().click()
    await page.waitForTimeout(3000)
    const txt = await body(page)
    check(txt.includes('movimiento equivalente'), 'variante — dice en pantalla que el dibujo es de otro movimiento', txt.slice(0, 200))
    check(txt.includes(variant.from), 'variante — nombra el movimiento que sí está dibujado', variant.from)
    const imgs = await page.locator('img[src^="/exercise-media/"]').count()
    check(imgs >= 1, 'variante — y enseña la ilustración', `imágenes=${imgs}`)
    await page.screenshot({ path: `${SHOTS}/cat-10-variante.png` })
  }

  /* --- an Everkinetic one is a still, not a fake sequence --- */
  const single = await page.evaluate(async () => {
    const ex = await fetch('/catalog/v2/exercises.json').then((r) => r.json())
    const hit = ex.exercises.find((e) => e.mediaStatus === 'illustrated' && e.m.startsWith('ek-'))
    return hit ? hit.id : null
  })
  if (single) {
    await page.goto(`${BASE}/library/${single}`, { waitUntil: 'commit' })
    await page.waitForTimeout(3000)
    await page.getByRole('button', { name: /Cómo hacerlo/ }).first().click()
    await page.waitForTimeout(3000)
    const txt = await body(page)
    check(txt.includes('Posición de máxima tensión'), 'fotograma único — se presenta como dibujo fijo', txt.slice(0, 200))
    check(txt.includes('Greg Priday'), 'fotograma único — acredita a quien lo dibujó, no a la otra fuente')
    const imgs = await page.locator('img[src^="/exercise-media/"]').count()
    check(imgs === 1, 'fotograma único — carga una sola imagen', `imágenes=${imgs}`)
    await page.screenshot({ path: `${SHOTS}/cat-11-everkinetic.png` })
  }
  check(errors.length === 0, 'cobertura — sin errores', errors.slice(0, 2).join(' | '))
  await close()
}

/* ========================= 5. routine → add exercise → find it in the catalog */
if (only(5))
{
  const { page, errors, close } = await openApp()
  await skipOnboarding(page)
  await page.goto(`${BASE}/routines`, { waitUntil: 'commit' })
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: 'Nueva rutina' }).first().click()
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: 'Crear', exact: true }).click()
  await page.waitForTimeout(2500)

  const editor = await body(page)
  check(!/Push \/ Pull \/ Legs/.test(editor) || /Empuje|Tirón|Pierna/.test(editor), 'rutina — la plantilla se crea en español', editor.slice(0, 200))

  await page.getByRole('button', { name: /Añadir ejercicio/ }).first().click()
  await page.waitForTimeout(2500)
  await page.getByPlaceholder('Buscar').fill('incline dumbbell press')
  await page.waitForTimeout(2200)
  const picker = await body(page)
  check(/incline|inclinad/i.test(picker), 'selector — encuentra "Incline Dumbbell Press"', picker.slice(0, 200))
  await page.screenshot({ path: `${SHOTS}/cat-05-picker.png` })

  await sheetRows(page).first().click()
  await page.waitForTimeout(400)
  await sheetAdd(page).click()
  await page.waitForTimeout(2000)
  const afterAdd = await body(page)
  check(/incline|inclinad/i.test(afterAdd), 'selector — el ejercicio queda añadido al día', afterAdd.slice(0, 200))

  /* --- and a cardio exercise into the very same day */
  await page.getByRole('button', { name: /Añadir ejercicio/ }).first().click()
  await page.waitForTimeout(2000)
  const reopenedSearch = await page.getByPlaceholder('Buscar').inputValue()
  check(reopenedSearch === '', 'selector — al reabrirlo no arrastra la búsqueda anterior', `valor="${reopenedSearch}"`)
  await page.getByRole('button', { name: 'Cardio', exact: true }).first().click()
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${SHOTS}/cat-09a-cardio-picker.png` })
  const cardioInPicker = await sheetRows(page).count()
  check(cardioInPicker > 0, 'selector — ofrece cardio en la misma rutina', `filas=${cardioInPicker}`)
  if (cardioInPicker > 0) {
    const cardioName = ((await sheetRows(page).first().textContent()) ?? '').trim()
    await sheetRows(page).first().click()
    await page.waitForTimeout(400)
    await sheetAdd(page).click()
    await page.waitForTimeout(2000)
    const bothKinds = await body(page)
    check(
      /inclinad/i.test(bothKinds) && bothKinds.includes(cardioName),
      'rutina — fuerza y cardio conviven en el mismo día',
      `${cardioName} | ${bothKinds.slice(0, 160)}`,
    )
    await page.screenshot({ path: `${SHOTS}/cat-09-mixed-day.png` })
  }
  check(errors.length === 0, 'rutina — sin errores', errors.slice(0, 2).join(' | '))
  await close()
}

/* ================== 6. HOW TO during a workout keeps every logged set intact */
if (only(6))
{
  const { page, errors, close } = await openApp()
  await skipOnboarding(page)

  // Demo data gives a routine with real exercises to train.
  await page.goto(`${BASE}/settings`, { waitUntil: 'commit' })
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /Cargar datos DEMO/i }).click()
  await page.waitForTimeout(8000)
  const demoTxt = await body(page)
  check(!/Hypertrophy/.test(demoTxt) || demoTxt.includes('Hipertrofia'), 'demo — la rutina de ejemplo llega en español', demoTxt.slice(0, 160))

  // The workout screen asks which day; there is no generic "start".
  await page.goto(`${BASE}/workout`, { waitUntil: 'commit' })
  await page.waitForTimeout(3000)
  await page.locator('button').filter({ hasText: /ejercicios · .* series/ }).first().click()
  await page.waitForTimeout(4000)

  const inputs = page.locator('input[inputmode="decimal"], input[inputmode="numeric"]')
  const n = await inputs.count()
  check(n > 0, 'entreno — hay series que registrar', `campos=${n}`)

  if (n >= 2) {
    await inputs.nth(0).fill('62.5')
    await inputs.nth(1).fill('9')
    await page.waitForTimeout(900)

    const howToButton = page.getByRole('button', { name: /Cómo hacerlo/ })
    check((await howToButton.count()) > 0, 'entreno — hay un acceso a CÓMO HACERLO')
    await howToButton.first().click()
    await page.waitForTimeout(3000)
    const sheet = await body(page)
    check(sheet.includes('Cerrar y seguir'), 'entreno — la hoja se abre encima de la sesión')
    await page.screenshot({ path: `${SHOTS}/cat-06-howto-workout.png` })

    await page.getByRole('button', { name: /Cerrar y seguir/ }).click()
    await page.waitForTimeout(1200)

    const weight = await inputs.nth(0).inputValue()
    const reps = await inputs.nth(1).inputValue()
    check(weight === '62.5' && reps === '9', 'entreno — cerrar CÓMO HACERLO no pierde la serie escrita', `peso=${weight} reps=${reps}`)
    const stillTraining = await body(page)
    check(!stillTraining.includes('Paso 1 de 7'), 'entreno — no se sale de la sesión')
    await page.screenshot({ path: `${SHOTS}/cat-07-back-in-set.png` })
  }
  check(errors.length === 0, 'entreno — sin errores', errors.slice(0, 2).join(' | '))
  await close()
}

/* ============================================== 7. English, and a 375px phone */
if (only(7))
{
  const { page, errors, close } = await openApp({ locale: 'en-GB', width: 375 })
  await skipOnboarding(page)
  await page.evaluate(async () => {
    const db = await new Promise((res) => {
      const r = indexedDB.open('training-os')
      r.onsuccess = () => res(r.result)
    })
    const row = await new Promise((res) => {
      const r = db.transaction('settings').objectStore('settings').get('app')
      r.onsuccess = () => res(r.result)
    })
    row.language = 'en'
    await new Promise((res) => {
      const r = db.transaction('settings', 'readwrite').objectStore('settings').put(row)
      r.onsuccess = () => res()
    })
  })
  await page.reload({ waitUntil: 'commit' })
  await page.waitForTimeout(3500)
  await page.goto(`${BASE}/library`, { waitUntil: 'commit' })
  await page.waitForTimeout(3500)

  const txt = await body(page)
  check(txt.includes('exercises'), 'inglés — la biblioteca está en inglés', txt.slice(0, 160))
  check(!txt.includes('ejercicios'), 'inglés — no quedan restos en español', txt.slice(0, 160))

  // No horizontal scroll at 375px: the chip rows must scroll inside, not push
  // the page sideways.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check(overflow <= 1, 'móvil 375px — la biblioteca no desborda a lo ancho', `desborde=${overflow}px`)
  await page.screenshot({ path: `${SHOTS}/cat-08-english-375.png` })
  check(errors.length === 0, 'inglés — sin errores', errors.slice(0, 2).join(' | '))
  await close()
}

report()
if (failures > 0) process.exit(1)
