package com.trainingos.app;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.HapticFeedbackConstants;
import android.webkit.WebView;
import androidx.activity.result.ActivityResult;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONObject;

/**
 * El puente entre el código web y lo que la app necesita del sistema durante
 * un entrenamiento: el aviso de «entrenamiento en curso» de la pantalla de
 * bloqueo (WorkoutNotice), el aviso de «Descanso terminado» (RestAlert) y la
 * vibración háptica.
 *
 * Los métodos, los datos y su ciclo de vida son los de docs/NATIVE-CONTRACT.md,
 * los mismos que cumple la versión de iOS; el lado JavaScript está en
 * src/lib/native/workoutNotification.ts. Todo texto visible llega ya traducido:
 * aquí no hay ninguna palabra de la interfaz.
 *
 * No hay servicio en primer plano: los cronómetros los pinta el sistema y el
 * aviso de descanso lo entrega AlarmManager, así que no hay nada que tenga que
 * seguir ejecutándose, y un servicio obligaría además a pedir
 * FOREGROUND_SERVICE_HEALTH y a declararlo ante Google Play.
 *
 * Todo lo que puede fallar va en un try: un aviso que no se puede enseñar es un
 * aviso menos, nunca un entrenamiento que se cae. Y cada método resuelve o
 * rechaza siempre: una promesa colgada bloquearía la cola del lado web.
 */
@CapacitorPlugin(
    name = "WorkoutNotification",
    permissions = { @Permission(alias = WorkoutNotificationPlugin.DISPLAY, strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class WorkoutNotificationPlugin extends Plugin {

    /** Mismo alias que usa @capacitor/local-notifications, por si algún día conviven. */
    static final String DISPLAY = "display";

    /** Entre los dos toques de la vibración de récord personal. */
    private static final long PR_SECOND_TAP_MS = 120L;

    @Override
    public void load() {
        // Arranque en frío desde una notificación: la app estaba cerrada y es
        // este intent el que la ha abierto. El evento se guarda hasta que el
        // código web se ponga a escuchar.
        deliverIfOpenIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        // La app ya estaba abierta (launchMode singleTask): el toque llega aquí.
        deliverIfOpenIntent(intent);
    }

    /**
     * La app vuelve a verse. Si el aviso de «Descanso terminado» sigue en
     * pantalla, ya no dice nada que la app no esté diciendo: fuera.
     */
    @Override
    protected void handleOnStart() {
        super.handleOnStart();
        WorkoutNotice.setAppVisible(true);
        RestAlert.cancelDelivered(getContext());
    }

    /**
     * La app deja de verse — y una de las razones es que se ha bloqueado el
     * teléfono. Si el entrenamiento sigue, se vuelve a publicar el aviso, por
     * si el sistema o la persona lo hubieran quitado mientras la app estaba
     * delante. Volver a publicar la misma notificación no hace ruido ni vibra.
     */
    @Override
    protected void handleOnStop() {
        super.handleOnStop();
        WorkoutNotice.setAppVisible(false);
        WorkoutNotice.postRemembered(getContext());
    }

    /* --------------------------------------------------------------- API */

    /**
     * Enseña el entrenamiento en curso, o lo actualiza: es un upsert por
     * {@code sessionId}. Acepta también los datos de la versión anterior
     * (sólo startedAt, title y body).
     */
    @PluginMethod
    public void start(PluginCall call) {
        JSObject data = call.getData();
        Object rawStartedAt = data.opt("startedAt");
        String title = call.getString("title");
        if (!(rawStartedAt instanceof Number) || title == null || title.isEmpty()) {
            call.reject("start necesita startedAt (número) y title");
            return;
        }
        String sessionId = textIn(data, "sessionId");
        JSONObject labels = data.optJSONObject("labels");
        WorkoutNotice.Presence presence = new WorkoutNotice.Presence(
            ((Number) rawStartedAt).longValue(),
            title,
            call.getString("body", ""),
            sessionId,
            textIn(data, "sessionName"),
            textIn(data, "exerciseName"),
            textIn(data, "setLabel"),
            textIn(data, "progressLabel"),
            textIn(data, "locale"),
            labels == null
                ? null
                : new WorkoutNotice.Labels(
                    textIn(labels, "rest"),
                    textIn(labels, "restOver"),
                    textIn(labels, "elapsed"),
                    textIn(labels, "paused"),
                    textIn(labels, "restUntil")
                ),
            restIn(data.optJSONObject("rest"))
        );

        // Una presencia de otra sesión se termina primero: su aviso de
        // descanso pendiente ya no vale.
        RestAlert.dropIfOtherSession(getContext(), sessionId);
        WorkoutNotice.rememberChannel(getContext(), call.getString("channelName"), call.getString("channelDescription", ""));
        WorkoutNotice.remember(getContext(), presence);
        JSObject result = new JSObject();
        result.put("shown", WorkoutNotice.postRemembered(getContext()));
        call.resolve(result);
    }

    /** Termina todo: presencia, aviso de descanso pendiente y aviso ya entregado. */
    @PluginMethod
    public void stop(PluginCall call) {
        synchronized (WorkoutNotice.LOCK) {
            // Primero se olvida y luego se retira: un descarte o una alarma que
            // llegaran entre medias ya no encontrarían nada que volver a poner.
            WorkoutNotice.forget(getContext());
            RestAlert.clear(getContext());
            RestAlert.cancelAlarm(getContext());
            WorkoutNotice.cancel(getContext());
            RestAlert.cancelDelivered(getContext());
        }
        call.resolve();
    }

    @PluginMethod
    public void scheduleRestAlert(PluginCall call) {
        JSObject data = call.getData();
        String sessionId = textIn(data, "sessionId");
        Object rawAt = data.opt("at");
        String title = call.getString("title");
        if (sessionId == null || !(rawAt instanceof Number) || title == null || title.isEmpty()) {
            call.reject("scheduleRestAlert necesita sessionId, at (número) y title");
            return;
        }
        RestAlert.rememberChannel(getContext(), call.getString("channelName"), call.getString("channelDescription", ""));
        RestAlert.Result scheduled = RestAlert.schedule(
            getContext(),
            new RestAlert.Request(
                sessionId,
                ((Number) rawAt).longValue(),
                title,
                call.getString("body", ""),
                Boolean.TRUE.equals(call.getBoolean("sound", false)),
                Boolean.TRUE.equals(call.getBoolean("vibrate", false))
            )
        );
        JSObject result = new JSObject();
        result.put("scheduled", scheduled.scheduled);
        result.put("exact", scheduled.exact);
        call.resolve(result);
    }

    @PluginMethod
    public void cancelRestAlert(PluginCall call) {
        JSObject result = new JSObject();
        result.put("delivered", RestAlert.cancel(getContext()));
        call.resolve(result);
    }

    /**
     * Vibración háptica con la del propio sistema ({@code performHapticFeedback}
     * sobre el WebView): no necesita el permiso VIBRATE y respeta el ajuste de
     * «respuesta táctil» del teléfono. Se resuelve sin esperar a que vibre.
     */
    @PluginMethod
    public void haptic(PluginCall call) {
        String kind = call.getString("kind", "tick");
        final int feedback;
        final boolean twice;
        boolean modern = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R;
        switch (kind == null ? "tick" : kind) {
            case "tick":
                feedback = HapticFeedbackConstants.CLOCK_TICK;
                twice = false;
                break;
            case "success":
                feedback = modern ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.VIRTUAL_KEY;
                twice = false;
                break;
            case "pr":
                // Un récord se nota más: dos confirmaciones seguidas.
                feedback = modern ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.LONG_PRESS;
                twice = modern;
                break;
            case "warn":
                feedback = modern ? HapticFeedbackConstants.REJECT : HapticFeedbackConstants.LONG_PRESS;
                twice = false;
                break;
            default:
                // Un tipo que esta versión no conoce: sin vibración, sin error.
                call.resolve();
                return;
        }
        try {
            getBridge()
                .executeOnMainThread(() -> {
                    try {
                        WebView view = getBridge().getWebView();
                        if (view == null) return;
                        view.performHapticFeedback(feedback);
                        if (twice) view.postDelayed(() -> view.performHapticFeedback(feedback), PR_SECOND_TAP_MS);
                    } catch (RuntimeException e) {
                        Logger.error("WorkoutNotification", "no se pudo vibrar", e);
                    }
                });
        } catch (RuntimeException e) {
            Logger.error("WorkoutNotification", "no se pudo vibrar", e);
        }
        call.resolve();
    }

    /**
     * Lo que se puede hacer ahora mismo. Las dos notificaciones dependen de lo
     * mismo (que las notificaciones estén permitidas); la alarma exacta, de su
     * propio permiso.
     */
    @PluginMethod
    public void isSupported(PluginCall call) {
        boolean notifications = WorkoutNotice.notificationsAllowed(getContext());
        JSObject result = new JSObject();
        result.put("presence", notifications);
        result.put("restAlerts", notifications);
        result.put("exactAlarms", RestAlert.canScheduleExact(getContext()));
        call.resolve(result);
    }

    /**
     * Lleva a la persona al ajuste «Alarmas y recordatorios» de la app, que en
     * Android 12+ es un acceso especial y no un diálogo. Si ya está concedido
     * (o el Android es anterior y no existe), contesta sin enseñar nada. Al
     * volver se comprueba de nuevo: el resultado de la pantalla de Ajustes no
     * dice nada.
     */
    @PluginMethod
    public void requestExactAlarm(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || RestAlert.canScheduleExact(getContext())) {
            resolveExactAlarm(call);
            return;
        }
        Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName()));
        try {
            startActivityForResult(call, intent, "exactAlarmResult");
        } catch (ActivityNotFoundException e) {
            // Algún fabricante sin esa pantalla: no hay forma de pedirlo.
            Logger.warn("WorkoutNotification", "no hay pantalla de alarmas exactas en este teléfono");
            getBridge().releaseCall(call);
            JSObject result = new JSObject();
            result.put("exactAlarms", false);
            call.resolve(result);
        }
    }

    @ActivityCallback
    private void exactAlarmResult(PluginCall call, ActivityResult result) {
        // Si Android recreó la actividad mientras tanto, ya no hay a quién contestar.
        if (call == null) return;
        getBridge().releaseCall(call);
        resolveExactAlarm(call);
    }

    private void resolveExactAlarm(PluginCall call) {
        JSObject result = new JSObject();
        result.put("exactAlarms", RestAlert.canScheduleExact(getContext()));
        call.resolve(result);
    }

    /*
     * Por debajo de Android 13 no existe el permiso: las notificaciones están
     * permitidas salvo que la persona las haya apagado en los ajustes, y eso
     * es lo que se contesta. Es el mismo trato que les da el plugin oficial
     * de notificaciones locales de Capacitor.
     */

    @Override
    @PluginMethod
    public void checkPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            resolveWithSystemState(call);
        } else {
            super.checkPermissions(call);
        }
    }

    @Override
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState(DISPLAY) == PermissionState.GRANTED) {
            resolveWithSystemState(call);
        } else {
            requestPermissionForAlias(DISPLAY, call, "permissionCallback");
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        resolveWithSystemState(call);
    }

    private void resolveWithSystemState(PluginCall call) {
        JSObject result = new JSObject();
        result.put(DISPLAY, NotificationManagerCompat.from(getContext()).areNotificationsEnabled() ? "granted" : "denied");
        call.resolve(result);
    }

    /* ---------------------------------------------------------- piezas */

    private void deliverIfOpenIntent(Intent intent) {
        if (intent == null || !WorkoutNotice.ACTION_OPEN_WORKOUT.equals(intent.getAction())) return;
        String sessionId = null;
        try {
            sessionId = intent.getStringExtra(WorkoutNotice.EXTRA_SESSION_ID);
        } catch (RuntimeException e) {
            // Un extra ilegible: se abre igual, sin sesión (JavaScript decide).
        }
        // Se consume: si la actividad se recrea con este mismo intent, no
        // vuelve a saltar a la sesión.
        intent.setAction(Intent.ACTION_MAIN);
        intent.removeExtra(WorkoutNotice.EXTRA_SESSION_ID);
        // El id se pasa tal cual; lo valida el lado web antes de navegar.
        JSObject event = new JSObject();
        if (sessionId != null) event.put("sessionId", sessionId);
        notifyListeners("open", event, true);
    }

    /** Un texto no vacío, o null (también si llega {@code null} desde JSON). */
    private static String textIn(JSONObject o, String key) {
        Object v = o.opt(key);
        return v instanceof String && !((String) v).isEmpty() ? (String) v : null;
    }

    /** El descanso, o null si no lo hay (o si llega sin un final numérico). */
    private static WorkoutNotice.Rest restIn(JSONObject o) {
        if (o == null) return null;
        Object endsAt = o.opt("endsAt");
        if (!(endsAt instanceof Number)) return null;
        Object paused = o.opt("paused");
        Object remaining = o.opt("remaining");
        long seconds = remaining instanceof Number ? Math.max(0L, Math.round(((Number) remaining).doubleValue())) : 0L;
        // `total` no se usa en Android: sin barra de progreso, que obligaría a
        // repintar la notificación cada segundo.
        return new WorkoutNotice.Rest(((Number) endsAt).longValue(), Boolean.TRUE.equals(paused), seconds);
    }
}
