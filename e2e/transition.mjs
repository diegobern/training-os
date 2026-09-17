import { chromium } from 'playwright'
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const SHOTS = '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots'
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'es-ES' })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)) })
await page.goto('http://127.0.0.1:4260', { waitUntil: 'networkidle' })
await page.waitForTimeout(3500)

const STOPS = [0, 0.09, 0.18, 0.3, 0.45, 0.62, 0.8, 1]

/** Pause the two pane animations and step them by hand, so the sandbox's
 *  frame rate cannot decide which moments we get to see. */
// Freeze the transition the instant it starts, and stop React's 520ms
// clean-up from unmounting the outgoing pane while we are looking at it.
await page.evaluate(() => {
  const origST = window.setTimeout
  window.setTimeout = (fn, ms, ...rest) => (ms === 520 ? 0 : origST(fn, ms, ...rest))
  window.__a = []
  setInterval(() => {
    const a = document.getAnimations().filter((x) => String(x.animationName).startsWith('to-auth-'))
    if (a.length) { a.forEach((x) => x.pause()); window.__a = a }
  }, 5)
})

async function scrub(tag) {
  const found = await page.evaluate(() => window.__a.map((x) => x.animationName))
  for (let i = 0; i < STOPS.length; i++) {
    await page.evaluate((f) => window.__a.forEach((x) => { x.currentTime = 520 * f }), STOPS[i])
    await page.screenshot({ path: `${SHOTS}/tr-${tag}-${i}.png` })
  }
  await page.evaluate(() => { window.__a.forEach((x) => { x.currentTime = 520; x.play() }); window.__a = [] })
  return found
}

await page.getByRole('button', { name: /crear cuenta/i }).first().click()
console.log('subida:', await scrub('up'))
await page.waitForTimeout(1200)
console.log('  destino:', (await page.locator('h1').first().innerText()).slice(0, 30), '| panes:', await page.locator('.auth-pane').count())

const back = page.getByRole('button', { name: /volver|atrás|back/i }).first()
console.log('flecha volver arriba-izquierda visible:', await back.isVisible(), await back.boundingBox())
await back.click()
console.log('bajada:', await scrub('down'))
await page.waitForTimeout(1200)
console.log('  destino:', (await page.locator('h1').first().innerText()).slice(0, 30), '| panes:', await page.locator('.auth-pane').count(), '| canvas 3D:', await page.locator('canvas').count())
console.log('errores:', errs.length ? [...new Set(errs)] : 'ninguno')
await browser.close()
