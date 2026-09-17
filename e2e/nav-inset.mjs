import { chromium } from 'playwright'
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const SHOTS = '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots'
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-ES' })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:4210/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

// The test browser reports no safe-area inset, so stand one in at the size an
// iPhone with a home indicator reports (34px) and measure both rules against it.
async function measure(css) {
  await page.addStyleTag({ content: css })
  await page.waitForTimeout(120)
  return page.evaluate(() => {
    const nav = document.querySelector('nav')
    const label = [...nav.querySelectorAll('span')].filter((s) => s.textContent === 'Inicio')[0]
    const l = label.getBoundingClientRect()
    return { gapUnderLabel: Math.round(window.innerHeight - l.bottom), navTop: Math.round(nav.getBoundingClientRect().top) }
  })
}
const before = await measure('nav { padding-bottom: 34px !important; }')
const after = await measure('nav { padding-bottom: max(0px, calc(34px - 0.9rem)) !important; }')
console.log('antes (inset completo):', JSON.stringify(before))
console.log('ahora (inset recortado):', JSON.stringify(after))
console.log('la fila baja', before.gapUnderLabel - after.gapUnderLabel, 'px')
await page.screenshot({ path: `${SHOTS}/nav-after.png`, clip: { x: 0, y: 700, width: 390, height: 144 } })
await browser.close()
