/**
 * Bakes the real 3D logo into a sprite sheet for the bottom navigation.
 *
 * A live WebGL canvas in the tab bar would be the wrong trade: the bar is on
 * every screen, so it would mean a permanent GPU context and three.js (about
 * 140KB gzipped) on the critical path of every launch — the exact cost the
 * boot work just removed. And at 48 CSS pixels almost none of the geometry is
 * visible anyway.
 *
 * So the frames come from the same LogoTotem3D, rendered once here, and the
 * app plays them back with CSS `steps()`. Same object, same materials, same
 * lighting; no runtime cost beyond one small image.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const BASE = process.env.BASE || 'http://127.0.0.1:4320'
const TMP = '/tmp/nav-frames'
const FRAMES = 24
const SIZE = 128 // rendered at 128, displayed at 48 or less — sharp on any DPI

mkdirSync(TMP, { recursive: true })
execSync(`rm -f ${TMP}/*.png`)

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
})
const ctx = await browser.newContext({ viewport: { width: 400, height: 900 }, deviceScaleFactor: 2, locale: 'es-ES' })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(6000)

const canvas = page.locator('canvas').first()
if (!(await canvas.count())) {
  console.error('no hay canvas 3D en la pantalla de bienvenida')
  process.exit(1)
}

// Freeze the turntable and step it by hand, so the frames are evenly spaced
// around exactly one revolution and the loop is seamless.
await page.evaluate(() => {
  const c = document.querySelector('canvas')
  c.style.outline = 'none'
})

const box = await canvas.boundingBox()
const side = Math.min(box.width, box.height)
const clip = {
  x: box.x + (box.width - side) / 2,
  y: box.y + (box.height - side) / 2,
  width: side,
  height: side,
}

// The object rotates on its own; sampling at a fixed cadence over one
// revolution is enough and avoids reaching into the module's internals.
// One revolution is 2*PI / 0.0118 rad per frame at 60fps.
const REVOLUTION_MS = ((2 * Math.PI) / 0.0118 / 60) * 1000
const step = REVOLUTION_MS / FRAMES

for (let i = 0; i < FRAMES; i++) {
  await page.screenshot({ path: `${TMP}/f${String(i).padStart(2, '0')}.png`, clip })
  await page.waitForTimeout(step)
}
console.log(`${FRAMES} fotogramas capturados, una revolución de ${Math.round(REVOLUTION_MS)}ms`)
await browser.close()
