import { chromium } from 'playwright'
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const SHOTS = '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots'
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 420 }, deviceScaleFactor: 1, locale: 'es-ES' })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)) })
await page.goto('http://127.0.0.1:4210/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const PAGES = [
  ['/', 'Inicio'],
  ['/routines', 'Rutinas'],
  ['/progress', 'Progreso'],
  ['/more', 'Más'],
  ['/history', 'Historial'],
]
for (const [path, name] of PAGES) {
  await page.goto('http://127.0.0.1:4210' + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  const h = await page.locator('header').first()
  if (!(await h.count())) { console.log(`${name}: SIN header`); continue }
  const out = []
  for (const y of [0, 20, 40, 56, 90]) {
    await page.evaluate((v) => window.scrollTo(0, v), y)
    await page.waitForTimeout(140)
    const st = await page.evaluate(() => ({
      o: +getComputedStyle(document.querySelector('header')).opacity.slice(0, 4),
      y: Math.round(window.scrollY),
      h: document.documentElement.scrollHeight,
    }))
    out.push(`want=${y} got=${st.y} op=${st.o}`)
  }
  console.log(`${name.padEnd(10)} ${out.join('  ')}`)
}

// A visual pair for the page he showed.
await page.goto('http://127.0.0.1:4210/progress', { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await page.screenshot({ path: `${SHOTS}/sc-top.png` })
await page.evaluate(() => window.scrollTo(0, 70))
await page.waitForTimeout(400)
await page.screenshot({ path: `${SHOTS}/sc-down.png` })
console.log('errores:', errs.length ? [...new Set(errs)] : 'ninguno')
await browser.close()
