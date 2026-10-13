# ANDROID MIGRATION — LÍNEA BASE

Estado real del proyecto **antes** de tocar nada, medido ejecutando el proyecto
entregado en `training-os-source_16.zip`. Todo lo que hay aquí está verificado
con un comando; lo que no se ha podido verificar en este entorno está marcado
como tal, sin inventar resultados.

Fecha de la auditoría: 2026-09-21.

---

## 1. Identidad del proyecto

| Dato | Valor |
| --- | --- |
| Nombre | Training OS |
| Versión `package.json` | `1.0.0` |
| Tipo | SPA React + PWA instalable |
| Despliegue web actual | GitHub → Netlify (`trainingfitt.netlify.app`) |
| Ficheros versionados | 1233 (`git ls-files`) |
| Código fuente | 121 ficheros en `src/`, 22 072 líneas (`.ts`, `.tsx`, `.css`) |

### Stack

| Pieza | Versión |
| --- | --- |
| React | 18.3.1 |
| TypeScript | 5.6.2, `strict` activado |
| Vite | 5.4.8 |
| react-router-dom | 6.26.2 (`BrowserRouter`) |
| Zustand | 4.5.5 |
| Firebase JS SDK | 12.19.0 |
| idb (IndexedDB) | 8.0.0 |
| three.js | 0.186.0 |
| vite-plugin-pwa | 0.20.5 (Workbox, `generateSW`) |
| Playwright (tests) | 1.47.2 |

Nada de esto se toca en la conversión. `src/` sigue siendo común a web y
Android.

---

## 2. Línea base verde (medida, no estimada)

```
$ npm run build
✓ built in 14.10s
PWA v0.20.5 · generateSW · precache 53 entries (678.87 KiB)

$ npm test
226 passed, 0 failed     (tests/unit.ts)
 43 passed, 0 failed     (tests/catalog-integrity.mjs)
```

**269 tests unitarios y de integridad en verde.** Éste es el listón: cualquier
cambio de la conversión tiene que devolver exactamente estos números o más, sin
borrar ni desactivar un solo test.

Suites end-to-end existentes (Playwright, se ejecutan por separado):

| Script | Suite | Casos |
| --- | --- | --- |
| `npm run test:catalog-ui` | `e2e/catalog-ui.mjs` | 58 |
| `npm run test:onboarding` | `e2e/onboarding.mjs` | 33 |
| `npm run test:auth` | `tests/firebase-auth.mjs` (emulador) | 14 |
| `npm run test:boot` | `e2e/boot-matrix.mjs` | 14 |
| `npm run test:nav` | `e2e/nav-logo-shot.mjs` | 13 |
| `npm run test:cache` | `e2e/stale-cache.mjs` | 4 |
| `npm run test:sw` | `e2e/sw-offline.mjs` | 4 |
| `npm run test:account` | `e2e/account.mjs` (emulador completo) | — |
| `npm run test:rules` | `tests/firestore-rules.mjs` (emulador) | — |

---

## 3. Tamaño del build web (`dist/`)

| Carpeta | Tamaño |
| --- | --- |
| `dist/` total | **37 MB** |
| `dist/exercise-media/` | 31 MB (1023 ficheros SVG) |
| `dist/catalog/` | 4,0 MB (8 ficheros JSON) |
| `dist/assets/` | 2,2 MB (JS + CSS) |
| `dist/brand/` | 184 KB (tira de sprites del logo) |

Chunks mayores: `index.esm-CH_OhgYS.js` 658 KB (Firestore), `LogoTotem3D` 564 KB
(three.js), `index` 252 KB, `vendor` 164 KB. Todos cargan en diferido; el
arranque no los espera.

**Consecuencia para Android:** `webDir: 'dist'` mete esos 37 MB dentro del APK /
AAB como assets. Es aceptable (el límite de Play para el módulo base de un AAB
es 200 MB) y además es *mejor* que en web: el catálogo y las ilustraciones
viajan dentro de la app, disponibles sin red desde la primera apertura, sin
depender del service worker.

---

## 4. Auditoría área por área

### 4.1 Verificación de correo — ELIMINADA, y sigue eliminada

Comprobado por búsqueda en todo `src/`, `e2e/` y `tests/`:

* No existe `src/routes/auth/VerifyEmail.tsx`.
* No existe `resendVerification` ni `recheckVerification` en ninguna parte.
* `AuthPhase` en `src/store/useAuth.ts` es
  `'checking' | 'local-only' | 'signed-out' | 'migrating' | 'needs-username' | 'onboarding' | 'ready' | 'connection-error'`.
  No hay `needs-verification`.
* `AuthUser` no tiene `emailVerified`.

El flujo actual, que la conversión **no** modifica:

```
REGISTRO → Firebase crea la cuenta → sesión iniciada
        → username si procede → onboarding si corresponde → aplicación
```

Nada de la conversión a Android vuelve a introducir estos ficheros ni estos
estados.

### 4.2 Firebase dentro de un WebView — ya compatible

| Detalle | Estado |
| --- | --- |
| Método de acceso | Sólo email + contraseña. **No hay Google Sign-In** en el proyecto. |
| `initializeAuth` | Sin `popupRedirectResolver`: no arrastra la maquinaria de popup/redirect, que es justo lo que se rompe en un WebView. |
| Persistencia | `indexedDBLocalPersistence` → `browserLocalPersistence` → `inMemoryPersistence`. IndexedDB funciona en el WebView de Android. |
| Firestore | `initializeFirestore` con `experimentalAutoDetectLongPolling: true` y `memoryLocalCache()`. El long-polling es exactamente lo que hace falta cuando el WebSocket no pasa. |
| Storage | `getStorage(app)`, sólo fotos de progreso. |
| Recuperación de contraseña | `sendPasswordResetEmail(auth, email)` sin `continueUrl` → el enlace lo resuelve Firebase en su propio dominio, no la app. Funciona igual en Android. |

**Conclusión:** no hace falta ningún plugin nativo de autenticación. Al no
haber flujo de popup ni de redirect, no hay que registrar `com.trainingos.app`
como cliente OAuth ni tocar dominios autorizados para que el login funcione.

### 4.3 IndexedDB — ya compatible

* Versión de esquema `DB_VERSION = 3`, abierta con `idb`.
* Cola de salida propia (`syncQueue`) que guarda la *intención*, no el
  documento: sobrevive a cierres bruscos, que en Android son la norma.
* Lápidas (`tombstones`) y `_syncedAt` para el pull incremental.

El WebView de Android implementa IndexedDB completo. **No hay migración de
esquema, no se cambia `DB_VERSION`, y por supuesto no se borra la base de datos
para arreglar nada.**

### 4.4 Service worker — ÉSTE ES EL PUNTO QUE HAY QUE TRATAR

Situación actual:

* `registerType: 'prompt'`. El registro lo hace `useRegisterSW()` dentro de
  `src/components/layout/UpdatePrompt.tsx`, y sólo después de que la página
  termine de cargar (2,5 s). No hay script de registro inyectado en
  `index.html` (verificado: `grep registerSW dist/index.html` no devuelve nada).
* Precache de 53 entradas / 679 KB. `globIgnores` deja fuera `exercise-media/**`,
  `catalog/**`, three.js y el SDK de Firebase.
* `runtimeCaching` CacheFirst: `exercise-media-v1`, `catalog-v1`, `brand-v2`,
  `app-chunks-v1`.

**El problema en Android:** dentro de Capacitor la app se sirve desde
`https://localhost` y los ficheros salen del APK. Si además hay un service
worker con precache, una actualización de la app por Play Store cambia los
ficheros del APK **pero el service worker sigue sirviendo los suyos, viejos,
desde la Cache Storage**, y con `registerType: 'prompt'` esperaría a que el
usuario pulse un botón que puede no llegar a ver nunca. Es exactamente la clase
de fallo que ya se dio una vez en web con la tira de sprites del logo.

**Decisión: en Android el service worker no se registra.** No aporta nada — los
assets ya están dentro del APK, el funcionamiento sin red ya lo da el propio
empaquetado más IndexedDB — y elimina por completo el riesgo de quedarse
anclado en una versión antigua. La web mantiene su PWA intacta.

### 4.5 Áreas seguras (`safe-area-inset-*`) — ya usadas

19 usos de `env(safe-area-inset-*)` repartidos por `BottomNav`, `Page`,
`AuthShell`, `StepShell`, `Toaster`, `SyncBanner`, `RestTimerBar`,
`UpdatePrompt`, `CelebrationLayer`, `Welcome`, `WorkoutActive` y
`styles/index.css`.

Falta únicamente la parte nativa: declarar la ventana edge-to-edge y dejar que
el WebView reporte los insets. El CSS ya está preparado.

### 4.6 Botón atrás de Android — FALTA

`grep popstate` y `grep history.back` en `src/` no devuelven nada. Con
`BrowserRouter` y sin escuchar el botón físico, la primera pulsación del atrás
de Android cerraría la app aunque hubiera una hoja modal abierta.

Hay que añadir un manejador con la prioridad: hoja/modal abierta → cerrarla ·
histórico de navegación → retroceder · raíz → salir.

### 4.7 Temporizador de descanso en segundo plano — YA CORRECTO

`src/store/useWorkout.ts` guarda `endsAt: Date.now() + seconds * 1000` (una
marca de tiempo absoluta) y `tickRest` recalcula
`Math.max(0, Math.round((rest.endsAt - Date.now()) / 1000))`.
`RestTimerBar.tsx` sólo usa `setInterval(tick, 250)` para **releer**, no para
contar.

Es decir: si Android congela el WebView con la app en segundo plano, al volver
el temporizador muestra el tiempo correcto porque nunca dependió de que los
ticks se ejecutaran. **No hay nada que reescribir.** Lo único que falta, y es
opcional, es avisar cuando el descanso termina con la app en segundo plano.

### 4.8 Eliminación de cuenta — EXISTE, PERO INCOMPLETA

Lo que ya hace `AccountSection.tsx` → `wipeRemoteData(uid)` → `deleteAccount(pw)`:

1. Reautentica con `EmailAuthProvider` (obligatorio, Firebase lo exige).
2. Borra en lotes de 400 todos los documentos de las colecciones sincronizadas
   bajo `users/{uid}/...` y las lápidas.
3. Borra el documento de reserva del username.
4. Borra `users/{uid}`.
5. Llama a `deleteUser`.

**Hueco detectado:** las fotos de progreso subidas a Firebase **Storage**
(`users/{uid}/photos/{photoId}`, y `users/{uid}/avatar.jpg`) **no se borran**.
No hay ninguna llamada a `deleteObject` en todo el proyecto. Quedan huérfanas
en el bucket después de eliminar la cuenta.

Google Play exige que la eliminación de cuenta borre *todos* los datos del
usuario. Esto hay que cerrarlo, y hay que publicar además una URL de solicitud
de eliminación accesible sin instalar la app.

El borrado local sí ocurre, por otra vía: al cerrar sesión, `logout()` llama a
`resetLocalData(null)`, que vacía los almacenes sincronizados, la cola de
salida, el estado de sincronización y la personalización del onboarding.

### 4.9 Enlaces externos — hay 6

Todos en `src/routes/Attributions.tsx` (licencias CC BY-SA, repositorios de
origen de las ilustraciones), con `target="_blank" rel="noreferrer noopener"`.

En Capacitor, `target="_blank"` abre el enlace **dentro** del WebView por
defecto, dejando al usuario atrapado en una página de GitHub sin barra de
navegación. Hay que redirigirlos al navegador del sistema.

### 4.10 Reglas de seguridad — ya correctas

`storage.rules` restringe `users/{uid}/photos/{photoId}` y
`users/{uid}/avatar.jpg` al propietario, con límite de tamaño y comprobación de
`contentType`, y cierra todo lo demás con `allow read, write: if false`.
`firestore.rules` acompaña. No se tocan.

### 4.11 Secretos — estado actual del `.gitignore`

Ya ignora `node_modules`, `dist`, `.env`, `.env.local`, `.env.*.local`,
`*.local`, `.firebase/`, `dist-local`, logs y `*.tsbuildinfo`.

**Falta** cubrir lo que aparece al firmar una app Android: `*.jks`,
`*.keystore`, `android/keystore.properties`, `android/local.properties`,
`android/.gradle/`, `android/app/build/`, `android/build/`, y ficheros de
cuenta de servicio de Google Play. Se añade en la fase siguiente.

El `.env` local del proyecto **no se toca ni se borra**.

---

## 5. Entorno de compilación disponible aquí

Verificado ejecutando cada comando:

| Herramienta | Estado |
| --- | --- |
| JDK | ✅ 21.0.10 |
| Gradle | ✅ `/opt/gradle/bin/gradle` |
| npm / registro npm | ✅ alcanza `@capacitor/*@8.5.2` |
| **Android SDK** | ❌ **NO DISPONIBLE** |
| `dl.google.com` (repositorio Maven de Google) | ❌ bloqueado por la red |

**Consecuencia, dicha sin rodeos:** en este entorno se puede generar el proyecto
Android completo, escribir su configuración y validarla, pero **no se puede
ejecutar `./gradlew assembleDebug` ni producir un APK**. Todo lo que dependa del
SDK de Android queda marcado en el informe final como
`NOT VERIFIED LOCALLY — REQUIRES ANDROID SDK`, con los pasos exactos para que se
ejecute en una máquina con Android Studio. No se inventa ningún resultado.

---

## 6. Requisito de Google Play vigente

Verificado en la documentación de Google Play: desde el **31 de agosto de 2026**,
las aplicaciones nuevas y las actualizaciones deben tener como objetivo
**Android 16 (API 36)** o superior (con posibilidad de prórroga hasta el 1 de
noviembre de 2026).

Por tanto la conversión fija `compileSdk = 36` y `targetSdk = 36` desde el
principio, no 34 ni 35.

---

## 7. Resumen: qué está ya listo y qué hay que hacer

| Área | Estado |
| --- | --- |
| Verificación de correo eliminada | ✅ ya, y se queda así |
| Firebase Auth (email/contraseña) en WebView | ✅ ya compatible |
| Firestore en WebView | ✅ ya compatible (`autoDetectLongPolling`) |
| IndexedDB | ✅ ya compatible |
| Temporizador de descanso en segundo plano | ✅ ya correcto (marca de tiempo absoluta) |
| `safe-area-inset-*` en CSS | ✅ ya presente (19 usos) |
| Reglas de seguridad | ✅ ya correctas |
| Service worker en Android | ⚠️ hay que desactivarlo en nativo |
| Botón atrás de Android | ⚠️ falta |
| Enlaces externos | ⚠️ hay que abrirlos en el navegador del sistema |
| Borrado de fotos en Storage al eliminar la cuenta | ⚠️ falta |
| URL pública de solicitud de eliminación | ⚠️ falta |
| Edge-to-edge, splash, iconos adaptativos | ⚠️ falta (parte nativa) |
| `.gitignore` para firma Android | ⚠️ falta |
| Documentación de Play (Data Safety, privacidad, firma) | ⚠️ falta |
