import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // MainViewController y no CAPBridgeViewController: es el que registra
        // el plugin propio WorkoutNotification (docs/NATIVE-CONTRACT.md, regla 6).
        let rootViewController = MainViewController()
        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = rootViewController
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        // La app estaba cerrada y la ha abierto un toque en el aviso de fin de
        // descanso. El delegado de notificaciones de Capacitor se instala al
        // crear el puente, después de terminar el arranque, y iOS puede no
        // repetirle ese toque; aquí llega seguro. El plugin descarta el
        // duplicado si también le llega por el delegado.
        if let response = connectionOptions.notificationResponse {
            rootViewController.workoutNotificationPlugin?.didReceive(response: response)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
