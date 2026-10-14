/**
 * Lote C de la auditoría: entradas, selector, sesión y flujos.
 *
 *   1. El selector múltiple no pierde lo marcado al cambiar la búsqueda (1), y
 *      no enseña «0–0 reps» en el cardio (2).
 *   2. La sesión: peso corporal sin escribir «0» (4), límites de las series
 *      con el campo marcado (16), etiquetas de accesibilidad en el idioma de la
 *      app (11), la rotación de días que ni un libre ni un día vacío rompen (5),
 *      y la etiqueta «PRÓXIMO ENTRENAMIENTO» que no tapa el nombre a 320 px (28).
 *   3. Biblioteca: grupos y contadores que no cambian al hacer scroll (13), y
 *      sin «0–0 reps» (2).
 *   4. Cuestionario: cambiar de unidad convierte lo ya escrito (7), y la
 *      plantilla sugerida llega preseleccionada a Rutinas, con un texto que
 *      dice la verdad sobre lo que se puede cambiar (9).
 *
 * Contra una build local-only servida en BASE (por defecto :4330):
 *   npx vite build --mode localonly --outDir <carpeta>
 *   npx vite preview --outDir <carpeta> --host 127.0.0.1 --port 4330
 *
 * `ONLY=2` ejecuta un solo escenario.
 */
import { chromium } from 'playwright'
import { CHROMIUM_EXE } from './chromium.mjs'

const BASE = process.env.BASE || 'http://127.0.0.1:4330'
const ONLY = (process.env.ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const only = (n) => ONLY.length === 0 || ONLY.includes(String(n))

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

/** Patches the settings row in IndexedDB, as the app itself would store it. */
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

async function idbAll(page, store) {
  return page.evaluate(async (store) => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('training-os')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    return new Promise((res) => {
      const q = db.transaction(store).objectStore(store).getAll()
      q.onsuccess = () => res(q.result)
      q.onerror = () => res([])
    })
  }, store)
}

const body = async (page) => (await page.textContent('body')) ?? ''
const sheet = (page) => page.locator('div.fixed.inset-0.z-50')
const sheetRows = (page) => sheet(page).locator('li')
const sheetAdd = (page) => sheet(page).getByRole('button', { name: /^Añadir \(/ })
const dialog = (page) => page.locator('[role="dialog"]')

async function goto(page, path, wait = 2500) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'commit' })
  await page.waitForTimeout(wait)
}

/** Searches in the open picker and ticks (or picks) the first row matching `filter`. Returns its name. */
async function pickRow(page, query, filter) {
  await sheet(page).getByPlaceholder('Buscar').fill(query)
  await page.waitForTimeout(2200)
  const rows = filter ? sheetRows(page).filter(filter) : sheetRows(page)
  const row = rows.first()
  const name = ((await row.locator('p.text-card-sm').textContent()) ?? '').trim()
  await row.locator('button').first().click()
  await page.waitForTimeout(400)
  return name
}

async function skipRest(page) {
  const skip = page.getByRole('button', { name: 'Saltar' })
  if (await skip.count()) await skip.first().click()
  await page.waitForTimeout(300)
}

async function finishWorkout(page) {
  await page.getByRole('button', { name: 'Hecho', exact: true }).click()
  await page.waitForTimeout(700)
  await dialog(page).getByRole('button', { name: 'FINALIZAR', exact: true }).click()
  await page.waitForTimeout(2500)
}

/** What Home proposes as the next workout. */
async function homeNext(page) {
  await goto(page, '/', 3000)
  return ((await page.locator('h2.text-hero').first().textContent().catch(() => '')) ?? '').trim()
}

/** The day card on /workout that carries the "next workout" label. */
async function suggestedCard(page) {
  return page.evaluate(() => {
    const card = [...document.querySelectorAll('button.card')].find((b) => /PRÓXIMO ENTRENAMIENTO|NEXT WORKOUT/.test(b.textContent ?? ''))
    return card ? (card.querySelector('p.text-card')?.textContent ?? '').trim() : null
  })
}

/* ================================== 1. picker: multi-select + cardio ranges */
if (only(1)) {
  const { page, errors, close } = await openApp()
  await skipOnboarding(page)

  await goto(page, '/routines')
  await page.getByRole('button', { name: 'Nueva rutina' }).first().click()
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: 'Crear', exact: true }).click()
  await page.waitForTimeout(2500)
  check(/\/routines\/.+/.test(page.url()), 'selector — se crea una rutina para probarlo', page.url())

  await page.getByRole('button', { name: /Añadir ejercicio/ }).first().click()
  await page.waitForTimeout(2500)
  const bench = await pickRow(page, 'press banca')
  check(/banca/i.test(bench), 'selector — la búsqueda «press banca» encuentra uno y se marca', bench)
  const row = await pickRow(page, 'remo', { hasNotText: bench })
  check(/remo/i.test(row), 'selector — tras cambiar la búsqueda a «remo» se marca otro', row)
  const addLabel = ((await sheetAdd(page).textContent()) ?? '').trim()
  check(/\(2\)/.test(addLabel), 'selector — el botón cuenta los dos, aunque el primero ya no esté en la lista', addLabel)
  await sheetAdd(page).click()
  await page.waitForTimeout(2200)
  const day = await body(page)
  check(day.includes(bench), 'selector — se añade el que se marcó ANTES de cambiar la búsqueda', bench)
  check(day.includes(row), 'selector — y también el de la búsqueda actual', row)

  // Point 2, minimal: the picker says nothing about reps for cardio.
  await page.getByRole('button', { name: /Añadir ejercicio/ }).first().click()
  await page.waitForTimeout(2500)
  await sheet(page).getByRole('button', { name: 'Cardio', exact: true }).first().click()
  await page.waitForTimeout(2000)
  const cardioSubs = await sheet(page).locator('li p.text-xs').allTextContents()
  check(cardioSubs.length > 0, 'selector — el filtro de cardio enseña ejercicios', String(cardioSubs.length))
  check(
    cardioSubs.every((s) => !/0–0|\breps\b/.test(s)),
    'selector — el cardio no dice «0–0 reps» ni habla de repeticiones',
    cardioSubs.filter((s) => /0–0|\breps\b/.test(s)).slice(0, 3).join(' | '),
  )
  await sheet(page).getByRole('button', { name: 'Fuerza', exact: true }).first().click()
  await page.waitForTimeout(2000)
  const strengthSubs = await sheet(page).locator('li p.text-xs').allTextContents()
  check(
    strengthSubs.some((s) => /\d+(–\d+)? reps/.test(s)),
    'selector — la fuerza sigue enseñando su rango de repeticiones',
    strengthSubs.slice(0, 2).join(' | '),
  )
  check(!strengthSubs.some((s) => /\b1–1\b|\b0–0\b/.test(s)), 'selector — ningún «1–1» ni «0–0»')

  check(errors.length === 0, 'selector — sin errores', errors.slice(0, 2).join(' | '))
  await close()
}

/* ============================ 2. the session, the rotation and 320 px */
if (only(2)) {
  const { page, errors, close } = await openApp()
  await skipOnboarding(page)

  // A PPL routine (the default with no questionnaire answers) with day 2 left
  // empty on purpose: the rotation has to step over it.
  await goto(page, '/routines')
  await page.getByRole('button', { name: 'Nueva rutina' }).first().click()
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: 'Crear', exact: true }).click()
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /Añadir ejercicio/ }).first().click()
  await page.waitForTimeout(2500)
  const pushUp = await pickRow(page, 'flexiones', { hasText: 'Peso corporal' })
  await sheetAdd(page).click()
  await page.waitForTimeout(2000)
  await page.locator('button', { hasText: 'PIERNA' }).first().click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: /Añadir ejercicio/ }).first().click()
  await page.waitForTimeout(2500)
  const squat = await pickRow(page, 'sentadilla', { hasText: 'Barra' })
  await sheetAdd(page).click()
  await page.waitForTimeout(2000)
  check(pushUp !== '' && squat !== '', 'rotación — rutina con EMPUJE y PIERNA llenos y TIRÓN vacío', `${pushUp} / ${squat}`)

  await goto(page, '/workout')
  check((await suggestedCard(page)) === 'EMPUJE', 'rotación — sin historial propone el primer día', String(await suggestedCard(page)))
  await page.locator('button.card', { hasText: 'EMPUJE' }).first().click()
  await page.waitForTimeout(3000)
  check(page.url().endsWith('/workout/active'), 'sesión — empieza EMPUJE', page.url())

  /* ---- 11: the set row speaks the app's language */
  const labels = await page.evaluate(() => [...document.querySelectorAll('main [aria-label]')].map((e) => e.getAttribute('aria-label')))
  check((await page.locator('input[aria-label="Peso"]').count()) > 0, 'idioma — el campo de peso se llama «Peso»')
  check((await page.locator('input[aria-label="Repeticiones"]').count()) > 0, 'idioma — el de repeticiones, «Repeticiones»')
  check((await page.locator('input[aria-label="RIR (repeticiones en reserva)"]').count()) > 0, 'idioma — el de RIR se explica en español')
  check((await page.getByRole('button', { name: 'Serie 1 completada', exact: true }).count()) === 1, 'idioma — el check dice «Serie 1 completada»')
  check(
    !labels.some((l) => /^(weight|reps|rir|rpe|set \d+)$/.test(l ?? '')),
    'idioma — ninguna etiqueta en inglés con la app en español',
    labels.filter((l) => /^(weight|reps|rir|rpe|set \d+)$/.test(l ?? '')).join(' | '),
  )

  /* ---- 4: a bodyweight set is logged with reps alone */
  const w1 = page.locator('input[aria-label="Peso"]').first()
  const r1 = page.locator('input[aria-label="Repeticiones"]').first()
  const tick1 = page.getByRole('button', { name: 'Serie 1 completada', exact: true })
  check((await w1.getAttribute('placeholder')) === 'PC', 'peso corporal — el peso vacío dice «PC»', String(await w1.getAttribute('placeholder')))
  check((await body(page)).includes('PC = peso corporal'), 'peso corporal — y se explica qué es «PC»')
  await r1.fill('15')
  await page.waitForTimeout(300)
  check(await tick1.isEnabled(), 'peso corporal — con 15 reps y sin peso el check se puede pulsar')
  await tick1.click()
  await page.waitForTimeout(900)
  check((await tick1.getAttribute('aria-pressed')) === 'true', 'peso corporal — la serie queda marcada')
  check((await w1.inputValue()) === '0', 'peso corporal — y se guarda como 0 kg, a la vista', await w1.inputValue())
  await skipRest(page)

  /* ---- 16: absurd values are marked and never stored */
  const w2 = page.locator('input[aria-label="Peso"]').nth(1)
  const r2 = page.locator('input[aria-label="Repeticiones"]').nth(1)
  const i2 = page.locator('input[aria-label="RIR (repeticiones en reserva)"]').nth(1)
  const tick2 = page.getByRole('button', { name: 'Serie 2 completada', exact: true })
  await r2.fill('500')
  await w2.fill('-20')
  await i2.fill('25')
  await page.waitForTimeout(500)
  check((await r2.getAttribute('aria-invalid')) === 'true', 'límites — 500 repeticiones se marca como inválido')
  check((await w2.getAttribute('aria-invalid')) === 'true', 'límites — −20 de peso se marca como inválido')
  check((await i2.getAttribute('aria-invalid')) === 'true', 'límites — RIR 25 se marca como inválido')
  const redBorder = await r2.evaluate((el) => getComputedStyle(el).borderColor)
  const normalBorder = await page.locator('input[aria-label="Repeticiones"]').nth(2).evaluate((el) => getComputedStyle(el).borderColor)
  check(redBorder !== normalBorder, 'límites — el campo inválido se ve distinto', `${redBorder} vs ${normalBorder}`)
  const msgs = await body(page)
  check(msgs.includes('Repeticiones: de 1 a 100'), 'límites — dice el rango de repeticiones')
  check(msgs.includes('Peso: 0 o más'), 'límites — dice que el peso no puede ser negativo')
  check(msgs.includes('RIR: de 0 a 10'), 'límites — dice el rango de RIR')
  check((await r2.inputValue()) === '500', 'límites — lo escrito no desaparece: se queda marcado', await r2.inputValue())
  check(await tick2.isDisabled(), 'límites — una serie con valores inválidos no se puede marcar')
  const active = (await idbAll(page, 'sessions')).find((s) => s.status === 'active')
  const stored = active?.exercises?.[0]?.sets?.[1] ?? {}
  check(
    stored.reps === null && stored.weight === null && stored.rir === null,
    'límites — nada absurdo llega a guardarse',
    JSON.stringify({ reps: stored.reps, weight: stored.weight, rir: stored.rir }),
  )
  await r2.fill('12')
  await w2.fill('')
  await i2.fill('2')
  await page.waitForTimeout(400)
  check(
    (await r2.getAttribute('aria-invalid')) === null && (await i2.getAttribute('aria-invalid')) === null && (await w2.getAttribute('aria-invalid')) === null,
    'límites — al corregir, la marca se va',
  )
  check(!(await body(page)).includes('Repeticiones: de 1 a 100'), 'límites — y el aviso también')
  check(await tick2.isEnabled(), 'límites — corregida, la serie se puede marcar')
  await tick2.click()
  await page.waitForTimeout(800)
  await skipRest(page)

  // The letter on a set's type badge is also the app's language.
  await page.locator('button[aria-label="3"]').click()
  await page.waitForTimeout(600)
  await dialog(page).getByRole('button', { name: 'Calentamiento', exact: true }).click()
  await page.waitForTimeout(600)
  const badgeEs = ((await page.locator('button[aria-label="3"]').textContent()) ?? '').trim()
  check(badgeEs === 'C', 'idioma — una serie de calentamiento lleva «C», no «W»', badgeEs)

  await finishWorkout(page)
  check(page.url().endsWith('/workout/summary'), 'peso corporal — el entrenamiento se guarda', page.url())
  const sessions = await idbAll(page, 'sessions')
  const done = sessions.filter((s) => s.status === 'completed').sort((a, b) => b.startedAt - a.startedAt)[0]
  const set1 = done?.exercises?.[0]?.sets?.[0]
  check(set1?.weight === 0 && set1?.reps === 15 && set1?.completed === true, 'peso corporal — guardada como 0 × 15', JSON.stringify(set1))
  const logs = await idbAll(page, 'exerciseLogs')
  const log = logs.find((l) => l.sessionId === done?.id && l.exerciseId === done?.exercises?.[0]?.exerciseId)
  check(
    log && log.effectiveSets === 2 && log.totalReps === 27,
    'peso corporal — las dos series cuentan como cualquier otra (historial, series, reps)',
    JSON.stringify(log && { effectiveSets: log.effectiveSets, totalReps: log.totalReps }),
  )

  /* ---- 5: the rotation */
  check((await homeNext(page)) === 'PIERNA', 'rotación — tras EMPUJE propone PIERNA, saltando el día vacío', await homeNext(page))

  // A free workout in between, with a loaded exercise.
  await goto(page, '/workout')
  await page.getByRole('button', { name: /Entrenamiento libre/ }).first().click()
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /Añadir ejercicio/ }).first().click()
  await page.waitForTimeout(2500)
  await pickRow(page, 'press banca')
  await page.waitForTimeout(2500)
  const wf = page.locator('input[aria-label="Peso"]').first()
  const tf = page.getByRole('button', { name: 'Serie 1 completada', exact: true })
  check((await wf.getAttribute('placeholder')) !== 'PC', 'con carga — el peso vacío no dice «PC»', String(await wf.getAttribute('placeholder')))
  await page.locator('input[aria-label="Repeticiones"]').first().fill('8')
  await page.waitForTimeout(300)
  check(await tf.isDisabled(), 'con carga — sin peso el check sigue sin poder pulsarse')
  await wf.fill('60')
  await page.waitForTimeout(300)
  check(await tf.isEnabled(), 'con carga — con peso y reps, sí')
  await tf.click()
  await page.waitForTimeout(800)
  await skipRest(page)
  await finishWorkout(page)

  check((await homeNext(page)) === 'PIERNA', 'rotación — un entrenamiento libre no la reinicia (Inicio)', await homeNext(page))
  await goto(page, '/workout')
  check((await suggestedCard(page)) === 'PIERNA', 'rotación — ni en Entreno', String(await suggestedCard(page)))

  /* ---- 28: at 320 px the label does not cover the day's name */
  await page.setViewportSize({ width: 320, height: 700 })
  await page.waitForTimeout(800)
  const geo = await page.evaluate(() => {
    const card = [...document.querySelectorAll('button.card')].find((b) => /PRÓXIMO ENTRENAMIENTO/.test(b.textContent ?? ''))
    if (!card) return null
    const name = card.querySelector('p.text-card')
    const badge = [...card.querySelectorAll('span')].find((s) => /PRÓXIMO ENTRENAMIENTO/.test(s.textContent ?? '') && s.querySelector('svg'))
    const n = name.getBoundingClientRect()
    const b = badge.getBoundingClientRect()
    return {
      nameCut: name.scrollWidth > name.clientWidth + 1,
      nameWidth: n.width,
      overlap: !(b.bottom <= n.top + 0.5 || n.bottom <= b.top + 0.5 || b.right <= n.left + 0.5 || n.right <= b.left + 0.5),
      badgeAbove: b.bottom <= n.top + 0.5,
      cardRight: card.getBoundingClientRect().right,
      badgeRight: b.right,
    }
  })
  check(geo && !geo.overlap, '320 px — la etiqueta no se monta sobre el nombre del día', JSON.stringify(geo))
  check(geo && geo.badgeAbove, '320 px — va en su propia línea, encima del nombre', JSON.stringify(geo))
  check(geo && !geo.nameCut, '320 px — el nombre del día se lee entero', JSON.stringify(geo))
  check(geo && geo.badgeRight <= geo.cardRight, '320 px — y la etiqueta cabe en la tarjeta', JSON.stringify(geo))
  await page.setViewportSize({ width: 390, height: 844 })

  /* ---- 11 again, in English: the labels follow the app, not the code */
  await patchSettings(page, { language: 'en' })
  await page.reload({ waitUntil: 'commit' })
  await page.waitForTimeout(3500)
  await goto(page, '/workout')
  await page.locator('button.card', { hasText: 'PIERNA' }).first().click()
  await page.waitForTimeout(3000)
  check((await page.locator('input[aria-label="Weight"]').count()) > 0, 'idioma (en) — «Weight»')
  check((await page.locator('input[aria-label="Reps"]').count()) > 0, 'idioma (en) — «Reps»')
  check((await page.locator('input[aria-label="RIR (reps in reserve)"]').count()) > 0, 'idioma (en) — «RIR (reps in reserve)»')
  check((await page.getByRole('button', { name: 'Set 1 done', exact: true }).count()) === 1, 'idioma (en) — «Set 1 done»')
  const enLabels = await page.evaluate(() => [...document.querySelectorAll('main [aria-label]')].map((e) => e.getAttribute('aria-label')))
  check(
    !enLabels.some((l) => /^(Peso|Repeticiones|Serie \d+ completada|RIR \(repeticiones)/.test(l ?? '')),
    'idioma (en) — ninguna etiqueta en español con la app en inglés',
    enLabels.join(' | '),
  )
  await page.locator('input[aria-label="Reps"]').first().fill('500')
  await page.waitForTimeout(400)
  const enMsg = await body(page)
  check(enMsg.includes('Reps: 1 to 100') && !enMsg.includes('Repeticiones: de 1 a 100'), 'idioma (en) — el aviso de límites, en inglés')
  await page.locator('button[aria-label="2"]').click()
  await page.waitForTimeout(600)
  await dialog(page).getByRole('button', { name: 'Warm-up', exact: true }).click()
  await page.waitForTimeout(600)
  const badgeEn = ((await page.locator('button[aria-label="2"]').textContent()) ?? '').trim()
  check(badgeEn === 'W', 'idioma (en) — y en inglés el calentamiento es «W»', badgeEn)

  check(errors.length === 0, 'sesión — sin errores', errors.slice(0, 2).join(' | '))
  await close()
}

/* =============================================== 3. library groups and counts */
if (only(3)) {
  const { page, errors, close } = await openApp()
  await skipOnboarding(page)
  await goto(page, '/library', 4000)

  const readGroups = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('section')]
        .map((s) => {
          const h = s.querySelector('h2')
          const m = (h?.textContent ?? '').match(/^(.*?)\s*·\s*(\d+)\s*$/)
          if (!m) return null
          return { name: m[1].trim(), count: Number(m[2]), rows: s.querySelectorAll(':scope > div > *').length }
        })
        .filter(Boolean),
    )

  const before = await readGroups()
  check(before.length > 0, 'biblioteca — enseña grupos por músculo', JSON.stringify(before))
  const first = before[0]

  for (let i = 0; i < 40; i++) {
    const more = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight)
      return !!document.querySelector('div.h-10[aria-hidden="true"]')
    })
    if (!more) break
    await page.waitForTimeout(350)
  }
  await page.waitForTimeout(600)
  const after = await readGroups()
  const afterFirst = after.find((g) => g.name === first?.name)
  check(afterFirst && afterFirst.count === first.count, 'biblioteca — el contador del primer grupo no cambia al hacer scroll', `${JSON.stringify(first)} → ${JSON.stringify(afterFirst)}`)
  check(after[0]?.name === first?.name, 'biblioteca — el primer grupo sigue siendo el primero', `${first?.name} → ${after[0]?.name}`)
  check(
    before.every((g) => after.find((a) => a.name === g.name)?.count === g.count),
    'biblioteca — ningún grupo visible al principio cambia su número',
    JSON.stringify(before.map((g) => [g.name, g.count, after.find((a) => a.name === g.name)?.count])),
  )
  check(
    after.every((g) => g.count === g.rows),
    'biblioteca — cada grupo cuenta exactamente las filas que acaba enseñando',
    JSON.stringify(after.filter((g) => g.count !== g.rows)),
  )
  check(new Set(after.map((g) => g.name)).size === after.length, 'biblioteca — cada músculo aparece una sola vez')
  const total = after.reduce((a, g) => a + g.rows, 0)
  check(total > 1000, `biblioteca — con todo cargado están los ${total} ejercicios`, String(total))

  // Point 2, minimal: no "0–0 reps" under cardio or mobility.
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.getByRole('button', { name: 'Cardio', exact: true }).first().click()
  await page.waitForTimeout(2000)
  const cardio = await page.locator('section p.text-xs').allTextContents()
  check(cardio.length > 0 && cardio.every((s) => !/0–0|\breps\b/.test(s)), 'biblioteca — el cardio no dice «0–0 reps»', cardio.slice(0, 3).join(' | '))
  await page.getByRole('button', { name: 'Movilidad', exact: true }).first().click()
  await page.waitForTimeout(2000)
  const mobility = await page.locator('section p.text-xs').allTextContents()
  check(mobility.length > 0 && mobility.every((s) => !/0–0/.test(s)), 'biblioteca — la movilidad tampoco', mobility.slice(0, 3).join(' | '))
  await page.getByRole('button', { name: 'Fuerza', exact: true }).first().click()
  await page.waitForTimeout(2000)
  const strength = await page.locator('section p.text-xs').allTextContents()
  check(strength.some((s) => /\d+–\d+ reps/.test(s)), 'biblioteca — la fuerza sigue con su rango', strength.slice(0, 2).join(' | '))

  check(errors.length === 0, 'biblioteca — sin errores', errors.slice(0, 2).join(' | '))
  await close()
}

/* ========================================= 4. questionnaire → routines */
if (only(4)) {
  const { page, errors, close } = await openApp()
  await page.goto(BASE, { waitUntil: 'commit' })
  await page.waitForTimeout(4000)
  check((await body(page)).includes('Paso 1 de 7'), 'cuestionario — un perfil nuevo empieza en el paso 1')

  /* ---- 7: switching units converts what is written */
  const height = page.getByLabel('Altura', { exact: true })
  const weight = page.getByLabel('Peso corporal', { exact: true })
  await height.fill('180')
  await weight.fill('80')
  await page.waitForTimeout(300)
  await page.getByRole('tab', { name: 'LB', exact: true }).click()
  await page.waitForTimeout(400)
  check((await height.inputValue()) === '71', 'unidades — 180 cm pasan a 71 pulgadas al elegir LB', await height.inputValue())
  check((await weight.inputValue()) === '176.4', 'unidades — 80 kg pasan a 176.4 lb', await weight.inputValue())
  await page.getByRole('tab', { name: 'KG', exact: true }).click()
  await page.waitForTimeout(400)
  check((await height.inputValue()) === '180', 'unidades — y de vuelta a KG, 180 cm otra vez', await height.inputValue())
  check((await weight.inputValue()) === '80', 'unidades — y 80 kg otra vez', await weight.inputValue())

  /* ---- 9: through to the summary with four days */
  const next = async () => {
    await page.getByRole('button', { name: /^(Siguiente|Empezar a entrenar)$/ }).first().click()
    await page.waitForTimeout(450)
  }
  await page.getByRole('button', { name: '30-39' }).first().click()
  await next()
  await page.getByRole('button', { name: /Ganar fuerza/ }).first().click()
  await next()
  await page.getByRole('button', { name: /^Intermedio/ }).first().click()
  await next()
  await page.getByRole('button', { name: '4', exact: true }).first().click()
  await page.waitForTimeout(300)
  await next()
  await page.getByRole('button', { name: /Gimnasio en casa/ }).first().click()
  await next()
  await next()
  const summary = await body(page)
  check(summary.includes('Paso 7 de 7'), 'cuestionario — llega al resumen', summary.slice(0, 120))
  check(summary.includes('Torso / Pierna') && summary.includes('de 4 días'), 'resumen — sugiere Torso / Pierna de 4 días', summary.slice(0, 400))
  check(summary.includes('al crear tu rutina en Rutinas'), 'resumen — dice dónde aparece la sugerencia')
  check(!summary.includes('Puedes cambiar todo esto'), 'resumen — ya no promete que todo se cambia en Ajustes')
  check(/unidades, el descanso y las series semanales por músculo en Ajustes/.test(summary), 'resumen — dice qué se puede cambiar y dónde')

  await page.getByRole('button', { name: /Empezar a entrenar/ }).click()
  await page.waitForTimeout(5000)

  await goto(page, '/routines')
  await page.getByRole('button', { name: 'Nueva rutina' }).first().click()
  await page.waitForTimeout(800)
  const tpl = await page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] button')]
      .filter((b) => b.querySelector('p.text-sm'))
      .map((b) => ({ text: (b.textContent ?? '').trim(), selected: b.className.includes('border-accent/60') })),
  )
  const ul = tpl.find((x) => x.text.startsWith('Torso / Pierna'))
  check(ul?.selected === true, 'rutinas — Torso / Pierna llega preseleccionada', JSON.stringify(tpl))
  check(tpl.filter((x) => x.selected).length === 1, 'rutinas — y es la única marcada (no PPL)', JSON.stringify(tpl))
  check(/SUGERIDA/.test(ul?.text ?? ''), 'rutinas — con la etiqueta de sugerida', ul?.text)
  await page.getByRole('button', { name: 'Crear', exact: true }).click()
  await page.waitForTimeout(2500)
  check((await body(page)).includes('TORSO A'), 'rutinas — crear sin tocar nada da la rutina sugerida', (await body(page)).slice(0, 200))

  check(errors.length === 0, 'cuestionario — sin errores', errors.slice(0, 2).join(' | '))
  await close()
}

report()
if (failures > 0) process.exit(1)
