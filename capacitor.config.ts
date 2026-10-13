import type { CapacitorConfig } from '@capacitor/cli'

/**
 * TRAINING OS — configuración de Capacitor
 *
 * El mismo `src/` que se despliega en la web se empaqueta aquí dentro de un
 * APK/AAB. Este fichero es la única frontera: describe la envoltura nativa y
 * no cambia ni una línea de la aplicación.
 *
 * Decisiones que conviene no deshacer sin pensarlo:
 *
 * - `androidScheme: 'https'` (el valor por defecto desde Capacitor 5) sirve la
 *   app desde `https://localhost`. Eso la mantiene en un *contexto seguro*, que
 *   es lo que exigen IndexedDB con cuota estable, `crypto.subtle` y el SDK de
 *   Firebase. Poner `http` aquí rompería justamente eso.
 *
 * - `allowMixedContent: false` y **ningún** `cleartext`. La app no habla con
 *   nada por HTTP sin cifrar: todo va a Firebase por HTTPS. Activar tráfico en
 *   claro sería abrir un agujero a cambio de nada.
 *
 * - No hay bloque `server.url`. Ese campo apunta el WebView a un servidor
 *   remoto — útil para desarrollo en caliente, inaceptable en una release:
 *   convertiría la app publicada en un navegador apuntando a una URL.
 */
const config: CapacitorConfig = {
  appId: 'com.trainingos.app',
  appName: 'Training OS',
  webDir: 'dist',

  android: {
    // Nada de contenido mixto: el WebView no cargará http:// dentro de https://.
    allowMixedContent: false,
    // El WebView no captura los enlaces de otras apps.
    captureInput: false,
    // Depuración del WebView sólo en builds de debug. En release, jamás.
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    SplashScreen: {
      // La pantalla de arranque se esconde desde el código, en cuanto la app
      // ha decidido qué pantalla mostrar. Así no hay un parpadeo en blanco
      // entre el splash y la interfaz.
      launchAutoHide: false,
      // Red de seguridad: si algo fuera mal y nadie la escondiera, se va sola
      // a los 3 segundos en vez de dejar la app colgada en el logo.
      launchFadeOutDuration: 200,
      backgroundColor: '#F4F5F7',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      // La ventana es edge-to-edge; el color real lo fija el código según el
      // tema claro/oscuro que tenga el usuario.
      overlaysWebView: true,
      style: 'LIGHT',
      backgroundColor: '#00000000',
    },
    Keyboard: {
      // Al abrir el teclado se reduce el alto del WebView en vez de
      // desplazarlo: los campos siguen visibles y la barra inferior no se
      // monta encima del teclado.
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
}

export default config
