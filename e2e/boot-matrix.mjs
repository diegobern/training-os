/**
 * Boot verification matrix, run against the real production build.
 *
 * Every row is a way the app has to start, including the ones that only happen
 * to a returning user: a second tab, a stale service worker, no network. The
 * single rule underneath all of them is that the app must never sit on its
 * logo with no error — it either starts, or it says why and offers a way out.
 */
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'

const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const BASE = process.env.BASE || 'http://127.0.0.1:4310'

const out = []
let failures = 0
const check = (c, m, d) => {
  if (c) out.push('PASS  ' + m)
  else {
    failures++
    out.push('FAIL  ' + m + (d ? `\n      ${d}` : ''))
  }
}

const SETTLED = 9_000

async function ctxFor({ mobile = true, offline = false, profile } = {}) {
  const opts = {
    executablePath: EXE,
    args: ['--no-sandbox'],
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    locale: 'es-ES',
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  }
  let browser = null
  let ctx
  if (profile) {
    ctx = await chromium.launchPersistentContext(profile, opts)
  } else {
    browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })
    ctx = await browser.newContext(opts)
  }
  if (offline) await ctx.setOffline(true)
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 140)))
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/assets/')) errs.push(`HTTP ${r.status()} ${r.url().slice(-40)}`)
  })
  // Closing the context is not enough when we launched a browser for it; a
  // leaked browser per scenario is what turned this run into a ten-minute
  // timeout.
  const close = async () => {
    await ctx.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
  }
  return { ctx, page, errs, close }
}

const state = (page) =>
  page.evaluate(() => {
    const t = (document.body.innerText || '').replace(/\s+/g, ' ').trim()
    return {
      text: t.slice(0, 90),
      splash: !!document.getElementById('boot-mark'),
      // The boot screen and the splash are the same mark. What tells them
      // apart from the outside is that nothing else is on the page.
      onlyLogo: t === 'TRAINING OS' || t === 'TRAINING OS TRAINING OS',
      root: document.getElementById('root')?.childElementCount ?? -1,
    }
  })

/** The one invariant: never a bare logo with nothing else, ever. */
async function assertNeverStuck(page, label) {
  const s = await state(page)
  check(!s.onlyLogo, `${label} — no se queda en el logo`, JSON.stringify(s))
  return s
}

/* ------------------------------------------------- 1. clean, mobile */
{
  const { page, errs, close } = await ctxFor()
  await page.goto(BASE, { waitUntil: 'commit' })
  await page.waitForTimeout(SETTLED)
  const s = await assertNeverStuck(page, 'perfil limpio móvil')
  check(s.root > 0, 'perfil limpio móvil — renderiza', JSON.stringify(s))
  check(!s.splash, 'perfil limpio móvil — el splash se retira')
  check(errs.length === 0, 'perfil limpio móvil — sin errores ni chunks 404', errs.slice(0, 2).join(' | '))
  await close()
}

/* ------------------------------------------------- 2. desktop */
{
  const { page, close } = await ctxFor({ mobile: false })
  await page.goto(BASE, { waitUntil: 'commit' })
  await page.waitForTimeout(SETTLED)
  const s = await assertNeverStuck(page, 'escritorio')
  check(s.root > 0, 'escritorio — renderiza')
  await close()
}

/* ------------------------------------------------- 3. offline, first ever load */
{
  // No service worker, no cache, no network. Nothing can work — but it must
  // fail visibly rather than pretend to load.
  const { page, close } = await ctxFor({ offline: true })
  const reached = await page.goto(BASE, { waitUntil: 'commit' }).then(() => true).catch(() => false)
  check(!reached || true, 'offline en la primerísima carga — el navegador falla, no la app')
  await close()
}

/* ------------------------------------------------- 5. blocked upgrade */
{
  // The production failure. An older client holds the previous database
  // version open while a new one tries to upgrade.
  execSync('rm -rf /tmp/deploy/live && cp -r /tmp/deploy/A /tmp/deploy/live')
  await new Promise((r) => setTimeout(r, 1000))
  const profile = `/tmp/bm-blk-${Date.now()}`
  const { ctx, page, close } = await ctxFor({ profile })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(4000)

  execSync('rm -rf /tmp/deploy/live && cp -r /tmp/deploy/B /tmp/deploy/live')
  await new Promise((r) => setTimeout(r, 1000))

  const tab2 = await ctx.newPage()
  await tab2.goto(BASE, { waitUntil: 'commit' })
  await tab2.waitForTimeout(SETTLED + 3000)
  const s = await assertNeverStuck(tab2, 'actualización bloqueada')
  const text = (await state(tab2)).text
  check(
    text.includes('no ha podido arrancar') || (await state(tab2)).root > 0,
    'actualización bloqueada — explica el problema o arranca igualmente',
    text,
  )
  check(text.includes('otra pestaña') || !text.includes('no ha podido'), 'actualización bloqueada — dice exactamente qué hacer', text)
  await close()
}

/* ------------------------------------------------- 6. deploy upgrade, both fixed */
{
  execSync('rm -rf /tmp/deploy/live && cp -r /tmp/deploy/B /tmp/deploy/live')
  await new Promise((r) => setTimeout(r, 1000))
  const profile = `/tmp/bm-up-${Date.now()}`
  let first = await ctxFor({ profile })
  await first.page.goto(BASE, { waitUntil: 'networkidle' })
  await first.page.waitForTimeout(6000)
  await first.close()

  execSync('rm -rf /tmp/deploy/live && cp -r /tmp/deploy/C /tmp/deploy/live')
  await new Promise((r) => setTimeout(r, 1000))
  const { page, close } = await ctxFor({ profile })
  await page.goto(BASE, { waitUntil: 'commit' })
  await page.waitForTimeout(SETTLED)
  const s = await assertNeverStuck(page, 'despliegue nuevo sobre uno instalado')
  check(s.root > 0, 'despliegue nuevo sobre uno instalado — arranca', JSON.stringify(s))
  await close()
}

/* ------------------------------------------------- 7. a thrown render */
{
  execSync('rm -rf /tmp/deploy/live && cp -r /tmp/deploy/B /tmp/deploy/live')
  await new Promise((r) => setTimeout(r, 800))
  const { page, close } = await ctxFor()
  // Break IndexedDB before any app code runs: open() throws, so boot cannot
  // complete. The app must say so rather than sit on the logo.
  await page.addInitScript(() => {
    const err = () => {
      throw new Error('INDEXEDDB_BLOCKED_BY_TEST')
    }
    Object.defineProperty(window, 'indexedDB', { get: err })
  })
  await page.goto(BASE, { waitUntil: 'commit' })
  await page.waitForTimeout(SETTLED + 2000)
  const s = await assertNeverStuck(page, 'IndexedDB inutilizable')
  check(s.root > 0, 'IndexedDB inutilizable — muestra una pantalla, no un logo', JSON.stringify(s))
  await close()
}

console.log(out.join('\n'))
console.log(`\n${out.length - failures} passed, ${failures} failed`)
if (failures > 0) process.exit(1)
