import { chromium } from 'playwright'
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const SHOTS = '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots'
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-ES' })
  const page = await ctx.newPage()
  if (theme === 'dark') await page.addInitScript(() => { try { localStorage.setItem('to:theme', 'dark') } catch (e) {} })
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: 60 * 1024, uploadThroughput: 60 * 1024, latency: 300 })
  await page.goto('http://127.0.0.1:4260/', { waitUntil: 'commit' })
  await page.waitForSelector('#boot-mark svg')
  await page.waitForTimeout(400)
  console.log(theme, '| data-theme al pintar:', await page.evaluate(() => document.documentElement.dataset.theme),
              '| fondo splash:', await page.evaluate(() => getComputedStyle(document.getElementById('boot-mark')).backgroundColor))
  await page.screenshot({ path: `${SHOTS}/b2-splash-${theme}.png` })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0 })
  // Catch the instant the splash begins to go: what is underneath it then?
  await page.waitForFunction(() => {
    const el = document.getElementById('boot-mark')
    return el && el.style.opacity === '0'
  }, null, { timeout: 60000 })
  await page.screenshot({ path: `${SHOTS}/b2-hand-${theme}.png` })
  await page.waitForTimeout(6000)
  await page.screenshot({ path: `${SHOTS}/b2-done-${theme}.png` })
  await ctx.close()
}
await browser.close()
