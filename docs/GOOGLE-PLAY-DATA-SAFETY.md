# GOOGLE PLAY — SEGURIDAD DE LOS DATOS

Respuestas al formulario de *Seguridad de los datos* de Play Console, sacadas
del código, no de lo que nos gustaría que dijera. Cada fila indica dónde se
recoge el dato y por qué.

Si cambias lo que la app guarda, **actualiza este fichero y el formulario a la
vez**. Google compara lo declarado con lo que la app hace; una discrepancia es
motivo de retirada de la ficha.

---

## 1. Resumen

| Pregunta del formulario | Respuesta |
| --- | --- |
| ¿La app recoge o comparte alguno de los tipos de datos requeridos? | **Sí, recoge** |
| ¿Comparte datos con terceros? | **No** |
| ¿Se cifran todos los datos en tránsito? | **Sí** |
| ¿Se puede solicitar la eliminación de los datos? | **Sí** |
| ¿Todos los datos recogidos son opcionales? | **No** (el correo es obligatorio) |
| ¿Cumple la política de Familias? | **No aplica** (la app no está dirigida a menores) |
| ¿Hay una revisión de seguridad independiente? | **No** |

URL de eliminación de cuenta: `https://<tu-dominio>/account-deletion.html`
URL de política de privacidad: `https://<tu-dominio>/privacy.html`

Ambas páginas están en `public/`, así que se publican con el despliegue web
normal y son accesibles sin instalar la app y sin iniciar sesión, que es lo que
Google exige.

---

## 2. Datos recogidos, uno por uno

Para cada tipo, el formulario pregunta lo mismo: **¿se recoge?**,
**¿se comparte?**, **¿es obligatorio?**, **¿para qué se usa?**

### Información personal → Dirección de correo electrónico

| | |
| --- | --- |
| Recogido | Sí |
| Compartido | No |
| Obligatorio | Sí |
| Finalidad | Gestión de la cuenta · Funciones de la app |
| Dónde | `src/lib/firebase/account.ts` → `signUp`, `signIn` |

Es el identificador de acceso. Sin él no hay cuenta ni sincronización.
**No se envía verificación por correo**: la cuenta queda activa al crearse.

### Información personal → Nombre

| | |
| --- | --- |
| Recogido | Sí |
| Compartido | No |
| Obligatorio | Sí |
| Finalidad | Gestión de la cuenta · Funciones de la app |
| Dónde | `src/routes/auth/SignUp.tsx` (campo «Nombre»); `src/lib/firebase/account.ts` → `signUp` (perfil de Firebase Auth y documento `users/{uid}`) |

El nombre visible que la persona escribe al crear la cuenta (como mínimo dos
caracteres; puede ser un apodo). Se enseña en su propio perfil y en ningún
sitio más: no es público ni lo ve nadie más.

### Información personal → IDs de usuario

| | |
| --- | --- |
| Recogido | Sí |
| Compartido | No |
| Obligatorio | Sí |
| Finalidad | Gestión de la cuenta · Funciones de la app |
| Dónde | `src/lib/firebase/account.ts` → `reserveUsername`; documento `usernames/{normalizado}` |

El nombre de usuario que elige la persona, más el `uid` que asigna Firebase.

### Información personal → Otra información

| | |
| --- | --- |
| Recogido | Sí |
| Compartido | No |
| Obligatorio | No |
| Finalidad | Funciones de la app · Personalización |
| Dónde | `src/lib/training/profile.ts` → `TrainingProfile` |

Las respuestas del cuestionario inicial: **franja de edad** (`u20`, `20-29`,
`30-39`, `40-49`, `50-59`, `60+` — nunca una fecha de nacimiento), objetivo,
nivel de experiencia, años entrenando, días disponibles, duración de sesión,
entorno y material, intereses y preferencias de ejercicios.

Se usan para proponer una rutina y ajustar volúmenes por defecto. Todos los
campos son opcionales salvo objetivo, nivel, días, duración, entorno, material
y unidades, que son los que hacen falta para generar una propuesta.

### Salud y forma física → Información de actividad física

| | |
| --- | --- |
| Recogido | Sí |
| Compartido | No |
| Obligatorio | No |
| Finalidad | Funciones de la app |
| Dónde | Colecciones `routines`, `sessions`, `exerciseLogs`, `personalRecords`, `milestones`, `exercisePrefs` |

Rutinas, sesiones de entrenamiento, series, repeticiones, pesos, duraciones,
distancias, pulsaciones introducidas a mano, récords personales y marcas.

Es el contenido central de la aplicación. Es "no obligatorio" en el sentido del
formulario: se puede tener una cuenta sin registrar nada.

### Salud y forma física → Información de salud

| | |
| --- | --- |
| Recogido | Sí |
| Compartido | No |
| Obligatorio | No |
| Finalidad | Funciones de la app |
| Dónde | Colecciones `bodyweight` y `measurements`; `TrainingProfile.heightCm` y `bodyweightKg` |

Peso corporal, altura y medidas corporales, sólo si la persona decide
registrarlos.

> Se declara bajo *Información de salud* de forma deliberadamente conservadora.
> Se podría defender que en una app de entrenamiento el peso corporal es
> actividad física, pero ante la duda es mejor declarar de más: declarar de
> menos es lo que se sanciona.
>
> Declarar esta categoría **no** obliga a integrarse con Health Connect ni
> convierte la app en una aplicación médica. Training OS no lee ni escribe
> datos de salud del sistema, y no pide ningún permiso `android.permission.health.*`.

### Fotos y vídeos → Fotos

| | |
| --- | --- |
| Recogido | Sí |
| Compartido | No |
| Obligatorio | No |
| Finalidad | Funciones de la app |
| Dónde | Colección `photos` + Cloud Storage en `users/{uid}/photos/{id}.jpg` y `users/{uid}/avatar.jpg` |

Fotos de progreso y foto de perfil. Se eligen con el selector del sistema
(`<input type="file" accept="image/*">`), así que la app **no tiene permiso de
cámara ni de galería**: sólo recibe el fichero que la persona ha elegido.

### Archivos y documentos → Archivos y documentos

**No.** La app no accede al sistema de archivos del dispositivo. La exportación
de copia de seguridad genera un fichero y lo entrega al selector de descargas
del sistema; no lee nada.

---

## 3. Datos que NO se recogen

Se declaran como no recogidos, y el código lo respalda:

| Tipo | Por qué no |
| --- | --- |
| Ubicación (aproximada o precisa) | No hay permiso de ubicación ni ninguna llamada a geolocalización. |
| Dirección postal, teléfono | No se piden en ningún formulario. |
| Raza, etnia, creencias políticas o religiosas, orientación sexual | No se preguntan. |
| Información financiera | No hay compras, ni suscripciones, ni pasarela de pago. |
| Mensajes, contactos, calendario | No hay permisos ni código que los toque. |
| Audio, música, otros archivos | No se accede. |
| Historial de navegación o de búsqueda web | No existe. |
| Actividad en la app / analítica / interacciones | No hay SDK de analítica. Firebase Analytics **no** está instalado. |
| Registros de fallos, diagnósticos, rendimiento | No hay Crashlytics ni ningún informe automático. |
| ID de publicidad, ID de dispositivo | No se leen. La app no muestra anuncios. |
| Datos de salud del sistema (Health Connect) | No se integra. |

Se puede comprobar: `package.json` no contiene `firebase/analytics`,
`@capacitor/device`, `@capacitor-community/admob` ni ningún SDK publicitario, y
`AndroidManifest.xml` declara tres permisos, `INTERNET`, `POST_NOTIFICATIONS` y
`SCHEDULE_EXACT_ALARM` (ver la sección 5). Ninguno de los tres recoge datos.

---

## 4. Prácticas de seguridad

**¿Se cifran los datos en tránsito?** — Sí.
Todo el tráfico va a Firebase por HTTPS. Además
`android/app/src/main/res/xml/network_security_config.xml` prohíbe el tráfico en
claro para cualquier dominio y `usesCleartextTraffic` está en `false`, así que
una petición HTTP no cifrada fallaría en lugar de enviarse.

**¿Se puede pedir la eliminación de los datos?** — Sí.
Desde la propia app en *Ajustes → Cuenta → Eliminar cuenta*, y desde la página
pública `/account-deletion.html` para quien no pueda acceder a la app.

La eliminación borra: la cuenta de Firebase Auth, el documento de perfil, la
reserva del nombre de usuario, **todas** las colecciones del usuario, las
lápidas de sincronización, **los ficheros de Cloud Storage** (fotos de progreso
y avatar) y la copia local en IndexedDB del dispositivo.

Código: `src/lib/sync/engine.ts` → `wipeRemoteData` + `resetLocalData`, y
`src/lib/firebase/account.ts` → `deleteAccount`.

**¿Se comparten datos con terceros?** — No.
Google Firebase actúa como **encargado del tratamiento** (infraestructura), no
como destinatario de una cesión. Google Play distingue expresamente entre
"transferir a un proveedor de servicios" y "compartir", y esto es lo primero.

---

## 5. Permisos declarados

Tres:

| Permiso | Nivel | Por qué |
| --- | --- | --- |
| `android.permission.INTERNET` | Normal | Hablar con Firebase Auth, Firestore y Storage. |
| `android.permission.POST_NOTIFICATIONS` | Tiempo de ejecución (Android 13+) | Dos avisos, los dos del entrenamiento abierto: «entrenamiento en curso» en la pantalla de bloqueo, con el cronómetro (o la cuenta atrás del descanso), mientras dure; y «Descanso terminado», un aviso puntual al acabar el descanso entre series si la app está en segundo plano. |
| `android.permission.SCHEDULE_EXACT_ALARM` | Acceso especial (Android 12+): «Alarmas y recordatorios» | Que el aviso «Descanso terminado» llegue a su hora con la pantalla apagada. No recoge ningún dato. |

**Ninguno de los dos avisos recoge ni comparte ningún dato**: se publican desde
el propio teléfono con lo que ya está en él (la hora de inicio, el nombre del
día, el ejercicio, la serie y la hora a la que acaba el descanso) y no salen de
él. No hay notificaciones push, ni recordatorios para volver a la app, ni
Firebase Cloud Messaging. Por eso no añaden nada a la sección 2.

`SCHEDULE_EXACT_ALARM` **tampoco recoge ni comparte ningún dato**: sólo deja
programar en el propio teléfono una alarma para el final del descanso que la
persona acaba de empezar. No toca el calendario, ni los despertadores del
sistema, ni nada fuera de la app. Por eso tampoco añade nada a la sección 2.

Cuándo se pide cada uno, nunca al abrir la app:

* `POST_NOTIFICATIONS`: la primera vez que se empieza un entrenamiento. Si la
  persona lo deniega no se vuelve a preguntar y la app funciona exactamente
  igual, sin los avisos. Por debajo de Android 13 este permiso no existe y no
  aparece ningún diálogo.
* `SCHEDULE_EXACT_ALARM`: no es un diálogo, es un ajuste del sistema. Android 12
  y 13 lo conceden por defecto; desde Android 14 viene desactivado. La primera
  vez que empieza un descanso, sólo si falta y las notificaciones están
  permitidas, la app explica para qué es y ofrece abrir el ajuste, con
  «Ahora no». Una sola vez. Sin él, el aviso de descanso llega igual, pero
  puede llegar tarde. Por debajo de Android 12 no existe.

La justificación de cada permiso, y la lista de lo que **no** se pide y por qué
(entre otros, `FOREGROUND_SERVICE`: los cronómetros del aviso los pinta el
sistema y no hace falta ningún servicio en primer plano; `USE_EXACT_ALARM`,
`USE_FULL_SCREEN_INTENT`, `VIBRATE` y `WAKE_LOCK`), está comentada dentro de
`android/app/src/main/AndroidManifest.xml`, y `npm run android:verify` falla si
aparece cualquier otro.

---

## 6. Antes de enviar el formulario

- [ ] Las dos URLs (privacidad y eliminación) responden 200 en abierto.
- [ ] `public/privacy.html` ya no contiene la palabra `COMPLETAR`.
- [ ] El correo de contacto de ambas páginas es el mismo que el de la ficha.
- [ ] Las categorías marcadas coinciden exactamente con la sección 2.
- [ ] No se ha añadido ningún SDK nuevo desde la última vez que se revisó esto.
