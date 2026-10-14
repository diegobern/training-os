/**
 * El "cromado" nativo: barra de estado, barra de navegación, pantalla de
 * arranque, enlaces externos y compartir ficheros. Todo lo de este fichero no
 * hace absolutamente nada en la web.
 *
 * Los plugins se importan de forma dinámica y sólo después de comprobar que
 * estamos dentro de la app. Así el paquete que descarga un navegador no
 * incluye ni un byte de Capacitor.
 */
import { isNative, isNativeAndroid, isNativeIOS } from './platform'

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
 *
 * En iOS sólo se toca el estilo. La barra de estado de iPhone ya es
 * transparente y el WebView ya llega hasta arriba (las zonas seguras las
 * respeta el CSS con `env(safe-area-inset-*)`); `setOverlaysWebView` y
 * `setBackgroundColor` son de Android y en iOS como mucho no hacen nada, o
 * desplazan el WebView bajo la isla dinámica.
 */
export async function applyNativeChrome(resolvedTheme: 'light' | 'dark'): Promise<void> {
  if (!isNative()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    const style = resolvedTheme === 'dark' ? Style.Dark : Style.Light
    if (isNativeIOS()) {
      await StatusBar.setStyle({ style })
      return
    }
    if (!isNativeAndroid()) return
    await StatusBar.setOverlaysWebView({ overlay: true })
    await StatusBar.setStyle({ style })
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
 * el logo del sistema y la interfaz. Igual en Android que en iOS.
 *
 * Es idempotente: llamarla dos veces no hace nada la segunda.
 */
export async function hideNativeSplash(): Promise<void> {
  if (!isNative() || splashHidden) return
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
 * Capacitor el enlace se abre en una Custom Tab de Chrome (Android) o en un
 * SFSafariViewController (iOS), que tienen su propia barra y su propio botón
 * de cerrar.
 *
 * Devuelve `true` si se ha encargado; `false` significa "no soy nativo, deja
 * que el navegador haga lo suyo".
 */
export async function openExternal(url: string): Promise<boolean> {
  if (!isNative()) return false
  try {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url, presentationStyle: 'popover' })
    return true
  } catch {
    return false
  }
}

/**
 * Lo que pasó al entregar un fichero dentro de la app.
 *
 * `delivered: true` — la hoja de compartir se completó: la persona eligió
 * dónde guardarlo o a quién mandarlo. `delivered: false` — la cerró sin
 * elegir nada. Quien borra datos después de exportar (migrar, «borrar todo»)
 * tiene que distinguir los dos casos: una copia que no se guardó no es una
 * copia.
 */
export interface ShareOutcome {
  delivered: boolean
}

/**
 * Entrega un fichero de texto al usuario dentro de la app (Android o iOS).
 *
 * En el navegador, exportar la copia de seguridad es un `<a download>` con una
 * URL `blob:`. Dentro de un WebView de Capacitor **eso no hace nada**: el
 * WebView no lleva ningún `DownloadListener`, así que la pulsación se traga el
 * clic y no aparece ningún fichero por ninguna parte. Ni error, ni aviso, ni
 * descarga. Sin esta función, "Exportar copia de seguridad" sería un botón que
 * no hace nada en la app.
 *
 * La alternativa es escribir el fichero en la caché de la app — que no
 * necesita ningún permiso, ni siquiera en Android 13 — y pasárselo al menú de
 * compartir del sistema, desde donde la persona lo guarda en Archivos, en
 * Drive o se lo envía por correo. Es más pasos que una descarga, pero es la
 * forma en que Android y iOS esperan que una app entregue un fichero.
 *
 * El tipo de contenido no se pasa: el sistema lo deduce de la extensión del
 * fichero al compartirlo, y todos los que exporta Training OS terminan en
 * `.json` o `.csv`.
 *
 * Devuelve `null` si no es nativo: que siga el camino del navegador. Dentro
 * de la app devuelve `{ delivered }` (ver `ShareOutcome`). Cualquier otro
 * fallo — no se pudo escribir el fichero, el plugin no responde — se lanza,
 * igual que antes.
 */
/** Los nombres que escribe la exportación (`backup.ts`): copia JSON y CSV de series. */
const EXPORT_FILE = /^training-os-[\w.-]+\.(json|csv)$/

/**
 * Borra de la caché las copias que dejó `shareTextFile`.
 *
 * El fichero sólo hacía falta mientras el menú de compartir lo entregaba, y
 * la política de privacidad dice que al cerrar sesión no queda nada de la
 * cuenta en el teléfono. Se respeta un margen (`olderThanMs`): en Android el
 * menú devuelve el control antes de que la app de destino (Drive, Gmail)
 * termine de leer el fichero, y borrarlo en ese momento rompería la copia
 * que se acaba de pedir — por ejemplo, la de «guardar mis datos aparte» justo
 * antes de vaciar el teléfono. Lo que quede dentro del margen se borra en el
 * siguiente arranque.
 *
 * Nunca lanza. En la web no hay nada que borrar.
 */
export async function clearSharedExports(olderThanMs = 2 * 60 * 1000): Promise<number> {
  if (!isNative()) return 0
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { files } = await Filesystem.readdir({ path: '', directory: Directory.Cache })
    const now = Date.now()
    let removed = 0
    for (const f of files) {
      if (f.type !== 'file' || !EXPORT_FILE.test(f.name)) continue
      if (now - f.mtime < olderThanMs) continue
      try {
        await Filesystem.deleteFile({ path: f.name, directory: Directory.Cache })
        removed++
      } catch {
        /* Otro proceso lo tiene abierto o ya no está: se intenta en el próximo arranque. */
      }
    }
    return removed
  } catch {
    return 0
  }
}

export async function shareTextFile(filename: string, content: string): Promise<ShareOutcome | null> {
  if (!isNative()) return null

  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  const { Share } = await import('@capacitor/share')

  // Directory.Cache: no pide permisos y el sistema la limpia solo si hace
  // falta espacio. El fichero definitivo lo decide el usuario en el menú de
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
    // caché y no molesta a nadie, pero NO se ha entregado.
    const message = err instanceof Error ? err.message : String(err)
    if (!/cancel/i.test(message)) throw err
    return { delivered: false }
  }
  return { delivered: true }
}
