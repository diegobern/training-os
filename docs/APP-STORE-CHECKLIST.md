# APP STORE — LISTA DE PUBLICACIÓN

La contrapartida de `docs/GOOGLE-PLAY-CHECKLIST.md` para el iPhone. De arriba
abajo. Lo que está marcado con ✅ ya está hecho en el código; lo que está
marcado con ⬜ tienes que hacerlo tú, casi todo en App Store Connect.

✅ significa «está en el código», no «se ha probado en un iPhone». Qué está
verificado y dónde está en [`docs/IOS-FEATURE-PARITY.md`](IOS-FEATURE-PARITY.md).

---

## 1. Requisitos técnicos

- ✅ **Identificador de la app**: `com.trainingos.app`; la extensión de la Live
  Activity, `com.trainingos.app.LiveActivity`. Irreversible en cuanto se sube
  la primera compilación (`docs/IOS-SIGNING.md`).
- ⬜ **Compilado con Xcode 26 o posterior y el SDK de iOS 26.** Obligatorio para
  subir a App Store Connect desde el **28 de abril de 2026**. Apple ha anunciado
  el SDK de iOS 27 (Xcode 27) a partir de **abril de 2027**. **Comprobar en
  <https://developer.apple.com/news/upcoming-requirements/> antes de cada
  envío.**
- ✅ **iOS 16.2 mínimo**, app y extensión. **Sólo iPhone**, sólo vertical.
- ✅ **Firma automática** en los tres targets. Ver `docs/IOS-SIGNING.md`.
- ⬜ **`CURRENT_PROJECT_VERSION` incrementado** respecto a la última subida, y
  `MARKETING_VERSION` igual a `version` de `package.json` (sección 6 de
  `docs/IOS-SIGNING.md`).
- ✅ **Icono** de 1024×1024 sin canal alfa (`npm run ios:assets`; lo comprueba
  `npm run ios:verify`). App Store Connect rechaza un icono con transparencia.
- ✅ **Sin tráfico en claro.** No hay `NSAllowsArbitraryLoads`: todo va a
  Firebase por HTTPS.
- ✅ **Cumplimiento de exportación**: `ITSAppUsesNonExemptEncryption = NO` en
  el `Info.plist`. La app no implementa cifrado propio; sólo usa el HTTPS del
  sistema (el del WKWebView), que está exento. Con esa clave, App Store Connect
  no pregunta nada al subir.
- ✅ **Manifiesto de privacidad** `PrivacyInfo.xcprivacy`, con los motivos de las
  API que lo exigen. Ver `docs/APP-STORE-PRIVACY.md`.
- ✅ **Sin copia de iCloud de los datos de la app** (`Library/WebKit`
  excluida), igual que `allowBackup="false"` en Android.
- ✅ **Sin modos de segundo plano** (`UIBackgroundModes` no existe): no hay
  nada que justificar en la revisión. Los cronómetros los pinta el sistema.
- ✅ **Sin SDK de anuncios, analítica ni rastreo.** No hay App Tracking
  Transparency porque no hay nada que rastrear.

---

## 2. Política de la tienda

- ⬜ **Política de privacidad publicada y accesible** — App Store Connect la
  exige para cualquier app. Es la misma de la web y de Android:
  `public/privacy.html` → `https://<tu-dominio>/privacy.html`. **Antes hay que
  sustituir las 10 apariciones de `COMPLETAR`** (responsable, país, correo y
  fecha) y el correo `soporte@ejemplo.com`.
- ⬜ **URL de soporte** — también obligatoria. **Hoy no existe ninguna página de
  soporte en `public/`**: hay que crearla, o usar una página propia que tenga
  el correo de contacto.
- ✅ **Eliminación de cuenta dentro de la app** (directriz **5.1.1(v)**: si se
  puede crear una cuenta en la app, se tiene que poder borrar en la app).
  *Ajustes → Cuenta → Eliminar cuenta*. **Lo primero que hace es pedir la
  contraseña y reautenticar**: con la contraseña mal no se toca nada. Después
  retira el entrenamiento y su Live Activity, para la sincronización y borra
  Auth, Firestore (todas las colecciones, el nombre de usuario y el perfil),
  los ficheros de Storage y la copia local. Además existe la página pública
  `/account-deletion.html`.
- ✅ **Sign in with Apple no es obligatorio** (directriz **4.8**). La 4.8 lo
  exige a las apps que usan un inicio de sesión de terceros o social (Google,
  Facebook…); Training OS sólo tiene su propia cuenta con correo y contraseña.
  Si algún día se añade un login de terceros, esto cambia.
- ⬜ **Cuenta obligatoria: tenla preparada para la revisión.** La versión que se
  envía lleva Firebase y **no se puede usar sin cuenta** (el modo local sin
  cuenta sólo existe en compilaciones sin configuración de Firebase, como la de
  la CI). La 5.1.1(v) también pide no exigir registro a apps sin funciones
  ligadas a la cuenta; la de Training OS es la sincronización de todo el
  historial entre dispositivos y su copia en la nube. Explícalo en las notas
  de la revisión (sección 4). Si Apple lo objeta, la salida es ofrecer el modo
  local sin cuenta también en la versión con Firebase, que hoy no existe.
- ⬜ **Privacidad de la app** («etiquetas nutricionales») — las respuestas están
  en `docs/APP-STORE-PRIVACY.md`. Cópialas tal cual y **resuelve antes el
  punto pendiente de su sección 3**.
- ⬜ **Clasificación por edad.** Apple renovó el cuestionario en 2025 (franjas
  4+, 9+, 13+, 16+ y 18+). Training OS no tiene violencia, contenido sexual,
  apuestas, chat ni contenido de otros usuarios, así que debería salir en la
  franja más baja. Dos preguntas que conviene contestar con cuidado: las de
  salud o bienestar (la app propone entrenamientos y cargas; no da consejo
  médico ni diagnósticos) y la de acceso a la web (los enlaces externos abren
  páginas fijas de atribución en Safari dentro de la app; no hay navegador).
- ⬜ **Público**: adultos. La política de privacidad declara que la app no está
  dirigida a menores de 16 años. **No** la metas en la categoría Niños.
- ⬜ **Derechos sobre el contenido**: App Store Connect pregunta si la app
  contiene contenido de terceros. **Sí**: ilustraciones y datos del catálogo
  con licencia CC BY-SA 4.0 y otras, atribuidos dentro de la app
  (*Ajustes → Atribuciones*). Registro completo en `THIRD_PARTY_ASSETS.md`.
- ⬜ **Precio**: gratis. **Compras dentro de la app**: ninguna.
- ✅ **Permisos**, con su texto y su momento:

  | Permiso | Texto en `Info.plist` | Cuándo |
  | --- | --- | --- |
  | Cámara (`NSCameraUsageDescription`) | ES: «Training OS usa la cámara solo cuando eliges hacer una foto de progreso o de perfil.» · EN: «Training OS uses the camera only when you choose to take a progress or profile photo.» | Sólo si la persona elige *Hacer foto* en el selector de fotos |
  | Notificaciones | Ninguno: el diálogo es del sistema, sin texto propio | La primera vez que se empieza un entrenamiento; nunca al abrir la app. Sólo para el aviso «Descanso terminado» |
  | Live Activities | Ninguno: no piden permiso (`NSSupportsLiveActivities = YES`) | — La persona puede desactivarlas en Ajustes |

  No se pide fototeca (el selector del sistema entrega sólo lo elegido), ni
  ubicación, ni contactos, ni micrófono, ni salud, ni rastreo.

---

## 3. Ficha de la tienda

- ⬜ **Nombre**: hasta 30 caracteres. **Subtítulo**: hasta 30.
- ⬜ **Texto promocional** (170, se cambia sin nueva versión), **descripción**
  (4000) y **palabras clave** (100, separadas por comas).
- ⬜ **Categoría**: Salud y forma física (secundaria opcional: Deportes).
- ⬜ **Idiomas**: la app está en **español e inglés**; crea la ficha en los dos.
- ⬜ **Capturas de iPhone**: obligatorias las de **6,9"** (en vertical, por
  ejemplo 1320 × 2868 o 1290 × 2796); las de **6,5"** (1284 × 2778 o
  1242 × 2688) sólo si no subes las de 6,9". De 1 a 10 por idioma. **Sin iPad**:
  la app es sólo iPhone. Los tamaños aceptados cambian: compruébalos en la
  ayuda de App Store Connect (*Screenshot specifications*) antes de hacerlas.
  Un simulador iPhone Pro Max da el tamaño de 6,9"; para la barra de estado
  limpia, `xcrun simctl status_bar booted override --time 9:41
  --batteryState charged --batteryLevel 100`, como en la CI.
- ✅ **Icono**: App Store Connect lo toma de la compilación.
- ⬜ **Copyright** y **URL de marketing** (opcional).

---

## 4. Notas para la revisión

En *App Review Information*:

- ⬜ **Cuenta de demostración** (correo y contraseña) en *Sign-in required*,
  con un par de entrenamientos registrados. **No pongas la tuya.** Apunta que
  el revisor puede crear una cuenta nueva desde la propia app sin verificar el
  correo — útil si quiere probar *Eliminar cuenta* sin borrar la de
  demostración.
- ⬜ **Contacto** del responsable de la app durante la revisión.
- ⬜ **Notas**, en inglés. Una base:

```
Training OS is a workout log. An account is required because every routine,
session and record is synced across the user's devices and kept in the cloud.
Demo account: <email> / <password>. You can also create a new account in the
app (no email verification), e.g. to test More > Settings > Account > Delete
account.

Live Activity: start a workout (Home > START WORKOUT). Lock the device, or go to the
Home Screen on an iPhone with Dynamic Island: the current exercise, set and
elapsed time appear. Complete a set to start the rest timer; the countdown is
shown there.

Rest-over notification: with a rest timer running, send the app to the
background. A local notification "Rest over" arrives when it ends. The
notification permission is requested the first time a workout is started,
never at launch. The Live Activity does not require it.

Camera: used only when the user chooses "Take Photo" for a progress or
profile photo. No tracking, no ads, no analytics, no third-party sign-in.
```

---

## 5. Antes de subir la compilación

Ejecuta todo esto y que dé verde:

```bash
npm run doctor          # que no sobren ficheros de una versión anterior
npm test                # los cuatro paquetes: unit, unit-native, unit-lifecycle, catálogo
npm run ios:verify      # proyecto, extensión, privacidad, icono, contrato
npm run test:ios        # contra un build local-only (docs/IOS-SETUP.md, sección 8)
npm run ios:sync        # CON el .env real: la tienda lleva Firebase
```

Después, archivar y subir desde Xcode: `docs/IOS-SIGNING.md`, sección 7.

---

## 6. Verificación a mano en un iPhone real

Con la compilación de **TestFlight**, no con una instalada por cable. Lo que
pinta el sistema — pantalla de bloqueo, Dynamic Island, avisos con el móvil
bloqueado, teclado — sólo se puede dar por bueno en un iPhone. Si puedes,
pasa la lista en un iPhone con Dynamic Island y repite lo marcado con (★) en
uno sin ella.

**Arranque, idioma y red**

- ⬜ Instalación nueva con el iPhone en español → la app arranca en español;
  con el iPhone en inglés (u otro idioma) → en inglés.
- ⬜ Al abrir la app no se pide ningún permiso.
- ⬜ Del logo a la app sin parpadeo en blanco, en modo claro y en oscuro.
- ⬜ Modo avión: la app abre, el catálogo se ve y se puede registrar una serie;
  al volver la red, sube.
- ⬜ (★) Cambiar el idioma en los ajustes de la app con un entrenamiento en
  marcha: la Live Activity y el siguiente aviso de descanso salen en el idioma
  nuevo.

**Cuenta**

- ⬜ Crear una cuenta no pide verificar el correo y lleva a nombre de usuario →
  cuestionario → aplicación.
- ⬜ Cerrar sesión y volver a entrar recupera el entrenamiento.
- ⬜ Con un entrenamiento en marcha en la cuenta A, cerrar sesión y entrar con
  la B: la Live Activity de A desaparece, no llega ningún aviso de A y nada de
  A aparece en B.
- ⬜ *Eliminar cuenta* pide la contraseña **antes** de borrar nada; con la
  contraseña mal no borra nada. Con la buena, la app queda en la pantalla de
  bienvenida, sin Live Activity, y al entrar con otra cuenta no aparece nada de
  la anterior.

**Live Activity en la pantalla de bloqueo**

- ⬜ (★) Empezar el primer entrenamiento pide el permiso de notificaciones, una
  sola vez. **Denegándolo**, la Live Activity aparece igual.
- ⬜ (★) Bloquear el móvil: ejercicio, serie, progreso y duración subiendo sola.
  Legible con el sistema en modo claro y en oscuro.
- ⬜ (★) Cambiar de ejercicio o marcar una serie la actualiza.
- ⬜ (★) Durante un descanso, cuenta atrás; al acabar, «Descanso terminado»,
  también con la app suspendida. Con el descanso en pausa, el tiempo fijo y
  «En pausa».
- ⬜ (★) Tocarla abre la app en la sesión, también con la app cerrada desde el
  selector de apps.
- ⬜ (★) Quitarla deslizando: no vuelve en ese entrenamiento; sí en el
  siguiente.
- ⬜ (★) Finalizar o descartar el entrenamiento: desaparece al momento de la
  pantalla de bloqueo.
- ⬜ (★) Con *Ajustes → Training OS → Actividades en directo* desactivado, la app
  funciona igual, sin ella.
- ⬜ Instalar una versión nueva encima con un entrenamiento en marcha: la Live
  Activity sigue legible y el entrenamiento sigue donde estaba.

**Dynamic Island** (iPhone con Dynamic Island)

- ⬜ Al salir de la app con un entrenamiento: vista compacta con el rayo y el
  tiempo; mantener pulsado → vista expandida con ejercicio, serie y progreso.
- ⬜ Con otra actividad a la vez (un temporizador del Reloj): vista mínima.
- ⬜ La cuenta atrás del descanso se ve también en la isla.
- ⬜ Tocar la isla abre la app en la sesión.

**Aviso «Descanso terminado»**

- ⬜ (★) App en segundo plano: llega a su hora como banner, con sonido.
- ⬜ (★) Móvil bloqueado: llega a la pantalla de bloqueo.
- ⬜ (★) App cerrada (quitada del selector de apps): llega igual, y tocarlo abre
  la app en la sesión.
- ⬜ (★) Con la app delante cuando acaba el descanso **no** sale el aviso del
  sistema: avisa la app.
- ⬜ Pausar, saltar o terminar antes el descanso, y bloquear: no llega ningún
  aviso a la hora en que habría acabado.
- ⬜ Finalizar o descartar el entrenamiento durante un descanso: no llega nada
  después.
- ⬜ Con el sonido del descanso desactivado en los ajustes de la app, llega sin
  sonido.
- ⬜ Con el permiso denegado no llega, la app funciona igual y no vuelve a
  preguntar; al activarlo en *Ajustes → Training OS → Notificaciones*, el
  siguiente descanso avisa.

**Enlace de vuelta**

- ⬜ Desde Safari, `trainingos://workout/active` (sin id) con un entrenamiento
  en marcha → la app se abre en la sesión.
- ⬜ `trainingos://workout/active?session=no-existe` → la app se abre en el
  inicio, sin crear ni duplicar nada.

**Navegación y teclado**

- ⬜ Deslizar desde el borde izquierdo vuelve a la pantalla anterior; con una
  hoja o un diálogo abiertos, los cierra y se queda donde estaba.
- ⬜ Teclado en **kg, reps, RIR, RPE y notas** de la sesión: la barra de
  accesorios tiene «OK» y lo cierra; el campo no queda tapado; la barra
  inferior no se monta encima del teclado.
- ⬜ Teclado en **login, registro y cuestionario**: los campos siguen visibles,
  se pasa de uno a otro y el ojo de la contraseña no cierra el teclado.
- ⬜ Cambiar de pantalla con el teclado abierto lo cierra.

**Pantalla y zonas seguras**

- ⬜ En un iPhone pequeño (SE, sin notch), uno con notch, uno con Dynamic
  Island y un Pro Max: nada queda bajo el notch o la isla, la barra inferior
  queda por encima del indicador de inicio, la barra del cronómetro del
  entrenamiento se ve entera y las hojas no quedan cortadas.
- ⬜ En modo claro se ven la hora y la batería (iconos oscuros); en modo oscuro
  también (iconos claros).

**Fotos**

- ⬜ Elegir una foto de progreso: el selector ofrece la fototeca y la cámara; la
  fototeca **no** pide permiso; la cámara pide permiso con su texto.
- ⬜ La vista previa se ve, la foto se sube (con cuenta y Storage activado) y se
  ve en otro dispositivo de la misma cuenta, también en la app de iOS (esto
  depende del CORS del bucket: `FIREBASE.md`, «Apps nativas»).
- ⬜ Borrar la foto la quita de la app y de la nube.
- ⬜ Lo mismo con la foto de perfil.

**Exportar, importar y enlaces**

- ⬜ *Ajustes → Datos → Exportar copia de seguridad* abre la hoja de compartir;
  el fichero se puede guardar en Archivos y abrir. Cerrar la hoja sin elegir
  nada no cuenta como copia hecha.
- ⬜ *Exportar CSV*, igual. *Importar* abre el selector de Archivos.
- ⬜ Los enlaces de *Atribuciones* abren Safari dentro de la app, con su botón
  de cerrar, y al cerrarlo la app sigue donde estaba.

**Háptica**

- ⬜ Marcar una serie vibra. Con la vibración del sistema desactivada
  (*Ajustes → Sonidos y vibraciones*), o con la del ajuste de la app
  desactivada, no.

---

## 7. Después de publicar

- ⬜ Publica primero en **TestFlight** (pruebas internas), instálala en tu propio
  iPhone y repite la sección 6.
- ⬜ La clave `.p8`, si la creaste, está fuera del ordenador y en un gestor de
  contraseñas.
- ⬜ Actualiza [`docs/IOS-FEATURE-PARITY.md`](IOS-FEATURE-PARITY.md) con lo que
  has verificado (regla permanente de `docs/ARQUITECTURA.md`).
- ⬜ Apunta la fecha del siguiente requisito de Xcode/SDK de Apple.

---

## 8. Lo que esta app NO hace, y por qué importa en la revisión

| | |
| --- | --- |
| Anuncios | No. No hay ningún SDK publicitario. |
| Compras / suscripciones | No. No hay StoreKit. |
| Rastreo / IDFA | No. No hay App Tracking Transparency porque no se rastrea nada. |
| Analítica / telemetría | No. Ni Firebase Analytics ni Crashlytics. |
| HealthKit (Salud) | No. La app no lee ni escribe datos de Salud. |
| Ubicación | No. No hay permiso ni código. |
| Notificaciones push | No. Los avisos son locales; no hay servidor ni APNs. |
| Ejecución en segundo plano | No. Los cronómetros los pinta el sistema; no hay `UIBackgroundModes`. |
| Contenido de otros usuarios | No. Cada cuenta sólo ve lo suyo; las reglas de seguridad lo impiden a nivel de servidor. |
| Inicio de sesión de terceros | No. Sólo correo y contraseña (por eso no hace falta Sign in with Apple). |
| Botones en la Live Activity | No (v1). Sólo muestra; tocarla abre la app. |
| iPad / horizontal | No. Sólo iPhone, en vertical. |

---

## 9. Lo que falta por completar

- ⬜ `public/privacy.html`: las 10 apariciones de `COMPLETAR` y
  `soporte@ejemplo.com`.
- ⬜ `public/account-deletion.html`: `soporte@ejemplo.com`.
- ⬜ Una **URL de soporte** (no existe ninguna página de soporte todavía).
- ⬜ La **cuenta de demostración** para la revisión.
- ⬜ El punto pendiente de las etiquetas de privacidad
  (`docs/APP-STORE-PRIVACY.md`, sección 3).
- ⬜ Textos, capturas y categoría de la ficha (sección 3).
