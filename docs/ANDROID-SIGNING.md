# ANDROID — FIRMA

Lo primero, porque es lo que no tiene arreglo:

> **El almacén de claves con el que firmes la primera subida a Google Play es el
> único con el que podrás publicar actualizaciones de esta app, para siempre.**
> Si lo pierdes, o pierdes su contraseña, no hay recuperación: la única salida
> es publicar una app nueva con otro identificador y pedir a todos tus usuarios
> que la instalen de cero.

Guarda una copia fuera de tu ordenador, y la contraseña en un gestor de
contraseñas. No en un correo, no en una nota, no en el repositorio.

---

## 1. Qué hay en el repositorio y qué no

**En el repositorio (y así se queda):**

* `android/app/build.gradle` — lee la configuración de firma, pero no contiene
  ninguna credencial.
* `android/gradle.properties` — sólo `trainingOsVersionCode`.

**Nunca en el repositorio** (`.gitignore` ya los cubre):

```
*.jks   *.keystore   *.p12   *.pepk
android/keystore.properties
android/local.properties
play-service-account*.json
```

Si el build de release se ejecuta sin `android/keystore.properties`, **no
falla**: genera el artefacto sin firmar. Eso permite que cualquiera compile y
revise el proyecto sin tener tus claves, y hace imposible que una clave acabe
dentro de un commit por descuido.

---

## 2. Crear el almacén de claves

Una sola vez, en tu máquina, **fuera** de la carpeta del proyecto:

```bash
keytool -genkeypair -v \
  -keystore ~/claves/training-os-release.jks \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -alias training-os
```

`keytool` viene con el JDK. Te pedirá:

* Una contraseña para el almacén.
* Una contraseña para la clave (puede ser la misma).
* Nombre, organización, ciudad, país. Aparecen en el certificado; pon datos
  reales pero no hace falta que sean una empresa.

`-validity 10000` son unos 27 años. Google Play exige que el certificado sea
válido al menos hasta el 22 de octubre de 2033.

**Por qué fuera del proyecto:** para que no pueda entrar en un commit ni en el
zip de una entrega ni por accidente.

---

## 3. Conectarlo al build

Crea `android/keystore.properties` (este fichero **está ignorado por git**):

```properties
storeFile=/home/tu-usuario/claves/training-os-release.jks
storePassword=la-contraseña-del-almacén
keyAlias=training-os
keyPassword=la-contraseña-de-la-clave
```

`storeFile` puede ser una ruta absoluta o relativa a la carpeta `android/`. Usa
absoluta: es menos ambigua y no depende de desde dónde ejecutes Gradle.

Comprueba que sigue ignorado antes de nada:

```bash
git check-ignore -v android/keystore.properties
```

Si ese comando **no** imprime nada, algo va mal en tu `.gitignore` y no debes
continuar.

---

## 4. Generar el AAB para Google Play

```bash
npm run android:bundle
```

Sale en:

```
android/app/build/outputs/bundle/release/app-release.aab
```

Google Play quiere un **AAB** (Android App Bundle), no un APK. El APK sólo lo
necesitas para probar en tu propio móvil.

Comprueba que ha quedado firmado:

```bash
# apksigner viene en el SDK, en build-tools/36.x/
~/Android/Sdk/build-tools/36.0.0/apksigner verify --print-certs \
  android/app/build/outputs/apk/release/app-release.apk
```

(Para el AAB, `jarsigner -verify -verbose android/app/build/outputs/bundle/release/app-release.aab`.)

---

## 5. Play App Signing

Google Play, por defecto, **vuelve a firmar** tu app con una clave que guarda
él. La clave que acabas de crear pasa a ser tu *clave de subida*: la que
demuestra que eres tú quien sube el AAB.

Esto es bueno: si pierdes la clave de subida, Google puede darte una nueva
(tarda unos días y hay que demostrar la identidad). Lo que **no** se puede
perder es la clave de firma de app, y ésa la guarda Google.

Se activa al crear la app en Play Console y no tiene vuelta atrás. Acéptalo: la
alternativa es asumir tú un riesgo sin recuperación posible.

---

## 6. Si firmas desde integración continua

No metas el `.jks` en el repositorio, ni siquiera cifrado con una clave que
también esté en el repositorio.

Lo razonable es guardar el almacén en base64 como secreto del sistema de CI y
reconstruirlo en tiempo de ejecución:

```bash
echo "$ANDROID_KEYSTORE_BASE64" | base64 -d > "$RUNNER_TEMP/release.jks"
cat > android/keystore.properties <<PROPS
storeFile=$RUNNER_TEMP/release.jks
storePassword=$ANDROID_KEYSTORE_PASSWORD
keyAlias=$ANDROID_KEY_ALIAS
keyPassword=$ANDROID_KEY_PASSWORD
PROPS
```

Y borrar ambos ficheros al terminar el job. Las cuatro variables van como
secretos del CI, nunca en el fichero del workflow.

---

## 7. Lista de comprobación antes de subir

- [ ] El almacén de claves tiene copia de seguridad **fuera** de este ordenador.
- [ ] La contraseña está en un gestor de contraseñas.
- [ ] `git check-ignore -v android/keystore.properties` imprime una regla.
- [ ] `git status` no muestra ningún `.jks`, `.keystore` ni `keystore.properties`.
- [ ] `git log -p --all -- '*.jks' '*.keystore' 'android/keystore.properties'` no
      devuelve nada (si devuelve algo, esa clave está comprometida: crea otra).
- [ ] `trainingOsVersionCode` es mayor que el de la última subida.
- [ ] El AAB está firmado (verificado con `jarsigner -verify`).
