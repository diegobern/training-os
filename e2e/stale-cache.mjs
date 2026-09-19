/**
 * The bug that reached a real phone, kept from coming back.
 *
 * `/brand/` is served CacheFirst, so a device that has opened the app keeps
 * its copy of the mark for months. When the strip changed shape — 12 frames,
 * then one animated file, then 96 frames — the filename did not, so a phone
 * went on serving last month's image to this month's stylesheet. The request
 * succeeded, nothing 404'd, every test on a clean profile passed, and the tab
 * bar showed a column of stripes.
 *
 * The fix is that the filename carries a hash of its contents, so a stylesheet
 * can only ever ask for the file it was built against. This test asserts that
 * property directly: it plants a wrong-shaped image in the cache under the old
 * fixed name and then checks that the app neither asks for it nor is affected
 * by it.
 */
import { chromium } from 'playwright'

const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const BASE = process.env.BASE || 'http://127.0.0.1:4330'

const out = []
let failures = 0
const check = (c, m, d) => {
  if (c) out.push('PASS  ' + m)
  else {
    failures++
    out.push('FAIL  ' + m + (d ? `\n      ${d}` : ''))
  }
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  deviceScaleFactor: 3, locale: 'es-ES',
})
const page = await ctx.newPage()

await page.goto(BASE, { waitUntil: 'commit' })
await page.waitForTimeout(3500)
await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('training-os'); q.onsuccess = () => r(q.result) })
  const row = await new Promise((r) => { const q = db.transaction('settings').objectStore('settings').get('app'); q.onsuccess = () => r(q.result) })
  if (!row) return
  row.onboardingVersion = 1
  await new Promise((r) => { const q = db.transaction('settings', 'readwrite').objectStore('settings').put(row); q.onsuccess = () => r() })
})
await page.reload({ waitUntil: 'commit' })
await page.waitForTimeout(3500)

/* --- plant a stale, wrong-shaped image under every legacy name ------------ */
const planted = await page.evaluate(async () => {
  // A 1×1 GIF is enough: any real strip is 96 frames tall, so if the app ever
  // resolved one of these names the frame-count assertion below would fail.
  const bytes = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), (c) => c.charCodeAt(0))
  const c = await caches.open('brand-v1')
  for (const n of ['/brand/nav-logo.webp', '/brand/nav-logo-still.webp']) {
    await c.put(new Request(new URL(n, location.origin)), new Response(bytes, { headers: { 'Content-Type': 'image/gif' } }))
  }
  return (await c.keys()).map((r) => new URL(r.url).pathname)
})
check(planted.length === 2, 'se ha plantado la imagen caducada con el nombre antiguo', JSON.stringify(planted))

await page.goto(`${BASE}/more`, { waitUntil: 'commit' })
await page.waitForTimeout(4000)

const img = await page.locator('.nav-logo3d img').evaluate((i) => ({
  src: i.getAttribute('src'),
  w: i.naturalWidth,
  h: i.naturalHeight,
}))

check(
  /^\/brand\/nav-logo\.[0-9a-f]{8}\.webp$/.test(img.src ?? ''),
  'la app no pide el nombre fijo antiguo, pide el que lleva hash',
  String(img.src),
)
check(img.w > 0 && img.h === img.w * 96, `la tira que se carga tiene 96 fotogramas (${img.w}×${img.h})`, JSON.stringify(img))

// And the stale entries are not what the app is reading, whatever is in there.
const used = await page.evaluate(async () => {
  const names = await caches.keys()
  const found = []
  for (const n of names) {
    const c = await caches.open(n)
    for (const r of await c.keys()) if (r.url.includes('/brand/')) found.push(`${n}:${new URL(r.url).pathname}`)
  }
  return found
})
check(
  used.some((u) => /nav-logo\.[0-9a-f]{8}\.webp$/.test(u)),
  'el fichero real acaba cacheado con su propio nombre',
  JSON.stringify(used),
)

await ctx.close()
await browser.close()
console.log(out.join('\n'))
console.log(`\n${out.length - failures} passed, ${failures} failed`)
if (failures > 0) process.exit(1)
