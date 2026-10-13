/**
 * Lo que cambia cuando la aplicación corre dentro del APK.
 *
 * No hay emulador de Android en este entorno, así que no se puede probar el
 * APK de verdad. Lo que sí se puede probar — y es donde está el riesgo real —
 * son las tres decisiones que toma el propio código web cuando detecta que
 * está dentro de Capacitor:
 *
 *   1. NO registrar el service worker. Si esto se rompiera, una app
 *      actualizada desde Google Play seguiría ejecutando la versión anterior
 *      servida desde la Cache Storage, sin que nada fallara de forma visible.
 *      Es el fallo más caro de los tres y el más silencioso.
 *   2. NO descargar el puente de Capacitor en un navegador normal.
 *   3. NO dejar que un enlace externo se abra DENTRO del WebView.
 *
 * El truco es inyectar el objeto global `Capacitor` antes de que se ejecute
 * el bundle, que es exactamente lo que hace el WebView real. El puente nativo
 * no existe, claro, así que los plugins fallan al cargar: eso también se
 * comprueba aquí, porque la aplicación tiene que seguir en pie igualmente.
 *
 * Requiere un servidor sirviendo el build en BASE (por defecto :4330).
 */
import { chromium } from 'playwright'

const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'
const BASE = process.env.BASE || 'http://127.0.0.1:4330'

const out = []
let failures = 0
const check = (cond, msg, detail) => {
  if (cond) out.push('PASS  ' + msg)
  else {
    failures++
    out.push('FAIL  ' + msg + (detail ? `\n      ${detail}` : ''))
  }
}

const FAKE_ANDROID = () => {
  /*
   * Emula lo que el WebView de Capacitor inyecta ANTES de que se ejecute el
   * bundle: el puente `androidBridge` y un objeto `Capacitor` inicial.
   *
   * Los dos hacen falta y por razones distintas. `window.Capacitor` es lo que
   * lee `src/lib/native/platform.ts` sin importar nada, y sin él la aplicación
   * se creería web desde el primer instante. `window.androidBridge` es lo que
   * mira `@capacitor/core` cuando se carga: ese módulo **muta el objeto
   * `Capacitor` que ya existe** y le reescribe `isNativePlatform`, así que si
   * el puente no estuviera, la app empezaría creyéndose Android y a mitad de
   * arranque pasaría a creerse web. Justamente el tipo de incoherencia que
   * esta prueba busca.
   *
   * El puente no lleva a ninguna parte: los plugins mandan mensajes que nadie
   * contesta. Eso está bien, porque prueba que la aplicación no depende de
   * que respondan.
   */
  window.androidBridge = { postMessage: () => {} }
  window.Capacitor = {
    platform: 'android',
    isNative: true,
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    Plugins: {},
  }
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })

const device = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  locale: 'es-ES',
}

/* ============================================================ 1. nativo */

{
  const ctx = await browser.newContext(device)
  const page = await ctx.newPage()

  const requested = []
  page.on('request', (r) => requested.push(r.url()))
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await page.addInitScript(FAKE_ANDROID)
  await page.goto(BASE, { waitUntil: 'commit' })

  // El registro del service worker está retrasado 2,5 s desde la carga; se
  // espera de sobra para que hubiera dado tiempo a registrarse.
  await page.waitForTimeout(6000)

  const seenAsNative = await page.evaluate(() => window.Capacitor?.isNativePlatform?.() === true)
  check(seenAsNative, 'nativo — la página se ve a sí misma como Android')

  const swCount = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return -1
    const regs = await navigator.serviceWorker.getRegistrations()
    return regs.length
  })
  check(swCount === 0, 'nativo — NO se registra ningún service worker', `registros: ${swCount}`)

  const askedForSw = requested.some((u) => /\/sw\.js|workbox-/.test(u))
  check(!askedForSw, 'nativo — ni siquiera se pide /sw.js')

  check(
    pageErrors.length === 0,
    'nativo — sin errores sin capturar aunque el puente nativo no exista',
    pageErrors.join(' · '),
  )

  const painted = await page.evaluate(() => (document.body.innerText || '').trim().length > 0)
  check(painted, 'nativo — la aplicación arranca y pinta')

  await ctx.close()
}

/* =============================================================== 2. web */

{
  const ctx = await browser.newContext(device)
  const page = await ctx.newPage()

  const requested = []
  page.on('request', (r) => requested.push(r.url()))

  await page.goto(BASE, { waitUntil: 'commit' })
  await page.waitForTimeout(6000)

  const swCount = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations()
    return regs.length
  })
  check(swCount > 0, 'web — el service worker SÍ se registra, como siempre', `registros: ${swCount}`)

  const askedForBridge = requested.some((u) => /\/assets\/native-.*\.js/.test(u))
  check(!askedForBridge, 'web — el navegador no llega a descargar el puente de Capacitor')

  await ctx.close()
}

/* ================================================= 3. enlaces externos */

{
  const ctx = await browser.newContext(device)
  const page = await ctx.newPage()
  await page.addInitScript(FAKE_ANDROID)

  // La pantalla de atribuciones es donde viven los seis enlaces que salen de
  // la app. Se bloquea la red hacia fuera: si algo intentara navegar de
  // verdad, se vería aquí.
  const outbound = []
  await page.route('**://github.com/**', (route) => {
    outbound.push(route.request().url())
    return route.abort()
  })
  await page.route('**://creativecommons.org/**', (route) => {
    outbound.push(route.request().url())
    return route.abort()
  })

  // El cuestionario inicial es obligatorio en un perfil nuevo y tapa
  // cualquier ruta, así que primero se da por respondido — igual que hace
  // e2e/stale-cache.mjs — y luego se navega.
  await page.goto(BASE, { waitUntil: 'commit' })
  await page.waitForTimeout(3500)
  await page.evaluate(async () => {
    const db = await new Promise((r) => {
      const q = indexedDB.open('training-os')
      q.onsuccess = () => r(q.result)
    })
    const row = await new Promise((r) => {
      const q = db.transaction('settings').objectStore('settings').get('app')
      q.onsuccess = () => r(q.result)
    })
    if (!row) return
    row.onboardingVersion = 1
    await new Promise((r) => {
      const q = db.transaction('settings', 'readwrite').objectStore('settings').put(row)
      q.onsuccess = () => r()
    })
  })

  await page.goto(`${BASE}/attributions`, { waitUntil: 'commit' })
  await page.waitForTimeout(4000)

  const link = page.locator('a[href^="https://github.com/"]').first()
  const found = (await link.count()) > 0
  check(found, 'enlaces — la pantalla de atribuciones tiene enlaces externos')

  if (found) {
    const before = page.url()
    const pagesBefore = ctx.pages().length
    await link.click({ force: true })
    await page.waitForTimeout(1500)

    check(page.url() === before, 'enlaces — pulsar no saca al usuario de la app', `${before} → ${page.url()}`)
    check(
      ctx.pages().length === pagesBefore,
      'enlaces — no se abre una vista encima sin forma de volver',
      `${pagesBefore} → ${ctx.pages().length}`,
    )
    check(outbound.length === 0, 'enlaces — no se pide la página externa dentro del WebView', outbound.join(' · '))
  }

  await ctx.close()
}

await browser.close()

console.log(out.join('\n'))
console.log(`\n${out.length - failures} passed, ${failures} failed`)
if (failures > 0) process.exit(1)
