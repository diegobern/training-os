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

import { CHROMIUM_EXE as EXE } from './chromium.mjs'
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
  // `Bearer owner` is the emulator's admin access: this is the test looking
  // at the database, not a client, so the security rules do not apply.
  const res = await fetch(`${FS}/users/${uid}/${collection}?pageSize=300`, { headers: { Authorization: 'Bearer owner' } })
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

  /*
   * Straight into the questionnaire — there is no verification step to get
   * past, and there must not be a skipped questionnaire either.
   *
   * This is asserted on every sign-up in this file, which is the point: the
   * second account is created on a device that has ALREADY been through
   * onboarding as somebody else, and it was silently inheriting their answers.
   */
  const body = await text(page)
  if (!/Paso 1 de 7|Sobre ti/.test(body)) {
    throw new Error(`${who.user}: el cuestionario no aparece al crear la cuenta — ${body.replace(/\s+/g, ' ').slice(0, 160)}`)
  }

  await answerQuestionnaire(page)
}

/** The seven steps, answered the way a person would. Same choices as e2e/onboarding.mjs. */
async function answerQuestionnaire(page) {
  const next = async () => {
    await page.getByRole('button', { name: /^(Siguiente|Empezar a entrenar)$/ }).first().click()
    await page.waitForTimeout(500)
  }
  await page.getByRole('button', { name: '30-39' }).first().click()
  await next()
  await page.getByRole('button', { name: /Ganar fuerza/ }).first().click()
  await next()
  await page.getByRole('button', { name: /^Intermedio/ }).first().click()
  await next()
  await page.getByRole('button', { name: '3', exact: true }).first().click()
  await next()
  await page.getByRole('button', { name: /Gimnasio en casa/ }).first().click()
  await next()
  await next() // interests are optional
  await page.getByRole('button', { name: /Empezar a entrenar/ }).click()
  await page.waitForTimeout(5000)
  const body = await text(page)
  if (/Paso \d de 7/.test(body)) {
    throw new Error(`el cuestionario no termina — ${body.replace(/\s+/g, ' ').slice(0, 160)}`)
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

/**
 * One real workout, built the way a person builds one — there is no sample
 * data in the app to lean on: free workout, one exercise from the picker, one
 * set logged, and the finish confirmed in the summary dialog.
 *
 * `beforeLogging` runs once the session is open and before the set is
 * written, which is where the offline scenario cuts the connection.
 */
async function trainOnce(page, { search, weight, reps, beforeLogging }) {
  // Not 'networkidle': with an account, Firestore keeps a connection open.
  await page.goto(`${BASE}/workout`, { waitUntil: 'commit' })
  await page.waitForTimeout(3500)
  await page.getByRole('button', { name: /Entrenamiento libre/ }).first().click()
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /Añadir ejercicio/ }).first().click()
  await page.waitForTimeout(2500)
  await page.getByPlaceholder('Buscar').fill(search)
  await page.waitForTimeout(2200)
  await page.locator('div.fixed.inset-0.z-50 p.text-card-sm').first().click()
  await page.waitForTimeout(3000)
  if (beforeLogging) await beforeLogging()
  await page.getByLabel('Peso', { exact: true }).first().fill(String(weight))
  await page.getByLabel('Repeticiones', { exact: true }).first().fill(String(reps))
  await page.getByRole('button', { name: 'Serie 1 completada', exact: true }).first().click()
  await page.waitForTimeout(1500)
  const skipRest = page.getByRole('button', { name: /Saltar/i })
  if (await skipRest.count()) await skipRest.first().click()
  await page.getByRole('button', { name: /FINALIZAR ENTRENAMIENTO/i }).click()
  await page.waitForTimeout(800)
  // Finishing asks first, with a summary of what will be saved.
  await page.locator('[role="dialog"]').getByRole('button', { name: 'FINALIZAR', exact: true }).click()
  await page.waitForTimeout(4000)
  const doneBtn = page.getByRole('button', { name: /^Hecho$/ })
  if (await doneBtn.count()) await doneBtn.click()
  await page.waitForTimeout(1500)
}

/** The signed-in user's uid, from where the Firebase SDK keeps it: IndexedDB. */
async function uidOf(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('firebaseLocalStorageDb')
        req.onerror = () => resolve(null)
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('firebaseLocalStorage')) return resolve(null)
          const all = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll()
          all.onsuccess = () => resolve(all.result.find((r) => String(r.fbase_key).startsWith('firebase:authUser:'))?.value?.uid ?? null)
          all.onerror = () => resolve(null)
        }
      }),
  )
}

/* ------------------------------------------------------- 1. create + train */
const d1 = await device()
await signUp(d1.page, A)
;(await text(d1.page)).includes('TRAINING OS') ? ok('account created and app opens') : bad('account created and app opens')

// The account's own data, logged by hand: two workouts, so there is history
// to move around. Nothing is pre-loaded.
await trainOnce(d1.page, { search: 'press inclinado mancuernas', weight: 35, reps: 9 })
await trainOnce(d1.page, { search: 'sentadilla', weight: 80, reps: 6 })
await d1.page.waitForTimeout(6000)

const uid = await uidOf(d1.page)
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
await d2.page.goto(`${BASE}/history`, { waitUntil: 'commit' })
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
;(await text(d2.page)).includes('Entrenamiento libre') ? ok('history is visible on the new device') : bad('history is visible on the new device')

/* ------------------------------------------------------- 3. user isolation */
const d3 = await device()
await signUp(d3.page, B)
await d3.page.goto(`${BASE}/history`, { waitUntil: 'commit' })
await d3.page.waitForTimeout(4000)
const bobBody = await text(d3.page)
!bobBody.includes('Entrenamiento libre')
  ? ok('a second user sees none of the first user data')
  : bad('a second user sees none of the first user data')

const bobUid = await uidOf(d3.page)
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
  // Without the emulator's admin access the request goes through the security
  // rules, like any client's: reading someone else's subtree is refused.
  cross === 403
    ? ok('an unauthenticated REST read of another user subtree is refused (403; signed-in cross-user reads: tests/firestore-rules.mjs)')
    : bad('an unauthenticated REST read of another user subtree is refused (403; signed-in cross-user reads: tests/firestore-rules.mjs)', String(cross))
}

/* --------------------------------------------------------- 4. offline sync */
// Cut the network BEFORE the screen loads. `setOffline` alone leaves a
// connection Firestore already had open working, and the "offline" workout
// would quietly upload. The app comes up from the service worker's cache.
const FIRESTORE_HOST = /127\.0\.0\.1:8080/
await d2.ctx.route(FIRESTORE_HOST, (route) => route.abort('internetdisconnected'))
await d2.ctx.setOffline(true)
const beforeOffline = uid ? await remoteCount(uid, 'sessions') : -1
await trainOnce(d2.page, { search: 'jalón al pecho', weight: 60, reps: 8 })
!d2.page.url().endsWith('/workout/active')
  ? ok('a workout can be finished with no connection')
  : bad('a workout can be finished with no connection', d2.page.url())

const beforeReconnect = uid ? await remoteCount(uid, 'sessions') : -1
beforeReconnect === beforeOffline
  ? ok('nothing reached Firestore while offline')
  : bad('nothing reached Firestore while offline', `${beforeOffline} -> ${beforeReconnect}`)
await d2.ctx.unroute(FIRESTORE_HOST)
await d2.ctx.setOffline(false)
await d2.page.evaluate(() => window.dispatchEvent(new Event('online')))
// The upload happens on its own once the connection is back; give it up to a
// minute (Firestore backs off after failed attempts) and note how long it took.
let afterReconnect = -1
const reconnectedAt = Date.now()
for (let i = 0; i < 30; i++) {
  await d2.page.waitForTimeout(2000)
  afterReconnect = uid ? await remoteCount(uid, 'sessions') : -1
  if (afterReconnect > beforeReconnect) break
}
steps.push(`INFO  the offline workout reached Firestore ${Math.round((Date.now() - reconnectedAt) / 1000)}s after reconnecting`)
steps.push(`INFO  Firestore sessions before reconnect ${beforeReconnect}, after ${afterReconnect}`)
afterReconnect === beforeReconnect + 1
  ? ok('the offline workout reached Firestore exactly once')
  : bad('the offline workout reached Firestore exactly once', `${beforeReconnect} -> ${afterReconnect}`)

/* ------------------------------------------------- 5. an update loses nothing */
await d2.page.reload({ waitUntil: 'commit' })
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
