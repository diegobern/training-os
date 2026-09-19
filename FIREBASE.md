# Conectar Training OS a Firebase

Guía verificada contra la documentación oficial de Firebase el **15 de septiembre de 2026**.
La consola ha reorganizado su menú lateral: ahora Authentication vive bajo **Security** y
Firestore/Storage bajo **Databases & Storage**. Si ves capturas antiguas con "Build →
Authentication", es la misma pantalla en otro sitio.

Tiempo estimado: **15 minutos**. Coste: **0 €** salvo que actives Storage (ver paso 5).

---

## Resumen

```
1. Crear proyecto Firebase
2. Registrar una Web App  →  te da las 6 variables
3. Activar Authentication (Email/Password)
4. Crear la base de datos Firestore
5. (Opcional) Activar Storage  →  requiere plan Blaze
6. Pegar las variables en .env
7. Publicar las reglas de seguridad
8. Añadir tu dominio a Authorized domains
9. Probar
```

---

## 1. Crear el proyecto

1. Entra en <https://console.firebase.google.com> con tu cuenta de Google.
2. **Create a Firebase project** (o *Añadir proyecto*).
3. Nombre: `training-os` (el ID real será algo como `training-os-4f2a1`).
4. Google Analytics: **desactívalo**. No aporta nada aquí y añade consentimiento y
   configuración que no necesitas.
5. **Create project**.

---

## 2. Registrar la Web App y copiar la configuración

1. En la pantalla inicial del proyecto, pulsa el icono **`</>`** (Web).
2. App nickname: `Training OS`.
3. **No** marques "Also set up Firebase Hosting" salvo que quieras desplegar ahí
   (puedes activarlo después; Training OS funciona igual en Netlify).
4. **Register app**.
5. Verás un bloque `const firebaseConfig = { ... }`. Esos seis valores son los que
   necesitas. Si cierras la ventana, están siempre en
   **⚙ Project settings → General → Your apps → SDK setup and configuration**.

> **Sobre el secreto:** esa configuración **no es secreta**. Va dentro del JavaScript
> que sirve tu web, así que cualquiera puede leerla, y eso es correcto por diseño. Lo
> que protege tus datos son las reglas de seguridad del paso 7. Las guardamos en
> variables de entorno solo para poder cambiar de proyecto sin tocar código.

---

## 3. Authentication — Email / Password

1. Menú lateral → **Security → Authentication** → **Get started**.
2. Pestaña **Sign-in method**.
3. Pulsa **Email/Password** → activa el primer interruptor (**Enable**).
   - Deja **Email link (passwordless sign-in)** desactivado: Training OS no lo usa.
4. **Save**.

### Plantillas de email (recomendado)

**Authentication → Templates**: ahí se editan el email de verificación y el de
recuperar contraseña. Cambia al menos el nombre del remitente para que no llegue como
"noreply@tu-proyecto.firebaseapp.com" sin contexto. El idioma se ajusta en el desplegable
de la esquina de esa misma pantalla.

---

## 4. Firestore

1. Menú lateral → **Databases & Storage → Firestore** → **Create database**.
2. **Location**: elige la región y piénsalo bien, porque **no se puede cambiar después**.
   Desde Irlanda/España, `eur3 (europe-west)` o `europe-west1`.
3. **Secure rules**: elige **Start in production mode** (denegar todo). Las reglas
   correctas se publican en el paso 7. *No empieces en test mode*: deja la base de datos
   abierta a todo el mundo durante 30 días.
4. **Create**.

No hay que crear ninguna colección a mano: la app las crea sola con la primera escritura.

---

## 5. Storage — solo si quieres fotos de progreso y avatar

**Esto sí tiene condiciones económicas:** Cloud Storage for Firebase exige el plan
**Blaze (pago por uso)**, es decir, añadir una tarjeta. Hay capa gratuita mensual y las
cuentas nuevas suelen tener 300 $ de crédito de prueba, y para un uso personal el gasto
real tiende a ser 0 €, pero la tarjeta es obligatoria.

**Si no quieres activarlo, no pasa nada:** Training OS funciona perfectamente sin
Storage. Las fotos de progreso se quedan guardadas en el dispositivo (que es exactamente
como funcionaban antes) y el resto de tus datos se sincroniza igual.

Si decides activarlo:

1. Menú lateral → **Databases & Storage → Storage** → **Get started**.
2. Acepta pasar a Blaze cuando lo pida.
3. Elige ubicación del bucket. Las regiones `US-CENTRAL1`, `US-EAST1` y `US-WEST1`
   entran en la capa "Always Free"; el resto se factura como Google Cloud Storage normal.
4. Reglas: da igual lo que elijas ahora, las sustituyes en el paso 7.

> **Nombre del bucket:** los proyectos creados desde septiembre de 2024 usan
> `PROJECT_ID.firebasestorage.app`. Los anteriores usan `PROJECT_ID.appspot.com`.
> Copia **exactamente** lo que te muestre la consola en `storageBucket`.

---

## 6. Las variables

En la raíz del proyecto, copia `.env.example` a `.env` y rellénalo con lo del paso 2:

```bash
cp .env.example .env
```

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=training-os-4f2a1.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=training-os-4f2a1
VITE_FIREBASE_STORAGE_BUCKET=training-os-4f2a1.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abc123def456
```

`.env` está en `.gitignore`. No lo subas a ningún sitio.

Comprueba que ha funcionado:

```bash
npm run build && npm run preview
```

Si al abrir la app aparece la pantalla de bienvenida con **CREAR CUENTA**, está conectado.
Si entras directo al panel, sigue en modo local: mira **Ajustes → Cuenta**, que te dirá
`FIREBASE NO CONFIGURADO` y **qué variable concreta falta**.

---

## 7. Publicar las reglas de seguridad

Este es el paso que de verdad protege tus datos. Las reglas ya están escritas en el
repositorio (`firestore.rules` y `storage.rules`).

**Opción A — Firebase CLI (recomendada):**

```bash
npx firebase login
npx firebase use --add          # elige tu proyecto
npx firebase deploy --only firestore:rules,storage
```

**Opción B — pegándolas en la consola:**

- **Firestore → Rules**: pega el contenido de `firestore.rules` → **Publish**.
- **Storage → Rules**: pega el contenido de `storage.rules` → **Publish**.

Comprueba después, en **Firestore → Rules → Playground**, que una lectura de
`users/OTRO_UID/sessions/x` sin autenticación sale **denegada**.

---

## 8. Authorized domains

Firebase solo permite autenticarse desde dominios que conozca.

**Security → Authentication → Settings → Authorized domains**.

Ya vienen `localhost`, `PROJECT_ID.firebaseapp.com` y `PROJECT_ID.web.app`. Añade el
dominio donde publiques la app:

- `tu-sitio.netlify.app`
- y tu dominio propio, si lo tienes

Sin esto, el login falla en producción con `auth/unauthorized-domain` aunque todo lo
demás esté bien.

---

## 9. Índices

Ninguno que crear a mano. Training OS consulta cada colección por un único campo
(`_syncedAt`), y Firestore indexa los campos sueltos automáticamente. `firestore.indexes.json`
va vacío a propósito.

Si algún día una consulta necesitara un índice compuesto, Firestore lo dice en un error
de consola con un enlace directo para crearlo.

---

## 10. Probar que funciona de verdad

### En local, contra los emuladores (sin tocar tu proyecto real)

```bash
npm run test:auth      # 17 pruebas reales de Authentication
npm run test:rules     # 22 pruebas de las reglas de seguridad
```

Ambas arrancan el emulador, ejecutan y se apagan solas. No necesitan `.env` ni conexión
a tu proyecto.

Para el recorrido completo con cuentas, sincronización y modo sin conexión:

```bash
npm run build:test              # build apuntando a los emuladores
npm run emulators               # en otra terminal
npx vite preview --port 4190    # en otra más
node e2e/account.mjs
```

### Con tu proyecto real

1. Crea una cuenta desde la app.
2. Mira **Authentication → Users**: tu email debe estar ahí.
3. Mira **Firestore → Data**: debe existir `users/{tu-uid}` y, tras entrenar, sus
   subcolecciones.
4. Entrena algo, cierra sesión, entra desde otro navegador y comprueba que vuelve todo.

---

## Netlify: "Secrets scanning found ... likely secrets"

Si conectas el repositorio a Netlify, el primer build puede fallar así:

```
Secrets scanning found 0 instance(s) of secrets and 1 instance(s) of likely secrets
"AIza***" detected as a likely secret:
  found value at line 164 in node_modules/@firebase/app/dist/app.d.ts
  ...
```

**No es tu clave.** Fíjate en el número: **0 secretos reales**. Lo que ha encontrado son
comentarios de documentación dentro del propio SDK de Firebase:

```ts
// node_modules/@firebase/app/dist/app.d.ts:164
 * (example value: `AIzaSyDOCAbC123dEf456GhI789jKl012-MnO`).
```

Son ocho ficheros `.d.ts` con la clave de ejemplo que Firebase usa en sus docs. Netlify
escanea también `node_modules` y la detecta por su forma. Esa cadena no llega al build:
TypeScript borra los ficheros de tipos al compilar.

`netlify.toml` ya viene con la solución, así que basta con que el repositorio lo incluya:

```toml
[build.environment]
  SECRETS_SCAN_OMIT_PATHS = "node_modules/**"
  SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES = "AIzaSyDOCAbC123dEf456GhI789jKl012-MnO"
  SECRETS_SCAN_OMIT_KEYS = "VITE_FIREBASE_API_KEY,VITE_FIREBASE_AUTH_DOMAIN,..."
```

### Por qué también hace falta `SECRETS_SCAN_OMIT_KEYS`

Es el fallo que te encontrarías justo después. En cuanto añadas las variables reales en
Netlify, Vite incrusta todo lo que empieza por `VITE_` dentro del JavaScript que sirve al
navegador —así funciona el bundler— y entonces el escáner encuentra tu `apiKey` de verdad
en `dist/` y para el build, esta vez como secreto real y no como sospecha.

Esa línea le dice a Netlify que esas siete claves son públicas a propósito. Lo son: la
configuración web de Firebase va en el cliente por diseño y lo que protege los datos son
`firestore.rules` y `storage.rules`. **No añadas nunca a esa lista una credencial de
servidor, un service account ni un token privado**; para eso el escáner está haciendo
justo su trabajo.

Si prefieres no depender de `netlify.toml`, las mismas tres variables se pueden poner en
*Site configuration → Environment variables* (esa vía está documentada explícitamente por
Netlify; la de `netlify.toml` funciona igual pero la documentan menos).

Lo que **no** conviene hacer es poner `SECRETS_SCAN_ENABLED=false`: apaga también la
detección de secretos de verdad en todo el proyecto.

---

## Problemas frecuentes

**`auth/unauthorized-domain`** — falta el dominio en el paso 8.

**`auth/operation-not-allowed`** — el proveedor Email/Password no está activado (paso 3).

**`Missing or insufficient permissions`** — las reglas no se han publicado (paso 7), o
estás intentando leer datos de otro usuario. Lo segundo es que las reglas funcionan.

**El email de verificación no llega** — mira spam. El remitente por defecto acaba en
`firebaseapp.com` y algunos proveedores lo filtran. La verificación es obligatoria,
así que sin ese correo no se entra: la pantalla tiene un botón **Reenviar email**
con un minuto de espera entre intentos.

**Las fotos no se sincronizan** — Storage no está activado (paso 5). Es el
comportamiento esperado: las fotos se quedan en el dispositivo y el resto sí viaja.

**`Could not reach Cloud Firestore backend`** — sin conexión, o la base de datos del
paso 4 no está creada. La app lo muestra y deja reintentar sin cerrarte la sesión.
