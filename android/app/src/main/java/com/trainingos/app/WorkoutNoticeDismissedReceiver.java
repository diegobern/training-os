package com.trainingos.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Alguien ha descartado el aviso de «entrenamiento en curso» deslizándolo.
 *
 * Desde Android 14 el sistema deja descartar las notificaciones persistentes
 * con el teléfono desbloqueado (o con un bloqueo sin PIN); con el teléfono
 * bloqueado con PIN no. Mientras el entrenamiento siga abierto el aviso tiene
 * que estar, así que se vuelve a poner en el acto. Al terminar o descartar el
 * entrenamiento, la app lo retira con {@code cancel()}, que no pasa por aquí,
 * y además olvida el entrenamiento: aunque llegara un descarte tardío, no hay
 * nada que volver a poner.
 *
 * Declarado en el manifiesto con {@code exported="false"}: sólo lo puede
 * invocar el PendingIntent de la propia notificación.
 */
public class WorkoutNoticeDismissedReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        WorkoutNotice.postRemembered(context);
    }
}
