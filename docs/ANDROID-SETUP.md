# ANDROID — PUESTA EN MARCHA

Cómo compilar y ejecutar Training OS como app de Android. Un solo proyecto: el
mismo `src/` que se despliega en Netlify es el que va dentro del APK.

---

## 1. Qué necesitas instalado

| Herramienta | Versión | Cómo comprobarlo |
| --- | --- | --- |
| Node | 22 o superior (lo exige Capacitor 8) | `node -v` |
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
| `npm run android:verify` | Comprobación estática sin SDK: XML, recursos, permisos, receptores, plugin frente al contrato |

---

## 5. Qué toca cada parte

```
capacitor.config.ts              Identidad de la app, plugins, política de red
android/                         Proyecto nativo (Gradle, manifiesto, recursos)
  app/src/main/AndroidManifest.xml   Permisos, copia de seguridad, red
  app/src/main/res/values/styles.xml Temas, edge-to-edge, pantalla de arranque
  app/build.gradle                   Versión, firma, SDK
  gradle.properties                  trainingOsVersionCode
  app/src/main/java/.../WorkoutNotificationPlugin.java  El plugin propio: avisos y háptica
  app/src/main/java/.../WorkoutNotice.java              Notificación de entrenamiento en curso
  app/src/main/java/.../RestAlert.java                  Aviso «Descanso terminado» y su alarma
  app/src/main/java/.../RestAlarmReceiver.java          Recibe esa alarma
src/lib/native/                  La frontera en TypeScript
  platform.ts                        ¿Estamos dentro del APK?
  chrome.ts                          Barra de estado, splash, enlaces externos
  workoutNotification.ts             El plugin propio, visto desde la web
src/components/layout/NativeShell.tsx  Botón atrás, teclado y avisos de entrenamiento
docs/NATIVE-CONTRACT.md          El contrato JS ↔ nativo (Android e iOS)
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

### Dos avisos, y sólo dos: «entrenamiento en curso» y «Descanso terminado»

Mientras hay un entrenamiento abierto, la pantalla de bloqueo enseña un aviso
con el ejercicio, la serie, la sesión y **el tiempo corriendo solo**. Cuando
termina un descanso con la app en segundo plano, llega además un aviso puntual,
**«Descanso terminado»**. Se pide `POST_NOTIFICATIONS` para esos dos y para
nada más, y `SCHEDULE_EXACT_ALARM` para que el segundo llegue a su hora.

Son cosas distintas: el primero es el estado continuo del entrenamiento
(`WorkoutNotice.java`, id 4711); el segundo, un aviso que suena o vibra y se va
(`RestAlert.java`, id 4712). El contrato completo — métodos, datos, quién llama
a qué y cuándo — está en `docs/NATIVE-CONTRACT.md`, y es el mismo que cumple
iOS.

Cómo funciona, y por qué así:

* **Los cronómetros los pinta Android**, no la app:
  `NotificationCompat.Builder` con `setUsesChronometer(true)` y
  `setWhen(inicio)`. A partir de ahí el sistema cuenta solo. Por eso **no hay
  servicio en primer plano** ni `FOREGROUND_SERVICE_HEALTH`, ni nada que tenga
  que seguir ejecutándose con la pantalla apagada. `@capacitor/local-notifications`
  no expone este cronómetro, así que es un plugin propio:
  `android/app/src/main/java/com/trainingos/app/WorkoutNotificationPlugin.java`,
  registrado en `MainActivity.java`, con los nueve métodos del contrato
  (`start`, `stop`, `scheduleRestAlert`, `cancelRestAlert`, `haptic`,
  `isSupported`, `checkPermissions`, `requestPermissions`,
  `requestExactAlarm`) y el evento `open`. `npm run android:verify` comprueba
  que Java, TypeScript y el contrato tienen los mismos.
* **El lado web** está en `src/lib/native/workoutNotification.ts` y se engancha
  en `src/components/layout/NativeShell.tsx`: publica el aviso al empezar,
  lo actualiza al cambiar de ejercicio, de serie o de descanso y lo retira al
  finalizar o descartar. En el navegador no hace nada y no descarga ni un byte
  de Capacitor.
* **Durante un descanso**, la misma notificación cambia de modo. Se pinta
  siempre desde las preferencias guardadas y con la hora de ese momento
  (también cuando se re-publica al bloquear o al deslizarla), así que **nunca
  enseña una cuenta atrás vencida**:
  - con la alarma del descanso programada **exacta** y el descanso aún sin
    vencer: cuenta atrás del sistema hasta su final
    (`setChronometerCountDown(true)` + `setWhen(fin)`). A esa hora la alarma la
    devuelve a modo cronómetro;
  - con la alarma **aproximada** (sin el permiso): cronómetro del entrenamiento
    y «Descanso · hasta 12:30», porque no se sabe cuándo podrá repintarse;
  - en **pausa**: «Descanso · 1:30 · En pausa»; ya **vencido**: «Descanso
    terminado».
* **El aviso «Descanso terminado».** Al empezar, ajustar o reanudar un
  descanso, la app llama a `scheduleRestAlert` con la hora del final; al
  pausarlo, saltarlo o terminarlo antes, a `cancelRestAlert`. Se programa con
  `AlarmManager` sobre el reloj de tiempo transcurrido (no la hora del
  teléfono): `setExactAndAllowWhileIdle` si `canScheduleExactAlarms` lo permite
  y, si no, `setAndAllowWhileIdle`. La recibe `RestAlarmReceiver.java` (no
  exportado, sin intent-filter), que sólo lee las preferencias — puede
  ejecutarse en un proceso recién arrancado —, comprueba que el aviso sigue
  siendo el vigente (misma sesión y misma hora) y, **si la app no se está
  viendo**, lo publica. Con la app delante no publica nada: avisa la propia
  app. Categoría `REMINDER`, no `ALARM`; sin pantalla completa; se va al
  tocarlo, al volver a la app o solo a los cinco minutos.
* **Sonido y vibración del aviso**, según los ajustes de la app. En Android 8+
  el sonido y la vibración son del canal y no se pueden cambiar después, así
  que hay cuatro canales, que se crean la primera vez que hacen falta:
  `rest_alert_sv` (sonido y vibración), `rest_alert_s`, `rest_alert_v` y
  `rest_alert_quiet`, todos de importancia alta. Los cuatro se llaman igual en
  Ajustes del sistema («Fin del descanso»): si alguien cambia los ajustes de la
  app, puede ver dos con el mismo nombre.
* **La alarma exacta** (`SCHEDULE_EXACT_ALARM`, «Alarmas y recordatorios») es un
  acceso especial, no un diálogo. Android 12 y 13 lo conceden por defecto;
  desde Android 14 viene denegado; por debajo de 12 no existe. La primera vez
  que empieza un descanso, sólo si falta y las notificaciones están
  permitidas, la app enseña una hoja explicando para qué es, con «Activar en
  Ajustes» y «Ahora no». Una sola vez. «Activar» llama a `requestExactAlarm`,
  que abre ese ajuste de la app y, al volver, comprueba de nuevo. El descanso
  ya en marcha se programa aproximado al momento y pasa a exacto si se
  concede. Nunca se mira la versión de Android: siempre
  `AlarmManagerCompat.canScheduleExactAlarms`. Sin el permiso, el aviso llega
  igual pero cuando Android quiere: puede retrasarse bastante (en reposo
  profundo, hasta una buena parte del descanso).
* **Vibración háptica** (`haptic`): `View.performHapticFeedback` sobre el
  WebView, en el hilo principal. No necesita el permiso `VIBRATE` — que la app
  no pide, y sin el cual `navigator.vibrate` no hace nada dentro del APK — y
  respeta el ajuste de respuesta táctil del teléfono. `CONFIRM` y `REJECT` en
  Android 11+; por debajo, los equivalentes más cercanos.
* **El permiso se pide la primera vez que se empieza un entrenamiento**, nunca
  al abrir la app. Si se deniega no se vuelve a preguntar y todo funciona igual,
  sin el aviso. Si después se activa en los ajustes del sistema, el aviso
  aparece solo en el siguiente entrenamiento.
* **Persistente.** Es `ongoing`: con el teléfono bloqueado con PIN, patrón o
  huella no se puede descartar, y «Borrar todo» no lo quita. Desde Android 14
  el sistema sí deja deslizarlo con el teléfono desbloqueado o con un bloqueo
  sin PIN (es una regla de Android que ninguna app puede quitar); por eso la
  notificación lleva un `deleteIntent` hacia
  `WorkoutNoticeDismissedReceiver.java` (no exportado, sin permisos) que la
  vuelve a poner en el acto mientras el entrenamiento siga abierto. Además el
  plugin la vuelve a publicar cada vez que la app deja de verse. Lo que hay que
  enseñar se guarda en las preferencias de la app, así que esto funciona aunque
  el proceso de la app esté muerto.
* **En el idioma de la app**, no en el del teléfono: los títulos, los textos,
  las etiquetas del descanso y también el nombre y la descripción de los
  canales que se ven en Ajustes del sistema → Notificaciones los manda el
  código web con `t()`. El código nativo no tiene ninguna palabra de la
  interfaz: sólo junta las que recibe con « · » y formatea números. Los textos
  de `res/values*/strings.xml` son un respaldo que sólo se usa si un canal se
  crea antes de que haya llegado ninguno. El diálogo de permiso y la pantalla
  de «Alarmas y recordatorios» son del propio Android y salen en el idioma del
  teléfono.
* **Tocar cualquiera de los dos abre la app en la sesión**, también si estaba
  cerrada: el `PendingIntent` lleva el `sessionId` y llega a la web como evento
  `open`, que decide adónde ir (`docs/NATIVE-CONTRACT.md`).
* **Marca**: icono del rayo en la barra de estado, tintado en `#CDFF4F`, e icono
  grande con el rayo verde sobre tinta `#0A0B0D`, en los dos avisos.
* Canal `workout_in_progress`, importancia normal pero **sin sonido, sin
  vibración y sin globo**. Normal y no baja a propósito: muchos Android ocultan
  por defecto en la pantalla de bloqueo las notificaciones «silenciosas».

Para probarlo a mano: instala el APK de depuración, empieza un entrenamiento,
acepta el permiso y bloquea el teléfono. Para el descanso: marca una serie,
deja que empiece el descanso y bloquea el teléfono; al acabar debe llegar
«Descanso terminado» y la notificación de entrenamiento debe volver a contar
hacia arriba. Repítelo con «Alarmas y recordatorios» desactivado (Ajustes →
Apps → Training OS): el aviso puede llegar tarde y la notificación enseña
«Descanso · hasta HH:MM» en vez de la cuenta atrás. La lista completa está en
`docs/GOOGLE-PLAY-CHECKLIST.md`, sección 4.

Verificado en un emulador de Android 16 (API 36), antes del aviso de descanso:
sin diálogo al abrir la app; el permiso se pide al empezar el primer
entrenamiento; aviso en la pantalla de bloqueo con el cronómetro subiendo; con
PIN no se puede descartar; sin PIN o desbloqueado vuelve al instante tras
deslizarlo; tocarlo abre la sesión, también con la app cerrada; al terminar o
descartar desaparece y no vuelve; con el permiso denegado la app funciona igual
y no vuelve a preguntar. **El aviso de descanso, la cuenta atrás, la alarma
exacta y la háptica nativa están compilados y comprobados con
`npm run android:verify`, pero aún no en un dispositivo**: hay que pasar la
lista de la sección 4 de `docs/GOOGLE-PLAY-CHECKLIST.md`.

Sin `RECEIVE_BOOT_COMPLETED`: si el teléfono se reinicia a mitad de un
descanso, la alarma se pierde. El temporizador guarda una marca de tiempo
absoluta (`endsAt`, en `src/store/useWorkout.ts`), así que al abrir la app
enseña el tiempo correcto igualmente.

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

**El aviso «Descanso terminado» llega tarde o la notificación no hace cuenta atrás**
Falta el acceso «Alarmas y recordatorios» (Ajustes → Apps → Training OS →
Alarmas y recordatorios), que en Android 14+ viene desactivado. Es lo esperado
sin él: aviso aproximado y «Descanso · hasta HH:MM». Si está activado y aun así
llega tarde, mira si el fabricante restringe la batería de la app.

**El aviso «Descanso terminado» no llega nunca**
Con la app delante no se publica, a propósito: avisa la propia app. Con la app
en segundo plano, comprueba que las notificaciones de Training OS y el canal
«Fin del descanso» están activados en Ajustes.

**El icono sigue siendo el de Capacitor**
`npm run android:assets` y vuelve a compilar. Desinstala la app antes: Android
cachea los iconos del lanzador de forma bastante agresiva.
