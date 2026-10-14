# APP STORE — PRIVACIDAD

Respuestas a *Privacidad de la app* («etiquetas nutricionales») de App Store
Connect y todo lo que la app de iOS hace con los datos, sacado del código, no
de lo que nos gustaría que dijera. Es la contrapartida de
`docs/GOOGLE-PLAY-DATA-SAFETY.md`.

Si cambias lo que la app guarda, **actualiza a la vez** este fichero,
`ios/App/App/PrivacyInfo.xcprivacy`, `docs/GOOGLE-PLAY-DATA-SAFETY.md` y los
dos formularios. Apple compara lo declarado en App Store Connect con lo que
hace la app y con su manifiesto de privacidad.

---

## 1. Resumen

| Pregunta de App Store Connect | Respuesta |
| --- | --- |
| ¿Recogéis datos de esta app (vosotros o terceros)? | **Sí** |
| ¿Se usan para rastrear a la persona («tracking»)? | **No** |
| Datos **vinculados** a la persona | Los de la sección 2 |
| Datos **no vinculados** | Ninguno |
| Finalidad de todos | **Funcionalidad de la app**. Ni publicidad, ni analítica, ni personalización de terceros |
| ¿App Tracking Transparency / IDFA? | **No** |

URL de política de privacidad: `https://<tu-dominio>/privacy.html` (la misma de
la web y de Google Play; ver `docs/APP-STORE-CHECKLIST.md`, sección 9, para lo
que falta completar).

**Qué cuenta como «recoger» para Apple**: enviar datos fuera del teléfono de
forma que nosotros o un proveedor podamos acceder a ellos más allá de atender
la petición en el momento. Aquí eso es **Firebase** (Authentication, Cloud
Firestore y Cloud Storage), que actúa como proveedor de infraestructura de la
cuenta. Lo que se queda en el teléfono — la copia local, la Live Activity, el
aviso de descanso — no es «recoger» (sección 6).

---

## 2. Datos recogidos, uno por uno

Para cada tipo, App Store Connect pregunta: **¿se recoge?**, **¿para qué?**,
**¿está vinculado a la persona?**, **¿se usa para rastrear?** En todos:
vinculado **sí** (todo cuelga de la cuenta), rastreo **no**, finalidad
**Funcionalidad de la app**.

### Información de contacto → Correo electrónico

| | |
| --- | --- |
| Recogido | Sí |
| Obligatorio | Sí |
| Dónde | `src/lib/firebase/account.ts` → `signUp`, `signIn`; Firebase Authentication y `users/{uid}` |

Es el identificador de acceso. Sin él no hay cuenta ni sincronización. No se
envía verificación por correo.

### Información de contacto → Nombre

| | |
| --- | --- |
| Recogido | Sí |
| Obligatorio | Sí, al crear la cuenta |
| Dónde | `src/routes/auth/SignUp.tsx` (campo «Nombre», `displayName`); Firebase Authentication y `users/{uid}`; editable en el perfil |

El nombre que la persona escribe al registrarse y que la app enseña en su
perfil.

### Identificadores → ID de usuario

| | |
| --- | --- |
| Recogido | Sí |
| Obligatorio | Sí |
| Dónde | `src/lib/firebase/account.ts` → `reserveUsername`; documento `usernames/{normalizado}`; el `uid` de Firebase |

El nombre de usuario que elige la persona («@usuario»), más el `uid` que
asigna Firebase.

### Salud y forma física → Forma física

| | |
| --- | --- |
| Recogido | Sí |
| Obligatorio | No (se puede tener cuenta sin registrar nada) |
| Dónde | Colecciones `routines`, `sessions`, `exerciseLogs`, `personalRecords`, `milestones`, `exercisePrefs`; `TrainingProfile` (`src/lib/training/profile.ts`) |

Rutinas, sesiones, series, repeticiones, pesos, duraciones, distancias,
pulsaciones introducidas a mano, récords personales y marcas; y las respuestas
del cuestionario inicial sobre el entrenamiento (objetivo, nivel, años
entrenando, días, duración, entorno, material, intereses, preferencias de
ejercicios). Es el contenido central de la app.

### Contenido del usuario → Fotos o vídeos

| | |
| --- | --- |
| Recogido | Sí |
| Obligatorio | No |
| Dónde | Colección `photos` + Cloud Storage en `users/{uid}/photos/{id}.jpg` y `users/{uid}/avatar.jpg` |

Fotos de progreso y foto de perfil, sólo las que la persona elige subir. Se
eligen con el selector del sistema, que entrega únicamente la foto elegida; la
cámara sólo se abre si la persona elige hacer una foto (sección 4). Sólo fotos,
nunca vídeo.

### Contenido del usuario → Otro contenido del usuario

| | |
| --- | --- |
| Recogido | Sí |
| Obligatorio | No |
| Dónde | Las mismas colecciones de entrenamiento y `exercises` (ejercicios propios) |

Lo que la persona escribe con sus palabras: notas de sesiones y de ejercicios,
nombres de rutinas y de ejercicios propios.

---

## 3. Decidido: salud, edad y ajustes

`PrivacyInfo.xcprivacy` declara ocho tipos: los seis de la sección 2 más
estos dos, con el mismo criterio conservador que la ficha de Google Play
(`docs/GOOGLE-PLAY-DATA-SAFETY.md`). En App Store Connect hay que marcar
**exactamente** los mismos:

- **Salud y forma física → Salud** (`NSPrivacyCollectedDataTypeHealth`): peso
  corporal, altura y medidas corporales (colecciones `bodyweight` y
  `measurements`, `TrainingProfile.heightCm` y `bodyweightKg`), sólo si la
  persona los escribe. Declararlo no implica usar HealthKit: la app no se
  integra con Salud.
- **Otros datos → Otros tipos de datos**
  (`NSPrivacyCollectedDataTypeOtherDataTypes`): la franja de edad del
  cuestionario (`u20` … `60+`, nunca una fecha) y los ajustes de la app (tema,
  idioma, unidades, preferencias) que se copian al perfil de la cuenta para
  configurar un dispositivo nuevo.

El **Nombre** del registro se recoge y está declarado en las dos tiendas
(corregido en `docs/GOOGLE-PLAY-DATA-SAFETY.md`, que antes decía que no).

Si alguna vez cambia lo que se recoge, se cambia **a la vez** en
`PrivacyInfo.xcprivacy`, en App Store Connect, en la ficha de Google Play y en
`public/privacy.html`.

---

## 4. Datos que NO se recogen

| Tipo de Apple | Por qué no |
| --- | --- |
| Ubicación (precisa o aproximada) | No hay permiso de ubicación ni ninguna llamada a geolocalización. |
| Contactos | No hay permiso ni código. |
| Teléfono, dirección postal, otra información de contacto | No se piden en ningún formulario. |
| Información financiera, compras | No hay compras, ni suscripciones, ni StoreKit. |
| Información sensible | No se pregunta raza, religión, orientación, opiniones políticas… |
| Historial de navegación y de búsqueda | No existe. |
| Datos de uso (interacción con el producto, datos publicitarios) | No hay analítica ni anuncios. Firebase Analytics **no** está en el código. |
| Diagnóstico (fallos, rendimiento) | No hay Crashlytics ni ningún informe automático. |
| Identificadores de dispositivo / publicidad (IDFA) | No se leen. No hay App Tracking Transparency. |
| Correos, mensajes, audio, contenido de juego, atención al cliente | No se accede a nada de esto. |
| Datos de Salud del sistema (HealthKit) | La app no se integra con Salud. |

Se puede comprobar: el código sólo importa `firebase/app`, `firebase/auth`,
`firebase/firestore` y `firebase/storage`; `package.json` no tiene ningún SDK
de anuncios ni de analítica, y el proyecto de Xcode no enlaza nada más que
Capacitor y sus plugins oficiales (`ios/App/CapApp-SPM/Package.swift`).

---

## 5. Permisos y textos del `Info.plist`

Un solo permiso con texto propio: la **cámara**.

| Clave | Base (`Info.plist`) y `en.lproj/InfoPlist.strings` | `es.lproj/InfoPlist.strings` |
| --- | --- | --- |
| `NSCameraUsageDescription` | Training OS uses the camera only when you choose to take a progress or profile photo. | Training OS usa la cámara solo cuando eliges hacer una foto de progreso o de perfil. |
| `CFBundleDisplayName` | Training OS | Training OS |

iOS elige el fichero según el idioma del teléfono (`CFBundleLocalizations`:
`es` y `en`; región de desarrollo `en`). El resto de la interfaz lo traduce la
propia app.

Sin texto propio, y por qué:

* **Notificaciones**: el diálogo es del sistema y no lleva texto de la app. Se
  pide la primera vez que se empieza un entrenamiento, sólo para el aviso
  «Descanso terminado».
* **Live Activities**: `NSSupportsLiveActivities = YES`. No piden permiso; la
  persona puede desactivarlas en *Ajustes → Training OS*.
* **Fototeca**: no se pide (`NSPhotoLibraryUsageDescription` no existe). El
  selector del sistema corre fuera de la app y sólo le entrega la foto
  elegida. La app tampoco guarda nada en Fotos.
* **No existen**: `NSUserTrackingUsageDescription`, `NSLocation*`,
  `NSMicrophoneUsageDescription`, `NSContactsUsageDescription`, `NSHealth*`.

---

## 6. Dónde se guarda cada cosa

| Dónde | Qué | Sale del teléfono |
| --- | --- | --- |
| Firebase Authentication | Correo, nombre, `uid`. La contraseña la gestiona Firebase; la app nunca la guarda | Sí (sección 2) |
| Cloud Firestore | Perfil, nombre de usuario, entrenamiento, cuerpo, notas, ajustes | Sí |
| Cloud Storage | Fotos de progreso y de perfil | Sí |
| WKWebView, en `Library/WebKit` | La copia local: IndexedDB, `localStorage`, la sesión de Firebase | No. Excluida de la copia de iCloud (sección 8) |
| Caché de la app (`Library/Caches`) | El fichero de la última copia de seguridad exportada, de paso hacia la hoja de compartir | No, salvo que la persona lo comparta. iOS la limpia cuando necesita espacio |
| `UserDefaults` de la app | Hasta 20 ids de sesión cuya Live Activity quitó la persona | No |
| El sistema (ActivityKit, centro de notificaciones) | El estado de la Live Activity y el aviso de descanso pendiente | No (sección 9) |

Al cerrar sesión y al eliminar la cuenta se vacía la copia local de los datos
(IndexedDB) y se retiran la Live Activity y el aviso pendiente; se conservan
sólo preferencias del dispositivo como el tema y el idioma. El fichero
exportado de la caché no se borra en ese momento: lo retira iOS.

---

## 7. `PrivacyInfo.xcprivacy`

El manifiesto de privacidad de la app (`ios/App/App/PrivacyInfo.xcprivacy`),
que va en los recursos del target App (lo comprueba `npm run ios:verify`).

| Clave | Valor |
| --- | --- |
| `NSPrivacyTracking` | `false` |
| `NSPrivacyTrackingDomains` | vacío |
| `NSPrivacyCollectedDataTypes` | Correo, Nombre, ID de usuario, Forma física, Fotos o vídeos, Otro contenido del usuario. Todos vinculados, sin rastreo, finalidad funcionalidad de la app |
| `NSPrivacyAccessedAPITypes` | Las dos API «con motivo obligatorio» de abajo |

**API con motivo obligatorio**, y por qué cada una:

| Categoría | Motivo | Por qué |
| --- | --- | --- |
| `NSPrivacyAccessedAPICategoryFileTimestamp` | **C617.1** — fechas, tamaño u otros metadatos de ficheros dentro del contenedor de la app | `@capacitor/filesystem` lee atributos de ficheros y no trae manifiesto propio. Training OS sólo lo usa para dejar la copia de seguridad en la caché antes de abrir la hoja de compartir |
| `NSPrivacyAccessedAPICategoryUserDefaults` | **CA92.1** — leer y escribir datos accesibles sólo para la propia app | El plugin `WorkoutNotification` guarda los ids de las sesiones cuya Live Activity quitó la persona, para no volver a pedirla en esa sesión (también tras reiniciar). Nadie más lo lee |

Marcar `Library/WebKit` como excluida de la copia de iCloud
(`isExcludedFromBackup`) no es una API con motivo obligatorio.

**Si se añade código o un plugin** que use otra API de la lista de Apple
(arranque del sistema, espacio en disco, teclados activos…), hay que
declararla aquí con su motivo, o App Store Connect avisa al subir. Antes de
enviar, *Generate Privacy Report* en el *Organizer* de Xcode junta este
manifiesto con los de las dependencias (`docs/IOS-SIGNING.md`, sección 7).

---

## 8. Copia de seguridad de iCloud

`AppDelegate` marca `Library/WebKit` — donde el WKWebView guarda IndexedDB,
`localStorage` y la sesión de Firebase — como **excluida de la copia de
iCloud**, en cada arranque y fuera del hilo principal. Es el equivalente de
`allowBackup="false"` en Android: la copia del sistema no debe llevar los datos
de una cuenta a otro dispositivo, ni una sesión iniciada.

Consecuencias, dichas claramente:

* Restaurar un iPhone desde iCloud **no** trae los datos de Training OS. Con
  cuenta, vuelven de la nube al iniciar sesión; lo que no se hubiera subido
  aún, no.
* Lo que sí entra en la copia del sistema son los `UserDefaults` de la app:
  como mucho 20 identificadores aleatorios de sesión, sin ningún dato del
  entrenamiento.

---

## 9. Live Activity y aviso de descanso: qué enseñan

Los dos se crean **en el propio teléfono**, con lo que ya está en él, y no
salen de él: no hay notificaciones push, ni token de APNs, ni servidor que
mande nada. Por eso no añaden nada a la sección 2.

**La Live Activity** (pantalla de bloqueo y Dynamic Island) lleva sólo:

* el título («Entrenamiento en curso»), el nombre de la sesión, el ejercicio
  actual, «Serie 3 de 4» y «7 de 20 series»;
* la hora de inicio y, si hay descanso, su inicio y su final (los cronómetros
  los pinta iOS);
* las etiquetas del descanso, el idioma de la app y el id de la sesión (un
  identificador aleatorio).

**No** lleva pesos, repeticiones, peso corporal, medidas, fotos, correo, nombre
ni nombre de usuario. Apple limita su estado a 4 KB y el plugin recorta cada
texto.

**El aviso «Descanso terminado»** lleva un título («Descanso terminado») y una
línea («Siguiente serie: Press de banca», o «Toca para volver al
entrenamiento»), más el id de la sesión y la hora, para abrir la sesión al
tocarlo.

Los dos se ven **con el teléfono bloqueado**. Quien prefiera que no se vean:
*Ajustes → Notificaciones → Mostrar previsualizaciones → Si está desbloqueado*
oculta el texto del aviso, y *Ajustes → Training OS → Actividades en directo*
apaga la Live Activity. La app funciona igual sin los dos.

---

## 10. Sin rastreo y sin IDFA

* `NSPrivacyTracking = false` y ningún dominio de rastreo.
* La app no enlaza `AdSupport` ni `AppTrackingTransparency`, no pide el
  permiso de rastreo y no lee el identificador de publicidad.
* No hay SDK de anuncios, de analítica ni de atribución. Los datos no se
  combinan con los de otras empresas ni se comparten con intermediarios de
  datos.

---

## 11. Antes de enviar el formulario

- [ ] Resuelta la sección 3, y el manifiesto y App Store Connect dicen lo
      mismo.
- [ ] La URL de la política de privacidad responde 200 en abierto y
      `public/privacy.html` ya no contiene la palabra `COMPLETAR`.
- [ ] El correo de contacto de la política es el mismo que el de la ficha.
- [ ] No se ha añadido ningún SDK, plugin ni permiso desde la última vez que se
      revisó esto (`ios/App/CapApp-SPM/Package.swift`, `Info.plist`).
- [ ] `npm run ios:verify` en verde (manifiesto con sus motivos, sin rastreo).
