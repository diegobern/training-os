/**
 * ¿Estamos dentro de la app de Android o en el navegador?
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
 * cuando `isNativeAndroid()` ya ha dicho que sí, así que el navegador jamás
 * llega a descargar esos trozos.
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
 * La comprobación que usa el resto de la aplicación. Hoy sólo existe la app de
 * Android; si algún día hay una de iOS, este fichero es el único sitio donde
 * habría que decidir qué comportamientos comparten.
 */
export function isNativeAndroid(): boolean {
  return isNative() && platform() === 'android'
}
