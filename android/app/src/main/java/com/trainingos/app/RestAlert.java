package com.trainingos.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.SystemClock;
import androidx.core.app.AlarmManagerCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Logger;
import java.util.Map;

/**
 * El aviso puntual «Descanso terminado»: se programa al empezar el descanso y
 * lo publica RestAlarmReceiver cuando llega su hora.
 *
 * No es la notificación de entrenamiento (ésa es el estado continuo; ver
 * WorkoutNotice): es otra, con otro identificador, que suena o vibra según los
 * ajustes de la app y se va sola.
 *
 * Cómo llega a su hora con la pantalla apagada:
 *
 *   - Con el permiso SCHEDULE_EXACT_ALARM (Android 12+, «Alarmas y
 *     recordatorios»), {@code setExactAndAllowWhileIdle}: a su hora, también
 *     en reposo. Siempre se pregunta a {@code canScheduleExactAlarms}, nunca
 *     a la versión: Android 12 y 13 lo conceden por defecto, 14 no, y la
 *     persona puede retirarlo cuando quiera.
 *   - Sin él, {@code setAndAllowWhileIdle}: Android lo entrega cuando le viene
 *     bien, y puede llegar bastante tarde. Por eso, sin alarma exacta, la
 *     notificación de entrenamiento no enseña cuenta atrás.
 *
 * Tiempo transcurrido del sistema (ELAPSED_REALTIME_WAKEUP) y no la hora de
 * reloj: si la persona cambia la hora del teléfono a mitad del descanso, el
 * aviso sigue llegando cuando tiene que llegar.
 *
 * Sin setAlarmClock (enseñaría un despertador en la barra de estado), sin
 * pantalla completa y sin servicio en primer plano. Todo va en un try: un
 * aviso que no se puede programar es un aviso menos, nunca un entrenamiento
 * que se cae.
 */
final class RestAlert {

    /** Distinto del de la notificación de entrenamiento (4711). */
    static final int NOTIFICATION_ID = 4712;
    /** Códigos de petición: 0 abrir la app, 1 aviso descartado, 2 esta alarma. */
    private static final int REQUEST_CODE = 2;
    static final String EXTRA_AT = "at";

    /** Un aviso para dentro de menos de esto ya no merece la pena. */
    private static final long MIN_LEAD_MS = 500L;
    /** Pasado este rato el aviso se retira solo: ya no avisa de nada. */
    private static final long TIMEOUT_MS = 5 * 60 * 1000L;

    /*
     * Los canales, uno por combinación de sonido y vibración. En Android 8+ el
     * sonido y la vibración son del canal y no se pueden cambiar después de
     * crearlo, así que cada combinación de ajustes de la app tiene el suyo. Se
     * crean la primera vez que hacen falta, no antes.
     */
    private static final String CHANNEL_SOUND_VIBRATE = "rest_alert_sv";
    private static final String CHANNEL_SOUND = "rest_alert_s";
    private static final String CHANNEL_VIBRATE = "rest_alert_v";
    private static final String CHANNEL_QUIET = "rest_alert_quiet";

    // En las mismas preferencias que la presencia (WorkoutNotice.prefs).
    private static final String KEY_SESSION_ID = "alertSessionId";
    private static final String KEY_AT = "alertAt";
    private static final String KEY_TITLE = "alertTitle";
    private static final String KEY_BODY = "alertBody";
    private static final String KEY_SOUND = "alertSound";
    private static final String KEY_VIBRATE = "alertVibrate";
    private static final String KEY_EXACT = "alertExact";
    private static final String KEY_DELIVERED_FOR = "restAlertDeliveredFor";
    private static final String KEY_CHANNEL_NAME = "restChannelName";
    private static final String KEY_CHANNEL_DESCRIPTION = "restChannelDescription";

    private static final String[] ALERT_KEYS = {
        KEY_SESSION_ID,
        KEY_AT,
        KEY_TITLE,
        KEY_BODY,
        KEY_SOUND,
        KEY_VIBRATE,
        KEY_EXACT,
        KEY_DELIVERED_FOR,
    };

    private RestAlert() {}

    /** Lo que manda {@code scheduleRestAlert}. Los textos llegan ya traducidos. */
    static final class Request {

        final String sessionId;
        /** Milisegundos de época. */
        final long at;
        final String title;
        final String body;
        final boolean sound;
        final boolean vibrate;

        Request(String sessionId, long at, String title, String body, boolean sound, boolean vibrate) {
            this.sessionId = sessionId;
            this.at = at;
            this.title = title;
            this.body = body;
            this.sound = sound;
            this.vibrate = vibrate;
        }
    }

    static final class Result {

        final boolean scheduled;
        final boolean exact;

        Result(boolean scheduled, boolean exact) {
            this.scheduled = scheduled;
            this.exact = exact;
        }
    }

    /* ------------------------------------------------------- programar */

    /**
     * Programa el aviso, sustituyendo al anterior si lo había: es la misma
     * alarma (mismo PendingIntent), así que nunca hay dos. Nunca lanza.
     */
    static Result schedule(Context context, Request r) {
        synchronized (WorkoutNotice.LOCK) {
            Result result = new Result(false, false);
            try {
                long now = System.currentTimeMillis();
                AlarmManager alarms = context.getSystemService(AlarmManager.class);
                if (alarms == null || r.at <= now + MIN_LEAD_MS || !WorkoutNotice.notificationsAllowed(context)) {
                    // Ya es la hora, o no se podría enseñar: sólo se quita lo que hubiera.
                    cancelAlarm(context);
                    clear(context);
                } else {
                    // Primero se guarda: el receptor lee de aquí, quizá en un proceso nuevo.
                    prefs(context)
                        .edit()
                        .putString(KEY_SESSION_ID, r.sessionId)
                        .putLong(KEY_AT, r.at)
                        .putString(KEY_TITLE, r.title)
                        .putString(KEY_BODY, r.body)
                        .putBoolean(KEY_SOUND, r.sound)
                        .putBoolean(KEY_VIBRATE, r.vibrate)
                        .putBoolean(KEY_EXACT, false)
                        .remove(KEY_DELIVERED_FOR)
                        .apply();

                    long trigger = SystemClock.elapsedRealtime() + (r.at - now);
                    PendingIntent alarm = alarmIntent(context, r.sessionId, r.at);
                    boolean exact = false;
                    if (AlarmManagerCompat.canScheduleExactAlarms(alarms)) {
                        try {
                            alarms.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, alarm);
                            exact = true;
                        } catch (SecurityException e) {
                            // Retirado entre la comprobación y la llamada: aproximada.
                            Logger.warn("WorkoutNotification", "sin permiso de alarma exacta; aviso aproximado");
                        }
                    }
                    if (!exact) alarms.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, alarm);
                    prefs(context).edit().putBoolean(KEY_EXACT, exact).apply();
                    result = new Result(true, exact);
                }
            } catch (RuntimeException e) {
                Logger.error("WorkoutNotification", "no se pudo programar el aviso de descanso", e);
                cancelAlarm(context);
                clear(context);
                result = new Result(false, false);
            }
            // Si la alarma es exacta o no decide si el aviso de entrenamiento
            // enseña cuenta atrás: se repinta con lo que haya quedado.
            WorkoutNotice.postRemembered(context);
            return result;
        }
    }

    /**
     * El descanso ya no termina como estaba previsto (pausa, saltar, terminar
     * antes): fuera la alarma y, si ya había salido, también el aviso.
     * Devuelve si el aviso de ese descanso ya había salido.
     */
    static boolean cancel(Context context) {
        synchronized (WorkoutNotice.LOCK) {
            boolean delivered = false;
            try {
                Map<String, ?> s = prefs(context).getAll();
                Long at = WorkoutNotice.longIn(s, KEY_AT);
                Long deliveredFor = WorkoutNotice.longIn(s, KEY_DELIVERED_FOR);
                delivered = at != null && at.equals(deliveredFor);
            } catch (RuntimeException e) {
                Logger.error("WorkoutNotification", "no se pudo leer el aviso de descanso", e);
            }
            cancelAlarm(context);
            clear(context);
            cancelDelivered(context);
            // Sin alarma no hay cuenta atrás.
            WorkoutNotice.postRemembered(context);
            return delivered;
        }
    }

    /**
     * {@code start} con otra sesión: lo programado para la anterior ya no vale.
     * Con la misma sesión no se toca nada.
     */
    static void dropIfOtherSession(Context context, String sessionId) {
        synchronized (WorkoutNotice.LOCK) {
            String alertSession = WorkoutNotice.stringIn(prefs(context).getAll(), KEY_SESSION_ID);
            if (alertSession == null || alertSession.equals(sessionId)) return;
            cancelAlarm(context);
            clear(context);
            cancelDelivered(context);
        }
    }

    /** Olvida el aviso (no los nombres del canal, que siguen valiendo). */
    static void clear(Context context) {
        try {
            SharedPreferences.Editor e = prefs(context).edit();
            for (String key : ALERT_KEYS) e.remove(key);
            e.apply();
        } catch (RuntimeException e) {
            Logger.error("WorkoutNotification", "no se pudo olvidar el aviso de descanso", e);
        }
    }

    /** Quita la alarma pendiente, si la hay. */
    static void cancelAlarm(Context context) {
        try {
            // Mismo intent y mismo código: encuentra la alarma sin crear una nueva.
            PendingIntent alarm = PendingIntent.getBroadcast(
                context,
                REQUEST_CODE,
                new Intent(context, RestAlarmReceiver.class),
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
            );
            if (alarm == null) return;
            AlarmManager alarms = context.getSystemService(AlarmManager.class);
            if (alarms != null) alarms.cancel(alarm);
            alarm.cancel();
        } catch (RuntimeException e) {
            Logger.error("WorkoutNotification", "no se pudo cancelar la alarma del descanso", e);
        }
    }

    /** Retira el aviso ya publicado, si sigue en pantalla. */
    static void cancelDelivered(Context context) {
        try {
            NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID);
        } catch (RuntimeException e) {
            Logger.error("WorkoutNotification", "no se pudo retirar el aviso de descanso", e);
        }
    }

    /** Si ahora mismo se puede programar una alarma exacta. */
    static boolean canScheduleExact(Context context) {
        try {
            AlarmManager alarms = context.getSystemService(AlarmManager.class);
            return alarms != null && AlarmManagerCompat.canScheduleExactAlarms(alarms);
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** Ver {@link WorkoutNotice#rememberChannel}: lo mismo, para el canal del descanso. */
    static void rememberChannel(Context context, String name, String description) {
        if (name == null || name.isEmpty()) return;
        prefs(context).edit().putString(KEY_CHANNEL_NAME, name).putString(KEY_CHANNEL_DESCRIPTION, description).apply();
    }

    /**
     * Si el descanso {@code rest} de la sesión {@code sessionId} tiene su
     * alarma exacta programada y aún sin salir. Es lo que permite a
     * WorkoutNotice enseñar la cuenta atrás: sólo entonces hay garantía de que
     * a su hora alguien la quita.
     */
    static boolean isExactFor(Map<String, ?> s, String sessionId, WorkoutNotice.Rest rest) {
        if (sessionId == null || rest == null || rest.paused) return false;
        Long at = WorkoutNotice.longIn(s, KEY_AT);
        return (
            at != null &&
            sessionId.equals(WorkoutNotice.stringIn(s, KEY_SESSION_ID)) &&
            Math.abs(at - rest.endsAt) <= WorkoutNotice.SAME_REST_MS &&
            Boolean.TRUE.equals(s.get(KEY_EXACT)) &&
            !at.equals(WorkoutNotice.longIn(s, KEY_DELIVERED_FOR))
        );
    }

    /* -------------------------------------------------------- la hora */

    /**
     * Ha sonado la alarma (desde RestAlarmReceiver). Sólo lee las
     * preferencias: puede que la app ni esté abierta.
     */
    static void onAlarm(Context context, Intent intent) {
        synchronized (WorkoutNotice.LOCK) {
            try {
                String sessionId = intent.getStringExtra(WorkoutNotice.EXTRA_SESSION_ID);
                long at = intent.getLongExtra(EXTRA_AT, -1L);
                Map<String, ?> s = prefs(context).getAll();
                Long currentAt = WorkoutNotice.longIn(s, KEY_AT);
                // ¿Sigue siendo éste el aviso? Si entre medias se canceló o se
                // programó otro, esta entrega llega tarde y no hace nada.
                if (sessionId == null || !sessionId.equals(WorkoutNotice.stringIn(s, KEY_SESSION_ID)) || currentAt == null || currentAt != at) {
                    return;
                }
                if (Long.valueOf(at).equals(WorkoutNotice.longIn(s, KEY_DELIVERED_FOR))) return;

                // Con la app delante avisa la propia app (sonido y vibración en
                // JavaScript); una notificación encima sería un segundo aviso.
                if (!WorkoutNotice.isAppVisible() && post(context, s, sessionId, at)) {
                    prefs(context).edit().putLong(KEY_DELIVERED_FOR, at).apply();
                }
                // En cualquier caso el descanso ha terminado: el aviso de
                // entrenamiento vuelve a cronómetro, sin cuenta atrás vencida.
                WorkoutNotice.restOver(context, sessionId, at);
            } catch (RuntimeException e) {
                Logger.error("WorkoutNotification", "no se pudo dar el aviso de descanso", e);
            }
        }
    }

    private static boolean post(Context context, Map<String, ?> s, String sessionId, long at) {
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        if (!manager.areNotificationsEnabled()) return false;
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return false;
        }
        String title = WorkoutNotice.stringIn(s, KEY_TITLE);
        if (title == null) return false;
        boolean sound = Boolean.TRUE.equals(s.get(KEY_SOUND));
        boolean vibrate = Boolean.TRUE.equals(s.get(KEY_VIBRATE));

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, ensureChannel(context, s, sound, vibrate))
            .setSmallIcon(R.drawable.ic_stat_workout)
            .setColor(ContextCompat.getColor(context, R.color.brandBolt))
            .setContentTitle(title)
            .setContentText(WorkoutNotice.stringIn(s, KEY_BODY))
            .setWhen(at)
            .setShowWhen(true)
            // Se va al tocarlo, al volver a la app o, si nadie lo mira, solo.
            .setAutoCancel(true)
            .setTimeoutAfter(TIMEOUT_MS)
            // Un recordatorio que la persona ha pedido, no una alarma: no
            // despierta la pantalla ni la ocupa entera.
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(WorkoutNotice.openWorkoutIntent(context, sessionId));

        Bitmap tile = WorkoutNotice.brandTile(context);
        if (tile != null) builder.setLargeIcon(tile);

        // Antes de Android 8 no hay canales: el sonido y la vibración van en
        // la propia notificación.
        boolean legacy = Build.VERSION.SDK_INT < Build.VERSION_CODES.O;
        if (legacy) builder.setDefaults((sound ? Notification.DEFAULT_SOUND : 0) | (vibrate ? Notification.DEFAULT_VIBRATE : 0));
        try {
            manager.notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException e) {
            // Algún Android 7 pide VIBRATE para vibrar desde una notificación, y
            // ese permiso no se pide. Mejor el aviso sin vibración que ninguno.
            if (!legacy || !vibrate) throw e;
            builder.setDefaults(sound ? Notification.DEFAULT_SOUND : 0);
            manager.notify(NOTIFICATION_ID, builder.build());
        }
        return true;
    }

    /**
     * Importancia HIGH: tiene que verse aunque la persona esté en otra app, y
     * entero en la pantalla de bloqueo. Sin globo en el icono: dentro de cinco
     * minutos ya no significa nada. El nombre, en el idioma de la app.
     */
    private static String ensureChannel(Context context, Map<String, ?> s, boolean sound, boolean vibrate) {
        String id = sound ? (vibrate ? CHANNEL_SOUND_VIBRATE : CHANNEL_SOUND) : (vibrate ? CHANNEL_VIBRATE : CHANNEL_QUIET);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return id;
        NotificationManager system = context.getSystemService(NotificationManager.class);
        if (system == null) return id;
        String name = WorkoutNotice.stringIn(s, KEY_CHANNEL_NAME);
        String description = WorkoutNotice.stringIn(s, KEY_CHANNEL_DESCRIPTION);
        NotificationChannel channel = new NotificationChannel(
            id,
            name != null ? name : context.getString(R.string.rest_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(description != null ? description : context.getString(R.string.rest_channel_description));
        // Con sonido, el de notificación del teléfono; sin él, ninguno.
        if (!sound) channel.setSound(null, null);
        channel.enableVibration(vibrate);
        channel.enableLights(false);
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        // Idempotente: si ya existe, sólo actualiza el nombre y la descripción.
        system.createNotificationChannel(channel);
        return id;
    }

    /* -------------------------------------------------------- piezas */

    private static SharedPreferences prefs(Context context) {
        return WorkoutNotice.prefs(context);
    }

    /**
     * Explícito (la clase del receptor), inmutable y siempre con el mismo
     * código: FLAG_UPDATE_CURRENT sólo le cambia la sesión y la hora.
     */
    private static PendingIntent alarmIntent(Context context, String sessionId, long at) {
        Intent intent = new Intent(context, RestAlarmReceiver.class)
            .putExtra(WorkoutNotice.EXTRA_SESSION_ID, sessionId)
            .putExtra(EXTRA_AT, at);
        return PendingIntent.getBroadcast(context, REQUEST_CODE, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
