import Capacitor
import UIKit
import WebKit

/**
 * El controlador de la app: el de Capacitor más lo que Training OS necesita
 * de iOS. SceneDelegate lo crea en lugar de CAPBridgeViewController.
 *
 *   - Registra a mano el plugin propio WorkoutNotification (los plugins
 *     locales no están en capacitor.config.json; docs/NATIVE-CONTRACT.md,
 *     regla 6).
 *   - Activa el gesto de deslizar desde el borde para volver atrás, el
 *     equivalente del botón atrás de Android. La app es una sola página con
 *     historial (pushState), y WKWebView lo recorre con el gesto.
 */
class MainViewController: CAPBridgeViewController {
    /// El plugin propio. SceneDelegate le entrega el toque en el aviso de
    /// descanso que abrió la app en frío.
    private(set) var workoutNotificationPlugin: WorkoutNotificationPlugin?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        let plugin = WorkoutNotificationPlugin()
        bridge?.registerPluginInstance(plugin)
        workoutNotificationPlugin = plugin
        webView?.allowsBackForwardNavigationGestures = true
    }
}
