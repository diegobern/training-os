/**
 * Bakes the real 3D logo into the animated mark used in the tab bar.
 *
 * A live WebGL canvas in the tab bar would be the wrong trade: the bar is on
 * every screen, so it would mean a permanent GPU context and three.js on the
 * critical path of every launch — the exact cost the boot work removed. And at
 * 52 CSS pixels almost none of the geometry is visible anyway.
 *
 * Two things the first version got wrong, and both showed up as stutter:
 *
 *   · it sampled the live animation on a wall clock, so the frames were not
 *     evenly spaced around the revolution;
 *   · the live animation eases the spin and floats the totem on periods that
 *     do not divide a revolution, so the last frame did not meet the first and
 *     the loop jumped once per turn.
 *
 * Both are fixed by driving the scene instead of watching it: `__logoBake`
 * puts the component into a pure turntable and this script sets the angle for
 * every single frame. The output is an animated WebP — one file, decoded and
 * timed by the browser, with none of the `steps()` arithmetic that made a
 * twelve-frame strip look like a flip-book.
 */
import { chromium } from 'playwright'
import { mkdirSync, existsSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'

const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const BASE = process.env.BASE || 'http://127.0.0.1:4320'
const TMP = '/tmp/nav-frames'
const OUT = 'public/brand'

/**
 * 96 frames over 3.2 s — exactly 30 fps, and the numbers are not arbitrary.
 *
 * 30 fps is chosen against the screen rather than by feel: a 60 Hz display
 * holds each frame for exactly two refreshes, so no frame lasts three
 * refreshes and the next two, which is the judder that was still there at 24.
 * On a 120 Hz phone it is exactly four refreshes. Either way, even.
 *
 * And 96 is the largest frame count that fits: WebP cannot exceed 16383 px in
 * any dimension, and the strip is 144 px per frame — 120 frames would be
 * 17280 px tall and simply fails to encode.
 */
const FRAMES = Number(process.env.FRAMES || 96)
const PERIOD_MS = Number(process.env.PERIOD || 3200)
/** Rendered at 144 so it stays sharp on a 3× phone at 52 CSS pixels. */
const SIZE = 144

mkdirSync(TMP, { recursive: true })
execSync(`rm -f ${TMP}/*.png`)

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
})
const ctx = await browser.newContext({
  viewport: { width: 400, height: 900 },
  deviceScaleFactor: 2,
  locale: 'es-ES',
  colorScheme: 'dark',
})
const page = await ctx.newPage()
// Installed before any app code runs, so the very first rendered frame is
// already a bake frame and nothing of the live animation leaks in.
await page.addInitScript(() => {
  window.__logoBake = { angle: 0 }
})
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(6000)

/*
 * Transparent frames, so the lime tile shows through.
 *
 * The first bake screenshotted the welcome screen as it is, background and
 * all, and the result was an opaque dark square sitting inside the round lime
 * button. The renderer is already created with `alpha: true`; what was opaque
 * was the page behind it.
 */
await page.addStyleTag({
  content: `
    html, body, #root, #root * { background: transparent !important; box-shadow: none !important; }
    body > *:not(#root) { display: none !important; }
  `,
})
await page.waitForTimeout(400)

const canvas = page.locator('canvas').first()
if (!(await canvas.count())) {
  console.error('no hay canvas 3D en la pantalla de bienvenida')
  process.exit(1)
}

const box = await canvas.boundingBox()
const side = Math.min(box.width, box.height)
const clip = {
  x: Math.round(box.x + (box.width - side) / 2),
  y: Math.round(box.y + (box.height - side) / 2),
  width: Math.round(side),
  height: Math.round(side),
}

for (let i = 0; i < FRAMES; i++) {
  const angle = (i / FRAMES) * Math.PI * 2
  await page.evaluate((a) => {
    window.__logoBake.angle = a
  }, angle)
  // Two frames of grace: one for the rAF that reads the new angle, one for the
  // compositor to put it on the screen before the screenshot is taken.
  await page.waitForTimeout(40)
  await page.screenshot({ path: `${TMP}/f${String(i).padStart(3, '0')}.png`, clip, omitBackground: true })
}
await browser.close()

/* ------------------------------------------------------------------ encode */

const delay = Math.round(PERIOD_MS / FRAMES)
execSync(
  `cd ${TMP} && for f in f*.png; do convert "$f" -resize ${SIZE}x${SIZE} "r_$f"; done`,
  { stdio: 'inherit', shell: '/bin/bash' },
)

/*
 * A sprite strip animated by CSS, not an animated image.
 *
 * An animated WebP is decoded and timed on the main thread, so on a phone it
 * stutters under load and stops outright while the page is being scrolled —
 * scrolling is handled by the compositor and the main thread is busy
 * elsewhere. A `transform` animation over a strip runs on the compositor too,
 * which means it keeps turning at a steady rate no matter what the app is
 * doing. Same frames, same size, and it cannot be starved.
 */
execSync(`cd ${TMP} && convert $(ls r_f*.png | sort) -append strip.png`, { stdio: 'inherit', shell: '/bin/bash' })
execSync(`convert ${TMP}/strip.png -define webp:lossless=false -quality 82 ${OUT}/nav-logo.webp`, { stdio: 'inherit' })

// The still, for reduced motion and for the data-motion='off' setting. A
// chosen pose, not whichever frame the animation happened to stop on.
execSync(`convert ${TMP}/r_f000.png -quality 82 ${OUT}/nav-logo-still.webp`, { stdio: 'inherit' })

for (const f of ['nav-logo.webp', 'nav-logo-still.webp']) {
  const p = `${OUT}/${f}`
  if (!existsSync(p)) throw new Error(`no se generó ${p}`)
  console.log(`${f.padEnd(20)} ${(statSync(p).size / 1024).toFixed(1)} KB`)
}
console.log(`${FRAMES} fotogramas · ${PERIOD_MS}ms por vuelta · ${(1000 / delay).toFixed(1)} fps`)
console.log(`la tira mide ${SIZE} × ${SIZE * FRAMES} px — el CSS usa height: ${FRAMES * 100}%`)
