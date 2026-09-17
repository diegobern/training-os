import { chromium } from 'playwright'
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const SHOTS = '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots'
const BASE = 'http://127.0.0.1:4200'
const TAG = process.argv[2] ?? 'a'
const THEME = process.argv[3] ?? 'light'

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-ES' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })

await page.addInitScript((theme) => {
  document.addEventListener('DOMContentLoaded', () => document.documentElement.setAttribute('data-theme', theme))
}, THEME)
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(4500)
await page.evaluate((theme) => document.documentElement.setAttribute('data-theme', theme), THEME)
await page.waitForTimeout(500)

const hasCanvas = await page.locator('canvas').count()
console.log('canvas presente:', hasCanvas)
const box = await page.locator('canvas').first().boundingBox().catch(() => null)
console.log('canvas box:', box && JSON.stringify(box))

// A strip of frames across one full turn, so the thickness and the ring
// occlusion can actually be judged.
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(1250)
  await page.screenshot({ path: `${SHOTS}/60-totem-${THEME}-${TAG}-${i}.png` })
}
// close crop of the object
if (box) {
  await page.screenshot({
    path: `${SHOTS}/61-totem-${THEME}-${TAG}-crop.png`,
    clip: { x: box.x, y: box.y, width: box.width, height: box.height },
  })
}
console.log('errores:', errors.length ? [...new Set(errors)].slice(0, 5).join(' | ') : 'ninguno')
await browser.close()
