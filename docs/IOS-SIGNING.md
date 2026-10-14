# iOS — FIRMA Y SUBIDA AL APP STORE

En iOS no existe el almacén de claves irrecuperable de Android: los
certificados los emite Apple, se pueden revocar y se pueden volver a crear. Lo
que **no** tiene vuelta atrás es otra cosa:

> **El identificador `com.trainingos.app` queda unido a la ficha de App Store
> Connect en cuanto se sube la primera compilación.** A partir de ahí no se
> puede cambiar: otra app con otro identificador es otra ficha, sin sus
> valoraciones ni sus usuarios.

Y lo que sí es secreto — la clave `.p8` de la API de App Store Connect, un
certificado exportado como `.p12` — **nunca entra en el repositorio**, que
además es público.

---

## 1. Qué hay en el repositorio y qué no

**En el repositorio (y así se queda):**

* `ios/App/App.xcodeproj/project.pbxproj` — firma automática
  (`CODE_SIGN_STYLE = Automatic`) en los tres targets, los identificadores y la
  versión. Ninguna credencial.
* `ios/App/App/Info.plist` y `ios/App/TrainingOSWidgets/Info.plist` — la
  versión sale de los ajustes del proyecto, no se escribe en ellos.

**Nunca en el repositorio** (`.gitignore`, sección iOS, ya los cubre):

```
*.p8   AuthKey_*.p8          clave de la API de App Store Connect
*.p12  *.cer                 certificados
*.certSigningRequest
*.mobileprovision  *.provisionprofile
ios/App/signing.local.xcconfig
ios/App/App/GoogleService-Info.plist
```

Dos redes más, por si acaso:

* `npm run doctor -- --fix` **no borra nunca** un `.p8`, `.p12`, `.cer`,
  `.mobileprovision`, `.provisionprofile` ni `.certSigningRequest`, aunque no
  estén en el manifiesto de la entrega.
* `npm run ios:verify` **falla** si git tiene — o tendría con `git add` — un
  `.p8`, `.p12`, `.cer`, `.mobileprovision` o un `GoogleService-Info.plist`.

---

## 2. Apple Developer Program

Para TestFlight y el App Store hace falta estar en el **Apple Developer
Program** (cuota anual; <https://developer.apple.com/programs/>). Con un Apple
ID gratuito sólo se puede instalar en tu propio iPhone desde Xcode, con una
firma que caduca a los pocos días.

* **Como particular**: el nombre del vendedor que se ve en el App Store es tu
  nombre legal.
* **Como organización**: hace falta un número D-U-N-S, y el vendedor es la
  empresa.

El Apple ID necesita la verificación en dos pasos activada. El **Team ID** (diez
caracteres) está en <https://developer.apple.com/account> → *Membership
details*. No es secreto: va dentro de cada app firmada.

---

## 3. Equipo e identificadores

| Target | Identificador | Se publica |
| --- | --- | --- |
| App | `com.trainingos.app` | Sí |
| TrainingOSWidgets (Live Activity) | `com.trainingos.app.LiveActivity` | Sí, dentro de la app |
| TrainingOSUITests | `com.trainingos.app.UITests` | No |

* El de la extensión **tiene que empezar** por el de la app más un punto. No
  lo cambies por separado.
* Los dos primeros se registran como **App IDs explícitos** en
  <https://developer.apple.com/account/resources/identifiers>. La firma
  automática de Xcode los registra sola la primera vez que compila para un
  dispositivo o archiva; hazlo antes de crear la ficha de App Store Connect,
  porque ésta sólo deja elegir identificadores ya registrados.
* **Sin capacidades.** No hay que marcar *Push Notifications* (los avisos son
  locales: no hay servidor ni APNs), ni *App Groups* (la extensión no comparte
  datos con la app), ni nada más. Las Live Activities que se actualizan desde
  la app no necesitan ninguna capacidad.
* Si Apple dice que `com.trainingos.app` no está disponible, para antes de
  improvisar: el identificador está también en `capacitor.config.ts`, en la
  ficha de Google Play y en `npm run ios:verify`.

---

## 4. Firma automática en Xcode

1. *Xcode → Settings → Accounts* → añade tu Apple ID.
2. En el navegador de proyecto, el icono azul **App** → target **App** →
   *Signing & Capabilities*.
3. *Automatically manage signing* ya está marcado. Elige tu **Team**.
4. Lo mismo en el target **TrainingOSWidgets**, con **el mismo equipo**.
5. En **TrainingOSUITests**, sólo si vas a lanzar las pruebas de interfaz en
   un iPhone (en el simulador no hace falta).

Xcode crea el certificado de desarrollo y los perfiles. Al archivar para el App
Store usa un certificado de distribución gestionado por Apple, sin que tengas
que exportar nada.

**No añadas ninguna capacidad** con *+ Capability*: crearía un fichero
`.entitlements`, y `npm run ios:verify` falla a propósito si aparece uno.

**Sobre `DEVELOPMENT_TEAM`.** Elegir el equipo escribe
`DEVELOPMENT_TEAM = <Team ID>` en `project.pbxproj`, en cada target. No es un
secreto y se puede versionar; si prefieres que el repositorio público no lo
lleve, descarta ese cambio antes de cada commit. El proyecto no lee hoy
`ios/App/signing.local.xcconfig` (el `.gitignore` sólo reserva el nombre), así
que no cuentes con él sin enlazarlo antes en el proyecto.

---

## 5. La ficha de App Store Connect

En <https://appstoreconnect.apple.com> → *Apps* → **+** → *New App*:

| Campo | Valor |
| --- | --- |
| Platforms | iOS |
| Name | `Training OS` (hasta 30 caracteres; tiene que estar libre en el App Store. El nombre bajo el icono es otra cosa: `CFBundleDisplayName`) |
| Primary Language | Español (España) o English (U.K.): decide cuál; el otro se añade como localización |
| Bundle ID | `com.trainingos.app` |
| SKU | Un código interno, por ejemplo `training-os-ios`. No se puede cambiar |
| User Access | Full Access |

El resto de la ficha — textos, capturas, privacidad, clasificación por edad —
está en `docs/APP-STORE-CHECKLIST.md`.

---

## 6. Versión y número de compilación

| Ajuste | Clave en el Info.plist | Qué es | Regla |
| --- | --- | --- | --- |
| `MARKETING_VERSION` | `CFBundleShortVersionString` | La versión que ve la persona (`1.0.0`) | **Igual que `version` de `package.json`** |
| `CURRENT_PROJECT_VERSION` | `CFBundleVersion` | El número de compilación (`1`, `2`, `3`…) | **Se sube en cada subida** a App Store Connect |

**Los dos se fijan sólo en el proyecto**, no en los targets. La app y la
extensión los heredan, así que siempre coinciden: App Store Connect rechaza una
extensión cuya versión no es la de la app que la contiene. `npm run ios:verify`
falla si un target los redefine.

En Android `versionName` se lee de `package.json` al compilar; **en iOS no hay
nada que lo copie**: cuando cambies `version` en `package.json`, cambia
`MARKETING_VERSION` a mano.

Cómo cambiarlos sin crear una redefinición por target:

* **En Xcode**: icono azul **App** → bajo **PROJECT** (no TARGETS) → *App* →
  *Build Settings* → busca `Marketing Version` y `Current Project Version`.
  **No uses** los campos *Version* y *Build* de la pestaña *General* de un
  target: escriben en ese target y rompen la regla de arriba.
* **A mano**: en `ios/App/App.xcodeproj/project.pbxproj` son cuatro líneas
  — `MARKETING_VERSION` y `CURRENT_PROJECT_VERSION` en las configuraciones
  Debug y Release del proyecto —.

Después, `npm run ios:verify`: la línea de la versión enseña lo que ha quedado.

App Store Connect no acepta dos compilaciones con el mismo número dentro de la
misma versión. Lo más simple es no repetir nunca un número: súbelo siempre,
aunque cambie la versión.

---

## 7. Archivar y subir desde Xcode

1. **`.env` con la configuración real de Firebase** en la raíz del proyecto, y
   `npm run ios:sync`. Sin `.env`, la app sale en modo local, sin cuentas, y no
   da ningún error. Compruébalo igual que en la web (`DESPLIEGUE.md`), sobre la
   copia de iOS: `grep -rl "<id-del-proyecto>" ios/App/App/public/assets/*.js`
   tiene que devolver algo.
2. `npm run ios:verify` en verde.
3. `CURRENT_PROJECT_VERSION` subido (sección 6).
4. En Xcode, destino **Any iOS Device (arm64)**.
5. *Product → Archive*. El esquema archiva en **Release**.
6. Se abre el *Organizer*: elige el archivo → *Distribute App* → **App Store
   Connect** → subir. Xcode firma con el certificado de distribución.
7. App Store Connect procesa la compilación (minutos) y avisa por correo. No
   pregunta por el cifrado: `ITSAppUsesNonExemptEncryption = NO` ya está en el
   `Info.plist`.
8. **TestFlight** → pruebas internas → instálala desde TestFlight en tu iPhone
   y pasa la lista de `docs/APP-STORE-CHECKLIST.md`, sección 6. Una
   compilación de Xcode instalada por cable no es exactamente lo que recibe la
   gente; la de TestFlight, sí.

Opcional, antes de enviar a revisión: en el *Organizer*, clic derecho sobre el
archivo → *Generate Privacy Report*, que junta el manifiesto de la app con los
de sus dependencias. Tiene que cuadrar con `docs/APP-STORE-PRIVACY.md`.

---

## 8. La clave de la API de App Store Connect (`.p8`)

Sólo hace falta para subir desde la línea de comandos o desde la CI. Para
subir desde Xcode basta con tu Apple ID.

1. App Store Connect → *Users and Access* → *Integrations* → *App Store
   Connect API* → *Team Keys* → **+**.
2. Rol: el mínimo que funcione. Para subir compilaciones suele bastar *App
   Manager*; si la CI va a gestionar la firma automática (sección 9), Apple
   puede exigir *Admin*. Compruébalo en la documentación de Apple al crearla.
3. Apunta el **Key ID** y el **Issuer ID** (arriba en esa misma página).
4. Descarga `AuthKey_<KEYID>.p8`. **Sólo se puede descargar una vez.**

Dónde guardarla: **fuera de la carpeta del proyecto**, por ejemplo en
`~/.appstoreconnect/private_keys/`, con copia en un gestor de contraseñas. No
en un correo, no en una nota, no en el repositorio — aunque `.gitignore` la
cubra, fuera del proyecto no puede entrar en un commit ni en el zip de una
entrega.

Si se filtra, **revócala** en esa misma página y crea otra. Revocarla no afecta
a la app publicada.

---

## 9. Firma desde la integración continua (no implementado)

`.github/workflows/ios.yml` **no firma ni sube nada**: compila sin firma
(`CODE_SIGNING_ALLOWED=NO`) y sólo en la rama `ios-parity`. Si algún día se
quiere subir desde la CI, el planteamiento razonable es éste:

* **Un workflow aparte** (por ejemplo `ios-release.yml`), lanzado a mano
  (`workflow_dispatch`) o con una etiqueta de versión. **Nunca** en
  `pull_request`: el repositorio es público.
* **Secretos de GitHub**, nunca en el fichero del workflow:
  - `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID` y el contenido
    del `.p8` (en base64);
  - las siete `VITE_FIREBASE_*`, para escribir `.env` antes de
    `npm run build` — sin ellas la app sale en modo local;
  - el Team ID.
* **Pasos**: `npm ci` → escribir `.env` → `npm run build` →
  `npx cap sync ios` → `npm run ios:verify` → escribir el `.p8` en
  `$RUNNER_TEMP` → `xcodebuild archive` (Release, `generic/platform=iOS`,
  `-allowProvisioningUpdates` y `-authenticationKeyPath`,
  `-authenticationKeyID`, `-authenticationKeyIssuerID`) →
  `xcodebuild -exportArchive` con un `ExportOptions.plist` de método
  `app-store-connect` y destino `upload`, que sube directamente.
* **El número de compilación** se puede pasar en la línea de comandos
  (`CURRENT_PROJECT_VERSION=$GITHUB_RUN_NUMBER`): un ajuste pasado así vale
  para todos los targets, así que la app y la extensión siguen coincidiendo.
* **Alternativa con firma manual**: un certificado *Apple Distribution*
  exportado como `.p12` y los dos perfiles de App Store (app y extensión), en
  base64 como secretos, importados en un llavero temporal del runner.
* **Limpiar siempre** (`if: always()`): borrar el `.p8`, `.env`, el llavero y
  los perfiles al terminar el job.

---

## 10. Lista de comprobación antes de subir

- [ ] La clave `.p8` (si existe) está **fuera** del proyecto y en un gestor de
      contraseñas.
- [ ] `git status` no muestra ningún `.p8`, `.p12`, `.cer`,
      `.mobileprovision` ni `GoogleService-Info.plist`.
- [ ] `git log --all --oneline -- '*.p8' '*.p12' '*.cer' '*.mobileprovision'`
      no devuelve nada (si devuelve algo, revoca esa clave o certificado).
- [ ] `MARKETING_VERSION` = `version` de `package.json`.
- [ ] `CURRENT_PROJECT_VERSION` mayor que el de la última subida.
- [ ] `npm run ios:verify` en verde.
- [ ] La copia web de iOS lleva la configuración real de Firebase (sección 7,
      paso 1).
- [ ] App y extensión firmadas con el mismo equipo.
- [ ] Xcode 26 o posterior. Requisitos de Apple revisados en
      <https://developer.apple.com/news/upcoming-requirements/>.
