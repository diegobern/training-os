/**
 * TRAINING OS — generador de los recursos gráficos nativos de iOS.
 *
 *   node scripts/ios/brand-assets.mjs
 *
 * La plantilla de Capacitor trae SU logotipo en el icono y en la pantalla de
 * arranque. Este script los sustituye por la marca real partiendo de la misma
 * fuente de verdad que Android (`scripts/android/brand-assets.mjs`): el trazado
 * del rayo de `public/favicon.svg`.
 *
 *   - `AppIcon.appiconset/AppIcon-512@2x.png`: 1024×1024, a sangre (iOS
 *     recorta las esquinas él mismo) y SIN canal alfa. App Store Connect
 *     rechaza un icono con transparencia aunque sea opaco de verdad, así que
 *     el PNG se reescribe como RGB (tipo de color 2).
 *   - `Splash.imageset/splash-2732x2732*.png`: el rayo centrado sobre el fondo
 *     de marca, el mismo que ve Android al arrancar. La pantalla de arranque y
 *     el plugin SplashScreen usan esta misma imagen a pantalla completa.
 *
 * Se rasteriza con Chromium (Playwright), igual que en Android, para obtener
 * el mismo resultado en cualquier máquina.
 */
import { chromium } from 'playwright'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync, deflateSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ASSETS = resolve(ROOT, 'ios/App/App/Assets.xcassets')

const INK = '#0A0B0D'
const BOLT = '#CDFF4F'
const BOLT_PATH = 'M40.6 6.4 14.9 32.5h11.3L24.4 57.6 50.1 30.2H38.1Z'

async function assertPathMatchesFavicon() {
  const svg = await readFile(resolve(ROOT, 'public/favicon.svg'), 'utf8')
  if (!svg.includes(BOLT_PATH)) {
    throw new Error('El trazado del rayo ya no coincide con public/favicon.svg: actualiza BOLT_PATH.')
  }
}

/** Icono a sangre: iOS aplica su propia máscara, aquí no hay esquinas. */
function iconSvg(size) {
  // El rayo ocupa la misma fracción que en el favicon (51,2 de 64 de alto),
  // reducida un poco para respetar el margen óptico de los iconos de iOS.
  const boltH = size * 0.62
  const boltW = (boltH * 35.2) / 51.2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${INK}"/>
  <svg x="${(size - boltW) / 2}" y="${(size - boltH) / 2}" width="${boltW}" height="${boltH}" viewBox="14.9 6.4 35.2 51.2">
    <path d="${BOLT_PATH}" fill="${BOLT}"/>
  </svg>
</svg>`
}

function splashSvg(size) {
  const boltH = size * 0.12
  const boltW = (boltH * 35.2) / 51.2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${INK}"/>
  <svg x="${(size - boltW) / 2}" y="${(size - boltH) / 2}" width="${boltW}" height="${boltH}" viewBox="14.9 6.4 35.2 51.2">
    <path d="${BOLT_PATH}" fill="${BOLT}"/>
  </svg>
</svg>`
}

/* ------------------------------------------------------------ PNG sin alfa */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/**
 * Lee el PNG RGBA de 8 bits que entrega Chromium y lo reescribe como RGB.
 * Sólo cubre lo que Chromium produce (sin entrelazado, profundidad 8), y
 * falla en voz alta si recibe otra cosa en vez de escribir una imagen rota.
 */
function toOpaqueRgbPng(png) {
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('No es un PNG')
  let pos = 8
  let width = 0
  let height = 0
  let colorType = -1
  const idat = []
  while (pos < png.length) {
    const len = png.readUInt32BE(pos)
    const type = png.toString('ascii', pos + 4, pos + 8)
    const data = png.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const depth = data[8]
      colorType = data[9]
      const interlace = data[12]
      if (depth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) {
        throw new Error(`PNG no soportado (profundidad ${depth}, color ${colorType}, entrelazado ${interlace})`)
      }
    } else if (type === 'IDAT') idat.push(data)
    pos += 12 + len
  }
  const bpp = colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const pixels = Buffer.alloc(height * stride)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const out = pixels.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0
      const b = prev[x]
      const c = x >= bpp ? prev[x - bpp] : 0
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (filter !== 0) throw new Error(`Filtro PNG desconocido: ${filter}`)
      out[x] = v & 0xff
    }
    prev = out
  }
  // RGB, filtro 0 en cada línea.
  const rgb = Buffer.alloc(height * (width * 3 + 1))
  for (let y = 0; y < height; y++) {
    rgb[y * (width * 3 + 1)] = 0
    for (let x = 0; x < width; x++) {
      const src = y * stride + x * bpp
      const dst = y * (width * 3 + 1) + 1 + x * 3
      rgb[dst] = pixels[src]
      rgb[dst + 1] = pixels[src + 1]
      rgb[dst + 2] = pixels[src + 2]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2 // RGB, sin alfa
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rgb, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

async function main() {
  await assertPathMatchesFavicon()
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXE || process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage()

  async function raster(svg, size) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<!doctype html><html><body style="margin:0;padding:0">${svg}</body></html>`)
    return toOpaqueRgbPng(await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } }))
  }

  const icon = await raster(iconSvg(1024), 1024)
  await mkdir(`${ASSETS}/AppIcon.appiconset`, { recursive: true })
  await writeFile(`${ASSETS}/AppIcon.appiconset/AppIcon-512@2x.png`, icon)

  const splash = await raster(splashSvg(2732), 2732)
  await mkdir(`${ASSETS}/Splash.imageset`, { recursive: true })
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    await writeFile(`${ASSETS}/Splash.imageset/${name}`, splash)
  }

  await browser.close()
  console.log(
    `ios brand-assets: icono 1024 RGB (${(icon.length / 1024).toFixed(1)} KB) y 3 splash 2732 (${(splash.length / 1024).toFixed(1)} KB c/u)`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
