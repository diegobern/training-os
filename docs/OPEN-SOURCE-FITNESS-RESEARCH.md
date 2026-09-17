# TRAINING OS — Investigación de fuentes open source y datasets de fitness

> **Verificación independiente (2026-09-16).** Las conclusiones sobre licencias
> de este informe se han vuelto a comprobar contra las fuentes primarias, una
> por una, descargando los ficheros. Resultado:
>
> | Comprobación | Resultado |
> |---|---|
> | `yuhonas/free-exercise-db` → `LICENSE.md` | Unlicense, texto íntegro. **Confirmado** |
> | Su README, ¿declara el origen de las fotos? | **No dice nada.** Solo que los datos vienen de `wrkout/exercises.json` |
> | `wrkout/exercises.json` → `LICENSE` | **HTTP 404 — no existe fichero de licencia** |
> | README de `wrkout/exercises.json` | Se llama "Open Public Domain" pero **anuncia un producto comercial** (wrkout.xyz) con "10.000+ imágenes" |
> | `bryllim/workout-guide` → `LICENSE` | **MIT**, pero cubre el código. El README declara que el arte viene de Everkinetic bajo CC BY-SA 4.0 |
> | `everkinetic/data` → `LICENSE.md` (rama `main`) | **CC BY-SA 4.0**, texto íntegro. **Confirmado** |
>
> Es decir: el hallazgo principal del informe se sostiene. El **texto** de
> free-exercise-db es seguro; las **fotografías** carecen de cadena de derechos
> comprobable y su origen aparente vende imágenes comercialmente.


**Fecha de la investigación:** 2026-09-16
**Contexto:** PWA de seguimiento de entrenamiento con **intención comercial** (producto de pago / con ánimo de lucro).
**Objetivo:** identificar qué datos, imágenes y modelos de datos reales podemos reutilizar legalmente, cuáles solo sirven como referencia conceptual, y cuáles hay que descartar.

---

## 0. Metodología y nivel de verificación

Cada licencia se ha comprobado de una de estas formas, todas el **2026-09-16**:

| Método | Descripción | Fiabilidad |
|---|---|---|
| **A — fichero LICENSE crudo** | `GET https://raw.githubusercontent.com/<repo>/<rama>/LICENSE*` y lectura del texto | Alta |
| **B — declaración en el propio código/manifiesto** | `pyproject.toml`, `package.json`, modelos Django, fixtures | Alta |
| **C — barra lateral de GitHub** | lectura de la página `github.com/<repo>` | Media (etiqueta automática de GitHub) |
| **D — README del proyecto** | declaración del autor | Media (es una *afirmación*, no una prueba de titularidad) |
| **E — no verificado** | no se pudo comprobar en esta sesión | Ninguna |

**Limitaciones conocidas de esta investigación (importantes):**

- La **API de GitHub** no era accesible desde este entorno, por lo que **no se pudo obtener la fecha exacta del último commit** de la mayoría de repos. Donde no hay prueba, se escribe **"no verificado"** y se usa evidencia indirecta fechable (año del copyright del LICENSE, versión publicada en CHANGELOG, versiones calendario de dependencias).
- Las **estrellas/forks** proceden de la barra lateral de GitHub leída el 2026-09-16. Son una señal **secundaria** y no se usan como criterio de decisión.
- La **API pública de wger** (`wger.de/api/v2/`) está bloqueada por `robots.txt` y por protección anti-bot (Anubis), así que el modelo de licencias por entrada se ha verificado **leyendo el código fuente de wger**, que es una fuente más fuerte que la API.
- **Wikimedia Commons** no era accesible desde este entorno; su entrada va marcada explícitamente como no verificada.

> **Advertencia transversal que atraviesa todo el documento:** una licencia declarada por un repositorio solo es válida **en la medida en que quien la declara sea el titular de los derechos**. Esto es especialmente crítico con **imágenes y vídeos**, donde varios proyectos "libres" redistribuyen media de terceros. Ver la sección *OPEN QUESTIONS / RIESGOS*.

---

## 1. Datasets de ejercicios (metadatos: nombre, músculos, equipamiento, instrucciones)

### 1.1 yuhonas/free-exercise-db

- **repository:** https://github.com/yuhonas/free-exercise-db
- **stars / activity (señal secundaria):** 1.9k estrellas, 488 forks (barra lateral GitHub, 2026-09-16)
- **last meaningful activity:** **no verificado**. El repo tiene CI activo (workflow "Test, Lint & Deploy Site to Github Pages") y los ficheros `dist/` se sirven correctamente, pero no se pudo obtener la fecha del último commit.
- **data available:** **876 ejercicios** (recuento propio sobre `dist/exercises.json` descargado el 2026-09-16). Campos exactos: `id`, `name`, `force`, `level`, `mechanic`, `equipment`, `primaryMuscles`, `secondaryMuscles`, `instructions` (array de pasos), `category`, `images`. Categorías verificadas: strength 584, stretching 123, plyometrics 61, powerlifting 38, olympic weightlifting 35, strongman 21, cardio 14. 12 valores de `equipment` (`bands`, `barbell`, `body only`, `cable`, `dumbbell`, `e-z curl bar`, `exercise ball`, `foam roll`, `kettlebells`, `machine`, `medicine ball`, `other`). **No existe campo `language`**: es monolingüe en inglés.
- **media available:** **1746 referencias a imágenes** (recuento propio), fotografías JPG, típicamente 2 por ejercicio (posición inicial / final). Solo 3 ejercicios sin imagen. Servibles vía `raw.githubusercontent.com`.
- **license:** **Unlicense** (dedicación al dominio público). **Verificado por método A:** `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/LICENSE.md` devuelve HTTP 200 con el texto íntegro de The Unlicense ("This is free and unencumbered software released into the public domain… for any purpose, commercial or non-commercial"), 2026-09-16. Confirmado también por la barra lateral de GitHub (método C). **Ojo:** el fichero se llama `LICENSE.md`, no `LICENSE`.
- **commercial reuse implications:**
  - Para los **metadatos y las instrucciones en texto**: Unlicense es una renuncia al dominio público sin obligación de atribución ni de compartir. Uso comercial, modificación, traducción y redistribución **sin restricciones**. Es la licencia más limpia de todo este informe.
  - Para las **imágenes**: aquí está el problema real. El README **no documenta la procedencia de las fotografías**. El propio README declara que el dataset deriva de [wrkout/exercises.json](https://github.com/wrkout/exercises.json), cuyo README a su vez apunta a un producto **comercial** (wrkout.xyz) con "10.000+ imágenes". Existen al menos tres issues públicos preguntando exactamente esto: [#2](https://github.com/yuhonas/free-exercise-db/issues/2) (abierto 2023-06-13, cerrado), [#12](https://github.com/yuhonas/free-exercise-db/issues/12) (abierto 2024-03-31, cerrado) y [#13](https://github.com/yuhonas/free-exercise-db/issues/13). En las páginas que se pudieron leer **no aparece ninguna respuesta pública del mantenedor que aclare el origen ni la titularidad de las fotos**. Una dedicación Unlicense hecha por quien no es titular **no transfiere nada**.
  - Conclusión práctica: el texto es seguro; las fotos son un riesgo abierto, no cerrado.
- **what we could use:** todo el JSON de metadatos como **base canónica del catálogo de ejercicios de TRAINING OS** (nombres, músculo primario/secundario, equipamiento, nivel, mecánica, fuerza push/pull, categoría). También las `instructions` en inglés como material base para **traducir al español nosotros mismos** (Unlicense permite obras derivadas sin share-alike).
- **what we should NOT copy:** **las 1746 fotografías**, hasta que un abogado confirme la titularidad. Tampoco conviene depender de `raw.githubusercontent.com` como CDN en producción (no es un CDN con SLA y GitHub lo prohíbe como hosting de producción en sus Terms).

### 1.2 wger-project/wger (capa de datos)

- **repository:** https://github.com/wger-project/wger
- **stars / activity (señal secundaria):** 6.8k estrellas, 1.0k forks (barra lateral GitHub, 2026-09-16)
- **last meaningful activity:** **activo en 2026** (evidencia indirecta verificada): el `CHANGELOG.md` de `master` documenta cambios pendientes para la próxima release, incluidos *breaking changes* de API (`POST /api/v2/exercise/` ahora requiere permiso `add_exercise`; los usuarios normales deben usar `/api/v2/exercise-submission/`), y `pyproject.toml` fija `django-filter~=26.1` (versionado calendario de 2026). Fecha exacta del último commit: **no verificada**.
- **data available:** modelo de datos de ejercicios muy superior al de free-exercise-db, verificado leyendo el código:
  - `Exercise` (`wger/exercises/models/base.py`): `uuid`, `category` (FK), `muscles` (M2M), `muscles_secondary` (M2M), `equipment` (M2M), `variation_group`, `created`, `last_update`.
  - `Translation` (`wger/exercises/models/translation.py`): `name`, `description`, `description_source`, `language` (FK), `uuid`, `exercise` (FK). **Una fila por idioma y ejercicio**, con validación de que el idioma detectado del texto coincide con el declarado.
  - Idiomas: el fixture `wger/core/fixtures/languages.json` incluye **`es` / "Español" (pk 4)** — verificado.
  - Además: `ExerciseImage`, `ExerciseVideo`, `ExerciseComment`, `ExerciseAlias`, `Muscle`, `ExerciseCategory`, `Equipment`, `DeletionLog`, e historial de ediciones (`simple_history`) con `author_history`.
  - **Número total de ejercicios y número de traducciones al español: no verificado** (la API pública está bloqueada por robots.txt/anti-bot).
- **media available:** imágenes y vídeos subidos por la comunidad, **cada uno con su propia licencia** (ver abajo). `ExerciseImage` tiene además `is_ai_generated` (bool) y `style` con opciones `Line` / `3D` / `Low-poly` / `Photo` / `Other` — útil para filtrar por coherencia visual.
- **license:** **doble licencia, verificada por método A + B + D:**
  - **Código de la aplicación: `AGPL-3.0-or-later`.** Verificado leyendo `https://raw.githubusercontent.com/wger-project/wger/master/LICENSE.txt` (texto íntegro de la GNU AGPL v3) y el `README.md`, sección *License*: `* Application Code: AGPL-3.0-or-later`. Confirmado por la barra lateral de GitHub ("AGPL-3.0").
  - **Datos de ejercicios/ingredientes: Creative Commons, *variable por entrada*.** El README lo dice literalmente: `* Exercise/Ingredient Data: Creative Commons (see individual entries)`.
  - **Documentación: `CC-BY-SA-4.0`.**
- **commercial reuse implications — análisis detallado (esto era la pregunta clave):**

  **(a) ¿Hasta dónde llega el copyleft del AGPL?**
  La AGPL-3.0 es una licencia **de software**. Cubre el *código fuente* de wger (Python/Django, frontend, migraciones, serializers). **No convierte automáticamente en AGPL los datos almacenados en la base de datos** — por eso el propio proyecto separa explícitamente ambas licencias en su README. Consecuencias concretas para TRAINING OS:
  - Si copiásemos código de wger (modelos, serializers, vistas, migraciones) dentro de TRAINING OS, TRAINING OS pasaría a ser una obra derivada bajo AGPL. Y como es una PWA servida por red, se activaría el **artículo 13 de la AGPL**: habría que ofrecer el *Corresponding Source* completo a todos los usuarios que interactúen con el servicio. Eso es **incompatible con un producto comercial cerrado**.
  - Leer el código de wger para **entender** cómo se modela un ejercicio y después escribir nuestra propia implementación **no** crea una obra derivada: el copyright protege la expresión, no las ideas ni los esquemas funcionales de datos. Pero esto es una línea fina (ver *RIESGOS*).
  - Consumir la **API HTTP pública** de wger desde un cliente independiente no convierte, en la interpretación mayoritaria, al cliente en obra derivada del servidor. **Pero lo que se descarga son datos con licencia CC, y esos sí obligan.**

  **(b) ¿Qué significa "Creative Commons, ver cada entrada" en la práctica?**
  Verificado en el código fuente, no en la documentación. wger implementa una clase abstracta `AbstractLicenseModel` (`wger/utils/models.py`) que **añade metadatos de licencia a cada objeto individual**, siguiendo el esquema **TASL** (Title – Author – Source – License) recomendado por Creative Commons. Sus campos son:

  | Campo | Significado |
  |---|---|
  | `license` | FK al modelo `License` (`full_name`, `short_name`, `url`) |
  | `license_title` | título original de la obra |
  | `license_object_url` | enlace al objeto original |
  | `license_author` | autor / fuente |
  | `license_author_url` | perfil del autor |
  | `license_derivative_source_url` | origen, si es una obra derivada |

  **Los modelos que heredan esta clase son cuatro, cada uno con licencia independiente** (verificado leyendo el código): `Exercise`, `Translation`, `ExerciseImage` y `ExerciseVideo`. Es decir: **un mismo ejercicio puede tener el metadato bajo una licencia, la traducción al español bajo otra, y cada imagen bajo una tercera.**

  El catálogo de licencias posibles está en el fixture `wger/core/fixtures/licenses.json` (verificado, método A):

  | pk | short_name | full_name |
  |---|---|---|
  | 1 | CC-BY-SA 3 | Creative Commons Attribution Share Alike 3 |
  | 2 | CC-BY-SA 4 | Creative Commons Attribution Share Alike 4 |
  | 3 | CC0 | Creative Commons Public Domain 1.0 |
  | 4 | CC-BY 4 | Creative Commons Attribution 4 |
  | 5 | ODbL | Open Data Commons Open Database License |

  La **licencia por defecto es CC-BY-SA 4.0** (`CC_BY_SA_4_LICENSE_ID = 2` en `wger/utils/constants.py`, usado como `default=` en el FK). Es decir: **salvo que el contribuidor elija otra cosa, la entrada es share-alike.**

  **(c) ¿Cómo se expone la licencia por entrada en la API?**
  Verificado leyendo `wger/exercises/api/serializers.py`: los seis campos de licencia (`license`, `license_title`, `license_object_url`, `license_author`, `license_author_url`, `license_derivative_source_url`) se serializan explícitamente en `ExerciseImageSerializer`, `ExerciseVideoSerializer`, `ExerciseVideoInfoSerializer` y `ExerciseTranslationInfoSerializer`. `ExerciseSerializer` expone al menos `license_author`. Además existe el modelo `License` como recurso propio. **Conclusión: sí, la licencia por entrada es consultable programáticamente; es técnicamente posible filtrar el dataset por licencia antes de ingerirlo.**

  **(d) Qué obligan en la práctica CC-BY y CC-BY-SA:**
  - **CC-BY 4.0:** hay que dar crédito razonable — título, autor, fuente y enlace a la licencia — e **indicar si se han hecho cambios**. Compatible con producto comercial y cerrado, pero exige **UI de atribución por ejercicio**, no un aviso genérico al pie.
  - **CC0:** sin obligaciones. Es la única categoría de wger que podríamos ingerir sin fricción.
  - **CC-BY-SA 3.0 / 4.0:** todo lo de CC-BY **más ShareAlike**: cualquier *adaptación* debe publicarse bajo la misma licencia (o una compatible). Dos matices que nos afectan directamente:
    - Incluir descripciones CC-BY-SA **sin modificarlas**, junto a nuestro propio contenido, se parece más a una *colección* que a una *adaptación*; en CC 4.0 una colección no obliga a relicenciar el resto de la obra. Pero esa distinción es jurídica, no técnica.
    - **Traducir una descripción CC-BY-SA al español SÍ es una adaptación.** Nuestras traducciones al español de contenido wger CC-BY-SA tendrían que publicarse bajo CC-BY-SA. Eso significa **regalar nuestro trabajo de localización**, que es precisamente uno de los diferenciales del producto.
  - **ODbL:** licencia de bases de datos con share-alike sobre "bases de datos derivadas" y cláusula anti-DRM. Su interacción con una app comercial es la más incierta de las cinco. Marcada como cuestión para abogado.
- **what we could use:**
  1. El **modelo de datos como referencia conceptual**: la separación `Exercise` (lenguaje-agnóstico) / `Translation` (por idioma) es claramente el diseño correcto para un producto multilingüe y deberíamos adoptar ese *patrón* (reimplementado, no copiado).
  2. El **esquema TASL de atribución por entrada** como patrón para nuestra propia trazabilidad de procedencia, incluso para datos que no vengan de wger. Es buena higiene legal.
  3. Potencialmente, **solo las entradas marcadas CC0** (pk 3), previa verificación entrada a entrada vía API.
- **what we should NOT copy:**
  - **Nada del código AGPL** dentro de TRAINING OS: ni modelos, ni serializers, ni migraciones, ni fixtures de código. Riesgo de contaminación del producto entero.
  - **Ingesta masiva e indiscriminada del dataset de ejercicios.** Al ser la licencia por defecto CC-BY-SA 4.0, una ingesta "de todo" arrastra share-alike sobre nuestras traducciones.
  - Las **imágenes y vídeos de wger** sin auditar entrada a entrada: son aportaciones de comunidad con procedencia heterogénea.

### 1.3 wrkout/exercises.json

- **repository:** https://github.com/wrkout/exercises.json
- **stars / activity:** 632 estrellas, 172 forks (GitHub, 2026-09-16)
- **last meaningful activity:** **no verificado.** Es el dataset **antecesor** de free-exercise-db (así lo declara el README de yuhonas), por lo que muy probablemente esté menos mantenido; no se pudo confirmar.
- **data available:** dataset de ejercicios en JSON, misma familia de campos que free-exercise-db pero con estructura menos normalizada (yuhonas lo reestructuró precisamente por eso). Incluye scripts para generar JSON y una base PostgreSQL.
- **media available:** imágenes en el repo. El README distingue explícitamente el repo abierto del producto **comercial** wrkout.xyz, que anuncia "2.500+ ejercicios, 10.000+ imágenes y 3.500+ vídeos".
- **license:** **Unlicense.** **Verificado por método A:** `https://raw.githubusercontent.com/wrkout/exercises.json/master/LICENSE.md` → HTTP 200, texto íntegro de The Unlicense, 2026-09-16. Confirmado por barra lateral GitHub.
- **commercial reuse implications:** idénticas a free-exercise-db para el texto (dominio público, sin obligaciones). Para las imágenes, **el riesgo es aún más visible aquí**: el mismo README enlaza a un producto comercial de pago del mismo autor con un corpus de imágenes mucho mayor, lo que sugiere que las imágenes del repo abierto son un subconjunto de un activo comercial. Eso no invalida la dedicación, pero sí obliga a preguntarse de dónde salieron originalmente.
- **what we could use:** **casi nada de forma directa** — free-exercise-db ya es su versión limpia y normalizada. Sirve como **prueba documental de la cadena de procedencia** de free-exercise-db, útil para el análisis legal.
- **what we should NOT copy:** las imágenes. Y no ingerir este JSON en lugar del de yuhonas: es la versión peor estructurada del mismo dato.

### 1.4 exercemus/exercises

- **repository:** https://github.com/exercemus/exercises
- **stars / activity:** 50 estrellas, 11 forks (GitHub, 2026-09-16)
- **last meaningful activity:** **no verificado.** El `LICENSE` dice "Copyright (c) 2022 exercemus", lo que sitúa el inicio del proyecto en 2022; no hay evidencia verificable de actividad reciente.
- **data available:** **872 ejercicios** (recuento propio sobre `exercises.json` de `main` y sobre `minified-exercises.json` de la rama `minified`, ambos descargados el 2026-09-16). Esquema declarado en el README: `category`, `name`, `aliases`, `description`, `instructions`, `tips`, `equipment`, `primary_muscles`, `secondary_muscles`, `tempo`, `images`, `video`, `variation_on`, más `license_author` y `license` (mapa con `full_name`/`short_name`/`url`). Incluye taxonomías top-level (`categories`, `equipment`, `muscles`, `muscle_groups`). El campo `tempo` (ej. `3-1-1-0`) y `variations_on` son valiosos y poco habituales.
- **media available:** **ninguna en la práctica.** Recuento propio: **0 de 872 ejercicios tienen `images`**; solo **24 tienen `video`** (enlaces embebibles de YouTube, no media propia).
- **license:** **MIT para el código.** **Verificado por método A:** `https://raw.githubusercontent.com/exercemus/exercises/main/LICENSE` → HTTP 200, texto MIT, "Copyright (c) 2022 exercemus", 2026-09-16. Confirmado por barra lateral GitHub.
- **commercial reuse implications — hallazgo crítico:**
  El README es explícito y honesto: *"All code in this repository is under the MIT License… However, all exercises in this repository have a license associated with them that you must follow… this typically involves just displaying the author, license, and link to the license alongside each exercise."* Es decir, MIT **no cubre los datos**.
  **Pero al inspeccionar los datos reales, esos metadatos de licencia no existen.** Recuento propio sobre ambas ramas, 2026-09-16: de 872 ejercicios, **871 tienen el campo `license` vacío** y solo **1** declara `CC-BY-SA 3`. `license_author` está presente en ese mismo único registro.
  Traducción práctica: el dataset se compone declaradamente de datos importados de wger.de (licencias CC variables) y de exercises.json (Unlicense), **pero ha perdido la trazabilidad de qué entrada viene de dónde**. Es imposible cumplir la obligación de atribución que el propio README impone, porque el dato necesario no está.
- **what we could use:** el **diseño del esquema** (especialmente `tempo`, `aliases`, `tips`, `variation_on`) como inspiración para nuestro modelo. Nada más, salvo que se reconstruya la procedencia entrada a entrada.
- **what we should NOT copy:** **el dataset en bloque.** Es exactamente el escenario de riesgo que hay que evitar: contenido de procedencia CC mezclada, con la metadata de licencia perdida, bajo un paraguas MIT que no le corresponde. Ingerirlo sería heredar una deuda legal no auditable.

### 1.5 rthepen/workout-database

- **repository:** https://github.com/rthepen/workout-database
- **stars / activity:** **1 estrella, 0 forks** (GitHub, 2026-09-16). Señal de adopción prácticamente nula.
- **last meaningful activity:** **2026** (evidencia verificada: `LICENSE` dice "Copyright (c) 2026 rthepen & Open-Source Workout Database Contributors"; la página indica 675 commits en `main`). Fecha exacta del último commit: **no verificada**.
- **data available:** 630 ejercicios (según badge del README). Esquema JSON Schema Draft-07 estricto, con 29 músculos anatómicos estandarizados, `difficulty`, `mechanics` (compound/isolation/isometric), `force` (push/pull/isometric/dynamic) y — muy relevante para nosotros — **`tracking mode`** (`reps_only`, `reps_and_weight`, `time_only`, `distance`). Nombres, categorías, descripciones, instrucciones y *coaching cues* localizados. Distribución vía `dist/all_exercises.json`.
- **media available:** **ninguna propia.** Solo enlaces a YouTube con sistema de *fallback* por prioridad (`youtube_id`, `type: standard|short`, `priority`, `start_seconds`, `language`).
- **license:** **MIT.** **Verificado por método A:** `https://raw.githubusercontent.com/rthepen/workout-database/main/LICENSE` → HTTP 200, texto MIT, "Copyright (c) 2026", 2026-09-16.
- **commercial reuse implications:** MIT es permisiva y apta para uso comercial cerrado; solo exige conservar el aviso de copyright y la licencia. **Pero:** (a) los **vídeos de YouTube no están licenciados por este MIT** — son obras de terceros y su uso se rige por los Términos de YouTube y por el copyright de cada canal; (b) el dataset es nuevo, de un solo autor, con 1 estrella y sin comunidad — **no hay revisión externa de la procedencia de sus textos**; (c) **los idiomas son inglés y neerlandés: NO incluye español.**
- **what we could use:** el **`tracking_mode`** es un concepto que deberíamos adoptar en nuestro modelo (determina qué inputs mostrar al usuario: reps, reps+peso, tiempo, distancia). El JSON Schema Draft-07 es un buen ejemplo de validación estricta.
- **what we should NOT copy:** los enlaces de vídeo como si fueran contenido licenciado. Y no lo usaría como fuente primaria de metadatos frente a free-exercise-db: menos ejercicios, cero adopción, procedencia de los textos no auditada.

---

## 2. Imágenes / ilustraciones / animaciones de ejercicios

### 2.1 everkinetic/data

- **repository:** https://github.com/everkinetic/data
- **stars / activity:** 122 estrellas, 50 forks (GitHub, 2026-09-16). La página indica 22 commits, 2 issues abiertos, 2 PRs.
- **last meaningful activity:** **no verificado.** El proyecto se describe como "Open data project based on http://everkinetic.com created by Greg Priday"; el sitio everkinetic.com llevaba caído ya en 2013 según terceros. Bajo volumen de commits.
- **data available:** `exercises.json` y `map.json` con metadatos de ejercicios, más directorios `dist`, `scripts`, `src`.
- **media available:** **ilustraciones de poses de ejercicio** — es la fuente de ilustración libre más reutilizada del ecosistema fitness open source. Es el origen del arte de [bryllim/workout-guide](https://github.com/bryllim/workout-guide) y de [chaosbastler/opentraining-exercises](https://github.com/chaosbastler/opentraining-exercises), y una parte está también en Wikimedia Commons.
- **license:** **CC-BY-SA-4.0.** **Verificado por método A:** `https://raw.githubusercontent.com/everkinetic/data/main/LICENSE.md` → HTTP 200, 18.578 bytes con el texto íntegro de "Creative Commons Attribution-ShareAlike 4.0 International", 2026-09-16. Confirmado por barra lateral GitHub ("CC-BY-SA-4.0").
- **commercial reuse implications:**
  - CC-BY-SA **permite el uso comercial**. No hay problema en usar estas ilustraciones en una app de pago.
  - Obliga a: **atribución completa** (título, autor "Everkinetic", fuente, enlace a la licencia CC-BY-SA 4.0), indicación de cambios, y **ShareAlike sobre las adaptaciones**.
  - **Qué cuenta como adaptación aquí:** recortar, recolorear, re-estilizar o convertir las ilustraciones para encajar con el sistema de diseño de TRAINING OS produce **obra adaptada**, y esas versiones adaptadas deberían distribuirse bajo CC-BY-SA 4.0. Usarlas **sin modificar**, junto a nuestro contenido, se acerca más a una colección y no arrastraría el resto de la app — pero esa distinción es jurídica.
  - CC-BY-SA **no** exige abrir nuestro código. El copyleft de CC es sobre la obra creativa, no sobre el software que la muestra. Esta es una diferencia fundamental con AGPL.
- **what we could use:** las ilustraciones como **base visual del catálogo**, especialmente si las usamos **sin modificar** y con una pantalla de atribución. Es la única fuente de imagen de este informe cuya licencia está verificada en el fichero y cuyo titular declarado es coherente con el origen del arte.
- **what we should NOT copy:** los metadatos de `exercises.json` (free-exercise-db es mejor y sin obligaciones). Y no conviene **derivar** versiones estilizadas propias sin asumir que habrá que publicarlas CC-BY-SA.

### 2.2 bryllim/workout-guide

- **repository:** https://github.com/bryllim/workout-guide
- **stars / activity:** **8 estrellas, 4 forks** (GitHub, 2026-09-16). Adopción muy baja.
- **last meaningful activity:** **2026** (verificado: `LICENSE` dice "Copyright (c) 2026 Bryl Lim"). Fecha exacta del último commit: **no verificada**.
- **data available:** manifiesto canónico con metadatos estructurados de **302 ejercicios**, más API tipada en un paquete npm (`@bryllim/workout-guide`) con `getExercise()`, `searchExercises()`, `getAssetUrl()`.
- **media available:** **906 SVG transparentes de 512×512** (3 fotogramas consistentes por ejercicio × 302 ejercicios), con PNG de origen conservados. Galería estática navegable. Este es **exactamente el formato que necesita una PWA**: vectorial, transparente, ligero, escalable, y con fotogramas que permiten animar la ejecución.
- **license:** **doble, verificada por método A + D:** código y documentación **MIT** (`https://raw.githubusercontent.com/bryllim/workout-guide/main/LICENSE` → HTTP 200, texto MIT "Copyright (c) 2026 Bryl Lim", 2026-09-16); **assets visuales CC-BY-SA-4.0** (declarado en el README: *"Code and documentation are available under the MIT License. Visual assets are licensed under CC BY-SA 4.0"*, con ficheros `LICENSE-ASSETS`, `LICENSES.md` y `ATTRIBUTION.md` referenciados). **El contenido de `LICENSE-ASSETS` y `ATTRIBUTION.md` no se ha leído en esta sesión — pendiente de verificación directa.**
- **commercial reuse implications:**
  - La cadena de derechos es **coherente y declarada**: el README dice literalmente *"The original pose artwork used by this project comes from Everkinetic under CC BY-SA 4.0"*, y Bryl Lim publica su trabajo derivado bajo la misma CC-BY-SA 4.0. **Eso es exactamente lo que ShareAlike exige** — es una señal de cumplimiento, no de riesgo.
  - Obligaciones para nosotros: atribución a **ambos** (Everkinetic como origen, Bryl Lim como adaptador), enlace a CC-BY-SA 4.0, indicación de cambios, y ShareAlike si adaptamos.
  - El paquete npm es MIT, así que **integrar el código del paquete** no tiene fricción; la obligación recae sobre los SVG.
  - Señal externa de credibilidad: el proyecto [open-repset](https://github.com/oscarmiranda90/open-repset) recomienda explícitamente en su README **Workout Guide (CC BY-SA 4.0)** y **Free Exercise DB (Unlicense)** como las dos alternativas open source para forks que necesiten ilustraciones — la misma conclusión a la que llega este informe de forma independiente.
- **what we could use:** **los 906 SVG como capa visual principal de TRAINING OS**, usados sin modificar, más el paquete npm MIT para resolverlos. Es la mejor combinación de calidad técnica y limpieza jurídica del informe.
- **what we should NOT copy:** no re-estilizar los SVG (colores de marca, grosores de línea) sin asumir ShareAlike sobre las versiones resultantes. Y hay que **verificar la cobertura**: 302 ejercicios frente a los 876 de free-exercise-db significa que **más de la mitad de nuestro catálogo se quedaría sin ilustración**.

### 2.3 yuhonas/free-exercise-db (capa de imagen)

- **repository:** https://github.com/yuhonas/free-exercise-db
- **stars / activity:** 1.9k estrellas, 488 forks (GitHub, 2026-09-16)
- **last meaningful activity:** **no verificado** (ver 1.1)
- **data available:** ver 1.1
- **media available:** **1746 fotografías JPG** (recuento propio), ~2 por ejercicio, cobertura casi total (solo 3 ejercicios sin imagen). Fotografías reales, no ilustraciones.
- **license:** **Unlicense** aplicada al repositorio completo. **Verificado por método A** sobre `LICENSE.md`, 2026-09-16 (ver 1.1).
- **commercial reuse implications:** **la licencia declarada permite todo, pero la titularidad no está acreditada.** Ver el análisis de procedencia en 1.1: README sin declaración de origen de las fotos, linaje documentado hacia un producto comercial (wrkout.xyz), e issues públicos [#2](https://github.com/yuhonas/free-exercise-db/issues/2), [#12](https://github.com/yuhonas/free-exercise-db/issues/12) y [#13](https://github.com/yuhonas/free-exercise-db/issues/13) preguntando por el copyright de las imágenes, cerrados sin respuesta pública visible. Para un producto comercial con ingresos, esto es exposición real: el riesgo no es el coste de licencia, es una reclamación de un banco de imágenes.
- **what we could use:** **nada de la capa de imagen**, salvo que un abogado obtenga confirmación del mantenedor sobre el origen y la titularidad.
- **what we should NOT copy:** las 1746 fotografías. Es el punto donde "Unlicense" da una falsa sensación de seguridad.

### 2.4 chaosbastler/opentraining-exercises

- **repository:** https://github.com/chaosbastler/opentraining-exercises
- **stars / activity:** 28 estrellas, 13 forks (GitHub, 2026-09-16). Adopción baja.
- **last meaningful activity:** **no verificado.** Indicios de antigüedad: el README dice que el sitio de Everkinetic "está caído" y describe la conversión manual de GIF/PNG a SVG. Sin señales de mantenimiento reciente.
- **data available:** ficheros XML por ejercicio con metadatos (`ExerciseType name=...`), músculos y equipamiento. **Los nombres de músculos y equipamiento están en alemán** ("Brustmuskel", "Bauchmuskeln", "Trizeps", "Langhantel", "Kurzhantel", "Swiss Ball") y el README indica explícitamente que esos metadatos **no tienen traducción/i18n**. **No hay español.** Volumen aproximado: ~50+ ficheros XML (lectura de la página, no recuento exacto).
- **media available:** imágenes originalmente GIF/PNG **reconvertidas a SVG** por el mantenedor, típicamente 2 por ejercicio (inicio/fin).
- **license:** **CC-BY-SA 3.0 Unported.** **Verificado por método D (README), NO por fichero LICENSE:** no existe fichero `LICENSE`/`LICENSE.md`/`COPYING` en la raíz de `main` ni de `master` — se comprobaron las cinco variantes habituales y todas devuelven HTTP 404 (2026-09-16). La licencia solo consta como texto en el README: *"Currently all images are under a Creative Commons Attribution-ShareAlike 3.0 Unported license. Author/source is http://everkinetic.com/, Everkinetic."* Cada XML incluye además su propio `imageLicenseText`. **Estado: licencia declarada pero no formalizada en el repositorio.**
- **commercial reuse implications:** CC-BY-SA **3.0**, no 4.0 — no son intercambiables. La 3.0 permite distribuir adaptaciones bajo una versión posterior de la misma licencia, pero la mecánica exacta de compatibilidad 3.0 → 4.0 es una cuestión jurídica, no de ingeniería. Además, al ser el **mismo arte de Everkinetic** pero declarado bajo una versión distinta de la licencia, tendríamos dos regímenes para el mismo material si lo mezcláramos con 2.1/2.2.
- **what we could use:** **nada que no obtengamos mejor de bryllim/workout-guide o everkinetic/data**, que son la misma fuente artística con licencia verificada en fichero y en versión 4.0.
- **what we should NOT copy:** los SVG desde aquí (usar la cadena 4.0), y desde luego no los metadatos en alemán.

---

## 3. Vídeos de ejercicios

> **Conclusión anticipada de esta categoría: no existe un corpus de vídeo de ejercicios con licencia abierta verificable y cobertura suficiente.** Todas las opciones son o bien media de terceros con licencia propietaria, o bien enlaces a YouTube, o bien colecciones dispersas. Esto es un hallazgo, no una omisión.

### 3.1 wger — `ExerciseVideo`

- **repository:** https://github.com/wger-project/wger
- **stars / activity:** 6.8k estrellas, 1.0k forks (GitHub, 2026-09-16)
- **last meaningful activity:** activo en 2026 (evidencia indirecta verificada, ver 1.2)
- **data available:** modelo `ExerciseVideo` (verificado en `wger/exercises/models/video.py`): `uuid`, `exercise` (FK), `is_main`, `video` (FileField), `size`, `duration`, `width`, `height`, `codec`, `codec_long`, `created`, `last_update`, más historial de ediciones.
- **media available:** ficheros de vídeo alojados por wger, aportados por la comunidad. **Volumen real: no verificado** (API bloqueada).
- **license:** **Creative Commons variable por entrada.** **Verificado por método B:** `ExerciseVideo` hereda de `AbstractLicenseModel`, y `ExerciseVideoSerializer` / `ExerciseVideoInfoSerializer` exponen los seis campos de licencia en la API (código leído 2026-09-16). Licencia por defecto CC-BY-SA 4.0 (`CC_BY_SA_4_LICENSE_ID = 2`).
- **commercial reuse implications:** las mismas que en 1.2, agravadas: el vídeo es el tipo de media donde una aportación de comunidad tiene más probabilidad de ser en realidad contenido de terceros resubido. La licencia declarada en el campo `license` la elige **quien sube el fichero**, no un revisor jurídico.
- **what we could use:** el **modelo de datos** (`is_main`, `duration`, `codec`, licencia por entrada) como referencia para nuestra propia tabla de vídeos, si algún día alojamos vídeo.
- **what we should NOT copy:** los ficheros de vídeo. Auditar entrada a entrada la procedencia de vídeo aportado por comunidad no es viable con recursos razonables.

### 3.2 hasaneyldrm/exercises-dataset

- **repository:** https://github.com/hasaneyldrm/exercises-dataset
- **stars / activity:** la barra lateral de GitHub mostraba **22k estrellas / 2.8k forks / 85 watchers** en dos lecturas independientes el 2026-09-16. **Esta cifra es anómala** para un repositorio cuyo `LICENSE` data de 2026 y debe tratarse con escepticismo; en cualquier caso las estrellas son señal secundaria y **no sustentan ninguna recomendación de este informe**.
- **last meaningful activity:** **2026** (verificado: `LICENSE` dice "Copyright (c) 2026 Hasan Emir Yıldırım"). Fecha exacta: **no verificada**.
- **data available:** **1.324 ejercicios** (verificado: `data/exercises.json`, 17,4 MB, descargado y parseado el 2026-09-16, `len == 1324`). Campos por ejercicio: `id` (`"0001"`), `name`, `category`, `body_part`, `equipment`, `target`, grupos musculares, e `instructions` como **mapa por idioma**. Ejemplo real verificado del registro `0001` ("3/4 sit-up"): claves `en`, `it`, `tr`, `es`… con texto completo en cada idioma.
- **media available:** **1.324 GIF de animación + 1.324 miniaturas 180×180.** Es, con diferencia, la mejor cobertura de animación de este informe.
- **license:** **MIT únicamente para código, estructura y textos; los medios NO están licenciados al usuario.** **Verificado por método A**, leyendo el fichero `LICENSE` íntegro (`https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/LICENSE`, 1.993 bytes, 2026-09-16). La sección **MEDIA EXCEPTION** dice literalmente:
  > *"The MIT license above covers ONLY the code, tooling, dataset structure, and instruction text/translations in this repository. It DOES NOT cover the exercise media in the `images/` and `videos/` directories. That media is © Gym visual (https://gymvisual.com/) and is included here with the rights holder's written permission, at 180×180 resolution, and must retain the attribution "© Gym visual — https://gymvisual.com/". Its use and reuse are governed by Gym visual's Terms & Conditions … — NOT by the MIT license above. **Cloning this repository does not grant you any license to the media; obtain your own from Gym visual.**"*
- **commercial reuse implications:**
  - **Los GIF y las miniaturas están explícitamente prohibidos para nosotros.** El permiso es del titular **a este repositorio**, no transitivo. Usarlos en TRAINING OS sería infracción directa de copyright con un titular identificado, activo y comercial. Esto es lo más cercano a un "no" categórico que hay en este informe.
  - **Los textos multilingües sí están bajo MIT** según el fichero de licencia — incluido el español. Pero es una **afirmación del autor del repo**: los IDs (`"0001"`) y la nomenclatura (`"3/4 sit-up"`, `body_part`, `target`) son los de la familia de datasets ExerciseDB/GymVisual, lo que abre la pregunta de si el **texto original en inglés** del que derivan las traducciones era realmente del autor para licenciarlo bajo MIT. Cuestión para abogado.
- **what we could use:** potencialmente, **las instrucciones en español** bajo MIT, si el análisis jurídico valida la titularidad del texto fuente. Sería un atajo enorme para el objetivo multilingüe. Y el diseño `instructions: {en, es, it, …}` como patrón de esquema.
- **what we should NOT copy:** **`images/` y `videos/` — bajo ningún concepto.** Está prohibido por escrito en el propio repositorio.

### 3.3 rthepen/workout-database (enlaces de vídeo)

- **repository:** https://github.com/rthepen/workout-database
- **stars / activity:** 1 estrella, 0 forks (GitHub, 2026-09-16)
- **last meaningful activity:** 2026 (verificado vía año de copyright del LICENSE); fecha exacta no verificada
- **data available:** ver 1.5
- **media available:** **ninguna alojada.** Solo referencias: `youtube_id`, `type` (`standard`/`short`), `priority` (1, 2, … para *fallback*), `start_seconds`, `language`. El repo incluye una app de curación con captura de *timestamps* de YouTube.
- **license:** **MIT** para el repositorio (verificado por método A, 2026-09-16). **Los vídeos referenciados NO están cubiertos por esta licencia**: son obras de terceros en YouTube.
- **commercial reuse implications:** incrustar vídeos mediante el reproductor oficial de YouTube se rige por los **Términos de Servicio de YouTube y la YouTube API**, no por MIT. Descargar, rehospedar o servir los vídeos desde nuestra infraestructura estaría prohibido. Además, un enlace a un canal de terceros puede desaparecer, hacerse privado o cambiar de contenido — de ahí su propio sistema de *fallback* por prioridad, que es un reconocimiento del problema.
- **what we could use:** el **patrón de `fallback` con prioridad y `start_seconds`** si algún día enlazamos vídeo externo. Es un buen diseño.
- **what we should NOT copy:** tratar los IDs de YouTube como contenido licenciado, y por supuesto no rehospedar.

### 3.4 Wikimedia Commons — categorías de animaciones de ejercicio

- **repository:** https://commons.wikimedia.org/wiki/Category:Weight_training_animations (y `Category:Animations_of_physical_exercises`, `Category:Fitness_animations`, `Category:Videos_of_fitness`)
- **stars / activity:** no aplica (no es un repositorio de código)
- **last meaningful activity:** no aplica; Commons es un proyecto permanentemente activo
- **data available:** ninguna metadata estructurada de ejercicio utilizable directamente
- **media available:** animaciones GIF de ejercicios. **Volumen y contenido concreto: NO VERIFICADO** — el dominio `commons.wikimedia.org` no era accesible desde este entorno (ni por WebFetch, que lo reporta como "cache-only", ni por la API, bloqueada por el proxy). La existencia de estas categorías consta únicamente por resultados de búsqueda del 2026-09-16.
- **license:** **NO VERIFICADO.** En Commons la licencia es **por archivo**, no por categoría: conviven CC0, CC-BY, CC-BY-SA en varias versiones y dominio público. El README de `chaosbastler/opentraining-exercises` afirma que parte del arte de Everkinetic está en Commons (ej. `File:Biceps-curl-1.gif`), lo que sugiere CC-BY-SA 3.0 para ese subconjunto, **pero esto no se ha podido comprobar directamente**.
- **commercial reuse implications:** **no se puede afirmar nada con fundamento sin verificar archivo por archivo.** Ninguna recomendación de este informe depende de esta fuente.
- **what we could use:** posiblemente, animaciones sueltas para huecos concretos del catálogo — **solo tras verificar la página de cada archivo**.
- **what we should NOT copy:** descargas masivas por categoría asumiendo una licencia uniforme. Es el error clásico con Commons.

---

## 4. Cardio / actividad outdoor (modelos de datos, no UI)

### 4.1 SamR1/FitTrackee

- **repository:** https://github.com/SamR1/FitTrackee — **repositorio principal real: https://codeberg.org/FitTrackee/FitTrackee** (el de GitHub es un espejo; su README lo declara: *"The main repository is hosted on Codeberg.org. The Github repository is a mirror (except for issues and PRs)"*).
- **stars / activity:** 1.2k estrellas, 77 forks en el espejo de GitHub (2026-09-16). La actividad real (issues, PRs) ocurre en Codeberg, así que **las estrellas de GitHub subestiman el proyecto**.
- **last meaningful activity:** **2026-09-09** — **verificado**: `CHANGELOG.md` encabeza con `## Version 1.3.5 (2026/09/09)`, una release de seguridad (GHSA-p67x-83gj-56rg) con correcciones y actualizaciones de traducción. Es el proyecto **más demostrablemente activo** de todo este informe: una semana antes de la fecha de esta investigación.
- **data available:** modelo de datos de actividad outdoor, verificado leyendo `fittrackee/workouts/models.py` (2026-09-16). Clases: `Sport`, `Workout`, `WorkoutSegment`, `Record`, `WorkoutLike`. Campos de `Workout` (selección literal):
  - Identidad/tiempo: `uuid`, `user_id`, `sport_id`, `title`, `workout_date`, `creation_date`, `modification_date`
  - Duración: `duration`, `pauses`, `moving` (tres conceptos distintos — **este es el detalle que casi todo el mundo modela mal**)
  - Distancia y altimetría: `distance`, `min_alt`, `max_alt`, `ascent`, `descent`, `elevation_data_source`
  - Velocidad/ritmo: `max_speed`, `ave_speed`, `ave_pace`, `best_pace`
  - Fisiología: `max_hr`, `ave_hr` (bpm), `max_cadence`, `ave_cadence` (rpm), `max_power`, `ave_power` (W), `calories` (kcal)
  - Geo: `bounds`, `map`, `map_id`, `start_point_geom` (PostGIS)
  - Contexto: `weather_start`, `weather_end` (JSON), `notes`, `description`, `source`, `original_file`
  - Privacidad granular: `workout_visibility`, `map_visibility`, `analysis_visibility`, `media_visibility` (enum `VisibilityLevel`), `suspended_at`
  - `Sport` incluye `stopped_speed_threshold` y `pace_speed_display` (enum SPEED/PACE) — **configuración de cómo se interpreta y muestra cada deporte, no un simple label.**
  - `Record` modela récords personales por deporte. `WorkoutSegment` modela tramos.
  - Stack: Flask + SQLAlchemy 2.0 + PostgreSQL/PostGIS + `gpxpy` + `fitdecode` + `geopandas`.
- **media available:** ninguna relevante (mapas estáticos generados de OpenStreetMap)
- **license:** **`AGPL-3.0-only`.** **Verificado por método A + B:** `https://raw.githubusercontent.com/SamR1/FitTrackee/master/LICENSE` → HTTP 200 con el texto íntegro de la GNU AGPL v3; y `pyproject.toml` declara literalmente `license = "AGPL-3.0-only"` más el clasificador `"License :: OSI Approved :: GNU Affero General Public License v3"` (2026-09-16). Confirmado por barra lateral GitHub. Nótese el `-only`: **a diferencia de wger (`-or-later`), FitTrackee no admite versiones posteriores de la AGPL.**
- **commercial reuse implications:**
  - **AGPL-3.0-only es incompatible con TRAINING OS como producto comercial cerrado si tocamos su código.** Al ser una PWA servida por red, el artículo 13 obligaría a entregar el *Corresponding Source* completo a cada usuario del servicio. Incorporar aunque sea un módulo (por ejemplo su parser de GPX/FIT) contaminaría todo el producto.
  - **La AGPL cubre el código, no el modelo conceptual.** Los nombres de campos, las unidades y la separación `duration`/`pauses`/`moving` son hechos y decisiones funcionales, no expresión creativa protegible. Podemos **aprender de su modelo y reimplementarlo**. Lo que no podemos es copiar sus ficheros, sus migraciones o su código de serialización.
  - Como el proyecto no tiene CLA ni doble licencia visible, **no hay ruta de licencia comercial disponible**.
- **what we could use:** **como referencia conceptual, es la mejor fuente del informe para cardio.** Concretamente deberíamos adoptar (reimplementando): la tripleta `duration`/`pauses`/`moving`; `ascent`/`descent` separados de `min_alt`/`max_alt`; `elevation_data_source` (saber si la altimetría viene del barómetro, del GPS o de un DEM); `ave_pace` y `best_pace` como campos derivados persistidos; `stopped_speed_threshold` por deporte; y el modelo de visibilidad granular por faceta (`workout_visibility` ≠ `map_visibility`), que es exactamente lo que exige el RGPD en datos de localización.
- **what we should NOT copy:** **ninguna línea de su código Python o Vue.** Ni sus migraciones Alembic. Ni su esquema SQL literal. El riesgo AGPL es existencial para un producto comercial.

### 4.2 OpenTracksApp/OpenTracks

- **repository:** https://github.com/OpenTracksApp/OpenTracks — **migrado a https://codeberg.org/OpenTracksApp/OpenTracks**
- **stars / activity:** 1.4k estrellas, 226 forks (GitHub, 2026-09-16)
- **last meaningful activity:** **el repositorio de GitHub fue archivado el 2025-08-24** (verificado: la página lo indica como archivado y de solo lectura, con redirección a Codeberg). El desarrollo continúa en Codeberg; **el estado actual del repo en Codeberg no se ha verificado.**
- **data available:** modelo de grabación de actividad: distancia, duración, ganancia/pérdida de elevación (sensor barométrico), localización GPS, frecuencia cardíaca (Bluetooth LE), y métricas específicas por deporte — ciclismo (velocidad, distancia, cadencia, potencia) y carrera (velocidad, cadencia). Marcadores y fotos con posición.
- **media available:** ninguna relevante
- **license:** **Apache-2.0.** **Verificado por método A:** `https://raw.githubusercontent.com/OpenTracksApp/OpenTracks/main/LICENSE` → HTTP 200, 12.032 bytes con el texto íntegro de la Apache License 2.0, 2026-09-16. Confirmado por barra lateral GitHub.
- **commercial reuse implications:** **Apache-2.0 es plenamente compatible con producto comercial cerrado.** Permisiva, sin copyleft, con concesión expresa de patentes. Obligaciones: conservar avisos de copyright y licencia, incluir el `NOTICE` si existe, e indicar los cambios en los ficheros modificados. **Es, de lejos, la licencia más cómoda de las fuentes de cardio.** La cautela es otra: el repositorio de GitHub está archivado, así que **cualquier dependencia debe apuntar a Codeberg**, cuyo estado no hemos verificado.
- **what we could use:** el conjunto de **formatos de exportación** como referencia de interoperabilidad: **KMZ 2.3 (con fotos), KML 2.3 y GPX 1.1**. Si TRAINING OS quiere importar actividades de apps de terceros, GPX 1.1 es el mínimo. Y, al ser Apache-2.0, sí podríamos reutilizar código real (por ejemplo lógica de parsing) sin contaminar el producto.
- **what we should NOT copy:** no depender del repositorio archivado de GitHub como si fuera *upstream*. Verificar antes el estado en Codeberg.

### 4.3 GoldenCheetah/GoldenCheetah

- **repository:** https://github.com/GoldenCheetah/GoldenCheetah
- **stars / activity:** 2.2k estrellas, 468 forks (GitHub, 2026-09-16)
- **last meaningful activity:** **2025-11-21** — release "VERSION 3.7 SP1" según la página del repositorio (2026-09-16).
- **data available:** el modelo analítico más maduro del ecosistema: métricas de carga (**BikeStress, TRIMP, RPE**), modelos fisiológicos (**Critical Power, W'bal**), y modelos de forma (**Banister, PMC — Performance Management Chart**). Importación/exportación desde un rango amplio de ciclocomputadores y formatos. Integraciones con Strava, Withings, Today's Plan. "ErgDB" para compartir entrenamientos indoor.
- **media available:** ninguna
- **license:** **GPL-2.0.** **Verificado por método A:** `https://raw.githubusercontent.com/GoldenCheetah/GoldenCheetah/master/COPYING` → HTTP 200, 18.093 bytes con el texto íntegro de la GNU General Public License v2, 2026-09-16. Confirmado por barra lateral GitHub ("GPL-2.0"). **Nótese que el fichero se llama `COPYING`, no `LICENSE`.**
- **commercial reuse implications:** **GPL-2.0 es copyleft fuerte sobre el código.** A diferencia de la AGPL, **no tiene cláusula de red**: distribuir un servicio web basado en código GPL-2.0 sin distribuir binarios no dispara por sí solo la obligación de liberar el fuente (el "ASP loophole"). Aun así, **incorporar código GPL-2.0 en TRAINING OS sería temerario**: cualquier distribución futura (app empaquetada, instalador de escritorio, binario) obligaría a liberar todo el producto bajo GPL-2.0. Y la GPL-2.0 es **incompatible con la Apache-2.0** en una misma obra combinada, lo que limitaría nuestras opciones.
  **Las métricas en sí (TSS, CP, W'bal, PMC) no son propiedad de GoldenCheetah** — son modelos fisiológicos publicados en literatura científica. Algunos nombres sí son **marcas registradas de terceros** (notablemente "TSS" y "Training Stress Score" están asociados a TrainingPeaks; GoldenCheetah usa "BikeStress" precisamente para evitar el conflicto). **Esto es relevante para nosotros: podríamos implementar la métrica, pero no necesariamente llamarla como la llama la competencia.**
- **what we could use:** **solo como referencia conceptual y bibliográfica**: qué métricas de carga y forma merece la pena implementar, y cómo nombrarlas sin pisar marcas. Su elección de "BikeStress" sobre "TSS" es una lección directa.
- **what we should NOT copy:** su código C++/Qt. Y no adoptar la nomenclatura "TSS"/"Training Stress Score" sin revisión de marcas.

### 4.4 tkrajina/gpxpy

- **repository:** https://github.com/tkrajina/gpxpy
- **stars / activity:** 1.1k estrellas, 227 forks (GitHub, 2026-09-16)
- **last meaningful activity:** **no verificado.** Evidencia indirecta de vigencia: FitTrackee 1.3.5 (release del 2026-09-09) declara `gpxpy = "1.6.2"` como dependencia de producción, lo que confirma que la librería está viva y en uso en 2026.
- **data available:** no es un dataset, es un **parser**. Expone la estructura GPX: tracks, segmentos, puntos (lat/lon), waypoints con nombre, rutas, `point.elevation`, y atributos de velocidad (presentes en GPX 1.0, eliminados en 1.1). Soporta GPX 1.0 y 1.1 con detección automática de versión. **Preserva las extensiones GPX como objetos DOM de ElementTree** — que es donde viven en la práctica la frecuencia cardíaca, la cadencia y la potencia de Garmin/Strava.
- **media available:** ninguna
- **license:** **Apache-2.0.** **Verificado por método A:** `https://raw.githubusercontent.com/tkrajina/gpxpy/master/LICENSE.txt` → HTTP 200, 11.358 bytes con el texto íntegro de la Apache License 2.0, 2026-09-16. Confirmado por barra lateral GitHub.
- **commercial reuse implications:** **sin fricción.** Apache-2.0: uso comercial, modificación y distribución en producto cerrado permitidos, con concesión expresa de patentes. Solo hay que conservar avisos e indicar cambios. **Es la única fuente de esta sección que podemos integrar directamente en el producto sin análisis jurídico previo.**
- **what we could use:** **usarla tal cual** (o su equivalente en el stack de TRAINING OS) si necesitamos importar GPX. El manejo de extensiones como DOM es justo lo que hace falta para extraer HR/cadencia/potencia de ficheros reales.
- **what we should NOT copy:** nada que evitar — pero ojo: GPX **no** cubre `.fit`, que es el formato nativo de Garmin y el más habitual en dispositivos. Para FIT haría falta otra librería (FitTrackee usa `fitdecode`), y **el FIT SDK de Garmin tiene su propia licencia restrictiva que no se ha analizado aquí**.

---

## 5. Planificación de entrenamiento y progresión

### 5.1 wger — rutinas y reglas de progresión

- **repository:** https://github.com/wger-project/wger
- **stars / activity:** 6.8k estrellas, 1.0k forks (GitHub, 2026-09-16)
- **last meaningful activity:** activo en 2026 (evidencia indirecta verificada, ver 1.2)
- **data available:** el README declara la funcionalidad central: *"Custom Workout Routines – Create flexible routines with automatic weight progression rules"*, además de seguimiento de dieta, peso corporal y medidas personalizadas, y **API REST** para integraciones. **El detalle del modelo de rutinas/progresión (tablas, tipos de regla) no se ha leído en esta sesión** — se han verificado los modelos de ejercicio, no los de rutina. **No verificado.**
- **media available:** no aplica
- **license:** **`AGPL-3.0-or-later`** para el código (verificado por método A + D, ver 1.2)
- **commercial reuse implications:** idénticas a 1.2(a). La lógica de progresión es **código**, y por tanto AGPL sin matices: aquí no hay separación código/datos que nos ayude. Copiar su motor de progresión contaminaría TRAINING OS.
- **what we could use:** **como referencia funcional**: qué tipos de regla de progresión espera un usuario real de una app de gimnasio madura, y cómo se exponen en una API REST. Nada de código.
- **what we should NOT copy:** el motor de rutinas y progresión.

### 5.2 astashov/liftosaur

- **repository:** https://github.com/astashov/liftosaur
- **stars / activity:** 680 estrellas, 103 forks (GitHub, 2026-09-16)
- **last meaningful activity:** **no verificado.** El producto (liftosaur.com) está operativo comercialmente, pero no se pudo obtener fecha de commit.
- **data available:** **Liftoscript**, un lenguaje de scripting propio para definir lógica de progresión, descrito en el README como *"a very simple programming language with JavaScript-like syntax"* con variables predefinidas y tipos numéricos con unidad (`kg`, `lb`). Ejemplo del propio README: `if (completedReps >= reps) { state.weight = state.weight + 5lb }`. Permite expresar programas reales: Stronglifts 5×5, GZCLP, y rutinas personalizadas.
- **media available:** ninguna
- **license:** **AGPL-3.0.** **Verificado por método A:** `https://raw.githubusercontent.com/astashov/liftosaur/master/LICENSE` → HTTP 200, 34.523 bytes con el texto íntegro de la GNU AGPL v3, 2026-09-16. Confirmado por barra lateral GitHub. **No se ha verificado si el proyecto ofrece además una licencia comercial o exige CLA** — dado que el autor opera un producto de pago sobre el mismo código, es plausible que exista doble licencia. **No verificado.**
- **commercial reuse implications:**
  - **AGPL + producto comercial del mismo autor = la combinación más peligrosa posible para nosotros.** No solo el copyleft de red obligaría a liberar TRAINING OS entero; además el titular es un **competidor directo con incentivo económico para hacer cumplir la licencia**. Esto no es un riesgo teórico.
  - El **concepto** de un DSL de progresión no es patentable ni protegible por copyright; la **implementación** sí lo es. La gramática concreta de Liftoscript, sus nombres de variables de estado y su sintaxis están en el código AGPL.
- **what we could use:** **referencia conceptual, con distancia deliberada.** La idea de que la progresión sea *configurable por el usuario* en lugar de un enum cerrado de "linear / double progression / RPE" es correcta y diferencial. Si TRAINING OS quisiera algo parecido, debería diseñarse desde cero y con una sintaxis claramente distinta.
- **what we should NOT copy:** su código, su gramática, sus nombres de variables de estado, y cualquier ejemplo de Liftoscript. Ni siquiera como "inspiración cercana": el titular es competidor.

### 5.3 oscarmiranda90/open-repset

- **repository:** https://github.com/oscarmiranda90/open-repset
- **stars / activity:** **9 estrellas, 1 fork** (GitHub, 2026-09-16). Adopción mínima.
- **last meaningful activity:** **no verificado.** Declara Dart `^3.12.1`, lo que indica un stack reciente.
- **data available:** modelo de registro de sesión offline-first: **series, repeticiones, carga, RPE, notas, superseries e intervalos de descanso**; además entrenamientos activos, historial, plantillas, peso corporal y analítica, todo **en el dispositivo (SQLite)**. Stack Flutter/Dart (Android, iOS, macOS, web).
- **media available:** ninguna en el repo abierto (ver abajo)
- **license:** **Apache-2.0.** **Verificado por método A:** `https://raw.githubusercontent.com/oscarmiranda90/open-repset/main/LICENSE` → HTTP 200, 11.345 bytes con el texto íntegro de la Apache License 2.0, 2026-09-16. Confirmado por barra lateral GitHub.
- **commercial reuse implications:** **Apache-2.0: compatible con producto comercial cerrado**, sin copyleft, con concesión de patentes. Es el **único proyecto de app completa de gimnasio de este informe cuyo código podríamos reutilizar legalmente**. La contrapartida: 9 estrellas, autor único, madurez no verificada — el valor está en el diseño, no en el código listo para producción.
  **Dato muy relevante que corrobora el resto del informe:** open-repset **excluye deliberadamente de su repositorio abierto** el catálogo oficial, porque usa *"copyrighted Gym Visual media redistributed by RepSet with permission"*, e inyecta el catálogo en build-time vía `REPSET_CATALOGUE_ORIGIN`. Y su README **recomienda explícitamente a los forks usar Workout Guide (CC BY-SA 4.0) y Free Exercise DB (Unlicense)** como alternativas abiertas — exactamente las dos fuentes que este informe recomienda por análisis independiente.
- **what we could use:** el **modelo de sesión de fuerza** (series/reps/carga/RPE/superseries/descanso) como referencia directa y, si conviene, código real bajo Apache-2.0. Y el patrón arquitectónico de **separar el catálogo de ejercicios del código**, inyectándolo en build o en runtime — eso nos permitiría cambiar de fuente de datos sin tocar la app, que es justo lo que necesitamos dada la incertidumbre legal de las fuentes.
- **what we should NOT copy:** el catálogo oficial de RepSet (media de Gym Visual, no licenciada a terceros).

---

## 6. Instrucciones de ejercicio / contenido educativo

### 6.1 yuhonas/free-exercise-db — campo `instructions`

- **repository:** https://github.com/yuhonas/free-exercise-db
- **stars / activity:** 1.9k estrellas, 488 forks (GitHub, 2026-09-16)
- **last meaningful activity:** no verificado
- **data available:** `instructions` como **array de pasos** por ejercicio (verificado: el primer registro tiene 5 pasos). Texto descriptivo real, no etiquetas. 876 ejercicios cubiertos.
- **media available:** no aplica a esta categoría
- **license:** **Unlicense**, verificado por método A sobre `LICENSE.md` (2026-09-16)
- **commercial reuse implications:** **sin obligaciones de ningún tipo para el texto.** Podemos usarlo, editarlo, reescribirlo, traducirlo al español y **mantener nuestras traducciones como propiedad cerrada**. Ésta es la diferencia decisiva frente a wger: traducir texto CC-BY-SA nos obligaría a publicar la traducción bajo CC-BY-SA; traducir texto Unlicense no nos obliga a nada.
- **what we could use:** **el corpus de instrucciones en inglés como material fuente para la versión española de TRAINING OS.** Es la ruta más limpia hacia contenido en español propio.
- **what we should NOT copy:** nada que evitar jurídicamente. Nota editorial: el texto es prolijo y de estilo antiguo (heredado de webs de culturismo), así que conviene **reescribirlo** por calidad de producto, no por licencia.

### 6.2 wger — `Translation.description`

- **repository:** https://github.com/wger-project/wger
- **stars / activity:** 6.8k estrellas, 1.0k forks (GitHub, 2026-09-16)
- **last meaningful activity:** activo en 2026 (evidencia indirecta verificada)
- **data available:** modelo `Translation` con `description` (texto rico), `description_source`, `name` y `language`, **una fila por idioma**. Con validación automática de que el idioma detectado del texto coincide con el declarado (`validate_language_matches`) y control de duplicados por idioma — verificado en `wger/exercises/api/serializers.py`. Es el modelo de contenido multilingüe mejor diseñado del informe.
- **media available:** no aplica
- **license:** **Creative Commons variable por entrada**, por defecto **CC-BY-SA 4.0**. Verificado por método B (el modelo `Translation` hereda `AbstractLicenseModel`; `ExerciseTranslationInfoSerializer` expone los seis campos de licencia).
- **commercial reuse implications:** el punto crítico ya desarrollado en 1.2(d): **traducir o adaptar una descripción CC-BY-SA produce obra derivada que debe publicarse CC-BY-SA**. Como la localización al español es un activo diferencial de TRAINING OS, tomar texto CC-BY-SA de wger como base significaría **regalar nuestro trabajo de localización al mercado, competidores incluidos**. Además, mostrarlo exige UI de atribución por ejercicio (título, autor, fuente, licencia, indicación de cambios).
- **what we could use:** **solo las entradas CC0** (license pk 3), previa consulta entrada a entrada vía API. El resto, únicamente como referencia de calidad editorial.
- **what we should NOT copy:** ingestión masiva de descripciones, y muy especialmente **usarlas como base de nuestras traducciones al español**.

### 6.3 exercemus/exercises — `instructions` y `tips`

- **repository:** https://github.com/exercemus/exercises
- **stars / activity:** 50 estrellas, 11 forks (GitHub, 2026-09-16)
- **last meaningful activity:** no verificado (copyright del LICENSE: 2022)
- **data available:** `instructions` (array), **`tips`** (array, señales de técnica) y `description`, sobre 872 ejercicios. El campo `tips` es contenido educativo diferenciado de los pasos de ejecución — conceptualmente valioso.
- **media available:** ninguna (0/872 con imágenes; 24 con enlace de vídeo)
- **license:** **MIT sobre el código**, verificado por método A. **Los textos NO están cubiertos por MIT** según el propio README, y **los metadatos de licencia por entrada están vacíos en 871 de 872 registros** (recuento propio, 2026-09-16).
- **commercial reuse implications:** **no es posible cumplir la licencia de estos textos porque el dato que diría cuál es no existe.** Los textos proceden declaradamente de wger.de (CC variable, por defecto CC-BY-SA) y de exercises.json (Unlicense), mezclados sin trazabilidad. Usarlos significaría asumir el riesgo de estar redistribuyendo comercialmente contenido CC-BY-SA sin atribución ni share-alike.
- **what we could use:** **el concepto de separar `tips` de `instructions`** en nuestro esquema. Nada del contenido.
- **what we should NOT copy:** los textos. Es el caso de estudio de por qué la trazabilidad de licencia importa tanto como la licencia.

---

## 7. Datos de ejercicios multilingües (especialmente español)

> **Estado del arte, verificado:** **no existe un dataset de ejercicios abierto, maduro y en español con licencia limpia.** Las tres opciones reales son: (a) wger, que tiene español pero con CC-BY-SA por defecto; (b) hasaneyldrm, que tiene español bajo MIT pero con procedencia del texto fuente por confirmar; (c) traducir nosotros el corpus Unlicense de free-exercise-db. Búsquedas específicas en español el 2026-09-16 no devolvieron ningún dataset hispanohablante de referencia.

### 7.1 wger — traducciones al español

- **repository:** https://github.com/wger-project/wger
- **stars / activity:** 6.8k estrellas, 1.0k forks (GitHub, 2026-09-16)
- **last meaningful activity:** activo en 2026 (evidencia indirecta verificada)
- **data available:** **el español existe formalmente en el modelo**: el fixture `wger/core/fixtures/languages.json` contiene `pk: 4`, `short_name: "es"`, `full_name: "Español"` (verificado por método A, 2026-09-16). Arquitectura `Exercise` + N × `Translation`, con una traducción por idioma y ejercicio, validación de idioma y control de duplicados. **El número real de ejercicios con traducción al español NO se ha podido verificar** (API bloqueada por robots.txt y anti-bot). Esto es importante: *tener el idioma en el modelo* no es lo mismo que *tener el catálogo traducido*.
- **media available:** ver 1.2
- **license:** **CC variable por entrada, por defecto CC-BY-SA 4.0** (verificado por método B, ver 1.2)
- **commercial reuse implications:** la traducción es precisamente el caso donde ShareAlike muerde. Si tomamos una descripción CC-BY-SA en español de wger y la editamos para nuestro estilo, estamos creando una adaptación de una adaptación: nuestra versión debe ir CC-BY-SA. Y la atribución debe apuntar **al traductor concreto** (`license_author` de esa `Translation`), no solo a "wger".
- **what we could use:** el **patrón arquitectónico** `Exercise` / `Translation` — que TRAINING OS debería adoptar desde el día uno si quiere ser multilingüe. Y, con auditoría, las traducciones marcadas **CC0**.
- **what we should NOT copy:** el corpus de traducciones al español en bloque. Es el camino directo a tener que publicar nuestra localización bajo CC-BY-SA.

### 7.2 hasaneyldrm/exercises-dataset — instrucciones en 10 idiomas

- **repository:** https://github.com/hasaneyldrm/exercises-dataset
- **stars / activity:** cifra anómala (22k/2.8k) leída en GitHub el 2026-09-16 — **tratar con escepticismo**, ninguna recomendación depende de ella
- **last meaningful activity:** 2026 (verificado vía año de copyright del `LICENSE`); fecha exacta no verificada
- **data available:** **1.324 ejercicios con instrucciones en 10 idiomas, español incluido** (verificado: parseo de `data/exercises.json`, 17,4 MB, el 2026-09-16; el registro `0001` contiene `instructions.en`, `.it`, `.tr`, `.es`, …). Los idiomas declarados son inglés, español, italiano, turco, ruso, chino, hindi, polaco, coreano y francés. El texto español leído es fluido y completo, no un stub. **Es, con enorme diferencia, el mejor corpus en español localizable en esta investigación.**
- **media available:** 1.324 GIF + 1.324 miniaturas — **prohibidos** (ver 3.2)
- **license:** **MIT para "code, tooling, dataset structure, and instruction text/translations"; media explícitamente excluida y propiedad de Gym visual.** Verificado por método A leyendo el fichero `LICENSE` completo, incluida la sección MEDIA EXCEPTION (2026-09-16).
- **commercial reuse implications:**
  - **Los textos y traducciones están, por el texto literal del LICENSE, bajo MIT** — lo que permitiría usarlos comercialmente conservando el aviso de copyright, **sin share-alike y sin obligación de publicar nuestras ediciones**. Si esto se sostiene, resuelve el problema del español de golpe.
  - **Pero hay una duda de titularidad que un ingeniero no puede resolver.** Los IDs (`"0001"`), la nomenclatura (`body_part`, `target`) y los nombres de ejercicio (`"3/4 sit-up"`) son los de la familia de datasets ExerciseDB/GymVisual. Si las instrucciones en inglés de las que derivan estas traducciones no eran del autor del repositorio, su dedicación MIT **sobre ese texto** no sería efectiva — el mismo problema estructural que las fotos de free-exercise-db, pero al revés (aquí la media está bien delimitada y es el texto lo que está sin acreditar).
  - Factor atenuante real: el autor **ha demostrado diligencia legal** al separar explícitamente la media y declarar permiso escrito del titular. Un autor descuidado no habría escrito una MEDIA EXCEPTION. Eso aumenta la credibilidad de su declaración sobre el texto, pero no la prueba.
- **what we could use:** **las instrucciones en español, previa validación jurídica de la titularidad del texto fuente.** Es la vía rápida al catálogo en español. Y el patrón `instructions: {en, es, …}` como esquema.
- **what we should NOT copy:** **`images/` y `videos/`, bajo ningún concepto** — prohibición expresa y por escrito del propio repositorio.

### 7.3 rthepen/workout-database — inglés y neerlandés

- **repository:** https://github.com/rthepen/workout-database
- **stars / activity:** 1 estrella, 0 forks (GitHub, 2026-09-16)
- **last meaningful activity:** 2026 (verificado vía año de copyright del `LICENSE`)
- **data available:** 630 ejercicios con nombres, categorías, descripciones, instrucciones y *coaching cues* localizados en **inglés (`en`) y neerlandés (`nl`)**. **No incluye español.**
- **media available:** ninguna propia (enlaces YouTube)
- **license:** **MIT**, verificado por método A (2026-09-16)
- **commercial reuse implications:** MIT sería cómoda, pero **es irrelevante para nuestro objetivo**: el idioma que necesitamos no está. Además, procedencia de los textos no auditada y adopción nula.
- **what we could use:** el **esquema** de localización por objeto (`exercise_name: {en, nl}`) y el campo `tracking_mode`. Nada de contenido.
- **what we should NOT copy:** no invertir esfuerzo aquí esperando español.

---

## 8. Tabla comparativa resumen

| Proyecto | Categorías | Licencia (SPDX / nombre) | Verificación | Actividad verificable | Uso comercial | Veredicto |
|---|---|---|---|---|---|---|
| [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) | metadatos, instrucciones, imágenes | **Unlicense** | A (`LICENSE.md`) + C, 2026-09-16 | no verificado | **Texto: libre total. Imágenes: titularidad no acreditada** | **Usar el texto. NO usar las fotos** |
| [wger-project/wger](https://github.com/wger-project/wger) — código | planificación, modelo de datos | **AGPL-3.0-or-later** | A (`LICENSE.txt`) + D + C, 2026-09-16 | activo 2026 (indirecto) | Copyleft de red → incompatible con producto cerrado | **Solo referencia conceptual** |
| wger — datos de ejercicio | metadatos, instrucciones, español, imágenes, vídeo | **CC variable por entrada**; por defecto **CC-BY-SA 4.0**; opciones CC-BY-SA 3, CC0, CC-BY 4, ODbL | B (modelos, fixtures, serializers) + D, 2026-09-16 | activo 2026 (indirecto) | Uso comercial permitido, pero atribución por entrada y **share-alike sobre traducciones** | **Solo entradas CC0, con auditoría** |
| [wrkout/exercises.json](https://github.com/wrkout/exercises.json) | metadatos, imágenes | **Unlicense** | A (`LICENSE.md`) + C, 2026-09-16 | no verificado | Igual que free-exercise-db, con más señales de origen comercial | **Evitar; ya superado por free-exercise-db** |
| [exercemus/exercises](https://github.com/exercemus/exercises) | metadatos, instrucciones | **MIT (solo código)**; datos con licencia declarada pero **871/872 vacía** | A (`LICENSE`) + recuento propio, 2026-09-16 | no verificado (2022) | **Imposible cumplir: trazabilidad perdida** | **Evitar por completo** |
| [rthepen/workout-database](https://github.com/rthepen/workout-database) | metadatos, vídeo (enlaces), multilingüe | **MIT** | A (`LICENSE`), 2026-09-16 | 2026 | MIT cómoda, pero sin español y sin auditoría de procedencia | **Solo ideas de esquema (`tracking_mode`)** |
| [everkinetic/data](https://github.com/everkinetic/data) | ilustraciones | **CC-BY-SA-4.0** | A (`LICENSE.md`, 18.578 B) + C, 2026-09-16 | no verificado | Comercial OK con atribución + share-alike sobre adaptaciones | **Usable como fuente de imagen** |
| [bryllim/workout-guide](https://github.com/bryllim/workout-guide) | ilustraciones (906 SVG) | **MIT** (código) + **CC-BY-SA-4.0** (assets) | A (`LICENSE`) + D; `LICENSE-ASSETS` **no leído** | 2026 | Comercial OK; atribución doble (Everkinetic + Bryl Lim) | **Mejor opción de imagen; cobertura limitada (302)** |
| [chaosbastler/opentraining-exercises](https://github.com/chaosbastler/opentraining-exercises) | ilustraciones, metadatos (alemán) | **CC-BY-SA 3.0 Unported** | **Solo D (README). Sin fichero LICENSE (404 ×5)**, 2026-09-16 | no verificado | Versión 3.0 y metadatos en alemán | **Evitar; misma arte con licencia peor formalizada** |
| [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) | multilingüe/español, GIFs | **MIT** (texto) + **media © Gym visual, NO licenciada** | A (`LICENSE` íntegro con MEDIA EXCEPTION), 2026-09-16 | 2026 | **Texto: MIT (titularidad por confirmar). Media: prohibida** | **Texto: candidato fuerte tras revisión legal. Media: NO** |
| [SamR1/FitTrackee](https://github.com/SamR1/FitTrackee) | cardio / outdoor | **AGPL-3.0-only** | A (`LICENSE`) + B (`pyproject.toml`) + C, 2026-09-16 | **2026-09-09 (v1.3.5)** | Copyleft de red, **sin cláusula "or-later"** | **Solo referencia conceptual (la mejor)** |
| [OpenTracksApp/OpenTracks](https://github.com/OpenTracksApp/OpenTracks) | cardio / outdoor | **Apache-2.0** | A (`LICENSE`, 12.032 B) + C, 2026-09-16 | **GitHub archivado 2025-08-24** → Codeberg | **Compatible con producto cerrado** | **Usable; apuntar a Codeberg** |
| [GoldenCheetah/GoldenCheetah](https://github.com/GoldenCheetah/GoldenCheetah) | cardio / métricas | **GPL-2.0** | A (`COPYING`, 18.093 B) + C, 2026-09-16 | **3.7 SP1, 2025-11-21** | Copyleft fuerte; incompatible con Apache-2.0 en obra combinada | **Solo referencia conceptual** |
| [tkrajina/gpxpy](https://github.com/tkrajina/gpxpy) | cardio / parsing | **Apache-2.0** | A (`LICENSE.txt`, 11.358 B) + C, 2026-09-16 | no verificado (en uso por FitTrackee 1.3.5) | **Sin fricción** | **Usar directamente si hace falta GPX** |
| [astashov/liftosaur](https://github.com/astashov/liftosaur) | planificación / progresión | **AGPL-3.0** | A (`LICENSE`, 34.523 B) + C, 2026-09-16 | no verificado | Copyleft de red **+ titular es competidor comercial** | **Evitar el código; distancia deliberada** |
| [oscarmiranda90/open-repset](https://github.com/oscarmiranda90/open-repset) | planificación / modelo de sesión | **Apache-2.0** | A (`LICENSE`, 11.345 B) + C, 2026-09-16 | no verificado | **Compatible con producto cerrado** | **Usable; única app completa reutilizable** |
| [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Weight_training_animations) | animaciones | **NO VERIFICADO — licencia por archivo** | **E — dominio inaccesible en esta sesión** | n/a | Desconocido | **No apoyar ninguna decisión en esta fuente** |

---

## 9. RECOMENDACIÓN

### 9.1 Para metadatos del catálogo de ejercicios → **yuhonas/free-exercise-db**

**Decisión: adoptarlo como fuente canónica.**

**Razonamiento.** Es la única fuente de metadatos del informe que combina las cuatro cosas que necesitamos: licencia verificada en fichero (Unlicense, comprobada el 2026-09-16), **cero obligaciones** (ni atribución, ni share-alike, ni apertura de código), volumen suficiente (876 ejercicios verificados por recuento propio) y campos completos (`force`, `level`, `mechanic`, `equipment`, músculos primarios y secundarios, categoría). Las alternativas fallan cada una por un motivo distinto y demostrado: wger arrastra CC-BY-SA por defecto sobre nuestras traducciones; exercemus ha perdido la trazabilidad de licencia en 871 de 872 registros; rthepen tiene 630 ejercicios, cero adopción y no tiene español; wrkout es la versión sin normalizar del mismo dato.

Complementar con dos ideas de esquema tomadas de terceros (conceptos, no datos): **`tracking_mode`** de rthepen (`reps_only` / `reps_and_weight` / `time_only` / `distance`) y la separación **`tips` vs `instructions`** de exercemus.

### 9.2 Para imágenes → **bryllim/workout-guide** (primaria) + **everkinetic/data** (complemento)

**Decisión: usar los 906 SVG de workout-guide sin modificarlos, con pantalla de atribución.**

**Razonamiento.** Es la única capa visual del informe con una **cadena de derechos coherente y declarada**: arte original de Everkinetic bajo CC-BY-SA 4.0 → obra derivada de Bryl Lim publicada bajo la misma CC-BY-SA 4.0, que es exactamente lo que ShareAlike exige. Técnicamente es también lo mejor para una PWA: SVG transparentes de 512×512, tres fotogramas por ejercicio (permite animar la ejecución), y un paquete npm MIT para resolverlos. Corroboración externa independiente: el proyecto open-repset recomienda en su README exactamente estas dos fuentes.

**Condiciones de uso, no negociables:** (1) usarlos **sin modificar** — recolorear o re-estilizar crea obra adaptada y arrastraría ShareAlike sobre nuestras versiones; (2) atribución completa a **ambos** autores con enlace a CC-BY-SA 4.0; (3) leer y verificar `LICENSE-ASSETS` y `ATTRIBUTION.md`, que **no se han comprobado en esta sesión**.

**Limitación conocida y planificable:** 302 ejercicios ilustrados frente a 876 en el catálogo → **más de la mitad quedaría sin imagen**. Hay que decidir de antemano el *fallback* visual (icono por grupo muscular, ilustración genérica por patrón de movimiento) y tratar la cobertura como un problema de producto, no como un bloqueo.

### 9.3 Para el español → **traducción propia del corpus Unlicense**, con hasaneyldrm como atajo condicionado

**Decisión por defecto: traducir nosotros las `instructions` de free-exercise-db.**

**Razonamiento.** Es la **única ruta que produce un activo de localización que nos pertenece**. Como el origen es Unlicense, nuestras traducciones al español son 100% nuestras: sin atribución, sin share-alike, sin obligación de publicarlas. Si en cambio partiéramos de texto CC-BY-SA de wger, nuestra localización al español tendría que publicarse CC-BY-SA — regalándosela a cualquier competidor. Para un producto comercial cuyo mercado es hispanohablante, eso destruye precisamente el diferencial.

**Atajo alternativo, condicionado:** las instrucciones en español de **hasaneyldrm/exercises-dataset** (1.324 ejercicios, español verificado y fluido) están declaradas bajo **MIT** en el fichero de licencia. Si un abogado confirma la titularidad del texto fuente en inglés, ahorraría meses. **Pero la recomendación por defecto no depende de ello**, precisamente porque es un punto no verificable por ingeniería.

**Del modelo de wger tomamos el patrón, no los datos:** `Exercise` (lenguaje-agnóstico) + N × `Translation` (una fila por idioma, con validación de idioma). Es el diseño correcto y hay que adoptarlo desde el día uno.

### 9.4 Para cardio → **FitTrackee como referencia conceptual**, **gpxpy y OpenTracks como código utilizable**

**Decisión: reimplementar el modelo de FitTrackee; integrar gpxpy si hace falta GPX.**

**Razonamiento.** FitTrackee tiene el mejor modelo de actividad outdoor del ecosistema (verificado leyendo su código el 2026-09-16) y es el proyecto más demostrablemente vivo del informe (v1.3.5 el 2026-09-09). Pero es **AGPL-3.0-only**: incorporar su código en una PWA comercial dispararía el artículo 13 y obligaría a entregar el fuente completo a todos los usuarios, sin ruta de licencia comercial disponible. Lo que sí podemos hacer —y debemos— es **aprender de sus decisiones y reimplementarlas**: `duration`/`pauses`/`moving` como tres campos distintos, `ascent`/`descent` separados de `min_alt`/`max_alt`, `elevation_data_source` para saber si la altimetría viene de barómetro, GPS o DEM, `ave_pace`/`best_pace` persistidos, `stopped_speed_threshold` configurable por deporte, y **visibilidad granular por faceta** (`workout_visibility` ≠ `map_visibility` ≠ `analysis_visibility`) — esto último no es un lujo, es lo que exige el RGPD para datos de localización.

Para código real: **gpxpy (Apache-2.0)** es integrable sin fricción y maneja las extensiones GPX como DOM, que es donde viven HR, cadencia y potencia. **OpenTracks (Apache-2.0)** sirve como referencia de interoperabilidad (GPX 1.1, KML/KMZ 2.3), apuntando a Codeberg porque el repo de GitHub está archivado desde el 2025-08-24. **Aviso:** GPX no cubre `.fit`, el formato nativo de Garmin; esa pieza sigue sin resolver.

### 9.5 Solo como referencia conceptual (leer, entender, reimplementar — nunca copiar)

| Fuente | Qué aporta | Por qué no se puede copiar |
|---|---|---|
| **wger (código)** | Separación `Exercise`/`Translation`; esquema TASL de atribución por entrada; reglas de progresión en rutinas | AGPL-3.0-or-later |
| **FitTrackee** | El mejor modelo de actividad outdoor: duración/pausas/movimiento, altimetría, visibilidad granular | AGPL-3.0-only, sin ruta comercial |
| **GoldenCheetah** | Qué métricas de carga/forma implementar (CP, W'bal, PMC) y **cómo nombrarlas sin pisar marcas** — su "BikeStress" en lugar de "TSS" es la lección | GPL-2.0; además incompatible con Apache-2.0 en obra combinada |
| **Liftosaur** | La idea de que la progresión sea configurable por el usuario, no un enum cerrado | AGPL-3.0 **y el titular es competidor comercial directo** |
| **open-repset** | Modelo de sesión de fuerza; patrón de **inyectar el catálogo en build-time** para desacoplar los datos del código | Apache-2.0 — **este sí se puede copiar**; la cautela es de madurez (9 estrellas), no legal |

> El patrón de open-repset de **desacoplar el catálogo del código** merece adoptarse explícitamente: dada la incertidumbre legal de varias fuentes de datos, poder cambiar de proveedor de catálogo sin tocar la app es una **mitigación de riesgo arquitectónica**, no solo una decisión de diseño.

### 9.6 Evitar por completo

| Fuente | Motivo |
|---|---|
| **Imágenes de free-exercise-db (1746 JPG)** | Unlicense declarada, **titularidad no acreditada**; README sin declaración de origen; linaje hacia producto comercial (wrkout.xyz); issues [#2](https://github.com/yuhonas/free-exercise-db/issues/2), [#12](https://github.com/yuhonas/free-exercise-db/issues/12), [#13](https://github.com/yuhonas/free-exercise-db/issues/13) preguntando por el copyright, cerrados sin respuesta pública visible |
| **`images/` y `videos/` de hasaneyldrm** | **Prohibición expresa por escrito**: "Cloning this repository does not grant you any license to the media; obtain your own from Gym visual". Titular identificado, activo y comercial |
| **Catálogo oficial de RepSet** | Misma media de Gym Visual, excluida deliberadamente por su propio autor del repo abierto |
| **exercemus/exercises (datos)** | Licencia por entrada **vacía en 871 de 872 registros**: es imposible cumplir la obligación que el propio README impone |
| **Código de wger, FitTrackee, Liftosaur** | AGPL: copyleft de red, incompatible con producto comercial cerrado |
| **Código de GoldenCheetah** | GPL-2.0: cualquier distribución futura obligaría a liberar el producto entero |
| **chaosbastler/opentraining-exercises** | Sin fichero LICENSE (404 en cinco variantes); CC-BY-SA 3.0 solo declarada en README; metadatos en alemán. Mismo arte disponible con licencia mejor formalizada en 4.0 |
| **Rehospedar vídeos de YouTube** | Los `youtube_id` de rthepen no están cubiertos por su MIT; se rigen por los ToS de YouTube y el copyright de cada canal |
| **Descargas masivas de Wikimedia Commons por categoría** | Licencia **por archivo**, no por categoría; además no verificable en esta sesión |

---

## 10. OPEN QUESTIONS / RIESGOS

**Cuestiones que debe resolver un abogado, no un ingeniero.** Ninguna recomendación de la sección 9 depende de un punto marcado aquí como no verificado — pero varias mejorarían sustancialmente si se resolvieran a favor.

### Riesgos altos (bloquean o cambian decisiones de producto)

1. **Titularidad de las 1746 fotografías de free-exercise-db.** La Unlicense solo transfiere lo que el dedicante poseía. Sin declaración de origen en el README, con linaje documentado hacia un producto comercial y con tres issues públicos sin respuesta visible, **la dedicación al dominio público sobre las imágenes no está acreditada**. *Acción sugerida: contacto escrito con el mantenedor solicitando declaración de origen y titularidad. Hasta entonces, las fotos están fuera.*

2. **Titularidad del texto fuente en inglés de hasaneyldrm/exercises-dataset.** El `LICENSE` declara MIT sobre "instruction text/translations", lo que resolvería el problema del español. Pero los IDs y la nomenclatura son los de la familia ExerciseDB/GymVisual. **¿Tenía el autor derechos sobre el texto inglés original para licenciarlo bajo MIT?** *Es la pregunta con mayor retorno económico de todo el informe: una respuesta afirmativa ahorra meses de localización.*

3. **¿Dónde está exactamente la frontera entre "aprender del modelo de datos" y "obra derivada" en FitTrackee y wger?** La posición de este informe es que nombres de campo, unidades y decisiones funcionales son hechos no protegibles, y que reimplementar es legítimo. **Esa posición necesita validación jurídica antes de escribir el modelo de cardio**, porque el coste de equivocarse con AGPL es tener que abrir el producto entero.

4. **¿Incluir assets CC-BY-SA 4.0 sin modificar en una PWA comercial constituye "Adapted Material"?** De la respuesta depende si el ShareAlike alcanza solo a las ilustraciones o a algo más. La lectura de este informe es que se trata de una colección, no de una adaptación, y que **CC-BY-SA nunca alcanza al código de la aplicación** (a diferencia de AGPL). *Confirmar antes de construir la capa visual sobre workout-guide.*

### Riesgos medios (afectan a cumplimiento y a operativa)

5. **Formato exacto de la atribución CC-BY-SA en una PWA.** ¿Basta una pantalla "Créditos" enlazada desde ajustes, o hace falta atribución junto a cada ilustración? ¿Cómo se cumple "indicate if changes were made" cuando el cambio es solo de tamaño de render? *Define requisitos de UI concretos.*

6. **Compatibilidad CC-BY-SA 3.0 → 4.0.** Parte del arte de Everkinetic circula bajo 3.0 (opentraining-exercises) y parte bajo 4.0 (everkinetic/data, workout-guide). **Si acabamos mezclando, ¿bajo qué versión distribuimos?** La recomendación de ingeniería es no mezclar y quedarse en la cadena 4.0.

7. **ODbL en el catálogo de licencias de wger (pk 5).** Es la única de las cinco opciones con share-alike sobre *bases de datos derivadas* y con cláusula anti-DRM. **Su interacción con una app comercial es la más incierta.** Si alguna vez ingerimos datos de wger, hay que excluir explícitamente las entradas ODbL o analizarlas por separado.

8. **`wger` usa `AGPL-3.0-or-later` y FitTrackee `AGPL-3.0-only`.** No es un detalle cosmético: el "or-later" permite acogerse a futuras versiones de la licencia y el "only" no. *Relevante si alguna vez se plantea una relación más estrecha con cualquiera de los dos.*

9. **Nomenclatura de métricas de entrenamiento y marcas registradas.** "TSS" / "Training Stress Score" están asociados comercialmente a TrainingPeaks; GoldenCheetah usa "BikeStress" para evitarlo. **Necesitamos una revisión de marcas antes de nombrar nuestras métricas de carga.** El modelo fisiológico se puede implementar; el nombre puede no poderse usar.

10. **Términos de Servicio de YouTube** si alguna vez enlazamos vídeo de terceros: qué está permitido incrustar en un producto de pago, y qué obligaciones impone la YouTube API.

11. **Licencia del FIT SDK de Garmin.** GPX está cubierto por gpxpy (Apache-2.0), pero `.fit` es el formato nativo de la mayoría de dispositivos y **su SDK tiene licencia propia que no se ha analizado en esta investigación.**

### Elementos explícitamente NO verificados en esta investigación

| Elemento | Estado |
|---|---|
| Fecha del último commit de **casi todos** los repositorios | **no verificado** (API de GitHub inaccesible) |
| Número real de ejercicios en wger y cuántos tienen traducción al español | **no verificado** (API bloqueada por robots.txt y anti-bot) |
| Distribución real de licencias por entrada en el dataset de wger (cuántas CC0 vs CC-BY-SA) | **no verificado** — **crítico**: determina si la ruta "solo entradas CC0" es viable o testimonial |
| Contenido de `LICENSE-ASSETS` y `ATTRIBUTION.md` de bryllim/workout-guide | **no verificado** — leer antes de construir sobre él |
| Licencias de archivos concretos en Wikimedia Commons | **no verificado** (dominio inaccesible) |
| Si Liftosaur ofrece licencia comercial alternativa o exige CLA | **no verificado** |
| Estado actual del repositorio de OpenTracks en Codeberg | **no verificado** (solo consta que GitHub se archivó el 2025-08-24) |
| Modelo de datos de rutinas y reglas de progresión de wger | **no verificado** (se leyeron los modelos de ejercicio, no los de rutina) |
| Cifra de estrellas de hasaneyldrm/exercises-dataset (22k) | **anómala**; leída dos veces en GitHub, tratada como no fiable. Ninguna recomendación depende de ella |

---

*Documento elaborado el 2026-09-16. Las licencias verificadas por lectura directa de ficheros crudos (método A) y por lectura del código fuente (método B) son las de mayor confianza. Todo lo marcado como "no verificado" debe comprobarse antes de tomar decisiones que dependan de ello.*
