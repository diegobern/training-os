import { chromium } from 'playwright'

const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const SHOTS = '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots'
const BASE = 'http://127.0.0.1:4320'
const errors = []
const steps = []
const ok = (m) => steps.push('PASS  ' + m)
const fail = (m) => steps.push('FAIL  ' + m)

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'es-ES',
})
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

const body = () => page.textContent('body')
const has = async (s) => (await body()).includes(s)

// 1 ---------------------------------------------------------------- boot
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
;(await has('TRAINING OS')) ? ok('app boots') : fail('app boots')

// 2 ----------------------------------------------------------- demo data
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.getByRole('button', { name: /Cargar datos DEMO/i }).click()
await page.waitForTimeout(5000)
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
;(await has('PUSH')) || (await has('PULL')) || (await has('LEGS')) ? ok('demo routine active on home') : fail('demo routine active on home')
;(await has('DEMO')) ? ok('demo banner shown') : fail('demo banner shown')
await page.screenshot({ path: `${SHOTS}/10-home.png` })

// 3 -------------------------------------------------------- start workout
await page.getByRole('button', { name: /EMPEZAR ENTRENO/i }).click()
await page.waitForTimeout(900)
await page.screenshot({ path: `${SHOTS}/11-workout-start.png` })
;(await has('Elige el día')) ? ok('day chooser') : fail('day chooser')

const dayBtn = page.locator('button', { hasText: 'PUSH' }).first()
await dayBtn.click()
await page.waitForTimeout(1500)
;(await page.url()).includes('/workout/active') ? ok('entered workout mode') : fail('entered workout mode')
await page.screenshot({ path: `${SHOTS}/12-workout-active.png` })

// 4 ---------------------------------------------------------- log a set
const weightInputs = page.locator('input[aria-label="weight"]')
const repInputs = page.locator('input[aria-label="reps"]')
const setCount = await weightInputs.count()
steps.push(`INFO  sets rendered for first exercise: ${setCount}`)
const preW = await weightInputs.first().inputValue()
const preR = await repInputs.first().inputValue()
steps.push(`INFO  autofill first set: ${preW} x ${preR}`)
preW !== '' && preR !== '' ? ok('autofill from previous session') : fail('autofill from previous session')

// force a heavier weight to trigger weight-up + PR
await weightInputs.first().fill('60')
await repInputs.first().fill('10')
await page.locator('button[aria-label="set 1"]').click()
await page.waitForTimeout(900)
await page.screenshot({ path: `${SHOTS}/13-set-logged.png` })
;(await has('DESCANSO')) ? ok('rest timer auto-started') : fail('rest timer auto-started')

const timerBefore = (await body()).match(/(\d\d:\d\d)/)
await page.getByRole('button', { name: '+30s' }).click()
await page.waitForTimeout(400)
ok(`rest +30s pressed (was ${timerBefore ? timerBefore[1] : '?'})`)
await page.getByRole('button', { name: /Saltar/i }).click()
await page.waitForTimeout(400)
;!(await has('DESCANSO')) ? ok('rest skip works') : fail('rest skip works')

// 5 ------------------------------------------------- complete remaining sets
for (let i = 2; i <= setCount; i++) {
  const w = weightInputs.nth(i - 1)
  const r = repInputs.nth(i - 1)
  if ((await w.inputValue()) === '') await w.fill('50')
  if ((await r.inputValue()) === '') await r.fill('8')
  await page.locator(`button[aria-label="set ${i}"]`).click()
  await page.waitForTimeout(250)
  const skip = page.getByRole('button', { name: /Saltar/i })
  if (await skip.count()) await skip.click()
}
ok('all sets of first exercise completed')

// 6 ----------------------------------------------------------- add a set
await page.getByRole('button', { name: /Añadir serie/i }).click()
await page.waitForTimeout(400)
;(await weightInputs.count()) === setCount + 1 ? ok('add set') : fail('add set')

// open set options, switch to warm-up, then delete the added set
await page.locator(`button[aria-label="${setCount + 1}"]`).click()
await page.waitForTimeout(500)
;(await has('Tipo de serie')) ? ok('set options sheet') : fail('set options sheet')
await page.getByRole('button', { name: /^Eliminar serie$/i }).click()
await page.waitForTimeout(500)
;(await weightInputs.count()) === setCount ? ok('delete set') : fail('delete set')

// 7 -------------------------------------------------- move to next exercise
await page.getByRole('button', { name: /Siguiente ejercicio/i }).click()
await page.waitForTimeout(600)
ok('next exercise')
await page.screenshot({ path: `${SHOTS}/14-second-exercise.png` })

// log one set on second exercise
const w2 = page.locator('input[aria-label="weight"]').first()
const r2 = page.locator('input[aria-label="reps"]').first()
if ((await w2.inputValue()) === '') await w2.fill('40')
if ((await r2.inputValue()) === '') await r2.fill('10')
await page.locator('button[aria-label="set 1"]').click()
await page.waitForTimeout(700)
const skip2 = page.getByRole('button', { name: /Saltar/i })
if (await skip2.count()) await skip2.click()

// 8 ------------------------------------------------------ session recovery
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
;(await page.url()).includes('/workout/active') ? ok('session survives a reload') : fail('session survives a reload')
const persisted = await page.locator('input[aria-label="weight"]').first().inputValue()
steps.push(`INFO  after reload first weight of current exercise: ${persisted}`)

// 9 ------------------------------------------------------------- finish
await page.getByRole('button', { name: /FINALIZAR ENTRENAMIENTO/i }).click()
await page.waitForTimeout(2500)
;(await page.url()).includes('/workout/summary') ? ok('finish -> summary') : fail('finish -> summary')
await page.screenshot({ path: `${SHOTS}/15-summary.png`, fullPage: true })
const summary = await body()
steps.push('INFO  summary: ' + summary.slice(0, 420).replace(/\s+/g, ' '))

await page.getByRole('button', { name: /^Hecho$/ }).click()
await page.waitForTimeout(1200)

// 10 ----------------------------------------------------------- history
await page.goto(`${BASE}/history`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
;(await has('PUSH')) ? ok('session appears in history') : fail('session appears in history')
await page.screenshot({ path: `${SHOTS}/16-history.png` })

// 11 ---------------------------------------------------------- progress
await page.goto(`${BASE}/progress`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.screenshot({ path: `${SHOTS}/17-progress.png`, fullPage: true })
;(await has('Series efectivas por músculo')) ? ok('muscle volume chart') : fail('muscle volume chart')

const firstExercise = page.locator('a,button').filter({ hasText: /Press Inclinado/ }).first()
if (await firstExercise.count()) {
  await firstExercise.click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/18-exercise-progress.png`, fullPage: true })
  ;(await has('1RM ESTIMADO')) ? ok('exercise progress page') : fail('exercise progress page')
} else {
  fail('exercise progress page (link not found)')
}

// 12 ----------------------------------------------------------- calendar
await page.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${SHOTS}/19-calendar.png` })
;(await has('Días entrenados')) ? ok('calendar page') : fail('calendar page')

// 13 --------------------------------------------------------------- stats
await page.goto(`${BASE}/stats`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${SHOTS}/20-stats.png`, fullPage: true })
;(await has('Entrenamientos totales')) ? ok('stats page') : fail('stats page')

// 14 ------------------------------------------------------------- routines
await page.goto(`${BASE}/routines`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
await page.screenshot({ path: `${SHOTS}/21-routines.png` })
;(await has('DEMO')) ? ok('routines page') : fail('routines page')

console.log(steps.join('\n'))
console.log('--- CONSOLE/PAGE ERRORS ---')
console.log(errors.length ? [...new Set(errors)].join('\n') : 'none')
await browser.close()
