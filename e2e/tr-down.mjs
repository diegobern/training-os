import { chromium } from 'playwright'
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const SHOTS = '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots'
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'es-ES' })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:4200', { waitUntil: 'networkidle' })
await page.waitForTimeout(3500)
await page.getByRole('button', { name: /crear cuenta/i }).first().click()
await page.waitForTimeout(1800)          // let the forward transition finish cleanly
await page.evaluate(() => {
  const origST = window.setTimeout
  window.setTimeout = (fn, ms, ...r) => (ms === 520 ? 0 : origST(fn, ms, ...r))
  window.__a = []
  setInterval(() => {
    const a = document.getAnimations().filter((x) => String(x.animationName).startsWith('to-auth-'))
    if (a.length) { a.forEach((x) => x.pause()); window.__a = a }
  }, 5)
})
await page.getByRole('button', { name: /volver|atrás|back/i }).first().click()
console.log('bajada:', await page.evaluate(() => window.__a.map((x) => x.animationName)), '| panes:', await page.locator('.auth-pane').count())
const STOPS = [0, 0.09, 0.18, 0.3, 0.45, 0.62, 0.8, 1]
for (let i = 0; i < STOPS.length; i++) {
  await page.evaluate((f) => window.__a.forEach((x) => { x.currentTime = 520 * f }), STOPS[i])
  await page.screenshot({ path: `${SHOTS}/td-${i}.png` })
}
await browser.close()
