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
  await page.goto(base, { waitUntil: 'commit' })
  await page.waitForSelector('button:has-text("CREAR CUENTA")', { timeout: 120000 })
  // Press as soon as the button exists — the worst case, before any idle
  // prefetch has had time to land.
  const t = Date.now()
  await page.getByRole('button', { name: /crear cuenta/i }).first().click()
  await page.waitForFunction(() => !!document.querySelector('input[name="email"], input[type="email"]'), null, { timeout: 120000 })
  console.log(`${label.padEnd(6)} de pulsar a formulario en pantalla: ${Date.now() - t} ms`)
  await ctx.close()
}
await run('ANTES', process.argv[2])
await run('AHORA', process.argv[3])
await browser.close()
