/**
 * TRAINING OS — comprobación estática del proyecto iOS.
 *
 *   node scripts/ios/verify-project.mjs
 *
 * No sustituye a compilar: para eso hace falta un Mac con Xcode. Lo que hace
 * es cazar, en un segundo y desde Windows o Linux, la clase de error que si no
 * aparece veinte minutos después en el runner de macOS con un mensaje mucho
 * peor:
 *
 *   1. Un `project.pbxproj` roto: sintaxis, identificadores repetidos o que
 *      apuntan a objetos que no existen, ficheros que no están en disco. Xcode
 *      no avisa de nada de esto al abrir el proyecto: lo ignora en silencio o
 *      se niega a abrirlo.
 *   2. Un fichero Swift que no compila nadie, o que compila el target que no
 *      es (la extensión no puede enlazar Capacitor; los atributos de la Live
 *      Activity tienen que estar en la app Y en la extensión).
 *   3. El contrato con JavaScript (docs/NATIVE-CONTRACT.md): el nombre del
 *      plugin, sus métodos, su registro a mano y las API de ActivityKit 16.2.
 *   4. Lo que App Store Connect rechaza al subir: icono con alfa, manifiesto
 *      de privacidad incompleto, Info.plist sin las claves de exportación.
 *
 * Salida: 0 si todo pasa, 1 si algo falla, 2 si no hay proyecto iOS.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative, sep, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const IOS = join(ROOT, 'ios/App')
const XCODEPROJ = join(IOS, 'App.xcodeproj')
const PBXPROJ = join(XCODEPROJ, 'project.pbxproj')
const SCHEME = join(XCODEPROJ, 'xcshareddata/xcschemes/App.xcscheme')

const out = []
let failures = 0
const check = (cond, msg, detail) => {
  if (cond) out.push('PASS  ' + msg)
  else {
    failures++
    out.push('FAIL  ' + msg + (detail ? `\n      ${detail}` : ''))
  }
}
const section = (title) => out.push(`\n— ${title}`)

if (!existsSync(IOS) || !existsSync(PBXPROJ)) {
  console.error('No existe ios/App/App.xcodeproj. ¿Se ha ejecutado `npx cap add ios`?')
  process.exit(2)
}

/** Ruta relativa al repositorio, con barras normales, para los mensajes. */
const rel = (p) => relative(ROOT, p).split(sep).join('/')

/** El contenido del fichero, o null si (todavía) no existe. */
function readOpt(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function walk(dir, skip = new Set()) {
  if (!existsSync(dir)) return []
  const found = []
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) found.push(...walk(full, skip))
    else found.push(full)
  }
  return found
}

/**
 * Quita los comentarios de Swift antes de buscar nada. Sin esto, el
 * comentario que explica por qué NO se usa `contentState:` haría fallar la
 * comprobación de que no se usa. Las cadenas se respetan: un `//` dentro de
 * una URL no es un comentario.
 */
function swiftCode(text) {
  let code = ''
  let i = 0
  while (i < text.length) {
    const c = text[i]
    const next = text[i + 1]
    if (c === '"') {
      const multi = text.startsWith('"""', i)
      const close = multi ? '"""' : '"'
      let j = i + close.length
      while (j < text.length && !text.startsWith(close, j)) j += text[j] === '\\' ? 2 : 1
      code += text.slice(i, j + close.length)
      i = j + close.length
    } else if (c === '/' && next === '/') {
      const end = text.indexOf('\n', i)
      i = end === -1 ? text.length : end
    } else if (c === '/' && next === '*') {
      // Swift anida los comentarios de bloque.
      let depth = 1
      let j = i + 2
      while (j < text.length && depth > 0) {
        if (text.startsWith('/*', j)) {
          depth++
          j += 2
        } else if (text.startsWith('*/', j)) {
          depth--
          j += 2
        } else j++
      }
      i = j
    } else {
      code += c
      i++
    }
  }
  return code
}

/** El cuerpo `{ … }` de la primera función que encaja con `signature`. */
function functionBody(code, signature) {
  const m = signature.exec(code)
  if (!m) return null
  const open = code.indexOf('{', m.index + m[0].length - 1)
  if (open === -1) return null
  let depth = 0
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++
    else if (code[i] === '}' && --depth === 0) return code.slice(open + 1, i)
  }
  return null
}

/* ------------------------------------------------- 1. leer el project.pbxproj */

/**
 * El formato es un plist «OpenStep»: diccionarios `{ clave = valor; }`,
 * listas `( a, b, )`, cadenas con o sin comillas y comentarios `/* … *\/`.
 * Todo valor escalar se queda como cadena, igual que lo guarda Xcode.
 */
function tokenize(text) {
  const tokens = []
  let i = 0
  let line = 1
  const unquoted = /[A-Za-z0-9_$+\-./:]/
  while (i < text.length) {
    const c = text[i]
    if (c === '\n') {
      line++
      i++
    } else if (c === ' ' || c === '\t' || c === '\r') {
      i++
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      if (end === -1) throw new SyntaxError(`comentario sin cerrar (línea ${line})`)
      line += text.slice(i, end).split('\n').length - 1
      i = end + 2
    } else if (c === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i)
      i = end === -1 ? text.length : end
    } else if ('{}()=;,'.includes(c)) {
      tokens.push({ t: c, line })
      i++
    } else if (c === '"') {
      let value = ''
      let j = i + 1
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\') {
          const e = text[j + 1]
          value += e === 'n' ? '\n' : e === 't' ? '\t' : e
          j += 2
        } else {
          if (text[j] === '\n') line++
          value += text[j++]
        }
      }
      if (j >= text.length) throw new SyntaxError(`cadena sin cerrar (línea ${line})`)
      tokens.push({ t: 'str', v: value, line })
      i = j + 1
    } else if (unquoted.test(c)) {
      let j = i
      while (j < text.length && unquoted.test(text[j]) && !(text[j] === '/' && '*/'.includes(text[j + 1]))) j++
      tokens.push({ t: 'str', v: text.slice(i, j), line })
      i = j
    } else {
      throw new SyntaxError(`carácter inesperado «${c}» (línea ${line})`)
    }
  }
  return tokens
}

function parsePbxproj(text) {
  const tokens = tokenize(text)
  const duplicates = []
  let p = 0
  const where = (tok) => (tok ? `«${tok.v ?? tok.t}» en la línea ${tok.line}` : 'el final del fichero')
  const take = (t) => {
    const tok = tokens[p++]
    if (!tok || tok.t !== t) throw new SyntaxError(`se esperaba «${t === 'str' ? 'un valor' : t}» y hay ${where(tok)}`)
    return tok
  }
  function value(path) {
    const tok = tokens[p]
    if (tok?.t === '{') return dict(path)
    if (tok?.t === '(') return list(path)
    if (tok?.t === 'str') {
      p++
      return tok.v
    }
    throw new SyntaxError(`se esperaba un valor y hay ${where(tok)}`)
  }
  function dict(path) {
    take('{')
    const o = Object.create(null)
    while (tokens[p] && tokens[p].t !== '}') {
      const key = take('str').v
      take('=')
      const v = value(path ? `${path}.${key}` : key)
      take(';')
      if (key in o) duplicates.push(path ? `${path}.${key}` : key)
      o[key] = v
    }
    take('}')
    return o
  }
  function list(path) {
    take('(')
    const a = []
    while (tokens[p] && tokens[p].t !== ')') {
      a.push(value(path))
      if (tokens[p]?.t === ',') p++
      else break
    }
    take(')')
    return a
  }
  const root = value('')
  if (p !== tokens.length) throw new SyntaxError(`sobra contenido tras el objeto raíz: ${where(tokens[p])}`)
  return { root, duplicates }
}

section('project.pbxproj: sintaxis e integridad')

const pbxText = readFileSync(PBXPROJ, 'utf8')
let parsed = null
try {
  parsed = parsePbxproj(pbxText)
} catch (err) {
  check(false, 'project.pbxproj se puede leer', err.message)
}
if (!parsed) {
  console.log(out.join('\n'))
  console.log(`\n${out.filter((l) => l.startsWith('PASS')).length} passed, ${failures} failed`)
  process.exit(1)
}
check(true, 'project.pbxproj se puede leer')
check(parsed.duplicates.length === 0, 'ningún identificador ni clave repetidos', parsed.duplicates.join(', '))

const { root } = parsed
const objects = root.objects ?? Object.create(null)
const rootId = root.rootObject
const project = objects[rootId]
check(project?.isa === 'PBXProject', 'rootObject apunta al PBXProject', String(rootId))
if (!project) {
  console.log(out.join('\n'))
  process.exit(1)
}

const ID = /^[0-9A-F]{24}$/
const ids = Object.keys(objects)
check(
  ids.every((id) => ID.test(id)),
  `todos los objetos tienen un identificador de 24 hexadecimales (${ids.length} objetos)`,
  ids.filter((id) => !ID.test(id)).join(', '),
)

check(
  !pbxText.includes('PBXFileSystemSynchronizedRootGroup') && Number(root.objectVersion) <= 77,
  `formato de proyecto clásico, sin carpetas sincronizadas (objectVersion ${root.objectVersion})`,
)

/** Toda cadena con forma de identificador, en valores y en claves, debe existir. */
const dangling = []
function visit(value, path) {
  if (typeof value === 'string') {
    if (ID.test(value) && !(value in objects)) dangling.push(`${path} → ${value}`)
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => visit(v, `${path}[${i}]`))
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (ID.test(k) && !(k in objects)) dangling.push(`${path}.${k} (clave)`)
      visit(v, `${path}.${k}`)
    }
  }
}
for (const id of ids) visit(objects[id], `${id}(${objects[id].isa})`)
visit(rootId, 'rootObject')
check(dangling.length === 0, 'cada identificador referenciado existe', dangling.slice(0, 12).join('\n      '))

const isa = (id) => objects[id]?.isa
const PHASES = new Set([
  'PBXSourcesBuildPhase',
  'PBXFrameworksBuildPhase',
  'PBXResourcesBuildPhase',
  'PBXCopyFilesBuildPhase',
  'PBXShellScriptBuildPhase',
  'PBXHeadersBuildPhase',
])
const FILE_LIKE = new Set(['PBXFileReference', 'PBXVariantGroup', 'XCVersionGroup', 'PBXReferenceProxy'])
const GROUP_LIKE = new Set(['PBXGroup', 'PBXVariantGroup', 'XCVersionGroup'])

const buildFileProblems = []
for (const id of ids.filter((id) => isa(id) === 'PBXBuildFile')) {
  const bf = objects[id]
  if (!!bf.fileRef === !!bf.productRef) buildFileProblems.push(`${id}: necesita fileRef O productRef`)
  if (bf.fileRef && !FILE_LIKE.has(isa(bf.fileRef))) buildFileProblems.push(`${id}: fileRef ${bf.fileRef} es ${isa(bf.fileRef)}`)
  if (bf.productRef && isa(bf.productRef) !== 'XCSwiftPackageProductDependency')
    buildFileProblems.push(`${id}: productRef ${bf.productRef} es ${isa(bf.productRef)}`)
}
check(buildFileProblems.length === 0, 'cada PBXBuildFile apunta a un fichero o a un paquete que existen', buildFileProblems.join('\n      '))

// Un PBXBuildFile pertenece a una sola fase: compartirlo entre dos targets es
// la forma típica de romper un proyecto editado a mano.
const phaseOfBuildFile = new Map()
const phaseProblems = []
for (const id of ids.filter((id) => PHASES.has(isa(id)))) {
  for (const f of objects[id].files ?? []) {
    if (isa(f) !== 'PBXBuildFile') phaseProblems.push(`${id}: ${f} no es un PBXBuildFile`)
    if (phaseOfBuildFile.has(f)) phaseProblems.push(`${f} está en dos fases (${phaseOfBuildFile.get(f)} y ${id})`)
    phaseOfBuildFile.set(f, id)
  }
}
const orphanBuildFiles = ids.filter((id) => isa(id) === 'PBXBuildFile' && !phaseOfBuildFile.has(id))
check(
  phaseProblems.length === 0 && orphanBuildFiles.length === 0,
  'cada PBXBuildFile está en exactamente una fase',
  [...phaseProblems, ...orphanBuildFiles.map((id) => `${id} no está en ninguna fase`)].join('\n      '),
)

// Árbol de grupos: cada fichero cuelga de un único grupo.
const parentOf = new Map()
const groupProblems = []
for (const id of ids.filter((id) => GROUP_LIKE.has(isa(id)))) {
  for (const child of objects[id].children ?? []) {
    if (!FILE_LIKE.has(isa(child)) && !GROUP_LIKE.has(isa(child))) groupProblems.push(`${id}: hijo ${child} es ${isa(child)}`)
    if (parentOf.has(child)) groupProblems.push(`${child} cuelga de dos grupos`)
    parentOf.set(child, id)
  }
}
const unparented = ids.filter(
  (id) => (isa(id) === 'PBXFileReference' || GROUP_LIKE.has(isa(id))) && id !== project.mainGroup && !parentOf.has(id),
)
check(
  groupProblems.length === 0 && unparented.length === 0,
  'cada fichero y cada grupo cuelga de un único grupo',
  [...groupProblems, ...unparented.map((id) => `${id} (${objects[id].name ?? objects[id].path}) no está en ningún grupo`)].join(
    '\n      ',
  ),
)

/** Ruta en disco de un fichero o grupo; null si vive fuera (SDK, productos). */
function diskPath(id, seen = new Set()) {
  const o = objects[id]
  if (!o || seen.has(id)) return null
  seen.add(id)
  const own = o.path ?? ''
  switch (o.sourceTree) {
    case '<group>': {
      const parent = parentOf.get(id)
      const base = parent ? diskPath(parent, seen) : id === project.mainGroup ? join(IOS, project.projectDirPath ?? '') : null
      return base === null ? null : join(base, own)
    }
    case 'SOURCE_ROOT':
      return join(IOS, own)
    case '<absolute>':
      return own
    default:
      return null
  }
}

// Lo que genera `npx cap sync ios` (y .gitignore deja fuera de git).
const GENERATED = new Set(['ios/App/App/public', 'ios/App/App/capacitor.config.json', 'ios/App/App/config.xml'])
const missingFiles = []
const missingGenerated = []
for (const id of ids.filter((id) => isa(id) === 'PBXFileReference')) {
  const path = diskPath(id)
  if (path === null || existsSync(path)) continue
  ;(GENERATED.has(rel(path)) ? missingGenerated : missingFiles).push(rel(path))
}
check(missingFiles.length === 0, 'cada fichero del proyecto existe en disco', missingFiles.join('\n      '))
check(
  missingGenerated.length === 0,
  'existen los ficheros que genera `npx cap sync ios` (web compilada y configuración)',
  missingGenerated.join(', ') + ' — ejecuta `npm run build && npx cap sync ios`',
)

const configProblems = []
const configsOf = (listId) => {
  const list = objects[listId]
  if (list?.isa !== 'XCConfigurationList') {
    configProblems.push(`${listId} no es un XCConfigurationList`)
    return []
  }
  return (list.buildConfigurations ?? []).map((id) => {
    if (isa(id) !== 'XCBuildConfiguration') configProblems.push(`${listId}: ${id} no es un XCBuildConfiguration`)
    return { id, name: objects[id]?.name, settings: objects[id]?.buildSettings ?? {} }
  })
}

/* --------------------------------------------------------------- 2. targets */

section('targets')

const projectConfigs = configsOf(project.buildConfigurationList)
const targets = (project.targets ?? []).map((id) => ({ id, ...objects[id] }))
const byName = Object.fromEntries(targets.map((t) => [t.name, t]))
const EXPECTED = {
  App: { type: 'com.apple.product-type.application', bundle: 'com.trainingos.app', product: 'App.app' },
  TrainingOSWidgets: {
    type: 'com.apple.product-type.app-extension',
    bundle: 'com.trainingos.app.LiveActivity',
    product: 'TrainingOSWidgets.appex',
  },
  TrainingOSUITests: {
    type: 'com.apple.product-type.bundle.ui-testing',
    bundle: 'com.trainingos.app.UITests',
    product: 'TrainingOSUITests.xctest',
  },
}
check(
  targets.length === 3 && Object.keys(EXPECTED).every((n) => byName[n]),
  'tres targets: App, TrainingOSWidgets, TrainingOSUITests',
  targets.map((t) => t.name).join(', '),
)

const targetProblems = []
for (const t of targets) {
  if (t.isa !== 'PBXNativeTarget') targetProblems.push(`${t.name}: es ${t.isa}`)
  for (const ph of t.buildPhases ?? []) if (!PHASES.has(isa(ph))) targetProblems.push(`${t.name}: fase ${ph} es ${isa(ph)}`)
  if (isa(t.productReference) !== 'PBXFileReference') targetProblems.push(`${t.name}: sin productReference`)
  else if (parentOf.get(t.productReference) !== project.productRefGroup)
    targetProblems.push(`${t.name}: su producto no está en el grupo Products`)
  for (const dep of t.packageProductDependencies ?? [])
    if (isa(dep) !== 'XCSwiftPackageProductDependency') targetProblems.push(`${t.name}: paquete ${dep} es ${isa(dep)}`)
  t.configs = configsOf(t.buildConfigurationList)
  const names = t.configs.map((c) => c.name).sort().join(',')
  if (names !== 'Debug,Release') targetProblems.push(`${t.name}: configuraciones ${names}`)
}
check(
  targetProblems.length === 0 && configProblems.length === 0,
  'fases, productos y listas de configuración (Debug y Release) de cada target existen',
  [...targetProblems, ...configProblems].join('\n      '),
)

/** El valor efectivo de un ajuste: el del target o, si no lo fija, el del proyecto. */
function setting(t, config, key) {
  const own = t.configs.find((c) => c.name === config)?.settings
  if (own && key in own) return own[key]
  return projectConfigs.find((c) => c.name === config)?.settings?.[key]
}
const eachConfig = (fn) => {
  const bad = []
  for (const t of targets) for (const config of ['Debug', 'Release']) {
    const problem = fn(t, config)
    if (problem) bad.push(`${t.name}/${config}: ${problem}`)
  }
  return bad
}

for (const [name, want] of Object.entries(EXPECTED)) {
  const t = byName[name]
  check(t?.productType === want.type, `${name} es ${want.type}`, t?.productType)
  check(objects[t?.productReference]?.path === want.product, `${name} produce ${want.product}`, objects[t?.productReference]?.path)
  const bundleIds = ['Debug', 'Release'].map((c) => (t ? setting(t, c, 'PRODUCT_BUNDLE_IDENTIFIER') : undefined))
  check(bundleIds.every((v) => v === want.bundle), `${name}: identificador ${want.bundle}`, bundleIds.join(' / '))
}

const deploymentEverywhere = ids
  .filter((id) => isa(id) === 'XCBuildConfiguration')
  .filter((id) => 'IPHONEOS_DEPLOYMENT_TARGET' in objects[id].buildSettings && objects[id].buildSettings.IPHONEOS_DEPLOYMENT_TARGET !== '16.2')
const deploymentEffective = eachConfig((t, c) => {
  const v = setting(t, c, 'IPHONEOS_DEPLOYMENT_TARGET')
  return v === '16.2' ? null : `IPHONEOS_DEPLOYMENT_TARGET ${v}`
})
check(
  deploymentEverywhere.length === 0 && deploymentEffective.length === 0,
  'iOS 16.2 mínimo en el proyecto y en todos los targets',
  [...deploymentEverywhere.map((id) => `${id}: ${objects[id].buildSettings.IPHONEOS_DEPLOYMENT_TARGET}`), ...deploymentEffective].join(
    '\n      ',
  ),
)
check(
  eachConfig((t, c) => (setting(t, c, 'TARGETED_DEVICE_FAMILY') === '1' ? null : `TARGETED_DEVICE_FAMILY ${setting(t, c, 'TARGETED_DEVICE_FAMILY')}`))
    .length === 0,
  'sólo iPhone (TARGETED_DEVICE_FAMILY = 1) en todos los targets',
)

// La app y la extensión tienen que llevar la misma versión o App Store
// Connect rechaza la subida: se fija UNA vez, en el proyecto.
const versionOverrides = targets.flatMap((t) =>
  t.configs.filter((c) => 'MARKETING_VERSION' in c.settings || 'CURRENT_PROJECT_VERSION' in c.settings).map((c) => `${t.name}/${c.name}`),
)
const projectVersions = projectConfigs.map((c) => `${c.settings.MARKETING_VERSION} (${c.settings.CURRENT_PROJECT_VERSION})`)
check(
  versionOverrides.length === 0 &&
    projectConfigs.every((c) => /^\d+\.\d+\.\d+$/.test(c.settings.MARKETING_VERSION ?? '') && /^\d+$/.test(c.settings.CURRENT_PROJECT_VERSION ?? '')),
  `versión fijada sólo en el proyecto, igual para app y extensión: ${projectVersions.join(' / ')}`,
  versionOverrides.length ? `la redefinen: ${versionOverrides.join(', ')}` : undefined,
)
// La versión visible es la de package.json, la misma que enseña la app
// (__APP_VERSION__) y la que Android toma en build.gradle. En iOS no hay
// script que la copie: si se sube la versión en package.json y no aquí, las
// dos tiendas publicarían versiones distintas del mismo código.
const packageVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
check(
  projectConfigs.every((c) => c.settings.MARKETING_VERSION === packageVersion),
  `MARKETING_VERSION coincide con package.json (${packageVersion})`,
  projectVersions.join(' / '),
)
check(!/COCOAPODS/.test(pbxText), 'sin restos de CocoaPods (-D COCOAPODS)')
check(project.developmentRegion === 'en', `región de desarrollo en (${project.developmentRegion})`)
check(
  ['en', 'es'].every((r) => (project.knownRegions ?? []).includes(r)),
  `idiomas conocidos: ${(project.knownRegions ?? []).join(', ')}`,
)
check(
  !pbxText.includes('CODE_SIGN_ENTITLEMENTS') && walk(IOS, new Set(['public', 'build', 'DerivedData'])).every((f) => extname(f) !== '.entitlements'),
  'sin entitlements ni App Group: la extensión no comparte datos con la app',
)

const app = byName.App
const widget = byName.TrainingOSWidgets
const uitests = byName.TrainingOSUITests
const phasesOf = (t, kind) => (t?.buildPhases ?? []).filter((id) => isa(id) === kind)
const buildFilesOf = (phaseIds) => phaseIds.flatMap((ph) => objects[ph].files ?? []).map((bf) => objects[bf])

/** Dependencia directa `from` → `to`, con su proxy bien formado. */
function dependsOn(from, to) {
  return (from?.dependencies ?? []).some((d) => {
    const dep = objects[d]
    const proxy = objects[dep?.targetProxy]
    return (
      dep?.isa === 'PBXTargetDependency' &&
      dep.target === to?.id &&
      proxy?.isa === 'PBXContainerItemProxy' &&
      proxy.remoteGlobalIDString === to?.id &&
      proxy.containerPortal === rootId &&
      proxy.proxyType === '1'
    )
  })
}

section('extensión de la Live Activity')

check(dependsOn(app, widget), 'App depende de TrainingOSWidgets (dependencia y proxy coherentes)')
const embed = phasesOf(app, 'PBXCopyFilesBuildPhase').map((id) => ({ id, ...objects[id] }))
  .find((ph) => (ph.files ?? []).some((bf) => objects[bf]?.fileRef === widget?.productReference))
check(
  !!embed && embed.dstSubfolderSpec === '13' && embed.dstPath === '',
  'App incrusta TrainingOSWidgets.appex en PlugIns (fase «Embed Foundation Extensions», dstSubfolderSpec 13)',
  embed ? `${embed.name}: dstSubfolderSpec ${embed.dstSubfolderSpec}, dstPath «${embed.dstPath}»` : 'no hay fase que copie el .appex',
)
const embedFile = embed && (embed.files ?? []).map((bf) => objects[bf]).find((bf) => bf.fileRef === widget?.productReference)
check(
  (embedFile?.settings?.ATTRIBUTES ?? []).includes('RemoveHeadersOnCopy'),
  'el .appex se copia con RemoveHeadersOnCopy',
)
const appPhaseOrder = (app?.buildPhases ?? []).map(isa)
check(
  !!embed && appPhaseOrder.indexOf('PBXCopyFilesBuildPhase') > appPhaseOrder.indexOf('PBXResourcesBuildPhase'),
  'la copia de la extensión va después de los recursos',
  appPhaseOrder.join(' → '),
)
check(
  (widget?.packageProductDependencies ?? []).length === 0 &&
    buildFilesOf(phasesOf(widget, 'PBXFrameworksBuildPhase')).every((bf) => !bf?.productRef),
  'la extensión no enlaza CapApp-SPM (Capacitor no es seguro para extensiones)',
)
const widgetSetting = (key) => ['Debug', 'Release'].map((c) => (widget ? setting(widget, c, key) : undefined))
check(widgetSetting('SKIP_INSTALL').every((v) => v === 'YES'), 'extensión: SKIP_INSTALL = YES')
check(widgetSetting('APPLICATION_EXTENSION_API_ONLY').every((v) => v === 'YES'), 'extensión: APPLICATION_EXTENSION_API_ONLY = YES')
check(
  widgetSetting('INFOPLIST_FILE').every((v) => v === 'TrainingOSWidgets/Info.plist') &&
    widgetSetting('GENERATE_INFOPLIST_FILE').every((v) => v === 'NO'),
  'extensión: Info.plist propio (TrainingOSWidgets/Info.plist, sin generar)',
  widgetSetting('INFOPLIST_FILE').join(' / '),
)
check(
  widgetSetting('LD_RUNPATH_SEARCH_PATHS').every((v) => Array.isArray(v) && v.includes('@executable_path/../../Frameworks')),
  'extensión: encuentra los Frameworks de la app (@executable_path/../../Frameworks)',
)
check(widgetSetting('SWIFT_VERSION').every((v) => !!v), `extensión: SWIFT_VERSION ${widgetSetting('SWIFT_VERSION')[0]}`)
check(!!project.attributes?.TargetAttributes?.[widget?.id]?.CreatedOnToolsVersion, 'extensión: TargetAttributes')

section('pruebas de interfaz')

check(dependsOn(uitests, app), 'TrainingOSUITests depende de App')
check(
  ['Debug', 'Release'].every((c) => uitests && setting(uitests, c, 'TEST_TARGET_NAME') === 'App'),
  'TrainingOSUITests prueba App (TEST_TARGET_NAME)',
)
check(
  ['Debug', 'Release'].every((c) => uitests && setting(uitests, c, 'GENERATE_INFOPLIST_FILE') === 'YES'),
  'TrainingOSUITests genera su Info.plist',
)
check(
  project.attributes?.TargetAttributes?.[uitests?.id]?.TestTargetID === app?.id,
  'TargetAttributes: TestTargetID de las pruebas es App',
)

/* --------------------------------------------- 3. qué compila cada target */

section('ficheros de cada target')

/** Ficheros (rutas en disco) de las fases de un tipo, con su fileRef. */
const filesIn = (t, kind) =>
  buildFilesOf(phasesOf(t, kind))
    .filter((bf) => bf?.fileRef)
    .map((bf) => ({ ref: bf.fileRef, path: diskPath(bf.fileRef) }))

const compiledBy = new Map()
for (const t of targets) {
  for (const { path } of filesIn(t, 'PBXSourcesBuildPhase')) {
    if (!path) continue
    if (!compiledBy.has(path)) compiledBy.set(path, new Set())
    compiledBy.get(path).add(t.name)
  }
}

const SOURCE_DIRS = [
  { dir: join(IOS, 'App'), targets: ['App'] },
  { dir: join(IOS, 'Shared'), targets: ['App', 'TrainingOSWidgets'] },
  { dir: join(IOS, 'TrainingOSWidgets'), targets: ['TrainingOSWidgets'] },
  { dir: join(IOS, 'TrainingOSUITests'), targets: ['TrainingOSUITests'] },
]
const swiftOnDisk = SOURCE_DIRS.flatMap(({ dir, targets: want }) =>
  walk(dir, new Set(['public'])).filter((f) => extname(f) === '.swift').map((f) => ({ path: f, want })),
)
const wrongTargets = []
for (const { path, want } of swiftOnDisk) {
  const got = [...(compiledBy.get(path) ?? [])].sort()
  if (got.join(',') !== [...want].sort().join(',')) wrongTargets.push(`${rel(path)}: ${got.join(', ') || 'nadie'} (debería: ${want.join(', ')})`)
}
const strays = [...compiledBy.keys()].filter(
  (p) => extname(p) === '.swift' && !SOURCE_DIRS.some(({ dir }) => p.startsWith(dir + sep)),
)
check(
  wrongTargets.length === 0 && strays.length === 0,
  `cada fichero Swift lo compila su target y sólo el suyo (${swiftOnDisk.length} en disco)`,
  [...wrongTargets, ...strays.map((p) => `${rel(p)}: fuera de App/, Shared/, TrainingOSWidgets/ y TrainingOSUITests/`)].join(
    '\n      ',
  ),
)

const REQUIRED_SOURCES = {
  App: [
    'App/AppDelegate.swift',
    'App/SceneDelegate.swift',
    'App/MainViewController.swift',
    'App/WorkoutNotificationPlugin.swift',
    'App/LiveActivityPreviewRenderer.swift',
    'Shared/WorkoutActivityAttributes.swift',
    'Shared/WorkoutActivityViews.swift',
  ],
  TrainingOSWidgets: [
    'TrainingOSWidgets/TrainingOSWidgetsBundle.swift',
    'TrainingOSWidgets/WorkoutLiveActivityWidget.swift',
    'Shared/WorkoutActivityAttributes.swift',
    'Shared/WorkoutActivityViews.swift',
  ],
}
for (const [name, files] of Object.entries(REQUIRED_SOURCES)) {
  const missing = files.filter((f) => !compiledBy.get(join(IOS, f))?.has(name) || !existsSync(join(IOS, f)))
  check(missing.length === 0, `${name} compila ${files.length} ficheros obligatorios y existen`, missing.join(', '))
}
check(
  swiftOnDisk.some(({ path }) => compiledBy.get(path)?.has('TrainingOSUITests')),
  'TrainingOSUITests compila al menos un fichero de pruebas',
)

// Los dos de Shared/: un mismo PBXFileReference, un PBXBuildFile por target.
const sharedRefs = (t) => filesIn(t, 'PBXSourcesBuildPhase').filter((f) => f.path?.startsWith(join(IOS, 'Shared') + sep)).map((f) => f.ref)
check(
  sharedRefs(app).length >= 2 && sharedRefs(app).sort().join() === sharedRefs(widget).sort().join(),
  'Shared/ entra en la app y en la extensión con la misma referencia de fichero',
)

const appResources = filesIn(app, 'PBXResourcesBuildPhase')
check(
  appResources.some((f) => basename(f.path ?? '') === 'PrivacyInfo.xcprivacy'),
  'PrivacyInfo.xcprivacy va en los recursos de la app',
)
const infoStrings = appResources.map((f) => objects[f.ref]).find((o) => o?.isa === 'PBXVariantGroup' && o.name === 'InfoPlist.strings')
const variants = (infoStrings?.children ?? []).map((c) => objects[c]).map((c) => `${c?.name}:${c?.path}`).sort()
check(
  variants.join() === 'en:en.lproj/InfoPlist.strings,es:es.lproj/InfoPlist.strings',
  'InfoPlist.strings (en, es) va en los recursos de la app',
  variants.join(', ') || 'no está',
)
const plistInResources = targets.flatMap((t) =>
  filesIn(t, 'PBXResourcesBuildPhase').filter((f) => basename(f.path ?? '') === 'Info.plist').map(() => t.name),
)
check(plistInResources.length === 0, 'ningún Info.plist se copia como recurso (choca con el que genera Xcode)', plistInResources.join(', '))

/* ---------------------------------------------------------- 4. el esquema */

section('esquema compartido')

/** Etiquetas equilibradas y comentarios cerrados (como en scripts/android). */
function xmlProblem(text) {
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
    if (text.slice(start + 4, end).includes('--')) return 'comentario con "--" dentro'
    i = end + 3
  }
  const stack = []
  const tag = /<\/?([A-Za-z_][\w.:-]*)([^>]*?)(\/?)>/g
  let m
  while ((m = tag.exec(stripped))) {
    const [whole, name, , selfClose] = m
    if (whole.startsWith('</')) {
      const open = stack.pop()
      if (open !== name) return `</${name}> cierra <${open ?? 'nada'}>`
    } else if (!selfClose) stack.push(name)
  }
  if (stack.length) return `sin cerrar: <${stack.join('>, <')}>`
  return null
}

const schemeText = readOpt(SCHEME)
check(schemeText !== null, 'existe el esquema compartido App.xcscheme', rel(SCHEME))
if (schemeText !== null) {
  const problem = xmlProblem(schemeText)
  check(problem === null && schemeText.startsWith('<?xml'), 'App.xcscheme es XML bien formado', problem)
  const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`))?.[1]
  const refs = [...schemeText.matchAll(/<BuildableReference\b[^>]*>/g)].map((m) => m[0])
  const badRefs = refs.filter((r) => {
    const t = objects[attr(r, 'BlueprintIdentifier')]
    return (
      t?.isa !== 'PBXNativeTarget' ||
      t.name !== attr(r, 'BlueprintName') ||
      objects[t.productReference]?.path !== attr(r, 'BuildableName') ||
      attr(r, 'ReferencedContainer') !== 'container:App.xcodeproj'
    )
  })
  check(
    refs.length > 0 && badRefs.length === 0,
    `cada BuildableReference del esquema apunta a un target real (${refs.length})`,
    badRefs.join('\n      '),
  )
  const block = (name) => schemeText.match(new RegExp(`<${name}\\b[\\s\\S]*?</${name}>`))?.[0] ?? ''
  const build = block('BuildAction')
  check(
    attr(build, 'buildImplicitDependencies') === 'YES' && attr(build, 'parallelizeBuildables') === 'YES' && build.includes(`"${app?.id}"`),
    'BuildAction compila App con dependencias implícitas (y, con ellas, la extensión)',
  )
  check(block('TestAction').includes(`"${uitests?.id}"`), 'TestAction ejecuta TrainingOSUITests')
  check(
    attr(block('LaunchAction'), 'buildConfiguration') === 'Debug' && block('LaunchAction').includes(`"${app?.id}"`),
    'LaunchAction lanza App en Debug',
  )
  check(attr(block('ArchiveAction'), 'buildConfiguration') === 'Release', 'ArchiveAction archiva en Release')
}

/* ------------------------------------------------------ 5. los Info.plist */

/** Un lector de plist XML mínimo: dict, array, string, integer, real, bool. */
function parsePlist(text) {
  const clean = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/g, '')
  const tokens = []
  const re = /<(\/)?([A-Za-z]+)[^>]*?(\/)?>|([^<]+)/g
  let m
  while ((m = re.exec(clean))) {
    if (m[2]) tokens.push({ kind: m[1] ? 'close' : m[3] ? 'empty' : 'open', name: m[2] })
    else if (m[4].trim()) tokens.push({ kind: 'text', text: m[4] })
  }
  let i = 0
  const decode = (s) =>
    s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  const expect = (kind, name) => {
    const t = tokens[i++]
    if (!t || t.kind !== kind || (name && t.name !== name)) throw new SyntaxError(`se esperaba <${kind === 'close' ? '/' : ''}${name}>`)
    return t
  }
  const textUntil = (name) => {
    const s = tokens[i]?.kind === 'text' ? tokens[i++].text : ''
    expect('close', name)
    return decode(s)
  }
  function value() {
    const t = tokens[i++]
    if (t?.kind === 'empty') {
      const empty = { true: true, false: false, string: '', dict: {}, array: [] }
      if (t.name in empty) return empty[t.name]
    }
    if (t?.kind !== 'open') throw new SyntaxError(`valor inesperado: ${JSON.stringify(t)}`)
    switch (t.name) {
      case 'dict': {
        const o = {}
        while (!(tokens[i]?.kind === 'close' && tokens[i].name === 'dict')) {
          expect('open', 'key')
          const k = textUntil('key')
          o[k] = value()
        }
        i++
        return o
      }
      case 'array': {
        const a = []
        while (!(tokens[i]?.kind === 'close' && tokens[i].name === 'array')) a.push(value())
        i++
        return a
      }
      case 'string':
      case 'date':
      case 'data':
        return textUntil(t.name)
      case 'integer':
      case 'real':
        return Number(textUntil(t.name))
      default:
        throw new SyntaxError(`etiqueta desconocida <${t.name}>`)
    }
  }
  expect('open', 'plist')
  const v = value()
  expect('close', 'plist')
  return v
}

/** Lee un plist; si falta o no se puede leer, lo anota como fallo y da null. */
function plistAt(path, label) {
  const text = readOpt(path)
  if (text === null) {
    check(false, `${label} existe`, rel(path))
    return null
  }
  try {
    const value = parsePlist(text)
    check(true, `${label} se puede leer`)
    return { value, text: text.replace(/<!--[\s\S]*?-->/g, '') }
  } catch (err) {
    check(false, `${label} se puede leer`, err.message)
    return null
  }
}

/** `"clave" = "valor";` — el formato de los .strings. */
function parseStrings(text) {
  const body = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const entry = /"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;/g
  const entries = {}
  for (const m of body.matchAll(entry)) entries[m[1]] = m[2]
  return { entries, wellFormed: body.replace(entry, '').trim() === '' }
}

section('Info.plist de la app')

const appPlist = plistAt(join(IOS, 'App/Info.plist'), 'App/Info.plist')
if (appPlist) {
  const p = appPlist.value
  check(p.NSSupportsLiveActivities === true, 'NSSupportsLiveActivities = true')
  check(
    (p.CFBundleURLTypes ?? []).some((t) => (t.CFBundleURLSchemes ?? []).includes('trainingos')),
    'declara el esquema de enlace trainingos://',
  )
  check(typeof p.NSCameraUsageDescription === 'string' && p.NSCameraUsageDescription.length > 0, 'NSCameraUsageDescription presente')
  check(
    ['es', 'en'].every((l) => (p.CFBundleLocalizations ?? []).includes(l)),
    `CFBundleLocalizations: ${(p.CFBundleLocalizations ?? []).join(', ')}`,
  )
  const orientations = Object.entries(p).filter(([k]) => k.startsWith('UISupportedInterfaceOrientations'))
  check(
    orientations.length > 0 &&
      orientations.every(([, v]) => Array.isArray(v) && v.length === 1 && v[0] === 'UIInterfaceOrientationPortrait'),
    'sólo vertical',
    orientations.map(([k, v]) => `${k}: ${[].concat(v).join(', ')}`).join('; '),
  )
  check(!/NSAllowsArbitraryLoads/.test(appPlist.text), 'sin NSAllowsArbitraryLoads: nada de HTTP en claro')
  check(!('UIBackgroundModes' in p), 'sin UIBackgroundModes: la app no se queda viva en segundo plano')
  check(p.ITSAppUsesNonExemptEncryption === false, 'ITSAppUsesNonExemptEncryption = false')
  const caps = p.UIRequiredDeviceCapabilities
  check(
    Array.isArray(caps) ? caps.includes('arm64') : caps?.arm64 === true,
    'UIRequiredDeviceCapabilities: arm64',
    JSON.stringify(caps),
  )
  check(
    p.CFBundleShortVersionString === '$(MARKETING_VERSION)' && p.CFBundleVersion === '$(CURRENT_PROJECT_VERSION)',
    'la versión sale de los ajustes del proyecto',
  )
}

for (const lang of ['en', 'es']) {
  const path = join(IOS, `App/${lang}.lproj/InfoPlist.strings`)
  const text = readOpt(path)
  const parsedStrings = text === null ? null : parseStrings(text)
  check(
    !!parsedStrings?.wellFormed && !!parsedStrings.entries.NSCameraUsageDescription,
    `${lang}.lproj/InfoPlist.strings está bien formado y traduce NSCameraUsageDescription`,
    text === null ? 'no existe' : undefined,
  )
}

section('Info.plist de la extensión')

const widgetPlist = plistAt(join(IOS, 'TrainingOSWidgets/Info.plist'), 'TrainingOSWidgets/Info.plist')
if (widgetPlist) {
  const p = widgetPlist.value
  check(
    p.NSExtension?.NSExtensionPointIdentifier === 'com.apple.widgetkit-extension',
    'NSExtensionPointIdentifier = com.apple.widgetkit-extension',
    p.NSExtension?.NSExtensionPointIdentifier,
  )
  check(
    !p.NSExtension?.NSExtensionPrincipalClass && !p.NSExtension?.NSExtensionMainStoryboard,
    'sin clase principal ni storyboard: WidgetKit arranca por @main',
  )
  const required = {
    CFBundleExecutable: '$(EXECUTABLE_NAME)',
    CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
    CFBundleShortVersionString: '$(MARKETING_VERSION)',
    CFBundleVersion: '$(CURRENT_PROJECT_VERSION)',
  }
  const wrong = Object.entries(required).filter(([k, v]) => p[k] !== v).map(([k]) => `${k} = ${p[k]}`)
  check(
    wrong.length === 0 && ['$(PRODUCT_BUNDLE_PACKAGE_TYPE)', 'XPC!'].includes(p.CFBundlePackageType),
    'claves de bundle completas y versión igual que la app (no se genera el Info.plist)',
    [...wrong, `CFBundlePackageType = ${p.CFBundlePackageType}`].join(', '),
  )
}

/* -------------------------------------------- 6. el contrato con JavaScript */

section('contrato nativo (docs/NATIVE-CONTRACT.md)')

const swift = (relPath) => {
  const text = readOpt(join(IOS, relPath))
  return text === null ? null : swiftCode(text)
}
const missingNote = (relPath) => `falta ios/App/${relPath}`

const pluginCode = swift('App/WorkoutNotificationPlugin.swift')
const tsText = readOpt(join(ROOT, 'src/lib/native/workoutNotification.ts')) ?? ''
const tsName = tsText.match(/registerPlugin(?:<[^>]*>)?\(\s*['"]([^'"]+)['"]/)?.[1]
const jsName = pluginCode?.match(/\bjsName\s*=\s*"([^"]+)"/)?.[1]
check(
  !!jsName && jsName === tsName,
  `el plugin se llama igual en Swift y en TypeScript (${jsName} / ${tsName})`,
  pluginCode === null ? missingNote('App/WorkoutNotificationPlugin.swift') : undefined,
)
check(
  !!pluginCode && /class\s+WorkoutNotificationPlugin\s*:\s*CAPPlugin\s*,\s*CAPBridgedPlugin\b/.test(pluginCode) &&
    /\bidentifier\s*=\s*"WorkoutNotificationPlugin"/.test(pluginCode),
  'WorkoutNotificationPlugin es CAPPlugin + CAPBridgedPlugin con su identifier',
)

// Los métodos del bloque `plugin WorkoutNotification { … }` del contrato.
// `addListener` no va en pluginMethods: lo atiende CapacitorBridge para
// cualquier plugin (también removeListener y removeAllListeners).
const contract = readOpt(join(ROOT, 'docs/NATIVE-CONTRACT.md')) ?? ''
const contractBlock = contract.match(/plugin WorkoutNotification \{([\s\S]*?)\n\}/)?.[1] ?? ''
const contractMethods = [...contractBlock.matchAll(/^\s*(\w+)\(/gm)].map((m) => m[1]).filter((n) => n !== 'addListener')
const declared = new Set([...(pluginCode ?? '').matchAll(/CAPPluginMethod\(\s*name:\s*"([^"]+)"/g)].map((m) => m[1]))
const undeclared = contractMethods.filter((n) => !declared.has(n))
check(
  contractMethods.length >= 9 && undeclared.length === 0,
  `pluginMethods declara los ${contractMethods.length} métodos del contrato`,
  contractMethods.length < 9 ? 'no se pudo leer el bloque del plugin en el contrato' : `faltan: ${undeclared.join(', ')}`,
)
// Un nombre en pluginMethods sin su función @objc deja la promesa colgada.
const unimplemented = [...declared].filter(
  (n) => !new RegExp(`@objc\\b[^{}]*?\\bfunc\\s+${n}\\s*\\(\\s*_\\s+\\w+\\s*:\\s*CAPPluginCall\\s*\\)`).test(pluginCode ?? ''),
)
check(
  declared.size > 0 && unimplemented.length === 0,
  'cada método declarado tiene su @objc func (_ call: CAPPluginCall)',
  unimplemented.join(', '),
)

const mainVC = swift('App/MainViewController.swift')
const didLoad = (mainVC && functionBody(mainVC, /\bfunc\s+capacitorDidLoad\s*\(\s*\)/g)) ?? ''
/** `registerPluginInstance(WorkoutNotificationPlugin())`, directo o con la instancia en una constante. */
const registersPlugin = (body) => {
  if (/registerPluginInstance\(\s*WorkoutNotificationPlugin\(\s*\)\s*\)/.test(body)) return true
  const name = body.match(/\b(?:let|var)\s+(\w+)\s*(?::\s*WorkoutNotificationPlugin\s*)?=\s*WorkoutNotificationPlugin\(\s*\)/)?.[1]
  return !!name && new RegExp(`registerPluginInstance\\(\\s*${name}\\s*\\)`).test(body)
}
check(
  !!mainVC && /class\s+MainViewController\s*:\s*CAPBridgeViewController\b/.test(mainVC) &&
    /override\b[^{]*\bfunc\s+capacitorDidLoad\s*\(\s*\)/.test(mainVC) &&
    registersPlugin(didLoad),
  'MainViewController registra WorkoutNotificationPlugin en capacitorDidLoad()',
  mainVC === null ? missingNote('App/MainViewController.swift') : undefined,
)
const sceneDelegate = swift('App/SceneDelegate.swift')
check(
  !!sceneDelegate && /\bMainViewController\(\s*\)/.test(sceneDelegate) && !/\bCAPBridgeViewController\(\s*\)/.test(sceneDelegate),
  'SceneDelegate crea MainViewController() (no CAPBridgeViewController())',
)

const widgetSide = ['Shared/WorkoutActivityAttributes.swift', 'Shared/WorkoutActivityViews.swift', 'TrainingOSWidgets/TrainingOSWidgetsBundle.swift', 'TrainingOSWidgets/WorkoutLiveActivityWidget.swift']
const widgetCode = widgetSide.map(swift)
const widgetAll = widgetCode.filter((c) => c !== null).join('\n')
check(
  widgetCode.every((c) => c !== null),
  'existen los ficheros de la extensión y de Shared/',
  widgetSide.filter((_, i) => widgetCode[i] === null).join(', '),
)
check(
  /Text\(\s*timerInterval:/.test(widgetAll) && /countsDown\s*:/.test(widgetAll),
  'la cuenta atrás la pinta el sistema: Text(timerInterval:countsDown:)',
)
check(
  /ActivityConfiguration\(\s*for:\s*WorkoutActivityAttributes\.self/.test(widgetAll) && /@main\b/.test(widgetCode[2] ?? ''),
  'la extensión declara @main y ActivityConfiguration(for: WorkoutActivityAttributes.self)',
)
check(
  !/^\s*import\s+Capacitor\b/m.test(widgetAll),
  'nada de lo que compila la extensión importa Capacitor',
)
// Regla 2 del contrato: el texto llega traducido desde JavaScript. Un
// `Text("…")` literal es un LocalizedStringKey y se traduciría (o no) por su cuenta.
check(
  !/\bText\(\s*"/.test(widgetAll) && !/\bLocalizedStringKey\b/.test(widgetAll),
  'la extensión no usa LocalizedStringKey: Text(verbatim:) o variables String',
)

const activityCode = [pluginCode, swift('App/LiveActivityPreviewRenderer.swift'), widgetCode[0], widgetCode[1]]
  .filter((c) => c !== null)
  .join('\n')
check(
  /\.request\(\s*attributes:[\s\S]{0,200}?\bcontent:/.test(activityCode) &&
    /\bActivityContent\s*\(/.test(activityCode) &&
    /\bstaleDate\s*:/.test(activityCode),
  'ActivityKit 16.2: request(attributes:content:) con ActivityContent y staleDate',
)
check(
  !/\bcontentState\s*:/.test(activityCode) && !/\.(update|end)\(\s*using\s*:/.test(activityCode),
  'sin las API retiradas en 16.2 (contentState:, update(using:), end(using:))',
)
check(/\.update\(/.test(activityCode) && /\.end\(/.test(activityCode), 'la actividad se actualiza (upsert) y se termina')

section('capacitor.config.ts')

const capConfig = readOpt(join(ROOT, 'capacitor.config.ts')) ?? ''
check(/appId: 'com\.trainingos\.app'/.test(capConfig), 'capacitor.config.ts declara com.trainingos.app')
check(/appName: 'Training OS'/.test(capConfig), 'capacitor.config.ts declara Training OS')
check(/webDir: 'dist'/.test(capConfig), 'capacitor.config.ts apunta a dist')
check(!/server:\s*{[^}]*url:/s.test(capConfig), 'no hay un server.url apuntando el WebView a un servidor remoto')

/* ------------------------------------------ 7. lo que revisa App Store Connect */

section('secretos, icono y privacidad')

let gitFiles = null
try {
  gitFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).split('\0')
} catch (err) {
  check(false, 'git ls-files', err.message)
}
if (gitFiles) {
  const secrets = gitFiles.filter((f) => /\.(p8|p12|mobileprovision|cer)$/i.test(f) || basename(f) === 'GoogleService-Info.plist')
  check(
    secrets.length === 0,
    'git no lleva (ni llevaría con `git add`) certificados, perfiles, claves .p8 ni GoogleService-Info.plist',
    secrets.join(', '),
  )
}

const iconSet = join(IOS, 'App/Assets.xcassets/AppIcon.appiconset')
let iconFile = null
try {
  iconFile = JSON.parse(readFileSync(join(iconSet, 'Contents.json'), 'utf8')).images?.find((im) => im.size === '1024x1024')?.filename
} catch {
  /* Se informa abajo. */
}
const png = iconFile ? (() => { try { return readFileSync(join(iconSet, iconFile)) } catch { return null } })() : null
const isPng = !!png && png.subarray(1, 4).toString('ascii') === 'PNG' && png.subarray(12, 16).toString('ascii') === 'IHDR'
const width = isPng ? png.readUInt32BE(16) : 0
const height = isPng ? png.readUInt32BE(20) : 0
const colorType = isPng ? png[25] : -1
check(
  isPng && width === 1024 && height === 1024 && colorType === 2,
  'el icono es un PNG de 1024×1024 sin canal alfa (RGB, tipo de color 2)',
  iconFile ? `${iconFile}: ${width}×${height}, tipo de color ${colorType}` : 'no hay imagen 1024x1024 en AppIcon.appiconset',
)

const privacy = plistAt(join(IOS, 'App/PrivacyInfo.xcprivacy'), 'PrivacyInfo.xcprivacy')
if (privacy) {
  const p = privacy.value
  const reasons = (type) =>
    (p.NSPrivacyAccessedAPITypes ?? []).find((t) => t.NSPrivacyAccessedAPIType === `NSPrivacyAccessedAPICategory${type}`)
      ?.NSPrivacyAccessedAPITypeReasons ?? []
  check(p.NSPrivacyTracking === false, 'NSPrivacyTracking = false')
  check(reasons('UserDefaults').includes('CA92.1'), 'declara UserDefaults (CA92.1)')
  check(reasons('FileTimestamp').includes('C617.1'), 'declara FileTimestamp (C617.1)')
}

/* ------------------------------------------------------------------ informe */

console.log(out.join('\n').trim())
console.log(`\n${out.filter((l) => l.startsWith('PASS')).length} passed, ${failures} failed`)
if (failures > 0) process.exit(1)
