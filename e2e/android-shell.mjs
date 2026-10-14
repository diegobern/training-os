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

import { CHROMIUM_EXE as EXE } from './chromium.mjs'
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

/* ========================== 4. aviso de entrenamiento en curso (Android) */

/*
 * El mismo Android emulado, pero esta vez con un plugin nativo que CONTESTA:
 * el de `WorkoutNotificationPlugin.java`, declarado en `PluginHeaders` y
 * atendido por `nativePromise` / `nativeCallback`, que es exactamente la
 * superficie que inyecta el WebView de Capacitor y la que usa
 * @capacitor/core. Así se ejercita el código web real del aviso.
 *
 * `window.__notif` registra cada llamada y deja elegir la respuesta: permiso
 * concedido o denegado, alarma exacta sí o no, o un plugin que falla en todo.
 * La háptica se apunta aparte (`haptics`): cada botón vibra, y mezclada con
 * el resto no dejaría ver en qué orden llegan `start`, `stop` y los avisos.
 */
const FAKE_ANDROID_WITH_NOTICE = (scenario) => {
  window.androidBridge = { postMessage: () => {} }
  /*
   * Lo que en el teléfono sobrevive a cerrar y abrir la app — el permiso que
   * ya se concedió y, para la prueba, el registro de llamadas — se guarda en
   * sessionStorage, porque cada `page.goto` vuelve a cargar la página y este
   * script se ejecuta otra vez desde cero.
   */
  const KEY = '__notif-state'
  const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
  const state = (window.__notif = { tap: null, exactAlarms: true, ...scenario, calls: [], haptics: [], ...(saved ?? {}) })
  const persist = () =>
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ permission: state.permission, exactAlarms: state.exactAlarms, calls: state.calls, haptics: state.haptics }),
    )
  const record = (entry) => {
    state.calls.push(entry)
    persist()
  }
  /*
   * Un toque en la notificación con la app cerrada: el plugin de verdad lo
   * guarda y lo entrega en cuanto alguien escucha `open`, antes incluso de
   * que la app haya leído la sesión. Se deja preparado con
   * sessionStorage['__notif-tap'] antes de recargar.
   */
  const heldTap = sessionStorage.getItem('__notif-tap')
  sessionStorage.removeItem('__notif-tap')
  window.Capacitor = {
    platform: 'android',
    isNative: true,
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    Plugins: {},
    PluginHeaders: [
      {
        name: 'WorkoutNotification',
        methods: [
          { name: 'start', rtype: 'promise' },
          { name: 'stop', rtype: 'promise' },
          { name: 'scheduleRestAlert', rtype: 'promise' },
          { name: 'cancelRestAlert', rtype: 'promise' },
          { name: 'haptic', rtype: 'promise' },
          { name: 'isSupported', rtype: 'promise' },
          { name: 'checkPermissions', rtype: 'promise' },
          { name: 'requestPermissions', rtype: 'promise' },
          { name: 'requestExactAlarm', rtype: 'promise' },
          { name: 'addListener', rtype: 'callback' },
          { name: 'removeListener', rtype: 'promise' },
        ],
      },
    ],
    nativePromise: (plugin, method, options = {}) => {
      if (plugin !== 'WorkoutNotification') return Promise.reject(new Error(`sin nativo: ${plugin}`))
      if (method === 'haptic') {
        state.haptics.push(options.kind)
        persist()
        return state.broken ? Promise.reject(new Error('plugin roto a propósito')) : Promise.resolve({})
      }
      record({ method, options, at: Date.now() })
      if (state.broken) return Promise.reject(new Error('plugin roto a propósito'))
      if (method === 'checkPermissions') return Promise.resolve({ display: state.permission })
      if (method === 'requestPermissions') {
        state.permission = state.afterRequest
        persist()
        return Promise.resolve({ display: state.permission })
      }
      if (method === 'start') return Promise.resolve({ shown: true })
      if (method === 'scheduleRestAlert') return Promise.resolve({ scheduled: true, exact: state.exactAlarms })
      if (method === 'cancelRestAlert') return Promise.resolve({ delivered: false })
      if (method === 'isSupported') return Promise.resolve({ presence: true, restAlerts: true, exactAlarms: state.exactAlarms })
      if (method === 'requestExactAlarm') {
        state.exactAlarms = true
        persist()
        return Promise.resolve({ exactAlarms: true })
      }
      return Promise.resolve({})
    },
    nativeCallback: (plugin, method, options, callback) => {
      record({ method, options, at: Date.now() })
      if (plugin === 'WorkoutNotification' && method === 'addListener' && options?.eventName === 'open') {
        state.tap = callback
        if (heldTap !== null) setTimeout(() => callback(JSON.parse(heldTap)), 0)
      }
      return 'cb-' + state.calls.length
    },
  }
}

async function freshProfile(page) {
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
  await page.reload({ waitUntil: 'commit' })
  await page.waitForTimeout(3500)
}

async function startFreeWorkout(page) {
  await page.goto(`${BASE}/workout`, { waitUntil: 'commit' })
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /Entrenamiento libre/ }).first().click()
  await page.waitForTimeout(2500)
}

async function discardFromWorkoutScreen(page) {
  await page.goto(`${BASE}/workout`, { waitUntil: 'commit' })
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: 'DESCARTAR' }).first().click()
  await page.waitForTimeout(600)
  await page.locator('[role="dialog"]').getByRole('button', { name: 'DESCARTAR' }).click()
  await page.waitForTimeout(1500)
}

const noticeCalls = (page) => page.evaluate(() => window.__notif.calls.map((c) => c.method))
const startCalls = (page) => page.evaluate(() => window.__notif.calls.filter((c) => c.method === 'start').map((c) => c.options))

/* --- 4a. permiso concedido: el camino normal ------------------------------ */
{
  const ctx = await browser.newContext(device)
  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.addInitScript(FAKE_ANDROID_WITH_NOTICE, { permission: 'prompt', afterRequest: 'granted' })
  await freshProfile(page)

  const atOpen = await noticeCalls(page)
  check(
    !atOpen.includes('requestPermissions') && !atOpen.includes('start'),
    'aviso — abrir la app NO pide el permiso de notificaciones',
    atOpen.join(', '),
  )

  await startFreeWorkout(page)
  const afterStart = await noticeCalls(page)
  const ask = afterStart.indexOf('requestPermissions')
  const first = afterStart.indexOf('start')
  check(ask !== -1, 'aviso — el permiso se pide al empezar el primer entrenamiento', afterStart.join(', '))
  check(first > ask, 'aviso — y con el permiso concedido se publica el aviso', afterStart.join(', '))

  const sessionStart = await page.evaluate(async () => {
    const db = await new Promise((r) => {
      const q = indexedDB.open('training-os')
      q.onsuccess = () => r(q.result)
    })
    const all = await new Promise((r) => {
      const q = db.transaction('sessions').objectStore('sessions').getAll()
      q.onsuccess = () => r(q.result)
    })
    const active = all.find((s) => s.status === 'active' && !s.deletedAt)
    return active ? active.startedAt + active.pausedMs : null
  })
  const [published] = await startCalls(page)
  check(
    !!published && published.startedAt === sessionStart,
    'aviso — el cronómetro nativo arranca a la misma hora que el de la app',
    `${published?.startedAt} vs ${sessionStart}`,
  )
  check(published?.title === 'Entrenamiento en curso', 'aviso — título en el idioma de la app', published?.title)
  check(
    published?.channelName === 'Entrenamiento en curso' && /pantalla de bloqueo/.test(published?.channelDescription ?? ''),
    'aviso — el canal de Ajustes del sistema también en el idioma de la app',
    `${published?.channelName} · ${published?.channelDescription}`,
  )
  check(/Entrenamiento libre · 0 de 0 series/.test(published?.body ?? ''), 'aviso — dice qué día y cuántas series', published?.body)

  // Tocar el aviso con la app en otra pantalla vuelve a la sesión.
  await page.goto(`${BASE}/progress`, { waitUntil: 'commit' })
  await page.waitForTimeout(3000)
  const tapped = await page.evaluate(() => {
    if (!window.__notif.tap) return false
    window.__notif.tap({})
    return true
  })
  await page.waitForTimeout(1500)
  check(tapped, 'aviso — la app escucha el toque en la notificación')
  check(page.url().endsWith('/workout/active'), 'aviso — tocarlo abre la app en la sesión', page.url())

  // Moving around inside the app must not keep tearing the listener down and
  // putting it back: each of those is a call across the bridge.
  const listenerCalls = async () => (await noticeCalls(page)).filter((m) => m === 'addListener' || m === 'removeListener').length
  const beforeMoving = await listenerCalls()
  await page.getByRole('button', { name: 'Volver' }).first().click()
  await page.waitForTimeout(1200)
  await page.getByRole('link', { name: 'Rutinas' }).first().click()
  await page.waitForTimeout(1200)
  await page.getByRole('link', { name: 'Progreso' }).first().click()
  await page.waitForTimeout(1200)
  check(
    (await listenerCalls()) === beforeMoving,
    'aviso — cambiar de pantalla no vuelve a registrar el oyente del toque',
    `${beforeMoving} → ${await listenerCalls()}`,
  )

  await discardFromWorkoutScreen(page)
  const afterDiscard = await noticeCalls(page)
  check(afterDiscard.at(-1) === 'stop', 'aviso — al descartar el entrenamiento se retira solo', afterDiscard.slice(-4).join(', '))

  await startFreeWorkout(page)
  const second = (await noticeCalls(page)).slice(afterDiscard.length)
  check(
    !second.includes('requestPermissions') && second.includes('start'),
    'aviso — el segundo entrenamiento no vuelve a preguntar y publica el aviso',
    second.join(', '),
  )
  // Finishing through the confirmation also retires it.
  await page.getByRole('button', { name: 'Hecho', exact: true }).click()
  await page.waitForTimeout(700)
  await page.locator('[role="dialog"]').getByRole('button', { name: 'DESCARTAR' }).click()
  await page.waitForTimeout(1500)
  check((await noticeCalls(page)).at(-1) === 'stop', 'aviso — al terminar desde la sesión también se retira')

  check(pageErrors.length === 0, 'aviso — sin errores sin capturar', pageErrors.join(' · '))
  await ctx.close()
}

/* --- 4b. permiso denegado: la app sigue igual ----------------------------- */
{
  const ctx = await browser.newContext(device)
  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.addInitScript(FAKE_ANDROID_WITH_NOTICE, { permission: 'prompt', afterRequest: 'denied' })
  await freshProfile(page)
  await startFreeWorkout(page)

  const calls = await noticeCalls(page)
  check(calls.includes('requestPermissions') && !calls.includes('start'), 'denegado — sin permiso no se publica nada', calls.join(', '))
  check(page.url().endsWith('/workout/active'), 'denegado — el entrenamiento empieza igual', page.url())
  const header = (await page.locator('header').first().textContent()) ?? ''
  check(/\d{2}:\d{2}/.test(header), 'denegado — y el cronómetro de la app funciona', header.slice(0, 60))
  await discardFromWorkoutScreen(page)
  check(new URL(page.url()).pathname === '/workout', 'denegado — y se puede terminar con normalidad', page.url())
  check(pageErrors.length === 0, 'denegado — sin errores sin capturar', pageErrors.join(' · '))
  await ctx.close()
}

/* --- 4c. el plugin falla en todo: la app sigue igual ---------------------- */
{
  const ctx = await browser.newContext(device)
  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.addInitScript(FAKE_ANDROID_WITH_NOTICE, { permission: 'granted', broken: true })
  await freshProfile(page)
  await startFreeWorkout(page)
  check(page.url().endsWith('/workout/active'), 'plugin roto — el entrenamiento empieza igual', page.url())
  await page.getByRole('button', { name: 'Hecho', exact: true }).click()
  await page.waitForTimeout(700)
  check((await page.locator('[role="dialog"]').count()) === 1, 'plugin roto — la sesión responde con normalidad')
  await page.locator('[role="dialog"]').getByRole('button', { name: 'DESCARTAR' }).click()
  await page.waitForTimeout(1500)
  check(pageErrors.length === 0, 'plugin roto — sin errores sin capturar', pageErrors.join(' · '))
  await ctx.close()
}

/* --- 4d. en inglés, el aviso en inglés ------------------------------------ */
{
  const ctx = await browser.newContext({ ...device, locale: 'en-GB' })
  const page = await ctx.newPage()
  await page.addInitScript(FAKE_ANDROID_WITH_NOTICE, { permission: 'granted' })
  await freshProfile(page)
  await page.evaluate(async () => {
    const db = await new Promise((r) => {
      const q = indexedDB.open('training-os')
      q.onsuccess = () => r(q.result)
    })
    const row = await new Promise((r) => {
      const q = db.transaction('settings').objectStore('settings').get('app')
      q.onsuccess = () => r(q.result)
    })
    row.language = 'en'
    await new Promise((r) => {
      const q = db.transaction('settings', 'readwrite').objectStore('settings').put(row)
      q.onsuccess = () => r()
    })
  })
  await page.reload({ waitUntil: 'commit' })
  await page.waitForTimeout(3500)
  await page.goto(`${BASE}/workout`, { waitUntil: 'commit' })
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /Free workout|Entrenamiento libre/ }).first().click()
  await page.waitForTimeout(2500)
  const [published] = await startCalls(page)
  check(published?.title === 'Workout in progress', 'idioma — con la app en inglés, el aviso en inglés', published?.title)
  check(
    published?.channelName === 'Workout in progress' && !/[áéíóúñ]|entrenamiento/i.test(`${published?.body} ${published?.channelDescription}`),
    'idioma — y nada del aviso en español (texto, canal y descripción)',
    `${published?.body} · ${published?.channelName} · ${published?.channelDescription}`,
  )
  await ctx.close()
}

/* --- 4f. descanso: aviso de «Descanso terminado» y alarma exacta --------- */
/*
 * Un descanso de verdad: se marca una serie de un ejercicio con carga y el
 * descanso empieza solo. La notificación pasa a cuenta atrás, el aviso se
 * programa a la misma hora y, como este teléfono no tiene alarma exacta, la
 * hoja que lo explica sale una vez (sin bloquear: el aviso ya está puesto).
 */
const sinceMark = (page, n) => page.evaluate((from) => window.__notif.calls.slice(from), n)

async function addLoadedExercise(page, query) {
  await page.getByRole('button', { name: /Añadir ejercicio/ }).first().click()
  await page.waitForTimeout(2500)
  const picker = page.locator('div.fixed.inset-0.z-50')
  await picker.getByPlaceholder('Buscar').fill(query)
  await page.waitForTimeout(2200)
  await picker.locator('li').first().locator('button').first().click()
  await page.waitForTimeout(2500)
}

async function logSet(page, index) {
  await page.locator('input[aria-label="Peso"]').nth(index).fill('60')
  await page.locator('input[aria-label="Repeticiones"]').nth(index).fill('8')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: `Serie ${index + 1} completada`, exact: true }).click()
  await page.waitForTimeout(1500)
}

{
  const ctx = await browser.newContext(device)
  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.addInitScript(FAKE_ANDROID_WITH_NOTICE, { permission: 'granted', exactAlarms: false })
  await freshProfile(page)
  await startFreeWorkout(page)
  await addLoadedExercise(page, 'press banca')

  let mark = (await noticeCalls(page)).length
  await logSet(page, 0)
  let since = await sinceMark(page, mark)
  const withRest = since.filter((c) => c.method === 'start').at(-1)?.options
  const alert = since.find((c) => c.method === 'scheduleRestAlert')?.options
  check(
    typeof withRest?.rest?.endsAt === 'number' && withRest.rest.endsAt > Date.now() && withRest.rest.paused === false,
    'descanso — la notificación pasa a cuenta atrás con la hora de fin',
    JSON.stringify(withRest?.rest),
  )
  check(/^Serie 2 de \d+$/.test(withRest?.setLabel ?? ''), 'descanso — y dice qué serie toca', withRest?.setLabel)
  check(
    /^Descanso · hasta \d{2}:\d{2}$/.test(withRest?.labels?.restUntil ?? ''),
    'descanso — con «Descanso · hasta HH:MM» por si la alarma no es exacta',
    withRest?.labels?.restUntil,
  )
  check(
    !!alert && alert.at === withRest?.rest?.endsAt,
    'descanso — el aviso se programa a la misma hora que acaba',
    `${alert?.at} vs ${withRest?.rest?.endsAt}`,
  )
  check(
    alert?.title === 'Descanso terminado' && /^Siguiente serie: \S/.test(alert?.body ?? ''),
    'descanso — título y texto del aviso en español',
    `${alert?.title} · ${alert?.body}`,
  )
  check(
    alert?.channelName === 'Fin del descanso' && alert?.channelDescription === 'Avisa cuando termina el descanso entre series.',
    'descanso — el canal del aviso también en español',
    `${alert?.channelName} · ${alert?.channelDescription}`,
  )
  check(alert?.sound === true && alert?.vibrate === true, 'descanso — con sonido y vibración según los ajustes', `${alert?.sound}/${alert?.vibrate}`)

  // La alarma exacta: la hoja sale una vez, con el aviso ya programado.
  const sheet = page.locator('[role="dialog"]').filter({ hasText: 'Avisos de descanso a su hora' })
  await sheet.waitFor({ timeout: 4000 }).catch(() => {})
  check(await sheet.isVisible(), 'alarma exacta — el primer descanso sin el permiso lo explica')
  check(!!alert, 'alarma exacta — sin bloquear: el aviso ya estaba programado (aproximado) antes de contestar')
  const asked = await page.evaluate(() => localStorage.getItem('training-os:exact-alarm-asked'))
  check(asked === '1', 'alarma exacta — se apunta que ya se preguntó', String(asked))
  mark = (await noticeCalls(page)).length
  await sheet.getByRole('button', { name: 'Activar en Ajustes' }).click()
  await page.waitForTimeout(1500)
  since = (await sinceMark(page, mark)).map((c) => c.method)
  check(
    since[0] === 'requestExactAlarm' && since.includes('scheduleRestAlert'),
    'alarma exacta — concedida, el descanso en curso se reprograma (ahora exacto)',
    since.join(', '),
  )
  check(!(await sheet.isVisible()), 'alarma exacta — y la hoja se cierra')

  const restBar = page.locator('div.fixed[role="timer"]')
  mark = (await noticeCalls(page)).length
  await restBar.getByRole('button', { name: 'Pausa' }).click()
  await page.waitForTimeout(1200)
  since = await sinceMark(page, mark)
  check(since.some((c) => c.method === 'cancelRestAlert'), 'descanso — pausar cancela el aviso', since.map((c) => c.method).join(', '))
  check(
    since.filter((c) => c.method === 'start').at(-1)?.options?.rest?.paused === true,
    'descanso — y la notificación lo enseña en pausa',
  )

  mark = (await noticeCalls(page)).length
  await restBar.getByRole('button', { name: 'Seguir' }).click()
  await page.waitForTimeout(1200)
  since = await sinceMark(page, mark)
  check(since.some((c) => c.method === 'scheduleRestAlert'), 'descanso — reanudar lo vuelve a programar', since.map((c) => c.method).join(', '))

  mark = (await noticeCalls(page)).length
  await restBar.getByRole('button', { name: 'Saltar' }).click()
  await page.waitForTimeout(1200)
  since = await sinceMark(page, mark)
  check(since.some((c) => c.method === 'cancelRestAlert'), 'descanso — saltarlo cancela el aviso', since.map((c) => c.method).join(', '))
  check(
    since.filter((c) => c.method === 'start').at(-1)?.options?.rest === null,
    'descanso — y la notificación vuelve al cronómetro del entrenamiento',
  )

  // Segundo descanso: se programa, y la hoja ya no vuelve a salir.
  mark = (await noticeCalls(page)).length
  await logSet(page, 1)
  since = (await sinceMark(page, mark)).map((c) => c.method)
  check(since.includes('scheduleRestAlert'), 'descanso — la segunda serie programa otro aviso', since.join(', '))
  check(!(await sheet.isVisible()), 'alarma exacta — la hoja no vuelve a salir')

  // Descartar a mitad del descanso, sin recargar (el descanso vive en memoria):
  // lo último que recibe el nativo es stop, que ya cancela el aviso.
  await page.getByRole('button', { name: 'Volver' }).first().click()
  await page.waitForTimeout(1200)
  await page.getByRole('link', { name: 'Entreno' }).first().click()
  await page.waitForTimeout(1500)
  mark = (await noticeCalls(page)).length
  await page.getByRole('button', { name: 'DESCARTAR' }).first().click()
  await page.waitForTimeout(600)
  await page.locator('[role="dialog"]').getByRole('button', { name: 'DESCARTAR' }).click()
  await page.waitForTimeout(1500)
  since = (await sinceMark(page, mark)).map((c) => c.method)
  check(
    since.at(-1) === 'stop' && !since.includes('cancelRestAlert'),
    'descanso — descartar a mitad del descanso: lo último que llega es stop',
    since.join(', '),
  )

  // Un toque en la notificación con la app cerrada llega antes de que se lea
  // la sesión: se guarda y, leída, lleva a la sesión en curso.
  await startFreeWorkout(page)
  await page.goto(`${BASE}/progress`, { waitUntil: 'commit' })
  await page.waitForTimeout(2500)
  await page.evaluate(() => sessionStorage.setItem('__notif-tap', '{}'))
  await page.reload({ waitUntil: 'commit' })
  await page.waitForTimeout(4000)
  check(page.url().endsWith('/workout/active'), 'toque — en frío, antes de leer la sesión, acaba en la sesión en curso', page.url())

  const haptics = await page.evaluate(() => window.__notif.haptics)
  check(
    haptics.length > 0 && haptics.every((k) => ['tick', 'success', 'pr', 'warn'].includes(k)),
    'háptica — la vibración la da el nativo',
    haptics.slice(0, 6).join(', '),
  )

  await discardFromWorkoutScreen(page)
  check(pageErrors.length === 0, 'descanso — sin errores sin capturar', pageErrors.join(' · '))
  await ctx.close()
}

/* --- 4e. en web: nada de esto existe ------------------------------------- */
{
  const ctx = await browser.newContext(device)
  const page = await ctx.newPage()
  const requested = []
  page.on('request', (r) => requested.push(r.url()))
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await freshProfile(page)
  await startFreeWorkout(page)
  await discardFromWorkoutScreen(page)
  check(
    !requested.some((u) => /\/assets\/native-.*\.js/.test(u)),
    'web — empezar y terminar un entrenamiento no descarga el puente de Capacitor',
  )
  check(pageErrors.length === 0, 'web — el aviso es un no-op silencioso', pageErrors.join(' · '))
  await ctx.close()
}

await browser.close()

console.log(out.join('\n'))
console.log(`\n${out.length - failures} passed, ${failures} failed`)
if (failures > 0) process.exit(1)
