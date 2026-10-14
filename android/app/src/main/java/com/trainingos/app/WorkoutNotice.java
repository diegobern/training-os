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
import java.text.DateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;

/**
 * El aviso de «entrenamiento en curso»: cómo se construye, cuándo se enseña y
 * qué entrenamiento enseña.
 *
 * Lo usan tres sitios que no comparten nada más: el plugin, que recibe las
 * órdenes del código web; WorkoutNoticeDismissedReceiver, que lo vuelve a
 * poner si alguien lo descarta deslizando, y RestAlarmReceiver, que lo
 * devuelve a modo cronómetro cuando acaba el descanso. Por eso lo que hay que
 * enseñar se guarda en las preferencias de la app y no en el plugin: los
 * receptores pueden ejecutarse con la app en segundo plano o con su proceso
 * recién arrancado.
 *
 * Se pinta SIEMPRE con {@link #postRemembered}, desde las preferencias y con
 * la hora de ese momento. No hay otro camino: así ninguna re-publicación (al
 * bloquear, al deslizarlo, al acabar el descanso) puede enseñar una cuenta
 * atrás ya vencida.
 *
 * Cronómetro del sistema ({@code setUsesChronometer} + {@code setWhen}): el
 * tiempo corre solo en la pantalla de bloqueo sin que la app se despierte, y
 * sin servicio en primer plano. Hacia arriba desde el inicio del
 * entrenamiento o, durante un descanso con alarma exacta, hacia abajo hasta
 * su final ({@code setChronometerCountDown}).
 */
final class WorkoutNotice {

    static final String CHANNEL_ID = "workout_in_progress";
    static final int NOTIFICATION_ID = 4711;

    /** La acción con la que vuelve a la app el toque en la notificación. */
    static final String ACTION_OPEN_WORKOUT = "com.trainingos.app.OPEN_WORKOUT";
    /** La sesión a la que lleva ese toque (evento {@code open} del plugin). */
    static final String EXTRA_SESSION_ID = "sessionId";

    /**
     * Un solo cerrojo para todo lo que lee o escribe estas preferencias y
     * publica a partir de ellas. Los métodos del plugin corren en su hilo y los
     * receptores en el principal; sin él, dos re-publicaciones cruzadas podrían
     * dejar en pantalla la que se pintó con los datos más viejos.
     */
    static final Object LOCK = new Object();

    private static final String PREFS = "training_os_workout_notice";
    // Las de la primera versión. Si sólo están éstas (una actualización con un
    // entrenamiento a medias), el aviso se pinta como entonces: cronómetro,
    // título y texto.
    private static final String KEY_STARTED_AT = "startedAt";
    private static final String KEY_TITLE = "title";
    private static final String KEY_BODY = "body";
    // Las del descanso. Opcionales al leer, siempre.
    private static final String KEY_SESSION_ID = "sessionId";
    private static final String KEY_SESSION_NAME = "sessionName";
    private static final String KEY_EXERCISE_NAME = "exerciseName";
    private static final String KEY_SET_LABEL = "setLabel";
    private static final String KEY_PROGRESS_LABEL = "progressLabel";
    private static final String KEY_LOCALE = "locale";
    private static final String KEY_LABEL_REST = "labelRest";
    private static final String KEY_LABEL_REST_OVER = "labelRestOver";
    private static final String KEY_LABEL_ELAPSED = "labelElapsed";
    private static final String KEY_LABEL_PAUSED = "labelPaused";
    private static final String KEY_LABEL_REST_UNTIL = "labelRestUntil";
    private static final String KEY_REST_ENDS_AT = "restEndsAt";
    private static final String KEY_REST_PAUSED = "restPaused";
    private static final String KEY_REST_REMAINING = "restRemaining";
    private static final String KEY_CHANNEL_NAME = "channelName";
    private static final String KEY_CHANNEL_DESCRIPTION = "channelDescription";

    private static final String[] PRESENCE_KEYS = {
        KEY_STARTED_AT,
        KEY_TITLE,
        KEY_BODY,
        KEY_SESSION_ID,
        KEY_SESSION_NAME,
        KEY_EXERCISE_NAME,
        KEY_SET_LABEL,
        KEY_PROGRESS_LABEL,
        KEY_LOCALE,
        KEY_LABEL_REST,
        KEY_LABEL_REST_OVER,
        KEY_LABEL_ELAPSED,
        KEY_LABEL_PAUSED,
        KEY_LABEL_REST_UNTIL,
        KEY_REST_ENDS_AT,
        KEY_REST_PAUSED,
        KEY_REST_REMAINING,
    };
    private static final String[] REST_KEYS = { KEY_REST_ENDS_AT, KEY_REST_PAUSED, KEY_REST_REMAINING };

    /**
     * Margen para dar por «el mismo descanso» el final que guarda la
     * presencia y la hora de la alarma: las dos salen del mismo {@code endsAt}
     * en JavaScript, pero no hace falta exigir el milisegundo.
     */
    static final long SAME_REST_MS = 1000L;

    /**
     * Si la actividad se ve ahora mismo. Lo fija el plugin en handleOnStart y
     * handleOnStop. Es del proceso: si el proceso es nuevo (lo ha arrancado una
     * alarma), la app no se está viendo, y {@code false} es justo lo correcto.
     */
    private static volatile boolean appVisible = false;

    private WorkoutNotice() {}

    /* ------------------------------------------------------------ datos */

    /** Lo que manda {@code start}. Todo texto llega ya traducido con t(). */
    static final class Presence {

        final long startedAt;
        final String title;
        final String body;
        /** null si lo manda un JavaScript anterior al descanso. */
        final String sessionId;
        final String sessionName;
        final String exerciseName;
        final String setLabel;
        final String progressLabel;
        final String locale;
        /** null: sin etiquetas (preferencias de la versión anterior). */
        final Labels labels;
        /** null: no hay descanso, o ya ha terminado. */
        final Rest rest;

        Presence(
            long startedAt,
            String title,
            String body,
            String sessionId,
            String sessionName,
            String exerciseName,
            String setLabel,
            String progressLabel,
            String locale,
            Labels labels,
            Rest rest
        ) {
            this.startedAt = startedAt;
            this.title = title;
            this.body = body;
            this.sessionId = sessionId;
            this.sessionName = sessionName;
            this.exerciseName = exerciseName;
            this.setLabel = setLabel;
            this.progressLabel = progressLabel;
            this.locale = locale;
            this.labels = labels;
            this.rest = rest;
        }
    }

    /** Las palabras del aviso, en el idioma de la app. Cualquiera puede faltar. */
    static final class Labels {

        final String rest;
        final String restOver;
        final String elapsed;
        final String paused;
        /** «Descanso · hasta 12:30» ya formado por la app. Opcional. */
        final String restUntil;

        Labels(String rest, String restOver, String elapsed, String paused, String restUntil) {
            this.rest = rest;
            this.restOver = restOver;
            this.elapsed = elapsed;
            this.paused = paused;
            this.restUntil = restUntil;
        }
    }

    static final class Rest {

        /** Milisegundos de época. */
        final long endsAt;
        final boolean paused;
        /** Segundos que quedaban al pausar; sólo cuenta si {@link #paused}. */
        final long remaining;

        Rest(long endsAt, boolean paused, long remaining) {
            this.endsAt = endsAt;
            this.paused = paused;
            this.remaining = remaining;
        }
    }

    /* ---------------------------------------------------------- estado */

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void setAppVisible(boolean visible) {
        appVisible = visible;
    }

    static boolean isAppVisible() {
        return appVisible;
    }

    /** El entrenamiento que hay que enseñar, hasta que se llame a {@link #forget}. */
    static void remember(Context context, Presence p) {
        synchronized (LOCK) {
            SharedPreferences.Editor e = prefs(context)
                .edit()
                .putLong(KEY_STARTED_AT, p.startedAt)
                .putString(KEY_TITLE, p.title)
                .putString(KEY_BODY, p.body);
            putOrRemove(e, KEY_SESSION_ID, p.sessionId);
            putOrRemove(e, KEY_SESSION_NAME, p.sessionName);
            putOrRemove(e, KEY_EXERCISE_NAME, p.exerciseName);
            putOrRemove(e, KEY_SET_LABEL, p.setLabel);
            putOrRemove(e, KEY_PROGRESS_LABEL, p.progressLabel);
            putOrRemove(e, KEY_LOCALE, p.locale);
            Labels l = p.labels;
            putOrRemove(e, KEY_LABEL_REST, l == null ? null : l.rest);
            putOrRemove(e, KEY_LABEL_REST_OVER, l == null ? null : l.restOver);
            putOrRemove(e, KEY_LABEL_ELAPSED, l == null ? null : l.elapsed);
            putOrRemove(e, KEY_LABEL_PAUSED, l == null ? null : l.paused);
            putOrRemove(e, KEY_LABEL_REST_UNTIL, l == null ? null : l.restUntil);
            if (p.rest == null) {
                for (String key : REST_KEYS) e.remove(key);
            } else {
                e.putLong(KEY_REST_ENDS_AT, p.rest.endsAt).putBoolean(KEY_REST_PAUSED, p.rest.paused).putLong(KEY_REST_REMAINING, p.rest.remaining);
            }
            e.apply();
        }
    }

    /**
     * El nombre y la descripción del canal en el idioma de la app, que es en
     * el que se tiene que ver todo lo de Training OS — también en Ajustes del
     * sistema → Notificaciones —, aunque el teléfono esté en otro idioma.
     * Sin ellos se usan los textos de los recursos (values/ y values-es/).
     * Se guardan aparte del entrenamiento: siguen valiendo cuando termina.
     */
    static void rememberChannel(Context context, String name, String description) {
        if (name == null || name.isEmpty()) return;
        prefs(context).edit().putString(KEY_CHANNEL_NAME, name).putString(KEY_CHANNEL_DESCRIPTION, description).apply();
    }

    /** Ya no hay entrenamiento: nada vuelve a poner el aviso. */
    static void forget(Context context) {
        synchronized (LOCK) {
            SharedPreferences.Editor e = prefs(context).edit();
            for (String key : PRESENCE_KEYS) e.remove(key);
            e.apply();
        }
    }

    /**
     * El descanso que terminaba en {@code at} ya ha terminado (lo dice la
     * alarma). Si es el que tiene guardado la presencia, se borra, y el aviso
     * vuelve a modo cronómetro. Si mientras tanto ha empezado otro (u otra
     * sesión), no se toca: ése tiene su propia alarma.
     */
    static void restOver(Context context, String sessionId, long at) {
        synchronized (LOCK) {
            Map<String, ?> s = prefs(context).getAll();
            Long endsAt = longIn(s, KEY_REST_ENDS_AT);
            if (
                endsAt != null &&
                sessionId.equals(stringIn(s, KEY_SESSION_ID)) &&
                !Boolean.TRUE.equals(s.get(KEY_REST_PAUSED)) &&
                Math.abs(endsAt - at) <= SAME_REST_MS
            ) {
                SharedPreferences.Editor e = prefs(context).edit();
                for (String key : REST_KEYS) e.remove(key);
                e.apply();
            }
            postRemembered(context);
        }
    }

    static void cancel(Context context) {
        try {
            NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID);
        } catch (RuntimeException e) {
            Logger.error("WorkoutNotification", "no se pudo retirar el aviso", e);
        }
    }

    /**
     * Si la app puede publicar notificaciones ahora mismo: no están apagadas
     * en Ajustes y, desde Android 13, el permiso está concedido.
     */
    static boolean notificationsAllowed(Context context) {
        try {
            if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
            return (
                Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            );
        } catch (RuntimeException e) {
            return false;
        }
    }

    /* --------------------------------------------------- notificación */

    /**
     * Publica (o vuelve a publicar) el entrenamiento recordado, si lo hay.
     * Devuelve si ha llegado a enseñarse. Nunca lanza.
     */
    static boolean postRemembered(Context context) {
        synchronized (LOCK) {
            try {
                // Una sola lectura: getAll() es una copia, así que todo lo que
                // sigue ve el mismo estado aunque otro hilo escriba a la vez.
                Map<String, ?> s = prefs(context).getAll();
                Presence p = presenceIn(s);
                if (p == null) return false;
                return post(context, p, RestAlert.isExactFor(s, p.sessionId, p.rest));
            } catch (RuntimeException e) {
                Logger.error("WorkoutNotification", "no se pudo publicar el aviso", e);
                return false;
            }
        }
    }

    /**
     * Los modos, de una vez:
     *
     *   - Sin descanso: cronómetro hacia arriba desde el inicio. Título: el
     *     ejercicio y la serie (o el título general); texto: la sesión.
     *   - Descanso corriendo, aún no ha vencido y su alarma es EXACTA: cuenta
     *     atrás del sistema hasta su final. A esa hora la alarma vuelve a
     *     pintar el aviso, así que la cuenta atrás nunca pasa de cero.
     *   - Descanso corriendo con alarma aproximada (o sin alarma): no se sabe
     *     cuándo se repintará, así que nada de cuenta atrás; cronómetro del
     *     entrenamiento y «Descanso · hasta HH:MM».
     *   - Descanso en pausa: cronómetro del entrenamiento y «Descanso · 1:30 ·
     *     En pausa».
     *   - Descanso ya vencido: cronómetro del entrenamiento y «Descanso
     *     terminado».
     */
    private static boolean post(Context context, Presence p, boolean restAlarmExact) {
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        if (!manager.areNotificationsEnabled()) return false;
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return false;
        }
        ensureChannel(context);

        long now = System.currentTimeMillis();
        Labels labels = p.labels != null ? p.labels : new Labels(null, null, null, null, null);
        Rest rest = p.rest;
        boolean countdown = rest != null && !rest.paused && now < rest.endsAt && restAlarmExact;

        String current = joined(p.exerciseName, p.setLabel);
        String session = firstOf(p.body, joined(p.sessionName, p.progressLabel));
        String title;
        String text;
        if (rest == null) {
            title = current;
            text = session;
        } else {
            text = firstOf(current, session);
            if (rest.paused) {
                title = joined(labels.rest, rest.remaining > 0 ? clock(rest.remaining) : null, labels.paused);
            } else if (now >= rest.endsAt) {
                title = labels.restOver;
            } else if (countdown) {
                title = labels.rest;
            } else {
                title = firstOf(labels.restUntil, joined(labels.rest, hourMinute(rest.endsAt, p.locale)));
            }
        }
        title = firstOf(title, p.title);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_workout)
            .setColor(ContextCompat.getColor(context, R.color.brandBolt))
            .setContentTitle(title)
            .setContentText(text)
            .setShowWhen(true)
            // Persistente mientras dure el entrenamiento y sin ruido al actualizarse.
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setCategory(Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? Notification.CATEGORY_WORKOUT : NotificationCompat.CATEGORY_STOPWATCH)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            // Entera en la pantalla de bloqueo: dice que estás entrenando y cuánto
            // llevas, nada que haya que esconder.
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(openWorkoutIntent(context, p.sessionId))
            // Si se descarta deslizando, vuelve: ver WorkoutNoticeDismissedReceiver.
            .setDeleteIntent(dismissedIntent(context));

        if (countdown) {
            // El cronómetro: lo pinta el sistema, hacia abajo hasta el final del descanso.
            builder.setUsesChronometer(true).setChronometerCountDown(true).setWhen(rest.endsAt);
        } else {
            // El cronómetro: lo pinta el sistema, hacia arriba desde el inicio.
            // «Duración» junto a él, en la cabecera, para que no se confunda
            // con el descanso del título.
            builder.setUsesChronometer(true).setChronometerCountDown(false).setWhen(p.startedAt);
            if (labels.elapsed != null) builder.setSubText(labels.elapsed);
        }

        Bitmap tile = brandTile(context);
        if (tile != null) builder.setLargeIcon(tile);

        manager.notify(NOTIFICATION_ID, builder.build());
        return true;
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
        SharedPreferences p = prefs(context);
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            p.getString(KEY_CHANNEL_NAME, context.getString(R.string.workout_channel_name)),
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription(p.getString(KEY_CHANNEL_DESCRIPTION, context.getString(R.string.workout_channel_description)));
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.enableLights(false);
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        // Idempotente: si ya existe, sólo actualiza el nombre y la descripción.
        system.createNotificationChannel(channel);
    }

    /**
     * Vuelve a la app, a la sesión {@code sessionId}. Lo usan este aviso y el
     * de «Descanso terminado». Mismo código de petición (0) para los dos: es el
     * mismo PendingIntent, y FLAG_UPDATE_CURRENT le pone la sesión del último.
     */
    static PendingIntent openWorkoutIntent(Context context, String sessionId) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(ACTION_OPEN_WORKOUT);
        if (sessionId != null) intent.putExtra(EXTRA_SESSION_ID, sessionId);
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
     * sistema, a partir del mismo trazado que el icono pequeño. También lo
     * lleva el aviso de «Descanso terminado».
     */
    static Bitmap brandTile(Context context) {
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

    /* -------------------------------------------------------- lectura */

    /** La presencia guardada, o null si no hay entrenamiento. */
    private static Presence presenceIn(Map<String, ?> s) {
        Long startedAt = longIn(s, KEY_STARTED_AT);
        if (startedAt == null) return null;
        String title = stringIn(s, KEY_TITLE);
        Labels labels = null;
        if (
            s.containsKey(KEY_LABEL_REST) ||
            s.containsKey(KEY_LABEL_REST_OVER) ||
            s.containsKey(KEY_LABEL_ELAPSED) ||
            s.containsKey(KEY_LABEL_PAUSED)
        ) {
            labels = new Labels(
                stringIn(s, KEY_LABEL_REST),
                stringIn(s, KEY_LABEL_REST_OVER),
                stringIn(s, KEY_LABEL_ELAPSED),
                stringIn(s, KEY_LABEL_PAUSED),
                stringIn(s, KEY_LABEL_REST_UNTIL)
            );
        }
        Rest rest = null;
        Long endsAt = longIn(s, KEY_REST_ENDS_AT);
        if (endsAt != null) {
            Long remaining = longIn(s, KEY_REST_REMAINING);
            rest = new Rest(endsAt, Boolean.TRUE.equals(s.get(KEY_REST_PAUSED)), remaining == null ? 0L : remaining);
        }
        return new Presence(
            startedAt,
            title == null ? "" : title,
            stringIn(s, KEY_BODY),
            stringIn(s, KEY_SESSION_ID),
            stringIn(s, KEY_SESSION_NAME),
            stringIn(s, KEY_EXERCISE_NAME),
            stringIn(s, KEY_SET_LABEL),
            stringIn(s, KEY_PROGRESS_LABEL),
            stringIn(s, KEY_LOCALE),
            labels,
            rest
        );
    }

    /** Un texto guardado, o null si falta, está vacío o es de otro tipo. */
    static String stringIn(Map<String, ?> s, String key) {
        Object v = s.get(key);
        return v instanceof String && !((String) v).isEmpty() ? (String) v : null;
    }

    /** Un número guardado con putLong, o null si falta o es de otro tipo. */
    static Long longIn(Map<String, ?> s, String key) {
        Object v = s.get(key);
        return v instanceof Long ? (Long) v : null;
    }

    private static void putOrRemove(SharedPreferences.Editor e, String key, String value) {
        if (value == null || value.isEmpty()) e.remove(key);
        else e.putString(key, value);
    }

    /* --------------------------------------------------------- textos */

    /*
     * Aquí no se escribe ninguna palabra: sólo se juntan las que manda la app
     * con «·» (el mismo separador que usa ella) y se formatean números.
     */

    private static String joined(String... parts) {
        StringBuilder out = new StringBuilder();
        for (String part : parts) {
            if (part == null || part.isEmpty()) continue;
            if (out.length() > 0) out.append(" · ");
            out.append(part);
        }
        return out.length() > 0 ? out.toString() : null;
    }

    private static String firstOf(String a, String b) {
        return a != null && !a.isEmpty() ? a : b;
    }

    /** 90 → «1:30». */
    private static String clock(long seconds) {
        return String.format(Locale.ROOT, "%d:%02d", seconds / 60, seconds % 60);
    }

    /**
     * La hora del final del descanso en el formato corto del idioma de la app
     * ('es-ES', 'en-GB': «12:30»). Sólo hace falta si la app no manda ya
     * {@code labels.restUntil}.
     */
    private static String hourMinute(long at, String locale) {
        try {
            Locale l = locale != null ? Locale.forLanguageTag(locale) : Locale.getDefault();
            return DateFormat.getTimeInstance(DateFormat.SHORT, l).format(new Date(at));
        } catch (RuntimeException e) {
            return null;
        }
    }
}
