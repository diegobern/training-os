/**
 * One language at a time: with the app in Spanish nothing reads in English,
 * and with it in English nothing reads in Spanish.
 *
 * A real history is built first, through the UI and in Spanish (a free
 * workout with one exercise from the picker, one set logged, finished through
 * the summary dialog), and a second workout is left running so the clock bar
 * and the session screen are on show. Then every screen is read in Spanish
 * and again in English: the visible text plus what a screen reader hears
 * (aria-label), placeholders and tooltips.
 *
 * What is checked against is a list of everyday interface words of the other
 * language — not a dictionary. A word of the list showing up is a leak; the
 * detail says on which screen and in what context.
 *
 * Left out on purpose: the language picker's «Español» / «English» (each
 * language is named in itself), /attributions (licence texts and authors' names are
 * quoted as published) and anything the person typed — there is none here.
 *
 * Requires a local-only build served at BASE (default :4330):
 *   npx vite build --mode localonly --outDir dist-local
 *   npx vite preview --outDir dist-local --host 127.0.0.1 --port 4330
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

/*
 * Interface words of each language, matched as whole words and with their
 * capitals. Kept to words that cannot be anything else: no «set» (a set is a
 * set in Spanish gyms too), no «reps», «RIR», «PR», «Core», no loan names of
 * exercises (Hip Thrust, Push Press…).
 */
const ENGLISH = [
  'Workout', 'Workouts', 'workout', 'workouts', 'Settings', 'Exercise', 'Exercises', 'exercise', 'exercises',
  'Routine', 'Routines', 'History', 'Progress', 'Start', 'Finish', 'Save', 'Cancel', 'Delete', 'Today',
  'Yesterday', 'Week', 'Month', 'Weight', 'Rest', 'Done', 'Back', 'Next', 'Add', 'Search', 'Library',
  'Profile', 'session', 'sessions', 'Session', 'minutes', 'Sets', 'Calendar', 'Body', 'Last time', 'Target',
  'Skip', 'Edit', 'Close', 'Notes', 'Muscle', 'Language', 'Units', 'days', 'weeks', 'No data',
  'Not enough', 'Free workout', 'Keep training', 'in progress', 'of', 'the', 'and', 'with', 'your',
]
const SPANISH = [
  'Entrenamiento', 'entrenamiento', 'entrenamientos', 'Ajustes', 'Ejercicio', 'Ejercicios', 'ejercicio',
  'ejercicios', 'Rutina', 'Rutinas', 'rutina', 'Historial', 'Progreso', 'Empezar', 'EMPEZAR', 'Finalizar',
  'FINALIZAR', 'Guardar', 'Cancelar', 'Eliminar', 'Hoy', 'Ayer', 'Semana', 'semana', 'semanas', 'Peso',
  'Descanso', 'DESCANSO', 'Hecho', 'Atrás', 'Siguiente', 'Añadir', 'Buscar', 'Biblioteca', 'Perfil', 'series',
  'serie', 'sesiones', 'sesión', 'Calendario', 'Cuerpo', 'días', 'Nombre', 'Notas', 'Músculo', 'Idioma',
  'Unidades', 'Sin datos', 'objetivo', 'libre', 'Seguir', 'de', 'del', 'la', 'las', 'los', 'con', 'para', 'tu',
  'EN CURSO',
]
// Letters English does not use. The catalogue's English names have none.
const SPANISH_LETTERS = /[áéíóúñ¿¡ÁÉÍÓÚÑ]/

function leaks(text, words, letters) {
  const found = []
  for (const w of words) {
    const re = new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'u')
    const m = re.exec(text)
    if (m) found.push(`«${w}» en «…${text.slice(Math.max(0, m.index - 30), m.index + w.length + 31).replace(/\s+/g, ' ')}…»`)
  }
  if (letters) {
    const m = letters.exec(text)
    if (m) found.push(`letra «${m[0]}» en «…${text.slice(Math.max(0, m.index - 30), m.index + 31).replace(/\s+/g, ' ')}…»`)
  }
  return found
}

/** Visible text plus what assistive technology reads, one string. */
const screenText = (page) =>
  page.evaluate(() => {
    const parts = [document.body.innerText]
    for (const el of document.querySelectorAll('[aria-label],[placeholder],[title]')) {
      for (const a of ['aria-label', 'placeholder', 'title']) {
        const v = el.getAttribute(a)
        if (v) parts.push(v)
      }
    }
    return parts.join('\n')
  })

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

async function go(page, path, wait = 2500) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'commit' })
  await page.waitForTimeout(wait)
}

async function freeWorkoutWithExercise(page) {
  await go(page, '/workout')
  await page.getByRole('button', { name: /Entrenamiento libre/ }).first().click()
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /Añadir ejercicio/ }).first().click()
  await page.waitForTimeout(2500)
  await page.getByPlaceholder('Buscar').fill('press inclinado mancuernas')
  await page.waitForTimeout(2200)
  await page.locator('div.fixed.inset-0.z-50 p.text-card-sm').first().click()
  await page.waitForTimeout(3000)
}

/* ------------------------------------------------------------------ setup */
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
page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)))

await go(page, '/', 3500)
await patchSettings(page, { onboardingVersion: 1, language: 'es' })
await page.reload({ waitUntil: 'commit' })
await page.waitForTimeout(3000)

// A finished workout: the history, progress, records and calendar have
// something real to show.
await freeWorkoutWithExercise(page)
await page.getByLabel('Peso', { exact: true }).first().fill('60')
await page.getByLabel('Repeticiones', { exact: true }).first().fill('8')
await page.getByRole('button', { name: 'Serie 1 completada', exact: true }).first().click()
await page.waitForTimeout(1200)
const skip = page.getByRole('button', { name: 'Saltar' })
if (await skip.count()) await skip.first().click()
await page.getByRole('button', { name: 'FINALIZAR ENTRENAMIENTO' }).click()
await page.waitForTimeout(800)
await page.locator('[role="dialog"]').getByRole('button', { name: 'FINALIZAR', exact: true }).click()
await page.waitForTimeout(3000)
check(page.url().endsWith('/workout/summary'), 'preparación — un entrenamiento real guardado', page.url())

const ids = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const r = indexedDB.open('training-os')
      r.onsuccess = () => {
        const all = r.result.transaction('sessions').objectStore('sessions').getAll()
        all.onsuccess = () => {
          const s = all.result.find((x) => x.endedAt)
          resolve(s ? { session: s.id, exercise: s.exercises[0]?.exerciseId } : null)
        }
      }
    }),
)
check(!!ids?.session && !!ids?.exercise, 'preparación — la sesión y su ejercicio se encuentran', JSON.stringify(ids))

// And one left running: the clock bar and the session screen.
await freeWorkoutWithExercise(page)
check(page.url().endsWith('/workout/active'), 'preparación — otro entrenamiento queda en curso', page.url())

const ROUTES = [
  '/',
  '/workout',
  '/workout/active',
  '/routines',
  '/library',
  `/library/${ids?.exercise}`,
  '/progress',
  `/progress/${ids?.exercise}`,
  '/history',
  `/history/${ids?.session}`,
  '/calendar',
  '/body',
  '/stats',
  '/prs',
  '/milestones',
  '/settings',
  '/search',
  '/more',
  '/profile',
]

for (const lang of ['es', 'en']) {
  await patchSettings(page, { language: lang })
  await page.reload({ waitUntil: 'commit' })
  await page.waitForTimeout(3000)
  const other = lang === 'es' ? 'inglés' : 'español'

  for (const route of ROUTES) {
    await go(page, route)
    let seen = await screenText(page)
    // The language picker names each language in that language — «Español»,
    // «English» — so whoever cannot read the current one still finds theirs.
    if (route === '/settings') seen = seen.replace(/Español|English/g, '')
    const found = leaks(seen, lang === 'es' ? ENGLISH : SPANISH, lang === 'en' ? SPANISH_LETTERS : null)
    check(found.length === 0, `${lang} — ${route} sin palabras en ${other}`, found.slice(0, 4).join(' · '))
  }

  // The finish dialog, read and dismissed without finishing.
  await go(page, '/workout/active')
  await page.getByRole('button', { name: lang === 'es' ? 'Hecho' : 'Done', exact: true }).click()
  await page.waitForTimeout(800)
  const dialogText = (await page.locator('[role="dialog"]').textContent().catch(() => '')) ?? ''
  check(dialogText.length > 0, `${lang} — el diálogo de finalizar se abre`)
  const found = leaks(dialogText, lang === 'es' ? ENGLISH : SPANISH, lang === 'en' ? SPANISH_LETTERS : null)
  check(found.length === 0, `${lang} — el diálogo de finalizar sin palabras en ${other}`, found.slice(0, 4).join(' · '))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

}

check(errors.length === 0, 'sin errores en la página', errors.slice(0, 3).join(' | '))

report()
await ctx.close()
await browser.close()
process.exit(failures > 0 ? 1 : 0)
