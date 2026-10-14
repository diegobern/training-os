# Requisitos de arquitectura de la ampliación

Decisiones vinculantes acordadas el 2026-09-16, antes de escribir código de la
fase 2. Sustituyen a cualquier supuesto anterior. Línea base: tag `pre-expansion`.

---

## REGLA PERMANENTE — Paridad Web · Android · iOS

> **Every user-facing feature added to Training OS must be evaluated on Web,
> Android and iOS. Platform-specific behavior must have a native equivalent
> where meaningful. No release is complete until the feature parity matrix is
> updated.**

Añadida el 2026-10-14, con la app de iOS, y por encima de cualquier decisión de
esta lista. En la práctica:

- **Cada función nueva se piensa en las tres plataformas** antes de darla por
  terminada: cómo se ve en el navegador, en la app de Android y en la de
  iPhone, y qué cambia en cada una (teclado, zonas seguras, atrás, permisos,
  idioma, sin conexión).
- **Lo que una plataforma hace con su API nativa tiene su equivalente en la
  otra** cuando tiene sentido — la notificación de entrenamiento de Android es
  la Live Activity de iOS; el botón atrás, el gesto de deslizar —, y pasa por
  el mismo contrato (`docs/NATIVE-CONTRACT.md`, D41). Si no tiene sentido en
  una plataforma, se dice por qué en la matriz, no se deja en blanco.
- **Ninguna versión está terminada sin actualizar la matriz de paridad**,
  [`docs/IOS-FEATURE-PARITY.md`](IOS-FEATURE-PARITY.md): qué existe en cada
  plataforma y qué está verificado (pruebas, simulador, dispositivo real) y qué
  no.

---

## D1. Catálogo global vs datos de usuario

**El catálogo integrado NO se duplica en `users/{uid}/exercises`.**

Tres conceptos separados:

| Concepto | Dónde vive | Sincroniza | Escribe el usuario |
|---|---|---|---|
| **BUILT-IN CATALOG** | JSON estático versionado, servido con la web y cacheado en un store `catalog` de IndexedDB | **nunca** | no, es de solo lectura |
| **USER EXERCISES** | store `exercises` (solo `isCustom: true`) → `users/{uid}/exercises` | sí | sí |
| **USER EXERCISE PREFS** | store nuevo `exercisePrefs` → `users/{uid}/exercisePrefs` | sí | sí |

`exercisePrefs` guarda por ejercicio: favorito, oculto, notas propias, ajustes
personales (series/reps/descanso que sobreescriben los del catálogo) y
`lastUsedAt`. Un documento diminuto, y solo para los ejercicios que el usuario
ha tocado de verdad — no uno por cada entrada del catálogo.

El catálogo lleva `catalogVersion`. Actualizarlo es publicar un JSON nuevo: cero
escrituras en las cuentas.

### Migración de los usuarios actuales

Hoy existen 69 filas sembradas con id `lib-${slug}` dentro de
`users/{uid}/exercises`. **El catálogo nuevo reutiliza exactamente esos mismos
ids**, así que rutinas, `exerciseLogs` y PRs siguen resolviendo sin tocarlos.

Las filas antiguas quedan como sombra redundante: el resolutor prefiere el
catálogo y cae a la fila del usuario si no encuentra nada. **No se borran en la
migración** (D14). Los favoritos que hoy viven en `Exercise.isFavorite` se
copian a `exercisePrefs`; el campo original se deja intacto.

## D2. Nada de 876 documentos por cuenta

El catálogo no entra en `syncQueue` bajo ningún camino. Solo se sincronizan:
ejercicios personalizados, preferencias, notas e historial.

## D3. Modelo cardio real, discriminado

Cardio no se fuerza dentro de series×repeticiones. `exerciseKind` discrimina:

- **strength** — sets / reps / weight / RIR / RPE
- **cardio** — duration / distance / pace / speed / incline / resistance / HR / calories / laps
- **mobility** — duration, series opcionales, notas

Workout, History y Progress ramifican por `kind`.

## D4. Una sola definición de "esto cuenta"

`isLogged()` era la única puerta de todo el sistema y asumía peso×reps. **No se
parchea con condiciones sueltas.** Se sustituye por una abstracción única:

```
isValidPerformance(kind, set)
  ├─ isValidStrengthPerformance(set)
  ├─ isValidCardioPerformance(set)
  └─ isValidMobilityPerformance(set)
```

Estadísticas, historial, progreso, PRs y sesión usan **la misma** definición. No
se admite una segunda comprobación equivalente escrita a mano en otro archivo.

## D5. Nombres localizados, no congelados

Los ejercicios integrados guardan `name.en` / `name.es` bajo un `exerciseId`
estable y se resuelven en el momento de leer. Nunca se persiste el nombre
traducido como valor único.

Las plantillas de rutina persisten **ids estables** (`template.push`,
`template.legs`) y se traducen en la UI. Solo el texto que el usuario escribe de
su puño se guarda literal.

## D6. Traducciones del dataset

Las instrucciones originales se importan siempre como `sourceInstructionsEn` y
**nunca se modifican**. El español vive aparte con estado explícito:

```
translationStatus: 'missing' | 'machine' | 'reviewed'
```

Una traducción automática se marca `machine` y así se muestra. Una corrección
manual la sustituye sin tocar el original. Se priorizan los ejercicios más
usados.

## D7. Imágenes

WebP optimizado, **fuera del precache**, bajo demanda. Caché de runtime limitada
a: rutina actual, ejercicios recientes, favoritos y HOW TO vistos hace poco, con
límite de entradas y expulsión. Los 1.746 assets no se cachean nunca en bloque.

## D8. Manifiesto de medios

`exercise-media-manifest.json` generado automáticamente. Por registro:
`exerciseId, startImage, endImage, source, license, sourceUrl, hash`.

## D9. Deduplicación

Antes de importar: normalización y `canonical exercise` + `aliases` + mapeos
externos. Los 69 curados actuales **ganan** cuando están mejor curados que la
entrada del dataset. No puede acabar habiendo "Incline Dumbbell Press",
"Dumbbell Incline Press" e "Incline DB Press" como tres ejercicios.

## D10. Validación de calidad en el import

Se valida cada entrada: imagen ausente, músculo ausente, equipamiento
desconocido, instrucciones inválidas, duplicado, categoría no soportada.
Reporte con cuatro cubos: `IMPORTED / MERGED / SKIPPED / REQUIRES REVIEW`.

## D11. HOW TO

Bottom sheet. **Sin cambiar de ruta y sin perder el estado del entrenamiento.**
Al cerrarlo se vuelve exactamente a la serie que se estaba registrando.

## D12. Presupuesto de rendimiento

Medido en el tag `pre-expansion`, antes de tocar nada:

| Métrica | Antes |
|---|---|
| Chunks | 45 |
| Total | 2.120 kB crudo / 572 kB gzip |
| Entry (`index`) | 211,6 kB / **64,9 kB gzip** |
| Vendor | 163,9 kB / 53,5 kB gzip |
| Precache PWA | **622,6 KiB** |
| Chunk de Library | 5,2 kB / 1,9 kB gzip |
| three.js (diferido) | 563,9 kB / 144,2 kB gzip |
| Firebase (diferido) | ~955 kB crudo |

**Presupuesto:** el entry y el precache no pueden crecer más de un 10 %. El
catálogo es un chunk aparte, cargado bajo demanda, nunca en el arranque.

## D13. Feature flags

`newOnboarding`, `cardioV2`, `exerciseMediaV2`. Se eliminan tras el despliegue.

## D14. Rollback

Una migración remota **nunca destruye el documento antiguo antes de verificar el
nuevo**. Procedimiento documentado en `docs/ROLLBACK.md`.

## D15. Privacidad del onboarding

Cada campo marcado `required`/`optional` y con un consumidor real documentado.
Sin diagnósticos médicos. `profileVersion` y `onboardingVersion` presentes.

## D16. Onboarding resumible

Se guarda `onboardingStep` y las respuestas **después de cada paso**.
`onboardingCompleted` solo al terminar de verdad.

## D17. Personalización explicable — tabla FIELD → USED BY

| Campo | Req. | Lo consume |
|---|---|---|
| `units` | required | Todo peso y distancia de la app |
| `mainGoal` | required | Rangos de reps, métrica principal de Progress, prioridad del coach |
| `secondaryGoal` | optional | Desempate cuando el objetivo principal no decide |
| `experienceLevel` | required | Series por defecto, RIR objetivo, tipos de serie avanzados |
| `trainingYears` | optional | Afina lo anterior |
| `daysPerWeek` | required | Plantillas recomendadas, objetivos semanales por músculo |
| `preferredDays` | optional | Días sugeridos en el calendario |
| `sessionDuration` | required | Tamaño máximo de las rutinas sugeridas |
| `trainingEnvironment` | required | Equipamiento por defecto, primer filtro de la biblioteca |
| `availableEquipment` | required | Orden de la biblioteca y exclusión de sugerencias imposibles |
| `trainingInterests` | optional | Qué secciones destaca Home, si cardio tiene tarjeta propia |
| `preferredCardio` | optional | Qué ejercicios de cardio encabezan la biblioteca |
| `heightCm` | optional | Contexto de fuerza relativa al peso corporal |
| `bodyweightKg` | optional | Primer punto del gráfico de peso, carga en ejercicios de peso corporal |
| `ageRange` | optional | Suaviza el volumen semanal en los extremos |
| `favoriteExerciseIds` | optional | Los sube en el selector |
| `avoidedExerciseIds` | optional | Los quita de las *sugerencias* (nunca de la búsqueda) |
| `preferredRepRange` | optional | Rango por defecto al añadir ejercicios |

Ningún campo sin consumidor. **No se pregunta nada que no aparezca en esta tabla.**

## D18. Usuarios existentes

Conservan rutinas, historial, PRs, ajustes, idioma, peso y medidas. La
personalización es una adaptación, nunca una cuenta nueva.

## D19. Coste en Firebase

Estimación con la arquitectura D1 (lecturas de Firestore por operación):

| Operación | Antes de D1 (876 por usuario) | Con D1 |
|---|---|---|
| Alta de usuario | 876 escrituras de catálogo | **0** |
| Login en dispositivo nuevo | 876 lecturas | **0** |
| Abrir la biblioteca | 0 (local) | **0** |
| Abrir una rutina | 0 (local) | **0** |
| Entrenamiento | ~3 escrituras | ~3 escrituras |
| Sync periódico | proporcional al catálogo | solo datos del usuario |
| Actualizar el catálogo | 876 escrituras × cada cuenta | **0** — se publica un JSON |

El catálogo se sirve como asset estático desde la CDN de Netlify: cero lecturas
de Firestore, siempre.

## D20. App Check

Se evalúa para producción como capa extra contra abuso. **No se activa en
desarrollo local** para no bloquear el trabajo. Ver `docs/ROLLBACK.md`.

## D21-D22. Tests estrictos obligatorios

- **Idioma:** crear rutina en español → cerrar sesión → cambiar a inglés → abrir
  la misma rutina. No pueden quedar nombres del catálogo congelados en español;
  solo el texto escrito por el usuario.
- **Sesión mixta:** PUSH + CARDIO con Incline DB Press, Lateral Raise y
  Treadmill 20 min. History muestra ambos. Las estadísticas de fuerza **no**
  interpretan la cinta como series/reps. El progreso de cardio **no** calcula
  e1RM.

## D23. Investigación previa a los assets

`docs/OPEN-SOURCE-FITNESS-RESEARCH.md` con la matriz comparativa completa.
**No se incorpora ningún asset hasta terminarla.**

## D24. La ficha de un ejercicio del catálogo es de solo lectura

Una entrada del catálogo es un asset compartido. Guardar una edición sobre ella
crearía una copia privada de una fila global dentro de `users/{uid}/exercises`
—exactamente la duplicación que D1 evita— y además `listExercises()` ignora esa
copia, así que la edición desaparecería sin decir nada.

La pantalla de ficha, por tanto, se bifurca:

| | Ejercicio del catálogo | Ejercicio propio |
|---|---|---|
| Nombre, músculo, material, tipo | solo lectura | editable |
| Series, reps, descanso, RIR | editable → `exercisePrefs.defaults` | editable → `exercises` |
| Nota | editable → `exercisePrefs.note` | editable → `exercises.instructions` |
| Favorito | `exercisePrefs.favorite` | `exercisePrefs.favorite` |
| Eliminar | **no** — se puede ocultar (`exercisePrefs.hidden`) | sí (borrado lógico) |

Un ejercicio del catálogo no se puede borrar porque no es del usuario y porque
otras rutinas —incluida su propia historia— referencian ese mismo id.

## D25. El SDK de Firebase se carga en dos tramos

`firebase/firestore` y `firebase/storage` suman unos 850 KB y **no** hacen falta
para responder a «¿quién ha iniciado sesión?». Cargarlos junto a `firebase/auth`
obligaba a cada arranque de una instalación con sesión iniciada a esperar por la
base de datos antes de poder decidir qué pantalla mostrar.

- `getFirebaseAuth()` → `firebase/app` + `firebase/auth`. Es lo que usa el
  arranque, el login, el registro y el correo de verificación.
- `getFirebase()` → lo anterior más Firestore y Storage. Lo usan la
  sincronización y las pantallas que leen o escriben documentos.

Ambos están memorizados y el segundo espera al primero, así que la app nunca se
inicializa dos veces.

## D26. El `pull` va por oleadas, en paralelo dentro de cada una

Diez colecciones esperadas una tras otra eran diez viajes de ida y vuelta antes
de que la app dijera «sincronizado», y la mayoría vuelven vacías. Son
independientes —colecciones distintas, almacenes distintos, cursores
distintos—, así que cada oleada sale junta. Las oleadas siguen en orden: la
primera es lo que necesita la pantalla de inicio.

El escaneo del outbox (`pendingIds()`) pasa a hacerse **una vez por `pull`** en
lugar de una vez por colección.

## D27. Las ilustraciones van sobre una placa oscura

Los 906 SVG son una silueta blanca de un solo trazo: así los publicó Workout
Guide y así se copian, sin tocar un byte, para que el *share-alike* de
CC BY-SA 4.0 no tenga nada que alcanzar. Trazo blanco sobre tarjeta blanca es
invisible, que es exactamente como se vio la primera vez.

La corrección va en el CSS (`.demo-plate`), no en los ficheros: la placa es
oscura en los dos temas. No cambia el asset; cambia el fondo sobre el que se
mira.

## D28. Sin verificación de correo

El correo se pide al registrarse y sigue siendo obligatorio: es con lo que se
inicia sesión y lo único que permite recuperar la contraseña. Lo que no existe
es la **puerta**: no se envía ningún correo de verificación, no hay fase
`needs-verification` y ninguna pantalla pregunta por ello. La cuenta funciona
desde el instante en que existe.

**El coste, dicho sin rodeos:** un correo mal escrito deja a esa persona sin
forma de recuperar la contraseña, y ya no hay nada que lo detecte. Todo lo
demás en la app es indiferente al asunto.

Esta decisión ha ido y vuelto: se quitó, se restauró como obligatoria, y se ha
vuelto a quitar. El historial de git tiene las dos implementaciones completas,
así que restaurarla es recuperar un commit, no reescribirla.

Qué no existe, y se ha borrado en vez de dejarse apagado:

| | |
|---|---|
| `src/routes/auth/VerifyEmail.tsx` | la pantalla de la puerta |
| `src/routes/auth/EmailVerified.tsx` + `/auth/verificado` | la página de destino del enlace |
| `firebase/email-verificacion.html` + su README | la plantilla del correo |
| `e2e/verify-page.mjs` | la prueba de esa página |
| `resendVerification`, `refreshVerification`, `applyVerificationCode` | en `account.ts` |
| `needs-verification`, `recheckVerification`, `skipVerification` | en `useAuth.ts` |
| `AuthUser.emailVerified` | estado que se escribía y no leía nadie |
| 20 claves `auth.verify*`, `auth.resend*`, `verified.*` | en los dos idiomas |

Quitar `/auth/verificado` es seguro porque **la recuperación de contraseña no
la usa**: `sendPasswordResetEmail` se llama sin URL de continuación, así que
ese correo lo resuelve la página de Firebase. Los enlaces de verificación que
se enviaron mientras la puerta existía caducan solos.

Lo asegura una prueba, no una intención: `e2e/authgate.mjs` se registra contra
el emulador de Auth y comprueba que ninguna pantalla pide verificar **y** que
el emulador no ha emitido ningún código `VERIFY_EMAIL`, así que un
`sendEmailVerification` que se colara haría fallar la suite.

## D28 bis. El ojo de la contraseña

Vive en `TextField`, no en cada pantalla: cualquier campo con `type="password"`
lo lleva, y son seis repartidos por registro, login y ajustes.

Tres detalles que no son estéticos:

- El botón **no toma el foco** (`preventDefault` en pointer-down y
  `tabIndex={-1}`). Si lo tomara, en un móvil se cerraría el teclado cada vez
  que quieres mirar lo que has escrito, y tabular por el formulario iría campo,
  ojo, campo.
- **Se vuelve a ocultar al salir del campo.** Una contraseña destapada en una
  pantalla que alguien deja boca arriba es peor problema que el que esto
  resuelve.
- `{...rest}` se esparce **antes** del `onBlur`. Al revés lo sustituye por
  `undefined` en silencio y el campo se queda destapado para siempre — que es
  justo lo que hacía la primera versión.

## D29. Cobertura de ilustraciones: tres procedencias, dicha cada una

Workout Guide dibuja 302 de los 1096 ejercicios. Abrir CÓMO HACERLO en
cualquiera de los otros 794 daba dos frases grises y nada más: correcto e
inútil. La segunda etapa del pipeline (`scripts/catalog/enrich.mjs`) cierra ese
hueco en tres pasadas, en orden descendente de honestidad, y **cada ejercicio
guarda de cuál salió**:

| `mediaStatus` | Qué es | Cuántos |
|---|---|---|
| `illustrated` | Su propio dibujo: Workout Guide (3 fotogramas) o Everkinetic (1) | 418 |
| `variant` | El dibujo de un movimiento equivalente, **con su nombre en pantalla** | 253 |
| `none` | Sin dibujo. La ficha muestra músculos, material, tipo y objetivo | 425 |

Everkinetic entra directamente, no a través de Workout Guide: misma licencia
CC BY-SA 4.0, verificada por el propio script contra `LICENSE.md` antes de
copiar un solo fichero, y aporta 116 dibujos y 14 juegos de instrucciones.

### Las reglas del préstamo

Un dibujo prestado tiene que enseñar el mismo movimiento o no vale la pena:

- mismo grupo muscular y mismo tipo (fuerza / cardio / movilidad);
- coincidencia exacta en **toda palabra que cambie la forma** del movimiento:
  *incline*, *decline*, *reverse*, *sumo*, *behind*, *preacher*…;
- las palabras que solo cambian la **ejecución** —*alternating*, *single*,
  *banded*, *paused*— sí se ignoran, porque el dibujo enseña el patrón;
- el donante tiene que tener dibujo propio, para que nunca se preste un
  préstamo.

Las cuatro reglas están en `tests/catalog-integrity.mjs`, no solo en el código.

### Lo que no se hace

No se inventa ninguna ilustración, ninguna traducción ni ninguna instrucción.
Los 425 sin dibujo lo dicen; los cinco que además no tenían texto llevan una
clave de ejecución **escrita por nosotros** y marcada como nuestra. El sexto,
*Iron Cross*, se deja en blanco a propósito: escribir consejos de técnica de un
movimiento del que no estamos seguros es peor que una ficha vacía.

### Dos fondos, no uno

Workout Guide dibuja una silueta blanca sobre nada; Everkinetic dibuja trazo
oscuro sobre blanco. Cada uno sobre el fondo del otro desaparece. La hoja elige
la placa según de dónde venga el fichero: `.demo-plate` oscura para la primera,
`.demo-paper` blanca para la segunda.

## D30. La marca del menú: una tira de sprites movida por el compositor

Tres versiones, y las diferencias importan:

1. **12 fotogramas con `steps()` en 7,2 s.** Son 1,7 fps en saltos de 30°: un
   pase de diapositivas. Y el bucle no cerraba, porque la tira salía de
   muestrear la animación real con un reloj de pared y esa animación suaviza el
   giro y flota el tótem con periodos que no dividen una vuelta.
2. **WebP animado de 96 fotogramas.** Equiespaciados y con el bucle cerrado,
   pero un GIF/WebP animado lo decodifica y lo temporiza el **hilo principal**:
   en el móvil tartamudea bajo carga y **se para del todo mientras haces
   scroll**, porque el scroll lo lleva el compositor y el hilo principal está
   ocupado en otra cosa. Eso es exactamente lo que se reportó.
3. **La actual: una tira de sprites movida con `transform`.** La animación vive
   en el compositor, donde nada de lo que haga la app puede matarla de hambre.
   Sigue girando a ritmo constante durante un scroll, durante un render y
   durante cualquier otra cosa.

### Los números no son arbitrarios

- **30 fps**, elegidos contra la pantalla: a 60 Hz cada fotograma dura
  exactamente dos refrescos, así que ninguno se queda tres refrescos y el
  siguiente dos —ese desajuste era el tirón que aún quedaba a 24 fps—. A 120 Hz
  son exactamente cuatro.
- **96 fotogramas en 3,2 s**, que dan esos 30 fps. Y 96 es el máximo que cabe:
  WebP no admite más de 16383 px por lado y la tira son 144 px por fotograma;
  120 serían 17280 px y sencillamente no codifica.
- **144 px por fotograma**, para que a 52 px de CSS siga nítido en un móvil 3×.

### Dos detalles que salieron de mirarlo, no de razonarlo

El primer horneado capturaba el fondo de la pantalla de bienvenida junto con el
logo, así que el resultado era un cuadrado opaco dentro del botón lima. Ahora se
captura con `omitBackground` y el fondo transparente, y la marca se apoya de
verdad sobre el botón.

Y en modo horneado se ocultan los anillos, la cuenta que orbita y el polvo: a 52
píxeles son un garabato que costaba un tercio de los bytes del sprite y ensuciaba
la marca en vez de darle detalle. De 309 KB a 174 KB, y más limpio.

Sin animación (ajuste del usuario o `prefers-reduced-motion`) **se carga otro
fichero** de 2 KB, no se pausa este: una tira parada se queda donde pillara, y
mandar 174 KB de fotogramas a quien ha pedido que nada se mueva no tiene sentido.

Lo comprueba `e2e/nav-logo-shot.mjs`, y una de sus pruebas **hace scroll
mientras mide**: si la marca vuelve a congelarse durante el scroll, falla.

### El nombre del fichero lleva el hash de su contenido

Esto no es pulcritud, es la corrección de un fallo que llegó a un móvil de
verdad. `/brand/` se sirve **CacheFirst**, así que un teléfono que ya había
abierto la app se queda con su copia durante meses. La tira cambió de forma
tres veces —12 fotogramas, luego un fichero animado, luego 96— y el nombre no,
así que el móvil siguió sirviendo la imagen del mes pasado a la hoja de estilos
de este mes. La petición funcionaba, no había ningún 404, todas las pruebas en
un perfil limpio pasaban, y la barra mostraba **una columna de rayas**.

Ahora `e2e/bake-nav-sprite.mjs` calcula el sha256 de cada fichero, lo mete en
el nombre y genera `src/components/nav/navLogoAsset.ts` con las rutas, que es
lo que importa el componente. Un CSS nuevo solo puede pedir el fichero con el
que se construyó. Además el script **verifica que el CSS declara el mismo
número de fotogramas** que la tira antes de escribir nada, y aborta si no.

`e2e/stale-cache.mjs` reproduce el fallo a propósito: planta una imagen con la
forma equivocada bajo el nombre antiguo y comprueba que la app ni la pide ni se
ve afectada.

## D31. Añadir un ejercicio en mitad del entrenamiento

Estaba, y no se veía. Era el último chip de una fila con scroll horizontal, así
que en un día de cinco ejercicios quedaba pasado el borde derecho de una
pantalla de 375 px: presente en el DOM, invisible para la persona. Encima era
punteado y gris, lo menos llamativo de la fila.

Ahora hay dos accesos y **ninguno depende de deslizar nada**:

- una pastilla en color de acento **fijada fuera del scroller**, a la derecha de
  la fila de ejercicios, siempre en pantalla;
- un botón etiquetado al final de las series, que es donde estás cuando decides
  que quieres otro ejercicio.

`e2e/catalog-ui.mjs` mide la caja de los dos y falla si alguno se sale del
viewport.

## D32. El cuestionario es de la cuenta, no del teléfono

`settings` no es un almacén sincronizado, así que `resetLocalData()` —que vacía
el dispositivo cuando se entra con una cuenta distinta— lo dejaba intacto. Y
ahí vive `onboardingVersion`.

Consecuencia: crear una segunda cuenta en un móvil que ya había pasado el
cuestionario heredaba el «ya respondido» del anterior. **Nunca se le preguntaba
nada**, y además arrancaba con los objetivos semanales y los descansos de otra
persona. Se reportó como «me has eliminado el formulario», y no era eso: el
formulario estaba, pero la condición que lo dispara ya venía marcada.

`resetLocalData()` limpia ahora lo que produjo el cuestionario
—`onboardingVersion`, `trainingProfile`, `weeklySetTargets`,
`defaultRestSeconds`— y **solo eso**: el tema y el idioma son preferencias del
dispositivo, no datos de nadie, y se respetan.

Lo cubren siete pruebas unitarias contra una IndexedDB real
(`fake-indexeddb`), que ejecutan la función de verdad en lugar de repetir su
lógica. Una de ellas comprueba lo contrario: que si no había nada que limpiar,
no se escribe nada.

## D33. El logo de bienvenida: tiempo, no fotogramas

`spin += 0.0118` se sumaba **por fotograma**, no por segundo. Es decir, la
velocidad del logo era la frecuencia de refresco de la pantalla: al doble en un
móvil de 120 Hz, y más lento en cuanto se perdía un fotograma. Todo lo demás de
la animación ya iba por tiempo (`t`), así que el giro y el balanceo además se
desfasaban entre sí.

Ahora se integra contra segundos, con el delta acotado a 50 ms para que volver
a la pestaña al cabo de un minuto no teleporte el objeto media vuelta. Y el
amortiguado del empujón del dedo usa una vida media en segundos, no un factor
por fotograma.

De paso, una vuelta pasa de ~8,9 s a ~4,8 s.

### El destello

Un bisel pulido no se ilumina de forma uniforme al girar: engancha la luz un
instante, justo cuando la cara pasa de canto y el ángulo rasante es máximo.
`sin(yaw)` vale ±1 en esos dos momentos y 0 cuando la cara está de frente, así
que elevarlo a la 14 da un destello corto y duro dos veces por vuelta y nada
entre medias. La emisión del rayo monta sobre la misma curva a un tercio de
fuerza, para que la marca palpite con el destello en vez de ignorarlo.

Cuesta una multiplicación por fotograma. Es el tipo de detalle que separa un
objeto con material de una foto girando.

## D34. El cronómetro del entrenamiento se ve en toda la app

Mientras hay una sesión abierta, una barra fija encima de la navegación
inferior enseña el tiempo transcurrido en cualquier pantalla; tocarla vuelve a
la sesión. En la pantalla de la sesión no aparece: ahí el tiempo ya está en la
cabecera y la parte de abajo es del temporizador de descanso.

- **Un solo cálculo** para todos: `useElapsed` (`src/hooks/useElapsed.ts`), la
  misma cuenta que guarda `finishSession` como duración. Sale de
  `startedAt`/`pausedMs` absolutos, así que sobrevive a que Android congele el
  WebView, y se relee en cuanto la página vuelve a verse.
- **Abajo y no arriba**: arriba ya se apilan los avisos de sincronización y de
  sin conexión, los toasts y la barra de cada página, todos bajo el notch.
- **No tapa nada**: la altura de la navegación se comparte
  (`BOTTOM_NAV_HEIGHT`), un espaciador en el flujo deja que el final de cada
  página suba por encima de la barra, y la barra publica lo que ocupa en
  `--workout-bar-space` para que el aviso de actualización se aparte.

## D35. Finalizar pide confirmación

Finalizar es lo único de la sesión que no tiene vuelta atrás, así que los dos
accesos — «Hecho» en la cabecera y el botón grande del final — abren un resumen
de lo que se va a guardar (duración, ejercicios con algo registrado, series
completadas de total, series pendientes). Sin nada registrado se mantiene el
diálogo que ofrecía descartar. Los recuentos salen de `sessionProgress`
(`src/lib/training/sessionProgress.ts`), el mismo para la cabecera, el
diálogo y el aviso de Android.

## D36. Aviso de entrenamiento en curso en la pantalla de bloqueo (Android)

Ver `docs/ANDROID-SETUP.md`. Plugin propio mínimo, cronómetro pintado por el
sistema (`setUsesChronometer`), sin servicio en primer plano, permiso pedido al
empezar el primer entrenamiento. En web es un no-op que no descarga Capacitor.

## D37. Instrucciones en español, y una caché que se entera

Las 877 fichas con pasos en inglés tienen su traducción, con el glosario fijo
de `docs/GLOSARIO-INSTRUCCIONES-ES.md`. La fuente de verdad es
`scripts/catalog/instructions-es.json` y una etapa del pipeline
(`npm run catalog:es`) la aplica al catálogo publicado; cada traducción guarda
la huella del inglés que traduce y deja de aplicarse si el original cambia.
Están marcadas `machine`, no `reviewed` (D6): las hizo un modelo y las revisó
otra pasada del modelo, no una persona.

Los **nombres** siguen el mismo camino (`scripts/catalog/names-es.json`,
`scripts/catalog/es-exercise-names.mjs`): sustituyen a los traducidos por reglas,
que salían rotos («Press de Banca con Barra Guillotine», «Sentadilla Completo»),
y a los 199 que seguían en inglés; los 83 escritos a mano no se tocan. La misma
etapa traduce el músculo principal que seguía en inglés y mantiene el nombre
del dibujo prestado igual al del ejercicio dibujado. Regla de fondo: con la app
en español no aparece nada en inglés, y al revés.

Rellenar campos no cambia la versión del catálogo, y la copia de cada fichero
guardada en IndexedDB (y en la caché CacheFirst del service worker) se habría
quedado en inglés para siempre en cualquier móvil que hubiera abierto CÓMO
HACERLO antes. Por eso el build calcula una huella del contenido de cada
fichero (`__CATALOG_REVISIONS__`, en `vite.config.ts`): si no coincide con la
de la copia guardada, el fichero se vuelve a pedir con `?rev=<huella>`. Un
fichero que no ha cambiado no se descarga nunca dos veces.

## D38. Sin datos de ejemplo

La app sólo enseña lo que la persona registra con su cuenta. Se ha quitado
«Cargar datos DEMO» y todo lo que lo anunciaba. Lo que cargó esa opción a
quien la usó se borra solo — en el dispositivo y en la cuenta — al arrancar, y
no vuelve desde la nube en otro dispositivo (`src/lib/db/sampleData.ts`). Sólo
se toca lo marcado `demo: true` por la propia app; nada que haya registrado una
persona lleva esa marca.

## D39. Un idioma cada vez

Todo lo que se ve sale en el idioma que la persona tiene puesto en la app, y
sólo en ése: nada en inglés con la app en español ni al revés.

- **Textos de la interfaz**: siempre por `t()`; ninguna cadena fija en los
  componentes. Los recuentos pasan `n` y la clave elige singular o plural con
  `Intl.PluralRules` (`clave_one`): «1 serie», «3 series».
- **Números**: `setFormatLocale` (lo fija `useApp` con el idioma) pone coma
  decimal y separador de miles del idioma en todos los formateadores; las
  duraciones cortas dicen «min» en español.
- **Lo guardado con nombre de la app** (el «Entrenamiento libre», el nombre por
  defecto de un ejercicio que ya no existe) se traduce al pintarlo
  (`sessionTitle`, `exerciseTitle`), no al guardarlo: una sesión empezada en
  inglés se lee en español si luego se cambia el idioma.
- **Catálogo**: nombres, músculo principal e instrucciones vienen en los dos
  idiomas (D37); lo que una persona escribe — sus ejercicios, rutinas y
  notas — se enseña tal cual lo escribió.
- **Android**: el canal del aviso de entrenamiento lleva nombre y descripción
  en el idioma de la app, y `values-es/strings.xml` cubre el arranque en frío.

Lo vigilan `tests/unit.ts` (claves en los dos idiomas, plurales, formato),
`e2e/fixes-texts.mjs` (una sesión guardada en un idioma y leída en el otro) y
`e2e/language-sweep.mjs`, que recorre todas las pantallas en español y en
inglés — texto visible, etiquetas de accesibilidad, placeholders y el diálogo
de finalizar — buscando palabras de interfaz del otro idioma.

Lo que escribe la persona no se traduce, tampoco los nombres de una rutina
creada desde plantilla: se ponen en el idioma de ese momento y desde entonces
son suyos, editables como cualquier otro nombre.

## D40. Con cuenta, también sin conexión

- **El alta decide sobre la cuenta terminada.** Firebase anuncia el usuario
  en cuanto existe la cuenta de Auth, antes de que se guarden el nombre de
  usuario y el perfil. `useAuth.resolve` espera al alta en curso
  (`signUpSettled`, con un tope de 15 s para no colgarse si Firestore no
  responde). Antes leía «sin perfil» y enseñaba «Elige tu nombre de usuario»
  a quien acababa de elegirlo; guardar ahí reservaba un segundo nombre.
- **Sin red se entra igual.** Si leer el perfil falla y el dispositivo ya
  tiene los datos de esa misma cuenta y ha pasado el cuestionario, la app
  abre con ellos: todo se guarda en local, se encola y se sube al volver la
  conexión (`resolve` se repite con el evento `online`). Sólo un dispositivo
  sin nada de esa cuenta ve la pantalla de reintentar, con el motivo en el
  idioma de la app — el mensaje de Firebase, siempre en inglés, va al
  registro.
- **Subir los ajustes no bloquea.** `pushSettings` es una subida, no una
  decisión; esperarla dejaba la pantalla anterior puesta indefinidamente si
  Firestore no podía confirmar la escritura.

`e2e/account.mjs` (emuladores completos) lo comprueba: alta directa al
cuestionario, dos entrenamientos reales que llegan a Firestore, un
dispositivo limpio que lo recupera todo, aislamiento entre usuarios, un
entrenamiento hecho con la red cortada antes de abrir la app (nada sube
mientras tanto; sube exactamente una vez al volver) y una recarga que no
pierde nada. `e2e/authgate.mjs` comprueba que, con Firestore caído, el alta
no se queda colgada en el formulario.

## D41. Un contrato JavaScript, dos implementaciones nativas

Todo lo que la app necesita del sistema y no cubre un plugin oficial pasa por
**un único plugin propio**, `WorkoutNotification`: el mismo nombre, los mismos
nueve métodos, el mismo evento `open` y los mismos datos en Android (Java) y en
iOS (Swift). Cada plataforma lo cumple con su API correcta:

| Qué | Android | iOS |
|---|---|---|
| Entrenamiento en curso con el móvil bloqueado | Notificación persistente con cronómetro del sistema | Live Activity (ActivityKit) en la pantalla de bloqueo y la Dynamic Island, pintada por una extensión de WidgetKit |
| «Descanso terminado» | `AlarmManager` → notificación | Notificación local (`UNUserNotificationCenter`) |
| Háptica | `performHapticFeedback` | `UIImpactFeedbackGenerator` / `UINotificationFeedbackGenerator` |
| Volver al entrenamiento | `PendingIntent` con `sessionId` | `trainingos://workout/active?session=<id>` |

El lado web (`src/lib/native/workoutNotification.ts`) no sabe cuál de las dos
tiene delante. El contrato — métodos, datos, quién llama a qué y cuándo — está
en `docs/NATIVE-CONTRACT.md`, y es la fuente de verdad: `npm run android:verify`
y `npm run ios:verify` fallan si Java, Swift o TypeScript declaran otros
métodos que el contrato.

- **El idioma lo pone JavaScript.** Todo texto llega traducido con `t()`; el
  código nativo no tiene palabras de la interfaz.
- **Los tiempos son marcas absolutas** y los cronómetros los pinta el sistema:
  ni servicio en primer plano en Android ni modo de segundo plano en iOS.
- **Nada nativo puede tumbar un entrenamiento**: cada llamada tiene un tiempo
  máximo y un fallo se queda en la consola.
- **Lo que es de una sola plataforma viaja como campo opcional** (los
  `channel*` de Android) o como método que la otra contesta sin hacer nada
  (`requestExactAlarm` en iOS).

Por qué uno y no dos: `@capacitor/local-notifications` no expone ni el
cronómetro de Android ni las Live Activities, y dos plugins distintos
obligarían a duplicar en JavaScript la lógica de cuándo publicar, actualizar y
retirar, que es justo la parte delicada.

## D42. «Descanso terminado» en las dos plataformas, y por qué no es la Live Activity

El README lo tenía como «deliberadamente fuera». Ya no: el aviso puntual de
fin de descanso existe en Android y en iOS, y se programa y se cancela con las
mismas reglas (`desiredRestAlert` y `restAlertTransition`, en
`src/lib/native/workoutPresence.ts`): al empezar, ajustar o reanudar un
descanso se programa; al pausarlo, saltarlo o terminarlo antes se cancela; al
llegar su hora **no** se cancela, lo entrega el sistema. Con la app delante no
sale: avisa la propia app.

- **iOS**: notificación local con `UNTimeIntervalNotificationTrigger` e
  identificador fijo. Llega con la app en segundo plano, con el móvil
  bloqueado y con la app cerrada. Siempre puntual: no hay permiso de alarma
  exacta.
- **Android**: `AlarmManager` sobre el reloj de tiempo transcurrido.
  `setExactAndAllowWhileIdle` si hay `SCHEDULE_EXACT_ALARM` — un acceso
  especial que viene denegado desde Android 14 y que se ofrece **en contexto**,
  una sola vez, la primera vez que empieza un descanso, con «Activar en
  Ajustes» y «Ahora no» — y, si no, `setAndAllowWhileIdle`, aproximado. Sin
  `USE_EXACT_ALARM`. Detalle en `docs/ANDROID-SETUP.md`.
- **El permiso de notificaciones** se pide una vez, al empezar el primer
  entrenamiento. Denegado, no hay aviso y todo lo demás funciona igual.

**Por qué la Live Activity no basta.** La Live Activity (y la notificación de
entrenamiento de Android) es el **estado continuo**: enseña la cuenta atrás y
pasa sola a «Descanso terminado» al vencer (`staleDate`), pero **no suena, no
vibra y no aparece**: con el móvil en el bolsillo no avisa a nadie. El aviso es
un **aviso puntual** que hace exactamente eso y se va. Además dependen de cosas
distintas — la Live Activity no necesita permiso; el aviso, sí — y la persona
puede apagar cualquiera de los dos sin perder el otro. Dos superficies, dos
trabajos.

## D43. Un único punto de vaciado: un entrenamiento nunca cruza de cuenta

El riesgo era concreto: con un entrenamiento en marcha en la cuenta A, cerrar
sesión y entrar con la B podía dejar la Live Activity o la notificación de A en
la pantalla de bloqueo, un aviso de descanso de A por llegar, o un autoguardado
pendiente de A escribiendo su sesión en la base de datos local de B.

La solución es **un único punto de paso**, no una limpieza en cada pantalla:

- `engine.setBeforeLocalReset(fn)`: `resetLocalData` y `wipeEverything` llaman
  a `fn` **sincrónicamente, lo primero**, antes de su primer `await`.
  `main.tsx` lo conecta a `useWorkout.reset()` + `forceStopNative()`. Cualquier
  camino que vacíe el dispositivo — cambio de dueño, cerrar sesión, borrar la
  cuenta, «Borrar todo» — pasa por ahí sin saberlo.
- `useWorkout.reset()` cancela el guardado pendiente, vacía la sesión en
  memoria y sube una `epoch`: cada acción asíncrona la comprueba tras cada
  `await` y no escribe si cambió.
- `forceStopNative()` no espera a la fila del plugin (que puede estar parada
  hasta dos minutos delante del diálogo de permiso): manda el `stop` ya y deja
  otro al final, para que siga siendo el último mensaje.
- Si Firebase cierra la sesión por su cuenta (`onAuth(null)`):
  `reset({ flush: true })` + `stop`; los datos locales se quedan.
- Restaurar una copia «reemplazar» está bloqueado mientras haya un
  entrenamiento en curso.

**Eliminar la cuenta reautentica lo primero.** Con la contraseña mal no se toca
nada: ni la nube, ni la sincronización, ni el entrenamiento. Sólo después:
guardar lo pendiente, `reset` + `stop`, parar la sincronización esperando al
ciclo en vuelo, borrar los datos en la nube, el nombre de usuario, el perfil y
el usuario, y vaciar la copia local. Si algo falla antes de borrar el usuario,
la sincronización se vuelve a arrancar y el entrenamiento se vuelve a leer. Es
también lo que pide Apple (directriz 5.1.1(v)) y lo que espera Google Play.

Lo cubre `tests/unit-lifecycle.ts`, contra una IndexedDB real. El orden
completo de cada momento está en `docs/NATIVE-CONTRACT.md`, «Ciclo de vida».

## D44. Plataforma: `isNative` frente a `isNativeAndroid` / `isNativeIOS`, y sin service worker en las apps

`src/lib/native/platform.ts` lee el objeto global `Capacitor` que inyecta el
WebView, en vez de importar `@capacitor/core`: cero bytes en la web. Tres
preguntas, cada una para lo suyo:

| Pregunta | Para qué |
|---|---|
| `isNative()` | Todo lo que comparten las dos apps: splash, barra de estado, cerrar el teclado al navegar, compartir, enlaces externos, no registrar el service worker, el plugin propio y la háptica |
| `isNativeAndroid()` | Sólo lo que no existe en iOS: el botón atrás (`backButton`/`exitApp`), los campos `channel*` y el permiso de alarma exacta |
| `isNativeIOS()` | Sólo lo que no existe en Android: deslizar para volver con una hoja abierta, la barra de accesorios del teclado y la barra de estado (sólo `setStyle`) |

La regla de siempre sigue en pie: **ninguna condición de plataforma fuera de
`src/lib/native/`** y de `NativeShell.tsx`, que es donde se enganchan los
efectos. Una pregunta de plataforma nueva se añade ahí.

**Sin service worker en las apps.** `UpdatePrompt.tsx` comprueba `isNative()`
y no registra nada, en Android y en iOS. Dentro de la app, un precaché seguiría
sirviendo los ficheros viejos después de que la tienda instalara una
actualización, y con `registerType: 'prompt'` esperaría a un botón que la
persona puede no ver nunca: actualizada por fuera, vieja por dentro, sin ningún
error. No se pierde nada: el código, el catálogo y las ilustraciones ya viajan
dentro de la app. Tampoco se enseña el consejo de instalar la PWA. La web sigue
exactamente igual.

## D45. El primer arranque, en el idioma del dispositivo

Una instalación **nueva** arranca en el idioma del dispositivo:
`pickLanguage(deviceLanguages())` (`src/lib/i18n/pickLanguage.ts`). Sólo cuenta
el primer idioma de la lista: `es` o cualquier `es-*` → español; todo lo demás
→ inglés. Un `['ca-ES', 'es-ES']` recibe inglés a propósito: no adivinamos qué
segundo idioma prefiere nadie; se cambia en Ajustes en un toque.

- **Sólo al crear los ajustes** (`src/lib/db/database.ts`). Una instalación que
  ya los tiene conserva el idioma que eligió; esto no le cambia nada a nadie.
- `App.tsx` usa la misma función para la pantalla de arranque, antes de que se
  hayan leído los ajustes, para que no haya un primer fotograma en el otro
  idioma.
- **Igual en web, Android e iOS**: los tres leen `navigator.languages` del
  navegador o del WebView. En iOS, `CFBundleLocalizations` declara `es` y `en`
  con sus `InfoPlist.strings`, para que los textos del sistema (el permiso de
  cámara) salgan también en uno de los dos.
- A partir de ahí manda D39: todo, también lo que pinta el sistema por la app
  (la notificación, la Live Activity, el aviso de descanso), en el idioma de la
  app. Lo único que sale en el idioma del teléfono son los diálogos del propio
  sistema.

Lo comprueba `tests/unit-lifecycle.ts`.
