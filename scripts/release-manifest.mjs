/**
 * Escribe `release/FILES.json` con todo lo que compone esta entrega.
 *
 * Se genera antes de empaquetar, a partir de lo que git tiene registrado, y
 * viaja dentro del zip. `npm run doctor` lo compara con lo que hay en disco
 * para encontrar restos de versiones anteriores.
 */
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const files = execSync('git ls-files', { cwd: ROOT }).toString().trim().split('\n').filter(Boolean)

mkdirSync(join(ROOT, 'release'), { recursive: true })
writeFileSync(
  join(ROOT, 'release', 'FILES.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), count: files.length, files }, null, 1),
)
console.log(`release/FILES.json — ${files.length} ficheros`)
