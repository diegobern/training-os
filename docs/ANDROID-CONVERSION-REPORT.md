# ANDROID CONVERSION REPORT — TRAINING OS

Conversión de la aplicación entregada en `training-os-source_16.zip` en una app
de Android publicable en Google Play, **sin rehacer nada** y manteniendo la web
funcionando exactamente igual.

Fecha: 21 de septiembre de 2026.

> **Actualización del 13 de octubre de 2026 (v2).** Este informe describe la
> conversión tal como se entregó y se conserva como estaba. Desde entonces:
> la app pide un segundo permiso, `POST_NOTIFICATIONS`, para el aviso de
> «entrenamiento en curso» de la pantalla de bloqueo (plugin propio
> `WorkoutNotificationPlugin.java`, sin servicio en primer plano); hay un
> cronómetro del entrenamiento visible en toda la app, una confirmación antes
> de finalizar, las instrucciones de los ejercicios en español y ya no existen
> los datos de ejemplo. Lo vigente sobre permisos está en el manifiesto,
> `docs/ANDROID-SETUP.md` y `docs/GOOGLE-PLAY-DATA-SAFETY.md`.

---

## BASELINE

El punto de partida, medido ejecutando el proyecto entregado, no estimado. El
detalle completo está en `docs/ANDROID-MIGRATION-BASELINE.md`.

| | |
| --- | --- |
| Ficheros versionados | 1233 |
| Código fuente | 121 ficheros en `src/`, 22 072 líneas |
| Build web | ✅ exit 0, 14,1 s, precaché 53 entradas / 678,87 KiB |
| Tests | ✅ **226** unitarios + **43** de integridad del catálogo |
| `dist/` | 37 MB (31 MB de ilustraciones, 4 MB de catálogo, 2,2 MB de JS/CSS) |
| Verificación de correo | Ya eliminada. No existe `VerifyEmail.tsx`, ni `resendVerification`, ni `recheckVerification`, ni el estado `needs-verification`. |

Lo que la auditoría encontró **ya resuelto** y no hubo que tocar: Firebase Auth
sin popup ni redirect (compatible con WebView tal cual), Firestore con
`experimentalAutoDetectLongPolling`, IndexedDB, el temporizador de descanso —
que ya guarda una marca de tiempo absoluta y por tanto sobrevive a que Android
congele el WebView —, 19 usos de `env(safe-area-inset-*)` y las reglas de
seguridad de Firestore y Storage.

Lo que faltaba: el service worker dentro del APK, el botón físico de atrás, los
enlaces externos, el borrado de las fotos de Storage al eliminar la cuenta, la
descarga de la copia de seguridad, y toda la capa nativa.

---

## FILES ADDED

**Capa nativa en TypeScript (la frontera; nada más de `src/` sabe que Android existe)**

```
capacitor.config.ts                         Identidad, plugins, política de red
src/lib/native/platform.ts                  isNative / platform / isNativeAndroid
src/lib/native/chrome.ts                    Barra de estado, splash, enlaces, ficheros
src/lib/ui/dismissStack.ts                  Pila de hojas y diálogos abiertos
src/components/layout/NativeShell.tsx       Botón atrás y teclado
src/components/ui/ExternalLink.tsx          Enlaces que salen de la app
```

**Herramientas**

```
scripts/android/brand-assets.mjs            Genera iconos y splash desde favicon.svg
scripts/android/verify-resources.mjs        16 comprobaciones del proyecto Android sin SDK
e2e/android-shell.mjs                       11 comprobaciones con el puente emulado
```

**Páginas públicas exigidas por Google Play**

```
public/account-deletion.html                Cómo eliminar la cuenta (ES + EN)
public/privacy.html                         Política de privacidad (ES + EN, plantilla)
```

**Documentación**

```
docs/ANDROID-MIGRATION-BASELINE.md          Estado real antes de tocar nada
docs/ANDROID-SETUP.md                       Compilar, ejecutar, decisiones tomadas
docs/ANDROID-SIGNING.md                     Almacén de claves, firma, CI
docs/GOOGLE-PLAY-DATA-SAFETY.md             Respuestas exactas al formulario
docs/GOOGLE-PLAY-CHECKLIST.md               Lista de publicación
```

**Proyecto nativo** — `android/`, 51 ficheros versionados, generado con
`npx cap add android` y después modificado (ver ANDROID CONFIG).

---

## FILES MODIFIED

| Fichero | Qué cambia |
| --- | --- |
| `src/App.tsx` | Monta `<NativeShell />`. Dos líneas. |
| `src/components/layout/UpdatePrompt.tsx` | No registra el service worker en Android. |
| `src/lib/bootmark.ts` | `dismissBootMark()` retira también la pantalla de arranque nativa. |
| `src/store/useApp.ts` | `applyTheme` sincroniza la barra de estado con el tema. |
| `src/components/ui/primitives.tsx` | `Sheet` se apunta en la pila de descartables; `onClose` pasa por una referencia para no reordenar la pila en cada render. |
| `src/routes/Attributions.tsx` | Sus 6 enlaces externos usan `<ExternalLink>`. |
| `src/lib/backup.ts` | La exportación usa el menú de compartir en Android. |
| `src/lib/sync/engine.ts` | `wipeRemoteData` borra además los ficheros de Cloud Storage. |
| `src/components/settings/AccountSection.tsx` | Eliminar la cuenta limpia también la copia local. |
| `src/lib/i18n/{es,en}.ts` | Una cadena nueva: `native.pressBackAgain`. |
| `vite.config.ts` | Nombra los trozos de Capacitor `native-*` y los deja fuera del precaché. |
| `scripts/doctor.mjs` | Vigila también `android/`; nunca borra `.env` ni claves de firma. |
| `.gitignore` | Cubre almacenes de claves, artefactos de Gradle y lo que genera `cap sync`. |
| `package.json` | 7 scripts nuevos. |
| `tests/unit.ts` | 17 tests nuevos. |

**Ninguno de estos cambios altera el flujo de registro.** Sigue siendo:
`REGISTRO → Firebase crea la cuenta → sesión → username si procede → onboarding
si corresponde → aplicación`, sin verificación de correo. Verificado ejecutando
`e2e/authgate.mjs` contra el emulador de Firebase Auth: 28/28, incluidos
*«el registro no pide verificar el correo»* y *«el registro no envía ningún
correo de verificación»*.

---

## DEPENDENCIES ADDED

| Paquete | Versión | Para qué | Permisos que añade |
| --- | --- | --- | --- |
| `@capacitor/core` | 8.5.2 | Puente nativo | — |
| `@capacitor/android` | 8.5.2 | Plataforma Android | — |
| `@capacitor/cli` (dev) | 8.5.2 | `cap add`, `cap sync` | — |
| `@capacitor/app` | 8.1.1 | Botón físico de atrás | — |
| `@capacitor/browser` | 8.0.4 | Enlaces externos en Custom Tab | — |
| `@capacitor/status-bar` | 8.0.3 | Color de los iconos de la barra | — |
| `@capacitor/splash-screen` | 8.0.2 | Retirar el splash cuando toca | — |
| `@capacitor/keyboard` | 8.0.5 | Comportamiento del teclado | — |
| `@capacitor/filesystem` | 8.1.3 | Escribir la copia de seguridad en caché | — |
| `@capacitor/share` | 8.0.2 | Entregar ese fichero al usuario | — |

**Ninguna añade un solo permiso.** No se ha instalado nada de publicidad,
facturación, analítica, notificaciones ni Health Connect.

En web pesan **0 bytes efectivos**: no hay ningún import estático de Capacitor,
y los trozos `native-*.js` quedan fuera del precaché. Verificado por
`e2e/android-shell.mjs`: *«web — el navegador no llega a descargar el puente de
Capacitor»*.

---

## ANDROID CONFIG

`capacitor.config.ts`:

* `appId: 'com.trainingos.app'`, `appName: 'Training OS'`, `webDir: 'dist'`.
* `androidScheme: 'https'` (por defecto) → la app se sirve desde
  `https://localhost`, que la mantiene en contexto seguro: es lo que exigen
  IndexedDB con cuota estable y el SDK de Firebase.
* `allowMixedContent: false`. **No hay ningún `cleartext` en ninguna parte.**
* `webContentsDebuggingEnabled: false` — el WebView no es inspeccionable en release.
* **No hay `server.url`.** Ese campo apuntaría el WebView a un servidor remoto;
  en una app publicada sería convertirla en un navegador apuntando a una URL.
* Splash con `launchAutoHide: false`: lo retira la aplicación cuando ya sabe qué
  pantalla enseñar, no un temporizador.

`android/app/src/main/AndroidManifest.xml`:

* `allowBackup="false"` + `fullBackupContent` + `dataExtractionRules` que
  excluyen todo. Motivo: los datos ya viven en la cuenta de Firebase, y una
  copia del sistema restaurada en otro móvil llevaría la IndexedDB de una
  cuenta a otra sesión.
* `networkSecurityConfig` que prohíbe HTTP en claro en **todos** los dominios,
  más `usesCleartextTraffic="false"`.
* `windowSoftInputMode="adjustResize"`.
* Cada permiso que **no** se pide está comentado ahí mismo con la razón.

`android/app/src/main/res/values/styles.xml`:

* Tema `DayNight`, barras de estado y navegación transparentes (edge-to-edge,
  obligatorio con targetSdk ≥ 35).
* Splash con `windowSplashScreenBackground`, `windowSplashScreenAnimatedIcon` y
  `postSplashScreenTheme`, que es lo que evita el parpadeo entre el logo y la
  interfaz.

`android/app/src/main/res/values/colors.xml` — **nuevo, y sin él el proyecto no
compila**. La plantilla de Capacitor genera un `styles.xml` que referencia
`@color/colorPrimary`, `colorPrimaryDark` y `colorAccent` sin definirlos en
ningún sitio. Lo detectó `scripts/android/verify-resources.mjs`.

`android/app/build.gradle`:

* `versionName` leído de `package.json` — un solo sitio para web y Android.
* `versionCode` desde `android/gradle.properties` (`trainingOsVersionCode`).
* Firma leída de `android/keystore.properties`, **que está ignorado por git**.
  Si el fichero no existe, el build no falla: genera la release sin firmar.
* `minifyEnabled false`, con el razonamiento escrito al lado.

**Iconos y splash**: generados desde el trazado del rayo de `public/favicon.svg`
con `npm run android:assets`. Icono adaptativo (fondo + primer plano vectorial),
**icono monocromo** para los iconos temáticos de Android 13+, iconos clásicos
para Android 7 y las 11 imágenes de la pantalla de arranque. Ya no queda nada
del logotipo de Capacitor.

---

## PACKAGE ID

`com.trainingos.app` — en `capacitor.config.ts`, `android/app/build.gradle`
(`namespace` y `applicationId`) y `res/values/strings.xml`. Sin cambios
respecto a lo pedido.

**No se ha cambiado ningún identificador de ejercicio, ningún esquema, ninguna
ruta de Firestore ni `DB_VERSION`.** No hay migración de datos porque no hay
nada que migrar.

---

## SDK VERSIONS

| | |
| --- | --- |
| `compileSdk` | **36** |
| `targetSdk` | **36** (Android 16) |
| `minSdk` | 24 (Android 7.0) |
| JDK | 21 |
| Android Gradle Plugin | 8.13.0 |
| Gradle wrapper | el que genera Capacitor 8.5.2 |

El 36 no es opcional: Google Play exige targetSdk 36 para apps nuevas y
actualizaciones **desde el 31 de agosto de 2026** (prórroga posible hasta el 1
de noviembre de 2026). Verificado en la documentación de Play, no de memoria.

---

## CAPACITOR VERSION

**8.5.2** (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`).

---

## PERMISSIONS

**Uno.**

| Permiso | Nivel | Por qué | Sin él |
| --- | --- | --- | --- |
| `android.permission.INTERNET` | Normal | Firebase Authentication, Cloud Firestore y Cloud Storage: iniciar sesión, sincronizar entre dispositivos, guardar las fotos. | No habría cuenta ni copia en la nube. |

Es un permiso *normal*: no se pide al usuario en tiempo de ejecución y no
aparece como peligroso en la ficha de Play. **La app no muestra ni un solo
diálogo de permiso.**

Lo que deliberadamente **no** se pide, y por qué:

| No pedido | Razón |
| --- | --- |
| `ACCESS_NETWORK_STATE` | El estado de la conexión se lee con `navigator.onLine`. |
| `CAMERA`, `READ_MEDIA_IMAGES` | Las fotos se eligen con `<input type="file">`; el selector del sistema entrega el fichero ya elegido. |
| `POST_NOTIFICATIONS` | El temporizador ya es correcto sin notificaciones (ver BACKGROUND TIMER STRATEGY). |
| `FOREGROUND_SERVICE`, `WAKE_LOCK` | Nada tiene que seguir ejecutándose con la pantalla apagada. |
| `ACCESS_*_LOCATION` | La app no usa la ubicación. |
| `android.permission.health.*` | No hay integración con Health Connect. |
| `com.android.vending.BILLING` | No hay compras ni suscripciones. |

---

## FIREBASE STRATEGY

**El SDK de JavaScript, desde el WebView. No se añade el SDK nativo.**

Funciona tal cual, y no por suerte:

* El único método de acceso es **email y contraseña**. No hay Google Sign-In en
  el proyecto, así que no hay flujo de popup ni de redirect — que es justo lo
  que se rompe dentro de un WebView. No hace falta registrar la app Android en
  la consola de Firebase, ni un cliente OAuth, ni tocar dominios autorizados,
  ni `google-services.json`.
* `initializeAuth` se llama **sin** `popupRedirectResolver`, así que ni siquiera
  se carga esa maquinaria.
* La persistencia es `indexedDBLocalPersistence` → `browserLocalPersistence` →
  `inMemoryPersistence`. IndexedDB funciona en el WebView de Android, así que la
  sesión sobrevive a cerrar la app.
* Firestore ya estaba inicializado con `experimentalAutoDetectLongPolling: true`
  y `memoryLocalCache()`. El long-polling es exactamente lo que hace falta
  cuando el WebSocket no pasa.
* La recuperación de contraseña usa `sendPasswordResetEmail` **sin**
  `continueUrl`: el enlace lo resuelve Firebase en su propio dominio, no la app.

Carga diferida intacta: `getFirebaseAuth()` (app + auth) para el arranque,
`getFirebase()` (+ firestore + storage) después.

---

## INDEXEDDB STRATEGY

**Sin cambios.** `DB_VERSION` sigue siendo 3, el esquema es el mismo y no hay
migración.

El WebView de Android implementa IndexedDB completo, y la cola de salida propia
(`syncQueue`, que guarda la *intención* y no el documento) es especialmente
adecuada en Android, donde el sistema mata procesos en segundo plano sin avisar.

**No se borra la base de datos para arreglar nada.** Lo único que se añadió en
esta dirección es que eliminar la cuenta limpia la copia local, que es lo que
debe pasar cuando alguien pide que no quede nada.

---

## OFFLINE STRATEGY

En Android, **mejor que en web**: el catálogo (4 MB), las 1023 ilustraciones
(31 MB) y todo el código viajan **dentro del APK**. Están disponibles desde la
primera apertura, sin descargar nada y sin depender de ninguna caché.

Los datos del usuario siguen en IndexedDB, con la cola de salida que vacía
cuando hay red. Es el mismo motor de siempre.

Coste: el AAB lleva unos 37 MB de assets, que Play comprime. El límite del
módulo base de un AAB son 200 MB.

---

## SERVICE WORKER STRATEGY

**No se registra en Android. Es la decisión más importante de toda la conversión.**

Dentro de Capacitor la app se sirve desde `https://localhost` y los ficheros
salen del APK. Un service worker con precaché se quedaría con una copia. Cuando
Google Play instalara una actualización, el APK traería ficheros nuevos **pero
el service worker seguiría sirviendo los suyos, viejos**, y con
`registerType: 'prompt'` esperaría a que el usuario pulsara un botón de
«Actualizar» que puede no ver nunca. Una app actualizada ejecutando la versión
anterior, sin que nada falle de forma visible.

Este proyecto ya se comió esa clase de fallo una vez en web, con la tira de
sprites del logotipo servida en CacheFirst bajo un nombre que no cambiaba.

Implementación: `src/components/layout/UpdatePrompt.tsx` comprueba
`isNativeAndroid()` antes de montar el componente que llama a `useRegisterSW`.
No se registra nada y **ni siquiera se pide `/sw.js`**.

**La web mantiene su PWA sin un solo cambio de comportamiento**: mismo
`registerType: 'prompt'`, mismas reglas de `runtimeCaching`, mismo aviso de
actualización.

Verificado con `e2e/android-shell.mjs`, incluyendo **control negativo**: al
desactivar a mano la condición, la prueba falla (`registros: 1`). No es una
prueba tautológica.

---

## BACKGROUND TIMER STRATEGY

**No hacía falta reescribir nada, y la auditoría lo demostró antes de tocar
código.**

`src/store/useWorkout.ts` guarda `endsAt: Date.now() + seconds * 1000` — una
marca de tiempo absoluta — y `tickRest` calcula
`Math.max(0, Math.round((rest.endsAt - Date.now()) / 1000))`.
`RestTimerBar.tsx` sólo usa `setInterval(tick, 250)` para **releer**, no para
contar.

Es decir: si Android congela el WebView, al volver el temporizador enseña el
tiempo correcto, porque nunca dependió de que los ticks se ejecutaran.

Lo que **no** hace es avisar cuando el descanso termina con la app en segundo
plano. Se ha decidido **no** añadirlo, porque exigiría el permiso
`POST_NOTIFICATIONS`, que hay que declarar en Seguridad de los datos y aparece
en la ficha de Play. `docs/ANDROID-SETUP.md` explica los tres pasos exactos para
añadirlo si lo prefieres — es una decisión de producto, no una limitación
técnica.

---

## ACCOUNT DELETION STATUS

**Completo. Había un hueco y se ha cerrado.**

Lo que ya hacía: reautenticar, borrar todas las colecciones del usuario en lotes
de 400, borrar las lápidas, borrar la reserva del nombre de usuario, borrar
`users/{uid}` y llamar a `deleteUser`.

**Lo que faltaba:** las fotos de progreso y el avatar en Cloud Storage
**no se borraban**. No había ni una sola llamada a `deleteObject` en todo el
proyecto. Quedaban huérfanas en el bucket para siempre.

Ahora `wipeRemoteData`:

1. Lee primero los documentos de `photos` — son los que dicen dónde está cada
   fichero — y borra cada objeto de Storage, más `users/{uid}/avatar.jpg`.
2. Luego borra los documentos y las lápidas, como antes.

Se recorren los documentos en vez de listar la carpeta a propósito: listar
exigiría permiso de lectura sobre el prefijo `users/{uid}/photos`, que
`storage.rules` no concede — las reglas autorizan **por fichero**. No ha hecho
falta tocar las reglas.

Y `AccountSection.tsx` llama después a `resetLocalData(null)`, para que no quede
en el móvil el entrenamiento de una cuenta que acaba de eliminarse.

**Página pública**: `public/account-deletion.html`, bilingüe, explica el camino
dentro de la app, qué se borra, qué no se borra y cómo pedirlo por correo si no
se puede acceder. Se despliega con la web, así que es accesible sin instalar la
app y sin iniciar sesión, que es lo que Play exige.

---

## PRIVACY STATUS

* `public/privacy.html` — política de privacidad bilingüe. **Es una plantilla:
  quedan 10 apariciones de la palabra `COMPLETAR`** (responsable, país, correo
  de contacto). Están marcadas y listadas en el propio fichero.
* `docs/GOOGLE-PLAY-DATA-SAFETY.md` — las respuestas al formulario, sacadas del
  código: qué se recoge, con qué finalidad, dónde está cada cosa en el
  repositorio, y la lista de lo que **no** se recoge con la prueba de por qué.
* Sin analítica, sin Crashlytics, sin ID de publicidad, sin anuncios. Verificado:
  `package.json` no contiene ningún SDK de ese tipo.

---

## SECRETS

* `.gitignore` ampliado: `*.jks`, `*.keystore`, `*.p12`, `*.pepk`,
  `android/keystore.properties`, `android/local.properties`, cuentas de servicio
  de Google Play y de Firebase Admin, artefactos de Gradle y lo que regenera
  `cap sync`.
* **No se ha generado ninguna clave.** No hay ningún almacén dentro del
  repositorio ni dentro del zip. `docs/ANDROID-SIGNING.md` explica cómo crearlo
  fuera del proyecto.
* **No hay ninguna contraseña** en `build.gradle`, en `gradle.properties` ni en
  ningún fichero versionado. Comprobado por `scripts/android/verify-resources.mjs`.
* **Tu `.env` local no se ha tocado.** Sigue donde estaba, sigue ignorado y
  `npm run doctor --fix` ahora lo protege explícitamente aunque no esté en el
  manifiesto.

---

## TEST RESULTS

Todo esto se ha ejecutado. Ninguna cifra está estimada.

| Suite | Antes | Ahora | Resultado |
| --- | --- | --- | --- |
| `npm test` — unitarios | 226 | **243** | ✅ 243 passed, 0 failed |
| `npm test` — integridad del catálogo | 43 | 43 | ✅ 43 passed, 0 failed |
| `npm run typecheck` | — | — | ✅ exit 0, sin `any`, sin `@ts-ignore` |
| `e2e/catalog-ui.mjs` | 58 | 58 | ✅ 58 passed, 0 failed |
| `e2e/onboarding.mjs` | 33 | 33 | ✅ 33 passed, 0 failed |
| `e2e/authgate.mjs` (emulador Auth) | 28 | 28 | ✅ 28 passed, 0 failed |
| `e2e/boot-matrix.mjs` | 14 | 14 | ✅ 14 passed, 0 failed |
| `tests/firebase-auth.mjs` (emulador Auth) | 14 | 14 | ✅ 14 passed, 0 failed |
| `e2e/nav-logo-shot.mjs` | 13 | 13 | ✅ 13 passed, 0 failed |
| `e2e/stale-cache.mjs` | 4 | 4 | ✅ 4 passed, 0 failed |
| `e2e/sw-offline.mjs` | 4 | 4 | ✅ 4 passed, 0 failed |
| **`e2e/android-shell.mjs`** | — | **11** | ✅ 11 passed, 0 failed |
| **`scripts/android/verify-resources.mjs`** | — | **16** | ✅ 16 passed, 0 failed |
| `npm run doctor` | — | — | ✅ «Todo en orden, ninguno sobra» |
| `npm run doctor` sobre el zip extraído | — | — | ✅ 1265 ficheros, ninguno sobra |

**Total: 481 comprobaciones automáticas, todas en verde.**

Los 17 tests unitarios nuevos cubren la pila de descartables (el orden en que el
botón atrás cierra las cosas, incluido desapuntar por el medio y desapuntar dos
veces) y la detección de plataforma (navegador, Capacitor en modo web, Android,
iOS).

Las dos suites nuevas se han validado con **controles negativos**: se desactivó
a mano la condición que prueban y fallaron como debían. Concretamente:

* Quitando el `if (isNativeAndroid())` de `UpdatePrompt` →
  *«FAIL nativo — NO se registra ningún service worker · registros: 1»*.
* Quitando la interceptación de `ExternalLink` →
  *«FAIL enlaces — no se abre una vista encima sin forma de volver · 1 → 2»*.
* Quitando `res/values/colors.xml` →
  *«FAIL todas las referencias a recursos resuelven → @color/brandInk»*.

**No se ha borrado, desactivado ni comentado ningún test.**

### Lo que NO se ha podido ejecutar aquí

| Suite | Por qué |
| --- | --- |
| `npm run test:rules` | El emulador de Firestore descarga su `.jar` de `storage.googleapis.com`, bloqueado por la red de este entorno. Error literal: *«Failed to make request to https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.22.0.jar»*. |
| `e2e/account.mjs` | Necesita el emulador completo (Auth + Firestore + Storage), bloqueado por lo mismo. |

`firestore.rules` y `storage.rules` **no se han modificado**. El borrado de
fotos usa el permiso `allow delete: if isOwner(uid)` que ya existía por fichero;
está leído y razonado, pero **no ejecutado contra el emulador aquí**. Ejecuta
`npm run test:rules` y `npm run test:account` en tu máquina, donde la red no
está restringida.

---

## WEB BUILD RESULT

✅ **Exit code 0.**

```
$ npm run build
✓ built in 6,66 s

PWA v0.20.5 · generateSW
precache  53 entries (682,69 KiB)
```

Comparado con la línea base (53 entradas / 678,87 KiB): **mismo número de
entradas, +3,8 KiB**, que es el código nuevo de la capa nativa y una cadena de
traducción. Cero bytes de Capacitor.

Esto no salió bien a la primera, y merece la pena contarlo porque explica por
qué existe `e2e/android-shell.mjs`. El primer intento agrupaba Capacitor con
`manualChunks: { native: [...] }`, que parecía lo natural. Rollup metió dentro
de ese trozo el ayudante de precarga de Vite, con lo que **el trozo pasó a ser
una dependencia estática del bundle principal**: `index.html` emitía un
`modulepreload` y todos los navegadores descargaban y ejecutaban Capacitor en
cada visita. Exactamente lo contrario de lo que se pretendía, y completamente
invisible sin mirar el HTML generado. Lo detectó la prueba nueva. La solución es
renombrar el trozo con `chunkFileNames` en vez de forzarlo, lo que lo mantiene
como import dinámico de verdad y además le da un nombre predecible para excluirlo
del precaché.

---

## ANDROID BUILD RESULT

> ### ⚠️ NOT VERIFIED LOCALLY — REQUIRES ANDROID SDK
>
> **No se ha generado ningún APK ni ningún AAB, y no se afirma que se haya
> generado.**

Este entorno tiene JDK 21.0.10 y Gradle 8.14.3, pero **no tiene el SDK de
Android** (`ANDROID_HOME` vacío, no hay `sdkmanager` ni `adb`) y la red bloquea
el repositorio Maven de Google. El error literal al intentarlo:

```
$ gradle --no-daemon tasks
> Could not resolve com.android.tools.build:gradle:8.13.0.
   > Could not GET 'https://dl.google.com/dl/android/maven2/.../gradle-8.13.0.pom'.
     Received status code 403 from server: Forbidden
```

Lo que **sí** se ha verificado del proyecto Android, sin SDK, con
`scripts/android/verify-resources.mjs` (16/16):

* Los 14 ficheros XML están bien formados.
* Las 13 referencias distintas a recursos (`@color/…`, `@drawable/…`,
  `@style/…`, `@xml/…`, `@mipmap/…`) resuelven contra un recurso que existe.
  **Ésta es la comprobación que encontró el `colors.xml` que falta en la
  plantilla de Capacitor y que habría hecho fallar el primer `assembleDebug`.**
* El identificador de paquete, targetSdk 36, compileSdk 36.
* `allowBackup="false"`, `usesCleartextTraffic="false"`, política de red sin
  excepciones, un único permiso.
* Ninguna contraseña en `build.gradle`; la firma se lee de un fichero ignorado.
* `capacitor.config.ts` con el appId, el nombre y `webDir` correctos, y sin
  `server.url`.

Y `npx cap sync android` ✅ completa correctamente, encontrando los 7 plugins.

**Para cerrar este punto, en tu máquina:**

```bash
npm install
npm run android:verify     # las 16 comprobaciones estáticas
npm run android:debug      # genera el APK de depuración
npm run android:bundle     # genera el AAB firmado para Play
```

---

## KNOWN LIMITATIONS

1. **El APK no se ha compilado aquí.** Sin SDK de Android y sin acceso a
   `dl.google.com`. Marcado arriba como `NOT VERIFIED LOCALLY`.
2. **`test:rules` y `test:account` no se han ejecutado aquí.** El emulador de
   Firestore no puede descargar su `.jar`. Las reglas no se han modificado.
3. **`public/privacy.html` está incompleta a propósito.** 10 `COMPLETAR`:
   responsable, país y correo de contacto. No se han inventado.
4. **El correo de `account-deletion.html` es `soporte@ejemplo.com`.** Hay que
   cambiarlo. No se ha puesto tu dirección personal sin preguntarte.
5. **No hay notificación del temporizador de descanso en segundo plano.**
   Decisión consciente por el permiso que costaría; el temporizador en sí ya es
   correcto. Los tres pasos para añadirlo están en `docs/ANDROID-SETUP.md`.
6. **No hay app de iOS.** No se pidió. `src/lib/native/platform.ts` ya distingue
   `'ios'`, así que el día que se quiera el sitio donde decidir está hecho.
7. **`minifyEnabled` está en `false`.** Ganancia despreciable (casi todo es
   JavaScript ya minimizado) frente al riesgo de que R8 rompa la carga de
   plugins de Capacitor por reflexión.
8. **El AAB llevará unos 37 MB de assets.** Es el precio de que el catálogo y
   las 1023 ilustraciones funcionen sin red desde el primer segundo. Play
   comprime, y el límite del módulo base son 200 MB.

---

## MANUAL STEPS REQUIRED

En orden. Los cuatro primeros son imprescindibles para publicar.

1. **Rellenar `public/privacy.html`.** Busca `COMPLETAR` (10 veces): nombre o
   razón social del responsable, país o región, y correo de contacto.
2. **Cambiar `soporte@ejemplo.com`** por un correo real en
   `public/account-deletion.html` y en `public/privacy.html`.
3. **Desplegar la web** para que las dos páginas estén publicadas. Se suben con
   el despliegue normal de Netlify; no hay nada que configurar.
4. **Crear el almacén de claves** siguiendo `docs/ANDROID-SIGNING.md`, y
   `android/keystore.properties` apuntando a él. **Fuera del proyecto**, con
   copia de seguridad.
5. **Instalar el SDK de Android** (API 36 + Build-Tools 36.x) y ejecutar
   `npm run android:debug` para tener un APK que probar.
6. **Probar en un móvil real** la lista de `docs/GOOGLE-PLAY-CHECKLIST.md`
   sección 4: registro sin verificación, botón atrás, temporizador en segundo
   plano, exportar copia de seguridad, elegir foto, modo avión, eliminar cuenta.
7. **Subir `trainingOsVersionCode`** en `android/gradle.properties` antes de
   cada subida a Play.
8. **`npm run android:bundle`** y subir el AAB a **pruebas internas** primero.
9. **Rellenar el formulario de Seguridad de los datos** copiando
   `docs/GOOGLE-PLAY-DATA-SAFETY.md`, y pegar las dos URLs en la ficha.
10. **Activar Play App Signing** cuando Play lo ofrezca.
11. Cuando tengas red sin restricciones: `npm run test:rules` y
    `npm run test:account`.

---

## GOOGLE PLAY READINESS

**Técnicamente listo. Pendiente de cuatro datos tuyos y de una compilación con SDK.**

| Requisito | Estado |
| --- | --- |
| targetSdk 36 | ✅ |
| Formato AAB | ✅ configurado (`npm run android:bundle`) |
| Firma de release | ✅ configurada · ⬜ falta crear tu almacén de claves |
| Eliminación de cuenta en la app | ✅ completa, incluidas Storage y la copia local |
| URL pública de eliminación | ✅ escrita · ⬜ falta el correo real y desplegarla |
| Política de privacidad | ⬜ plantilla escrita, faltan 10 datos |
| Formulario de Seguridad de los datos | ✅ respuestas preparadas · ⬜ falta enviarlo |
| Permisos al mínimo | ✅ uno, documentado |
| Sin tráfico en claro | ✅ |
| Edge-to-edge | ✅ |
| Sin anuncios, compras, Health Connect | ✅ |
| Iconos adaptativos y monocromo | ✅ |
| Compilación verificada | ⬜ **requiere SDK de Android** |
| Prueba en dispositivo real | ⬜ |

---

## ENTREGABLES

| Fichero | Qué es |
| --- | --- |
| `training-os-source-android-ready.zip` | El proyecto completo (2405 ficheros, 26,5 MB). **Sin** `node_modules`, `dist`, `.git`, `.env` ni claves. Incluye `android/`, `release/FILES.json` y toda la documentación. Generado con `git archive`, así que no puede contener nada que no esté versionado. |
| `training-os-dist-web.zip` | El build web listo para servir (opcional; Netlify compila desde GitHub). |
| `ANDROID-CONVERSION-REPORT.md` | Este documento. |

El zip se ha extraído en limpio y verificado: `npm run doctor` da «ninguno
sobra» y `npm run android:verify` da 16/16.
