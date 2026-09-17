import { chromium } from 'playwright'
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const SHOTS = '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots'
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const sizes = [
  [320, 568, 'iPhone SE 1'],
  [375, 667, 'iPhone SE 2/3'],
  [390, 844, 'iPhone 14'],
  [430, 932, 'iPhone 15 Pro Max'],
  [768, 1024, 'tablet'],
  [1280, 900, 'desktop'],
]
for (const [w, h, name] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'es-ES' })
  const page = await ctx.newPage()
  await page.goto('http://127.0.0.1:4330/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(4200)
  const cta = page.getByRole('button', { name: /CREAR CUENTA/i })
  const box = await cta.boundingBox()
  const canvases = await page.locator('canvas').count()
  const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 2)
  const visible = box ? box.y + box.height <= h + 1 : false
  console.log(
    `${String(w) + 'x' + h} ${name.padEnd(18)} CTA ${visible ? 'VISIBLE' : 'FUERA DE PANTALLA'}` +
      `  fondo ${box ? Math.round(box.y + box.height) : '?'}/${h}  logo3D ${canvases ? 'sí' : 'no'}  scroll ${scrolls ? 'sí' : 'no'}`,
  )
  if (w === 320 || w === 390) await page.screenshot({ path: `${SHOTS}/86-cta-${w}x${h}.png` })
  await ctx.close()
}
await browser.close()
