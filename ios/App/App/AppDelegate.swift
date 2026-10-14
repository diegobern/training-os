import UIKit
import Capacitor

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Fuera del hilo principal: son operaciones de disco y no deben
        // retrasar la primera pantalla.
        DispatchQueue.global(qos: .utility).async {
            WebDataBackup.exclude()
        }

        #if DEBUG
        // Capturas de la Live Activity para revisarlas sin un iPhone (CI con
        // el simulador). Sólo con el argumento -renderLiveActivityPreviews y
        // sólo en DEBUG: el código ni siquiera existe en Release. Pinta
        // después del arranque, en su propia tarea del hilo principal.
        LiveActivityPreviewRenderer.renderIfRequested()
        #endif

        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

/**
 * Los datos de la app no van a la copia de seguridad de iCloud, igual que en
 * Android (`allowBackup="false"`).
 *
 * Todo lo que Training OS guarda en el teléfono (IndexedDB, localStorage, la
 * sesión de Firebase) lo guarda WKWebView dentro de Library/WebKit. Se marca
 * esa carpeta, y con ella todo su contenido, como excluida de la copia. Si
 * aún no existe (primer arranque) se crea vacía, para que el atributo esté
 * puesto antes de que WebKit escriba nada. Se repite en cada arranque: es
 * barato y cubre una carpeta recreada.
 *
 * Nunca hace fallar el arranque: cualquier error se anota y ya está.
 */
private enum WebDataBackup {
    static func exclude() {
        let fileManager = FileManager.default
        guard let library = fileManager.urls(for: .libraryDirectory, in: .userDomainMask).first else { return }
        var webKit = library.appending(path: "WebKit", directoryHint: .isDirectory)
        do {
            try fileManager.createDirectory(at: webKit, withIntermediateDirectories: true, attributes: nil)
            let current = try webKit.resourceValues(forKeys: [.isExcludedFromBackupKey])
            if current.isExcludedFromBackup == true { return }
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try webKit.setResourceValues(values)
        } catch {
            NSLog("Training OS: no se pudo excluir Library/WebKit de la copia de iCloud: %@", error.localizedDescription)
        }
    }
}
