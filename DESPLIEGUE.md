# Cómo subir una actualización sin romper nada

## Lo primero: qué se puede perder y qué no

Subir una versión nueva **sustituye los archivos de la web**. No toca ninguna
de estas tres cosas:

| Dónde | Qué hay | ¿Lo borra un despliegue? |
|---|---|---|
| IndexedDB, en el móvil de cada persona | rutinas, series, PRs, fotos | **No** |
| Firestore + Storage, en la nube | la misma información, sincronizada | **No** |
| Firebase Auth | las cuentas y contraseñas | **No** |

Lo único que se sustituye es el código. Los datos viven en otro sitio.

**Lo que sí se puede perder es la configuración de Firebase**, y solo de una
manera: construir sin que las variables `VITE_FIREBASE_*` estén disponibles.
Vite las incrusta en el bundle **en el momento de compilar**. Si no están, el
build sale sin Firebase y la app arranca en modo local, sin cuentas y sin
sincronización. No da error: simplemente deja de haber nube.

Por eso el paso 2 de abajo es el que importa.

---

## Camino A — compilas tú y arrastras `dist/` a Netlify

1. `npm install` (por si han cambiado dependencias).
2. **Comprueba que `.env` está en la carpeta del proyecto** con las siete
   variables. Sin él, el build sale sin Firebase.
3. `npm run build`
4. Comprueba que las claves entraron:
   `grep -r "training-os-20bf3" dist/assets/*.js | head -1`
   Si no sale nada, el paso 2 falló. Para y arréglalo antes de subir.
5. Arrastra la carpeta **`dist`** (no el proyecto entero) a Netlify.

En este camino `netlify.toml` no interviene: no está dentro de `dist` y Netlify
no compila nada. Las claves ya van dentro del bundle.

## Camino B — Netlify compila desde GitHub

1. **Antes del primer despliegue así**, en Netlify: *Site configuration →
   Environment variables* → añade las siete variables `VITE_FIREBASE_*` con los
   mismos valores que tu `.env`.

   Esto no es opcional. `.env` está en `.gitignore` y **nunca llega a GitHub**,
   así que Netlify no tiene forma de conocer las claves si no se las das aquí.
2. `git push`. Netlify compila con `netlify.toml`, que ya lleva la lista blanca
   del escáner de secretos.
3. Si falla con "Secrets scanning found...", es que hay una clave nueva que no
   está en `SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES` dentro de `netlify.toml`.
   Añádela ahí.

---

## Qué ve la persona que ya tenía la app instalada

El service worker está en modo `prompt`. Al abrir la app detecta la versión
nueva y muestra un aviso de "actualización disponible" con un botón.

**Hasta que no lo pulse, sigue usando la versión anterior.** Es a propósito:
recargar por sorpresa a alguien a mitad de un entrenamiento le perdería la
serie que estaba escribiendo. Sus datos siguen intactos en las dos versiones.

---

## Si la actualización cambia cómo se guardan los datos

Solo aplica si tocas `src/lib/db/database.ts`. Hoy `DB_VERSION` es **2**.

La regla es: **añadir, nunca sustituir.**

- Sube `DB_VERSION` en uno.
- Dentro de `upgrade()`, añade lo nuevo con el mismo patrón que ya hay:
  `if (!db.objectStoreNames.contains('loQueSea')) { ... }`
- **No borres un `objectStore` ni un índice existente.** Eso sí borra datos de
  verdad, y de forma irreversible en el móvil de cada persona.

Mismo criterio en Firestore: campos nuevos sí, renombrar o eliminar los que ya
usa la gente, no.

---

## Checklist rápido

- [ ] `.env` presente (camino A) o variables puestas en Netlify (camino B)
- [ ] `npm run build` sin errores
- [ ] `grep -r "training-os-20bf3" dist/assets/*.js` devuelve algo
- [ ] Si tocaste la base de datos: `DB_VERSION` subido y nada eliminado
- [ ] Sube `firestore.rules` y `storage.rules` si los has cambiado
      (se despliegan con `firebase deploy --only firestore:rules,storage`,
      no van con la web)
- [ ] Subes la carpeta `dist`, no el proyecto
