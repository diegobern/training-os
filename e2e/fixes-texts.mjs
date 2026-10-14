/**
 * Texts, plurals and the language of what was saved (audit, batch B).
 *
 *   1. Routine editor: «DÍA 1 / DÍA 1», the days sheet called «Rutinas»,
 *      RIR «1,5» saved as NaN, nothing out of range stopped, «Mover a otro
 *      día» broken in two; «1 días», «1 ejercicios»; activating a routine
 *      said just «Activar»; the empty Progress overview talked about "this
 *      exercise" with none chosen.
 *   2. A free workout saved in Spanish, read in English and back: its name,
 *      the exercise names, plurals, period chips, the calendar (month tile,
 *      days without a workout), search without accents, accessibility labels.
 *   3. Body weight «abc» says something; a file that is not a backup says
 *      why, in the app's language.
 *
 * Requires a local-only build served at BASE (default :4330):
 *   npx vite build --mode localonly --outDir <dir>
 *   npx vite preview --outDir <dir> --host 127.0.0.1 --port 4330
 *
 * `ONLY=2` runs a single scenario.
 */
import { chromium } from 'playwright'
import { CHROMIUM_EXE } from './chromium.mjs'

// The browser comes from e2e/chromium.mjs (CHROMIUM_EXE).
const EXE = CHROMIUM_EXE
const BASE = process.env.BASE || 'http://127.0.0.1:4330'
const ONLY = (process.env.ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const only = (n) => ONLY.length === 0 || ONLY.includes(String(n))

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

async function openApp({ width = 390, height = 844 } = {}) {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'es-ES',
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 160)))
  const close = async () => {
    await ctx.close().catch(() => {})
    await browser.close().catch(() => {})
  }
  return { page, errors, close }
}

/** Reads or patches the settings row the app keeps in IndexedDB. */
async function patchSettings(page, patch) {
  await page.evaluate(async (patch) => {
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
    Object.assign(row, patch)
    await new Promise((res) => {
      const r = db.transaction('settings', 'readwrite').objectStore('settings').put(row)
      r.onsuccess = () => res()
      r.onerror = () => res()
    })
    db.close()
  }, patch)
}

/** Same shortcut as e2e/workout-session.mjs: write the settings row the questionnaire writes. */
async function skipOnboarding(page) {
  await page.goto(BASE, { waitUntil: 'commit' })
  await page.waitForTimeout(3500)
  await patchSettings(page, { onboardingVersion: 1 })
  await page.reload({ waitUntil: 'commit' })
  await page.waitForTimeout(3000)
}

/** Switches the app's language the way Settings stores it, and reloads. */
async function setLanguage(page, language) {
  await patchSettings(page, { language })
  await page.reload({ waitUntil: 'commit' })
  await page.waitForTimeout(3500)
}

async function go(page, path, wait = 2500) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'commit' })
  await page.waitForTimeout(wait)
}

const text = (page) => page.evaluate(() => document.body.innerText)
const dialog = (page) => page.locator('[role="dialog"]')
const toasts = (page) => page.locator('div[role="status"][aria-live="polite"]').last()
const sheetRows = (page) => page.locator('div.fixed.inset-0.z-50 p.text-card-sm')
const sheetAdd = (page) => page.locator('div.fixed.inset-0.z-50').getByRole('button', { name: /^Añadir \(/ })

/** How many lines a button's text takes. */
async function textLines(locator) {
  return locator.evaluate((el) => {
    const r = document.createRange()
    r.selectNodeContents(el)
    const tops = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)))
    return tops.size
  })
}

/** An exercise's two names, as the catalog the app ships has them today. */
async function catalogNames(page, id) {
  return page.evaluate(async (id) => {
    const file = await fetch('/catalog/v2/exercises.json').then((r) => r.json())
    const list = Array.isArray(file) ? file : Array.isArray(file.exercises) ? file.exercises : Object.values(file.exercises ?? file)
    const e = list.find((x) => x.id === id)
    return e ? { es: e.n.es, en: e.n.en } : null
  }, id)
}

/* =============================================== 1. the routine editor */
if (only(1)) {
  const { page, errors, close } = await openApp()
  await skipOnboarding(page)

  // ---- 21: an empty Progress overview does not talk about "this exercise"
  await go(page, '/progress')
  const empty = await text(page)
  check(!/Registra al menos una sesión con este ejercicio/.test(empty), 'progreso vacío — no habla de «este ejercicio» sin ejercicio elegido', empty.slice(0, 200))
  check(/Termina tu primer entrenamiento/.test(empty), 'progreso vacío — explica qué hacer para ver algo', empty.slice(0, 200))

  // ---- a blank routine
  await go(page, '/routines')
  await page.getByRole('button', { name: 'Nueva rutina' }).first().click()
  await page.waitForTimeout(700)
  await page.getByRole('textbox').first().fill('Rutina B uno')
  await page.getByRole('button', { name: /^En blanco/ }).click()
  await page.getByRole('button', { name: 'Crear', exact: true }).click()
  await page.waitForTimeout(2500)
  check(/\/routines\/.+/.test(page.url()), 'editor — crear en blanco abre el editor', page.url())
  check(/0 días/.test(await text(page)), 'plural — una rutina sin días dice «0 días»')

  await page.getByRole('button', { name: 'Añadir día' }).first().click()
  await page.waitForTimeout(1500)
  const chip = page.locator('div.scroll-x button').first()
  const chipText = ((await chip.innerText()) ?? '').replace(/\s+/g, ' ').trim()
  check(chipText.startsWith('DÍA 1'), 'editor — el día nuevo es el DÍA 1', chipText)
  check(!/DÍA 1 DÍA 1/.test(chipText), 'editor — ya no pone «DÍA 1 / DÍA 1»', chipText)
  check(/0 ejercicios/.test(chipText), 'editor — debajo dice cuántos ejercicios tiene', chipText)
  const subtitle = await text(page)
  check(/\b1 día\b/.test(subtitle) && !/\b1 días\b/.test(subtitle), 'plural — «1 día», no «1 días»', subtitle.slice(0, 200))

  // ---- 20: the list icon opens "Días", not "Rutinas"
  await page.getByRole('button', { name: 'Días', exact: true }).click()
  await page.waitForTimeout(800)
  const daysTitle = ((await dialog(page).locator('h3').first().textContent()) ?? '').trim()
  check(daysTitle === 'Días', 'editor — la hoja de días se titula «Días»', daysTitle)
  // 11: the sheet's close button speaks Spanish.
  check((await dialog(page).getByRole('button', { name: 'Close' }).count()) === 0, 'accesibilidad — la hoja no tiene un «Close» en inglés')
  await dialog(page).getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.waitForTimeout(600)
  check((await dialog(page).count()) === 0, 'accesibilidad — «Cerrar» cierra la hoja')

  // ---- one exercise
  await page.getByRole('button', { name: /Añadir ejercicio/ }).first().click()
  await page.waitForTimeout(2500)
  await page.getByPlaceholder('Buscar').fill('press inclinado mancuernas')
  await page.waitForTimeout(2200)
  await sheetRows(page).first().click()
  await page.waitForTimeout(400)
  await sheetAdd(page).click()
  await page.waitForTimeout(2000)
  const withOne = await text(page)
  check(/\b1 ejercicio ·/.test(withOne) && !/\b1 ejercicios\b/.test(withOne), 'plural — «1 ejercicio · …»', withOne.slice(0, 300))
  check(/1 ejercicio/.test(((await chip.innerText()) ?? '')), 'editor — el día cuenta su ejercicio')

  // ---- 6: RIR / RPE with a decimal comma, limits, rep range
  const row = page.locator('main button.press.min-w-0, button.press.min-w-0.flex-1').filter({ hasText: '×' }).first()
  const rowText = async () => ((await row.innerText()) ?? '').replace(/\s+/g, ' ')
  await row.click()
  await page.waitForTimeout(700)
  const rir = dialog(page).getByLabel('RIR objetivo')
  check((await rir.getAttribute('inputmode')) === 'decimal', 'objetivos — el RIR abre el teclado con coma decimal')
  await rir.fill('1,5')
  await page.waitForTimeout(400)
  check((await dialog(page).getByText('El RIR va de 0 a 10').count()) === 0, 'objetivos — «1,5» es un RIR válido')
  await dialog(page).getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.waitForTimeout(700)
  const afterRir = await rowText()
  check(/RIR 1,5/.test(afterRir) && !/NaN/.test(afterRir), 'objetivos — la rutina dice «RIR 1,5», no «RIR NaN»', afterRir)

  await row.click()
  await page.waitForTimeout(700)
  await dialog(page).getByLabel('RIR objetivo').fill('25')
  await page.waitForTimeout(400)
  check((await dialog(page).getByText('El RIR va de 0 a 10').count()) === 1, 'objetivos — RIR 25 se marca como no válido')
  check((await dialog(page).getByLabel('RIR objetivo').getAttribute('aria-invalid')) === 'true', 'objetivos — y el campo queda marcado')
  await dialog(page).getByLabel('RPE objetivo').fill('0')
  await page.waitForTimeout(300)
  check((await dialog(page).getByText('El RPE va de 1 a 10').count()) === 1, 'objetivos — RPE 0 se marca como no válido')
  await dialog(page).getByLabel('RPE objetivo').fill('8,5')
  await page.waitForTimeout(300)
  check((await dialog(page).getByText('El RPE va de 1 a 10').count()) === 0, 'objetivos — RPE «8,5» vale')

  const repMin = dialog(page).getByLabel(/Rango de repeticiones mín/)
  const repMax = dialog(page).getByLabel(/Rango de repeticiones máx/)
  await repMax.fill('10')
  await page.waitForTimeout(250)
  await repMin.fill('12')
  await page.waitForTimeout(400)
  check((await dialog(page).getByText('No puede ser menor que el mínimo').count()) === 1, 'objetivos — mínimo 12 y máximo 10 se avisa')
  await dialog(page).getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.waitForTimeout(700)
  const kept = await rowText()
  check(/RIR 1,5/.test(kept), 'objetivos — el RIR no válido no se ha guardado', kept)
  check(!/12–10/.test(kept), 'objetivos — el rango al revés tampoco', kept)

  await row.click()
  await page.waitForTimeout(700)
  await dialog(page).getByLabel(/Rango de repeticiones máx/).fill('15')
  await dialog(page).getByLabel(/Rango de repeticiones mín/).fill('12')
  await page.waitForTimeout(400)
  check((await dialog(page).getByText('No puede ser menor que el mínimo').count()) === 0, 'objetivos — 12–15 vale')

  // ---- 29: «Mover a otro día» on one line, here and at 320 px
  const move = dialog(page).getByRole('button', { name: 'Mover a otro día' })
  check((await textLines(move)) === 1, 'editor — «Mover a otro día» cabe en una línea', String(await textLines(move)))
  await page.setViewportSize({ width: 320, height: 700 })
  await page.waitForTimeout(500)
  const lines320 = await textLines(move)
  const box = await move.boundingBox()
  const del = await dialog(page).getByRole('button', { name: 'Eliminar', exact: true }).boundingBox()
  check(lines320 === 1, 'editor — y también a 320 px', String(lines320))
  check(box && del && del.x + del.width <= 320 && box.x >= 0, 'editor — los dos botones caben a 320 px', `${JSON.stringify(box)} ${JSON.stringify(del)}`)
  await page.setViewportSize({ width: 390, height: 844 })
  await dialog(page).getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.waitForTimeout(700)
  check(/12–15/.test(await rowText()), 'objetivos — el rango 12–15 queda guardado', await rowText())

  // ---- 19 + 15: a second routine, activated from the list
  await go(page, '/routines')
  await page.getByRole('button', { name: 'Nueva rutina' }).first().click()
  await page.waitForTimeout(700)
  await page.getByRole('textbox').first().fill('Rutina B dos')
  await page.getByRole('button', { name: /^En blanco/ }).click()
  await page.getByRole('button', { name: 'Crear', exact: true }).click()
  await page.waitForTimeout(2000)
  await go(page, '/routines')
  const list = await text(page)
  check(/1 día · 1 ejercicio\b/.test(list), 'plural — la lista dice «1 día · 1 ejercicio»', list.slice(0, 300))
  check(/0 días · 0 ejercicios/.test(list), 'plural — y «0 días · 0 ejercicios»', list.slice(0, 300))
  await page.getByRole('button', { name: 'Activar', exact: true }).first().click()
  await page.waitForTimeout(500)
  const toastText = ((await toasts(page).innerText()) ?? '').trim()
  check(/Rutina activada/.test(toastText), 'activar — el aviso dice «Rutina activada»', toastText)
  check(!/^Activar$/m.test(toastText), 'activar — y no sólo «Activar»', toastText)

  check(errors.length === 0, 'editor — sin errores', errors.slice(0, 2).join(' | '))
  await close()
}

/* ==================== 2. what was saved in Spanish, read in English, and back */
if (only(2)) {
  const { page, errors, close } = await openApp()
  await skipOnboarding(page)
  const ID = 'lib-incline-dumbbell-press'
  const names = await catalogNames(page, ID)
  check(names && names.es !== names.en, 'guardado — el ejercicio tiene nombre en los dos idiomas', JSON.stringify(names))

  // Two real free workouts, in Spanish: one exercise and one set each, the
  // second heavier so that it sets a record.
  async function freeWorkout(weight) {
    await go(page, '/workout')
    await page.getByRole('button', { name: /Entrenamiento libre/ }).first().click()
    await page.waitForTimeout(2500)
    await page.getByRole('button', { name: /Añadir ejercicio/ }).first().click()
    await page.waitForTimeout(2500)
    await page.getByPlaceholder('Buscar').fill('press inclinado mancuernas')
    await page.waitForTimeout(2200)
    await sheetRows(page).first().click()
    await page.waitForTimeout(3000)
    await page.getByLabel('Peso', { exact: true }).first().fill(String(weight))
    await page.getByLabel('Repeticiones', { exact: true }).first().fill('8')
    await page.getByRole('button', { name: 'Serie 1 completada', exact: true }).first().click()
    await page.waitForTimeout(1200)
    const skip = page.getByRole('button', { name: 'Saltar' })
    if (await skip.count()) await skip.first().click()
    await page.getByRole('button', { name: 'Hecho', exact: true }).click()
    await page.waitForTimeout(700)
    await dialog(page).getByRole('button', { name: 'FINALIZAR', exact: true }).click()
    await page.waitForTimeout(2500)
  }
  await freeWorkout(60)
  check(page.url().endsWith('/workout/summary'), 'guardado — el entrenamiento libre se termina', page.url())
  const summaryEs = await text(page)
  check(/Entrenamiento libre/i.test(summaryEs), 'guardado — el resumen lo llama «Entrenamiento libre»', summaryEs.slice(0, 120))
  await page.getByRole('button', { name: 'Hecho', exact: true }).click()
  await page.waitForTimeout(1500)
  await freeWorkout(70)
  const summary2 = await text(page)
  check(/RÉCORD/i.test(summary2) && summary2.includes(names.es), 'guardado — el segundo, más pesado, bate un récord (en español)', summary2.slice(0, 400))
  await page.getByRole('button', { name: 'Hecho', exact: true }).click()
  await page.waitForTimeout(1500)

  // Spanish, as saved.
  await go(page, '/history')
  const histEs = await text(page)
  check(/Entrenamiento libre/.test(histEs), 'historial es — «Entrenamiento libre»')
  check(/\b1 serie ·/.test(histEs) && !/\b1 series\b/.test(histEs), 'plural — el historial dice «1 serie», no «1 series»', histEs.slice(0, 300))
  check(/\b2 sesiones\b/.test(histEs), 'plural — y arriba «2 sesiones»', histEs.slice(0, 200))
  check((await page.getByRole('button', { name: 'Volver', exact: true }).count()) >= 1, 'accesibilidad — la flecha de volver se llama «Volver»')
  check((await page.getByRole('button', { name: 'Back', exact: true }).count()) === 0, 'accesibilidad — y no «Back»')
  await page.locator('main button, button').filter({ hasText: 'Entrenamiento libre' }).first().click()
  await page.waitForTimeout(2000)
  const sessionUrl = page.url()
  const detailEs = await text(page)
  check(detailEs.includes(names.es), 'detalle es — el ejercicio en español', detailEs.slice(0, 200))
  check(/\b1 serie ·/.test(detailEs), 'plural — el detalle dice «1 serie ·»', detailEs.slice(0, 300))

  // ---- the same records, in English
  await setLanguage(page, 'en')
  await go(page, '/history')
  const histEn = await text(page)
  check(/Free workout/.test(histEn) && !/Entrenamiento libre/.test(histEn), 'idioma — en inglés el historial dice «Free workout»', histEn.slice(0, 200))
  check(/\b1 set ·/.test(histEn) && !/\b1 sets\b/.test(histEn), 'plural — en inglés «1 set», no «1 sets»', histEn.slice(0, 300))
  check(/\b2 sessions\b/.test(histEn), 'plural — y «2 sessions»', histEn.slice(0, 200))
  check((await page.getByRole('button', { name: 'Back', exact: true }).count()) >= 1, 'accesibilidad — en inglés la flecha se llama «Back»')

  await page.goto(sessionUrl, { waitUntil: 'commit' })
  await page.waitForTimeout(2500)
  const detailEn = await text(page)
  check(/Free workout/.test(detailEn), 'idioma — el detalle se titula «Free workout»', detailEn.slice(0, 120))
  check(detailEn.includes(names.en) && !detailEn.includes(names.es), 'idioma — y el ejercicio sale en inglés, no como se guardó', detailEn.slice(0, 300))

  await go(page, '/', 3000)
  const homeEn = await text(page)
  check(/Free workout/.test(homeEn) && !/Entrenamiento libre/.test(homeEn), 'idioma — Inicio dice «Free workout»', homeEn.slice(0, 300))
  check(homeEn.includes(names.en) && !homeEn.includes(names.es), 'idioma — los récords de Inicio con el nombre en inglés', homeEn.slice(0, 600))

  await go(page, '/prs')
  const prsEn = await text(page)
  check(prsEn.includes(names.en) && !prsEn.includes(names.es), 'idioma — Récords con el nombre en inglés', prsEn.slice(0, 300))
  await go(page, '/stats')
  const statsEn = await text(page)
  check(statsEn.includes(names.en) && !statsEn.includes(names.es), 'idioma — Estadísticas con el nombre en inglés', statsEn.slice(0, 400))
  await go(page, '/progress')
  const overEn = await text(page)
  check(overEn.includes(names.en) && !overEn.includes(names.es), 'idioma — el resumen de Progreso con el nombre en inglés', overEn.slice(0, 400))
  check(/Used in 2 sessions\b/.test(overEn), 'plural — «Used in 2 sessions»', overEn.slice(0, 400))

  await go(page, '/calendar')
  const today = page.locator('button[aria-pressed][aria-label*="2 workouts"]').first()
  check((await today.count()) === 1, 'calendario — el día entrenado se anuncia «… · 2 workouts»')
  const tileEn = await text(page)
  check(/This month\s*2\s*workouts\b/i.test(tileEn), 'calendario — «This month · 2 workouts»', tileEn.slice(0, 120))
  await today.click()
  await page.waitForTimeout(600)
  check(/Free workout/.test(await text(page)), 'calendario — al tocar el día, «Free workout»')

  await go(page, '/search')
  await page.getByRole('textbox').first().fill('free')
  await page.waitForTimeout(800)
  check(/Free workout/.test(await text(page)), 'búsqueda — «free» encuentra el libre guardado en español')
  await page.getByRole('textbox').first().fill('inclinado')
  await page.waitForTimeout(800)
  const byOldName = await text(page)
  check(/sessions/i.test(byOldName) && /Free workout/.test(byOldName),'búsqueda — y el nombre con el que se guardó también lo encuentra', byOldName.slice(0, 300))

  await go(page, `/progress/${ID}`)
  const chipsEn = await page.locator('div.scroll-x button').allInnerTexts()
  check(chipsEn.join(',') === '1M,3M,6M,1Y,All', 'periodos — en inglés «1M 3M 6M 1Y All»', chipsEn.join(','))

  // ---- and back to Spanish
  await setLanguage(page, 'es')
  await go(page, `/progress/${ID}`)
  const chipsEs = await page.locator('div.scroll-x button').allInnerTexts()
  check(chipsEs.join(',') === '1 M,3 M,6 M,1 A,Todo', 'periodos — en español «1 M 3 M 6 M 1 A Todo»', chipsEs.join(','))
  check(!/\b1Y\b|\bALL\b/.test(await text(page)), 'periodos — ni «1Y» ni «ALL» con la app en español')

  await go(page, '/calendar')
  check((await page.getByRole('button', { name: 'Mes anterior' }).count()) === 1, 'accesibilidad — «Mes anterior», no «prev»')
  check((await page.getByRole('button', { name: 'Mes siguiente' }).count()) === 1, 'accesibilidad — «Mes siguiente», no «next»')
  check((await page.getByRole('button', { name: /^(prev|next)$/ }).count()) === 0, 'accesibilidad — no queda ningún «prev»/«next»')
  const tileEs = await text(page)
  check(/Este mes\s*2\s*entrenamientos\b/i.test(tileEs), 'calendario — «Este mes · 2 entrenamientos»', tileEs.slice(0, 120))

  // ---- 22: another month, and a day without a workout
  await page.getByRole('button', { name: 'Mes anterior' }).click()
  await page.waitForTimeout(600)
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevLabel = new Intl.DateTimeFormat('es-ES', prev.getFullYear() === now.getFullYear() ? { month: 'long' } : { month: 'short', year: 'numeric' }).format(prev)
  const tilePrev = await text(page)
  check(!/Este mes/i.test(tilePrev), 'calendario — en otro mes la tarjeta ya no dice «Este mes»', tilePrev.slice(0, 120))
  check(tilePrev.toLowerCase().includes(prevLabel.toLowerCase()), `calendario — dice el mes que se ve («${prevLabel}»)`, tilePrev.slice(0, 120))
  check(/\b0\s*entrenamientos\b/i.test(tilePrev), 'calendario — «0 entrenamientos» en plural', tilePrev.slice(0, 120))
  const emptyDay = page.locator('button[aria-pressed]:not([aria-label*="entrenamiento"])').nth(10)
  await emptyDay.click()
  await page.waitForTimeout(500)
  check(/Sin entrenamiento este día/.test(await text(page)), 'calendario — tocar un día sin entreno lo dice')
  check((await emptyDay.getAttribute('aria-pressed')) === 'true', 'calendario — y el día queda marcado')
  await page.getByRole('button', { name: 'Mes siguiente' }).click()
  await page.waitForTimeout(500)
  check(/Este mes/i.test(await text(page)), 'calendario — al volver, «Este mes» otra vez')
  check(!/Sin entrenamiento este día/.test(await text(page)), 'calendario — cambiar de mes quita la selección del otro mes')

  // ---- 14: search without accents
  await go(page, '/search')
  await page.getByRole('textbox').first().fill('jalon')
  await page.waitForTimeout(900)
  const jalon = await text(page)
  check(/Jalón/.test(jalon), 'búsqueda — «jalon» encuentra «Jalón…»', jalon.slice(0, 300))
  await page.getByRole('textbox').first().fill('menton')
  await page.waitForTimeout(900)
  const menton = await text(page)
  check(/Mentón/.test(menton), 'búsqueda — «menton» encuentra «…Mentón»', menton.slice(0, 300))
  await page.getByRole('textbox').first().fill('ENTRENAMIENTO LIBRE')
  await page.waitForTimeout(900)
  check(/Entrenamiento libre/.test(await text(page)), 'búsqueda — sin distinguir mayúsculas')

  check(errors.length === 0, 'idioma — sin errores', errors.slice(0, 2).join(' | '))
  await close()
}

/* ============================== 3. body weight and import, saying why */
if (only(3)) {
  const { page, errors, close } = await openApp()
  await skipOnboarding(page)

  // ---- 23
  await go(page, '/body')
  await page.getByRole('button', { name: 'Registrar peso' }).first().click()
  await page.waitForTimeout(700)
  const field = dialog(page).getByRole('textbox').first()
  await field.fill('abc')
  await dialog(page).getByRole('button', { name: 'Guardar' }).click()
  await page.waitForTimeout(600)
  check((await dialog(page).count()) === 1, 'peso — con «abc» la hoja no se cierra')
  check((await dialog(page).getByText('Escribe un peso válido, mayor que 0.').count()) === 1, 'peso — y dice que el valor no es válido')
  check((await field.getAttribute('aria-invalid')) === 'true', 'peso — el campo queda marcado')
  await field.fill('80,5')
  check((await dialog(page).getByText('Escribe un peso válido').count()) === 0, 'peso — al corregirlo el aviso se va')
  await dialog(page).getByRole('button', { name: 'Guardar' }).click()
  await page.waitForTimeout(1200)
  check((await dialog(page).count()) === 0, 'peso — «80,5» se guarda y la hoja se cierra')
  const bodyChips = await page.locator('div.scroll-x button').allInnerTexts()
  check(bodyChips.includes('7 D') && bodyChips.includes('30 D') && bodyChips.includes('Todo'), 'periodos — el peso corporal usa «7 D 30 D … Todo»', bodyChips.join(','))
  check(!bodyChips.includes('ALL') && !bodyChips.includes('7D'), 'periodos — y ninguno en inglés', bodyChips.join(','))

  // ---- 11: import errors, translated by kind
  await go(page, '/settings')
  await page.getByRole('button', { name: 'Importar copia de seguridad' }).first().click()
  await page.waitForTimeout(700)
  const input = page.locator('input[type="file"][accept*="json"]')
  await input.setInputFiles({ name: 'otra-cosa.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') })
  await page.waitForTimeout(1200)
  const notBackup = ((await toasts(page).innerText()) ?? '').trim()
  check(/Este archivo no es una copia de seguridad de Training OS\./.test(notBackup), 'importar — un JSON que no es una copia lo dice en español', notBackup)
  check(!/Not a Training OS backup|Backup has no data/.test(notBackup), 'importar — sin el mensaje en inglés de antes', notBackup)
  await page.waitForTimeout(4500)
  await input.setInputFiles({ name: 'roto.json', mimeType: 'application/json', buffer: Buffer.from('{ no es json') })
  await page.waitForTimeout(1200)
  const notJson = ((await toasts(page).innerText()) ?? '').trim()
  check(/El archivo está dañado o no es una copia de seguridad\./.test(notJson), 'importar — un archivo que no es JSON lo dice', notJson)
  check(!/JSON|Unexpected|token/.test(notJson), 'importar — sin el error técnico del navegador', notJson)

  check(errors.length === 0, 'peso e importar — sin errores', errors.slice(0, 2).join(' | '))
  await close()
}

report()
if (failures > 0) process.exit(1)
