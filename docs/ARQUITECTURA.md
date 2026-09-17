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
