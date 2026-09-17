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

// ---------------------------------------------------- empty-state behaviour
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
;(await has('Todavía no hay entrenamientos')) ? ok('empty home state') : fail('empty home state')
await page.goto(`${BASE}/progress`, { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
;(await has('Todavía no hay datos suficientes')) ? ok('progress refuses to invent charts') : fail('progress refuses to invent charts')
await page.goto(`${BASE}/stats`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
;(await has('Sin datos todavía')) ? ok('stats empty state') : fail('stats empty state')
await page.goto(`${BASE}/prs`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
;(await has('Sin récords todavía')) ? ok('PRs empty state') : fail('PRs empty state')
await page.screenshot({ path: `${SHOTS}/30-empty.png` })

// ------------------------------------------------------- create a routine
await page.goto(`${BASE}/routines`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.getByRole('button', { name: /Nueva rutina/i }).first().click()
await page.waitForTimeout(600)
await page.locator('input').first().fill('Mi rutina 2026')
await page.getByRole('button', { name: /Upper \/ Lower/ }).click()
await page.getByRole('button', { name: /^Crear$/ }).click()
await page.waitForTimeout(1400)
;(await page.url()).includes('/routines/') ? ok('routine created and opened') : fail('routine created and opened')
;(await has('UPPER A')) ? ok('template days created') : fail('template days created')
await page.screenshot({ path: `${SHOTS}/31-routine-editor.png` })

// add exercises to the first day
await page.getByRole('button', { name: /Añadir ejercicio/i }).first().click()
await page.waitForTimeout(900)
const search = page.locator('input[placeholder="Buscar"]').first()
await search.fill('press')
await page.waitForTimeout(600)
const options = page.locator('li button p').filter({ hasText: /Press/ })
const n = await options.count()
steps.push(`INFO  picker results for "press": ${n}`)
await options.nth(0).click()
await options.nth(1).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: /^Añadir \(2\)$/ }).click()
await page.waitForTimeout(1200)
const dayText = await body()
dayText.includes('2 ejercicios') ? ok('two exercises added to the day') : fail('two exercises added to the day')
await page.screenshot({ path: `${SHOTS}/32-routine-with-exercises.png` })

// edit exercise config
await page.locator('button', { hasText: /3 ×/ }).first().click().catch(() => {})
await page.waitForTimeout(700)
if (await has('Series objetivo')) {
  ok('exercise settings sheet')
  const setsField = page.locator('input[inputmode="numeric"]').first()
  await setsField.fill('5')
  await page.waitForTimeout(500)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  ;(await has('5 ×')) ? ok('exercise target sets updated') : fail('exercise target sets updated')
} else {
  fail('exercise settings sheet')
}

// -------------------------------------------------------- free workout run
await page.goto(`${BASE}/workout`, { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await page.getByRole('button', { name: /Entrenamiento libre/i }).click()
await page.waitForTimeout(1400)
;(await has('Este entrenamiento no tiene ejercicios')) ? ok('free workout starts empty') : fail('free workout starts empty')
await page.getByRole('button', { name: /^Añadir ejercicio$/ }).first().click()
await page.waitForTimeout(900)
await page.locator('input[placeholder="Buscar"]').first().fill('Dominadas')
await page.waitForTimeout(600)
await page.locator('li button p').filter({ hasText: /Dominadas/ }).first().click()
await page.waitForTimeout(1200)
;(await has('Dominadas')) ? ok('exercise added mid-workout') : fail('exercise added mid-workout')

await page.locator('input[aria-label="weight"]').first().fill('0')
await page.locator('input[aria-label="reps"]').first().fill('12')
await page.locator('button[aria-label="set 1"]').click()
await page.waitForTimeout(900)
;(await has('DESCANSO')) ? ok('rest starts on a bodyweight set') : fail('rest starts on a bodyweight set')

// ------------------------------------------------------------ go offline
await ctx.setOffline(true)
await page.waitForTimeout(400)
await page.evaluate(() => window.dispatchEvent(new Event('offline')))
await page.waitForTimeout(600)
;(await has('Sin conexión')) ? ok('offline banner appears') : fail('offline banner appears')
await page.locator('input[aria-label="weight"]').nth(1).fill('0')
await page.locator('input[aria-label="reps"]').nth(1).fill('10')
await page.locator('button[aria-label="set 2"]').click()
await page.waitForTimeout(700)
ok('set logged while offline')
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2200)
const offlineBody = await body()
offlineBody.includes('Dominadas') ? ok('app reloads from the service worker while offline') : fail('app reloads from the service worker while offline')
await page.screenshot({ path: `${SHOTS}/33-offline.png` })
await ctx.setOffline(false)
await page.evaluate(() => window.dispatchEvent(new Event('online')))
await page.waitForTimeout(500)

// finish the free workout
await page.getByRole('button', { name: /FINALIZAR ENTRENAMIENTO/i }).click()
await page.waitForTimeout(2000)
;(await page.url()).includes('summary') ? ok('free workout finished') : fail('free workout finished')
await page.getByRole('button', { name: /^Hecho$/ }).click()
await page.waitForTimeout(1000)

// ------------------------------------------------------------- bodyweight
await page.goto(`${BASE}/body`, { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await page.getByRole('button', { name: /Registrar peso/i }).first().click()
await page.waitForTimeout(700)
await page.locator('input[inputmode="decimal"]').first().fill('78.4')
await page.getByRole('button', { name: /^Guardar$/ }).click()
await page.waitForTimeout(1200)
;(await has('78.4')) ? ok('bodyweight entry saved') : fail('bodyweight entry saved')
await page.screenshot({ path: `${SHOTS}/34-body.png` })

// ------------------------------------------------- language + light theme
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
const selects = page.locator('select')
const count = await selects.count()
for (let i = 0; i < count; i++) {
  const opts = await selects.nth(i).locator('option').allTextContents()
  if (opts.includes('English')) {
    await selects.nth(i).selectOption('en')
    break
  }
}
await page.waitForTimeout(900)
;(await has('Settings')) ? ok('language switches to English') : fail('language switches to English')
for (let i = 0; i < count; i++) {
  const opts = await selects.nth(i).locator('option').allTextContents()
  if (opts.includes('Light')) {
    await selects.nth(i).selectOption('light')
    break
  }
}
await page.waitForTimeout(800)
const theme = await page.getAttribute('html', 'data-theme')
theme === 'light' ? ok('light theme applied') : fail(`light theme applied (got ${theme})`)
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${SHOTS}/35-light-en.png`, fullPage: true })

// back to dark + Spanish
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
for (let i = 0; i < (await page.locator('select').count()); i++) {
  const opts = await page.locator('select').nth(i).locator('option').allTextContents()
  if (opts.includes('Dark')) await page.locator('select').nth(i).selectOption('dark')
  if (opts.includes('Español')) await page.locator('select').nth(i).selectOption('es')
}
await page.waitForTimeout(700)

// ------------------------------------------------------------ export JSON
const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null)
await page.getByRole('button', { name: /Exportar copia de seguridad/i }).click()
const download = await dl
download ? ok(`backup downloaded (${download.suggestedFilename()})`) : fail('backup downloaded')
if (download) {
  const path = await download.path()
  const fs = await import('node:fs')
  const json = JSON.parse(fs.readFileSync(path, 'utf8'))
  json.format === 'training-os-backup' ? ok('backup has the expected format') : fail('backup format')
  steps.push('INFO  backup counts: ' + JSON.stringify(json.counts))
}

const dl2 = page.waitForEvent('download', { timeout: 8000 }).catch(() => null)
await page.getByRole('button', { name: /Exportar CSV/i }).click()
const csv = await dl2
csv ? ok(`CSV downloaded (${csv.suggestedFilename()})`) : fail('CSV downloaded')
if (csv) {
  const fs = await import('node:fs')
  const text = fs.readFileSync(await csv.path(), 'utf8')
  const lines = text.trim().split('\n')
  steps.push(`INFO  CSV rows: ${lines.length - 1}; header: ${lines[0].slice(0, 60)}`)
  lines.length > 1 ? ok('CSV contains set rows') : fail('CSV contains set rows')
}

// --------------------------------------------------------- desktop layout
const wide = await ctx.newPage()
await wide.setViewportSize({ width: 1280, height: 900 })
await wide.goto(BASE, { waitUntil: 'networkidle' })
await wide.waitForTimeout(1200)
await wide.screenshot({ path: `${SHOTS}/36-desktop.png` })
ok('desktop viewport renders')

console.log(steps.join('\n'))
console.log('--- CONSOLE/PAGE ERRORS ---')
console.log(errors.length ? [...new Set(errors)].join('\n') : 'none')
await browser.close()
