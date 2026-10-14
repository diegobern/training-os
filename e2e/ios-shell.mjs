/**
 * Lo que cambia cuando la aplicación corre dentro de la app de iPhone.
 *
 * No hay simulador de iOS en este entorno (ni Mac), así que no se puede probar
 * la app de verdad. Lo que sí se puede probar es lo que decide el propio
 * código web cuando se ve dentro de Capacitor en iOS:
 *
 *   1. NO registrar el service worker (igual que en Android).
 *   2. Retirar la pantalla de arranque y pintar la barra de estado SÓLO con
 *      `setStyle` (`setBackgroundColor` y `setOverlaysWebView` son de Android).
 *   3. NO enseñar «Compartir → Añadir a pantalla de inicio» dentro de la app.
 *   4. NO dejar que un enlace externo se abra dentro del WebView.
 *   5. La Live Activity: se pide al empezar el primer entrenamiento aunque el
 *      permiso de notificaciones se deniegue (no lo necesita); el aviso de
 *      descanso, en cambio, sólo con ese permiso. Todo en el idioma de la app.
 *   6. Tocar la Live Activity lleva a la sesión en curso; un id desconocido, al
 *      inicio.
 *   7. Deslizar para volver con una hoja abierta cierra la hoja y se queda.
 *
 * El truco es el mismo que en e2e/android-shell.mjs: inyectar ANTES del
 * bundle lo que inyecta el WKWebView de Capacitor — `webkit.messageHandlers
 * .bridge` (que es lo que mira @capacitor/core para decidir que es iOS) y un
 * `Capacitor` con `PluginHeaders`, `nativePromise` y `nativeCallback` — con
 * un plugin falso que contesta y apunta cada llamada.
 *
 * Requiere un servidor sirviendo un build local-only en BASE:
 *   npx vite build --mode localonly --outDir dist-native
 *   npx vite preview --outDir dist-local --host 127.0.0.1 --port 4330 --strictPort
 *   node e2e/ios-shell.mjs
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
    out.push('FAIL  ' + msg + (detail !== undefined ? `\n      ${detail}` : ''))
  }
}
function report() {
  console.log(out.join('\n'))
  console.log(`\n${out.length - failures} passed, ${failures} failed`)
}
process.on('uncaughtException', (err) => {
  out.push('FAIL  el guion se detuvo: ' + String(err).split('\n')[0])
  failures++
  report()
  process.exit(1)
})

/** El agente de usuario del WKWebView de una app (sin «Safari/…»). */
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

/*
 * Chromium conoce `beforeinstallprompt`; WebKit no. `useInstallPrompt` usa
 * justo eso para decidir si enseña el consejo de iPhone, así que se quita
 * para que esta página se comporte como la de un iPhone de verdad.
 */
const LIKE_WEBKIT = () => {
  delete Window.prototype.onbeforeinstallprompt
  delete window.onbeforeinstallprompt
}

const FAKE_IOS = (scenario) => {
  delete Window.prototype.onbeforeinstallprompt
  delete window.onbeforeinstallprompt
  window.webkit = { messageHandlers: { bridge: { postMessage: () => {} } } }
  /*
   * Lo que sobrevive a recargar — el permiso ya contestado y el registro de
   * llamadas — va a sessionStorage: cada `page.goto` vuelve a ejecutar este
   * script desde cero.
   */
  const KEY = '__ios-state'
  const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
  const state = (window.__ios = {
    tap: null,
    permission: 'prompt',
    afterRequest: 'denied',
    ...scenario,
    calls: [],
    plugins: [],
    haptics: [],
    ...(saved ?? {}),
  })
  const persist = () =>
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ permission: state.permission, calls: state.calls, plugins: state.plugins, haptics: state.haptics }),
    )
  const record = (entry) => {
    state.calls.push(entry)
    persist()
  }
  const promise = (name) => ({ name, rtype: 'promise' })
  const callback = (name) => ({ name, rtype: 'callback' })
  window.Capacitor = {
    platform: 'ios',
    isNative: true,
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
    Plugins: {},
    PluginHeaders: [
      {
        name: 'WorkoutNotification',
        methods: [
          'start',
          'stop',
          'scheduleRestAlert',
          'cancelRestAlert',
          'haptic',
          'isSupported',
          'checkPermissions',
          'requestPermissions',
          'requestExactAlarm',
          'removeListener',
        ]
          .map(promise)
          .concat(callback('addListener')),
      },
      { name: 'SplashScreen', methods: ['show', 'hide'].map(promise) },
      { name: 'Filesystem', methods: ['readdir', 'deleteFile', 'writeFile', 'stat'].map(promise) },
      {
        name: 'StatusBar',
        methods: ['setStyle', 'setBackgroundColor', 'setOverlaysWebView', 'show', 'hide', 'getInfo'].map(promise),
      },
      { name: 'Browser', methods: ['open', 'close', 'removeAllListeners'].map(promise).concat(callback('addListener')) },
      {
        name: 'Keyboard',
        methods: ['show', 'hide', 'setAccessoryBarVisible', 'setScroll', 'setStyle', 'setResizeMode', 'removeAllListeners']
          .map(promise)
          .concat(callback('addListener')),
      },
      {
        name: 'App',
        methods: ['exitApp', 'getInfo', 'getState', 'getLaunchUrl', 'minimizeApp', 'removeAllListeners', 'removeListener']
          .map(promise)
          .concat(callback('addListener')),
      },
    ],
    nativePromise: (plugin, method, options = {}) => {
      // La caché del teléfono: lo que el escenario diga, con la antigüedad
      // convertida a fecha de modificación en el momento de cargar.
      if (plugin === 'Filesystem' && method === 'readdir') {
        const files = (scenario.cacheFiles ?? []).map((f) => ({
          name: f.name,
          type: 'file',
          size: 10,
          ctime: 0,
          mtime: Date.now() - f.ageMs,
          uri: `file:///cache/${f.name}`,
        }))
        return Promise.resolve({ files })
      }
      if (plugin !== 'WorkoutNotification') {
        state.plugins.push({ plugin, method, options })
        persist()
        return Promise.resolve({})
      }
      if (method === 'haptic') {
        state.haptics.push(options.kind)
        persist()
        return Promise.resolve({})
      }
      record({ method, options, at: Date.now() })
      if (method === 'checkPermissions') return Promise.resolve({ display: state.permission })
      if (method === 'requestPermissions') {
        state.permission = state.afterRequest
        persist()
        return Promise.resolve({ display: state.permission })
      }
      if (method === 'start') return Promise.resolve({ shown: true })
      if (method === 'scheduleRestAlert') return Promise.resolve({ scheduled: true, exact: true })
      if (method === 'cancelRestAlert') return Promise.resolve({ delivered: false })
      if (method === 'isSupported') return Promise.resolve({ presence: true, restAlerts: true, exactAlarms: true })
      if (method === 'requestExactAlarm') return Promise.resolve({ exactAlarms: true })
      return Promise.resolve({})
    },
    nativeCallback: (plugin, method, options, cb) => {
      if (plugin !== 'WorkoutNotification') {
        state.plugins.push({ plugin, method, options })
        persist()
        return `${plugin}-cb`
      }
      record({ method, options, at: Date.now() })
      if (method === 'addListener' && options?.eventName === 'open') state.tap = cb
      return 'cb-' + state.calls.length
    },
  }
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] })

const device = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  locale: 'es-ES',
  userAgent: IPHONE_UA,
}

/** Da el cuestionario inicial por respondido (como e2e/android-shell.mjs) y, si se pide, cambia el idioma. */
async function freshProfile(page, language) {
  await page.goto(BASE, { waitUntil: 'commit' })
  await page.waitForTimeout(3500)
  await page.evaluate(async (lang) => {
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
    if (lang) row.language = lang
    await new Promise((r) => {
      const q = db.transaction('settings', 'readwrite').objectStore('settings').put(row)
      q.onsuccess = () => r()
    })
  }, language ?? null)
  await page.reload({ waitUntil: 'commit' })
  await page.waitForTimeout(3500)
}

async function startFreeWorkout(page) {
  await page.goto(`${BASE}/workout`, { waitUntil: 'commit' })
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /Entrenamiento libre|Free workout/ }).first().click()
  await page.waitForTimeout(2500)
}

async function addLoadedExercise(page, query) {
  await page.getByRole('button', { name: /Añadir ejercicio|Add exercise/ }).first().click()
  await page.waitForTimeout(2500)
  const picker = page.locator('div.fixed.inset-0.z-50')
  await picker.locator('input[type="search"], input[placeholder]').first().fill(query)
  await page.waitForTimeout(2200)
  await picker.locator('li').first().locator('button').first().click()
  await page.waitForTimeout(2500)
}

async function logFirstSet(page) {
  await page.locator('input[aria-label="Peso"], input[aria-label="Weight"]').first().fill('60')
  await page.locator('input[aria-label="Repeticiones"], input[aria-label="Reps"]').first().fill('8')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /^(Serie 1 completada|Set 1 done)$/ }).first().click()
  await page.waitForTimeout(1500)
}

async function discardFromWorkoutScreen(page) {
  await page.goto(`${BASE}/workout`, { waitUntil: 'commit' })
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: /^(DESCARTAR|DISCARD)$/ }).first().click()
  await page.waitForTimeout(600)
  await page.locator('[role="dialog"]').getByRole('button', { name: /^(DESCARTAR|DISCARD)$/ }).click()
  await page.waitForTimeout(1500)
}

async function activeSessionId(page) {
  return page.evaluate(async () => {
    const db = await new Promise((r) => {
      const q = indexedDB.open('training-os')
      q.onsuccess = () => r(q.result)
    })
    const all = await new Promise((r) => {
      const q = db.transaction('sessions').objectStore('sessions').getAll()
      q.onsuccess = () => r(q.result)
    })
    return all.find((s) => s.status === 'active' && !s.deletedAt)?.id ?? null
  })
}

const calls = (page) => page.evaluate(() => window.__ios.calls)
const methods = async (page) => (await calls(page)).map((c) => c.method)
const pluginCalls = (page) => page.evaluate(() => window.__ios.plugins)

/* ================================================= 1. el arranque */
{
  const ctx = await browser.newContext(device)
  const page = await ctx.newPage()
  const requested = []
  page.on('request', (r) => requested.push(r.url()))
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.addInitScript(FAKE_IOS, {
    permission: 'prompt',
    afterRequest: 'denied',
    // Una copia exportada de hace una hora (sobra), otra de hace un momento
    // (puede estar entregándose todavía) y un fichero que no es nuestro.
    cacheFiles: [
      { name: 'training-os-20261001-1200.json', ageMs: 60 * 60 * 1000 },
      { name: 'training-os-sets-20261014-1530.csv', ageMs: 10 * 1000 },
      { name: 'otra-app.json', ageMs: 60 * 60 * 1000 },
    ],
  })
  await page.goto(BASE, { waitUntil: 'commit' })
  // El registro del service worker en web va 2,5 s después de la carga.
  await page.waitForTimeout(6000)

  const platform = await page.evaluate(() => [window.Capacitor?.getPlatform?.(), window.Capacitor?.isNativePlatform?.()])
  check(platform[0] === 'ios' && platform[1] === true, 'arranque — la página se ve a sí misma como iOS nativo', platform.join(' · '))

  const swCount = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)
  check(swCount === 0, 'arranque — NO se registra ningún service worker', `registros: ${swCount}`)
  check(!requested.some((u) => /\/sw\.js|workbox-/.test(u)), 'arranque — ni siquiera se pide /sw.js')

  const plugins = await pluginCalls(page)
  const named = plugins.map((c) => `${c.plugin}.${c.method}`)
  check(named.includes('SplashScreen.hide'), 'arranque — se retira la pantalla de arranque', named.join(', '))
  check(named.includes('StatusBar.setStyle'), 'arranque — la barra de estado se pinta con setStyle', named.join(', '))
  check(
    !named.includes('StatusBar.setBackgroundColor') && !named.includes('StatusBar.setOverlaysWebView'),
    'arranque — y NADA de setBackgroundColor / setOverlaysWebView (son de Android)',
    named.join(', '),
  )
  const deleted = plugins.filter((c) => c.plugin === 'Filesystem' && c.method === 'deleteFile').map((c) => c.options.path)
  check(
    deleted.length === 1 && deleted[0] === 'training-os-20261001-1200.json',
    'arranque — se borra de la caché la copia exportada antigua, y sólo esa',
    JSON.stringify(deleted),
  )
  const bar = plugins.find((c) => c.plugin === 'Keyboard' && c.method === 'setAccessoryBarVisible')
  check(bar?.options?.isVisible === true, 'arranque — la barra de accesorios del teclado queda visible', JSON.stringify(bar?.options))
  check(!named.includes('App.exitApp'), 'arranque — iOS no tiene botón atrás que salga de la app')

  const atOpen = await methods(page)
  check(
    !atOpen.includes('requestPermissions') && !atOpen.includes('start'),
    'arranque — abrir la app NO pide permisos ni enseña nada',
    atOpen.join(', '),
  )
  check(pageErrors.length === 0, 'arranque — sin errores sin capturar', pageErrors.join(' · '))
  await ctx.close()
}

/* ======================================= 2. sin consejo de instalar */
{
  // Control: la misma página en el Safari de un iPhone SÍ lo enseña. Si esto
  // fallara, la comprobación de abajo no estaría probando nada.
  const web = await browser.newContext(device)
  const wpage = await web.newPage()
  await wpage.addInitScript(LIKE_WEBKIT)
  await freshProfile(wpage)
  await wpage.goto(`${BASE}/more`, { waitUntil: 'commit' })
  await wpage.waitForTimeout(3000)
  const webText = (await wpage.locator('body').textContent()) ?? ''
  check(/Añadir a pantalla de inicio/.test(webText), 'instalar — control: en Safari de iPhone el consejo sí sale')
  await web.close()

  const ctx = await browser.newContext(device)
  const page = await ctx.newPage()
  await page.addInitScript(FAKE_IOS, {})
  await freshProfile(page)
  for (const path of ['/more', '/settings']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'commit' })
    await page.waitForTimeout(3000)
    const text = (await page.locator('body').textContent()) ?? ''
    check(
      !/Añadir a pantalla de inicio/.test(text) && !/Instala Training OS/.test(text),
      `instalar — dentro de la app no se ofrece instalarla (${path})`,
    )
  }
  await ctx.close()
}

/* ========================================== 3. enlaces externos */
{
  const ctx = await browser.newContext(device)
  const page = await ctx.newPage()
  await page.addInitScript(FAKE_IOS, {})
  const outbound = []
  for (const host of ['github.com', 'creativecommons.org']) {
    await page.route(`**://${host}/**`, (route) => {
      outbound.push(route.request().url())
      return route.abort()
    })
  }
  await freshProfile(page)
  await page.goto(`${BASE}/attributions`, { waitUntil: 'commit' })
  await page.waitForTimeout(3500)
  const link = page.locator('a[href^="https://github.com/"]').first()
  const found = (await link.count()) > 0
  check(found, 'enlaces — la pantalla de atribuciones tiene enlaces externos')
  if (found) {
    const href = await link.getAttribute('href')
    const before = page.url()
    const pagesBefore = ctx.pages().length
    await link.click({ force: true })
    await page.waitForTimeout(1500)
    check(page.url() === before, 'enlaces — pulsar no saca al usuario de la app', `${before} → ${page.url()}`)
    check(ctx.pages().length === pagesBefore, 'enlaces — no se abre una vista encima sin forma de volver')
    check(outbound.length === 0, 'enlaces — no se pide la página externa dentro del WebView', outbound.join(' · '))
    const opened = (await pluginCalls(page)).find((c) => c.plugin === 'Browser' && c.method === 'open')
    check(opened?.options?.url === href, 'enlaces — se abre en SFSafariViewController (Browser.open)', JSON.stringify(opened?.options))
  }
  await ctx.close()
}

/* ============================== 4. Live Activity con el permiso denegado */
{
  const ctx = await browser.newContext(device)
  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.addInitScript(FAKE_IOS, { permission: 'prompt', afterRequest: 'denied' })
  await freshProfile(page)
  await startFreeWorkout(page)

  const list = await methods(page)
  const ask = list.indexOf('requestPermissions')
  const start = list.indexOf('start')
  check(ask !== -1, 'Live Activity — el permiso se pide al empezar el primer entrenamiento', list.join(', '))
  check(start > ask, 'Live Activity — denegado, la Live Activity se pide igualmente', list.join(', '))
  const [first] = (await calls(page)).filter((c) => c.method === 'start').map((c) => c.options)
  const sessionId = await activeSessionId(page)
  check(first?.sessionId === sessionId, 'Live Activity — con el id de la sesión en curso', `${first?.sessionId} vs ${sessionId}`)
  check(
    first?.title === 'Entrenamiento en curso' && first?.locale === 'es-ES' && first?.labels?.elapsed === 'Duración',
    'Live Activity — todo en español',
    JSON.stringify([first?.title, first?.locale, first?.labels]),
  )
  check(!('channelName' in (first ?? {})), 'Live Activity — sin los campos de canal de Android')

  // Descanso con el permiso denegado: la Live Activity cuenta atrás, pero no
  // hay aviso que programar.
  await addLoadedExercise(page, 'press banca')
  const mark = (await methods(page)).length
  await logFirstSet(page)
  const since = (await calls(page)).slice(mark)
  const restStart = since.filter((c) => c.method === 'start').at(-1)?.options
  check(typeof restStart?.rest?.endsAt === 'number', 'Live Activity — el descanso llega con su hora de fin', JSON.stringify(restStart?.rest))
  check(!since.some((c) => c.method === 'scheduleRestAlert'), 'aviso — sin permiso de notificaciones no se programa', since.map((c) => c.method).join(', '))

  const haptics = await page.evaluate(() => window.__ios.haptics)
  check(haptics.length > 0, 'háptica — la vibración la da el nativo (navigator.vibrate no existe en iOS)', haptics.slice(0, 5).join(', '))

  await discardFromWorkoutScreen(page)
  const after = await methods(page)
  check(after.at(-1) === 'stop', 'Live Activity — al descartar el entrenamiento termina (último mensaje: stop)', after.slice(-4).join(', '))
  check(pageErrors.length === 0, 'Live Activity — sin errores sin capturar', pageErrors.join(' · '))
  await ctx.close()
}

/* ==================== 5. con permiso: aviso de descanso, toque y deslizar */
{
  const ctx = await browser.newContext(device)
  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.addInitScript(FAKE_IOS, { permission: 'prompt', afterRequest: 'granted' })
  await freshProfile(page)
  await startFreeWorkout(page)
  await addLoadedExercise(page, 'press banca')

  let mark = (await methods(page)).length
  await logFirstSet(page)
  let since = (await calls(page)).slice(mark)
  const withRest = since.filter((c) => c.method === 'start').at(-1)?.options
  const alert = since.find((c) => c.method === 'scheduleRestAlert')?.options
  check(!!alert && alert.at === withRest?.rest?.endsAt, 'aviso — se programa a la hora en que acaba el descanso', `${alert?.at} vs ${withRest?.rest?.endsAt}`)
  check(
    alert?.title === 'Descanso terminado' && /^Siguiente serie: \S/.test(alert?.body ?? ''),
    'aviso — en español',
    `${alert?.title} · ${alert?.body}`,
  )
  check(alert && !('channelName' in alert), 'aviso — sin canal (eso es de Android)')
  check(!since.some((c) => c.method === 'isSupported' || c.method === 'requestExactAlarm'), 'aviso — en iOS no se ofrece la alarma exacta')
  check((await page.locator('[role="dialog"]').count()) === 0, 'aviso — y no sale ninguna hoja')

  mark = (await methods(page)).length
  await page.locator('div.fixed[role="timer"]').getByRole('button', { name: 'Saltar' }).click()
  await page.waitForTimeout(1200)
  since = (await methods(page)).slice(mark)
  check(since.includes('cancelRestAlert'), 'aviso — saltar el descanso lo cancela', since.join(', '))

  // Deslizar para volver con una hoja abierta: se cierra la hoja y la
  // pantalla se queda donde estaba. Sin hoja, vuelve atrás como siempre.
  await page.getByRole('button', { name: /Añadir ejercicio/ }).first().click()
  await page.waitForTimeout(1500)
  const sheetOpen = (await page.locator('[role="dialog"]').count()) === 1
  check(sheetOpen, 'deslizar — se abre una hoja')
  const here = page.url()
  await page.evaluate(() => history.back())
  await page.waitForTimeout(1200)
  check((await page.locator('[role="dialog"]').count()) === 0, 'deslizar — con una hoja abierta, volver la cierra')
  check(page.url() === here, 'deslizar — y no cambia de pantalla', `${here} → ${page.url()}`)
  check(new URL(page.url()).pathname === '/workout/active', 'deslizar — la sesión sigue en pantalla', page.url())
  await page.evaluate(() => history.back())
  await page.waitForTimeout(1500)
  check(new URL(page.url()).pathname !== '/workout/active', 'deslizar — sin hoja, volver sí navega', page.url())

  // Tocar la Live Activity.
  const activeId = await activeSessionId(page)
  const tapTo = async (data) => {
    await page.goto(`${BASE}/progress`, { waitUntil: 'commit' })
    await page.waitForTimeout(3000)
    await page.evaluate((d) => window.__ios.tap?.(d), data)
    await page.waitForTimeout(1500)
    return new URL(page.url()).pathname
  }
  check((await tapTo({ sessionId: activeId })) === '/workout/active', 'toque — con el id de la sesión en curso, a la sesión')
  check((await tapTo({ sessionId: 'no-existe-123' })) === '/', 'toque — con un id desconocido, al inicio')
  check((await tapTo({ sessionId: '../../settings' })) === '/', 'toque — con un id mal formado, al inicio')
  check((await tapTo({})) === '/workout/active', 'toque — sin id, a la sesión en curso')

  await discardFromWorkoutScreen(page)
  check((await methods(page)).at(-1) === 'stop', 'Live Activity — descartar la termina')
  check(pageErrors.length === 0, 'con permiso — sin errores sin capturar', pageErrors.join(' · '))
  await ctx.close()
}

/* ======================================================= 6. en inglés */
{
  const ctx = await browser.newContext({ ...device, locale: 'en-GB' })
  const page = await ctx.newPage()
  await page.addInitScript(FAKE_IOS, { permission: 'granted' })
  await freshProfile(page, 'en')
  await startFreeWorkout(page)
  await addLoadedExercise(page, 'bench press')
  const mark = (await methods(page)).length
  await logFirstSet(page)
  const all = await calls(page)
  const [first] = all.filter((c) => c.method === 'start').map((c) => c.options)
  const withRest = all.slice(mark).filter((c) => c.method === 'start').at(-1)?.options
  const alert = all.slice(mark).find((c) => c.method === 'scheduleRestAlert')?.options
  check(
    first?.title === 'Workout in progress' && first?.locale === 'en-GB' && first?.sessionName === 'Free workout',
    'idioma — con la app en inglés, la Live Activity en inglés',
    JSON.stringify([first?.title, first?.locale, first?.sessionName]),
  )
  check(/^Set \d+ of \d+$/.test(withRest?.setLabel ?? ''), 'idioma — «Set 2 of 3»', withRest?.setLabel)
  check(alert?.title === 'Rest over' && /^Next set: \S/.test(alert?.body ?? ''), 'idioma — el aviso de descanso en inglés', `${alert?.title} · ${alert?.body}`)
  const texts = JSON.stringify([first, withRest, alert])
  check(
    !/[áéíóúñ]|Entrenamiento|Descanso|Serie |series|Duración|En pausa/.test(texts),
    'idioma — y ni una palabra en español en lo que llega al nativo',
    texts.slice(0, 300),
  )
  await discardFromWorkoutScreen(page)
  await ctx.close()
}

await browser.close()
report()
if (failures > 0) process.exit(1)
