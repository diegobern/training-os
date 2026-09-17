# Email de verificación

## Por qué esto es un archivo y no código

La plantilla del correo **no vive en la app**. Vive en tu proyecto de Firebase, y
solo se puede cambiar desde la consola. Desde el código solo se puede decidir
*a dónde lleva el enlace* — y eso ya está hecho.

## Lo que hay que hacer una vez, a mano

1. Entra en [Firebase Console](https://console.firebase.google.com/) → proyecto
   `training-os-20bf3` → **Authentication** → pestaña **Templates**.
2. Elige **Email address verification** y pulsa el lápiz.
3. Rellena:
   - **Sender name**: `TRAINING OS`
   - **Subject**: `Confirma tu correo y activa tu cuenta`
   - **Message**: pega el contenido de `email-verificacion.html` (todo lo que
     hay debajo del comentario de arriba).
4. Guarda.

Firebase sustituye `%LINK%` por el enlace real y `%DISPLAY_NAME%` por el nombre
que la persona puso al registrarse.

## Lo que ya está hecho en el código

`sendEmailVerification` se llama con una URL de continuación que apunta a
`/auth/verificado`. Así el último paso que ve la persona es la página de la app
confirmando la verificación, no una página de Google.

Esa página (`src/routes/auth/EmailVerified.tsx`) se renderiza **fuera** de la
pantalla de login, porque estos enlaces se abren en el navegador que decida la
app de correo, casi siempre sin sesión iniciada.

## Opcional: que el enlace venga directo a la app

En la consola, en esa misma plantilla, hay un enlace pequeño que dice
**"customize action URL"**. Si lo pones en `https://TU-DOMINIO/auth/verificado`,
el correo apunta directamente a la app y se salta la página intermedia de
Google. La página ya sabe aplicar el `oobCode` ella misma en ese caso.

Requiere que el dominio esté en **Authentication → Settings → Authorized
domains**.
