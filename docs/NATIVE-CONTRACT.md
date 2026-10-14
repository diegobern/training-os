# Contrato nativo: un JavaScript, dos implementaciones

Training OS tiene **una sola lógica de negocio** (`src/`, React + TypeScript) y
dos envolturas nativas con Capacitor 8.5.2: Android (Java) e iOS (Swift). Todo
lo que la app necesita del sistema y que no cubre un plugin oficial pasa por
**un único plugin propio**, `WorkoutNotification`, con el mismo nombre, los
mismos métodos y los mismos datos en las dos plataformas. Cada plataforma lo
cumple con su API nativa correcta.

| Qué | Android | iOS |
|---|---|---|
| Entrenamiento en curso visible con el móvil bloqueado | Notificación persistente con cronómetro del sistema (`setUsesChronometer`) | Live Activity (ActivityKit) en pantalla de bloqueo y Dynamic Island, pintada por la Widget Extension (WidgetKit + SwiftUI) |
| Cuenta atrás del descanso en esa superficie | La misma notificación en cuenta atrás (`setChronometerCountDown`) sólo si la alarma es exacta y aún no ha vencido; si no, «Descanso · hasta HH:MM» | `Text(timerInterval:countsDown:)` hasta `restEndsAt`; `staleDate = restEndsAt` → «Descanso terminado» |
| Aviso puntual «Descanso terminado» | `AlarmManager.setExactAndAllowWhileIdle` (permiso `SCHEDULE_EXACT_ALARM`, pedido en contexto) o `setAndAllowWhileIdle` si no se concede (puede llegar hasta ~¾ del descanso tarde) → `RestAlarmReceiver` | `UNUserNotificationCenter` + `UNTimeIntervalNotificationTrigger`, identificador fijo |
| Vibración háptica | `View.performHapticFeedback` en el hilo principal (sin permiso `VIBRATE`) | `UIImpactFeedbackGenerator` / `UINotificationFeedbackGenerator` |
| Tocar el aviso → volver al entrenamiento | `PendingIntent` con extra `sessionId` → evento `open` | `widgetURL` / toque en la notificación → `trainingos://workout/active?session=<id>` → evento `open` |
| Atrás | Botón atrás del sistema (`backButton`) | Gesto de deslizar desde el borde (`allowsBackForwardNavigationGestures`) |
| Compartir copia de seguridad | `Filesystem` (caché) + `Share` | igual (hoja de compartir de iOS) |
| Enlaces externos | `Browser` (Custom Tab) | `Browser` (SFSafariViewController) |
| Pantalla de arranque | `SplashScreen.hide` cuando la app sabe qué pantalla toca | igual |

La Live Activity y el aviso de descanso **son cosas distintas**: la primera
es el estado continuo del entrenamiento; el segundo, un aviso puntual.

## Reglas

1. **Nada nativo puede tumbar un entrenamiento.** Cada llamada JS va envuelta
   y **con un tiempo máximo** (4 s; 120 s para `requestPermissions` y
   `requestExactAlarm`, que esperan a la persona): una promesa nativa que no
   responde no puede bloquear la cola. Un fallo se queda en `console.warn`.
2. **El idioma lo decide JavaScript.** Todo texto visible llega ya traducido
   con `t()`. El código nativo no tiene literales de interfaz (la marca
   «Training OS» no se traduce). La extensión de iOS usa `Text(verbatim:)` o
   variables `String`, nunca `LocalizedStringKey`.
3. **Tiempos = marcas absolutas en ms de época.** JavaScript nunca actualiza un
   contador segundo a segundo; el sistema pinta los cronómetros.
4. **Una sola presencia por sesión.** `start` es un *upsert* por `sessionId`;
   una presencia de otra sesión se termina primero. `stop` termina todas,
   cancela el aviso de descanso pendiente y retira el ya entregado.
5. **Permisos con contexto, una sola vez.** Nada se pide al abrir la app.
6. **Plugins locales registrados a mano**: Android
   `registerPlugin(WorkoutNotificationPlugin.class)` en `MainActivity`; iOS
   `bridge?.registerPluginInstance(WorkoutNotificationPlugin())` en
   `MainViewController.capacitorDidLoad()`, y `SceneDelegate` crea
   `MainViewController()` (no `CAPBridgeViewController()`).
7. **Cada método nativo resuelve o rechaza siempre.** iOS declara los nueve
   métodos en `pluginMethods` (`addListener` lo atiende Capacitor); un método
   ausente deja la promesa colgada.

## Plataforma (`src/lib/native/platform.ts`)

`isNative()` para todo lo que comparten las dos apps (splash, barra de
estado, teclado, compartir, enlaces, sin service worker, plugin propio,
háptica). `isNativeAndroid()` sólo para `backButton`/`exitApp`, los campos
`channel*` y el permiso de alarma exacta. `isNativeIOS()` para el gesto de
atrás, la barra de accesorios del teclado y `StatusBar` (en iOS sólo
`setStyle`).

## API (`src/lib/native/workoutNotification.ts`)

```ts
interface WorkoutPresence {
  sessionId: string            // id de la sesión activa
  startedAt: number            // session.startedAt + session.pausedMs (ms)
  title: string                // t('workout.notifTitle')
  body: string                 // línea de texto de Android
  sessionName: string          // sessionTitle(session, t)
  exerciseName: string | null  // ejercicio actual, traducido (exerciseTitle)
  setLabel: string | null      // t('live.setOf', { set, total })
  progressLabel: string        // t('workout.progress', { done, total })
  rest: null | {               // null si no hay descanso o si ya venció (!paused && endsAt <= ahora)
    endsAt: number             // ms
    total: number              // s
    paused: boolean
    remaining: number          // s (sólo significativo si paused)
  }
  labels: {
    rest: string; restOver: string; elapsed: string; paused: string
    restUntil?: string         // «Descanso · hasta 18:05»: Android lo usa si la alarma no es exacta
  }
  locale: string               // 'es-ES' | 'en-GB'
  channelName?: string         // Android
  channelDescription?: string
}

interface RestAlert {
  sessionId: string
  at: number                   // ms; at <= ahora + 0,5 s → se cancela y { scheduled: false }
  title: string                // t('notif.restEndTitle')
  body: string                 // t('notif.restEndBody', { exercise }) o t('notif.restEndBodyGeneric')
  sound: boolean               // settings.sounds && settings.restSound
  vibrate: boolean             // settings.haptics && settings.restVibrate (iOS: no separable del sonido)
  channelName?: string         // Android: t('notif.restChannel')
  channelDescription?: string  // Android: t('notif.restChannelBody')
}

plugin WorkoutNotification {
  start(p: WorkoutPresence): Promise<{ shown: boolean }>
  stop(): Promise<void>
  scheduleRestAlert(a: RestAlert): Promise<{ scheduled: boolean; exact: boolean }>
  cancelRestAlert(): Promise<{ delivered: boolean }>   // delivered: el aviso de ese descanso ya salió
  haptic(o: { kind: 'tick' | 'success' | 'pr' | 'warn' }): Promise<void>
  isSupported(): Promise<{ presence: boolean; restAlerts: boolean; exactAlarms: boolean }>
  checkPermissions(): Promise<{ display: PermissionState }>
  requestPermissions(): Promise<{ display: PermissionState }>
  requestExactAlarm(): Promise<{ exactAlarms: boolean }> // Android 12+: Ajustes; resto → true
  addListener('open', (e: { sessionId?: string }) => void)
}
```

`display` = permiso de notificaciones del sistema. **Android**: condiciona la
notificación de entrenamiento y el aviso (sin `display` no se llama a
`start` ni a `scheduleRestAlert`, como hoy). **iOS**: sólo condiciona el aviso
de descanso; la Live Activity se pide igualmente (no necesita ese permiso; si
el usuario las desactivó, `start` resuelve `{ shown: false }` sin error).

## JavaScript: quién llama a qué

`NativeShell.tsx` calcula el **estado deseado** a partir de `useWorkout`,
`useApp` y `useAuth` y lo aplica de forma declarativa:

- Presencia: sólo si `useAuth.phase` es `'ready'` o `'local-only'` y
  `useWorkout.loaded` y hay sesión. En cualquier otro caso → `stop`.
  Deduplicada con una clave derivada de las cadenas visibles (no del objeto
  sesión; teclear pesos no llama a nada). La clave vive en
  `workoutNotification.ts`, se fija al resolver `{ shown: true }` y se borra en
  `stop`, al denegarse el permiso y cuando la app vuelve a primer plano
  (`appStateChange` activo: iOS puede haber terminado la Live Activity).
- Aviso de descanso deseado = `rest && !rest.paused && rest.endsAt > ahora`.
  Si pasa de un aviso con `at` futuro a ninguno (pausa, saltar, terminar
  antes) → `cancelRestAlert`. Si el aviso deseado desaparece porque su hora
  llegó (fin natural) → **no** se cancela: el sistema lo da. Cambio de idioma
  o de `at` → `scheduleRestAlert` de nuevo (reemplaza).
- Toque (`open`): se guarda hasta `loaded` y fase `'ready'`/`'local-only'` y
  entonces `routeForWorkoutTap(id, sesiónActiva, sesiónGuardada)`:
  id ausente o igual a la activa → `/workout/active`; sesión terminada →
  `/history/<id>`; si no (desconocida, descartada, de otra cuenta, id mal
  formado) → `/`. Id válido: `^[A-Za-z0-9-]{1,64}$`.
- Arranque: la reconciliación es la misma regla (presencia deseada vs. real).

`useWorkout` (estado y datos):

- `reset({ flush })`: cancela el guardado pendiente, sube una `epoch` (cada
  acción asíncrona comprueba la suya tras cada `await` y no escribe si
  cambió), vacía la sesión en memoria. `flush: true` guarda antes lo pendiente
  si el dueño no cambia.
- `engine.setBeforeLocalReset(fn)`: `resetLocalData` y `wipeEverything` llaman a
  `fn` **sincrónicamente lo primero**; `main.tsx` lo conecta a
  `useWorkout.reset()` + `forceStopNative()` (no se espera).
- El fin del descanso lo vigila un temporizador del propio almacén (no la
  pantalla): suena/vibra en JS sólo si `document.visibilityState === 'visible'`
  y han pasado ≤ 1,5 s desde `endsAt`; si no, termina en silencio.
- `meta.activeRest = {v:1, sessionId, exerciseId, exerciseName, total, endsAt,
  paused, remaining}` y `meta.activeExerciseIndex = {v:1, sessionId, index,
  sessionExerciseId}`; se restauran en `load()` sólo si `sessionId` coincide;
  se borran en `begin`, `discard`, `finish` y cambio de dueño.

## Ciclo de vida

| Momento | Qué pasa |
|---|---|
| Arranque | `load()`; NativeShell reconcilia presencia y aviso |
| Empezar entrenamiento | `display` una vez → `start` |
| Ejercicio actual / serie / progreso / idioma cambia | `start` (actualiza) |
| Descanso empieza / ajusta / reanuda / reinicia | `start` + `scheduleRestAlert` |
| Descanso en pausa / saltado / terminado antes | `start` + `cancelRestAlert` |
| Descanso llega a su hora | `start` (sin descanso); sin cancelar |
| Finalizar / descartar | `stop` (último mensaje al nativo) |
| Cerrar sesión | confirmar si hay entrenamiento o cambios sin subir → guardar lo pendiente → intentar subir (≤ 8 s) → `reset` → `stop` → cerrar sesión → `resetLocalData` |
| Borrar cuenta | reautenticar **primero** → `reset` + `stop` + `stopSync` → borrar en la nube → `deleteUser` → `resetLocalData` |
| «Borrar todo» | `reset` + `stop` antes de borrar |
| Sesión cerrada por Firebase (`onAuth(null)`) | `reset({ flush: true })` + `stop`; los datos locales se quedan |
| Restaurar copia «reemplazar» | bloqueado mientras haya un entrenamiento en curso |

## Android

- `SCHEDULE_EXACT_ALARM` es el tercer permiso. API 24–30: no hace falta. API
  31–33: concedido por defecto (revocable). API 34+: denegado por defecto. Se
  comprueba siempre `AlarmManagerCompat.canScheduleExactAlarms`, nunca la
  versión. Se pide una vez (clave propia en `localStorage`), la primera vez
  que empieza un descanso, sólo en API 31+ sin permiso y con `display`
  concedido, con una hoja explicativa en la app («Ahora no» disponible). El
  descanso se programa aproximado al momento y se mejora a exacto si se
  concede. Sin `USE_EXACT_ALARM`, sin `USE_FULL_SCREEN_INTENT`, sin servicio
  en primer plano, sin `WAKE_LOCK`, sin `VIBRATE`.
- `RestAlarmReceiver` (no exportado, sin intent-filter, request code 2) lee
  sólo las preferencias, comprueba que el aviso sigue vigente (misma sesión y
  mismo `at`), publica en un canal según sonido/vibración (`rest_alert_sv`,
  `_s`, `_v`, `_quiet`, IMPORTANCE_HIGH, nombre en el idioma de la app), anota
  `restAlertDeliveredFor = at` y devuelve la notificación de entrenamiento a
  modo cronómetro. Si la app está visible no publica nada (bandera de
  proceso fijada en `handleOnStart`/`handleOnStop`).
- Identificadores: notificación 4711 = entrenamiento en curso, 4712 = aviso de
  descanso. `PendingIntent`: 0 = abrir el entrenamiento (las dos), 1 =
  notificación deslizada, 2 = alarma del descanso. `MainActivity` está
  exportada, así que el `sessionId` de un intent no es de fiar: lo valida
  `routeForWorkoutTap`.
- La notificación de entrenamiento se pinta siempre desde las preferencias
  (también al re-publicarse al deslizarla o al bloquear): nunca muestra una
  cuenta atrás vencida.

## iOS

- iOS 16.2 mínimo (app y extensión). Sólo iPhone, vertical.
- `ios/App/Shared/WorkoutActivityAttributes.swift` (atributos: `sessionId`;
  `ContentState`: el resto, campos añadidos siempre opcionales) y
  `ios/App/Shared/WorkoutActivityViews.swift` (vistas SwiftUI que reciben
  valores simples, no `ActivityViewContext`) se compilan en los dos targets.
- `start`: busca una actividad con ese `sessionId` en estado `.active`/`.stale`
  y la actualiza; termina las demás; sólo si no queda ninguna y la app no
  está en segundo plano pide una nueva. Si el usuario la quitó, no se vuelve a
  pedir para esa sesión.
- Aviso de descanso por `bridge.notificationRouter.localNotificationHandler`
  (sin sustituir el delegado de Capacitor); en primer plano no se presenta.
- Deep link `trainingos://workout/active?session=<id>`: sólo ese esquema, ese
  host y esa ruta. Llega por `.capacitorOpenURL` (Capacitor lo repite tras el
  arranque en frío) y se emite como `open` retenido.
- `SceneDelegate` pasa al plugin `connectionOptions.notificationResponse`: un
  toque en el aviso de descanso con la app cerrada llega antes de que
  Capacitor instale su delegado de notificaciones. El plugin descarta el
  duplicado.
- El plugin guarda en los `UserDefaults` de la app (máximo 20) los ids de las
  sesiones cuya Live Activity quitó la persona, para no volver a pedirla.
- `AppDelegate` excluye `Library/WebKit` de la copia de iCloud, igual que
  `allowBackup="false"` en Android.
- `start` rechaza un `sessionId` mal formado, un `startedAt` no numérico o un
  `title` vacío; cualquier problema de ActivityKit resuelve `{ shown: false }`.
- Sin botones en la Live Activity (v1): visualización fiable antes que
  interacciones; cualquier acción desde la pantalla de bloqueo cambiaría el
  estado sin pasar por la lógica JS.
