# iOS — PUESTA EN MARCHA

Cómo compilar y ejecutar Training OS como app de iPhone. Un solo proyecto: el
mismo `src/` que se despliega en Netlify y que va dentro del APK de Android es
el que va dentro de la app de iOS.

Este documento explica **cómo está hecho**. Qué está ya compilado, probado en
el simulador o comprobado en un iPhone real — y qué no — está en
[`docs/IOS-FEATURE-PARITY.md`](IOS-FEATURE-PARITY.md). Si los dos dicen cosas
distintas sobre el estado, manda ése.

---

## 1. Qué necesitas instalado

| Herramienta | Versión | Cómo comprobarlo |
| --- | --- | --- |
| macOS | El que pida tu versión de Xcode | `sw_vers` |
| Xcode | **26 o posterior** | `xcodebuild -version` |
| Node | **22 o superior** | `node -v` |
| CocoaPods | **No hace falta** | — |
| Cuenta de Apple | Ninguna para el simulador; Apple ID para tu propio iPhone; **Apple Developer Program** para TestFlight y App Store | — |

**No hay CocoaPods.** El proyecto usa Capacitor 8.5.2 con **Swift Package
Manager**: las dependencias nativas están en
`ios/App/CapApp-SPM/Package.swift` y Xcode las descarga solo. No ejecutes
`pod install`; no hay `Podfile` y `npm run ios:verify` falla si aparecen restos
de CocoaPods en el proyecto.

**Xcode 26 no es una preferencia.** Desde el **28 de abril de 2026**, App Store
Connect sólo acepta compilaciones hechas con Xcode 26 o posterior y el SDK de
iOS 26. Apple ha anunciado el mismo salto al SDK de iOS 27 (Xcode 27) a partir
de **abril de 2027**. Estas fechas cambian: **comprobar en
<https://developer.apple.com/news/upcoming-requirements/> antes de cada
envío.**

**Desde Windows o Linux** se puede hacer casi todo menos compilar:
`npx cap sync ios` (copia la web y regenera la configuración),
`npm run ios:verify` y `npm run test:ios`. Compilar, ejecutar en el simulador,
firmar y subir necesita un Mac con Xcode, o la integración continua de la
sección 10.

---

## 2. Primer arranque

```bash
npm install
npm run build          # build web en dist/
npx cap sync ios       # copia dist/ a ios/App/App/public y regenera la configuración
npx cap open ios       # abre ios/App/App.xcodeproj en Xcode
```

La primera vez que se abre, Xcode **resuelve los paquetes Swift**: descarga
`capacitor-swift-pm` 8.5.2 de GitHub y enlaza los plugins oficiales desde
`node_modules/@capacitor/*`. Necesita conexión y que `npm install` se haya
ejecutado antes; si no, verás «Missing package product» (sección 13).

Después, en Xcode: esquema **App**, un simulador de iPhone y **Run ▶**. Para ver
la Dynamic Island, elige un modelo Pro (por ejemplo, iPhone 17 Pro).

> **Firebase va dentro del build, no en Xcode.** Igual que en la web
> (`DESPLIEGUE.md`), Vite incrusta las variables `VITE_FIREBASE_*` al compilar.
> Con `.env` presente, `npm run build` sale con cuentas y sincronización; sin
> él, la app arranca en **modo local**, sin cuentas. El proyecto de Xcode no
> sabe nada de esto: no hay `GoogleService-Info.plist` ni SDK nativo de
> Firebase (ver `FIREBASE.md`, «Apps nativas»).

---

## 3. El ciclo de trabajo diario

`ios/App/App/public/` es una **copia** del `dist/` web. No se edita: se
regenera.

```bash
npm run ios:sync       # cada vez que cambies algo de src/
```

Con Xcode abierto basta con volver a darle a **Run ▶** después del sync. Si
sólo tocas código nativo (Swift, `Info.plist`, recursos), no hace falta
sincronizar: compila directamente.

> **No edites nunca ficheros dentro de `ios/App/App/public/`.** El siguiente
> `cap sync` los sobrescribe sin avisar y habrás perdido el cambio. Tampoco
> `ios/App/CapApp-SPM/Package.swift`: lo regenera `cap sync` a partir de los
> plugins instalados en `package.json`.

---

## 4. Scripts disponibles

| Script | Qué hace |
| --- | --- |
| `npm run ios:sync` | `npm run build` + `npx cap sync ios` |
| `npm run ios:open` | Abre el proyecto en Xcode |
| `npm run ios:assets` | Regenera el icono (1024×1024, sin canal alfa) y la imagen de arranque desde el rayo de `public/favicon.svg` |
| `npm run ios:verify` | Comprobación estática sin Mac: proyecto de Xcode, targets, extensión, Info.plist, privacidad, icono, plugin frente al contrato |
| `npm run test:ios` | La web dentro de un iPhone **simulado** en Chromium: lo que decide el código JavaScript cuando se ve dentro de Capacitor en iOS |

No hay equivalente de `android:debug` / `android:bundle`: en iOS se compila,
se archiva y se sube desde Xcode (ver `docs/IOS-SIGNING.md`).

---

## 5. Qué toca cada parte

```
capacitor.config.ts                  Identidad (com.trainingos.app), plugins, splash, teclado
ios/App/App.xcodeproj                El proyecto de Xcode: tres targets (abajo)
ios/App/App/                         Target App: la aplicación
  AppDelegate.swift                    Arranque; excluye Library/WebKit de la copia de iCloud
  SceneDelegate.swift                  Crea la ventana con MainViewController; toque en el aviso con la app cerrada
  MainViewController.swift             Registra el plugin propio; gesto de deslizar para volver
  WorkoutNotificationPlugin.swift      El plugin propio: Live Activity, aviso de descanso, háptica, enlace de vuelta
  LiveActivityPreviewRenderer.swift    Sólo DEBUG: imágenes de la Live Activity sin iPhone
  Info.plist                           Esquema trainingos://, Live Activities, cámara, cifrado, sólo vertical
  PrivacyInfo.xcprivacy                Manifiesto de privacidad (docs/APP-STORE-PRIVACY.md)
  en.lproj/, es.lproj/InfoPlist.strings  Textos del sistema (permiso de cámara) en los dos idiomas
  Base.lproj/LaunchScreen.storyboard   Pantalla de arranque del sistema (imagen «Splash»)
  Base.lproj/Main.storyboard           Plantilla de Capacitor; la ventana la monta SceneDelegate
  Assets.xcassets/                     Icono y splash (npm run ios:assets)
ios/App/Shared/                      Se compila en la app Y en la extensión
  WorkoutActivityAttributes.swift      Los datos de la Live Activity y el enlace trainingos://
  WorkoutActivityViews.swift           Las vistas SwiftUI: pantalla de bloqueo y Dynamic Island
ios/App/TrainingOSWidgets/           Target de la extensión de la Live Activity
  TrainingOSWidgetsBundle.swift        @main: sólo la Live Activity, ningún widget de inicio
  WorkoutLiveActivityWidget.swift      ActivityConfiguration: bloqueo + Dynamic Island + widgetURL
  Info.plist                           com.apple.widgetkit-extension; versión = la de la app
ios/App/TrainingOSUITests/           Pruebas de interfaz (XCUITest)
ios/App/CapApp-SPM/Package.swift     Dependencias Swift Package Manager (lo regenera cap sync)
ios/debug.xcconfig                   CAPACITOR_DEBUG en Debug
src/lib/native/                      La frontera en TypeScript (la misma que Android)
  platform.ts                          isNative / isNativeAndroid / isNativeIOS
  chrome.ts                            Barra de estado, splash, enlaces externos, compartir
  workoutNotification.ts               El plugin propio, visto desde la web
  workoutPresence.ts                   Qué se enseña y cuándo (puro, probado)
src/components/layout/NativeShell.tsx  Teclado, deslizar para volver, presencia, aviso de descanso, toques
docs/NATIVE-CONTRACT.md              El contrato JS ↔ nativo (Android e iOS)
scripts/ios/verify-project.mjs       npm run ios:verify
scripts/ios/brand-assets.mjs         npm run ios:assets
e2e/ios-shell.mjs                    npm run test:ios
.github/workflows/ios.yml            Compilación y pruebas en un Mac de GitHub Actions
```

### Los tres targets

| Target | Identificador | Qué es |
| --- | --- | --- |
| **App** | `com.trainingos.app` | La aplicación: Capacitor, el WKWebView y el plugin propio |
| **TrainingOSWidgets** | `com.trainingos.app.LiveActivity` | Extensión de WidgetKit que **sólo** pinta la Live Activity. Va incrustada en `App.app/PlugIns/` |
| **TrainingOSUITests** | `com.trainingos.app.UITests` | Pruebas de interfaz. No se publica |

Los tres comparten:

* **iOS 16.2 mínimo** (es la versión que trae `ActivityContent` y
  `staleDate`, que usa la Live Activity).
* **Sólo iPhone** (`TARGETED_DEVICE_FAMILY = 1`) y **sólo vertical**.
* **La versión se fija una vez, en el proyecto**, y la heredan app y extensión
  (ver `docs/IOS-SIGNING.md`, sección 6).
* **Sin entitlements ni App Group.** La extensión no comparte datos con la app:
  todo lo que pinta le llega en el estado de ActivityKit.

La extensión **no enlaza Capacitor** (no es seguro para extensiones) y compila
con `APPLICATION_EXTENSION_API_ONLY = YES`. Lo que necesitan las dos partes
está en `ios/App/Shared/`, que se compila en los dos targets con la misma
referencia de fichero.

### Lo que genera `cap sync` y no está en git

| Ruta | Qué es |
| --- | --- |
| `ios/App/App/public/` | Copia de `dist/` |
| `ios/App/App/capacitor.config.json` | `capacitor.config.ts` traducido a JSON |
| `ios/App/App/config.xml` | Configuración de compatibilidad con Cordova |
| `ios/capacitor-cordova-ios-plugins/` | Ídem |
| `ios/App/CapApp-SPM/symlinks/` | Enlaces a plugins, sólo si se configuran así (hoy no se usa: `Package.swift` apunta directamente a `node_modules`) |

`ios/App/CapApp-SPM/Package.swift` **sí** se versiona, aunque lo regenere
`cap sync`: es el que declara qué plugins entran en el build, igual que
`capacitor.settings.gradle` en Android. Tampoco se versionan las carpetas de
compilación (`build/`, `DerivedData/`, `xcuserdata/`) ni nada de firma (ver
`.gitignore`, sección iOS).

**Nada más de `src/` sabe que iOS existe.** La regla es la misma que en
Android: si hace falta una condición nativa nueva, se añade en
`src/lib/native/` y el resto de la aplicación sigue sin enterarse.

---

## 6. El plugin propio y cómo se registra

Todo lo que la app necesita de iOS y no cubre un plugin oficial pasa por
**un único plugin propio**, `WorkoutNotification`
(`ios/App/App/WorkoutNotificationPlugin.swift`), con el mismo nombre, los
mismos métodos y los mismos datos que el de Android. El contrato completo
— métodos, datos, quién llama a qué y cuándo — está en
`docs/NATIVE-CONTRACT.md`.

**Los plugins locales no se descubren solos.** Capacitor registra los plugins
de `node_modules` a partir de `capacitor.config.json`, pero uno que vive dentro
del proyecto hay que registrarlo a mano:

```swift
// ios/App/App/MainViewController.swift
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        let plugin = WorkoutNotificationPlugin()
        bridge?.registerPluginInstance(plugin)
        ...
    }
}
```

Y para que esto se ejecute, `SceneDelegate` crea la ventana con
`MainViewController()`, **no** con `CAPBridgeViewController()`. Si alguien
regenera la plantilla de Capacitor y vuelve a `CAPBridgeViewController`, el
plugin deja de existir sin ningún error de compilación: las llamadas desde
JavaScript no hacen nada (sección 13).

Otras dos reglas del plugin:

* **Los nueve métodos del contrato están en `pluginMethods`** (`start`, `stop`,
  `scheduleRestAlert`, `cancelRestAlert`, `haptic`, `isSupported`,
  `checkPermissions`, `requestPermissions`, `requestExactAlarm`). `addListener`
  lo atiende Capacitor. Un método que falte ahí deja su promesa sin respuesta
  en JavaScript.
* **Cada método resuelve o rechaza siempre**, y el trabajo se encadena en el
  hilo principal en el orden en que lo pidió JavaScript (un `stop` no puede
  adelantar a un `start` que aún no ha terminado). Un fallo de ActivityKit o de
  las notificaciones se contesta como «no se ha mostrado», nunca como error.

`npm run ios:verify` comprueba el nombre del plugin en Swift y en TypeScript,
los nueve métodos frente al contrato, que cada uno tenga su `@objc func`, el
registro en `capacitorDidLoad()` y que `SceneDelegate` cree
`MainViewController()`.

---

## 7. Decisiones que conviene conocer antes de cambiarlas

### Live Activity: el entrenamiento en curso en la pantalla de bloqueo y en la Dynamic Island

Es el equivalente de la notificación persistente de Android. Mientras hay un
entrenamiento abierto, la pantalla de bloqueo enseña el ejercicio actual (o el
nombre de la sesión), «Serie 3 de 4 · 7 de 20 series» y **la duración
corriendo sola**; durante un descanso, **la cuenta atrás**. En los iPhone con
Dynamic Island aparece además ahí, en sus formas compacta, mínima y
expandida.

* **La pide la app y la pinta la extensión.** El plugin la pide
  (`Activity.request`), la actualiza y la termina; `TrainingOSWidgets` sólo
  dibuja. Sin botones (v1): cualquier acción desde la pantalla de bloqueo
  cambiaría el entrenamiento sin pasar por la lógica de JavaScript.
* **Los cronómetros los pinta iOS** con `Text(timerInterval:countsDown:)`. La
  app no se despierta cada segundo y no hay modo de segundo plano
  (`UIBackgroundModes` no existe en `Info.plist`, y `ios:verify` falla si
  aparece).
* **El fin del descanso no necesita a la app.** El estado lleva `staleDate` =
  fin del descanso: a esa hora iOS marca la actividad como caducada y la vista
  pasa sola a «Descanso terminado», aunque la app esté suspendida.
* **Una sola por sesión.** `start` actualiza la de esa sesión si existe y
  termina cualquier otra. Sólo se pide una nueva con la app en primer plano
  (iOS no deja hacerlo desde segundo plano).
* **Si la persona la quita** de la pantalla de bloqueo, no se vuelve a pedir
  para esa sesión. Los ids de esas sesiones (como mucho 20) se guardan en los
  `UserDefaults` de la app (motivo `CA92.1` del manifiesto de privacidad).
* **No necesita permiso.** Se pide igualmente aunque se hayan denegado las
  notificaciones. Si la persona las tiene desactivadas en *Ajustes → Training
  OS → Actividades en directo*, `start` contesta `{ shown: false }` y la app
  sigue igual.
* **Al terminar o descartar** el entrenamiento se termina con
  `dismissalPolicy: .immediate`: no se queda en la pantalla de bloqueo.
* **Colores de la app**, en claro y en oscuro según la apariencia del sistema;
  la Dynamic Island es negra siempre. El rayo de la marca se dibuja como
  trazado, sin imágenes en la extensión.
* **El estado se decodifica campo a campo**, con valores neutros para lo que
  falte: una actualización de la app con un entrenamiento en marcha no deja la
  pantalla de bloqueo en blanco. Cualquier campo nuevo de `ContentState` tiene
  que ser opcional o tener valor por defecto.
* iOS termina una Live Activity como mucho a las 8 horas y la retira de la
  pantalla de bloqueo como mucho 4 horas después. Para un entrenamiento sobra.

### El aviso «Descanso terminado»

Son cosas distintas: la Live Activity es el **estado continuo**; el aviso, un
**aviso puntual** que suena o vibra y se va. La Live Activity no suena ni
vibra al acabar el descanso, así que no avisa a nadie con el móvil en el
bolsillo (la razón completa está en `docs/ARQUITECTURA.md`, D42).

* **Notificación local**: `UNUserNotificationCenter` +
  `UNTimeIntervalNotificationTrigger`, con un identificador fijo
  (`training-os.rest-end`). Programar otra la reemplaza.
* Se programa al empezar, ajustar o reanudar un descanso, y se cancela al
  pausarlo, saltarlo o terminarlo antes. Al llegar su hora **no** se cancela:
  la entrega el sistema, también con la app en segundo plano, con el móvil
  bloqueado y con la app cerrada.
* **Con la app delante y activa no se presenta**: avisa la propia app con su
  sonido y su vibración.
* En iOS el aviso siempre es puntual: no hay permiso de alarma exacta.
  `requestExactAlarm` contesta `true` y no hace nada.
* **Sonido**: el de sistema si el sonido del descanso está activado en los
  ajustes de la app; si no, llega en silencio. En iOS la vibración de un aviso
  va con su sonido y no se puede separar (el campo `vibrate` del contrato no
  se lee).
* **Tocarlo** abre la app en la sesión, también si estaba cerrada (ver
  «Enlace de vuelta»).
* Al finalizar o descartar el entrenamiento, `stop` cancela el pendiente y
  retira el ya entregado.

### El permiso de notificaciones

* Se pide **la primera vez que se empieza un entrenamiento**, nunca al abrir la
  app. Sólo aviso y sonido: ni globos en el icono ni avisos críticos.
* **Sólo condiciona el aviso de descanso.** La Live Activity no lo necesita.
* Si se deniega no se vuelve a preguntar y todo funciona igual, sin el aviso.
  Si después se activa en *Ajustes → Training OS → Notificaciones*, el aviso
  vuelve en el siguiente descanso.
* El diálogo es del sistema y sale en el idioma del teléfono; todo lo demás,
  en el de la app.

### El enlace de vuelta: `trainingos://workout/active?session=<id>`

* Tocar la Live Activity abre ese enlace (`widgetURL`). Llega al plugin por
  `.capacitorOpenURL` (Capacitor lo repite tras un arranque en frío) y sale
  hacia JavaScript como evento `open` **retenido**, para que no se pierda si
  la web aún no escucha.
* Tocar el aviso de descanso llega por el delegado de notificaciones de
  Capacitor (el plugin se apunta como su manejador de avisos locales, sin
  sustituirlo). Con la app cerrada, `SceneDelegate` le pasa además el toque de
  `connectionOptions.notificationResponse`, porque puede llegar antes de que
  Capacitor instale su delegado. El plugin descarta el duplicado.
* **La lectura es estricta**: cualquier app o web puede abrir un esquema
  propio. Sólo cuenta `trainingos`, host `workout`, ruta `/active` y un único
  parámetro `session` con un id `^[A-Za-z0-9-]{1,64}$`; lo demás se ignora.
* JavaScript decide adónde ir (`routeForWorkoutTap`): sin id o con el de la
  sesión activa → `/workout/active`; una sesión terminada → `/history/<id>`;
  cualquier otra cosa → `/`.

### Vibración háptica

`haptic` usa `UIImpactFeedbackGenerator` (`tick` ligero, `pr` fuerte) y
`UINotificationFeedbackGenerator` (`success`, `warn`). Sin permisos. Respeta
el ajuste de vibración del sistema y el de la app (`settings.haptics`, que mira
`src/lib/feedback.ts` antes de llamar).

### Atrás: deslizar desde el borde

iPhone no tiene botón atrás. `MainViewController` activa
`allowsBackForwardNavigationGestures` en el WKWebView, y el gesto recorre el
historial de la app como `history.back()`. Con una hoja o un diálogo abiertos,
`NativeShell.tsx` corta ese paso atrás **antes** de que React Router se entere,
repone la entrada del historial en la que se estaba y cierra la hoja: lo mismo
que hace el botón atrás de Android. Por eso el oyente de `popstate` se instala
al cargar el módulo y no en un efecto (el comentario largo está en el propio
fichero).

### Teclado: barra de accesorios

En iPhone, un campo numérico no tiene tecla de cerrar. Se deja visible la
barra de accesorios del teclado (flechas y «OK»,
`Keyboard.setAccessoryBarVisible`) para poder cerrarlo en kg, reps, RIR y RPE.
En las dos apps, el teclado se cierra al cambiar de pantalla y el WebView se
reduce en vez de desplazarse (`resize: 'native'` en `capacitor.config.ts`).

### Barra de estado

En iOS sólo se cambia el estilo (iconos claros u oscuros según el tema de la
app, `StatusBar.setStyle`). La barra ya es transparente y el WebView llega
hasta arriba; las zonas seguras (notch, Dynamic Island, indicador de inicio)
las respeta el CSS con `env(safe-area-inset-*)`. `setOverlaysWebView` y
`setBackgroundColor` son de Android y no se llaman en iOS.

### Pantalla de arranque

`launchAutoHide: false`: el splash se queda hasta que la app sabe qué pantalla
enseñar, y entonces lo retira (`hideNativeSplash`, desde
`src/lib/bootmark.ts`), igual que en Android. Si el arranque se atasca, una
red de seguridad lo retira a los 6 segundos. La imagen sale de
`npm run ios:assets`: el rayo sobre el fondo de marca.

### Compartir la copia de seguridad

En un WKWebView, `<a download>` no hace nada. *Ajustes → Datos → Exportar
copia de seguridad* escribe el fichero en la caché de la app (`Filesystem`,
sin permisos) y abre la **hoja de compartir** de iOS (`Share`), desde donde se
guarda en Archivos o se envía. Cerrar la hoja sin elegir nada no cuenta como
copia entregada.

### Enlaces externos

`Browser.open` abre los enlaces (las atribuciones, por ejemplo) en un
**SFSafariViewController**, con su barra y su botón de cerrar, en vez de
cargarlos dentro de la app.

### Sin service worker

La app de iOS, como la de Android, **no registra el service worker**
(`UpdatePrompt.tsx` comprueba `isNative()`). Dentro de la app, un precaché
seguiría sirviendo los ficheros viejos después de que el App Store instalara
una actualización. No se pierde nada: el catálogo, las ilustraciones y el
código ya viajan dentro de la app. Tampoco se enseña el consejo «Compartir →
Añadir a pantalla de inicio», que sólo tiene sentido en Safari.

### Fotos: selector del sistema y cámara

Las fotos de progreso y de perfil se eligen con `<input type="file"
accept="image/*">`. En iOS ese selector ofrece la fototeca y **hacer una
foto**: la fototeca no pide permiso (el sistema sólo entrega lo elegido), y la
cámara usa `NSCameraUsageDescription`, traducido en `InfoPlist.strings`. Es el
único permiso con texto en `Info.plist`.

### Sin copia de iCloud de los datos de la app

`AppDelegate` marca `Library/WebKit` — donde WKWebView guarda IndexedDB,
`localStorage` y la sesión de Firebase — como excluida de la copia de iCloud,
igual que `allowBackup="false"` en Android: la copia del sistema no debe mover
los datos de una cuenta a otro dispositivo. Con cuenta, los datos vuelven de la
nube al iniciar sesión.

### En el idioma de la app, no en el del teléfono

Todo lo que pinta el sistema por la app — la Live Activity, el aviso de
descanso — llega ya traducido desde JavaScript con `t()`. La extensión no tiene
palabras propias (sólo la marca «Training OS», con `Text(verbatim:)`) y nunca
usa `LocalizedStringKey`; `ios:verify` lo comprueba. En una instalación nueva,
el idioma de la app sale del dispositivo (`docs/ARQUITECTURA.md`, D45). Los
diálogos del sistema (permiso de notificaciones, «¿Abrir en Training OS?») son
de iOS y salen en el idioma del teléfono.

### No hay `GoogleService-Info.plist`

Firebase se usa desde el WKWebView con el SDK de JavaScript, igual que en la
web y en Android. El origen dentro de la app es `capacitor://localhost`. Para
el login con email y contraseña no hay que registrar nada en Firebase; para
bajar las fotos sí hay que permitir ese origen en el CORS del bucket de
Storage. Todo en `FIREBASE.md`, «Apps nativas».

---

## 8. Comprobar sin Mac: `ios:verify` y `test:ios`

### `npm run ios:verify`

Comprobación estática en un segundo, desde cualquier sistema. No sustituye a
compilar: caza la clase de error que, si no, aparece veinte minutos después en
el Mac de la CI con un mensaje mucho peor. Repasa:

* **`project.pbxproj`**: sintaxis, identificadores repetidos o que apuntan a
  nada, ficheros del proyecto que no están en disco.
* **Targets**: los tres, sus identificadores, iOS 16.2, sólo iPhone, la
  versión fijada sólo en el proyecto, sin CocoaPods, sin entitlements.
* **Extensión**: incrustada en `PlugIns`, sin Capacitor, `Info.plist` propio
  con la misma versión que la app.
* **Qué compila cada target**: cada `.swift` en el target que toca y
  `Shared/` en los dos.
* **Esquema compartido**: que prueba `TrainingOSUITests` y archiva en Release.
* **`Info.plist`**: Live Activities, esquema `trainingos://`, cámara, idiomas,
  sólo vertical, sin HTTP en claro, sin modos de segundo plano,
  `ITSAppUsesNonExemptEncryption = false`.
* **Contrato nativo**: los nueve métodos, el registro del plugin, las API de
  ActivityKit 16.2 y que la extensión no use cadenas localizables.
* **App Store Connect**: que git no lleve certificados, perfiles, claves
  `.p8` ni `GoogleService-Info.plist`; icono 1024×1024 sin alfa; manifiesto de
  privacidad con sus motivos.

Sale con 0 si todo pasa, 1 si algo falla.

### `npm run test:ios`

`e2e/ios-shell.mjs` carga la web en Chromium inyectando **antes del bundle** lo
que inyecta el WKWebView de Capacitor (`webkit.messageHandlers.bridge` y un
`Capacitor` con un plugin falso que contesta y apunta cada llamada). Prueba lo
que decide el código JavaScript dentro de una app de iOS: sin service worker,
splash y barra de estado sólo con `setStyle`, sin consejo de instalación,
enlaces externos fuera del WebView, Live Activity aunque se deniegue el
permiso, aviso de descanso sólo con él, el toque en la Live Activity y deslizar
para volver con una hoja abierta. **No prueba Swift**: eso lo hacen la CI y un
iPhone.

Necesita un build local-only servido en el puerto 4361:

```bash
npx vite build --mode localonly --outDir dist-native
npx vite preview --outDir dist-native --host 127.0.0.1 --port 4361 --strictPort
npm run test:ios       # en otra terminal (o BASE=http://... para otro puerto)
```

Además, `npm test` incluye `tests/unit-native.ts`, que ejecuta la mitad
JavaScript del plugin contra un iOS falso con el `@capacitor/core` de verdad.

Los resultados de la última ejecución están en
[`docs/IOS-FEATURE-PARITY.md`](IOS-FEATURE-PARITY.md).

---

## 9. Ejecutar en el simulador y en un iPhone

### Simulador

En Xcode: esquema **App**, un simulador, **Run ▶** (configuración Debug). La
Live Activity aparece en la pantalla de bloqueo del simulador (*Device → Lock*)
y, en los modelos Pro, en la Dynamic Island al salir de la app.

Algunas cosas útiles desde la terminal, con el simulador arrancado:

```bash
# Abrir el enlace de vuelta, como lo hace un toque en la Live Activity
xcrun simctl openurl booted "trainingos://workout/active?session=<id>"

# Las imágenes de la Live Activity (sólo Debug): lock screen e isla, ES/EN, claro/oscuro
xcrun simctl launch booted com.trainingos.app -renderLiveActivityPreviews
open "$(xcrun simctl get_app_container booted com.trainingos.app data)/Documents/live-activity-previews"
```

**Inspeccionar la web**: en una compilación Debug, Safari → *Desarrollo* →
nombre del simulador (o del iPhone) → `localhost`. Ahí están la consola, los
avisos `[training-os:native]` y la red.

**Pruebas de interfaz** (`TrainingOSUITests`): *Product → Test* (⌘U) en un
simulador. Arrancan la app, pasan el cuestionario, empiezan un entrenamiento y
fotografían la Live Activity, la cuenta atrás, el aviso de descanso, el final
y el enlace de vuelta. Esperan un paquete web **sin Firebase**, como el de la
CI: sincroniza sin `.env` (o con un build `--mode localonly`) antes de
lanzarlas.

### En un iPhone

1. Conéctalo por cable y acepta «Confiar en este ordenador».
2. En el iPhone: *Ajustes → Privacidad y seguridad → Modo de desarrollador*
   (iOS 16+) y reinicia cuando lo pida.
3. En Xcode, elige tu equipo de firma en los targets **App** y
   **TrainingOSWidgets**: `docs/IOS-SIGNING.md`, sección 4.
4. Elige el iPhone como destino y **Run ▶**.

Con un Apple ID gratuito (Personal Team) se puede instalar en tu propio iPhone
para probar, pero la instalación caduca a los pocos días y no hay TestFlight
ni App Store; para eso hace falta el Apple Developer Program.

La lista de lo que hay que comprobar a mano en un iPhone real está en
`docs/APP-STORE-CHECKLIST.md`, sección 6.

---

## 10. Integración continua: `.github/workflows/ios.yml`

Un Mac de GitHub Actions (`macos-26`, Xcode 26.6) compila la app en cada push a
la rama `ios-parity` y cuando se lanza a mano. **No firma nada.** Pasos:

1. `npm ci`, `npm test` y `npm run build` **sin `.env`**: la app va en modo
   local, sin tocar el proyecto real de Firebase.
2. `npx cap sync ios` y `npm run ios:verify`.
3. `xcodebuild -list` y `plutil -lint` de todos los plist.
4. Compila **Debug para el simulador** (con las pruebas) y **Release para
   dispositivo, sin firma** (`CODE_SIGNING_ALLOWED=NO`): lo que demuestra que
   el proyecto, el plugin y la extensión compilan de verdad.
5. Inspecciona el `App.app`: versión mínima, familia de dispositivos, Live
   Activities, esquema, idiomas, privacidad, la extensión en `PlugIns`.
6. En un simulador iPhone 17 Pro: las imágenes de la Live Activity
   (`-renderLiveActivityPreviews`), capturas del arranque en español y en
   inglés y las pruebas de interfaz; después, las mismas pruebas en un iPhone
   sin Dynamic Island.
7. Publica la evidencia en la rama **`ios-ci-evidence`**: registros (las
   últimas 400 líneas de cada uno), capturas del simulador, imágenes de la
   Live Activity y resúmenes de las pruebas. Esa rama sólo contiene la última
   ejecución y se puede leer sin iniciar sesión en GitHub.

Qué ha salido en cada ejecución, y qué falta por verificar, está en
[`docs/IOS-FEATURE-PARITY.md`](IOS-FEATURE-PARITY.md). La CI usa el simulador:
**no sustituye a un iPhone real** para la pantalla de bloqueo, la Dynamic
Island, los avisos con el móvil bloqueado ni el teclado.

---

## 11. Versiones

Dos números, como en Android:

* **`MARKETING_VERSION`** (`CFBundleShortVersionString`) — la que ve el usuario
  (`1.0.0`). Tiene que coincidir con `version` de `package.json`.
* **`CURRENT_PROJECT_VERSION`** (`CFBundleVersion`) — el número de compilación.
  **Hay que subirlo en cada subida a App Store Connect.**

Los dos se fijan **sólo en el proyecto**, y la app y la extensión los heredan:
App Store Connect rechaza una extensión con otra versión que la app. Cómo
cambiarlos sin romper eso: `docs/IOS-SIGNING.md`, sección 6.

---

## 12. Qué toca qué

* **`ios/App/App/public/`**: no se edita nunca. Es `dist/`, copiado por
  `cap sync`.
* **`ios/App/CapApp-SPM/Package.swift`**: no se edita a mano. Lo regenera
  `cap sync` con los plugins de `package.json`. Un plugin nuevo se instala con
  `npm install` y aparece tras `npx cap sync ios`.
* **`capacitor.config.json` y `config.xml`** dentro de `ios/App/App/`:
  generados. Se cambia `capacitor.config.ts`.
* **El texto de la interfaz** no se escribe en Swift: llega de JavaScript. Lo
  único traducido en el proyecto nativo son los textos del sistema de
  `InfoPlist.strings` (nombre y permiso de cámara), en `en.lproj` y `es.lproj`.
* **Un método nuevo del plugin** se añade a la vez en
  `docs/NATIVE-CONTRACT.md`, en Swift (`pluginMethods` + `@objc func`), en Java
  y en `src/lib/native/workoutNotification.ts`. `ios:verify` y
  `android:verify` fallan si el contrato y el código no coinciden.
* **Un campo nuevo de la Live Activity** va en `ContentState` como opcional (o
  con valor por defecto en el decodificador).
* **Una API nueva con «motivo obligatorio»** (fechas de ficheros,
  `UserDefaults`, espacio en disco…) se declara en `PrivacyInfo.xcprivacy`
  (ver `docs/APP-STORE-PRIVACY.md`).
* **La versión** se cambia en el proyecto, nunca en un target.
* **Cualquier función nueva** se evalúa en Web, Android e iOS: regla permanente
  de `docs/ARQUITECTURA.md`.

---

## 13. Problemas habituales

**La app se queda en el logo**
La web no ha llegado a ejecutarse: si el JavaScript arranca, el splash se
retira como mucho a los 6 segundos. Casi siempre es que falta
`ios/App/App/public/` o está vieja: `npm run ios:sync` y vuelve a ejecutar. Si
persiste, abre el inspector de Safari (sección 9) y mira la consola: un error
antes del arranque lo deja ahí.

**Los cambios de `src/` no aparecen**
La app lleva una copia del build, no el código fuente: `npm run ios:sync`.

**«Missing package product 'Capacitor…'» o paquetes que no resuelven**
Falta `node_modules` (los plugins se enlazan desde ahí) o el paquete quedó a
medias. `npm install`, `npx cap sync ios` y en Xcode *File → Packages → Reset
Package Caches*.

**Empiezo un entrenamiento y no aparece la Live Activity (ni llega el aviso)**
Primero, la consola del inspector: avisos `[training-os:native]` con métodos
que agotan su tiempo (4 s) o «not implemented» significan que **el plugin no
está registrado**. Comprueba que `SceneDelegate` crea `MainViewController()` y
que `capacitorDidLoad()` llama a `registerPluginInstance`; `npm run
ios:verify` lo detecta. Si el plugin contesta pero sin Live Activity:

* *Ajustes → Training OS → Actividades en directo* está desactivado (o el
  ajuste general de Actividades en directo). Es lo esperado: la app funciona
  igual, sin ella.
* La quitaste deslizando en esta misma sesión: no se vuelve a pedir hasta el
  siguiente entrenamiento.
* Se empezó con la app en segundo plano: iOS sólo deja pedirla en primer
  plano; aparece al volver a la app.

**El aviso «Descanso terminado» no llega**
Con la app delante no se presenta, a propósito: avisa la propia app. Con la app
en segundo plano o cerrada, mira *Ajustes → Training OS → Notificaciones*: si
se denegó el permiso al empezar el primer entrenamiento, la app no vuelve a
preguntar; hay que activarlo ahí. Con el sonido del descanso apagado en la app,
llega sin sonido. *No molestar* y los modos de concentración también lo
silencian.

**Las fotos de progreso no se ven en la app (en la web sí)**
Falta `capacitor://localhost` en el CORS del bucket de Storage: las fotos se
bajan con `getBlob`, que es una petición de otro origen. Ver `FIREBASE.md`,
«Apps nativas», y `firebase/storage-cors.json`.

**Error al iniciar sesión que menciona «referer» o «blocked»**
La clave web de Firebase tiene restricción por sitios web y no incluye el
origen de la app. Ver `FIREBASE.md`, «Apps nativas».

**iOS pregunta «¿Abrir en Training OS?»**
Es el diálogo de iOS para un esquema propio abierto desde fuera de la app
(Safari, `simctl openurl`). Se acepta y la app sigue el enlace; las pruebas de
interfaz lo aceptan solas.

**El icono sigue siendo el de Capacitor**
`npm run ios:assets`, *Product → Clean Build Folder* y vuelve a instalar. iOS
cachea los iconos: si persiste, borra la app del simulador o del iPhone.
