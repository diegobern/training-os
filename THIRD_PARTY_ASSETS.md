# Contenido de terceros en TRAINING OS

Registro de todo dato o material de terceros incorporado al producto, con su
licencia y cómo se verificó. **Nada entra aquí sin licencia clara.**

Última revisión: **2026-09-16**.

---

## 1. Ilustraciones de ejercicios — Workout Guide / Everkinetic

| | |
|---|---|
| **Qué se usa** | 906 ficheros SVG (302 ejercicios × 3 fotogramas), en `public/exercise-media/` |
| **Repositorio** | https://github.com/bryllim/workout-guide |
| **Autor** | Bryl Lim — https://bryllim.com |
| **Fuente original de parte del arte** | Everkinetic — https://github.com/everkinetic/data |
| **Licencia de las imágenes** | **CC BY-SA 4.0** |
| **Texto de la licencia** | https://creativecommons.org/licenses/by-sa/4.0/legalcode |
| **Cómo se verificó** | Descarga directa de `LICENSE-ASSETS` del paquete npm (texto íntegro CC BY-SA 4.0) y de `LICENSE.md` de `everkinetic/data` rama `main` (texto íntegro CC BY-SA 4.0), el 2026-09-16 |
| **Modificaciones** | **Ninguna.** Los SVG se copian tal cual. Se probó `svgo` y solo daba un 1 %, así que no compensaba introducir una modificación que declarar |

Según `ATTRIBUTION.md` del propio paquete, 76 fotogramas de posición inicial son
adaptaciones rasterizadas de arte de Everkinetic; el resto es obra propia de
Bryl Lim. La procedencia exacta por fotograma, incluida la URL del SVG original
de Everkinetic y la descripción del cambio, se conserva en
`public/catalog/v1/media-attribution.json`.

### Obligaciones que asumimos

CC BY-SA 4.0 exige tres cosas, y las tres se cumplen:

1. **Atribuir** — pantalla *Ajustes → Atribuciones* dentro de la app, más este
   fichero. Cada ilustración muestra además su autoría en el HOW TO.
2. **Enlazar la licencia** — enlace a creativecommons.org junto a la atribución.
3. **Compartir igual** — si alguna vez modificamos una ilustración, la versión
   modificada se publica bajo CC BY-SA 4.0. Hoy no modificamos ninguna.

### Separación respecto al código

**El share-alike de CC BY-SA alcanza a las imágenes, no al código de TRAINING
OS.** Los SVG son obras independientes que la app muestra; no se compilan dentro
del bundle, no se incrustan en el código fuente y no forman una obra derivada
con él. Para que esa separación sea evidente y no dependa de un argumento:

- viven **solo** en `public/exercise-media/`, nunca importados desde un `.ts`;
- se sirven como ficheros estáticos por URL, nunca como `data:` incrustado;
- su licencia va declarada en `public/exercise-media/LICENSE`, dentro de la
  propia carpeta.

## 2. Metadatos de ejercicios — Free Exercise DB

| | |
|---|---|
| **Qué se usa** | Nombres, músculos primario y secundarios, equipamiento, nivel, mecánica, categoría e **instrucciones en inglés** de 876 ejercicios |
| **Repositorio** | https://github.com/yuhonas/free-exercise-db |
| **Licencia** | **Unlicense** (dedicación al dominio público) |
| **Cómo se verificó** | Descarga directa de `LICENSE.md` el 2026-09-16; texto íntegro de The Unlicense |
| **Obligaciones** | Ninguna. La Unlicense no exige atribución ni compartir igual |

### Lo que NO se usa, y por qué

**Las 1.746 fotografías de este repositorio están excluidas deliberadamente.**

El `README.md` del repositorio no declara de dónde salen las fotos. Dice que los
datos derivan de [`wrkout/exercises.json`](https://github.com/wrkout/exercises.json),
cuyo repositorio **no tiene fichero de licencia** (verificado: HTTP 404 el
2026-09-16) y cuyo README anuncia un producto **comercial** de imágenes.

Una dedicación al dominio público hecha por quien no es titular de los derechos
no transfiere nada. Mientras esa cadena no esté acreditada, las fotografías no
entran en el producto.

El pipeline lo impide de forma activa: `scripts/catalog/import.mjs` no lee en
ningún momento el campo `images` del dataset.

## 3. Metadatos de Workout Guide

| | |
|---|---|
| **Qué se usa** | Nombre, equipamiento y músculos de 302 ejercicios, usados para crear las entradas que no teníamos |
| **Licencia** | **MIT** (`LICENSE` del paquete, cubre código y metadatos) |
| **Cómo se verificó** | Descarga directa de `LICENSE` del paquete npm el 2026-09-16 |
| **Obligaciones** | Conservar el aviso de copyright, incluido en este fichero y en la pantalla de atribuciones |

Nota: en este paquete conviven dos licencias. `LICENSE` (MIT) cubre el código y
los metadatos; `LICENSE-ASSETS` (CC BY-SA 4.0) cubre las imágenes. TRAINING OS
las trata por separado, como hace el propio proyecto.

## 4. Usado solo como referencia conceptual — nada copiado

| Proyecto | Licencia | Por qué no se copia |
|---|---|---|
| [wger](https://github.com/wger-project/wger) | AGPL-3.0-or-later (código); datos CC variables **por entrada** | El código es AGPL. Además, traducir texto CC-BY-SA al español sería una obra derivada y obligaría a publicar nuestra localización bajo CC-BY-SA |
| [FitTrackee](https://github.com/SamR1/FitTrackee) | AGPL-3.0-only | Su modelo de actividad se usa como referencia de diseño; no se copia código |
| [exercemus/exercises](https://github.com/exercemus/exercises) | Declara licencia por entrada | 871 de 872 registros tienen el campo `license` vacío: es imposible cumplir la obligación |
| Datasets con media de Gym Visual | Prohibido explícitamente | Su propia licencia excluye la media |

## 5. Fuentes y tipografía

La app usa la pila de fuentes del sistema (`-apple-system`, `Segoe UI`, `Roboto`).
No se incorpora ninguna tipografía de terceros.

---

## Procedimiento para añadir una fuente nueva

1. Descargar el fichero de licencia de la **fuente primaria** y leerlo entero.
2. Comprobar que quien publica **es titular** del material. Si la cadena se
   rompe, se descarta.
3. Añadir la comprobación a `validateLicenses()` en `scripts/catalog/import.mjs`
   — el importador falla si la licencia no coincide con la revisada.
4. Registrar la entrada en este fichero antes de importar nada.
5. Si la licencia exige atribución, añadirla a la pantalla de atribuciones.
