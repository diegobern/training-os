# ANDROID — PUESTA EN MARCHA

Cómo compilar y ejecutar Training OS como app de Android. Un solo proyecto: el
mismo `src/` que se despliega en Netlify es el que va dentro del APK.

---

## 1. Qué necesitas instalado

| Herramienta | Versión | Cómo comprobarlo |
| --- | --- | --- |
| Node | 20 o superior | `node -v` |
| JDK | **21** | `java -version` |
| Android Studio | Ladybug o posterior | — |
| Android SDK Platform | **API 36** (Android 16) | SDK Manager |
| Android SDK Build-Tools | 36.x | SDK Manager |

El JDK 21 es el que espera el Gradle que trae el proyecto. Con JDK 17 el build
falla con un error de versión de clase; con JDK 24 aún no todos los plugins de
Gradle van. Android Studio trae un JDK integrado que sirve
(`File → Settings → Build Tools → Gradle → Gradle JDK`).

En la primera apertura, Android Studio te pedirá crear `android/local.properties`
con la ruta del SDK. Ese fichero **no se versiona** y es normal que no exista en
un clon recién hecho.

---

## 2. Primer arranque

```bash
npm install
npm run android:sync     # build web + copia a android/
npm run android:open     # abre Android Studio
```

Y desde Android Studio: **Run ▶** con un emulador o un móvil conectado.

Sin Android Studio, desde la terminal:

```bash
npm run android:debug    # genera android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 3. El ciclo de trabajo diario

`android/app/src/main/assets/public/` es una **copia** del `dist/` web. No se
edita: se regenera.

```bash
npm run android:sync     # cada vez que cambies algo de src/
```

Si editas sólo código nativo (manifiesto, recursos, Gradle), no hace falta
sincronizar: compila directamente.

> **No edites nunca ficheros dentro de `android/app/src/main/assets/public/`.**
> El siguiente `cap sync` los sobrescribe sin avisar y habrás perdido el cambio.

---

## 4. Scripts disponibles

| Script | Qué hace |
| --- | --- |
| `npm run android:sync` | `npm run build` + `npx cap sync android` |
| `npm run android:open` | Abre el proyecto en Android Studio |
| `npm run android:debug` | Sincroniza y genera un APK de depuración |
| `npm run android:bundle` | Sincroniza y genera el AAB de release para Play |
| `npm run android:assets` | Regenera iconos y pantalla de arranque desde `public/favicon.svg` |

---

## 5. Qué toca cada parte

```
capacitor.config.ts              Identidad de la app, plugins, política de red
android/                         Proyecto nativo (Gradle, manifiesto, recursos)
  app/src/main/AndroidManifest.xml   Permisos, copia de seguridad, red
  app/src/main/res/values/styles.xml Temas, edge-to-edge, pantalla de arranque
  app/build.gradle                   Versión, firma, SDK
  gradle.properties                  trainingOsVersionCode
src/lib/native/                  La frontera en TypeScript
  platform.ts                        ¿Estamos dentro del APK?
  chrome.ts                          Barra de estado, splash, enlaces externos
src/components/layout/NativeShell.tsx  Botón atrás y teclado
scripts/android/brand-assets.mjs Generador de iconos y splash
```

**Nada más de `src/` sabe que Android existe.** Ésa es la regla: si algún día
hace falta una condición nativa nueva, se añade en `src/lib/native/` y el resto
de la aplicación sigue sin enterarse.

---

## 6. Versiones

Dos números y no son lo mismo:

* **`versionName`** — lo que ve el usuario (`1.0.0`). Sale de `package.json`,
  para que la web y la app no puedan decir versiones distintas.
* **`versionCode`** — un entero que sólo usa Google Play. Vive en
  `android/gradle.properties` como `trainingOsVersionCode`.

**Hay que subir `trainingOsVersionCode` en cada subida a Play**, aunque no
cambies `versionName`. Play rechaza un AAB con un `versionCode` ya usado.

---

## 7. Decisiones que conviene conocer antes de cambiarlas

### El service worker no se registra en Android

`src/components/layout/UpdatePrompt.tsx` comprueba `isNativeAndroid()` y no
registra nada. La razón completa está en un comentario dentro del propio
fichero; en corto: dentro del APK un service worker con precaché seguiría
sirviendo los ficheros viejos después de que Play instalara una actualización,
y con `registerType: 'prompt'` esperaría a un botón que el usuario puede no ver
nunca. La app quedaría actualizada por fuera y vieja por dentro, sin ningún
error visible.

No se pierde nada: el catálogo, las ilustraciones y el código ya viajan dentro
del APK. La PWA de la web sigue exactamente igual.

### No hay notificaciones

El temporizador de descanso guarda una **marca de tiempo absoluta**
(`endsAt`, en `src/store/useWorkout.ts`), no un contador. Si Android congela el
WebView, al volver muestra el tiempo correcto porque nunca dependió de que los
ticks se ejecutaran.

Lo que no hace es **avisar** cuando el descanso termina con la app en segundo
plano. Añadirlo es perfectamente viable y son tres pasos:

```bash
npm i @capacitor/local-notifications
```

1. Añadir `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />`
   al manifiesto, con su justificación al lado como las demás.
2. Pedir el permiso en tiempo de ejecución (Android 13+ lo exige) la primera vez
   que el usuario inicia un descanso, no al abrir la app.
3. Programar la notificación en `startRest` y cancelarla en `stopRest` / `tickRest`.

No se ha hecho porque añade un permiso, y el permiso hay que declararlo en el
formulario de Seguridad de los datos y aparece en la ficha de Play. La decisión
de si merece la pena es tuya, no del código.

### `minifyEnabled` está en `false`

R8 no toca el JavaScript, que es casi toda la app, y sí rompe la carga de
plugins de Capacitor por reflexión. El razonamiento largo está en
`android/app/build.gradle`.

### No hay `google-services.json`

Firebase se usa desde el WebView con el SDK de JavaScript, no con el SDK
nativo. No hace falta registrar la app Android en la consola de Firebase para
que funcione el login: no hay flujo de popup ni de redirect que necesite un
cliente OAuth. Todo va con email y contraseña.

---

## 8. Problemas habituales

**"SDK location not found"**
Falta `android/local.properties`. Abre el proyecto una vez con Android Studio y
se crea solo, o créalo a mano con `sdk.dir=/ruta/a/tu/Android/Sdk`.

**"Failed to find target with hash string 'android-36'"**
Falta la plataforma API 36 en el SDK Manager. Instálala.

**La app arranca en blanco**
Casi siempre es que `android:sync` no se ha ejecutado después de un cambio, o
que `dist/` no existe. Ejecuta `npm run android:sync`.

**Los cambios de `src/` no aparecen**
Lo mismo: el APK lleva una copia del build, no el código fuente.

**El icono sigue siendo el de Capacitor**
`npm run android:assets` y vuelve a compilar. Desinstala la app antes: Android
cachea los iconos del lanzador de forma bastante agresiva.
