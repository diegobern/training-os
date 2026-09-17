# TRAINING OS

Aplicación web para **registrar, analizar y mejorar** tus entrenamientos de gimnasio.
Mobile-first, instalable como app (PWA), funciona sin conexión, y tus datos viven en tu
cuenta: cambias de móvil, inicias sesión y vuelve todo.

```
ENTRENO → REGISTRO → ANÁLISIS → RECOMENDACIÓN → PROGRESO → SIGUIENTE ENTRENAMIENTO
```

---

## 1. Qué hace

| Zona | Qué resuelve |
|------|--------------|
| **HOME** | Qué toca hoy, racha, volumen semanal, último entrenamiento, récords recientes, evolución |
| **ROUTINES** | Varias rutinas, días ilimitados, ejercicios ordenables por arrastre, configuración por ejercicio |
| **WORKOUT** | Modo entrenamiento dedicado: registrar una serie son dos toques |
| **PROGRESS** | Un selector arriba con Resumen, Estadísticas, Récords, Calendario, Cuerpo y Medidas |
| **COACH** | Sobrecarga progresiva con doble progresión, objetivos explicados y detección de estancamiento |
| **HISTORY** | Todo el historial, para siempre |
| **ACCOUNT** | Cuenta, perfil, sincronización entre dispositivos y copias de seguridad |

### Lo que hace bien

- **Registrar una serie en segundos.** Cada serie llega precargada con lo de la última
  vez; muchas veces solo hay que pulsar ✓.
- **Objetivo del día explicado.** El coach no dice "sube peso" y ya: dice por qué, con
  tus números, y siempre etiquetado como *sugerencia*.
- **Nunca sugiere un peso que no existe.** Configuras las mancuernas y discos reales de
  tu gimnasio y todas las recomendaciones se ajustan a esa lista.
- **A prueba de gimnasio.** Cierras la pestaña, se bloquea el móvil, se cae la conexión,
  recargas sin querer: la sesión sigue ahí, y llega a tu cuenta cuando vuelve la red.
- **No inventa datos.** Sin historial suficiente dice *"Todavía no hay datos suficientes"*
  en lugar de dibujar una tendencia falsa.

---

## 2. Arquitectura

### Las tres capas, y qué manda cada una

```
FIRESTORE      la verdad persistente de la cuenta
IndexedDB      la copia local: lo que la interfaz lee, y lo que funciona sin conexión
React state    solo lo que hay en pantalla ahora mismo
```

Escribir va **UI → IndexedDB (instantáneo) → bandeja de salida → Firestore → confirmado**.
Leer va **Firestore → IndexedDB → UI**. La interfaz nunca espera a la red para responder.

### Por qué una bandeja de salida propia y no la caché de Firestore

Firestore trae su propia persistencia offline. Training OS la desactiva a propósito
(`memoryLocalCache`) y mantiene su propia cola en IndexedDB. La razón es que la app ya
tenía una capa offline —la que hace que una sesión sobreviva a un cierre de pestaña— y
dos colas compitiendo hacen imposible responder con honestidad a *"¿se ha guardado mi
serie?"*. Con una sola cola, el estado que ves (`SINCRONIZANDO`, `SINCRONIZADO`,
`N cambios pendientes`) es el estado real.

La cola guarda **intención, no contenido**: una fila por documento que cambió. Al vaciarla
se lee el documento actual y se envía. Una serie editada cinco veces sin cobertura sube
una sola vez, y como el id del documento es estable, un reintento **sobrescribe, nunca
duplica**.

### Conflictos

Todo documento lleva un id estable (UUID) y una marca `_syncedAt` puesta por el servidor.

- Al **bajar**, un documento que sigue en la bandeja de salida local se ignora: lo nuestro
  es más nuevo y ganará en la siguiente subida.
- Al **subir**, gana la última escritura. Para un único usuario en varios dispositivos es
  la regla correcta y es la que se puede explicar sin letra pequeña.
- Los **borrados** viajan como lápidas (`users/{uid}/tombstones`), porque un documento
  borrado en el móvil no se puede "ver" desde el portátil de ninguna otra forma.

### Qué se descarga y cuándo

Al iniciar sesión en un dispositivo limpio, primero bajan **ejercicios y rutinas** —lo
que HOME necesita para pintarse— y el resto (sesiones, series, récords, peso, medidas,
fotos) llega después en segundo plano con una barra de progreso. Las sesiones se paginan
de 50 en 50. Nunca se descargan miles de entrenamientos antes de enseñar la primera
pantalla.

Las **fotos de progreso** sincronizan solo sus metadatos. Los bytes se bajan de Storage la
primera vez que la foto se muestra, y se quedan cacheados.

### Cuentas

Firebase Authentication con email y contraseña, sesión persistente en IndexedDB para que
una PWA instalada siga dentro al día siguiente. La contraseña **nunca** se guarda en
ningún sitio de la app.

El nombre de usuario es nuestro, no de Firebase. Vive en `usernames/{normalizado}` y se
reserva **dentro de una transacción de Firestore**: si dos personas envían el mismo
nombre a la vez, la transacción perdedora ve aparecer el documento y aborta. Un
"comprobar y luego crear" dejaría pasar a las dos.

El login es **por email**, no por usuario. Resolver un usuario a su email requeriría
exponer emails ajenos o montar una Cloud Function; entre una función y la seguridad, aquí
gana la seguridad. Queda documentado como limitación consciente.

### Modo local

Si no hay configuración de Firebase, la app arranca **exactamente como la versión
local-first**: sin cuentas, sin pantalla de login, todo en el dispositivo. El SDK de
Firebase se carga de forma diferida, así que una build sin configurar ni siquiera lo
descarga. Ajustes → Cuenta muestra `FIREBASE NO CONFIGURADO` y **qué variables faltan**.

### Stack

| Pieza | Elección | Por qué |
|-------|----------|---------|
| Build | **Vite 5** | Salida estática, PWA integrada |
| UI | **React 18 + TypeScript** estricto | Tipos donde duelen los errores: el dominio de entrenamiento |
| Estilos | **Tailwind 3** + tokens CSS | Un sistema de tipografía, espaciado y color; claro y oscuro sin duplicar clases |
| Estado | **Zustand** | ~1 kB. Ajustes, sesión activa, cuenta |
| Local | **IndexedDB** vía `idb` | Miles de sesiones, consultas indexadas, blobs |
| Cuenta | **Firebase Auth + Firestore + Storage** (SDK v12, modular) | Cuentas reales, sincronización real, reglas de seguridad reales |
| Gráficas | **SVG propio** | Sin dependencia de charts, control total, 0 kB extra |
| Animaciones | **CSS + Web Animations** | 60 fps sin librería; respeta `prefers-reduced-motion` |
| Arrastrar | **@dnd-kit** | Arrastra solo tras mantener pulsado: el scroll sigue siendo scroll |
| PWA | **vite-plugin-pwa** (Workbox) | Manifest, service worker, instalación |
| i18n | Módulo propio (~40 líneas) | Dos diccionarios planos, 601 claves, sin dependencia |

### Modelo de datos

**Firestore** (todo cuelga del propietario, para que las reglas sean una sola frase):

```
users/{uid}                        perfil + ajustes de la cuenta
users/{uid}/exercises              biblioteca y ejercicios propios
users/{uid}/routines
users/{uid}/sessions
users/{uid}/exerciseLogs           modelo de lectura por (sesión, ejercicio)
users/{uid}/personalRecords
users/{uid}/bodyweight
users/{uid}/measurements
users/{uid}/milestones
users/{uid}/photos                 metadatos; los bytes van a Storage
users/{uid}/tombstones             borrados, para propagarlos entre dispositivos
usernames/{normalizado}            índice de unicidad
```

**Storage**: `users/{uid}/photos/{id}.jpg`, `users/{uid}/avatar.jpg`. Privados.

**IndexedDB** (v2): los mismos almacenes más `syncQueue` y `syncState`. La migración de
v1 a v2 es **puramente aditiva**: no toca ni un dato existente, así que una instalación
con meses de entrenamientos se actualiza sin perder nada.

### Versionado de esquema

Cada perfil guarda `schemaVersion`. Hoy es `1`. Si algún día cambia la forma de los datos,
se añade una migración que **transforma**, nunca una que borre, y se documenta aquí. Un
despliegue nuevo no resetea usuarios, no siembra datos DEMO y no ejecuta nada destructivo.

### Estructura

```
src/
├── components/
│   ├── auth/         marco de las pantallas de cuenta, reglas de contraseña, la puerta
│   ├── charts/       líneas, barras, columnas, sparkline (SVG propio)
│   ├── layout/       marco de página, aviso de actualización, estado de sincronización
│   ├── nav/          navegación inferior
│   ├── progress/     selector de vista
│   ├── settings/     menú de secciones, bloque de cuenta
│   ├── ui/           botones, campos, hojas, iconos, ordenación por arrastre
│   └── workout/      fila de serie, temporizador, objetivo, celebraciones, selector
├── hooks/
├── lib/
│   ├── db/           esquema, conexión, repositorios, catálogo, datos demo
│   ├── firebase/     configuración, arranque diferido, cuenta, rutas, perfil
│   ├── sync/         bandeja de salida y motor de sincronización
│   ├── i18n/         diccionarios es / en
│   └── training/     métricas, pesos disponibles, sobrecarga progresiva, estadísticas
├── routes/           una pantalla por archivo (auth/ aparte)
├── views/            vistas reutilizables que Progress compone
└── store/            app, sesión activa, cuenta, sincronización, avisos
```

---

## 3. Diseño

**Claro por defecto**, oscuro opcional, y la opción de seguir al sistema. El tema se
guarda en la cuenta, así que viaja contigo.

El modo claro está diseñado, no derivado: fondo neutro suave, tarjetas blancas, bordes de
un píxel, sombras muy tenues, y una decisión de marca — el botón principal es **negro con
tipografía volt**, y el verde oliva oscuro se reserva para énfasis, porque el volt sobre
blanco no pasa contraste. Todos los colores de texto y estado superan AA sobre su
superficie.

**Un solo sistema de tipografía.** Ningún componente fija un tamaño en píxeles: usan
nombres — `page`, `section`, `card`, `body`, `secondary`, `caption`, `metric`, `nav` —
definidos una vez en `tailwind.config.js`.

**Los títulos de pantalla** son grandes, están claramente separados de la barra superior
y pegados al contenido que presentan. El espaciado usa una escala con nombre
(`xs sm md lg xl`) aplicada desde un único componente de página.

---

## 4. Cómo funciona el coach

Determinista y explicable. Sin IA, porque las reglas resuelven el problema y además se
pueden justificar con tus propios números.

**Doble progresión**, en este orden:

1. Sin historial → no sugiere nada.
2. **Todas** las series al tope del rango y con el RIR en objetivo → subir al siguiente
   peso que exista en tu gimnasio, esperando volver a la parte baja del rango.
3. Solo la serie top llegó al tope → mantener carga e igualar el resto.
4. Dentro del rango → **+1 repetición** con el mismo peso.
5. Por debajo del mínimo → repetir carga; dos sesiones seguidas → bajar un escalón.

**Estancamiento**: misma carga y sin mejora de repeticiones durante 3 o más sesiones.
Se muestra con tus números y con una frase explícita: *"Es una lectura de tus datos, no un
diagnóstico."*

**1RM estimado**: Epley, `peso × (1 + reps/30)`. Siempre etiquetado `1RM ESTIMADO`.

**Récords**: peso, repeticiones, 1RM estimado y volumen. El de 1RM se omite cuando un
récord de peso o repeticiones ya describe la misma mejora.

---

## 5. Instalación y desarrollo

Requisitos: **Node 18+** (probado con Node 22).

```bash
npm install
cp .env.example .env     # opcional: sin esto arranca en modo local
npm run dev
npm run build            # tipos + build de producción en dist/
npm run preview
```

### Pruebas

| Comando | Qué comprueba | Necesita |
|---------|----------------|----------|
| `npm test` | 102 pruebas de la lógica pura: coach, 1RM, volumen, pesos disponibles, récords, rachas, usuarios, contraseñas, rutas de la cuenta | nada |
| `npm run test:auth` | 17 pruebas reales de Firebase Authentication | emulador de Auth (lo arranca solo) |
| `npm run test:rules` | 22 pruebas de `firestore.rules`: aislamiento entre usuarios, usernames, acceso anónimo | emulador de Firestore |
| `node e2e/flow.mjs` | Recorrido completo de entrenamiento en navegador | `npm run preview` |
| `node e2e/flow2.mjs` | Rutinas, offline, idioma, tema, exportación | `npm run preview` |
| `node e2e/authgate.mjs` | Puerta de autenticación y validación de formularios | build de test + emulador de Auth |
| `node e2e/account.mjs` | Cambio de dispositivo, aislamiento entre usuarios, sync offline | suite completa de emuladores |
| `node e2e/audit.mjs` | Desbordamientos y accesibilidad en 20 rutas × 6 anchos | `npm run preview` |

Consulta [FIREBASE.md](FIREBASE.md) para conectar tu proyecto y ejecutar las pruebas
contra los emuladores.

---

## 6. Despliegue

La app es **estática**. `npm run build` deja todo en `dist/`.

### Netlify (arrastrar y soltar)

1. `npm run build`
2. <https://app.netlify.com/drop>
3. Arrastra la carpeta **`dist`**

`public/_redirects` ya está preparado para que las rutas internas funcionen al recargar.

> Con este método las variables de entorno se **incrustan en el build**, así que tienes
> que tener `.env` relleno **antes** de compilar.

### Netlify conectado a Git (recomendado con Firebase)

`netlify.toml` ya trae el comando, el directorio de publicación, los redirects de SPA, las
cabeceras de caché y la configuración del escáner de secretos. No hay que tocar nada en la
interfaz salvo las variables.

- **Environment variables**: añade las seis `VITE_FIREBASE_*` en
  *Site configuration → Environment variables*

Después, añade el dominio de Netlify en **Authentication → Settings → Authorized domains**
(paso 8 de [FIREBASE.md](FIREBASE.md)).

> **Sobre el escáner de secretos de Netlify.** Falla de dos formas distintas y las dos
> están resueltas en `netlify.toml`. La primera es un falso positivo: el SDK de Firebase
> lleva una clave de ejemplo en los comentarios de sus ficheros de tipos, dentro de
> `node_modules`. La segunda sí es real pero esperada: Vite incrusta todo lo que empieza
> por `VITE_` en el bundle, así que tu `apiKey` acaba en `dist/` —que es exactamente donde
> tiene que estar—. La configuración web de Firebase es pública por diseño; lo que protege
> los datos son las reglas de seguridad. Detalles en [FIREBASE.md](FIREBASE.md).

### Firebase Hosting

`firebase.json` ya está configurado (`public: dist`, rewrites de SPA, caché de assets).

```bash
npm run build
npx firebase deploy --only hosting,firestore:rules,storage
```

### Actualizar

Despliega de nuevo. La app detecta la versión nueva y muestra
*"Hay una versión nueva → Actualizar"*. Nada se actualiza a tu espalda a mitad de un
entrenamiento, y **una actualización no borra datos**: el service worker solo cachea
archivos de la app, nunca toca IndexedDB ni Firestore.

---

## 7. Copias de seguridad

Aunque Firestore sea la fuente de verdad, los datos siguen siendo tuyos y tienen que poder
salir de aquí.

- **Exportar copia (JSON)** — todo: ajustes, biblioteca, rutinas, sesiones, series,
  récords, peso, medidas e hitos. Las fotos se incluyen si activas la opción.
- **Exportar CSV** — una fila por serie registrada.
- **Importar** — *Combinar* (añade lo que falta) o *Reemplazar todo*. La deduplicación es
  por id, así que reimportar el mismo archivo no duplica nada, y lo importado también sube
  a tu cuenta.

---

## 8. Privacidad y seguridad

- Las reglas (`firestore.rules`, `storage.rules`) son la única autorización real. El
  frontend no decide nada de esto.
- Cada usuario solo alcanza `users/{su-uid}`. No existe ninguna regla que dé acceso al
  subárbol de otro.
- El índice de usernames no se puede enumerar y solo lo lee alguien autenticado.
- Las fotos de progreso son privadas por definición: se validan tipo y tamaño al subir y
  nadie más puede leerlas.
- La contraseña no se guarda nunca. Cambiarla o borrar la cuenta exige reautenticarse.
- Borrar la cuenta elimina primero todos los documentos y después el usuario de Auth.

---

## 9. Estado

### Verificado

Rutinas, días, biblioteca, modo entrenamiento, tipos de serie, sesión anterior, precarga,
temporizador de descanso, notas, recuperación de sesión, historial, calendario, resumen,
gráficas, 1RM estimado, volumen, series por músculo, récords automáticos, coach, detección
de estancamiento, animaciones, hitos, cuerpo, exportación e importación, PWA, offline,
español e inglés, tema claro/oscuro/sistema · **Firebase Authentication** (17 pruebas
reales contra el emulador) · **puerta de autenticación** (21 comprobaciones en navegador).

### Implementado, pendiente de verificar con tus credenciales

Firestore, Storage, reglas de seguridad, sincronización entre dispositivos, migración de
datos locales y sincronización offline. El código está completo y las pruebas escritas
(`npm run test:rules`, `node e2e/account.mjs`); lo que falta es un entorno donde el
emulador de Firestore pueda arrancar. Ver el informe de estado y [FIREBASE.md](FIREBASE.md).

### Deliberadamente fuera

- **LEARN** (feed de vídeos) — fuera de alcance por decisión tuya.
- **Login por nombre de usuario** — ver la sección de arquitectura.
- **Notificación del sistema al acabar el descanso** — hay sonido y vibración, que
  funcionan con la app abierta. Una notificación fiable en segundo plano necesita
  permisos y un servicio de push; no se ha simulado algo que no funcionaría.

---

## 10. Resolución de problemas

**"FIREBASE NO CONFIGURADO"** — falta `.env` o alguna variable. Ajustes → Cuenta dice cuál.

**"No se pudo abrir la base de datos local"** — navegación privada o sin espacio.

**Los datos desaparecieron del dispositivo** — el navegador limpió el almacenamiento.
Si tienes cuenta, vuelven al iniciar sesión. Instala la PWA y concede *almacenamiento
persistente* desde Ajustes.

**`auth/unauthorized-domain`** — falta tu dominio en Authorized domains.

**Las rutas dan 404 al recargar** — falta `_redirects`; asegúrate de subir `dist` entera.

**El temporizador no suena** — iOS necesita una interacción antes de permitir audio.

---

## 11. Licencia

Proyecto personal de Diego Bernabeu Martínez. Sin licencia de distribución.
