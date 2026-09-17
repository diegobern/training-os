# Conciliación del catálogo

Generado por el importador y verificado por `npm run test:catalog` (33 comprobaciones).
Todas las cifras se calculan, ninguna se escribe a mano.

## Entradas

| Fuente | Cantidad |
|---|---|
| Ejercicios curados en `src/lib/db/catalog.ts` | 69 |
| Cardio escrito a mano | 14 |
| Free Exercise DB | 876 |
| Ilustraciones de Workout Guide | 302 |

## Resultados

| Concepto | Cantidad |
|---|---|
| Entradas curadas (curados + cardio) | 83 |
| Importados de Free Exercise DB | 841 |
| Creados desde una ilustración | 172 |
| Duplicados detectados y **fusionados** | 35 |
| Ilustraciones que encajaron en un ejercicio existente | 130 |
| **Descartados** | 0 |
| **Marcados para revisión** | 5 |

## Las ecuaciones

**free-exercise-db se conserva entero**

```
841 nuevos + 35 fusionados  =  876 de entrada
876  =  876   ✓
```

**cada ilustracion acaba en un ejercicio**

```
172 crearon entrada + 130 encajaron en una existente  =  302 ilustraciones
302  =  302   ✓
```

**el total es la suma de los tres origenes**

```
83 curados + 841 free-exercise-db + 172 everkinetic  =  1096 en el catalogo
1096  =  1096   ✓
```

**ilustrados coincide con el manifiesto**

```
302 con media  =  302 en el manifiesto
302  =  302   ✓
```

El importador **falla y no escribe nada** si alguna de estas cuatro no cuadra.

## Total

```
83 curados
+ 841 free-exercise-db
+ 172 everkinetic
= 1096
```

### Por qué 1096 y no 959

Las 876 entradas del dataset menos 35 fusionadas dan 841, más 83 curadas serían 924.
Las 172 restantes son ejercicios que **no teníamos** y que llegaban con ilustración:
en lugar de descartar la imagen se creó la entrada. De las 302 ilustraciones, 130
encajaron en ejercicios existentes y 172 trajeron uno nuevo.

## Campos de procedencia por ejercicio

Cada entrada del catálogo lleva:

| Campo | Valores |
|---|---|
| `origin` | `curated` · `free-exercise-db` · `everkinetic` · (`custom-user` solo en tiempo de ejecución) |
| `canonicalId` | El id estable. Toda referencia usa este |
| `sourceId` | El id en su fuente original |
| `translationStatus` | `{ name, instructions }`, cada uno `missing` · `machine` · `reviewed` |
| `mediaStatus` | `illustrated` · `none` |

Además, `aliasToCanonical` mapea 1040 ids externos al ejercicio que los absorbió,
así que una referencia a un id fusionado sigue resolviendo.
