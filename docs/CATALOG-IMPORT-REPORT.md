# Informe de importación del catálogo

Generado por `scripts/catalog/import.mjs`. Fecha: 2026-09-16.
Versión del catálogo: 1.

## Resultado

| Cubo | Cantidad |
|---|---|
| **IMPORTED** | 1013 |
| **MERGED** | 35 |
| **SKIPPED** | 0 |
| **REQUIRES REVIEW** | 5 |

De los importados, 172 vienen de Workout Guide: son ejercicios que no
teníamos y que llegaban con ilustración, así que en lugar de descartar la imagen
se creó la entrada.

## Catálogo resultante

| | |
|---|---|
| Total de ejercicios | **1096** |
| Curados a mano (bilingües, revisados) | 69 |
| Fuerza | 920 |
| Cardio | 47 |
| Movilidad | 129 |
| **Con ilustración** | **302** de 302 disponibles |

### Estado de los nombres en español

| Estado | Cantidad | Qué significa |
|---|---|---|
| `reviewed` | 83 | Escrito a mano. Los 69 curados y los 14 de cardio. |
| `machine` | 814 | Traducción por reglas. Marcado como automático en la app. |
| `missing` | 199 | Sin traducción fiable: se muestra el nombre en inglés. |

Las **instrucciones** siguen la misma convención y hoy están todas en inglés
(`esStatus: missing`). El texto original en inglés nunca se modifica; una
traducción corregida a mano lo sustituye en la capa española sin tocarlo.

## Deduplicación

35 entradas del dataset se reconocieron como ejercicios que ya
teníamos y se fusionaron en lugar de duplicarse:

| Método | Cantidad |
|---|---|
| Clave normalizada idéntica | 28 |
| Coincidencia difusa con discriminadores de acuerdo | 7 |

Ejemplos de fusión:

- `Barbell Curl` → lib-barbell-curl
- `Bent Over Two-Dumbbell Row With Palms In` → fx-bent-over-two-dumbbell-row
- `Cable Crunch` → lib-cable-crunch
- `Chin-Up` → lib-chin-up
- `Close-Grip EZ Bar Curl` → fx-close-grip-ez-bar-curl-with-band
- `Dips - Chest Version` → lib-dips-chest
- `Dips - Triceps Version` → lib-dips-triceps
- `Dumbbell Shoulder Press` → lib-dumbbell-shoulder-press

En todos los casos **gana nuestra entrada curada**: el dataset solo rellena
huecos (instrucciones que no teníamos, el campo `force`) y aporta su nombre
como alias, de modo que buscar por él sigue funcionando.

## Emparejamiento de ilustraciones

| Método | Cantidad |
|---|---|
| Clave normalizada | 112 |
| Difuso con discriminadores de acuerdo | 14 |
| Entrada creada a partir de la ilustración | 172 |

La misma regla de palabras discriminantes que usa la deduplicación se aplica
aquí. Sin ella, una sentadilla búlgara heredaba la imagen de una sentadilla a
una pierna y un remo en polea la de un remo con mancuerna. **Una ilustración
equivocada es peor que ninguna, porque el usuario se la cree.**

## Requiere revisión

5 entradas:

- `Iron Cross` — sin instrucciones
- `One-Arm Kettlebell Swings` — sin instrucciones
- `Push Press` — sin instrucciones
- `Side Bridge` — sin instrucciones
- `Side Jackknife` — sin instrucciones

Son ejercicios del dataset sin texto de instrucciones. Se importan igualmente
porque el nombre, el músculo y el equipamiento sí son correctos; simplemente su
HOW TO no tendrá pasos hasta que se escriban.
