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
const WATCHED = ['src', 'e2e', 'tests', 'scripts', 'public', 'firebase']
const SKIP = new Set(['node_modules', 'dist', 'dist-local', '.git', '.vite'])

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

const extra = onDisk.filter((f) => !manifest.has(f)).sort()
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
