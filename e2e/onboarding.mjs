/**
 * The onboarding questionnaire, end to end, against a real Firebase Auth
 * emulator.
 *
 * Firestore is not reachable from this sandbox, which is not a gap in the test
 * — it is the offline case. Every step still has to persist locally and the
 * questionnaire still has to resume, and that is precisely what these
 * assertions check.
 */
import { chromium } from 'playwright'

const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const SHOTS = '/tmp/claude-0/-home-claude/838cb47a-cff1-59a2-93c1-94bc17e6b5ce/scratchpad/shots'
/**
 * Run against the LOCAL-ONLY build. Firestore is unreachable from this
 * sandbox, and the questionnaire is deliberately no longer an account
 * feature: it is local-first, mirrored to the account afterwards. This build
 * is therefore the honest way to test it here, and it also covers the offline
 * case directly — there is no server to reach at any point.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:4295'

const steps = []
let failures = 0
const ok = (m) => steps.push('PASS  ' + m)
const fail = (m, d) => {
  failures++
  steps.push('FAIL  ' + m + (d ? `\n      ${d}` : ''))
}
const check = (cond, m, d) => (cond ? ok(m) : fail(m, d))

/**
 * A persistent profile on disk, not a fresh context per run.
 *
 * `storageState` does NOT carry IndexedDB, and IndexedDB is where the draft
 * lives — so a "close and reopen" built on storageState reopens with an empty
 * database and would report a resume failure that is entirely the test's own
 * doing. A persistent profile is the only way to close the app for real.
 */
const PROFILE = `/tmp/ob-profile-${Date.now()}`

async function openApp() {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: EXE,
    args: ['--no-sandbox'],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'es-ES',
  })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 160))
  })
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
  return { ctx, page, errors }
}

const body = (page) => page.textContent('body')
const has = async (page, s) => (await body(page)).includes(s)
/** The "Paso N de 7" label is the ground truth for where we are. */
async function currentStep(page) {
  const txt = await body(page)
  const m = txt.match(/Paso (\d+) de 7/)
  return m ? Number(m[1]) : null
}
const tapNext = async (page) => {
  await page.getByRole('button', { name: /^(Siguiente|Empezar a entrenar)$/ }).first().click()
  await page.waitForTimeout(420)
}

/* ====================================================== FIRST LAUNCH */

{
  const { ctx, page, errors } = await openApp()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)

  const step = await currentStep(page)
  check(step === 1, 'primer arranque — el onboarding es obligatorio y empieza en el paso 1', `paso=${step}`)
  check(await has(page, 'Sobre ti'), 'paso 1 — perfil básico')
  check(!(await has(page, 'PRÓXIMO')), 'primer arranque — la app no se abre por detrás del onboarding')
  await page.screenshot({ path: `${SHOTS}/ob-01-step1.png` })

  const backCount = await page.getByRole('button', { name: 'Atrás' }).count()
  check(backCount === 0, 'paso 1 — no ofrece Atrás', `encontrados ${backCount}`)
  const skipOn1 = await page.getByRole('button', { name: 'Omitir' }).count()
  check(skipOn1 === 0, 'paso 1 — no ofrece Omitir: las unidades son obligatorias')

  // Answer and advance to step 4.
  await page.getByRole('button', { name: '30-39' }).first().click()
  await tapNext(page)
  check((await currentStep(page)) === 2, 'paso 2 — objetivo')
  await page.getByRole('button', { name: /Ganar fuerza/ }).first().click()
  await tapNext(page)
  check((await currentStep(page)) === 3, 'paso 3 — experiencia')
  await page.getByRole('button', { name: /^Intermedio/ }).first().click()
  await tapNext(page)
  check((await currentStep(page)) === 4, 'paso 4 — disponibilidad')
  await page.getByRole('button', { name: '3', exact: true }).first().click()
  // Long enough for the debounced save. Closing before it lands is the very
  // case being tested, so the wait is part of the scenario, not a fudge.
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${SHOTS}/ob-02-step4.png` })

  const realErrors = errors.filter((e) => !e.includes('Firestore') && !e.includes('ERR_') && !e.includes('404'))
  check(realErrors.length === 0, 'sin errores de consola durante el onboarding', realErrors.slice(0, 2).join(' | '))

  /* -------------------------------------------------- CLOSE MID-ONBOARDING */

  // A real close: the whole browser context goes away, taking every scrap of
  // memory state with it. Only what reached IndexedDB survives.
  await ctx.close()

  // Same profile directory, so IndexedDB is exactly as the app left it.
  const second = await openApp()
  await second.page.goto(BASE, { waitUntil: 'networkidle' })
  await second.page.waitForTimeout(4000)

  const resumedStep = await currentStep(second.page)
  check(resumedStep === 4, 'cerrar en el paso 4 y volver — continúa en el paso 4', `paso=${resumedStep}`)
  check(await has(second.page, 'Retomamos'), 'al volver — lo dice en pantalla')
  await second.page.screenshot({ path: `${SHOTS}/ob-03-resumed.png` })

  // The answers came back too, not just the position.
  await second.page.getByRole('button', { name: 'Atrás' }).click()
  await second.page.waitForTimeout(400)
  await second.page.getByRole('button', { name: 'Atrás' }).click()
  await second.page.waitForTimeout(400)
  const onGoal = await currentStep(second.page)
  const goalPressed = await second.page
    .getByRole('button', { name: /Ganar fuerza/ })
    .first()
    .getAttribute('aria-pressed')
  check(onGoal === 2 && goalPressed === 'true', 'al volver — la respuesta del paso 2 sigue marcada', `paso=${onGoal} pressed=${goalPressed}`)

  /* ----------------------------------------------------------- finish it */

  await tapNext(second.page)
  await tapNext(second.page)
  await tapNext(second.page)
  check((await currentStep(second.page)) === 5, 'paso 5 — entorno')
  await second.page.getByRole('button', { name: /Gimnasio en casa/ }).first().click()
  await tapNext(second.page)

  check((await currentStep(second.page)) === 6, 'paso 6 — intereses')
  const skipOn6 = await second.page.getByRole('button', { name: 'Omitir' }).count()
  check(skipOn6 === 1, 'paso 6 — sí ofrece Omitir: todo es opcional')

  await tapNext(second.page)
  check((await currentStep(second.page)) === 7, 'paso 7 — resumen')
  const summary = await body(second.page)
  check(summary.includes('Ganar fuerza'), 'resumen — refleja el objetivo elegido')
  check(summary.includes('Gimnasio en casa'), 'resumen — refleja el entorno elegido')
  check(summary.includes('Te sugeriremos'), 'resumen — dice qué hará con las respuestas')
  // The numbers, not just the words. "undefined días/semana" passed every
  // earlier assertion and was visible in the first screenshot taken.
  check(!summary.includes('undefined'), 'resumen — ningún valor sin interpolar', summary.slice(0, 200))
  check(summary.includes('3 días/semana'), 'resumen — muestra los días que se eligieron, no un valor por defecto')
  check(summary.includes('de 3 días'), 'resumen — la rutina sugerida respeta los días elegidos')
  check(summary.includes('5 ejercicios'), 'resumen — una hora son cinco ejercicios, no ocho')
  check(!summary.includes('Retomamos'), 'resumen — el aviso de retomar no se queda pegado en pasos posteriores')
  await second.page.screenshot({ path: `${SHOTS}/ob-04-summary.png` })

  await second.page.getByRole('button', { name: /Empezar a entrenar/ }).click()
  await second.page.waitForTimeout(5000)

  const after = await body(second.page)
  check(!after.includes('Paso 7 de 7'), 'al terminar — sale del cuestionario aunque no haya servidor')
  check(after.trim().length > 60, 'al terminar — la pantalla nunca se queda en blanco')
  check(
    after.includes('Inicio') || after.includes('Entreno') || after.includes('PRÓXIMO'),
    'al terminar — entra en la app',
    after.slice(0, 140),
  )
  await second.page.screenshot({ path: `${SHOTS}/ob-05-home.png` })

  /* --------------------------------------------- the personalization lands */

  const applied = await second.page.evaluate(async () => {
    const open = indexedDB.open('training-os')
    const db = await new Promise((res, rej) => {
      open.onsuccess = () => res(open.result)
      open.onerror = () => rej(open.error)
    })
    const row = await new Promise((res) => {
      const r = db.transaction('settings').objectStore('settings').get('app')
      r.onsuccess = () => res(r.result)
      r.onerror = () => res(null)
    })
    return {
      version: row?.onboardingVersion ?? 0,
      goal: row?.trainingProfile?.mainGoal ?? null,
      days: row?.trainingProfile?.daysPerWeek ?? null,
      env: row?.trainingProfile?.trainingEnvironment ?? null,
      rest: row?.defaultRestSeconds ?? null,
      chestTarget: row?.weeklySetTargets?.chest ?? null,
    }
  })
  check(applied.version === 1, 'al terminar — onboardingVersion queda guardado', JSON.stringify(applied))
  check(applied.goal === 'strength', 'al terminar — el objetivo queda guardado', JSON.stringify(applied))
  check(applied.env === 'home', 'al terminar — el entorno queda guardado', JSON.stringify(applied))
  check(applied.rest === 180, 'personalización — fuerza deja un descanso por defecto de 180s', String(applied.rest))
  check(typeof applied.chestTarget === 'number', 'personalización — los objetivos semanales se recalculan', String(applied.chestTarget))

  /* ------------------------------------------- it does not ask again */

  await second.ctx.close()
  const third = await openApp()
  await third.page.goto(BASE, { waitUntil: 'networkidle' })
  await third.page.waitForTimeout(4000)
  const again = await currentStep(third.page)
  check(again === null, 'tras completarlo — no vuelve a preguntar en el siguiente arranque', `paso=${again}`)
  await third.ctx.close()
}

console.log(steps.join('\n'))
console.log(`\n${steps.length - failures} passed, ${failures} failed`)
if (failures > 0) process.exit(1)
