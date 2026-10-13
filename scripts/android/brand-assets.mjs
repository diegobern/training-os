/**
 * TRAINING OS — generador de los recursos gráficos nativos de Android.
 *
 *   node scripts/android/brand-assets.mjs
 *
 * Capacitor crea el proyecto Android con SU logotipo (el capacitor azul
 * turquesa) en los iconos y en la pantalla de arranque. Este script los
 * sustituye por la marca real, partiendo de una única fuente de verdad: el
 * trazado del rayo de `public/favicon.svg`. Si el logotipo cambia, se cambia
 * ahí y se vuelve a ejecutar esto.
 *
 * Los iconos adaptativos (Android 8+) son XML vectorial y se escriben a mano
 * en `res/drawable/ic_launcher_foreground.xml`. Lo que genera este script son
 * los mapas de bits que siguen haciendo falta:
 *
 *   - `mipmap-<densidad>/ic_launcher.png` y `ic_launcher_round.png`, que sólo usan
 *     Android 7.0 y 7.1 (minSdk es 24; de API 26 en adelante manda el XML).
 *   - `drawable-port-<densidad>/splash.png` y su pareja en horizontal, el respaldo
 *     de la pantalla de arranque.
 *
 * Se rasteriza con Chromium (Playwright) porque es el único rasterizador de
 * SVG que este proyecto ya tiene instalado y porque da el mismo resultado en
 * cualquier máquina. ImageMagick aquí no sirve: necesita el delegado
 * `rsvg-convert`, que no está.
 */
import { chromium } from 'playwright'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const RES = resolve(ROOT, 'android/app/src/main/res')

const INK = '#0A0B0D'
const BOLT = '#CDFF4F'

/** El trazado del rayo, en su sistema de coordenadas original de 64x64. */
const BOLT_PATH = 'M40.6 6.4 14.9 32.5h11.3L24.4 57.6 50.1 30.2H38.1Z'

/** Comprueba que el trazado sigue siendo el mismo que el del favicon. */
async function assertPathMatchesFavicon() {
  const svg = await readFile(resolve(ROOT, 'public/favicon.svg'), 'utf8')
  if (!svg.includes(BOLT_PATH)) {
    throw new Error(
      'El trazado del rayo de este script ya no coincide con public/favicon.svg.\n' +
        'Actualiza BOLT_PATH aquí y ic_launcher_foreground.xml antes de seguir.',
    )
  }
}

/**
 * Icono de lanzador clásico: rayo sobre fondo de marca, con la esquina
 * redondeada en la misma proporción que el favicon (14 de 64 = 21,9%).
 */
function launcherSvg(size, round) {
  const r = round ? 32 : 14
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
  <rect width="64" height="64" rx="${r}" ry="${r}" fill="${INK}"/>
  <path d="${BOLT_PATH}" fill="${BOLT}"/>
</svg>`
}

/**
 * Pantalla de arranque: el rayo centrado sobre el fondo de marca, a una
 * fracción fija del lado menor, para que se vea igual en vertical y en
 * horizontal y en cualquier densidad.
 */
function splashSvg(w, h) {
  const boltH = Math.min(w, h) * 0.22
  const boltW = (boltH * 35.2) / 51.2 // proporción real del trazado
  const x = (w - boltW) / 2
  const y = (h - boltH) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${INK}"/>
  <svg x="${x}" y="${y}" width="${boltW}" height="${boltH}" viewBox="14.9 6.4 35.2 51.2">
    <path d="${BOLT_PATH}" fill="${BOLT}"/>
  </svg>
</svg>`
}

const DENSITIES = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
]

const SPLASHES = [
  ['drawable-port-mdpi', 320, 480],
  ['drawable-port-hdpi', 480, 800],
  ['drawable-port-xhdpi', 720, 1280],
  ['drawable-port-xxhdpi', 960, 1600],
  ['drawable-port-xxxhdpi', 1280, 1920],
  ['drawable-land-mdpi', 480, 320],
  ['drawable-land-hdpi', 800, 480],
  ['drawable-land-xhdpi', 1280, 720],
  ['drawable-land-xxhdpi', 1600, 960],
  ['drawable-land-xxxhdpi', 1920, 1280],
  ['drawable', 480, 320],
]

/**
 * Chromium puede venir de tres sitios, y conviene no atarse a ninguno:
 * de `CHROMIUM_PATH` si quien ejecuta esto lo indica, del navegador que
 * Playwright haya descargado por su cuenta (el caso normal en un portátil con
 * `npx playwright install`), o de una instalación compartida en
 * `/opt/pw-browsers`, que es como está montado el entorno de integración.
 * Devolver `undefined` deja que Playwright use el suyo.
 */
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const shared = '/opt/pw-browsers'
  if (!existsSync(shared)) return undefined
  const entries = readdirSync(shared)
  // `headless_shell` primero, a propósito: los Chromium recientes ya no
  // aceptan el `--headless=old` que pide esta versión de Playwright, y el
  // shell es justo la implementación independiente de ese modo antiguo.
  const shells = entries
    .filter((e) => e.includes('headless_shell'))
    .map((e) => `${shared}/${e}/chrome-linux/headless_shell`)
  const fulls = entries
    .filter((e) => e.startsWith('chromium'))
    .map((e) => `${shared}/${e}/chrome-linux/chrome`)
  return [...shells, ...fulls].find((candidate) => existsSync(candidate))
}

async function main() {
  await assertPathMatchesFavicon()

  const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] })
  const page = await browser.newPage()

  /** Rasteriza un SVG a PNG exactamente al tamaño pedido, sin fondo añadido. */
  async function raster(svg, w, h, out) {
    await page.setViewportSize({ width: w, height: h })
    await page.setContent(
      `<!doctype html><html><body style="margin:0;padding:0;background:transparent">${svg}</body></html>`,
    )
    const shot = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } })
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, shot)
    return shot.length
  }

  let written = 0
  let bytes = 0

  for (const [density, size] of DENSITIES) {
    bytes += await raster(launcherSvg(size, false), size, size, `${RES}/mipmap-${density}/ic_launcher.png`)
    bytes += await raster(launcherSvg(size, true), size, size, `${RES}/mipmap-${density}/ic_launcher_round.png`)
    written += 2
  }

  for (const [dir, w, h] of SPLASHES) {
    bytes += await raster(splashSvg(w, h), w, h, `${RES}/${dir}/splash.png`)
    written += 1
  }

  await browser.close()
  console.log(`brand-assets: ${written} PNG escritos (${(bytes / 1024).toFixed(1)} KB) en android/app/src/main/res`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
