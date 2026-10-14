/**
 * ¿Estamos dentro de una app empaquetada (Android o iOS) o en el navegador?
 *
 * Hay una manera evidente de responder a esto — importar `Capacitor` de
 * `@capacitor/core` y llamar a `isNativePlatform()` — y no es la que se usa
 * aquí, a propósito.
 *
 * Ese import es estático, así que entraría en el paquete de la web y viajaría
 * a todos los navegadores que no lo necesitan para nada. Esta comprobación se
 * hace en el arranque, que es justo donde este proyecto lleva meses quitando
 * bytes.
 *
 * Capacitor, cuando la app corre de verdad dentro del WebView, inyecta un
 * objeto global `Capacitor` ANTES de que se ejecute nuestro código. Leerlo
 * cuesta cero bytes en web y da exactamente la misma respuesta. Todo lo que
 * sí necesita el SDK — los plugins — se importa de forma dinámica y sólo
 * cuando `isNative()` ya ha dicho que sí, así que el navegador jamás llega a
 * descargar esos trozos.
 *
 * Qué pregunta usar (ver docs/NATIVE-CONTRACT.md, «Plataforma»):
 *
 *   - `isNative()` para todo lo que comparten las dos apps: pantalla de
 *     arranque, barra de estado, teclado, compartir, enlaces externos, no
 *     registrar el service worker, el plugin propio y la háptica.
 *   - `isNativeAndroid()` sólo para lo que no existe en iOS: el botón atrás
 *     físico (`backButton`/`exitApp`), los campos `channel*` de las
 *     notificaciones y el permiso de alarma exacta.
 *   - `isNativeIOS()` para lo que no existe en Android: el gesto de deslizar
 *     para volver, la barra de accesorios del teclado y la barra de estado
 *     (en iOS sólo `setStyle`).
 */

type CapacitorGlobal = {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
}

/*
 * Se lee de `globalThis` y no de `window` porque en un navegador son el mismo
 * objeto — Capacitor escribe `window.Capacitor`, que es exactamente esto — y
 * porque `globalThis` existe también en node, que es donde corren los tests.
 * Leer `window` obligaría a fabricar un `window` falso para poder probar la
 * única función que decide si se registra el service worker.
 */
function capacitor(): CapacitorGlobal | undefined {
  return (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor
}

/** `true` sólo dentro de una app empaquetada (Android o iOS), nunca en web. */
export function isNative(): boolean {
  return capacitor()?.isNativePlatform?.() === true
}

/** `'android'`, `'ios'` o `'web'`. En el navegador siempre `'web'`. */
export function platform(): 'android' | 'ios' | 'web' {
  const name = capacitor()?.getPlatform?.()
  return name === 'android' || name === 'ios' ? name : 'web'
}

/**
 * Dentro del APK. Sólo para lo que es de Android y nada más: el botón atrás,
 * los canales de notificación y la alarma exacta. Lo que comparten las dos
 * apps pregunta `isNative()`.
 */
export function isNativeAndroid(): boolean {
  return isNative() && platform() === 'android'
}

/**
 * Dentro de la app de iPhone. Sólo para lo que es de iOS y nada más: el gesto
 * de volver, la barra de accesorios del teclado y el estilo de la barra de
 * estado.
 */
export function isNativeIOS(): boolean {
  return isNative() && platform() === 'ios'
}
