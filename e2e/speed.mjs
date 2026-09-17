import { chromium } from 'playwright'
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })

// "Slow 3G" as Chrome DevTools defines it.
const NET = { offline: false, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8, latency: 400 }

async function run(label, base) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES' })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', NET)
  let bytes = 0
  page.on('response', (r) => {
    const l = r.headers()['content-length']
    if (l) bytes += Number(l)
  })
  const t0 = Date.now()
  await page.goto(base, { waitUntil: 'commit' })

  // The brand mark is the green rounded tile. "Visible" means painted at full
  // strength — a 40%-opacity placeholder is not the logo arriving.
  const opacityOf = () => {
    const el = document.querySelector('span.bg-brand.shadow-lift')
    if (!el) return 0
    if (el.getBoundingClientRect().width < 40) return 0
    let n = el.parentElement
    let o = 1
    while (n && n !== document.body) { o *= +getComputedStyle(n).opacity; n = n.parentElement }
    return o
  }
  const markAt = await page
    .waitForFunction(opacityOf.toString().replace('() =>', '() =>') && (() => {
      const el = document.querySelector('span.bg-brand.shadow-lift')
      if (!el || el.getBoundingClientRect().width < 40) return false
      let n = el.parentElement, o = 1
      while (n && n !== document.body) { o *= +getComputedStyle(n).opacity; n = n.parentElement }
      return o > 0.95
    }), null, { timeout: 90000 })
    .then(() => Date.now() - t0)
    .catch(() => -1)

  const canvasAt = await page
    .waitForFunction(() => {
      const c = document.querySelector('canvas')
      if (!c) return false
      let n = c.parentElement, o = 1
      while (n && n !== document.body) { o *= +getComputedStyle(n).opacity; n = n.parentElement }
      return o > 0.9
    }, null, { timeout: 120000 })
    .then(() => Date.now() - t0)
    .catch(() => -1)

  console.log(
    `${label.padEnd(6)} logo a plena opacidad: ${String(markAt).padStart(6)} ms | 3D en pantalla: ${String(canvasAt).padStart(6)} ms | descargado: ${Math.round(bytes / 1024)} KB`,
  )
  await ctx.close()
}

await run('ANTES', process.argv[2])
await run('AHORA', process.argv[3])
await browser.close()
