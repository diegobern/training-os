# Auditoría del TRAINING OS actual

Estado en el checkpoint `pre-expansion` (`36b2fb9`). 102 archivos TS/TSX, 17.370
líneas en `src/`. Build limpio, 102/102 tests unitarios.

---

## 1. Esquema IndexedDB

`DB_NAME = 'training-os'`, `DB_VERSION = 2` (`src/lib/db/database.ts:17`).

| Store | keyPath | Índices | Sincronizado |
|---|---|---|---|
| `settings` | `id` (siempre `'app'`) | — | subconjunto, dentro del perfil |
| `meta` | `key` | — | no (guarda `activeSessionId`) |
| `exercises` | `id` | `by-muscle`, `by-name`, `by-custom` | sí |
| `routines` | `id` | `by-updated` | sí |
| `sessions` | `id` | `by-started`, `by-status` | sí |
| `exerciseLogs` | `id` = `${sessionId}:${exerciseId}` | `by-exercise`, `by-date`, `by-session`, `by-exercise-time` | sí |
| `personalRecords` | `id` | `by-exercise`, `by-achieved`, `by-exercise-type` | sí |
| `bodyweight` | `id` | `by-date` | sí |
| `measurements` | `id` | `by-date` | sí |
| `photos` | `id` | `by-date` | sí (el `blob` no: va a Storage) |
| `milestones` | `id` | `by-key` | sí |
| `syncQueue` | `id` = `${store}:${docId}` | `by-store`, `by-queued` | no, por construcción |
| `syncState` | `key` | — | no |

La migración es **aditiva e idempotente**: cada store se crea tras un
`if (!db.objectStoreNames.contains(...))` y `oldVersion` solo se registra en el log.

## 2. Esquema Firestore

```
users/{uid}                                  UserProfile
users/{uid}/exercises/{id}                   Exercise        + _syncedAt
users/{uid}/routines/{id}                    Routine         + _syncedAt
users/{uid}/sessions/{id}                    WorkoutSession  + _syncedAt
users/{uid}/exerciseLogs/{sessionId}:{exId}  ExerciseLog     + _syncedAt
users/{uid}/personalRecords/{id}             PersonalRecord  + _syncedAt
users/{uid}/bodyweight/{id}                  BodyweightEntry + _syncedAt
users/{uid}/measurements/{id}                MeasurementEntry+ _syncedAt
users/{uid}/milestones/{id}                  Milestone       + _syncedAt
users/{uid}/photos/{id}                      ProgressPhoto sin blob + _syncedAt
users/{uid}/tombstones/{store}_{docId}       { store, docId, _syncedAt }
usernames/{normalized}                       { uid, createdAt }   (no enumerable)

Storage: users/{uid}/photos/{id}.jpg , users/{uid}/avatar.jpg
```

`UserProfile` hoy: `uid, username, usernameNormalized, displayName, email,
photoURL, createdAt, updatedAt, schemaVersion, onboardingCompleted, goal,
trainingDaysPerWeek, settings`.

Las reglas usan un comodín `match /users/{uid}/{collection}/{docId}`, así que
**una subcolección nueva no requiere cambiar las reglas**.

Sincronización: outbox propio en `syncQueue` (guarda *intención*, no payload),
ids estables, tombstones para borrados entre dispositivos, pull incremental por
`_syncedAt`. Conflictos: última escritura gana, con prioridad local (un documento
con push pendiente no se sobreescribe desde el servidor).

## 3. Lo que ya existe

**Onboarding** — una sola pantalla (`src/routes/auth/Onboarding.tsx`, 103
líneas): unidades, objetivo (4 opciones), días por semana. Sin pasos, sin
atrás, sin progreso, sin reanudación. `Skip` marca igualmente el onboarding
como completado.

**i18n** — arquitectura sólida: mapa plano de 608 claves por idioma,
interpolación `{param}`, cambio de idioma reactivo e inmediato, preferencia
sincronizada en Firebase. Las dos tablas están **perfectamente simétricas**: 0
claves desparejadas. Las 446 claves usadas de forma estática existen todas.

**Ejercicios** — 69 entradas curadas en `src/lib/db/catalog.ts`, bilingües en
origen. `MuscleGroup` (12), `Equipment` (9), `ExerciseType`
(`compound|isolation|cardio|stretch`).

## 4. Hallazgos que condicionan la ampliación

Estos son los que hay que arreglar **antes** de construir encima, no después.

1. **`upgrade()` no puede añadir un índice a un store que ya existe.** El guard
   `contains()` salta el bloque entero, así que un `createIndex` nuevo solo se
   ejecutaría en instalaciones limpias. Hace falta una rama explícita
   `if (oldVersion < 3)` con el 4º argumento `transaction`, que hoy ni se
   declara.

2. **`seedLibraryIfEmpty` es todo o nada** (`if (count > 0) return 0`). Los
   ejercicios nuevos **nunca llegarían a los usuarios actuales**. Hace falta un
   sembrado por diferencia de slug.

3. **`isLogged()` es la única puerta** de todo el sistema: exige
   `completed && reps > 0 && weight !== null`. Una serie sin peso es invisible
   para volumen, e1RM, PRs, estadísticas y el coach. Cardio tiene que
   ramificar ahí primero.

4. **La biblioteca se congela en el idioma del primer arranque.** El catálogo es
   bilingüe pero `seedLibraryIfEmpty` colapsa a un solo idioma y guarda
   `name: string`. Cambiar a inglés deja todos los ejercicios en español. El
   comentario del propio archivo documenta un comportamiento que no existe.

5. **El onboarding no existe en modo local.** El flag vive solo en Firestore
   (`onboardingCompleted`), y `AuthGate` cortocircuita a la app en `local-only`.

6. **`SCHEMA_VERSION` solo se escribe, nunca se lee.** No hay rama de migración
   remota todavía.

7. **`Settings.onboarded` está muerto** (se escribe `false` y no se lee nunca).

8. **Bug real:** `TargetCard.tsx:88` tiene `units === 'kg' ? 'kg' : 'kg'` — las
   dos ramas devuelven lo mismo, así que en libras se muestra "kg".

9. Un store sincronizado nuevo exige tocar **cuatro** sitios:
   `SYNCED_COLLECTIONS`, el store de IndexedDB, `FIRST_WAVE`/`SECOND_WAVE` de
   `engine.ts`, y los arrays de `src/lib/backup.ts`. Si se olvida el tercero, el
   pull nunca lo trae; si se olvida el cuarto, no entra en export/import.

## 5. Strings sin traducir (resumen)

Los nodos de texto JSX están limpios. Las fugas están en props y en capas no-React:

- `aria-label` en chrome global: "Back" (todas las páginas), "Close" (todos los
  bottom sheets), "Reorder", "weight", "reps", "set N", "prev", "next".
- `NEW PR` y `WEIGHT UP` como texto visible a pantalla completa, más un plural
  `rep`/`reps` hecho a mano.
- Nombres de plantillas de rutina en inglés (`PUSH`, `PULL`, `LEGS`,
  `DAY 3`) que además **se persisten en los datos del usuario**.
- Errores crudos en inglés que llegan a la UI: `AuthGate` (todos los
  `AccountError`), `ErrorScreen`, import de backup.
- `demo.ts:88` mete una descripción en español a usuarios en inglés.
- `format.ts:41/75` usa `Intl.NumberFormat(undefined, …)`: locale del navegador,
  no de la app. Las fechas sí lo hacen bien.
- `index.html` y el manifest PWA: descripción y accesos directos solo en inglés.

## 6. Dataset externo

`yuhonas/free-exercise-db` — **Unlicense** (dominio público), verificado
descargando `LICENSE.md` el 2026-09-16. 876 ejercicios, 1746 imágenes.

Campos: `id, name, force, level, mechanic, equipment, primaryMuscles,
secondaryMuscles, instructions, category, images`.

Dos límites reales:

- **Las instrucciones son solo en inglés.** No hay español en el dataset. No voy
  a traducir automáticamente 4.000+ líneas y presentarlo como contenido revisado.
- **Las imágenes pesan entre 38 y 73 KB cada una**, ~60-90 MB en total. No pueden
  ir en el bundle de una PWA.


---

## 7. Decisiones de arquitectura (2026-09-16)

Tras esta auditoría se fijaron 23 requisitos vinculantes, recogidos en
[`ARQUITECTURA.md`](./ARQUITECTURA.md). El que más cambia el diseño:

**El catálogo de 876 ejercicios NO se duplica en `users/{uid}/exercises`.** Es un
JSON estático versionado, de solo lectura, servido con la web. Los datos del
usuario (ejercicios propios, favoritos, notas, ajustes) van aparte y son lo
único que sincroniza. Sin eso, cada cuenta nueva habrían sido 876 escrituras en
Firestore y cada login en un dispositivo nuevo, 876 lecturas.
