/**
 * Looks at the tab-bar mark the way a person does: several frames in a row.
 *
 * A single screenshot said nothing about the stutter — the twelve-frame strip
 * looked perfect in a still. What gives it away is sampling the tile a few
 * times a second and measuring how much changes between consecutive samples:
 * a smooth turn moves a little every time, a flip-book sits still and then
 * jumps.
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const BASE = process.env.BASE || 'http://127.0.0.1:4330'
const SHOTS = '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots'
const TMP = '/tmp/navshots'
mkdirSync(TMP, { recursive: true })
execSync(`rm -f ${TMP}/*.png`)

const out = []
let failures = 0
const check = (c, m, d) => {
  if (c) out.push('PASS  ' + m)
  else { failures++; out.push('FAIL  ' + m + (d ? `\n      ${d}` : '')) }
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  deviceScaleFactor: 3, locale: 'es-ES', colorScheme: 'dark',
})
const page = await ctx.newPage()
const failed404 = []
page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/brand/')) failed404.push(r.url()) })

await page.goto(BASE, { waitUntil: 'commit' })
await page.waitForTimeout(3500)
await page.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('training-os'); r.onsuccess = () => res(r.result) })
  const row = await new Promise((res) => { const r = db.transaction('settings').objectStore('settings').get('app'); r.onsuccess = () => res(r.result) })
  row.onboardingVersion = 1
  await new Promise((res) => { const r = db.transaction('settings', 'readwrite').objectStore('settings').put(row); r.onsuccess = () => res() })
})
await page.reload({ waitUntil: 'commit' })
await page.waitForTimeout(4000)

const mark = page.locator('.nav-logo3d')
check(await mark.count() > 0, 'la marca del menú está en pantalla')

const src = await mark.locator('img').getAttribute('src')
check(src === '/brand/nav-logo.webp', 'con animaciones activas usa el fichero animado', String(src))

const natural = await mark.locator('img').evaluate((i) => ({ w: i.naturalWidth, h: i.naturalHeight, ok: i.complete && i.naturalWidth > 0 }))
check(natural.ok, 'la imagen carga de verdad', JSON.stringify(natural))
check(natural.w === natural.h, 'es un fotograma cuadrado, no una tira apilada', JSON.stringify(natural))

/* --- how much does it actually move, frame to frame ---------------------- */
const box = await mark.boundingBox()
const N = 14
for (let i = 0; i < N; i++) {
  await page.screenshot({ path: `${TMP}/n${String(i).padStart(2, '0')}.png`, clip: box })
  await page.waitForTimeout(90)
}
await page.screenshot({ path: `${SHOTS}/nav-logo-strip.png`, clip: { ...box, width: box.width, height: box.height } })

// Mean absolute difference between consecutive samples, 0..1.
const diffs = []
for (let i = 1; i < N; i++) {
  const a = `${TMP}/n${String(i - 1).padStart(2, '0')}.png`
  const b = `${TMP}/n${String(i).padStart(2, '0')}.png`
  const raw = execSync(`compare -metric MAE "${a}" "${b}" null: 2>&1 || true`).toString()
  const m = raw.match(/\(([0-9.]+)\)/)
  diffs.push(m ? Number(m[1]) : NaN)
}
const usable = diffs.filter((d) => Number.isFinite(d))
const still = usable.filter((d) => d < 0.0008).length
const max = Math.max(...usable)
const min = Math.min(...usable)

check(usable.length === N - 1, 'se pudieron comparar todos los fotogramas', JSON.stringify(diffs))
// A flip-book shows up as repeated near-identical pairs: the strip held each
// frame for 600ms while we sample every 90ms, so most pairs were identical.
check(still <= 2, `casi ningún par de fotogramas es idéntico (${still} de ${usable.length})`, JSON.stringify(usable.map((d) => d.toFixed(4))))
// And no single pair should jump far more than the rest — that is the seam.
check(max < min * 12 + 0.01, 'ningún salto desproporcionado: el bucle cierra', `min=${min.toFixed(4)} max=${max.toFixed(4)}`)
check(failed404.length === 0, 'sin 404 en /brand/', failed404.join(' '))

/* --- and with motion turned off ------------------------------------------ */
await page.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('training-os'); r.onsuccess = () => res(r.result) })
  const row = await new Promise((res) => { const r = db.transaction('settings').objectStore('settings').get('app'); r.onsuccess = () => res(r.result) })
  row.animations = false
  await new Promise((res) => { const r = db.transaction('settings', 'readwrite').objectStore('settings').put(row); r.onsuccess = () => res() })
})
await page.reload({ waitUntil: 'commit' })
await page.waitForTimeout(4000)
const stillSrc = await page.locator('.nav-logo3d img').getAttribute('src')
check(stillSrc === '/brand/nav-logo-still.webp', 'con animaciones desactivadas usa el fotograma fijo', String(stillSrc))

await ctx.close()
await browser.close()
console.log(out.join('\n'))
console.log(`\n${out.length - failures} passed, ${failures} failed`)
if (failures > 0) process.exit(1)
