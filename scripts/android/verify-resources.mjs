/**
 * TRAINING OS — comprobación estática del proyecto Android.
 *
 *   node scripts/android/verify-resources.mjs
 *
 * No sustituye a compilar: para eso hace falta el SDK de Android. Lo que hace
 * es cazar, en dos segundos y sin SDK, la clase de error que si no aparece
 * cinco minutos después en un `assembleDebug` con un mensaje mucho peor:
 *
 *   1. Un XML mal formado.
 *   2. Una referencia a un recurso que no existe — `@color/colorPrimary`,
 *      `@drawable/splash`, `@style/AppTheme`…
 *
 * El caso 2 no es hipotético: la plantilla que genera `npx cap add android`
 * trae un `styles.xml` que referencia `@color/colorPrimary`,
 * `colorPrimaryDark` y `colorAccent` **sin definirlos en ninguna parte**. El
 * proyecto recién creado no compila, y el error que da Gradle no señala el
 * fichero que falta.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve, basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const MAIN = join(ROOT, 'android/app/src/main')
const RES = join(MAIN, 'res')

const out = []
let failures = 0
const check = (cond, msg, detail) => {
  if (cond) out.push('PASS  ' + msg)
  else {
    failures++
    out.push('FAIL  ' + msg + (detail ? `\n      ${detail}` : ''))
  }
}

if (!existsSync(RES)) {
  console.error('No existe android/app/src/main/res. ¿Se ha ejecutado `npx cap add android`?')
  process.exit(2)
}

/* ------------------------------------------------------------ 1. XML bien formado */

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const files = [join(MAIN, 'AndroidManifest.xml'), ...walk(RES)]
const xmlFiles = files.filter((f) => extname(f) === '.xml')

/**
 * Un comprobador de XML mínimo: etiquetas equilibradas y comentarios cerrados.
 * No valida esquemas — para eso está aapt — pero detecta lo que de verdad se
 * rompe al editar estos ficheros a mano.
 */
function xmlProblem(text) {
  // Los comentarios primero: dentro puede haber cualquier cosa.
  let i = 0
  let stripped = ''
  while (i < text.length) {
    const start = text.indexOf('<!--', i)
    if (start === -1) {
      stripped += text.slice(i)
      break
    }
    stripped += text.slice(i, start)
    const end = text.indexOf('-->', start + 4)
    if (end === -1) return 'comentario sin cerrar'
    // Un `--` dentro de un comentario es XML inválido y algunos parsers lo
    // rechazan; se avisa porque es fácil de escribir sin querer.
    if (text.slice(start + 4, end).includes('--')) return 'comentario con "--" dentro'
    i = end + 3
  }

  const stack = []
  const tag = /<\/?([A-Za-z_][\w.:-]*)([^>]*?)(\/?)>/g
  let m
  while ((m = tag.exec(stripped))) {
    const [whole, name, , selfClose] = m
    if (whole.startsWith('<?') || whole.startsWith('<!')) continue
    if (whole.startsWith('</')) {
      const open = stack.pop()
      if (open !== name) return `</${name}> cierra <${open ?? 'nada'}>`
    } else if (!selfClose) {
      stack.push(name)
    }
  }
  if (stack.length) return `sin cerrar: <${stack.join('>, <')}>`
  return null
}

let badXml = []
for (const f of xmlFiles) {
  const problem = xmlProblem(readFileSync(f, 'utf8'))
  if (problem) badXml.push(`${f.slice(ROOT.length + 1)}: ${problem}`)
}
check(badXml.length === 0, `XML bien formado (${xmlFiles.length} ficheros)`, badXml.join('\n      '))

/* ----------------------------------------------- 2. recursos que sí existen */

/** Todo lo que el proyecto DEFINE, por tipo. */
const defined = {
  color: new Set(),
  string: new Set(),
  style: new Set(),
  drawable: new Set(),
  mipmap: new Set(),
  xml: new Set(),
  layout: new Set(),
  anim: new Set(),
  array: new Set(),
  dimen: new Set(),
  bool: new Set(),
  integer: new Set(),
}

// Recursos de fichero: el nombre es el del fichero, sin extensión.
for (const f of walk(RES)) {
  const dir = basename(dirname(f))
  const kind = dir.split('-')[0]
  if (kind in defined) defined[kind].add(basename(f).replace(/\.(xml|png|jpg|webp|9\.png)$/, ''))
}

// Recursos de valores: <color name="…">, <string name="…">, <style name="…">…
for (const f of xmlFiles.filter((f) => basename(dirname(f)).startsWith('values'))) {
  const text = readFileSync(f, 'utf8')
  for (const m of text.matchAll(/<(color|string|style|dimen|bool|integer|string-array|array)\s+name="([^"]+)"/g)) {
    const kind = m[1] === 'string-array' ? 'array' : m[1]
    if (kind in defined) defined[kind].add(m[2])
  }
}

// Android define los suyos: @android:color/transparent y compañía.
const ANDROID_BUILTIN = /^@android:/
// Los atributos de tema de AppCompat y de core-splashscreen no son recursos
// de este proyecto; se referencian sin `@` y no se comprueban aquí.

const missing = []
const referenced = new Set()
for (const f of xmlFiles) {
  const text = readFileSync(f, 'utf8')
  for (const m of text.matchAll(/"(@[a-z:]*[a-z]+\/[\w.]+)"/g)) {
    const ref = m[1]
    if (ANDROID_BUILTIN.test(ref)) continue
    const [, kind, name] = ref.match(/^@\+?(\w+)\/([\w.]+)$/) ?? []
    if (!kind) continue
    referenced.add(ref)
    if (!(kind in defined)) continue
    // Un estilo `AppTheme.NoActionBar` hereda por el punto; se define con ese
    // nombre completo, así que la comparación directa vale.
    if (!defined[kind].has(name)) missing.push(`${f.slice(ROOT.length + 1)} → ${ref}`)
  }
}
check(
  missing.length === 0,
  `todas las referencias a recursos resuelven (${referenced.size} distintas)`,
  missing.join('\n      '),
)

/* -------------------------------------------- 3. lo que no puede faltar */

/**
 * Quita los comentarios antes de buscar nada.
 *
 * Sin esto, la comprobación de `cleartextTrafficPermitted="true"` saltaba
 * contra el propio comentario que explica por qué ESA línea no está en el
 * fichero. Un comprobador que no distingue el código de la explicación del
 * código no sirve de mucho.
 */
const withoutComments = (text) => text.replace(/<!--[\s\S]*?-->/g, '')

const manifest = withoutComments(readFileSync(join(MAIN, 'AndroidManifest.xml'), 'utf8'))

check(
  /package_name">com\.trainingos\.app<|<string name="package_name">com\.trainingos\.app<\/string>/.test(
    readFileSync(join(RES, 'values/strings.xml'), 'utf8'),
  ),
  'el identificador de paquete es com.trainingos.app',
)
check(/android:allowBackup="false"/.test(manifest), 'la copia de seguridad automática está desactivada')
check(/android:usesCleartextTraffic="false"/.test(manifest), 'el tráfico HTTP en claro está desactivado')
check(
  /android:networkSecurityConfig="@xml\/network_security_config"/.test(manifest),
  'hay una política de red declarada',
)
check(
  !/cleartextTrafficPermitted="true"/.test(
    withoutComments(readFileSync(join(RES, 'xml/network_security_config.xml'), 'utf8')),
  ),
  'la política de red no permite HTTP en claro en ningún dominio',
)

/*
 * Mínimo privilegio: exactamente estos permisos, ni uno más. POST_NOTIFICATIONS
 * es para el aviso de «entrenamiento en curso» de la pantalla de bloqueo
 * (WorkoutNotificationPlugin.java); cualquier otro que aparezca hace fallar
 * esta comprobación hasta que alguien lo justifique y la actualice.
 */
const EXPECTED_PERMISSIONS = ['android.permission.INTERNET', 'android.permission.POST_NOTIFICATIONS']
const permissions = [...manifest.matchAll(/<uses-permission[^>]*android:name="([^"]+)"/g)].map((m) => m[1])
check(
  JSON.stringify([...permissions].sort()) === JSON.stringify(EXPECTED_PERMISSIONS),
  'exactamente dos permisos: INTERNET y POST_NOTIFICATIONS',
  permissions.join(', '),
)

// Cada permiso que se pide lleva su justificación escrita en el propio
// manifiesto, con el formato de las demás: el nombre y debajo «Para qué:».
const manifestWithComments = readFileSync(join(MAIN, 'AndroidManifest.xml'), 'utf8')
const unjustified = permissions.filter(
  (p) => !new RegExp(`\\n\\s+${p.split('.').pop()}\\s*\\n\\s+Para qué:`).test(manifestWithComments),
)
check(unjustified.length === 0, 'cada permiso pedido está justificado en el manifiesto', unjustified.join(', '))

check(
  !/<service\b/.test(manifest) && !/FOREGROUND_SERVICE/.test(manifest),
  'ningún servicio en primer plano: el cronómetro del aviso lo pinta el sistema',
)

/* ------------------------------------------- 4. el plugin nativo propio */

const JAVA = join(MAIN, 'java/com/trainingos/app')
const javaFiles = walk(JAVA).filter((f) => extname(f) === '.java')

// Una referencia `R.drawable.x` en Java que no existe no la caza el XML de
// arriba y sólo aparece al compilar.
const javaMissing = []
for (const f of javaFiles) {
  for (const m of readFileSync(f, 'utf8').matchAll(/(?<![\w.])R\.(\w+)\.(\w+)/g)) {
    const [, kind, name] = m
    if (!(kind in defined)) continue
    if (!defined[kind].has(name)) javaMissing.push(`${basename(f)} → R.${kind}.${name}`)
  }
}
check(javaMissing.length === 0, 'las referencias a recursos desde Java resuelven', javaMissing.join('\n      '))

const mainActivity = readFileSync(join(JAVA, 'MainActivity.java'), 'utf8')
const registerAt = mainActivity.indexOf('registerPlugin(WorkoutNotificationPlugin.class)')
const superAt = mainActivity.indexOf('super.onCreate(')
check(
  registerAt !== -1 && superAt !== -1 && registerAt < superAt,
  'MainActivity registra WorkoutNotificationPlugin antes de super.onCreate',
)

const pluginSrc = readFileSync(join(JAVA, 'WorkoutNotificationPlugin.java'), 'utf8')
// El aviso se construye en WorkoutNotice.java; lo que sigue mira todo el Java propio.
const nativeSrc = javaFiles.map((f) => readFileSync(f, 'utf8')).join('\n')
const nativeName = pluginSrc.match(/@CapacitorPlugin\(\s*name\s*=\s*"([^"]+)"/)?.[1]
const jsName = readFileSync(join(ROOT, 'src/lib/native/workoutNotification.ts'), 'utf8').match(
  /registerPlugin<\w+>\('([^']+)'\)/,
)?.[1]
check(
  !!nativeName && nativeName === jsName,
  `el plugin se llama igual en Java y en TypeScript (${nativeName} / ${jsName})`,
)
check(
  /Manifest\.permission\.POST_NOTIFICATIONS/.test(pluginSrc),
  'el plugin declara el permiso que pide en tiempo de ejecución',
)
const builderNeeds = ['setUsesChronometer(true)', 'setWhen(', 'setOngoing(true)', 'VISIBILITY_PUBLIC', 'setContentIntent(', 'setDeleteIntent(']
const builderMissing = builderNeeds.filter((s) => !nativeSrc.includes(s))
check(
  builderMissing.length === 0,
  'el aviso lleva cronómetro del sistema, es persistente, se ve en la pantalla de bloqueo y abre la app',
  builderMissing.join(', '),
)
check(
  /PendingIntent\.FLAG_IMMUTABLE/.test(nativeSrc) && !/FLAG_MUTABLE\b/.test(nativeSrc) && !/startForeground/.test(nativeSrc),
  'los PendingIntent son inmutables y no se arranca ningún servicio',
)
// Si se descarta deslizando, un receptor propio lo vuelve a poner: tiene que
// existir, estar declarado y no estar expuesto a otras apps.
const receiver = manifest.match(/<receiver\b[^>]*android:name="\.WorkoutNoticeDismissedReceiver"[^>]*>/)?.[0] ?? ''
check(
  /android:exported="false"/.test(receiver) && existsSync(join(JAVA, 'WorkoutNoticeDismissedReceiver.java')),
  'el receptor que repone el aviso descartado está declarado y no se exporta',
  receiver || 'no declarado',
)

// El canal de notificaciones se ve en los ajustes del sistema, en su idioma.
const channelStrings = (dir) =>
  [...readFileSync(join(RES, dir, 'strings.xml'), 'utf8').matchAll(/<string\s+name="(workout_channel_\w+)"/g)].map((m) => m[1]).sort()
check(
  channelStrings('values').length > 0 && JSON.stringify(channelStrings('values')) === JSON.stringify(channelStrings('values-es')),
  'el canal del aviso tiene sus textos en inglés y en español',
  `${channelStrings('values')} / ${channelStrings('values-es')}`,
)

const gradle = readFileSync(join(ROOT, 'android/app/build.gradle'), 'utf8')
check(!/storePassword\s+["']/.test(gradle), 'build.gradle no contiene ninguna contraseña escrita a mano')
check(/keystore\.properties/.test(gradle), 'la firma se lee de keystore.properties, fuera de git')

const variables = readFileSync(join(ROOT, 'android/variables.gradle'), 'utf8')
const target = variables.match(/targetSdkVersion\s*=\s*(\d+)/)?.[1]
const compile = variables.match(/compileSdkVersion\s*=\s*(\d+)/)?.[1]
check(Number(target) >= 36, `targetSdk ${target} (Google Play exige 36 desde el 31/08/2026)`)
check(Number(compile) >= 36, `compileSdk ${compile}`)

const capConfig = readFileSync(join(ROOT, 'capacitor.config.ts'), 'utf8')
check(/appId: 'com\.trainingos\.app'/.test(capConfig), 'capacitor.config.ts declara com.trainingos.app')
check(/appName: 'Training OS'/.test(capConfig), 'capacitor.config.ts declara Training OS')
check(/webDir: 'dist'/.test(capConfig), 'capacitor.config.ts apunta a dist')
check(!/server:\s*{[^}]*url:/s.test(capConfig), 'no hay un server.url apuntando el WebView a un servidor remoto')

/* ------------------------------------------------------------------ informe */

console.log(out.join('\n'))
console.log(`\n${out.length - failures} passed, ${failures} failed`)
if (failures > 0) process.exit(1)
