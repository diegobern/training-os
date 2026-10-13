/**
 * El "cromado" nativo: barra de estado, barra de navegación y pantalla de
 * arranque. Todo lo de este fichero no hace absolutamente nada en la web.
 *
 * Los plugins se importan de forma dinámica y sólo después de comprobar que
 * estamos dentro de la app. Así el paquete que descarga un navegador no
 * incluye ni un byte de Capacitor.
 */
import { isNativeAndroid } from './platform'

let splashHidden = false

/**
 * Pone los iconos de la barra de estado del color correcto para el tema.
 *
 * La ventana es transparente de borde a borde, así que detrás de la barra de
 * estado se ve el fondo de la aplicación. Si el usuario está en modo claro,
 * los iconos tienen que ser oscuros; en modo oscuro, claros. Sin esto, en modo
 * claro se verían iconos blancos sobre fondo blanco: la hora desaparece.
 *
 * Ojo con el nombre del estilo, que es contraintuitivo: `Style.Dark` significa
 * "texto claro para fondos oscuros", no "texto oscuro".
 */
export async function applyNativeChrome(resolvedTheme: 'light' | 'dark'): Promise<void> {
  if (!isNativeAndroid()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setOverlaysWebView({ overlay: true })
    await StatusBar.setStyle({ style: resolvedTheme === 'dark' ? Style.Dark : Style.Light })
    await StatusBar.setBackgroundColor({ color: '#00000000' })
  } catch {
    /*
     * Que no se pueda pintar la barra de estado no es motivo para tumbar la
     * app: como mucho se ve con los colores del sistema. Se ignora a
     * propósito, igual que el `try` alrededor de localStorage en useApp.
     */
  }
}

/**
 * Esconde la pantalla de arranque.
 *
 * Está configurada con `launchAutoHide: false`, es decir: se queda hasta que
 * alguien la esconde. Ese "alguien" es la aplicación, en cuanto sabe qué
 * pantalla tiene que enseñar. Es lo que evita el hueco en blanco clásico entre
 * el logo del sistema y la interfaz.
 *
 * Es idempotente: llamarla dos veces no hace nada la segunda.
 */
export async function hideNativeSplash(): Promise<void> {
  if (!isNativeAndroid() || splashHidden) return
  splashHidden = true
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen')
    await SplashScreen.hide({ fadeOutDuration: 200 })
  } catch {
    /* Si el plugin no responde, la propia biblioteca la retira al cabo. */
  }
}

/**
 * Abre un enlace externo en el navegador del sistema, no dentro de la app.
 *
 * En un WebView, `target="_blank"` carga la página **encima** de la
 * aplicación, sin barra de direcciones y sin botón de volver: el usuario se
 * queda atrapado en una página de GitHub sin forma evidente de salir. Con
 * Capacitor el enlace se abre en una Custom Tab de Chrome, que tiene su propia
 * barra y su propio botón de cerrar.
 *
 * Devuelve `true` si se ha encargado; `false` significa "no soy nativo, deja
 * que el navegador haga lo suyo".
 */
export async function openExternal(url: string): Promise<boolean> {
  if (!isNativeAndroid()) return false
  try {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url, presentationStyle: 'popover' })
    return true
  } catch {
    return false
  }
}

/**
 * Entrega un fichero de texto al usuario dentro de la app de Android.
 *
 * En el navegador, exportar la copia de seguridad es un `<a download>` con una
 * URL `blob:`. Dentro de un WebView de Capacitor **eso no hace nada**: el
 * WebView no lleva ningún `DownloadListener`, así que la pulsación se traga el
 * clic y no aparece ningún fichero por ninguna parte. Ni error, ni aviso, ni
 * descarga. Sin esta función, "Exportar copia de seguridad" sería un botón que
 * no hace nada en Android.
 *
 * La alternativa es escribir el fichero en la caché de la app — que no
 * necesita ningún permiso, ni siquiera en Android 13 — y pasárselo al menú de
 * compartir del sistema, desde donde la persona lo guarda en Archivos, en
 * Drive o se lo envía por correo. Es más pasos que una descarga, pero es la
 * forma en que Android espera que una app entregue un fichero.
 *
 * El tipo de contenido no se pasa: Android lo deduce de la extensión del
 * fichero al compartirlo, y todos los que exporta Training OS terminan en
 * `.json` o `.csv`.
 *
 * Devuelve `true` si se ha encargado. `false` significa "no soy nativo": que
 * siga el camino del navegador.
 */
export async function shareTextFile(filename: string, content: string): Promise<boolean> {
  if (!isNativeAndroid()) return false

  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  const { Share } = await import('@capacitor/share')

  // Directory.Cache: no pide permisos y Android la limpia solo si hace falta
  // espacio. El fichero definitivo lo decide el usuario en el menú de
  // compartir, así que esto es sólo un sitio de paso.
  const written = await Filesystem.writeFile({
    path: filename,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  })

  try {
    await Share.share({ title: filename, url: written.uri, dialogTitle: filename })
  } catch (err) {
    // Cerrar el menú de compartir sin elegir nada lanza una excepción. No es
    // un error: es alguien que ha cambiado de idea. El fichero se queda en la
    // caché y no molesta a nadie.
    const message = err instanceof Error ? err.message : String(err)
    if (!/cancel/i.test(message)) throw err
  }
  return true
}
