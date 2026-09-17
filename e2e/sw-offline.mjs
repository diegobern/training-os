/**
 * Service worker registration and offline launch, on the production build.
 *
 * Kept separate from the boot matrix because it is the only scenario that has
 * to wait on a real service worker lifecycle, and mixing a lifecycle wait into
 * a matrix of fixed-timeout checks is what made that file slow and flaky.
 */
import { chromium } from 'playwright'

const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const BASE = process.env.BASE || 'http://127.0.0.1:4310'
const out = []
let failures = 0
const check = (c, m, d) => { if (c) out.push('PASS  ' + m); else { failures++; out.push('FAIL  ' + m + (d ? `\n      ${d}` : '')) } }

const ctx = await chromium.launchPersistentContext(`/tmp/swoff-${Date.now()}`, {
  executablePath: EXE, args: ['--no-sandbox'], viewport: { width: 390, height: 844 }, locale: 'es-ES',
})
const page = ctx.pages()[0]
await page.goto(BASE, { waitUntil: 'networkidle' })

// Registration is held until the page has loaded and gone quiet, so that the
// precache does not compete with the first screen. Wait on the lifecycle, not
// on a guessed sleep.
const active = await page.waitForFunction(
  () => navigator.serviceWorker.controller !== null || !!performance.getEntriesByName(location.origin + '/sw.js').length,
  null,
  { timeout: 30000 },
).then(() => true).catch(() => false)
check(active, 'el service worker se registra tras la carga')

const reg = await page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration()
  return { has: !!r, active: !!r?.active, scope: r?.scope ?? null }
})
check(reg.active, 'el service worker queda activo', JSON.stringify(reg))

// Give the precache time to finish before pulling the plug.
await page.waitForTimeout(6000)
await ctx.setOffline(true)
await page.reload({ waitUntil: 'commit' }).catch(() => {})
await page.waitForTimeout(9000)

const s = await page.evaluate(() => {
  const t = (document.body.innerText || '').replace(/\s+/g, ' ').trim()
  return { text: t.slice(0, 80), root: document.getElementById('root')?.childElementCount ?? -1, onlyLogo: t === 'TRAINING OS' }
})
check(s.root > 0, 'sin conexión, la app abre desde la caché', JSON.stringify(s))
check(!s.onlyLogo, 'sin conexión, no se queda en el logo', JSON.stringify(s))

console.log(out.join('\n'))
console.log(`\n${out.length - failures} passed, ${failures} failed`)
await ctx.close()
if (failures > 0) process.exit(1)
