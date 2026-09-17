import { chromium } from 'playwright'

const SHOTS = '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots'
const errors = []

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-ES' })
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto('http://127.0.0.1:4174/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
console.log('TITLE:', await page.title())
console.log('BODY SNIPPET:', (await page.textContent('body')).slice(0, 300).replace(/\s+/g, ' '))
await page.screenshot({ path: `${SHOTS}/01-home-empty.png` })

// ---- load demo data through Settings
await page.goto('http://127.0.0.1:4174/settings', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
const demoBtn = page.getByRole('button', { name: /Cargar datos DEMO/i })
await demoBtn.scrollIntoViewIfNeeded()
await demoBtn.click()
await page.waitForTimeout(4000)
console.log('AFTER DEMO, toast:', (await page.textContent('body')).includes('DEMO') ? 'ok' : 'no')
await page.screenshot({ path: `${SHOTS}/02-settings.png`, fullPage: false })

await page.goto('http://127.0.0.1:4174/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.screenshot({ path: `${SHOTS}/03-home-demo.png`, fullPage: true })
console.log('HOME TEXT:', (await page.textContent('body')).slice(0, 700).replace(/\s+/g, ' '))

console.log('--- ERRORS ---')
console.log(errors.length ? errors.join('\n') : 'none')
await browser.close()
