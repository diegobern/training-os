/**
 * The workout in progress, seen from the rest of the app.
 *
 *   1. The clock follows you: on every screen but the session itself there is
 *      a fixed bar with the elapsed time, above the tab bar, that does not
 *      move when the page scrolls, does not cover the end of the page, keeps
 *      ticking, survives a reload, takes you back to the session when tapped
 *      and is gone the moment the workout is finished or discarded.
 *   2. Finishing asks first. Both ways out — "Hecho" in the header and the big
 *      button at the end — open a summary of what is about to be saved; with
 *      nothing logged it is the existing offer to discard, not the summary.
 *
 * Requires a local-only build served at BASE (default :4330):
 *   npx vite build --mode localonly --outDir dist-local
 *   npx vite preview --outDir dist-local --host 127.0.0.1 --port 4330
 *
 * `ONLY=2` runs a single scenario.
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { CHROMIUM_EXE as EXE } from './chromium.mjs'

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

async function openApp() {
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
  const close = async () => {
    await ctx.close().catch(() => {})
    await browser.close().catch(() => {})
  }
  return { page, errors, close }
}

/** Same shortcut as e2e/catalog-ui.mjs: write the settings row the questionnaire writes. */
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

const bar = (page) => page.getByRole('link', { name: /Volver al entrenamiento en curso/ })
const dialog = (page) => page.locator('[role="dialog"]')

/** "07:42" → 462, "1:02:03" → 3723. */
function seconds(text) {
  const m = (text ?? '').match(/(?:(\d+):)?(\d{2}):(\d{2})/)
  if (!m) return NaN
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

async function barTime(page) {
  return seconds(await bar(page).locator('[role="timer"]').textContent())
}

async function startFreeWorkout(page) {
  await page.goto(`${BASE}/workout`, { waitUntil: 'commit' })
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /Entrenamiento libre/ }).first().click()
  await page.waitForTimeout(2500)
}

/* ====================================================== 1. the clock bar */
if (only(1)) {
  const { page, errors, close } = await openApp()
  await skipOnboarding(page)

  check((await bar(page).count()) === 0, 'barra — sin entrenamiento no hay barra')

  await startFreeWorkout(page)
  check(page.url().endsWith('/workout/active'), 'barra — el entrenamiento libre abre la sesión', page.url())
  check((await bar(page).count()) === 0, 'barra — en la pantalla de la sesión no se duplica: el tiempo va en la cabecera')
  const header = (await page.locator('header').first().textContent()) ?? ''
  check(/\d{2}:\d{2}/.test(header), 'barra — la cabecera de la sesión enseña el tiempo transcurrido', header.slice(0, 80))
  const varOnSession = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--workout-bar-space').trim(),
  )
  check(varOnSession === '', 'barra — en la sesión no reserva sitio abajo', varOnSession)

  // Leave the session the way a person would: the chevron in the header.
  await page.getByRole('button', { name: 'Volver' }).first().click()
  await page.waitForTimeout(1500)
  check(new URL(page.url()).pathname === '/', 'barra — se sale de la sesión al inicio', page.url())
  check((await bar(page).count()) === 1, 'barra — fuera de la sesión aparece la barra')
  check(await bar(page).isVisible(), 'barra — y se ve')
  const label = (await bar(page).textContent()) ?? ''
  check(/EN CURSO/.test(label) && /Volver al entrenamiento en curso/.test((await bar(page).getAttribute('aria-label')) ?? ''), 'barra — dice que hay un entrenamiento en curso', label)

  const vp = page.viewportSize()
  const b = await bar(page).boundingBox()
  const nav = await page.locator('nav.fixed').first().boundingBox()
  check(
    b && b.y >= 0 && b.y + b.height <= vp.height && b.x >= 0 && b.x + b.width <= vp.width,
    'barra — cabe entera en la pantalla',
    JSON.stringify(b),
  )
  check(b && nav && b.y + b.height <= nav.y + 0.5, 'barra — no se solapa con la barra de navegación', `${JSON.stringify(b)} / nav ${JSON.stringify(nav)}`)
  // The centre tile of the tab bar rises above the bar's top border: the
  // clock has to clear that too, with a little air, not just the border.
  // The tile, not what is inside it: the logo is a 13824px sprite strip that
  // the tile clips.
  const navReach = await page.evaluate(() =>
    Math.min(
      document.querySelector('nav.fixed').getBoundingClientRect().top,
      ...[...document.querySelectorAll('nav.fixed span.bg-brand')].map((el) => el.getBoundingClientRect().top),
    ),
  )
  check(b && b.y + b.height <= navReach - 4, 'barra — tampoco toca la baldosa central que sobresale de la navegación', `barra abajo ${b && b.y + b.height} · lo más alto de la navegación ${navReach}`)
  check(b && b.y > vp.height / 2, 'barra — vive abajo, lejos de los avisos de sincronización de arriba', JSON.stringify(b))

  const position = await bar(page).evaluate((el) => getComputedStyle(el.parentElement).position)
  check(position === 'fixed', 'barra — es fija, no parte de la página', position)
  const style = (await bar(page).evaluate((el) => el.parentElement.getAttribute('style'))) ?? ''
  check(/safe-area-inset-bottom/.test(style) && /safe-area-inset-left/.test(style), 'barra — respeta las zonas seguras de la pantalla', style)

  const space = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--workout-bar-space').trim(),
  )
  check(space === '4.25rem', 'barra — publica el sitio que ocupa para los demás', space)

  // The update prompt reads that space to stay clear of the bar.
  const promptSrc = readFileSync(new URL('../src/components/layout/UpdatePrompt.tsx', import.meta.url), 'utf8')
  const formula = promptSrc.match(/bottom: '(calc\([^']*\))'/)?.[1] ?? ''
  check(/--workout-bar-space/.test(formula), 'barra — el aviso de actualización se aparta lo que ocupa la barra', formula)
  if (formula) {
    const probe = await page.evaluate((bottom) => {
      const el = document.createElement('div')
      el.style.cssText = `position:fixed;left:0;right:0;height:40px;bottom:${bottom}`
      document.body.appendChild(el)
      const r = el.getBoundingClientRect()
      el.remove()
      return { top: r.top, bottom: r.bottom }
    }, formula)
    check(probe.bottom <= b.y + 0.5, 'barra — y con esa fórmula el aviso queda por encima, sin tocarla', `aviso ${JSON.stringify(probe)} / barra.y ${b.y}`)
  }

  // It keeps time.
  const t1 = await barTime(page)
  await page.waitForTimeout(2600)
  const t2 = await barTime(page)
  check(Number.isFinite(t1) && t2 >= t1 + 2, `barra — el tiempo sigue subiendo (${t1} s → ${t2} s)`)

  // Nothing at the end of the page ends up under it.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(600)
  const covered = await page.evaluate(() => {
    const barEl = [...document.querySelectorAll('a')].find((a) => /Volver al entrenamiento/.test(a.getAttribute('aria-label') ?? ''))
    const top = barEl.getBoundingClientRect().top
    const insideFixed = (el) => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        if (getComputedStyle(n).position === 'fixed') return true
      }
      return false
    }
    let lowest = 0
    let what = ''
    for (const el of document.body.querySelectorAll('*')) {
      if (el.children.length > 0) continue
      if (!(el.textContent ?? '').trim()) continue
      if (insideFixed(el)) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.bottom > lowest) {
        lowest = r.bottom
        what = (el.textContent ?? '').trim().slice(0, 40)
      }
    }
    return { lowest, top, what }
  })
  check(covered.lowest <= covered.top + 0.5, 'barra — el final de la página se puede leer, no queda debajo', JSON.stringify(covered))

  // A long page: it must not move while scrolling.
  await page.getByRole('link', { name: 'Rutinas' }).first().click()
  await page.waitForTimeout(1200)
  check(await bar(page).isVisible(), 'barra — sigue en Rutinas')
  await page.getByRole('link', { name: 'Progreso' }).first().click()
  await page.waitForTimeout(1200)
  check(await bar(page).isVisible(), 'barra — sigue en Progreso')
  await page.getByRole('link', { name: 'Más' }).first().click()
  await page.waitForTimeout(1200)
  check(await bar(page).isVisible(), 'barra — sigue en Más')

  await page.goto(`${BASE}/library`, { waitUntil: 'commit' })
  await page.waitForTimeout(4000)
  check(await bar(page).isVisible(), 'barra — sobrevive a recargar la app (la sesión se recupera)')
  const scrollable = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
  check(scrollable > 1000, 'barra — la biblioteca es lo bastante larga para probar el scroll', String(scrollable))
  const before = await bar(page).boundingBox()
  const moved = []
  for (const y of [400, 1200, 2400, 99999]) {
    await page.mouse.wheel(0, y - (await page.evaluate(() => scrollY)))
    await page.waitForTimeout(350)
    const now = await bar(page).boundingBox()
    if (!now || Math.abs(now.y - before.y) > 0.5 || !(await bar(page).isVisible())) moved.push(`${y}: ${JSON.stringify(now)}`)
  }
  const scrolled = await page.evaluate(() => scrollY)
  check(scrolled > 500, 'barra — la página se ha desplazado de verdad', String(scrolled))
  check(moved.length === 0, 'barra — al hacer scroll no se mueve ni se esconde', moved.join(' · '))

  // Tapping it goes back to the session.
  await bar(page).click()
  await page.waitForTimeout(1500)
  check(page.url().endsWith('/workout/active'), 'barra — tocarla vuelve a la sesión en curso', page.url())

  // Discarding ends it everywhere.
  await page.goto(`${BASE}/workout`, { waitUntil: 'commit' })
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: 'DESCARTAR' }).first().click()
  await page.waitForTimeout(600)
  await dialog(page).getByRole('button', { name: 'DESCARTAR' }).click()
  await page.waitForTimeout(1500)
  await page.goto(`${BASE}/`, { waitUntil: 'commit' })
  await page.waitForTimeout(3000)
  check((await bar(page).count()) === 0, 'barra — al descartar el entrenamiento desaparece')
  const spaceAfter = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--workout-bar-space').trim(),
  )
  check(spaceAfter === '', 'barra — y deja de reservar sitio', spaceAfter)

  check(errors.length === 0, 'barra — sin errores', errors.slice(0, 2).join(' | '))
  await close()
}

/* =================================================== 2. finishing asks */
if (only(2)) {
  const { page, errors, close } = await openApp()
  await skipOnboarding(page)

  // A real workout, built the way a person builds one: free workout plus an
  // exercise from the picker. The app has no sample data to lean on.
  await startFreeWorkout(page)
  await page.getByRole('button', { name: /Añadir ejercicio/ }).first().click()
  await page.waitForTimeout(2500)
  await page.getByPlaceholder('Buscar').fill('press inclinado mancuernas')
  await page.waitForTimeout(2200)
  await page.locator('div.fixed.inset-0.z-50 p.text-card-sm').first().click()
  await page.waitForTimeout(3000)
  check(page.url().endsWith('/workout/active'), 'finalizar — empieza un entrenamiento con un ejercicio', page.url())
  check((await page.getByLabel('weight').count()) > 1, 'finalizar — el ejercicio trae varias series que registrar')

  // Log one set for real: weight, reps, tick.
  await page.getByLabel('weight').first().fill('60')
  await page.getByLabel('reps').first().fill('8')
  await page.getByRole('button', { name: 'set 1', exact: true }).first().click()
  await page.waitForTimeout(1200)
  // The rest timer starts on its own after a set; get it out of the way.
  const skip = page.getByRole('button', { name: 'Saltar' })
  if (await skip.count()) await skip.first().click()

  // ---- "Hecho" in the header
  await page.getByRole('button', { name: 'Hecho', exact: true }).click()
  await page.waitForTimeout(700)
  const d1 = dialog(page)
  check((await d1.count()) === 1, 'finalizar — «Hecho» no cierra la sesión: pregunta antes')
  check(page.url().endsWith('/workout/active'), 'finalizar — y la sesión sigue abierta mientras pregunta', page.url())
  const summary = (await d1.textContent()) ?? ''
  check(/¿Finalizar el entrenamiento\?/.test(summary), 'finalizar — el diálogo pregunta si finalizar', summary.slice(0, 80))
  check(/DURACIÓN\s*\d{2}:\d{2}/.test(summary), 'finalizar — el resumen enseña la duración', summary)
  check(/EJERCICIOS\s*1 de \d+/.test(summary), 'finalizar — el resumen enseña los ejercicios que se guardan', summary)
  check(/SERIES\s*1 de \d+/.test(summary), 'finalizar — el resumen enseña las series completadas de total', summary)
  check(/Quedan \d+ series sin completar/.test(summary), 'finalizar — avisa de las series que faltan', summary)
  check(!/No has completado ninguna serie/.test(summary), 'finalizar — con algo registrado NO ofrece descartar')

  await d1.getByRole('button', { name: 'Seguir entrenando' }).click()
  await page.waitForTimeout(700)
  check((await dialog(page).count()) === 0, 'finalizar — «Seguir entrenando» cierra el diálogo')
  check(page.url().endsWith('/workout/active'), 'finalizar — y vuelve a la sesión sin perder nada', page.url())
  const kept = await page.getByLabel('weight').first().inputValue()
  check(kept === '60', 'finalizar — la serie escrita sigue ahí', kept)

  // ---- the big button at the end
  await page.getByRole('button', { name: 'FINALIZAR ENTRENAMIENTO' }).click()
  await page.waitForTimeout(700)
  const d2 = dialog(page)
  check((await d2.count()) === 1, 'finalizar — el botón grande también pregunta')
  check(/Esto es lo que se va a guardar/.test((await d2.textContent()) ?? ''), 'finalizar — con el mismo resumen')
  await d2.getByRole('button', { name: 'FINALIZAR', exact: true }).click()
  await page.waitForTimeout(2500)
  check(page.url().endsWith('/workout/summary'), 'finalizar — confirmar guarda y lleva al resumen', page.url())
  await page.goto(`${BASE}/`, { waitUntil: 'commit' })
  await page.waitForTimeout(3000)
  check((await bar(page).count()) === 0, 'finalizar — terminado, la barra del cronómetro desaparece')

  // ---- nothing logged: the existing discard dialog, not the summary
  await startFreeWorkout(page)
  await page.getByRole('button', { name: 'Hecho', exact: true }).click()
  await page.waitForTimeout(700)
  const empty = (await dialog(page).textContent()) ?? ''
  check(/No has completado ninguna serie/.test(empty), 'vacío — sin nada registrado se ofrece descartar, como antes', empty.slice(0, 120))
  check(!/Esto es lo que se va a guardar/.test(empty), 'vacío — y no el resumen de guardar')
  await dialog(page).getByRole('button', { name: 'Cancelar' }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'FINALIZAR ENTRENAMIENTO' }).click()
  await page.waitForTimeout(700)
  check(/No has completado ninguna serie/.test((await dialog(page).textContent()) ?? ''), 'vacío — el botón grande lleva al mismo diálogo')
  await dialog(page).getByRole('button', { name: 'DESCARTAR' }).click()
  await page.waitForTimeout(1500)
  check(new URL(page.url()).pathname === '/', 'vacío — descartar vuelve al inicio', page.url())
  check((await bar(page).count()) === 0, 'vacío — y sin barra del cronómetro')

  check(errors.length === 0, 'finalizar — sin errores', errors.slice(0, 2).join(' | '))
  await close()
}

/* ============================== 3. HOW TO in Spanish, even with an old copy */
/*
 * The instructions were translated by filling in fields that already existed,
 * so the catalog version did not change. A phone that had opened HOW TO before
 * holds the old, English-only instructions.json in IndexedDB (and behind it in
 * the service worker's CacheFirst cache). This plants exactly that copy and
 * checks that the Spanish arrives anyway.
 */
if (only(3)) {
  const { page, errors, close } = await openApp()
  await skipOnboarding(page)

  // A copy of today's file with every Spanish field emptied: what the cache of
  // anyone who opened HOW TO before the translation is holding.
  const planted = await page.evaluate(async () => {
    const current = await fetch('/catalog/v2/instructions.json').then((r) => r.json())
    const old = {}
    for (const [id, e] of Object.entries(current)) old[id] = { ...e, es: null, esStatus: 'missing' }
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('training-os')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    await new Promise((res, rej) => {
      const tx = db.transaction('catalog', 'readwrite')
      // The shape every build before this one wrote: version, no fingerprint.
      tx.objectStore('catalog').put({ key: 'instructions', version: 2, payload: old, fetchedAt: Date.now() })
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    return Object.values(current).filter((e) => e.esStatus !== 'missing').length
  })
  check(planted > 800, `cómo hacerlo — el catálogo publicado trae ${planted} fichas en español`, String(planted))

  await page.reload({ waitUntil: 'commit' })
  await page.waitForTimeout(3000)

  // An exercise with real steps, opened from its card in the library.
  const ID = 'lib-incline-dumbbell-press'
  const expected = await page.evaluate(async (id) => {
    const current = await fetch('/catalog/v2/instructions.json').then((r) => r.json())
    return { es: current[id].es[0], en: current[id].en[0] }
  }, ID)

  const requested = []
  page.on('request', (r) => {
    if (r.url().includes('/catalog/v2/instructions.json')) requested.push(r.url())
  })
  await page.goto(`${BASE}/library/${ID}`, { waitUntil: 'commit' })
  await page.waitForTimeout(3500)
  await page.getByRole('button', { name: /Cómo hacerlo/ }).first().click()
  await page.waitForTimeout(3500)
  const sheet = (await dialog(page).textContent()) ?? ''
  check(!/disponibles solo en inglés/.test(sheet), 'cómo hacerlo — no aparece el aviso de «solo en inglés»', sheet.slice(0, 200))
  check(sheet.includes(expected.es), 'cómo hacerlo — los pasos salen en español aunque hubiera una copia vieja guardada', expected.es)
  check(!sheet.includes(expected.en), 'cómo hacerlo — y no en inglés', expected.en)
  check(
    requested.some((u) => /\?rev=[a-f0-9]{12}$/.test(u)),
    'cómo hacerlo — la copia vieja se renueva con la URL de la versión nueva',
    requested.join(' · ') || 'ninguna petición',
  )
  const stored = await page.evaluate(async () => {
    const db = await new Promise((res) => {
      const r = indexedDB.open('training-os')
      r.onsuccess = () => res(r.result)
    })
    return new Promise((res) => {
      const q = db.transaction('catalog').objectStore('catalog').get('instructions')
      q.onsuccess = () => res({ rev: q.result?.rev ?? null })
    })
  })
  check(/^[a-f0-9]{12}$/.test(stored.rev ?? ''), 'cómo hacerlo — y la copia nueva queda guardada con su huella', JSON.stringify(stored))

  // Second open: served from the fresh copy, no network.
  await dialog(page).getByRole('button', { name: /Cerrar y seguir/ }).click()
  await page.waitForTimeout(800)
  requested.length = 0
  await page.reload({ waitUntil: 'commit' })
  await page.waitForTimeout(4000)
  await page.getByRole('button', { name: /Cómo hacerlo/ }).first().click()
  await page.waitForTimeout(2500)
  check((await dialog(page).textContent())?.includes(expected.es), 'cómo hacerlo — al volver a abrirla sigue en español')
  check(requested.length === 0, 'cómo hacerlo — con la copia al día no se vuelve a descargar nada', requested.join(' · '))

  check(errors.length === 0, 'cómo hacerlo — sin errores', errors.slice(0, 2).join(' | '))
  await close()
}

report()
if (failures > 0) process.exit(1)
