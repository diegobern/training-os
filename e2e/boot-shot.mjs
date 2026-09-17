import { chromium } from 'playwright'
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const SHOTS = '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots'
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-ES', colorScheme: theme })
  const page = await ctx.newPage()
  // A dark splash only happens for someone who has chosen dark; the app opens
  // light by default, so a first visit is light whatever the system says.
  if (theme === 'dark') await page.addInitScript(() => { try { localStorage.setItem('to:theme', 'dark') } catch (e) {} })
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: 50 * 1024, uploadThroughput: 50 * 1024, latency: 400 })
  await page.goto('http://127.0.0.1:4240/', { waitUntil: 'commit' })
  await page.waitForSelector('#boot-mark svg')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SHOTS}/boot-${theme}.png` })
  const a = await page.locator('#boot-mark svg').boundingBox()
  // And the moment the app has mounted underneath, while the splash fades.
  await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0 })
  await page.waitForFunction(() => document.querySelector('#root')?.childElementCount > 0, null, { timeout: 60000 })
  await page.screenshot({ path: `${SHOTS}/handover-${theme}.png` })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0 })
  await page.waitForSelector('span.bg-brand.shadow-lift', { timeout: 60000 })
  await page.waitForTimeout(5000)
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/loaded-${theme}.png` })
  const b = await page.locator('span.bg-brand.shadow-lift').first().boundingBox()
  console.log(theme, '| splash centro y=', Math.round(a.y + a.height / 2), '| logo app centro y=', Math.round(b.y + b.height / 2), '| salto', Math.round(Math.abs((a.y + a.height / 2) - (b.y + b.height / 2))), 'px')
  await ctx.close()
}
await browser.close()
