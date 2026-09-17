import { chromium } from 'playwright'
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const SHOTS = '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots'
const BASE = 'http://127.0.0.1:4181'
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-ES' })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const demo = page.getByRole('button', { name: /Cargar datos DEMO/i })
if (await demo.count()) { await demo.scrollIntoViewIfNeeded(); await demo.click(); await page.waitForTimeout(5000) }

const shots = [
  ['/', '50-home-light'],
  ['/progress', '51-progress-light'],
  ['/progress?view=calendar', '52-calendar-light'],
  ['/progress?view=statistics', '53-stats-light'],
  ['/settings', '54-settings-light'],
  ['/routines', '55-routines-light'],
]
for (const [route, name] of shots) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1100)
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
}
// open the progress selector for a shot
await page.goto(`${BASE}/progress`, { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await page.locator('button[aria-haspopup="dialog"]').first().click()
await page.waitForTimeout(600)
await page.screenshot({ path: `${SHOTS}/56-progress-selector.png` })

// dark mode check
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.getByRole('tab', { name: /Oscuro/ }).click()
await page.waitForTimeout(700)
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
await page.screenshot({ path: `${SHOTS}/57-home-dark.png` })
console.log('theme now:', await page.getAttribute('html', 'data-theme'))
await browser.close()
