import ActivityKit
import Capacitor
import Foundation
import UIKit
import UserNotifications

/**
 * WorkoutNotification en iOS: el mismo plugin, los mismos métodos y los mismos
 * datos que en Android (docs/NATIVE-CONTRACT.md), cumplidos con las API de
 * Apple.
 *
 *   - Entrenamiento en curso → Live Activity (ActivityKit). La pinta la
 *     extensión TrainingOSWidgets; aquí sólo se pide, se actualiza y se
 *     termina.
 *   - «Descanso terminado» → notificación local con identificador fijo
 *     (UNUserNotificationCenter + UNTimeIntervalNotificationTrigger).
 *   - Vibración → UIImpactFeedbackGenerator / UINotificationFeedbackGenerator.
 *   - Volver al entrenamiento → evento `open`, desde el enlace de la Live
 *     Activity (`trainingos://workout/active?session=<id>`) o desde el toque
 *     en el aviso de descanso.
 *
 * Tres reglas, por este orden:
 *
 *   1. Nada de esto puede tumbar un entrenamiento. Cada método resuelve o
 *      rechaza SIEMPRE (una promesa colgada bloquearía la cola de JavaScript),
 *      y un fallo de ActivityKit o de las notificaciones se contesta como
 *      «no se ha mostrado», nunca como error.
 *   2. Ningún texto visible sale de aquí: todo llega ya traducido con t().
 *   3. Nada bloquea la cola del puente: el trabajo va en tareas del hilo
 *      principal, encadenadas para que `start`, `stop` y los avisos se
 *      apliquen en el mismo orden en que los pidió JavaScript.
 *
 * Se registra a mano en MainViewController.capacitorDidLoad().
 */
@objc(WorkoutNotificationPlugin)
final class WorkoutNotificationPlugin: CAPPlugin, CAPBridgedPlugin, NotificationHandlerProtocol {
    let identifier = "WorkoutNotificationPlugin"
    let jsName = "WorkoutNotification"
    // Los nueve métodos del contrato; `addListener` lo atiende Capacitor. Un
    // método que falte aquí deja su promesa colgada en JavaScript.
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleRestAlert", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelRestAlert", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "haptic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestExactAlarm", returnType: CAPPluginReturnPromise),
    ]

    private var observers: [NSObjectProtocol] = []

    /// Protege lo que se toca desde varios hilos: la cola del puente, el hilo
    /// principal y los callbacks de UNUserNotificationCenter.
    private let lock = NSLock()
    private var appIsActive = false
    private var lastTappedNotification: String?
    private var chainTail: Task<Void, Never>?

    override func load() {
        // Capacitor ya es el delegado de UNUserNotificationCenter
        // (NotificationRouter). No se sustituye: el plugin se apunta como su
        // manejador de avisos locales.
        bridge?.notificationRouter.localNotificationHandler = self

        let center = NotificationCenter.default
        // Toque en la Live Activity. Capacitor repite el enlace del arranque
        // en frío cuando la vista aparece, con el plugin ya cargado.
        observers.append(center.addObserver(forName: Notification.Name.capacitorOpenURL, object: nil, queue: .main) { [weak self] notification in
            self?.handleOpenURL(notification)
        })
        observers.append(center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.setAppActive(true)
        })
        observers.append(center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.setAppActive(false)
        })
        Task { @MainActor [weak self] in
            self?.setAppActive(UIApplication.shared.applicationState == .active)
            // Las actividades de un arranque anterior también se vigilan: si la
            // persona quita una, no se vuelve a pedir para esa sesión.
            WorkoutLiveActivities.shared.observeExisting()
        }
    }

    deinit {
        for observer in observers {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    // MARK: - Presencia (Live Activity)

    @objc func start(_ call: CAPPluginCall) {
        guard let presence = WorkoutPresence.parse(call) else {
            call.reject("start necesita sessionId (^[A-Za-z0-9-]{1,64}$), startedAt (número) y title")
            return
        }
        serially {
            let shown = await WorkoutLiveActivities.shared.show(presence)
            call.resolve(["shown": shown])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        serially {
            RestAlerts.removeAll()
            await WorkoutLiveActivities.shared.endAll()
            call.resolve()
        }
    }

    // MARK: - Aviso de fin de descanso

    @objc func scheduleRestAlert(_ call: CAPPluginCall) {
        guard let alert = RestAlertOptions.parse(call) else {
            call.reject("scheduleRestAlert necesita sessionId (^[A-Za-z0-9-]{1,64}$), at (número) y title")
            return
        }
        serially {
            let scheduled = await RestAlerts.schedule(alert)
            // En iOS el aviso siempre es puntual: no hay alarma «aproximada».
            call.resolve(["scheduled": scheduled, "exact": true])
        }
    }

    @objc func cancelRestAlert(_ call: CAPPluginCall) {
        serially {
            let delivered = await RestAlerts.cancel()
            call.resolve(["delivered": delivered])
        }
    }

    // MARK: - Vibración

    @objc func haptic(_ call: CAPPluginCall) {
        guard let kind = call.getString("kind").flatMap(HapticKind.init(rawValue:)) else {
            call.reject("haptic necesita kind: tick, success, pr o warn")
            return
        }
        Task { @MainActor in
            kind.play()
            call.resolve()
        }
    }

    // MARK: - Capacidades y permisos

    @objc func isSupported(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            call.resolve([
                "presence": ActivityAuthorizationInfo().areActivitiesEnabled,
                "restAlerts": RestAlerts.isAllowed(settings.authorizationStatus),
                // Los avisos de iOS ya son puntuales; no hay permiso aparte.
                "exactAlarms": true,
            ])
        }
    }

    /*
     * `display` es el permiso de notificaciones. En iOS sólo condiciona el
     * aviso de descanso: la Live Activity no lo necesita y se pide igualmente
     * (si la persona las desactivó, `start` contesta { shown: false }).
     */

    @objc override func checkPermissions(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            call.resolve(["display": WorkoutNotificationPlugin.permissionState(settings.authorizationStatus)])
        }
    }

    @objc override func requestPermissions(_ call: CAPPluginCall) {
        // Sólo aviso y sonido: ni globos en el icono ni avisos críticos. Si
        // ya se contestó antes, iOS no vuelve a preguntar y devuelve lo que hay.
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, error in
            if let error {
                CAPLog.print("WorkoutNotification: permiso de notificaciones:", error.localizedDescription)
            }
            // Se contesta con el estado real, no con el booleano: también
            // cubre el permiso provisional y un error de la petición.
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                call.resolve(["display": WorkoutNotificationPlugin.permissionState(settings.authorizationStatus)])
            }
        }
    }

    /// Android 12+ necesita un permiso para las alarmas exactas. iOS no.
    @objc func requestExactAlarm(_ call: CAPPluginCall) {
        call.resolve(["exactAlarms": true])
    }

    private static func permissionState(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .authorized, .provisional, .ephemeral:
            return "granted"
        case .denied:
            return "denied"
        case .notDetermined:
            return "prompt"
        @unknown default:
            return "prompt"
        }
    }

    // MARK: - NotificationHandlerProtocol (avisos locales)

    func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        // Con la app delante y activa, el fin del descanso ya lo anuncia
        // JavaScript (sonido y vibración): el aviso del sistema sería doble.
        if notification.request.identifier == RestAlerts.identifier && isAppActive() {
            return []
        }
        return [.banner, .list, .sound]
    }

    func didReceive(response: UNNotificationResponse) {
        let notification = response.notification
        guard notification.request.identifier == RestAlerts.identifier,
              response.actionIdentifier == UNNotificationDefaultActionIdentifier
        else { return }
        // El mismo toque puede llegar dos veces en un arranque en frío: por
        // el delegado de Capacitor y por las opciones de conexión de la
        // escena (SceneDelegate). Sólo cuenta una.
        let key = "\(notification.request.identifier)@\(notification.date.timeIntervalSince1970)"
        guard claimTap(key) else { return }
        emitOpen(sessionId: notification.request.content.userInfo["sessionId"] as? String)
    }

    // MARK: - Interno

    /**
     * Encadena el trabajo en el hilo principal en el orden de llegada.
     *
     * Los métodos llegan en fila por la cola del puente, pero el trabajo de
     * ActivityKit y de las notificaciones es asíncrono: sin la cadena, un
     * `stop` podría adelantar a un `start` o a un `scheduleRestAlert` que aún
     * no hubiera terminado, y dejar una actividad o un aviso vivos con el
     * entrenamiento ya cerrado. Nada espera bloqueado: cada tarea espera a la
     * anterior con `await`.
     */
    private func serially(_ operation: @escaping @MainActor () async -> Void) {
        lock.lock()
        let previous = chainTail
        chainTail = Task { @MainActor in
            _ = await previous?.value
            await operation()
        }
        lock.unlock()
    }

    private func handleOpenURL(_ notification: Notification) {
        guard let info = notification.object as? [String: Any],
              let url = info["url"] as? URL,
              let sessionId = WorkoutActivityLink.sessionId(from: url)
        else { return }
        // Retenido: en un arranque en frío JavaScript aún no escucha.
        notifyListeners("open", data: ["sessionId": sessionId], retainUntilConsumed: true)
    }

    private func emitOpen(sessionId: String?) {
        let payload: [String: Any]
        if let sessionId, WorkoutActivityLink.isValidSessionId(sessionId) {
            payload = ["sessionId": sessionId]
        } else {
            // Sin id, JavaScript abre el entrenamiento activo, si lo hay.
            payload = [:]
        }
        DispatchQueue.main.async { [weak self] in
            self?.notifyListeners("open", data: payload, retainUntilConsumed: true)
        }
    }

    private func setAppActive(_ active: Bool) {
        lock.lock()
        appIsActive = active
        lock.unlock()
    }

    private func isAppActive() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return appIsActive
    }

    /// `true` la primera vez que se ve este toque; `false` si ya se atendió.
    private func claimTap(_ key: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard lastTappedNotification != key else { return false }
        lastTappedNotification = key
        return true
    }
}

// MARK: - Live Activity

/**
 * Dueño de las Live Activities del entrenamiento. Todo ocurre en el hilo
 * principal (es donde se lee el estado de la app) y en el orden que marca la
 * cadena del plugin.
 */
@MainActor
final class WorkoutLiveActivities {
    static let shared = WorkoutLiveActivities()

    /// Sesiones cuya actividad quitó la persona. En los UserDefaults de la
    /// propia app (PrivacyInfo: CA92.1) para que sobreviva a un reinicio.
    private static let dismissedKey = "training-os.live-activity.dismissed-sessions"
    private static let dismissedLimit = 20

    /// Actividades cuyo estado ya se vigila.
    private var observed = Set<String>()
    /// Actividades que estamos terminando nosotros: su `.dismissed` no es de la persona.
    private var endingIds = Set<String>()

    private init() {}

    /**
     * Upsert por sesión (contrato, regla 4):
     *   - Una actividad de esta sesión, activa o «stale» → se actualiza.
     *   - Cualquier otra (otra sesión, duplicada, terminada) → se termina ya.
     *   - Ninguna → se pide una nueva, salvo que la app esté en segundo plano
     *     (iOS no lo permite) o que la persona ya quitara la de esta sesión.
     *
     * Devuelve si la actividad queda en pantalla. Un fallo de ActivityKit es
     * un `false`, nunca un error.
     */
    func show(_ presence: WorkoutPresence) async -> Bool {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
        let content = ActivityContent(state: presence.state, staleDate: presence.staleDate)

        var kept: Activity<WorkoutActivityAttributes>?
        for activity in Activity<WorkoutActivityAttributes>.activities {
            let sameSession = activity.attributes.sessionId == presence.sessionId
            let state = activity.activityState
            if sameSession && state == .dismissed && !endingIds.contains(activity.id) {
                // La quitó mientras la app no estaba para verlo.
                rememberDismissed(presence.sessionId)
            }
            if kept == nil && sameSession && (state == .active || state == .stale) {
                kept = activity
            } else {
                await end(activity)
            }
        }

        if let kept {
            observe(kept)
            await kept.update(content)
            return true
        }
        guard !isDismissed(presence.sessionId) else { return false }
        guard UIApplication.shared.applicationState != .background else { return false }
        do {
            let activity = try Activity<WorkoutActivityAttributes>.request(
                attributes: WorkoutActivityAttributes(sessionId: presence.sessionId),
                content: content,
                pushType: nil
            )
            observe(activity)
            return true
        } catch {
            CAPLog.print("WorkoutNotification: no se pudo mostrar la Live Activity:", error.localizedDescription)
            return false
        }
    }

    /// Termina todas, ya (fin o descarte del entrenamiento, cierre de sesión…).
    func endAll() async {
        for activity in Activity<WorkoutActivityAttributes>.activities {
            await end(activity)
        }
    }

    func observeExisting() {
        for activity in Activity<WorkoutActivityAttributes>.activities {
            observe(activity)
        }
    }

    private func end(_ activity: Activity<WorkoutActivityAttributes>) async {
        if observed.contains(activity.id) && activity.activityState != .dismissed {
            endingIds.insert(activity.id)
        }
        // Sin contenido final y sin quedarse en la pantalla de bloqueo: un
        // entrenamiento terminado no tiene nada más que enseñar ahí.
        await activity.end(nil, dismissalPolicy: .immediate)
    }

    private func observe(_ activity: Activity<WorkoutActivityAttributes>) {
        let activityId = activity.id
        guard !observed.contains(activityId) else { return }
        observed.insert(activityId)
        let sessionId = activity.attributes.sessionId
        Task { [weak self] in
            for await state in activity.activityStateUpdates {
                guard state == .dismissed else { continue }
                self?.activityWasDismissed(activityId: activityId, sessionId: sessionId)
                break
            }
            self?.observed.remove(activityId)
        }
    }

    private func activityWasDismissed(activityId: String, sessionId: String) {
        if endingIds.remove(activityId) != nil { return }
        rememberDismissed(sessionId)
    }

    private func isDismissed(_ sessionId: String) -> Bool {
        let list = UserDefaults.standard.stringArray(forKey: WorkoutLiveActivities.dismissedKey) ?? []
        return list.contains(sessionId)
    }

    private func rememberDismissed(_ sessionId: String) {
        var list = UserDefaults.standard.stringArray(forKey: WorkoutLiveActivities.dismissedKey) ?? []
        guard !list.contains(sessionId) else { return }
        list.append(sessionId)
        UserDefaults.standard.set(Array(list.suffix(WorkoutLiveActivities.dismissedLimit)), forKey: WorkoutLiveActivities.dismissedKey)
    }
}

/**
 * `WorkoutPresence` del contrato, ya convertido en el estado de la actividad.
 * Lo que no viene o viene mal se sustituye por un valor neutro; sólo faltar
 * el id, la hora de inicio o el título es motivo de rechazo.
 */
struct WorkoutPresence: Sendable {
    let sessionId: String
    let state: WorkoutActivityAttributes.ContentState
    /// Fin del descanso en marcha: a esa hora la actividad pasa a «Descanso
    /// terminado» aunque la app esté dormida. Sin descanso o en pausa, `nil`.
    let staleDate: Date?

    /// Un día: tope para que un número absurdo no desborde al pasarlo a Int.
    private static let maxRestSeconds: Double = 24 * 60 * 60

    static func parse(_ call: CAPPluginCall, now: Date = Date()) -> WorkoutPresence? {
        guard let sessionId = call.getString("sessionId"),
              WorkoutActivityLink.isValidSessionId(sessionId),
              let startedAtMs = usableNumber(call.getDouble("startedAt")),
              let title = call.getString("title")
        else { return nil }

        // Nunca en el futuro: el cronómetro empezaría en negativo.
        let startedAt = min(Date(timeIntervalSince1970: startedAtMs / 1000), now)
        let labels = call.getObject("labels") ?? [:]

        var restEndsAt: Date?
        var restStartedAt: Date?
        var restPaused: Bool?
        var restRemaining: Int?
        var staleDate: Date?
        if let rest = call.getObject("rest"), let endsAtMs = usableNumber(rest["endsAt"] as? Double) {
            let endsAt = Date(timeIntervalSince1970: endsAtMs / 1000)
            let total = min(max(usableNumber(rest["total"] as? Double) ?? 0, 0), maxRestSeconds)
            let paused = (rest["paused"] as? Bool) ?? false
            let remaining = min(max(usableNumber(rest["remaining"] as? Double) ?? 0, 0), maxRestSeconds)
            restEndsAt = endsAt
            // Límite inferior <= superior siempre: Text(timerInterval:) no
            // admite un rango al revés.
            restStartedAt = min(endsAt.addingTimeInterval(-total), endsAt)
            restPaused = paused
            restRemaining = paused ? Int(remaining.rounded()) : nil
            staleDate = paused ? nil : endsAt
        }

        let state = WorkoutActivityAttributes.ContentState(
            startedAt: startedAt,
            title: limited(title, 64),
            sessionName: limited(call.getString("sessionName") ?? "", 120),
            exerciseName: call.getString("exerciseName").map { limited($0, 120) },
            setLabel: call.getString("setLabel").map { limited($0, 64) },
            progressLabel: limited(call.getString("progressLabel") ?? "", 64),
            restEndsAt: restEndsAt,
            restStartedAt: restStartedAt,
            restPaused: restPaused,
            restRemaining: restRemaining,
            restLabel: limited((labels["rest"] as? String) ?? "", 48),
            restOverLabel: limited((labels["restOver"] as? String) ?? "", 48),
            elapsedLabel: limited((labels["elapsed"] as? String) ?? "", 48),
            pausedLabel: limited((labels["paused"] as? String) ?? "", 48),
            localeIdentifier: limited(call.getString("locale") ?? Locale.current.identifier, 32)
        )
        return WorkoutPresence(sessionId: sessionId, state: state, staleDate: staleDate)
    }
}

/// `RestAlert` del contrato. `vibrate` no se lee: en iOS la vibración de un
/// aviso va con su sonido y no se puede separar.
struct RestAlertOptions: Sendable {
    let sessionId: String
    let at: Date
    let atMs: Double
    let title: String
    let body: String
    let sound: Bool

    static func parse(_ call: CAPPluginCall) -> RestAlertOptions? {
        guard let sessionId = call.getString("sessionId"),
              WorkoutActivityLink.isValidSessionId(sessionId),
              let atMs = usableNumber(call.getDouble("at")),
              let title = call.getString("title")
        else { return nil }
        return RestAlertOptions(
            sessionId: sessionId,
            at: Date(timeIntervalSince1970: atMs / 1000),
            atMs: atMs,
            title: limited(title, 120),
            body: limited(call.getString("body") ?? "", 240),
            sound: call.getBool("sound") ?? true
        )
    }
}

/**
 * El aviso «Descanso terminado»: uno solo, con identificador fijo. Programar
 * otro lo reemplaza; cancelar lo quita tanto si está pendiente como si ya se
 * entregó.
 */
enum RestAlerts {
    static let identifier = "training-os.rest-end"
    static let threadIdentifier = "training-os.rest"

    static func isAllowed(_ status: UNAuthorizationStatus) -> Bool {
        switch status {
        case .authorized, .provisional, .ephemeral:
            return true
        case .denied, .notDetermined:
            return false
        @unknown default:
            return false
        }
    }

    static func removeAll() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
        center.removeDeliveredNotifications(withIdentifiers: [identifier])
    }

    static func schedule(_ alert: RestAlertOptions) async -> Bool {
        let center = UNUserNotificationCenter.current()
        // Lo anterior sobra siempre: el pendiente es de este mismo descanso
        // (se reemplaza) y uno ya entregado es de un descanso pasado. Así,
        // un aviso entregado es siempre el del descanso en curso
        // (cancelRestAlert lo usa para contestar `delivered`).
        removeAll()
        let settings = await center.notificationSettings()
        guard isAllowed(settings.authorizationStatus) else { return false }
        // A medio segundo o menos ya no tiene sentido avisar: el descanso ha
        // terminado y, con la app delante, lo anuncia JavaScript.
        let delay = alert.at.timeIntervalSinceNow
        guard delay >= 0.5 else { return false }

        let content = UNMutableNotificationContent()
        content.title = alert.title
        content.body = alert.body
        content.sound = alert.sound ? UNNotificationSound.default : nil
        content.threadIdentifier = threadIdentifier
        content.userInfo = ["sessionId": alert.sessionId, "at": alert.atMs]
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false)
        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)
        do {
            try await center.add(request)
            return true
        } catch {
            CAPLog.print("WorkoutNotification: no se pudo programar el aviso de descanso:", error.localizedDescription)
            return false
        }
    }

    /// Quita el aviso y dice si ya había salido.
    static func cancel() async -> Bool {
        let delivered = await UNUserNotificationCenter.current().deliveredNotifications()
        let wasDelivered = delivered.contains { $0.request.identifier == identifier }
        removeAll()
        return wasDelivered
    }
}

/// Los cuatro tipos de vibración del contrato.
private enum HapticKind: String {
    case tick
    case success
    case pr
    case warn

    @MainActor
    func play() {
        switch self {
        case .tick:
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case .success:
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        case .pr:
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        case .warn:
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        }
    }
}

/// Un número de JavaScript utilizable (ni NaN ni infinito).
private func usableNumber(_ value: Double?) -> Double? {
    guard let value, value.isFinite else { return nil }
    return value
}

/// Recorta un texto a `limit` caracteres: el estado de una Live Activity no
/// puede pasar de 4 KB y la pantalla sólo enseña una línea de cada cosa.
private func limited(_ text: String, _ limit: Int) -> String {
    text.count > limit ? String(text.prefix(limit)) : text
}
