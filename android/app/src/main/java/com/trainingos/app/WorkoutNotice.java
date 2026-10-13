package com.trainingos.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.drawable.DrawableCompat;
import com.getcapacitor.Logger;

/**
 * El aviso de «entrenamiento en curso»: cómo se construye, cuándo se enseña y
 * qué entrenamiento enseña.
 *
 * Lo usan dos sitios que no comparten nada más: el plugin, que recibe las
 * órdenes del código web, y WorkoutNoticeDismissedReceiver, que lo vuelve a
 * poner si alguien lo descarta deslizando. Por eso lo que hay que enseñar se
 * guarda en las preferencias de la app y no en el plugin: el receptor puede
 * ejecutarse con la app en segundo plano o con su proceso recién arrancado.
 *
 * Cronómetro del sistema ({@code setUsesChronometer} + {@code setWhen}): el
 * tiempo sube solo en la pantalla de bloqueo sin que la app se despierte, y
 * sin servicio en primer plano.
 */
final class WorkoutNotice {

    static final String CHANNEL_ID = "workout_in_progress";
    static final int NOTIFICATION_ID = 4711;

    /** La acción con la que vuelve a la app el toque en la notificación. */
    static final String ACTION_OPEN_WORKOUT = "com.trainingos.app.OPEN_WORKOUT";

    private static final String PREFS = "training_os_workout_notice";
    private static final String KEY_STARTED_AT = "startedAt";
    private static final String KEY_TITLE = "title";
    private static final String KEY_BODY = "body";

    private WorkoutNotice() {}

    /* ---------------------------------------------------------- estado */

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** El entrenamiento que hay que enseñar, hasta que se llame a {@link #forget}. */
    static void remember(Context context, long startedAt, String title, String body) {
        prefs(context).edit().putLong(KEY_STARTED_AT, startedAt).putString(KEY_TITLE, title).putString(KEY_BODY, body).apply();
    }

    /** Ya no hay entrenamiento: nada vuelve a poner el aviso. */
    static void forget(Context context) {
        prefs(context).edit().clear().apply();
    }

    static boolean isActive(Context context) {
        return prefs(context).contains(KEY_STARTED_AT);
    }

    /** Publica (o vuelve a publicar) el entrenamiento recordado, si lo hay. */
    static boolean postRemembered(Context context) {
        SharedPreferences p = prefs(context);
        if (!p.contains(KEY_STARTED_AT)) return false;
        return post(context, p.getLong(KEY_STARTED_AT, 0L), p.getString(KEY_TITLE, ""), p.getString(KEY_BODY, ""));
    }

    static void cancel(Context context) {
        try {
            NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID);
        } catch (RuntimeException e) {
            Logger.error("WorkoutNotification", "no se pudo retirar el aviso", e);
        }
    }

    /* --------------------------------------------------- notificación */

    /** Publica el aviso. Devuelve si ha llegado a enseñarse. Nunca lanza. */
    static boolean post(Context context, long startedAt, String title, String body) {
        try {
            NotificationManagerCompat manager = NotificationManagerCompat.from(context);
            if (!manager.areNotificationsEnabled()) return false;
            if (
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) {
                return false;
            }
            ensureChannel(context);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_workout)
                .setColor(ContextCompat.getColor(context, R.color.brandBolt))
                .setContentTitle(title)
                .setContentText(body)
                // El cronómetro: lo pinta el sistema desde esta hora.
                .setWhen(startedAt)
                .setShowWhen(true)
                .setUsesChronometer(true)
                // Persistente mientras dure el entrenamiento y sin ruido al actualizarse.
                .setOngoing(true)
                .setAutoCancel(false)
                .setOnlyAlertOnce(true)
                .setCategory(
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? Notification.CATEGORY_WORKOUT : NotificationCompat.CATEGORY_STOPWATCH
                )
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                // Entera en la pantalla de bloqueo: dice que estás entrenando y cuánto
                // llevas, nada que haya que esconder.
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(openWorkoutIntent(context))
                // Si se descarta deslizando, vuelve: ver WorkoutNoticeDismissedReceiver.
                .setDeleteIntent(dismissedIntent(context));

            Bitmap tile = brandTile(context);
            if (tile != null) builder.setLargeIcon(tile);

            manager.notify(NOTIFICATION_ID, builder.build());
            return true;
        } catch (RuntimeException e) {
            Logger.error("WorkoutNotification", "no se pudo publicar el aviso", e);
            return false;
        }
    }

    /**
     * Importancia DEFAULT y no LOW, a propósito: en muchos Android la pantalla
     * de bloqueo oculta por defecto las notificaciones «silenciosas», que son
     * justo las de importancia baja, y este aviso existe para verse ahí. Se
     * le quitan el sonido, la vibración, la luz y el globo del icono, así que
     * en la práctica no interrumpe nada.
     */
    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager system = context.getSystemService(NotificationManager.class);
        if (system == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.workout_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription(context.getString(R.string.workout_channel_description));
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.enableLights(false);
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        // Idempotente: si ya existe, sólo actualiza el nombre y la descripción.
        system.createNotificationChannel(channel);
    }

    private static PendingIntent openWorkoutIntent(Context context) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(ACTION_OPEN_WORKOUT);
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent dismissedIntent(Context context) {
        Intent intent = new Intent(context, WorkoutNoticeDismissedReceiver.class);
        return PendingIntent.getBroadcast(context, 1, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /**
     * El icono grande: la baldosa de la marca, el rayo verde sobre tinta, igual
     * que el icono de la app. Se dibuja aquí, a la medida exacta que pide el
     * sistema, a partir del mismo trazado que el icono pequeño.
     */
    private static Bitmap brandTile(Context context) {
        try {
            int size = context.getResources().getDimensionPixelSize(android.R.dimen.notification_large_icon_width);
            Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);

            Paint ink = new Paint(Paint.ANTI_ALIAS_FLAG);
            ink.setColor(ContextCompat.getColor(context, R.color.brandInk));
            float radius = size * 0.28f;
            canvas.drawRoundRect(new RectF(0, 0, size, size), radius, radius, ink);

            Drawable bolt = ContextCompat.getDrawable(context, R.drawable.ic_stat_workout);
            if (bolt == null) return bitmap;
            bolt = DrawableCompat.wrap(bolt).mutate();
            DrawableCompat.setTint(bolt, ContextCompat.getColor(context, R.color.brandBolt));
            int inset = Math.round(size * 0.2f);
            bolt.setBounds(inset, inset, size - inset, size - inset);
            bolt.draw(canvas);
            return bitmap;
        } catch (RuntimeException e) {
            // Sin icono grande la notificación sigue siendo correcta.
            Logger.error("WorkoutNotification", "no se pudo dibujar el icono", e);
            return null;
        }
    }
}
