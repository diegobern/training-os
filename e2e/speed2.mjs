import { chromium } from 'playwright'
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const NET = { offline: false, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8, latency: 400 }

async function run(label, base) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES' })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', NET)
  const t0 = Date.now()
  await page.goto(base, { waitUntil: 'commit' })
  const any = await page.waitForFunction(() => {
    const el = document.querySelector('#boot-mark svg, span.bg-brand.shadow-lift svg')
    return !!el && el.getBoundingClientRect().width > 20
  }, null, { timeout: 90000 }).then(() => Date.now() - t0).catch(() => -1)
  const full = await page.waitForFunction(() => {
    const el = document.querySelector('span.bg-brand.shadow-lift')
    if (!el || el.getBoundingClientRect().width < 40) return false
    let n = el.parentElement, o = 1
    while (n && n !== document.body) { o *= +getComputedStyle(n).opacity; n = n.parentElement }
    return o > 0.95
  }, null, { timeout: 120000 }).then(() => Date.now() - t0).catch(() => -1)
  const c3d = await page.waitForFunction(() => {
    const c = document.querySelector('canvas')
    if (!c) return false
    let n = c.parentElement, o = 1
    while (n && n !== document.body) { o *= +getComputedStyle(n).opacity; n = n.parentElement }
    return o > 0.9
  }, null, { timeout: 150000 }).then(() => Date.now() - t0).catch(() => -1)
  console.log(`${label.padEnd(6)} algún rayo: ${String(any).padStart(6)} ms | rayo de la pantalla: ${String(full).padStart(6)} ms | 3D: ${String(c3d).padStart(6)} ms`)
  await ctx.close()
}
await run('ANTES', process.argv[2])
await run('AHORA', process.argv[3])
await browser.close()
