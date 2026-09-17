# Rollback

Cómo deshacer esta ampliación si algo falla en producción. Escrito antes de
necesitarlo, que es la única forma de que sirva.

## Regla que no se rompe

**Una migración remota nunca destruye el documento antiguo antes de verificar el
nuevo.** En concreto:

- Las 69 filas `lib-*` que los usuarios actuales tienen en
  `users/{uid}/exercises` **no se borran**. El catálogo nuevo reutiliza esos
  mismos ids, así que rutinas, `exerciseLogs` y PRs siguen resolviendo. Las
  filas antiguas quedan como sombra redundante e inofensiva.
- `Exercise.isFavorite` **no se borra** al copiarlo a `exercisePrefs`. Los dos
  conviven; si hay que volver atrás, el dato original sigue ahí.
- Ningún campo del esquema se renombra ni se elimina. Todo lo nuevo es aditivo
  y opcional.

## Niveles de marcha atrás, del más barato al más caro

### 1. Apagar una función — segundos, sin desplegar

Los flags viven en el dispositivo. Abre la app con:

```
https://tu-dominio/?ff=newOnboarding:0,cardioV2:0,exerciseMediaV2:0
```

Queda guardado y sobrevive a recargas. Sirve para confirmar si un problema
viene de la ampliación o de otra cosa.

Para apagarlo a todos, cambia el valor por defecto en `src/lib/flags.ts` y
despliega. Es un cambio de una línea.

### 2. Volver al build anterior — un minuto

Netlify guarda todos los despliegues. *Deploys → el anterior → Publish deploy*.
Como los datos viven en el dispositivo y en Firestore, y nada se ha destruido,
la versión antigua los encuentra intactos.

**Lo único que no vuelve solo:** IndexedDB ya estará en la versión 3. Eso no es
un problema — la v2 ignora los stores `catalog` y `exercisePrefs` que no
conoce, y el navegador no degrada la versión. La app antigua funciona con la
base de datos nueva.

### 3. Revertir el código — `git revert`

Los commits están separados por capa a propósito:

```
3c7b4a9  personalización + presupuesto de precache
39cee7e  resolución del catálogo, performance.ts, DB v3, flags
befbfb1  catálogo integrado (assets + importador)
36b2fb9  checkpoint  ← tag pre-expansion
```

`git revert` de uno solo es posible salvo que dependa de otro. El orden seguro
es el inverso al de la lista.

Para volver del todo:

```
git checkout pre-expansion -- src/ public/ vite.config.ts
```

### 4. Retirar el catálogo — cambio de versión, no borrado

El catálogo se identifica por versión (`/catalog/v1/`). Publicar `v2` no toca
`v1`: los clientes que aún apuntan a v1 siguen funcionando. Para retirar una
versión mala basta con volver a apuntar `CATALOG_VERSION` a la anterior en
`src/lib/catalog/store.ts` y desplegar. **Nunca borres una carpeta de catálogo
que algún cliente pueda seguir pidiendo.**

La caché de IndexedDB guarda la versión con la que se llenó y se ignora sola si
no coincide, así que un cliente con v2 cacheada y código de v1 vuelve a pedir
v1 en lugar de servir datos equivocados.

## Qué NO se puede deshacer

Si alguna vez se escribe una migración que sí modifique datos del usuario, aquí
hay que documentar exactamente qué escribe y cómo revertirlo **antes** de
fusionarla. Hoy no hay ninguna: todo lo que esta ampliación escribe en los datos
del usuario es aditivo.

## Firebase App Check

Todavía no está activado. Cuando se active:

- **No** se bloquea el desarrollo local: el token de depuración se registra en
  la consola de Firebase y se usa solo en `localhost`.
- El despliegue se hace primero en **modo monitorización**, que registra las
  peticiones sin rechazarlas. Solo se pasa a obligatorio cuando los registros
  muestran que las peticiones legítimas pasan.
- Marcha atrás: se vuelve a monitorización desde la consola, sin desplegar nada.
