/**
 * The mark index.html paints before this bundle exists.
 *
 * It is not retired on a timer or after a frame, but when the app actually has
 * a screen to show — boot finished, session resolved. Removing it earlier only
 * revealed the session-checking placeholder underneath, and two brand marks at
 * different sizes dissolving into each other reads as a stutter.
 *
 * The fallback exists because "when the app is ready" is a promise this module
 * cannot keep on its own: a failed session check or a stalled request would
 * otherwise leave a static splash on screen forever. After it fires, whatever
 * the app is showing — including the checking placeholder — is better than a
 * screen that appears frozen.
 */
import { hideNativeSplash } from './native/chrome'

const FALLBACK_MS = 6000

let done = false

export function dismissBootMark(): void {
  if (done) return
  done = true
  /*
   * En Android hay una segunda marca encima de ésta: la pantalla de arranque
   * del sistema, que está configurada para quedarse hasta que alguien la
   * retire. Se retira aquí, en el mismo instante y por la misma razón, para
   * que no haya dos logotipos desvaneciéndose uno detrás de otro. En web no
   * hace nada.
   *
   * Éste es también el único punto que hay que mantener: cualquier sitio que
   * ya llamara a `dismissBootMark` — el fin del arranque, la pantalla de
   * error, la red de seguridad de abajo — retira ahora las dos marcas sin
   * saber que existe la segunda.
   */
  void hideNativeSplash()
  const el = document.getElementById('boot-mark')
  if (!el) return
  el.style.opacity = '0'
  el.style.pointerEvents = 'none'
  window.setTimeout(() => el.remove(), 400)
}

export function armBootMarkFallback(): void {
  window.setTimeout(dismissBootMark, FALLBACK_MS)
}
