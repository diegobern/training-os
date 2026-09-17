/**
 * The production reproduction: an IndexedDB version bump blocked by a client
 * that still holds the previous version open.
 *
 * Tab 1 runs version A (DB v2) and stays open — a second tab, or the installed
 * PWA window, which is normal for a returning user and never happens with the
 * single fresh profile a local test uses. Tab 2 then runs version B, which
 * wants v3.
 */
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'

const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const BASE = 'http://127.0.0.1:4310'

execSync('rm -rf /tmp/deploy/live && cp -r /tmp/deploy/A /tmp/deploy/live')
await new Promise((r) => setTimeout(r, 1200))

const ctx = await chromium.launchPersistentContext(`/tmp/repro-${Date.now()}`, {
  executablePath: EXE, args: ['--no-sandbox'], viewport: { width: 390, height: 844 }, locale: 'es-ES',
})

const tab1 = ctx.pages()[0] ?? (await ctx.newPage())
await tab1.goto(BASE, { waitUntil: 'networkidle' })
await tab1.waitForTimeout(4000)
const v1 = await tab1.evaluate(async () => {
  const dbs = await indexedDB.databases()
  return dbs.find((d) => d.name === 'training-os')?.version ?? null
})
console.log(`pestaña 1 (versión A) abierta — IndexedDB v${v1}`)
console.log('  muestra:', (await tab1.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 60))))

// Deploy version B. Tab 1 stays open, exactly as a user leaves it.
execSync('rm -rf /tmp/deploy/live && cp -r /tmp/deploy/B /tmp/deploy/live')
await new Promise((r) => setTimeout(r, 1200))

const tab2 = await ctx.newPage()
const errs = []
tab2.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
await tab2.goto(BASE, { waitUntil: 'commit' })

for (const ms of [3000, 6000, 10000, 15000]) {
  await tab2.waitForTimeout(ms === 3000 ? 3000 : 3000 + (ms === 6000 ? 0 : 1000))
  const s = await tab2.evaluate(() => ({
    splash: !!document.getElementById('boot-mark'),
    text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 70),
  }))
  console.log(`  t≈${ms}ms  splash=${s.splash}  "${s.text}"`)
}

const stuck = await tab2.evaluate(() => {
  const t = (document.body.innerText || '').replace(/\s+/g, ' ')
  return { text: t.slice(0, 80), isBootScreen: t.includes('TRAINING OS') && !t.includes('Entrena') && !t.includes('Paso') }
})
console.log('\nRESULTADO pestaña 2:', JSON.stringify(stuck))
console.log('errores:', errs.length ? errs : '(ninguno)')
console.log(stuck.isBootScreen ? '\n>>> REPRODUCIDO: atascado en la pantalla de arranque' : '\n>>> no reproducido')
await ctx.close()
