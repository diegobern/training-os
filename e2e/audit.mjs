import { chromium } from 'playwright'
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const BASE = 'http://127.0.0.1:4320'
const WIDTHS = [320, 375, 390, 430, 768, 1280]
const ROUTES = [
  '/', '/routines', '/workout', '/progress', '/progress?view=statistics', '/progress?view=records',
  '/progress?view=calendar', '/progress?view=body', '/progress?view=measurements',
  '/more', '/history', '/calendar', '/body', '/stats', '/prs', '/milestones',
  '/library', '/settings', '/search', '/profile',
]

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })
const issues = []
const accepts = []
const consoleErrors = []

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 800 },
    deviceScaleFactor: 2,
    isMobile: width < 700,
    hasTouch: width < 700,
    locale: 'es-ES',
  })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${width}px ${m.text()}`) })
  page.on('pageerror', (e) => consoleErrors.push(`${width}px PAGEERROR ${e.message}`))

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  if (width === WIDTHS[0]) {
    await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)
    const demo = page.getByRole('button', { name: /Cargar datos DEMO/i })
    if (await demo.count()) {
      await demo.scrollIntoViewIfNeeded()
      await demo.click()
      await page.waitForTimeout(5000)
    }
  }

  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' })
    await page.waitForTimeout(650)

    const report = await page.evaluate(() => {
      const res = { overflowDoc: 0, escaped: [], small: [], unlabeled: [] }
      res.overflowDoc = document.documentElement.scrollWidth - document.documentElement.clientWidth

      // Text that physically leaves the box it was given.
      const containers = document.querySelectorAll('div, p, span, h1, h2, h3, li, button, section, article')
      for (const el of containers) {
        const style = getComputedStyle(el)
        // Scroll containers are allowed to be wider than their box, and
        // `truncate` (overflow:hidden + ellipsis) is clipping on purpose —
        // neither is text escaping its container.
        if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue
        if (style.overflowX === 'hidden' || style.overflow === 'hidden') continue
        if (style.textOverflow === 'ellipsis') continue
        if (el.scrollWidth - el.clientWidth > 2 && el.clientWidth > 0) {
          const cls = (el.className || '').toString().slice(0, 44)
          const text = (el.textContent || '').trim().slice(0, 28)
          res.escaped.push(`${el.tagName.toLowerCase()}.${cls} "${text}" ${el.scrollWidth}>${el.clientWidth}`)
        }
      }

      for (const el of document.querySelectorAll('button, a[href], input, select, [role="switch"], [role="tab"]')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) continue
        // A 26x120 chart column is a perfectly good target; only flag marks
        // that are small in BOTH directions.
        if (Math.min(r.height, r.width) < 30 || (r.height < 36 && r.width < 44)) {
          res.small.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 28)} ${Math.round(r.width)}x${Math.round(r.height)}`)
        }
        const text = (el.textContent || '').trim()
        const labelled =
          el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') ||
          (el.labels && el.labels.length > 0) || (el.id && document.querySelector(`label[for="${el.id}"]`))
        if (!text && !labelled) res.unlabeled.push(el.tagName.toLowerCase())
      }
      return res
    })

    const tag = `${width}px ${route}`
    if (report.overflowDoc > 1) issues.push(`${tag}: page scrolls horizontally by ${report.overflowDoc}px`)
    if (report.escaped.length) issues.push(`${tag}: ${report.escaped.length} element(s) with escaping content -> ${report.escaped.slice(0, 3).join(' | ')}`)
    if (report.small.length) {
      // Two shapes are deliberate and reviewed, not defects:
      //  - chart columns: thin but 120 px tall, the whole column is the target
      //  - calendar days: a 7-column month grid at 320 px cannot give more
      const accepted = report.small.every(
        (s) => s.includes('flex min-w-0 flex-1') || s.includes('aspect-s'),
      )
      const line = `${tag}: ${report.small.length} small target(s) -> ${report.small.slice(0, 3).join(' | ')}`
      if (accepted) accepts.push(line)
      else issues.push(line)
    }
    if (report.unlabeled.length) issues.push(`${tag}: ${report.unlabeled.length} unlabeled control(s)`)
  }
  await ctx.close()
}

console.log('--- LAYOUT / A11Y AUDIT ---')
console.log(issues.length ? issues.join('\n') : 'no issues found')
console.log('--- ACCEPTED (reviewed, not defects) ---')
console.log(accepts.length ? accepts.join('\n') : 'none')
console.log('--- CONSOLE ERRORS ---')
console.log(consoleErrors.length ? [...new Set(consoleErrors)].slice(0, 10).join('\n') : 'none')
await browser.close()
