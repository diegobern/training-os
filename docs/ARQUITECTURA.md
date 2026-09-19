# Requisitos de arquitectura de la ampliación

Decisiones vinculantes acordadas el 2026-09-16, antes de escribir código de la
fase 2. Sustituyen a cualquier supuesto anterior. Línea base: tag `pre-expansion`.

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

## D28. La verificación del correo es obligatoria

El correo no solo se pide: hay que demostrarlo. `needs-verification` es una
puerta, no un aviso, y **no existe ningún modo de saltársela**. Las únicas dos
salidas de esa pantalla son *Reenviar email* y *Cerrar sesión*: quien escribió
mal su dirección cierra sesión y se registra otra vez, no entra igualmente.

### Orden dentro de `resolve()`

La comprobación va **antes** de leer el perfil, antes de mirar de quién son los
datos locales y antes de sincronizar un solo byte. El orden importa, no solo la
presencia: más abajo, `resetLocalData()` borra los datos de este dispositivo
cuando la cuenta es nueva o de otra persona. Ejecutar eso para una sesión que
aún no ha demostrado su dirección sería destruir datos sobre la base de una
afirmación sin verificar. Una sesión sin verificar hace exactamente una cosa:
esperar.

### El recheck

`user.emailVerified` es lo que era cierto cuando se emitió el token de esta
pestaña. El enlace casi nunca se abre aquí —se abre en el móvil, o en otra
pestaña— y nada se lo cuenta a esta. Por eso:

- `resolve()` pregunta al servidor (`reload()` + `getIdToken(true)`) antes de
  enseñar la puerta, así una bandera caducada nunca bloquea a nadie;
- la pantalla reintenta cada 5 s y también cada vez que la pestaña recupera el
  foco, que es el caso habitual: verificas en la otra pestaña, vuelves, y ya ha
  seguido sola.

### El email se envía lo primero

Dentro de `signUp()`, `sendEmailVerification()` va justo después de crear la
cuenta, **antes** de reservar el nombre de usuario y de escribir el perfil. El
oyente de auth pone a la persona en la puerta en cuanto la cuenta existe, así
que desde ese instante lo único que espera es el correo; las dos llamadas a
Firestore reintentan durante mucho tiempo cuando el backend va lento, y enviar
por detrás de ellas significaba que la puerta podía estar en pantalla sin que
se hubiera enviado nada. Lo detectó `e2e/authgate.mjs`, no una revisión a ojo.

El envío no es fatal: la cuenta ya existe, así que un fallo se registra y se
recupera desde el botón *Reenviar*, no lanzando "error al registrarse" junto a
una cuenta que sí se creó.

### APIs de Firebase

Las oficiales, sin atajos: `sendEmailVerification(user, { url })` para enviar,
`applyActionCode(auth, oobCode)` en `/auth/verificado` cuando el enlace llega
con código, y `reload()` + `getIdToken(true)` + `user.emailVerified` para
comprobar. Nunca se confía en la bandera cacheada.

### Qué NO existe

`skipVerification` era un resto de la primera implementación —un botón
*Continuar sin verificar*— y está **eliminado**, no recreado. Que no vuelva lo
asegura una prueba: `e2e/authgate.mjs` falla si ese botón reaparece.

### Flujo completo

```
REGISTRO
  → sendEmailVerification()          (lo primero, antes de Firestore)
  → puerta needs-verification        (sin salida salvo reenviar o salir)
  → la persona abre el enlace        (normalmente en otro sitio)
  → recheck: reload() + getIdToken(true) + emailVerified
  → nombre de usuario, si la reserva falló al registrarse
  → onboarding (7 pasos)
  → app
```

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

## D30. La marca del menú es un WebP animado, no una tira con `steps()`

Giraba a tirones por dos motivos, y ninguno era el tamaño del fichero:

1. **Doce fotogramas en 7,2 s son 1,7 fps**, en saltos de 30°. Eso no es una
   animación, es un pase de diapositivas.
2. **El bucle no cerraba.** La tira se sacaba muestreando la animación real con
   un reloj de pared, y esa animación *suaviza* el giro y flota el tótem con
   periodos que no dividen una vuelta: el último fotograma no encajaba con el
   primero y saltaba una vez por vuelta.

Ahora el horneado **conduce** la escena en lugar de mirarla: el gancho
`__logoBake` —que solo existe mientras el script lo instala— pone el componente
en un plato giratorio puro y el script fija el ángulo de cada fotograma. Salen
96 fotogramas exactamente equiespaciados, que se codifican como **WebP animado**
(98 KB): un fichero que decodifica y temporiza el navegador, sin aritmética de
`steps()` que equivocar.

Un WebP animado no se puede pausar desde CSS, así que el modo sin animaciones
**carga otro fichero** (`nav-logo-still.webp`, 1,5 KB) en vez de intentar parar
el primero. No se precachea: son 100 KB que la pantalla de bienvenida no
enseña, y se guardan la primera vez que la barra los dibuja de verdad.

Lo comprueba `e2e/nav-logo-shot.mjs` midiendo la diferencia entre fotogramas
consecutivos: si vuelve a haber pares idénticos, o un salto desproporcionado
—la costura del bucle—, la prueba falla.
