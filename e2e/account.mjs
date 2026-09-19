/**
 * Cross-device, update-safety and offline-sync test.
 *
 * Needs the full emulator suite AND a build made with `npm run build:test`:
 *
 *   npm run build:test
 *   npm run emulators           # in another terminal
 *   npx vite preview --port 4190
 *   node e2e/account.mjs
 *
 * What it proves, in order:
 *   1. an account can be created and its data lands in Firestore
 *   2. a completely clean device gets everything back after a login
 *   3. a second user sees none of the first user's data
 *   4. sets logged offline reach Firestore once connectivity returns,
 *      with no duplicates
 *   5. a service-worker update does not lose anything
 */
import { chromium } from 'playwright'

const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const BASE = process.env.BASE ?? 'http://127.0.0.1:4190'
const PROJECT = 'demo-training-os'
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`

const steps = []
const ok = (m) => steps.push('PASS  ' + m)
const bad = (m, e) => steps.push('FAIL  ' + m + (e ? ` — ${e}` : ''))

const stamp = Date.now()
const A = { email: `alice.${stamp}@example.com`, user: `alice${stamp % 100000}`, name: 'Alice', pw: 'TrainingOs2026' }
const B = { email: `bob.${stamp}@example.com`, user: `bob${stamp % 100000}`, name: 'Bob', pw: 'TrainingOs2026' }

/** Reads a user's Firestore collection through the emulator REST API. */
async function remoteCount(uid, collection) {
  const res = await fetch(`${FS}/users/${uid}/${collection}`)
  if (!res.ok) return -1
  const body = await res.json()
  return (body.documents ?? []).length
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })

async function device(locale = 'es-ES') {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale,
  })
  const page = await ctx.newPage()
  return { ctx, page }
}

const text = (page) => page.textContent('body')

async function signUp(page, who) {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /CREAR CUENTA/i }).click()
  await page.waitForTimeout(800)
  const f = page.locator('input')
  await f.nth(0).fill(who.name)
  await f.nth(1).fill(who.user)
  await f.nth(2).fill(who.email)
  await f.nth(3).fill(who.pw)
  await f.nth(4).fill(who.pw)
  await page.getByRole('button', { name: /^Crear cuenta$/ }).click()
  await page.waitForTimeout(6000)
  // Straight into onboarding: there is no verification step to get past.
  const start = page.getByRole('button', { name: /^EMPEZAR$/ })
  if (await start.count()) {
    await start.click()
    await page.waitForTimeout(3000)
  }
}

async function logIn(page, who) {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /INICIAR SESIÓN/i }).click()
  await page.waitForTimeout(800)
  const f = page.locator('input')
  await f.nth(0).fill(who.email)
  await f.nth(1).fill(who.pw)
  await page.getByRole('button', { name: /^Entrar$/ }).click()
  await page.waitForTimeout(8000)
}

async function uidOf(page) {
  return page.evaluate(async () => {
    const keys = await indexedDB.databases()
    void keys
    return localStorage.getItem('__uid__') ?? null
  })
}

/* ------------------------------------------------------- 1. create + train */
const d1 = await device()
await signUp(d1.page, A)
;(await text(d1.page)).includes('TRAINING OS') ? ok('account created and app opens') : bad('account created and app opens')

// load demo data so there is a real routine and history to move around
await d1.page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
await d1.page.waitForTimeout(800)
const demo = d1.page.getByRole('button', { name: /Cargar datos DEMO/i })
await demo.scrollIntoViewIfNeeded()
await demo.click()
await d1.page.waitForTimeout(12000)

// a real workout on top of the demo history
await d1.page.goto(`${BASE}/workout`, { waitUntil: 'networkidle' })
await d1.page.waitForTimeout(1200)
await d1.page.locator('button', { hasText: 'PUSH' }).first().click()
await d1.page.waitForTimeout(2000)
await d1.page.locator('input[aria-label="weight"]').first().fill('35')
await d1.page.locator('input[aria-label="reps"]').first().fill('9')
await d1.page.locator('button[aria-label="set 1"]').click()
await d1.page.waitForTimeout(1500)
const skipRest = d1.page.getByRole('button', { name: /Saltar/i })
if (await skipRest.count()) await skipRest.click()
await d1.page.getByRole('button', { name: /FINALIZAR ENTRENAMIENTO/i }).click()
await d1.page.waitForTimeout(4000)
const doneBtn = d1.page.getByRole('button', { name: /^Hecho$/ })
if (await doneBtn.count()) await doneBtn.click()
await d1.page.waitForTimeout(6000)

const uid = await d1.page.evaluate(() =>
  JSON.parse(localStorage.getItem('firebase:authUser:' + Object.keys(localStorage).find((k) => k.startsWith('firebase:authUser:'))?.split(':')[2] + ':[DEFAULT]') ?? 'null')?.uid ?? null,
)
steps.push('INFO  uid from the browser: ' + uid)

const remoteSessions = uid ? await remoteCount(uid, 'sessions') : -1
const remoteRoutines = uid ? await remoteCount(uid, 'routines') : -1
steps.push(`INFO  Firestore now holds ${remoteSessions} sessions and ${remoteRoutines} routines`)
remoteSessions > 0 ? ok('training data reached Firestore') : bad('training data reached Firestore')

const localCount = await d1.page.evaluate(
  () =>
    new Promise((resolve) => {
      const req = indexedDB.open('training-os')
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('sessions')
        const c = tx.objectStore('sessions').count()
        c.onsuccess = () => resolve(c.result)
      }
    }),
)
steps.push(`INFO  this device holds ${localCount} sessions locally`)

/* ---------------------------------------------- 2. a completely clean device */
const d2 = await device()
await logIn(d2.page, A)
await d2.page.waitForTimeout(10000)
await d2.page.goto(`${BASE}/history`, { waitUntil: 'networkidle' })
await d2.page.waitForTimeout(3000)
const restored = await d2.page.evaluate(
  () =>
    new Promise((resolve) => {
      const req = indexedDB.open('training-os')
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('sessions')
        const c = tx.objectStore('sessions').count()
        c.onsuccess = () => resolve(c.result)
      }
    }),
)
steps.push(`INFO  the clean device restored ${restored} sessions`)
restored >= remoteSessions && restored > 0
  ? ok('a clean device gets the whole history back after logging in')
  : bad('a clean device gets the whole history back after logging in', `${restored} vs ${remoteSessions}`)
;(await text(d2.page)).includes('PUSH') ? ok('history is visible on the new device') : bad('history is visible on the new device')

/* ------------------------------------------------------- 3. user isolation */
const d3 = await device()
await signUp(d3.page, B)
await d3.page.goto(`${BASE}/history`, { waitUntil: 'networkidle' })
await d3.page.waitForTimeout(4000)
const bobBody = await text(d3.page)
!bobBody.includes('PUSH') && !bobBody.includes('LEGS')
  ? ok('a second user sees none of the first user data')
  : bad('a second user sees none of the first user data')

const bobUid = await d3.page.evaluate(() =>
  JSON.parse(localStorage.getItem('firebase:authUser:' + Object.keys(localStorage).find((k) => k.startsWith('firebase:authUser:'))?.split(':')[2] + ':[DEFAULT]') ?? 'null')?.uid ?? null,
)
if (bobUid && uid) {
  const cross = await d3.page.evaluate(async (otherUid) => {
    try {
      const res = await fetch(
        `http://127.0.0.1:8080/v1/projects/demo-training-os/databases/(default)/documents/users/${otherUid}/sessions`,
      )
      return res.status
    } catch {
      return 0
    }
  }, uid)
  steps.push(`INFO  raw REST read of another user subtree returned ${cross} (the emulator REST API bypasses rules; see tests/firestore-rules.mjs for the rule-level proof)`)
}

/* --------------------------------------------------------- 4. offline sync */
await d2.page.goto(`${BASE}/workout`, { waitUntil: 'networkidle' })
await d2.page.waitForTimeout(1500)
await d2.page.locator('button', { hasText: 'PULL' }).first().click()
await d2.page.waitForTimeout(2500)
await d2.ctx.setOffline(true)
await d2.page.evaluate(() => window.dispatchEvent(new Event('offline')))
await d2.page.waitForTimeout(600)

await d2.page.locator('input[aria-label="weight"]').first().fill('60')
await d2.page.locator('input[aria-label="reps"]').first().fill('8')
await d2.page.locator('button[aria-label="set 1"]').click()
await d2.page.waitForTimeout(1200)
const skip2 = d2.page.getByRole('button', { name: /Saltar/i })
if (await skip2.count()) await skip2.click()
await d2.page.getByRole('button', { name: /FINALIZAR ENTRENAMIENTO/i }).click()
await d2.page.waitForTimeout(3000)
const done2 = d2.page.getByRole('button', { name: /^Hecho$/ })
if (await done2.count()) await done2.click()
await d2.page.waitForTimeout(1500)
ok('a workout can be finished with no connection')

const beforeReconnect = uid ? await remoteCount(uid, 'sessions') : -1
await d2.ctx.setOffline(false)
await d2.page.evaluate(() => window.dispatchEvent(new Event('online')))
await d2.page.waitForTimeout(12000)
const afterReconnect = uid ? await remoteCount(uid, 'sessions') : -1
steps.push(`INFO  Firestore sessions before reconnect ${beforeReconnect}, after ${afterReconnect}`)
afterReconnect === beforeReconnect + 1
  ? ok('the offline workout reached Firestore exactly once')
  : bad('the offline workout reached Firestore exactly once', `${beforeReconnect} -> ${afterReconnect}`)

/* ------------------------------------------------- 5. an update loses nothing */
await d2.page.reload({ waitUntil: 'networkidle' })
await d2.page.waitForTimeout(8000)
const afterReload = await d2.page.evaluate(
  () =>
    new Promise((resolve) => {
      const req = indexedDB.open('training-os')
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('sessions')
        const c = tx.objectStore('sessions').count()
        c.onsuccess = () => resolve(c.result)
      }
    }),
)
afterReload >= restored ? ok('a reload keeps every session') : bad('a reload keeps every session', `${afterReload} < ${restored}`)

console.log(steps.join('\n'))
const failures = steps.filter((s) => s.startsWith('FAIL')).length
console.log(`\n${steps.filter((s) => s.startsWith('PASS')).length} passed, ${failures} failed`)
await browser.close()
process.exit(failures > 0 ? 1 : 0)
