package com.trainingos.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Los plugins propios se registran ANTES de super.onCreate: es ahí
        // donde Capacitor crea el puente y carga la lista de plugins. Los de
        // npm (@capacitor/app, …) los registra él solo a partir de
        // capacitor.plugins.json; éste vive en el propio proyecto y no.
        registerPlugin(WorkoutNotificationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
