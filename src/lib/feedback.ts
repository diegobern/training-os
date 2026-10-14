import { useApp } from '../store/useApp'
import { isNative } from './native/platform'
import { nativeHaptic, type HapticKind } from './native/workoutNotification'

/* ------------------------------------------------------------------ haptics */

const PATTERNS: Record<HapticKind, number | number[]> = {
  tick: 12,
  success: [14, 40, 22],
  pr: [18, 45, 26, 45, 40],
  warn: [30, 60, 30],
}

export function haptic(kind: HapticKind = 'tick') {
  const { haptics } = useApp.getState().settings
  if (!haptics) return
  /*
   * Dentro de la app la vibración la da el sistema: `performHapticFeedback`
   * en Android (sin el permiso VIBRATE, que la app no pide) y los generadores
   * de impacto en iOS, donde `navigator.vibrate` ni siquiera existe.
   * `nativeHaptic` importa Capacitor de forma dinámica y nunca lanza; en el
   * navegador este fichero no arrastra ni un byte del puente.
   */
  if (isNative()) {
    void nativeHaptic(kind)
    return
  }
  try {
    navigator.vibrate?.(PATTERNS[kind])
  } catch {
    /* unsupported — silently fine */
  }
}

/* ------------------------------------------------------------------- sounds */

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  // Un contexto cerrado no vuelve a sonar nunca: se crea otro.
  if (!ctx || ctx.state === 'closed') {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  /*
   * Cualquier estado que no sea `running`, no sólo `suspended`: WebKit (el
   * WebView de iOS) deja el contexto en `interrupted` después de una llamada,
   * de Siri o de bloquear el móvil, y ahí no suena nada hasta que alguien lo
   * reanuda. `resume()` puede rechazar (sin gesto del usuario); no pasa nada,
   * se reintenta en el siguiente sonido.
   */
  if (ctx.state !== 'running') ctx.resume().catch(() => {})
  return ctx
}

/** Tones are synthesised — no audio files, so nothing to fetch when offline. */
function tone(freq: number, durationMs: number, when = 0, gain = 0.06, type: OscillatorType = 'sine') {
  const a = audio()
  if (!a) return
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, a.currentTime + when)
  g.gain.setValueAtTime(0, a.currentTime + when)
  g.gain.linearRampToValueAtTime(gain, a.currentTime + when + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + when + durationMs / 1000)
  osc.connect(g).connect(a.destination)
  osc.start(a.currentTime + when)
  osc.stop(a.currentTime + when + durationMs / 1000 + 0.02)
}

export type SoundKind = 'tick' | 'restEnd' | 'pr' | 'finish'

export function sound(kind: SoundKind) {
  const { sounds } = useApp.getState().settings
  if (!sounds) return
  switch (kind) {
    case 'tick':
      tone(880, 70, 0, 0.035, 'triangle')
      break
    case 'restEnd':
      tone(660, 130, 0, 0.07)
      tone(880, 180, 0.14, 0.07)
      break
    case 'pr':
      tone(784, 120, 0, 0.06, 'triangle')
      tone(988, 120, 0.1, 0.06, 'triangle')
      tone(1319, 260, 0.2, 0.06, 'triangle')
      break
    case 'finish':
      tone(523, 140, 0, 0.05)
      tone(659, 140, 0.12, 0.05)
      tone(784, 300, 0.24, 0.05)
      break
  }
}

/** Some browsers only allow audio after a user gesture — prime it on first tap. */
export function primeAudio() {
  try {
    audio()
  } catch {
    /* ignore */
  }
}

export function animationsOn(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  return useApp.getState().settings.animations
}
