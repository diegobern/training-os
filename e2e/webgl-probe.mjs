import { chromium } from 'playwright'
for (const args of [
  ['--no-sandbox'],
  ['--no-sandbox', '--enable-unsafe-swiftshader'],
  ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
]) {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args })
  const p = await (await b.newContext()).newPage()
  await p.goto('about:blank')
  const info = await p.evaluate(() => {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    if (!gl) return { ok: false }
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    return { ok: true, version: gl.getParameter(gl.VERSION), renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a' }
  })
  console.log(JSON.stringify(args), '->', JSON.stringify(info))
  await b.close()
}
