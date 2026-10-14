package com.trainingos.app;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * El puente entre el código web y el aviso de «entrenamiento en curso» de la
 * pantalla de bloqueo (WorkoutNotice).
 *
 * Dos métodos, {@code start} y {@code stop}, más la comprobación y la petición
 * del permiso de notificaciones que hereda cualquier plugin de Capacitor. El
 * lado JavaScript está en src/lib/native/workoutNotification.ts.
 *
 * No hay servicio en primer plano: el cronómetro lo pinta el sistema, así que
 * no hay nada que tenga que seguir ejecutándose, y un servicio obligaría
 * además a pedir FOREGROUND_SERVICE_HEALTH y a declararlo ante Google Play.
 *
 * Todo lo que puede fallar va en un try dentro de WorkoutNotice: un aviso que
 * no se puede enseñar es un aviso menos, nunca un entrenamiento que se cae.
 */
@CapacitorPlugin(
    name = "WorkoutNotification",
    permissions = { @Permission(alias = WorkoutNotificationPlugin.DISPLAY, strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class WorkoutNotificationPlugin extends Plugin {

    /** Mismo alias que usa @capacitor/local-notifications, por si algún día conviven. */
    static final String DISPLAY = "display";

    @Override
    public void load() {
        // Arranque en frío desde la notificación: la app estaba cerrada y es
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
     * La app deja de verse — y una de las razones es que se ha bloqueado el
     * teléfono. Si el entrenamiento sigue, se vuelve a publicar el aviso, por
     * si el sistema o la persona lo hubieran quitado mientras la app estaba
     * delante. Volver a publicar la misma notificación no hace ruido ni vibra.
     */
    @Override
    protected void handleOnStop() {
        super.handleOnStop();
        WorkoutNotice.postRemembered(getContext());
    }

    /* --------------------------------------------------------------- API */

    @PluginMethod
    public void start(PluginCall call) {
        Object rawStartedAt = call.getData().opt("startedAt");
        String title = call.getString("title");
        if (!(rawStartedAt instanceof Number) || title == null || title.isEmpty()) {
            call.reject("start necesita startedAt (número) y title");
            return;
        }
        long startedAt = ((Number) rawStartedAt).longValue();
        String body = call.getString("body", "");

        WorkoutNotice.rememberChannel(getContext(), call.getString("channelName"), call.getString("channelDescription", ""));
        WorkoutNotice.remember(getContext(), startedAt, title, body);
        JSObject result = new JSObject();
        result.put("shown", WorkoutNotice.post(getContext(), startedAt, title, body));
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        // Primero se olvida y luego se retira: un descarte que llegara entre
        // medias ya no encontraría nada que volver a poner.
        WorkoutNotice.forget(getContext());
        WorkoutNotice.cancel(getContext());
        call.resolve();
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

    private void deliverIfOpenIntent(Intent intent) {
        if (intent == null || !WorkoutNotice.ACTION_OPEN_WORKOUT.equals(intent.getAction())) return;
        // Se consume: si la actividad se recrea con este mismo intent, no
        // vuelve a saltar a la sesión.
        intent.setAction(Intent.ACTION_MAIN);
        notifyListeners("open", new JSObject(), true);
    }
}
