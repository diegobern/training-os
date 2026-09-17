import { chromium } from 'playwright'
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const SHOTS = '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots'
const BASE = 'http://127.0.0.1:4200'
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const out = []

async function shot(name, { theme, width = 390, height = 844, reduce = false, noWebGL = false, wait = 5000 }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    locale: 'es-ES',
    reducedMotion: reduce ? 'reduce' : 'no-preference',
  })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)) })
  if (noWebGL) {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (String(type).startsWith('webgl')) return null
        return orig.call(this, type, ...rest)
      }
    })
  }
  await page.addInitScript((t) => {
    document.addEventListener('DOMContentLoaded', () => document.documentElement.setAttribute('data-theme', t))
  }, theme)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(wait)
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
  await page.waitForTimeout(600)
  const canvases = await page.locator('canvas').count()
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
  out.push(`${name}: canvas=${canvases} errores=${errs.length ? [...new Set(errs)][0] : 'ninguno'}`)
  await ctx.close()
}

await shot('80-welcome-light', { theme: 'light' })
await shot('81-welcome-dark', { theme: 'dark' })
await shot('82-welcome-reduced', { theme: 'light', reduce: true })
await shot('83-welcome-nowebgl', { theme: 'light', noWebGL: true, wait: 3000 })
await shot('84-welcome-small', { theme: 'light', width: 320, height: 640 })
await shot('85-welcome-desktop', { theme: 'dark', width: 1280, height: 900 })

// frame rate over two seconds
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(4000)
const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let n = 0
      const t0 = performance.now()
      const tick = () => {
        n++
        if (performance.now() - t0 < 2000) requestAnimationFrame(tick)
        else resolve(Math.round((n / (performance.now() - t0)) * 1000))
      }
      requestAnimationFrame(tick)
    }),
)
out.push(`fps (software rendering en este sandbox): ${fps}`)
await browser.close()
console.log(out.join('\n'))
