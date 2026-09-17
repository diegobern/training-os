import { chromium } from 'playwright'
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const SHOTS = '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots'
const BASE = 'http://127.0.0.1:4200'
const TAG = process.argv[2] ?? 'x'
const THEME = process.argv[3] ?? 'light'
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2, locale: 'es-ES' })
const page = await ctx.newPage()
await page.addInitScript((theme) => {
  document.addEventListener('DOMContentLoaded', () => document.documentElement.setAttribute('data-theme', theme))
}, THEME)
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(4000)
await page.evaluate((theme) => document.documentElement.setAttribute('data-theme', theme), THEME)
await page.waitForTimeout(400)
const box = await page.locator('canvas').first().boundingBox()
// six frames spread across a full turn, stitched side by side
const fs = await import('node:fs')
const frames = []
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(1500)
  const buf = await page.screenshot({ clip: box })
  const f = `/tmp/frame-${i}.png`
  fs.writeFileSync(f, buf)
  frames.push(f)
}
console.log(JSON.stringify({ box, frames }))
await browser.close()
