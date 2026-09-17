import { chromium } from 'playwright'
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const SHOTS = '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots'
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
for (const theme of ["light"]) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2, locale: 'es-ES' })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)) })
  await page.addInitScript((t) => {
    document.addEventListener('DOMContentLoaded', () => document.documentElement.setAttribute('data-theme', t))
  }, theme)
  await page.goto('http://127.0.0.1:4200', { waitUntil: 'networkidle' })
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
  await page.waitForTimeout(4000)
  const box = await page.locator('canvas').first().boundingBox()
  // spin += 0.0118/frame at 60fps -> ~0.708 rad/s of raw spin; a revolution ~8.9s
  for (let i = 0; i < 14; i++) {
    await page.screenshot({ path: `${SHOTS}/spin-${theme}-${i}.png`, clip: box })
    await page.waitForTimeout(2600)
  }
  console.log(theme, 'errores:', errs.length ? [...new Set(errs)][0] : 'ninguno')
  await ctx.close()
}
await browser.close()
