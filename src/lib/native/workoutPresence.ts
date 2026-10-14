/**
 * Qué tiene que enseñar el sistema mientras dura un entrenamiento, calculado
 * a partir del estado de la app. Sin efectos, sin Capacitor y sin React: todo
 * lo de aquí son funciones puras que se prueban en tests/unit-native.ts.
 *
 * `NativeShell.tsx` las llama en cada cambio y `workoutNotification.ts` manda
 * el resultado al nativo. Las reglas de cuándo se publica, se actualiza, se
 * programa o se cancela están en docs/NATIVE-CONTRACT.md; aquí viven las
 * cuentas.
 */
import type { Exercise, Language, Settings, WorkoutSession } from '../db/schema'
import { exerciseTitle, LOCALES, sessionTitle, type TFn } from '../i18n'
import { sessionProgress } from '../training/sessionProgress'
import type { RestAlert, WorkoutPresence } from './workoutNotification'

/**
 * El descanso tal y como lo guarda `useWorkout` (`RestState`). Se pide sólo
 * lo que hace falta, para no atar este fichero al almacén.
 */
export interface PresenceRest {
  total: number
  endsAt: number
  paused: boolean
  remaining: number
}

/**
 * Lo más largo que se manda al sistema. Una notificación o una Live Activity
 * cortan por su cuenta, y mal: a mitad de palabra y sin aviso, o desbordando
 * la isla dinámica. Mejor cortar aquí, con «…», y siempre igual.
 */
export const MAX_CHARS = 60

/** Corta a `max` caracteres (no unidades UTF-16: un emoji no se parte) con «…». */
export function clip(text: string, max = MAX_CHARS): string {
  const chars = Array.from(text)
  if (chars.length <= max) return text
  return chars.slice(0, Math.max(0, max - 1)).join('').trimEnd() + '…'
}

/**
 * «Press banca · Serie 2 de 4» cabiendo en `MAX_CHARS`. Si no cabe, se corta
 * la primera parte y la segunda se queda entera: el número de serie es lo
 * que se mira con el móvil bloqueado.
 */
function joinClipped(first: string, second: string): string {
  const whole = `${first} · ${second}`
  if (Array.from(whole).length <= MAX_CHARS) return whole
  const room = MAX_CHARS - Array.from(second).length - 3
  if (room < 8) return clip(whole)
  return `${clip(first, room)} · ${second}`
}

export interface PresenceInput {
  session: WorkoutSession
  rest: PresenceRest | null
  currentIndex: number
  /** Los ejercicios como los resuelve ahora `getExercisesByIds` (nombre traducido). */
  exerciseNameById: ReadonlyMap<string, Pick<Exercise, 'name' | 'isCustom'>> | undefined
  t: TFn
  language: Language
  excludeWarmups: boolean
  now: number
  /** Sólo Android lleva los textos del canal de notificaciones. */
  android: boolean
}

/** ¿Sigue vivo este descanso? En pausa, siempre; en marcha, hasta su hora. */
export function restIsLive(rest: PresenceRest | null, now: number): rest is PresenceRest {
  return !!rest && (rest.paused || rest.endsAt > now)
}

/**
 * El ejercicio en curso, en el idioma de la app. El de la sesión se guardó
 * con el nombre del día en que se añadió; los propios de la persona conservan
 * el suyo (ver `exerciseTitle`).
 */
export function currentExerciseName(input: Pick<PresenceInput, 'session' | 'currentIndex' | 'exerciseNameById'>): string | null {
  const current = input.session.exercises[input.currentIndex] ?? null
  if (!current) return null
  return clip(exerciseTitle(current.exerciseId, current.name, input.exerciseNameById))
}

export function buildWorkoutPresence(input: PresenceInput): WorkoutPresence {
  const { session, rest, currentIndex, t, language, excludeWarmups, now, android } = input
  const current = session.exercises[currentIndex] ?? null
  const exerciseName = currentExerciseName(input)

  /*
   * «Serie 2 de 4»: las series del ejercicio actual, con la misma regla de
   * calentamiento que la cabecera de la sesión. La que toca es la siguiente
   * a las hechas, y con todas hechas se queda en la última (no «5 de 4»).
   */
  const counted = current ? current.sets.filter((s) => !(excludeWarmups && s.type === 'warmup')) : []
  const total = counted.length
  const done = counted.filter((s) => s.completed).length
  const setLabel = total > 0 ? clip(t('live.setOf', { set: Math.min(done + 1, total), total })) : null

  const progress = sessionProgress(session, excludeWarmups)
  const progressLabel = clip(t('workout.progress', { done: progress.doneSets, total: progress.totalSets }))
  // Translated at display time, like everywhere else: a free workout started
  // in English reads «Entrenamiento libre» once the app is in Spanish.
  const sessionName = clip(sessionTitle(session, t))
  const locale = LOCALES[language] ?? LOCALES.en

  const live = restIsLive(rest, now)
    ? {
        endsAt: Math.round(rest.endsAt),
        total: Math.round(rest.total),
        paused: rest.paused,
        remaining: Math.max(0, Math.round(rest.remaining)),
      }
    : null

  const labels: WorkoutPresence['labels'] = {
    rest: t('live.rest'),
    restOver: t('live.restOver'),
    elapsed: t('live.elapsed'),
    paused: t('live.paused'),
  }
  if (live && !live.paused) {
    const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(live.endsAt))
    labels.restUntil = clip(t('live.restUntil', { time }))
  }

  const presence: WorkoutPresence = {
    sessionId: session.id,
    // La misma cuenta que el cronómetro de la app (useElapsed): inicio más
    // lo que haya estado en pausa.
    startedAt: Math.round(session.startedAt + session.pausedMs),
    title: clip(t('workout.notifTitle')),
    body: exerciseName && setLabel ? joinClipped(exerciseName, setLabel) : joinClipped(sessionName, progressLabel),
    sessionName,
    exerciseName,
    setLabel,
    progressLabel,
    rest: live,
    labels,
    locale,
  }
  if (android) {
    presence.channelName = t('workout.notifChannel')
    presence.channelDescription = t('workout.notifChannelBody')
  }
  return presence
}

/**
 * La misma presencia, sin el descanso si ya llegó su hora (en pausa no vence
 * nunca). Es lo que se repone al volver a primer plano: lo último que se pidió
 * enseñar pudo llevar un descanso que venció con la app en segundo plano, y
 * mandarlo tal cual pintaría una cuenta atrás que ya no existe.
 */
export function expireRest(p: WorkoutPresence, now: number): WorkoutPresence {
  if (!p.rest || p.rest.paused || p.rest.endsAt > now) return p
  const labels = { ...p.labels }
  delete labels.restUntil
  return { ...p, rest: null, labels }
}

/**
 * La clave con la que se deduplica: todo lo visible y nada más. Los pesos y
 * las repeticiones no aparecen en ningún texto, así que teclearlos no cambia
 * la clave. Del descanso sólo cuenta lo que el sistema pinta: en pausa, lo
 * que queda (fijo); en marcha, la hora a la que acaba — no lo que queda, que
 * cambia cada segundo.
 */
export function presenceKey(p: WorkoutPresence): string {
  const rest = p.rest
    ? p.rest.paused
      ? { p: 1, total: p.rest.total, remaining: p.rest.remaining }
      : { p: 0, total: p.rest.total, endsAt: p.rest.endsAt }
    : null
  return JSON.stringify([
    p.sessionId,
    p.startedAt,
    p.title,
    p.body,
    p.sessionName,
    p.exerciseName,
    p.setLabel,
    p.progressLabel,
    rest,
    [p.labels.rest, p.labels.restOver, p.labels.elapsed, p.labels.paused, p.labels.restUntil ?? null],
    p.locale,
    p.channelName ?? null,
    p.channelDescription ?? null,
  ])
}

export interface RestAlertInput {
  session: Pick<WorkoutSession, 'id'>
  rest: PresenceRest | null
  now: number
  t: TFn
  settings: Pick<Settings, 'sounds' | 'restSound' | 'haptics' | 'restVibrate'>
  /** El ejercicio de la siguiente serie, ya traducido; sin él, el texto genérico. */
  exerciseName: string | null
  android: boolean
}

/**
 * El aviso de «Descanso terminado» que debería estar programado ahora mismo:
 * sólo con un descanso en marcha (no en pausa) que aún no ha llegado a su
 * hora. Si no, `null`.
 */
export function desiredRestAlert(input: RestAlertInput): RestAlert | null {
  const { session, rest, now, t, settings, exerciseName, android } = input
  if (!rest || rest.paused || rest.endsAt <= now) return null
  const alert: RestAlert = {
    sessionId: session.id,
    at: Math.round(rest.endsAt),
    title: clip(t('notif.restEndTitle')),
    body: clip(exerciseName ? t('notif.restEndBody', { exercise: exerciseName }) : t('notif.restEndBodyGeneric')),
    sound: settings.sounds && settings.restSound,
    vibrate: settings.haptics && settings.restVibrate,
  }
  if (android) {
    alert.channelName = t('notif.restChannel')
    alert.channelDescription = t('notif.restChannelBody')
  }
  return alert
}

function sameAlert(a: RestAlert, b: RestAlert): boolean {
  return (
    a.sessionId === b.sessionId &&
    a.at === b.at &&
    a.title === b.title &&
    a.body === b.body &&
    a.sound === b.sound &&
    a.vibrate === b.vibrate &&
    (a.channelName ?? null) === (b.channelName ?? null) &&
    (a.channelDescription ?? null) === (b.channelDescription ?? null)
  )
}

/**
 * Qué hacer con el aviso al pasar de `prev` (el último programado) a `next`
 * (el deseado ahora):
 *
 *   - hay uno deseado y no es el mismo (nuevo descanso, ±30 s, reanudar,
 *     reiniciar, cambio de idioma o de ajustes) → programarlo (reemplaza);
 *   - ya no hay ninguno y el anterior seguía en el futuro (pausa, saltar,
 *     terminar antes) → cancelarlo;
 *   - ya no hay ninguno porque llegó su hora (fin natural) → nada: el
 *     sistema lo da, y cancelarlo ahora lo borraría de la pantalla de
 *     bloqueo justo cuando sale.
 */
export function restAlertTransition(prev: RestAlert | null, next: RestAlert | null, now: number): 'schedule' | 'cancel' | 'none' {
  if (next) return prev && sameAlert(prev, next) ? 'none' : 'schedule'
  if (prev && prev.at > now + 500) return 'cancel'
  return 'none'
}

/** Un id de sesión con buena forma: el de `newId()` (UUID o `id-…`), nada más. */
export const SESSION_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/

/**
 * Adónde lleva tocar el aviso o la Live Activity:
 *
 *   - sin id, o el de la sesión en curso → `/workout/active` (si ya no hay
 *     sesión, esa pantalla manda a /workout);
 *   - una sesión terminada de este dispositivo → su detalle en el historial;
 *   - cualquier otra cosa — desconocida, descartada, de otra cuenta, id mal
 *     formado — → al inicio. Nunca se navega con un id que no se ha validado.
 *
 * Un id vacío cuenta como ausente: es lo que dejaría un enlace sin valor.
 * `lookup` dice qué es ese id en la base de datos local; si falla, inicio.
 */
export async function routeForWorkoutTap(
  id: string | undefined,
  activeSessionId: string | null,
  lookup: (id: string) => Promise<'completed' | 'other' | null>,
): Promise<string> {
  if (id === undefined || id === '') return '/workout/active'
  if (!SESSION_ID_PATTERN.test(id)) return '/'
  if (id === activeSessionId) return '/workout/active'
  try {
    if ((await lookup(id)) === 'completed') return `/history/${id}`
  } catch {
    /* Sin poder mirarlo, al inicio: nunca a una pantalla que quizá no existe. */
  }
  return '/'
}
