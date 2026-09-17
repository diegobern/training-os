import { chromium } from 'playwright'
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })
async function measure(label, base) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES' })
  const page = await ctx.newPage()
  const reqs = []
  page.on('request', (r) => reqs.push(r.url()))
  const t0 = Date.now()
  await page.goto(base, { waitUntil: 'commit' })
  const firstPaint = await page.waitForFunction(() => !!document.getElementById('boot-mark'), null, { timeout: 20000 }).then(() => Date.now() - t0).catch(() => -1)
  const firstScreen = await page.waitForFunction(
    () => { const t = (document.body.innerText || '').trim(); return t.length > 0 && t !== 'TRAINING OS' && t !== 'TRAINING OS TRAINING OS' },
    null, { timeout: 30000 },
  ).then(() => Date.now() - t0).catch(() => -1)
  const before = reqs.filter((u) => !u.includes('sw.js') && !u.includes('workbox')).length
  console.log(`${label.padEnd(7)} splash: ${String(firstPaint).padStart(5)}ms | primera pantalla útil: ${String(firstScreen).padStart(5)}ms | peticiones: ${before}`)
  await ctx.close()
}
await measure('ANTES', process.argv[2])
await measure('AHORA', process.argv[3])
await b.close()
