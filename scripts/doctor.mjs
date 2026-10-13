/**
 * Encuentra ficheros que sobran de una versión anterior.
 *
 * Descomprimir una entrega encima de la carpeta anterior **no borra** los
 * ficheros que esa entrega ha eliminado. Quedan ahí, y TypeScript los sigue
 * compilando aunque ya no los importe nadie: el build falla con errores sobre
 * miembros que "no existen", y la causa real no aparece por ningún lado.
 *
 * Ha pasado dos veces con `src/routes/auth/VerifyEmail.tsx`. Esto lo detecta
 * en dos segundos:
 *
 *   npm run doctor          dice qué sobra
 *   npm run doctor -- --fix lo borra
 *
 * El manifiesto `release/FILES.json` viaja dentro de cada entrega y lista
 * exactamente los ficheros que la componen.
 */
import { readFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = join(ROOT, 'release', 'FILES.json')

/* Solo donde un fichero olvidado puede romper el build o el comportamiento. */
const WATCHED = ['src', 'e2e', 'tests', 'scripts', 'public', 'firebase', 'android']

/*
 * Carpetas en las que este script no entra nunca.
 *
 * Las tres primeras son obvias. Las de Android lo son menos y son igual de
 * importantes: todo eso lo regeneran Gradle y `npx cap sync`, no está en el
 * manifiesto porque no está en git, y borrarlo obligaría a re-sincronizar el
 * proyecto nativo cada vez que alguien ejecuta el doctor.
 */
const SKIP = new Set([
  'node_modules',
  'dist',
  'dist-local',
  '.git',
  '.vite',
  // Android
  'build',
  '.gradle',
  '.idea',
  'captures',
  // android/app/src/main/assets/public — la copia del build web dentro del
  // APK. El `public/` de la raíz sí se vigila: es una raíz de WATCHED y se
  // recorre directamente, sin pasar por este filtro de nombres.
  'public',
  'capacitor-cordova-android-plugins',
])

/*
 * Ficheros que este script NO BORRA JAMÁS, ni con --fix, aunque no estén en el
 * manifiesto. Son precisamente los que nunca están en git: tus variables de
 * entorno y tus claves de firma. Borrar cualquiera de ellos sería,
 * respectivamente, dejar la app sin Firebase y perder para siempre la
 * capacidad de actualizar la app en Google Play.
 *
 * La comprobación es por nombre y por extensión, así que da igual dónde
 * aparezcan.
 */
const NEVER_DELETE_NAMES = new Set([
  '.env',
  '.env.local',
  '.env.localonly',
  '.env.production',
  'keystore.properties',
  'local.properties',
  'google-services.json',
])
const NEVER_DELETE_EXTENSIONS = ['.jks', '.keystore', '.p12', '.pepk']

/*
 * Ficheros que genera `npx cap sync` y que, por diseño, no están en git.
 * No "sobran": desaparecen y vuelven solos en cada sincronización.
 */
const GENERATED = [
  'android/app/src/main/assets/capacitor.config.json',
  'android/app/src/main/assets/capacitor.plugins.json',
  'android/app/src/main/res/xml/config.xml',
]

function isGenerated(relPath) {
  return GENERATED.includes(relPath)
}

function isProtected(relPath) {
  const name = relPath.split('/').pop() ?? ''
  if (NEVER_DELETE_NAMES.has(name)) return true
  if (name.startsWith('.env.')) return true
  return NEVER_DELETE_EXTENSIONS.some((ext) => name.endsWith(ext))
}

if (!existsSync(MANIFEST)) {
  console.error('No encuentro release/FILES.json.')
  console.error('Esta copia del proyecto es anterior a que existiera el manifiesto,')
  console.error('o se ha descomprimido a medias. Descomprime la entrega en una')
  console.error('carpeta vacía y vuelve a intentarlo.')
  process.exit(2)
}

const manifest = new Set(JSON.parse(readFileSync(MANIFEST, 'utf8')).files)

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else out.push(relative(ROOT, full).split('\\').join('/'))
  }
  return out
}

const onDisk = []
for (const d of WATCHED) {
  const full = join(ROOT, d)
  if (existsSync(full)) walk(full, onDisk)
}

const extra = onDisk.filter((f) => !manifest.has(f) && !isProtected(f) && !isGenerated(f)).sort()
const fix = process.argv.includes('--fix')

if (extra.length === 0) {
  console.log(`Todo en orden: ${onDisk.length} ficheros, ninguno sobra.`)
  process.exit(0)
}

console.log(`Sobran ${extra.length} fichero(s) de una versión anterior:\n`)
for (const f of extra) console.log('  ' + f)

if (!fix) {
  console.log('\nBórralos con:  npm run doctor -- --fix')
  console.log('(o descomprime la entrega en una carpeta vacía, que es lo mismo)')
  process.exit(1)
}

for (const f of extra) unlinkSync(join(ROOT, f))
console.log(`\nBorrados. Ahora "npm run build" debería funcionar.`)
