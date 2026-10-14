package com.trainingos.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Ha llegado la hora del final del descanso: AlarmManager entrega aquí la
 * alarma que programó {@code scheduleRestAlert}.
 *
 * Todo lo que hace está en RestAlert.onAlarm: comprobar que el aviso sigue
 * siendo el vigente (misma sesión, misma hora), publicarlo si la app no se
 * está viendo y devolver la notificación de entrenamiento a modo cronómetro.
 * Sólo lee las preferencias: puede ejecutarse en un proceso recién arrancado,
 * sin plugin ni WebView.
 *
 * Declarado en el manifiesto con {@code exported="false"} y sin intent-filter:
 * sólo lo puede invocar el PendingIntent explícito de la propia alarma. Mientras
 * corre onReceive, AlarmManager mantiene el teléfono despierto: no hace falta
 * WAKE_LOCK.
 */
public class RestAlarmReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        RestAlert.onAlarm(context, intent);
    }
}
