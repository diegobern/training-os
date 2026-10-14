# GOOGLE PLAY — LISTA DE PUBLICACIÓN

De arriba abajo. Lo que está marcado con ✅ ya está hecho en el código; lo que
está marcado con ⬜ tienes que hacerlo tú, casi todo en Play Console.

---

## 1. Requisitos técnicos

- ✅ **Identificador de la app**: `com.trainingos.app`. Irreversible una vez
  publicado: no se puede cambiar nunca más.
- ✅ **targetSdk 36** (Android 16). Obligatorio para apps nuevas y
  actualizaciones desde el **31 de agosto de 2026**.
- ✅ **minSdk 24** (Android 7.0). Cubre prácticamente todos los móviles en uso.
- ✅ **Formato AAB**. `npm run android:bundle`.
- ✅ **Firma**. Configurada desde `android/keystore.properties`. Ver
  `docs/ANDROID-SIGNING.md`.
- ⬜ **`trainingOsVersionCode` incrementado** respecto a la última subida
  (`android/gradle.properties`).
- ✅ **Sin tráfico en claro**. `usesCleartextTraffic="false"` y una política de
  red que lo prohíbe en todos los dominios.
- ✅ **Sin copia de seguridad automática**. `allowBackup="false"`, para que la
  copia del sistema no mueva los datos de una cuenta a otro dispositivo.
- ✅ **Depuración del WebView desactivada en release**.
- ✅ **Edge-to-edge**. Obligatorio a partir de targetSdk 35; el CSS ya reserva
  el hueco con `env(safe-area-inset-*)`.

---

## 2. Política de la tienda

- ⬜ **Política de privacidad publicada y accesible**.
  La página está en `public/privacy.html` → se publica en
  `https://<tu-dominio>/privacy.html`.
  **Antes hay que sustituir las 10 apariciones de `COMPLETAR`**: nombre del
  responsable, país y correo de contacto.
- ⬜ **URL de eliminación de cuenta**.
  `public/account-deletion.html` → `https://<tu-dominio>/account-deletion.html`.
  Hay que sustituir `soporte@ejemplo.com` por un correo real.
  Play exige que esta URL sea pública, accesible **sin instalar la app y sin
  iniciar sesión**, y que esté en la ficha de la app.
- ✅ **Eliminación de cuenta dentro de la app**: *Ajustes → Cuenta → Eliminar
  cuenta*. Borra Auth, Firestore, Storage y la copia local.
- ⬜ **Formulario de Seguridad de los datos**. Las respuestas exactas están en
  `docs/GOOGLE-PLAY-DATA-SAFETY.md`. Cópialas tal cual.
- ⬜ **Cuestionario de clasificación por edades** (IARC). Training OS es una app
  de deporte sin contenido sensible: normalmente sale PEGI 3 / Everyone.
- ⬜ **Público objetivo**: adultos. **No** marques la app como dirigida a
  menores; la política de privacidad declara que no lo está.
- ⬜ **Declaración de anuncios**: **no contiene anuncios**.
- ⬜ **Compras en la aplicación**: **ninguna**.
- ⬜ **Permisos de uso sensible**: ninguno que declarar. La app pide tres:
  - `INTERNET`: permiso normal.
  - `POST_NOTIFICATIONS`: los dos avisos del entrenamiento (en curso y
    «Descanso terminado»). No es de uso sensible ni requiere declaración
    aparte.
  - `SCHEDULE_EXACT_ALARM`: para que «Descanso terminado» llegue a su hora.
    **Tampoco lleva declaración en Play Console.** La declaración de la
    política de alarmas exactas es para `USE_EXACT_ALARM`, el permiso que se
    concede solo al instalar y que Google reserva a despertadores y
    calendarios; Training OS no lo pide (`npm run android:verify` falla si
    aparece). `SCHEDULE_EXACT_ALARM` es un acceso especial que concede o
    retira la persona («Alarmas y recordatorios»), viene desactivado desde
    Android 14 y la app funciona sin él (el aviso llega, aproximado). Si al
    rellenar *Contenido de la app* Play preguntara por alarmas exactas, la
    respuesta es ésa: un aviso de fin de descanso que la persona pone en
    marcha al empezar el descanso, y que funciona sin el permiso. Repasa este
    punto en cada envío: es una política que Google ha cambiado más de una vez.
  - No hay servicio en primer plano, así que **no** hay que declarar
    `FOREGROUND_SERVICE_HEALTH`; ni `USE_FULL_SCREEN_INTENT`, que la app no
    pide.
- ⬜ **Datos de contacto del desarrollador** verificados en la cuenta de Play.

---

## 3. Ficha de la tienda

- ⬜ **Icono**: 512×512 PNG, 32 bits, sin transparencia.
  Puedes partir de `public/icons/icon-512.png` o generar uno con la misma marca
  que `npm run android:assets`.
- ⬜ **Gráfico destacado**: 1024×500 PNG o JPG.
- ⬜ **Capturas de teléfono**: mínimo 2, máximo 8. Entre 320 px y 3840 px de
  lado, proporción entre 16:9 y 9:16.
- ⬜ **Descripción breve**: hasta 80 caracteres.
- ⬜ **Descripción completa**: hasta 4000 caracteres.
- ⬜ **Categoría**: Salud y bienestar (o Deportes).
- ⬜ **Idiomas**: la app está en **español e inglés**; declara los dos.

---

## 4. Antes de subir el AAB

Ejecuta todo esto y que dé verde:

```bash
npm run doctor          # que no sobren ficheros de una versión anterior
npm test                # 243 + 43 tests
npm run build           # build web, exit code 0
npm run android:bundle  # AAB firmado
```

Y comprueba a mano, en un móvil real con el APK de release instalado:

- ⬜ Crear una cuenta nueva **no pide verificar el correo**, y lleva
  directamente a username → cuestionario → aplicación.
- ⬜ Cerrar sesión y volver a entrar recupera el entrenamiento.
- ⬜ El botón físico de atrás cierra las hojas antes de navegar, y sólo sale de
  la app desde la pantalla inicial.
- ⬜ Con un entrenamiento en marcha, la primera pulsación de atrás en la raíz
  avisa en vez de salir.
- ⬜ El temporizador de descanso muestra el tiempo correcto después de dejar la
  app en segundo plano dos minutos.

Aviso de descanso y notificación de entrenamiento (en Android 14 o posterior,
que es donde «Alarmas y recordatorios» viene desactivado; si puedes, repítelo
en un Android 12 o 13):

- ⬜ El primer descanso enseña, una sola vez, la hoja «Avisos de descanso a su
  hora». «Ahora no» la cierra y no vuelve a salir en los siguientes descansos
  ni al reabrir la app. Al abrir la app no se pide nada.
- ⬜ **Sin** «Alarmas y recordatorios»: con un descanso en marcha y el móvil
  bloqueado, la notificación de entrenamiento dice «Descanso · hasta HH:MM» con
  la duración subiendo (no hay cuenta atrás), y al acabar llega «Descanso
  terminado», quizá con algo de retraso.
- ⬜ «Activar en Ajustes» abre el ajuste de Training OS; al activarlo y volver,
  el descanso en marcha pasa a cuenta atrás en la notificación.
- ⬜ **Con** el permiso: cuenta atrás en la notificación; a su hora llega
  «Descanso terminado» (en la pantalla de bloqueo y como aviso emergente con el
  móvil desbloqueado en otra app), y la notificación de entrenamiento vuelve a
  contar hacia arriba. La cuenta atrás nunca pasa de cero a números negativos,
  tampoco después de deslizar la notificación o de bloquear y desbloquear.
- ⬜ Con la app delante cuando acaba el descanso, **no** sale la notificación
  «Descanso terminado»: avisa la app.
- ⬜ Pausar, saltar o terminar antes el descanso, y luego bloquear: no llega
  ningún aviso a la hora en que habría acabado.
- ⬜ Finalizar o descartar el entrenamiento durante un descanso: desaparecen
  las dos notificaciones y no llega ningún aviso después.
- ⬜ Tocar «Descanso terminado» abre la app en la sesión y retira el aviso; si
  nadie lo toca, se va solo a los cinco minutos, y también al volver a la app.
- ⬜ Ajustes de la app: sin sonido de descanso pero con vibración, el aviso
  vibra y no suena; con los dos apagados, aparece sin sonar ni vibrar.
- ⬜ Con la app en inglés y el teléfono en español (y al revés), los dos
  avisos y el nombre de sus canales en *Ajustes → Notificaciones* salen en el
  idioma de la app.
- ⬜ Retirar «Alarmas y recordatorios» con un descanso en marcha: Android cierra
  la app (lo hace el sistema). Al reabrirla, el entrenamiento sigue donde
  estaba y el siguiente descanso avisa en modo aproximado.
- ⬜ Vibración háptica: con la respuesta táctil del sistema activada, marcar una
  serie vibra; con ella desactivada en Ajustes del teléfono, no.
- ⬜ En modo claro se ve la hora y la batería (iconos oscuros); en modo oscuro
  también (iconos claros).
- ⬜ La barra inferior no queda debajo de la barra de gestos.
- ⬜ Los enlaces de *Atribuciones* abren una pestaña de Chrome con su barra, no
  una página atrapada dentro de la app.
- ⬜ *Ajustes → Datos → Exportar copia de seguridad* abre el menú de compartir
  y el fichero se puede guardar.
- ⬜ Elegir una foto de progreso abre el selector del sistema y **no** pide
  ningún permiso.
- ⬜ Modo avión: la app sigue abriendo, el catálogo se ve y se puede registrar
  una serie.
- ⬜ Eliminar la cuenta deja la app en la pantalla de bienvenida y, al volver a
  entrar con otra cuenta, no aparece nada de la anterior.

---

## 5. Después de publicar

- ⬜ Guarda una copia del almacén de claves fuera del ordenador.
- ⬜ Activa **Play App Signing** (se ofrece al crear la app; no tiene vuelta
  atrás, y es lo correcto).
- ⬜ Publica primero en **pruebas internas**, instálala desde Play en tu propio
  móvil y repite la lista de la sección 4. Un APK instalado a mano no pasa por
  el reempaquetado de Play, así que no prueba exactamente lo mismo.
- ⬜ Apunta la fecha: si Play te concede prórroga para targetSdk, caduca el
  **1 de noviembre de 2026**.

---

## 6. Lo que esta app NO hace, y por qué importa en la revisión

Google pregunta por estas cosas y la respuesta siempre es la misma: no.

| | |
| --- | --- |
| Anuncios | No. No hay ningún SDK publicitario. |
| Compras / suscripciones | No. Play Billing no está integrado. |
| Health Connect | No. La app no lee ni escribe datos de salud del sistema. |
| Ubicación | No. No hay permiso ni código. |
| Analítica / telemetría | No. Ni Firebase Analytics ni Crashlytics. |
| Contenido generado por usuarios visible para otros | No. Cada cuenta sólo ve lo suyo; las reglas de seguridad lo impiden a nivel de servidor. |
| Permisos peligrosos | Ninguno. |
| Alarmas exactas sin preguntar | No. Sólo `SCHEDULE_EXACT_ALARM`, que concede la persona; nunca `USE_EXACT_ALARM`. |
| Pantalla completa / servicio en primer plano | No. El aviso de descanso es una notificación normal y lo entrega `AlarmManager`. |
