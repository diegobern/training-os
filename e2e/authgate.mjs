/**
 * Auth-gate test, run against a build that HAS Firebase configured and the
 * real Auth emulator running. Firestore is intentionally unavailable in this
 * sandbox, so this also proves the app degrades honestly instead of going blank.
 */
import { chromium } from 'playwright'

const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const SHOTS = '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots'
const BASE = 'http://127.0.0.1:4330'
const steps = []
const errors = []
const ok = (m) => steps.push('PASS  ' + m)
const fail = (m) => steps.push('FAIL  ' + m)

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'es-ES',
})
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
const body = () => page.textContent('body')
const has = async (s) => (await body()).includes(s)

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

;(await has('Entrena más fuerte')) ? ok('signed out shows the welcome screen') : fail('signed out shows the welcome screen')
;!(await has('PRÓXIMO ENTRENAMIENTO')) ? ok('the dashboard is not rendered while signed out') : fail('the dashboard is not rendered while signed out')
await page.screenshot({ path: `${SHOTS}/40-welcome.png` })

// private routes are gated too, not just the root
for (const route of ['/history', '/progress', '/settings', '/profile']) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const gated = (await has('Entrena más fuerte')) || (await has('Hola de nuevo'))
  gated ? ok(`private route ${route} is gated`) : fail(`private route ${route} is gated`)
}

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

// ------------------------------------------------------------ sign-up form
await page.getByRole('button', { name: /CREAR CUENTA/i }).click()
await page.waitForTimeout(900)
;(await has('Crea tu cuenta')) ? ok('sign-up screen opens') : fail('sign-up screen opens')
await page.screenshot({ path: `${SHOTS}/41-signup.png` })

const submit = page.getByRole('button', { name: /^Crear cuenta$/ })
;(await submit.isDisabled()) ? ok('submit is disabled while the form is empty') : fail('submit is disabled while the form is empty')

const fields = page.locator('input')
await fields.nth(0).fill('Diego')
await fields.nth(1).fill('die go!')      // invalid characters
await page.waitForTimeout(400)
;(await has('Solo letras, números')) ? ok('username charset is validated') : fail('username charset is validated')

await fields.nth(1).fill('di')
await page.waitForTimeout(300)
;(await has('Mínimo 3 caracteres')) ? ok('username length is validated') : fail('username length is validated')

await fields.nth(1).fill('admin')
await page.waitForTimeout(300)
;(await has('reservado')) ? ok('reserved usernames are rejected') : fail('reserved usernames are rejected')

const stamp = Date.now()
await fields.nth(1).fill(`diego${stamp % 100000}`)
await fields.nth(2).fill(`diego.${stamp}@example.com`)
await fields.nth(3).fill('short')
await page.waitForTimeout(400)
;(await submit.isDisabled()) ? ok('a weak password blocks submission') : fail('a weak password blocks submission')

await fields.nth(3).fill('TrainingOs2026')
await fields.nth(4).fill('TrainingOs2025')
await page.waitForTimeout(400)
;(await has('no coinciden')) ? ok('mismatched passwords are reported') : fail('mismatched passwords are reported')
;(await submit.isDisabled()) ? ok('mismatched passwords block submission') : fail('mismatched passwords block submission')

await fields.nth(4).fill('TrainingOs2026')
await page.waitForTimeout(500)
;!(await submit.isDisabled()) ? ok('a valid form enables submission') : fail('a valid form enables submission')
await page.screenshot({ path: `${SHOTS}/42-signup-valid.png` })

// ------------------------------------- real sign-up against the Auth emulator
await submit.click()
await page.waitForTimeout(6000)
const after = await body()
const blank = after.trim().length < 20
!blank ? ok('the screen is never left blank when Firestore is unreachable') : fail('the screen is never left blank when Firestore is unreachable')
steps.push('INFO  after sign-up the app shows: ' + after.slice(0, 160).replace(/\s+/g, ' '))
await page.screenshot({ path: `${SHOTS}/43-after-signup.png` })

// The verification gate. Sign-up must land here and must offer no way round.
;/Verifica tu email/i.test(after)
  ? ok('sign-up lands on the verification gate')
  : fail('sign-up lands on the verification gate — ' + after.slice(0, 160).replace(/\s+/g, ' '))
;!/Continuar sin verificar/i.test(after)
  ? ok('the gate offers no way to skip verification')
  : fail('the gate offers no way to skip verification — the skip button is back')
;/Reenviar email|Reenviar en/i.test(after)
  ? ok('the gate offers to resend the email')
  : fail('the gate offers to resend the email')
;!/PRÓXIMO ENTRENAMIENTO|Paso 1 de 7/i.test(after)
  ? ok('nothing of the app is reachable before verifying')
  : fail('nothing of the app is reachable before verifying — ' + after.slice(0, 160).replace(/\s+/g, ' '))

// The email really was sent, by the app, without anyone asking for it.
const oob = await fetch(
  'http://127.0.0.1:9099/emulator/v1/projects/demo-training-os/oobCodes',
).then((r) => r.json()).catch(() => ({ oobCodes: [] }))
const verifyCode = (oob.oobCodes ?? []).find((c) => c.requestType === 'VERIFY_EMAIL')
verifyCode
  ? ok('sign-up sent the verification email')
  : fail('sign-up sent the verification email — the emulator issued no VERIFY_EMAIL code')

/* ------------------------------------- verify for real, then watch it move on
 *
 * The link is opened out of band, exactly as it is in life: the person clicks
 * it in their mail client, not in this tab. Nothing tells this tab about it,
 * so what is being tested here is the recheck — that the app notices on its
 * own and stops gating.
 *
 * Firestore is unreachable in this sandbox, so the screen behind the gate is
 * the honest connection error rather than the questionnaire. That is fine:
 * what has to be proven is that the gate is *left*, and that it is left only
 * because the address was actually verified.
 */
if (verifyCode) {
  await fetch(verifyCode.oobLink)
  await page.getByRole('button', { name: /Ya lo he verificado/i }).click()
  await page.waitForTimeout(6000)
  const past = await body()
  !/Verifica tu email/i.test(past)
    ? ok('verifying the address gets past the gate')
    : fail('verifying the address gets past the gate — still on it: ' + past.slice(0, 160).replace(/\s+/g, ' '))
  await page.screenshot({ path: `${SHOTS}/44-verified.png` })
}

// The Auth user really was created: prove it by signing in against the
// emulator's own REST endpoint, independently of the app.
const signIn = await fetch(
  'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key-for-emulator',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `diego.${stamp}@example.com`,
      password: 'TrainingOs2026',
      returnSecureToken: true,
    }),
  },
)
const signInBody = await signIn.json()
signIn.ok && signInBody.localId
  ? ok('the Firebase Auth account was really created (verified against the emulator)')
  : fail('the Firebase Auth account was really created — ' + JSON.stringify(signInBody).slice(0, 120))

// ------------------------------------------ login screen, on a clean device
const fresh = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'es-ES',
})
const p2 = await fresh.newPage()
await p2.goto(BASE, { waitUntil: 'networkidle' })
await p2.waitForTimeout(2500)
const t2 = () => p2.textContent('body')
;((await t2()).includes('Entrena más fuerte')) ? ok('a clean device starts signed out') : fail('a clean device starts signed out')

await p2.getByRole('button', { name: /INICIAR SESIÓN/i }).click()
await p2.waitForTimeout(900)
;((await t2()).includes('Hola de nuevo')) ? ok('login screen opens') : fail('login screen opens')
await p2.screenshot({ path: `${SHOTS}/44-login.png` })

// wrong credentials are reported, not swallowed
const li = p2.locator('input')
await li.nth(0).fill('nobody@example.com')
await li.nth(1).fill('WrongPassword1')
await p2.getByRole('button', { name: /^Entrar$/ }).click()
await p2.waitForTimeout(3000)
;((await t2()).includes('incorrectos') || (await t2()).includes('Sin conexión'))
  ? ok('a failed login shows a message')
  : fail('a failed login shows a message')

await p2.getByRole('button', { name: /¿Olvidaste la contraseña/i }).click()
await p2.waitForTimeout(800)
;((await t2()).includes('Recuperar contraseña')) ? ok('forgot-password screen opens') : fail('forgot-password screen opens')
await p2.screenshot({ path: `${SHOTS}/45-forgot.png` })
await fresh.close()

console.log(steps.join('\n'))
console.log('--- CONSOLE ERRORS ---')
console.log(errors.length ? [...new Set(errors)].slice(0, 6).join('\n') : 'none')
await browser.close()
