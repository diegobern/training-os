import { chromium } from 'playwright'
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const SHOTS = '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots'
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const out = []
async function shot(name, url, expect) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-ES' })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)) })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)
  const h1 = await page.locator('h1').first().innerText().catch(() => '(sin h1)')
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
  out.push(`${name.padEnd(14)} h1="${h1}" ${h1.includes(expect) ? 'OK' : 'INESPERADO'} errores=${errs.length ? errs[0] : 'ninguno'}`)
  await ctx.close()
}
// Firebase applied the code and redirected here: nothing left to do but confirm.
await shot('verify-ok', 'http://127.0.0.1:4280/auth/verificado', 'verificado')
// A link that came straight here with a code that is expired or already used.
await shot('verify-bad', 'http://127.0.0.1:4280/auth/verificado?mode=verifyEmail&oobCode=noesvalido', 'No hemos podido')
console.log(out.join('\n'))
await browser.close()
