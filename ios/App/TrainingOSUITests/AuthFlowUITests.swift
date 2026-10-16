import XCTest

/// Pruebas de cuenta de punta a punta: Firebase Auth y Firestore DE VERDAD
/// (los emuladores locales de Firebase), con la app compilada en modo `test`
/// (`.env.test`). Las ejecuta `.github/workflows/ios-auth.yml`, que entre un
/// test y otro mira Firestore por su API REST y corta o devuelve la red.
///
/// - Sin `TRAINING_OS_AUTH_E2E=1` en el entorno se saltan (`XCTSkip`): la
///   ejecución normal de los tests de interfaz (ios.yml) usa una app sin
///   Firebase y no tiene emuladores con los que hablar.
/// - Se ejecutan EN ORDEN y de uno en uno (`-only-testing:` con cada nombre):
///   el orden alfabético de los nombres es el orden de la historia, y cada
///   uno deja el dispositivo como lo espera el siguiente. El CI desinstala la
///   app antes del primero.
/// - Las capturas se guardan siempre (`.keepAlways`) en el `.xcresult`.
final class AuthFlowUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    override func tearDownWithError() throws {
        AppDriver.attachFinalState(to: self)
    }

    /// Instalación nueva: crear la cuenta A, responder el cuestionario,
    /// entrenar (un ejercicio, una serie), finalizar y dar tiempo a que suba.
    /// El CI comprueba después en Firestore que A tiene al menos una sesión.
    @MainActor
    func test1_signupOnboardTrainAndSync() throws {
        let cfg = try AuthE2E.load()
        let ui = AppDriver(test: self)
        ui.launch()
        let first = ui.waitForAnyScreen(AppDriver.Wait.boot)
        ui.screenshot("1·1 Primera pantalla de una instalación nueva")
        XCTAssertTrue(first.signedOut, "Una instalación nueva debe empezar sin sesión, en la bienvenida; está en \(first.rawValue)")

        ui.signUp(cfg.a, password: cfg.password, shot: "1·2 Registro de A: formulario relleno")
        ui.screenshot("1·3 Cuestionario de la cuenta nueva")
        ui.completeOnboardingIfNeeded()
        ui.screenshot("1·4 Inicio con la cuenta A")

        ui.startFreeWorkout()
        ui.addExercise()
        ui.logFirstSet()
        ui.screenshot("1·5 Serie registrada")
        // «FINALIZAR ENTRENAMIENTO» y, en el diálogo, «FINALIZAR».
        ui.finishWorkout()
        ui.screenshot("1·6 Entrenamiento guardado")

        // Tiempo para que la sincronización suba la sesión al emulador.
        ui.pause(10)
        ui.openSettings()
        ui.noteSyncStatus(timeout: 30)
        ui.screenshot("1·7 Ajustes: estado de la sincronización de A")
    }

    /// Cerrar la app del todo y volver a abrirla: sigue dentro, con la cuenta
    /// A, sin pasar por la bienvenida ni por iniciar sesión.
    @MainActor
    func test2_sessionPersistsAcrossRelaunch() throws {
        let cfg = try AuthE2E.load()
        let ui = AppDriver(test: self)
        ui.launch()
        XCTAssertFalse(ui.waitForAnyScreen(AppDriver.Wait.boot) == .unknown, "La app no enseña nada reconocible")
        ui.app.terminate()
        ui.launch()
        let screen = ui.waitForAnyScreen(AppDriver.Wait.boot)
        ui.screenshot("2·1 Tras cerrar y volver a abrir la app")
        XCTAssertFalse(screen.signedOut, "Al volver a abrir la app se ha perdido la sesión: está en \(screen.rawValue)")
        XCTAssertEqual(screen, .app, "Al volver a abrir la app debe quedarse dentro; está en \(screen.rawValue)")
        XCTAssertTrue(ui.showsAccount(cfg.a), "«Más» no enseña la cuenta A (@\(cfg.a.username))")
        ui.screenshot("2·2 Más: sigue la cuenta A")
    }

    /// Cerrar sesión desde Ajustes (con confirmación) → bienvenida. Entrar
    /// otra vez como A → su historial vuelve de Firestore, con el
    /// «Entrenamiento libre» del test 1.
    @MainActor
    func test3_logoutAndLogin() throws {
        let cfg = try AuthE2E.load()
        let ui = AppDriver(test: self)
        ui.launch()
        var loggedInHere = false
        if ui.waitForAnyScreen(AppDriver.Wait.boot).signedOut {
            ui.note("La app empezó sin sesión: se entra como A para poder probar el cierre.")
            ui.logIn(cfg.a, password: cfg.password)
            loggedInHere = true
        }
        ui.endActiveWorkoutIfAny()

        ui.logOut(expectActiveWorkout: false, shot: "3·1 Confirmación de cerrar sesión")
        let out = ui.authScreenNow()
        ui.screenshot("3·2 Sesión cerrada")
        if !loggedInHere {
            XCTAssertEqual(out, .welcome, "Tras cerrar sesión debe verse la bienvenida; está en \(out.rawValue)")
        }

        ui.logIn(cfg.a, password: cfg.password)
        ui.screenshot("3·3 Dentro otra vez como A")
        XCTAssertTrue(
            ui.historyShows(AuthLabels.freeWorkout, timeout: 90),
            "Tras iniciar sesión, el historial de A no muestra «\(AuthLabels.freeWorkout)»"
        )
        ui.screenshot("3·4 Historial de A tras iniciar sesión")
    }

    /// «¿Olvidaste la contraseña?» con el email de A → aviso de enlace
    /// enviado. El CI comprueba en el emulador que se generó el código
    /// PASSWORD_RESET. Acaba otra vez dentro como A y con su historial en el
    /// dispositivo: el arranque sin conexión (test 5) lo necesita.
    @MainActor
    func test4_passwordResetRequest() throws {
        let cfg = try AuthE2E.load()
        let ui = AppDriver(test: self)
        ui.launch()
        if ui.waitForAnyScreen(AppDriver.Wait.boot) == .app {
            ui.endActiveWorkoutIfAny()
            ui.logOut(expectActiveWorkout: false, shot: "4·1 Cerrar sesión antes de recuperar la contraseña")
        }

        ui.goToLoginForm()
        ui.tap(ui.button(containing: AuthLabels.forgot), "¿Olvidaste la contraseña?")
        let title = ui.text(containing: AuthLabels.resetTitle)
        XCTAssertTrue(ui.waitUntil(AppDriver.Wait.screen) { title.exists }, "No se abre «\(AuthLabels.resetTitle)»")
        ui.pause(0.8) // la transición entre pantallas dura medio segundo
        ui.fill(ui.formField("Email", index: 0), with: cfg.a.email, "Email", anchor: title)
        ui.hideKeyboard(tapping: title)
        ui.screenshot("4·2 Recuperar contraseña: email de A")
        ui.submit(ui.button(AuthLabels.resetSend), "Enviar enlace")

        let sent = ui.text(containing: AuthLabels.resetSent)
        let shown = ui.waitUntil(30) { sent.exists }
        let error = shown ? "" : (ui.authState().error ?? "ninguno")
        ui.screenshot("4·3 Enlace de recuperación enviado")
        XCTAssertTrue(shown, "No aparece «\(AuthLabels.resetSent)…» (error en pantalla: \(error))")

        ui.tap(ui.button(AuthLabels.back), "Volver (de recuperar contraseña a iniciar sesión)")
        ui.logIn(cfg.a, password: cfg.password)
        XCTAssertTrue(
            ui.historyShows(AuthLabels.freeWorkout, timeout: 90),
            "Tras volver a entrar, el historial de A no vuelve a este dispositivo"
        )
        // Margen para que termine de bajar y guardarse todo en local.
        ui.pause(5)
        ui.screenshot("4·4 A dentro otra vez, con su historial")
    }

    /// Lo ejecuta el CI con los puertos de Firebase CORTADOS (pf): arranque en
    /// frío sin servidor → la app abre el inicio con la copia local (no la
    /// pantalla «Sin conexión con el servidor») y se puede entrenar y
    /// finalizar. La sesión queda en la cola para subir.
    @MainActor
    func test5_offlineColdStart() throws {
        _ = try AuthE2E.load()
        let ui = AppDriver(test: self)
        ui.launch()
        // Sin red, Firestore tarda unos segundos en darse por desconectado
        // antes de que la app abra la copia local: espera larga.
        let screen = ui.waitForAnyScreen(150)
        ui.screenshot("5·1 Arranque en frío sin conexión")
        XCTAssertNotEqual(
            screen,
            .connectionError,
            "Sin conexión, la app se queda en «\(AuthLabels.connectionError)» en vez de abrir los datos de este dispositivo"
        )
        XCTAssertEqual(screen, .app, "Sin conexión, la app debe abrir el inicio con la copia local; está en \(screen.rawValue)")

        ui.endActiveWorkoutIfAny()
        ui.startFreeWorkout()
        ui.addExercise()
        ui.logFirstSet()
        ui.screenshot("5·2 Serie registrada sin conexión")
        ui.finishWorkout()
        ui.screenshot("5·3 Entrenamiento guardado sin conexión")
        ui.pause(3)
        ui.app.terminate()
    }

    /// Ya con red: arrancar y dejar que la cola suba. El CI comprueba que A
    /// tiene EXACTAMENTE una sesión más en Firestore (ni se pierde ni se
    /// duplica).
    @MainActor
    func test6_onlineResync() throws {
        _ = try AuthE2E.load()
        let ui = AppDriver(test: self)
        ui.launch()
        let screen = ui.waitForAnyScreen(AppDriver.Wait.boot)
        ui.screenshot("6·1 De nuevo con conexión")
        XCTAssertEqual(screen, .app, "Con la conexión de vuelta la app debe abrir dentro; está en \(screen.rawValue)")
        ui.pause(20)
        ui.openSettings()
        ui.noteSyncStatus(timeout: 60)
        ui.screenshot("6·2 Ajustes tras volver la conexión")
    }

    /// Cambio de cuenta sin fugas: A deja un entrenamiento EN CURSO y cierra
    /// sesión (el diálogo avisa de que se descartará) → se crea B en el mismo
    /// dispositivo → B no ve nada de A: ni su historial, ni la barra del
    /// entrenamiento en curso, ni su Live Activity.
    @MainActor
    func test7_accountSwitchNoLeak() throws {
        let cfg = try AuthE2E.load()
        let ui = AppDriver(test: self)
        ui.launch()
        if ui.waitForAnyScreen(AppDriver.Wait.boot).signedOut {
            ui.logIn(cfg.a, password: cfg.password)
        }
        ui.endActiveWorkoutIfAny()

        ui.startFreeWorkout()
        ui.addExercise()
        ui.pause(2)
        ui.screenshot("7·1 A: entrenamiento en curso")
        ui.goHome()
        ui.screenshot("7·2 A: Live Activity del entrenamiento en curso")
        ui.app.activate()
        XCTAssertTrue(ui.waitUntil(AppDriver.Wait.screen) { ui.inSession }, "Al volver a la app la sesión de A no está")

        ui.logOut(expectActiveWorkout: true, shot: "7·3 Cerrar sesión con un entrenamiento en curso")
        ui.screenshot("7·4 A ha cerrado sesión")

        ui.signUp(cfg.b, password: cfg.password, shot: "7·5 Registro de B: formulario relleno")
        ui.completeOnboardingIfNeeded()

        // Nada de A en la sesión de B. La sesión en curso se restaura de
        // IndexedDB después de pintar el inicio: se le da tiempo a aparecer.
        let bar = ui.button(startingWith: AuthLabels.activeBar)
        let leaked = ui.waitUntil(8) { bar.exists || ui.inSession }
        ui.screenshot("7·6 Inicio de B")
        XCTAssertFalse(leaked, "B ve el entrenamiento en curso de A («\(AuthLabels.activeBar)»)")

        ui.openHistory()
        let empty = ui.text(containing: AuthLabels.historyEmpty)
        let isEmpty = ui.waitUntil(AppDriver.Wait.screen) { empty.exists }
        let foreign = ui.button(containing: AuthLabels.freeWorkout).exists
        ui.screenshot("7·7 Historial de B")
        XCTAssertFalse(foreign, "El historial de B enseña «\(AuthLabels.freeWorkout)», un entrenamiento de A")
        XCTAssertTrue(isEmpty, "El historial de B no está vacío («\(AuthLabels.historyEmpty)»)")
        XCTAssertTrue(ui.showsAccount(cfg.b), "«Más» no enseña la cuenta B (@\(cfg.b.username))")

        ui.goHome()
        ui.pause(2)
        ui.screenshot("7·8 Inicio del sistema con B: sin Live Activity de A")
        if ui.lock() {
            let gone = ui.waitUntil(10) { !ui.liveActivity.exists }
            ui.screenshot("7·9 Pantalla de bloqueo con B: sin Live Activity de A")
            ui.unlock()
            XCTAssertTrue(gone, "La pantalla de bloqueo sigue enseñando el entrenamiento de A después de cambiar de cuenta")
        }
    }

    /// Eliminar la cuenta B: con una contraseña equivocada sale un error y la
    /// sesión sigue abierta (no se ha tocado nada); con la buena, la cuenta
    /// desaparece y se vuelve a la bienvenida. El CI comprueba en el emulador
    /// que de B no queda nada y que lo de A sigue intacto.
    @MainActor
    func test8_deleteAccountWrongThenRight() throws {
        let cfg = try AuthE2E.load()
        let ui = AppDriver(test: self)
        ui.launch()
        if ui.waitForAnyScreen(AppDriver.Wait.boot).signedOut {
            ui.logIn(cfg.b, password: cfg.password)
        }
        XCTAssertTrue(ui.showsAccount(cfg.b), "La sesión abierta no es la de B (@\(cfg.b.username)): no se elimina nada")

        ui.openSettings()
        ui.tap(ui.button(AuthLabels.deleteAccount), "Eliminar cuenta (Ajustes)")
        let warning = ui.text(containing: AuthLabels.deleteWarning)
        XCTAssertTrue(ui.waitUntil(AppDriver.Wait.screen) { warning.exists }, "No se abre la hoja de eliminar la cuenta")
        let password = ui.deletePasswordField()
        let word = ui.deleteWordField()

        // 1. Contraseña equivocada.
        var wrong = "Incorrecta9"
        if wrong == cfg.password { wrong += "x" }
        ui.fill(password, with: wrong, "Contraseña (equivocada)", anchor: warning)
        ui.fill(word, with: AuthLabels.deleteWord, "Escribe ELIMINAR", anchor: warning)
        ui.hideKeyboard(tapping: warning)
        ui.screenshot("8·1 Eliminar cuenta con la contraseña equivocada")
        ui.tap(ui.lastButton(AuthLabels.deleteAccount), "Eliminar cuenta (hoja)")

        var state = ui.waitForAuth(30) { screen, error in error != nil || screen.signedOut }
        ui.screenshot("8·2 Error y la sesión sigue abierta")
        XCTAssertFalse(state.screen.signedOut, "Con la contraseña equivocada se ha cerrado la sesión o eliminado la cuenta")
        XCTAssertNotNil(state.error, "Con la contraseña equivocada no aparece ningún error")
        if let error = state.error, error != AuthLabels.badCredentials {
            ui.note("El error con la contraseña equivocada es «\(error)», no «\(AuthLabels.badCredentials)».")
        }
        XCTAssertTrue(warning.exists, "La hoja de eliminar la cuenta se ha cerrado tras el error")

        // 2. La contraseña buena.
        ui.replaceSecureText(in: password, with: cfg.password, "Contraseña (la buena)", anchor: warning)
        ui.hideKeyboard(tapping: warning)
        ui.tap(ui.lastButton(AuthLabels.deleteAccount), "Eliminar cuenta (hoja, contraseña buena)")
        state = ui.waitForAuth(90) { screen, _ in screen.signedOut }
        ui.screenshot("8·3 Cuenta B eliminada: bienvenida")
        XCTAssertTrue(state.screen.signedOut, "Tras eliminar la cuenta no se vuelve a la bienvenida; está en \(state.screen.rawValue)")
    }
}

// MARK: - Configuración

/// Credenciales de las pruebas de cuenta. Las genera el CI en cada ejecución
/// y sólo existen en el emulador de Firebase de ese job: no son secretos.
/// Llegan por el entorno porque xcodebuild pasa al proceso de los tests las
/// variables `TEST_RUNNER_*` quitándoles el prefijo.
struct AuthE2E {
    struct Account {
        let name: String
        let username: String
        let email: String
    }

    let a: Account
    let b: Account
    let password: String

    static func load() throws -> AuthE2E {
        let env = ProcessInfo.processInfo.environment
        guard env["TRAINING_OS_AUTH_E2E"] == "1" else {
            throw XCTSkip("Pruebas de cuenta: sólo con TRAINING_OS_AUTH_E2E=1 y los emuladores de Firebase (ios-auth.yml).")
        }
        func value(_ key: String) throws -> String {
            let raw = env[key]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return try XCTUnwrap(raw.isEmpty ? nil : raw, "Falta \(key) (TEST_RUNNER_\(key) al llamar a xcodebuild)")
        }
        return try AuthE2E(
            a: Account(name: "Alice", username: value("AUTH_USER_A"), email: value("AUTH_EMAIL_A")),
            b: Account(name: "Bob", username: value("AUTH_USER_B"), email: value("AUTH_EMAIL_B")),
            password: value("AUTH_PASSWORD")
        )
    }
}

/// Textos de la app en español (`src/lib/i18n/es.ts`). Si cambian allí,
/// cambian aquí.
enum AuthLabels {
    static let createAccount = "CREAR CUENTA" // auth.createAccount (bienvenida)
    static let logIn = "INICIAR SESIÓN" // auth.logIn (bienvenida)
    static let signUpTitle = "Crea tu cuenta" // auth.createTitle
    static let signUpCta = "Crear cuenta" // auth.signUpCta (registro y enlace en iniciar sesión)
    static let loginTitle = "Hola de nuevo" // auth.welcomeBack
    static let loginCta = "Entrar" // auth.logInCta (iniciar sesión y enlace en el registro)
    static let forgot = "Olvidaste la contraseña" // auth.forgot, sin «¿?»
    static let resetTitle = "Recuperar contraseña" // auth.resetTitle
    static let resetSend = "Enviar enlace" // auth.resetSend
    static let resetSent = "Si esa dirección tiene cuenta" // auth.resetSent
    static let connectionError = "Sin conexión con el servidor" // auth.error.network
    static let retry = "Reintentar" // common.retry (pantalla de error de conexión)
    static let badCredentials = "Email o contraseña incorrectos" // auth.error.badCredentials
    static let logout = "Cerrar sesión" // account.logout
    static let logoutConfirm = "Se cerrará la sesión" // account.logoutConfirm
    static let logoutActiveWorkout = "Tienes un entrenamiento en curso" // account.logoutActiveWorkout
    static let logoutAnyway = "Cerrar sesión igualmente" // account.logoutAnyway
    static let deleteAccount = "Eliminar cuenta" // account.delete
    static let deleteWarning = "Se borrarán para siempre" // account.deleteWarning
    static let deleteWord = "ELIMINAR" // account.deleteWord
    static let freeWorkout = "Entrenamiento libre" // workout.startFree / nombre de la sesión
    static let historyEmpty = "Sin entrenamientos registrados" // history.empty
    static let activeBar = "Volver al entrenamiento en curso" // workout.barAria
    static let synced = "Sincronizado" // sync.synced
    static let more = "Más" // nav.more
    static let settings = "Ajustes" // settings.title
    static let history = "Historial" // history.title
    static let back = "Volver" // common.back
    static let offerStart = "Personalizar" // ob.update.start
    static let notNow = "Ahora no" // ob.update.later
    static let migrateTitle = "Hemos encontrado datos en este dispositivo" // migrate.title
    static let usernameTitle = "Elige tu nombre de usuario" // auth.usernameTitle

    /// Los errores que pintan los formularios de cuenta (auth.error.*).
    static let authErrors = [
        "Ya existe una cuenta con ese email",
        "Ese email no es válido",
        "La contraseña es demasiado débil",
        badCredentials,
        "Demasiados intentos",
        connectionError,
        "Por seguridad, vuelve a iniciar sesión",
        "Ese nombre de usuario ya está cogido",
        "Algo ha fallado",
    ]
}

/// Dónde está la app, vista desde fuera.
enum AuthScreen: String {
    case app = "la app (inicio o entrenamiento)"
    case onboarding = "el cuestionario"
    case onboardingOffer = "la oferta del cuestionario nuevo"
    case welcome = "la bienvenida"
    case login = "iniciar sesión"
    case signup = "crear cuenta"
    case forgot = "recuperar contraseña"
    case connectionError = "«Sin conexión con el servidor»"
    case migrating = "«Hemos encontrado datos en este dispositivo»"
    case needsUsername = "«Elige tu nombre de usuario»"
    case unknown = "nada reconocible (¿comprobando la sesión?)"

    /// Las pantallas de alguien sin sesión.
    var signedOut: Bool {
        switch self {
        case .welcome, .login, .signup, .forgot: return true
        default: return false
        }
    }

    /// A dónde puede llevar un formulario de cuenta ya enviado: ya no hay que
    /// seguir esperando (las que no son la app o el cuestionario hacen fallar
    /// el test con su nombre).
    var afterAuth: Bool {
        switch self {
        case .app, .onboarding, .onboardingOffer, .connectionError, .migrating, .needsUsername: return true
        default: return false
        }
    }
}

/// Lo que se puede tocar, como en `AppDriver`: WebKit expone algunos botones
/// como interruptores y las pestañas como enlaces.
private let authTappable: Set<XCUIElement.ElementType> = [.button, .link, .toggle, .switch, .checkBox]

// MARK: - Conducir las pantallas de cuenta

extension AppDriver {
    // MARK: Leer la pantalla

    /// Tipo y etiqueta de todo lo que expone el WKWebView, leído de una sola
    /// vez (`snapshot`). Clasificar la pantalla con una consulta por marcador
    /// costaría varios segundos por vuelta en el simulador de CI.
    func webNodes() -> [(kind: XCUIElement.ElementType, label: String)] {
        guard web.exists, let root = try? web.snapshot() else { return [] }
        var found: [(kind: XCUIElement.ElementType, label: String)] = []
        var pending: [XCUIElementSnapshot] = [root]
        while let node = pending.popLast() {
            if !node.label.isEmpty { found.append((kind: node.elementType, label: node.label)) }
            pending.append(contentsOf: node.children)
        }
        return found
    }

    /// La pantalla actual y, si un formulario de cuenta enseña un error, cuál.
    func authState() -> (screen: AuthScreen, error: String?) {
        let nodes = webNodes()
        if nodes.isEmpty { return (screen: .unknown, error: nil) }
        func shows(_ text: String) -> Bool { nodes.contains { $0.label.contains(text) } }
        func control(_ label: String) -> Bool {
            nodes.contains { $0.label == label && authTappable.contains($0.kind) }
        }
        let error = AuthLabels.authErrors.first { shows($0) }
        let step = "^Paso\\s+[0-9]+\\s+de\\s+[0-9]+$"

        let screen: AuthScreen
        if shows(AuthLabels.connectionError) && control(AuthLabels.retry) {
            screen = .connectionError
        } else if nodes.contains(where: { $0.label.range(of: step, options: .regularExpression) != nil }) {
            screen = .onboarding
        } else if control(AuthLabels.offerStart) && control(AuthLabels.notNow) {
            screen = .onboardingOffer
        } else if shows(AuthLabels.migrateTitle) {
            screen = .migrating
        } else if shows(AuthLabels.usernameTitle) {
            screen = .needsUsername
        } else if shows(AuthLabels.resetTitle) {
            screen = .forgot
        } else if shows(AuthLabels.signUpTitle) {
            screen = .signup
        } else if shows(AuthLabels.loginTitle) {
            screen = .login
        } else if control(AuthLabels.createAccount) || control(AuthLabels.logIn) {
            screen = .welcome
        } else if control("Entreno") || control("FINALIZAR ENTRENAMIENTO") || control("Añadir ejercicio")
            || control("Hecho") || nodes.contains(where: { $0.label.hasPrefix(AuthLabels.activeBar) }) {
            screen = .app
        } else {
            screen = .unknown
        }
        return (screen: screen, error: error)
    }

    func authScreenNow() -> AuthScreen {
        authState().screen
    }

    /// Espera hasta que la pantalla cumpla `accept` (o se acabe el tiempo) y
    /// devuelve lo último que vio.
    @discardableResult
    func waitForAuth(
        _ timeout: TimeInterval,
        until accept: (AuthScreen, String?) -> Bool
    ) -> (screen: AuthScreen, error: String?) {
        var state: (screen: AuthScreen, error: String?) = (screen: .unknown, error: nil)
        waitUntil(timeout) {
            state = authState()
            return accept(state.screen, state.error)
        }
        return state
    }

    /// La primera pantalla reconocible: deja atrás el splash y «Comprobando
    /// sesión…».
    func waitForAnyScreen(_ timeout: TimeInterval) -> AuthScreen {
        waitForAuth(timeout) { screen, _ in screen != .unknown }.screen
    }

    // MARK: Formularios

    /// Campos editables del WKWebView (texto y contraseña), en el orden del
    /// documento.
    var editableFields: XCUIElementQuery {
        let types: [XCUIElement.ElementType] = [.textField, .secureTextField]
        let editable = NSPredicate(
            format: "elementType IN %@",
            argumentArray: [types.map { NSNumber(value: $0.rawValue) }]
        )
        return web.descendants(matching: .any).matching(editable)
    }

    /// Un campo de los formularios de cuenta por su `<label>` (la hoja de
    /// estilos lo pone en mayúsculas: se compara sin distinguirlas) o, si
    /// WebKit no lo expone así, por su posición en el formulario.
    func formField(_ label: String, index: Int) -> XCUIElement {
        let named = editableFields.matching(NSPredicate(format: "label ==[c] %@", label)).firstMatch
        if named.waitForExistence(timeout: 2) { return named }
        return editableFields.element(boundBy: index)
    }

    /// Esconde el teclado tocando `anchor`, un texto fijo de la pantalla (su
    /// título): en el WKWebView, tocar fuera del campo le quita el foco. Así
    /// no se pulsa Intro, que en el último campo enviaría el formulario, y el
    /// siguiente campo no queda debajo del teclado.
    func hideKeyboard(tapping anchor: XCUIElement) {
        let keyboard = app.keyboards.firstMatch
        guard keyboard.exists else { return }
        if anchor.exists && anchor.isHittable {
            anchor.tap()
            if waitUntil(2, { !keyboard.exists }) { return }
        }
        dismissKeyboard()
        waitUntil(2) { !keyboard.exists }
    }

    func fill(
        _ field: XCUIElement,
        with value: String,
        _ what: String,
        anchor: XCUIElement,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        hideKeyboard(tapping: anchor)
        type(value, into: field, what, file: file, line: line)
        // Lo escrito tiene que estar en ESTE campo. Un registro de ios-auth
        // acabó con «Email» vacío y «Crear cuenta» desactivado, y el test sólo
        // lo vio dos minutos después, sin decir qué campo falló.
        let shown = waitUntil(3) { AppDriver.fieldShows(field.value as? String ?? "", typed: value, secure: field.elementType == .secureTextField) }
        if !shown { screenshot("\(what): no conserva lo escrito") }
        XCTAssertTrue(shown, "«\(what)» no conserva lo escrito (muestra «\(field.value as? String ?? "")»)", file: file, line: line)
    }

    /// Lo que la accesibilidad enseña de un campo ¿es `typed`? WebKit recorta
    /// los valores largos con «...» y las contraseñas llegan como puntos.
    static func fieldShows(_ shown: String, typed: String, secure: Bool) -> Bool {
        let cut = shown.hasSuffix("...")
        let visible = cut ? String(shown.dropLast(3)) : shown
        if secure {
            let dots = visible.filter { $0 == "•" }.count
            return cut ? dots > 0 && dots <= typed.count : dots == typed.count
        }
        return cut ? !visible.isEmpty && typed.hasPrefix(visible) : visible == typed
    }

    /// Sustituye lo escrito en un campo de contraseña: lo vacía (y comprueba
    /// que queda vacío), escribe `value` y comprueba que hay tantos puntos
    /// como caracteres.
    func replaceSecureText(
        in field: XCUIElement,
        with value: String,
        _ what: String,
        anchor: XCUIElement,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        hideKeyboard(tapping: anchor)
        tap(field, what, file: file, line: line)
        _ = app.keyboards.firstMatch.waitForExistence(timeout: 3)
        requireFocus(field, what, file: file, line: line)
        clearFocusedField(field, what, file: file, line: line)
        app.typeText(value)
        pause(0.4)
        let shown = waitUntil(3) { AppDriver.fieldShows(field.value as? String ?? "", typed: value, secure: true) }
        if !shown { screenshot("\(what): no conserva lo escrito") }
        XCTAssertTrue(shown, "«\(what)» no conserva lo escrito (muestra «\(field.value as? String ?? "")»)", file: file, line: line)
    }

    /// El botón que envía un formulario. Si al cerrar el teclado se pulsó
    /// Intro, el formulario ya se envió y el botón dice «Cargando…».
    func submit(_ cta: XCUIElement, _ what: String, file: StaticString = #filePath, line: UInt = #line) {
        if cta.waitForExistence(timeout: Wait.short) {
            tap(cta, what, file: file, line: line)
        } else {
            note("«\(what)» ya no está: el formulario se envió al cerrar el teclado.")
        }
    }

    // MARK: Pantallas sin sesión

    /// Lleva a «Iniciar sesión» desde cualquier pantalla sin sesión. Tras
    /// cerrar sesión la app vuelve a la última que se usó (bienvenida o
    /// iniciar sesión).
    func goToLoginForm(file: StaticString = #filePath, line: UInt = #line) {
        for _ in 0..<3 {
            let screen = waitForAnyScreen(Wait.screen)
            switch screen {
            case .login:
                return
            case .welcome:
                tap(button(AuthLabels.logIn), "INICIAR SESIÓN (bienvenida)", file: file, line: line)
            case .signup:
                tap(button(AuthLabels.loginCta), "Entrar (enlace del registro)", file: file, line: line)
            case .forgot:
                tap(button(AuthLabels.back), "Volver (recuperar contraseña)", file: file, line: line)
            default:
                XCTFail("Para iniciar sesión hace falta estar sin sesión; la app está en \(screen.rawValue)", file: file, line: line)
                return
            }
            waitUntil(Wait.screen) { authScreenNow() != screen }
            pause(0.8) // la transición entre pantallas dura medio segundo
        }
        XCTAssertEqual(authScreenNow(), .login, "No se llega a «\(AuthLabels.loginTitle)»", file: file, line: line)
    }

    /// Lleva a «Crea tu cuenta» desde cualquier pantalla sin sesión.
    func goToSignUpForm(file: StaticString = #filePath, line: UInt = #line) {
        for _ in 0..<3 {
            let screen = waitForAnyScreen(Wait.screen)
            switch screen {
            case .signup:
                return
            case .welcome:
                tap(button(AuthLabels.createAccount), "CREAR CUENTA (bienvenida)", file: file, line: line)
            case .login:
                tap(button(AuthLabels.signUpCta), "Crear cuenta (enlace de iniciar sesión)", file: file, line: line)
            case .forgot:
                tap(button(AuthLabels.back), "Volver (recuperar contraseña)", file: file, line: line)
            default:
                XCTFail("Para crear una cuenta hace falta estar sin sesión; la app está en \(screen.rawValue)", file: file, line: line)
                return
            }
            waitUntil(Wait.screen) { authScreenNow() != screen }
            pause(0.8)
        }
        XCTAssertEqual(authScreenNow(), .signup, "No se llega a «\(AuthLabels.signUpTitle)»", file: file, line: line)
    }

    /// Crea la cuenta con los cinco campos del formulario (nombre, usuario,
    /// email, contraseña, repetirla) y espera al cuestionario, que es por
    /// donde empieza toda cuenta nueva.
    func signUp(_ who: AuthE2E.Account, password: String, shot: String, file: StaticString = #filePath, line: UInt = #line) {
        goToSignUpForm(file: file, line: line)
        let anchor = text(containing: AuthLabels.signUpTitle)
        fill(formField("Nombre", index: 0), with: who.name, "Nombre", anchor: anchor, file: file, line: line)
        fill(formField("Nombre de usuario", index: 1), with: who.username, "Nombre de usuario", anchor: anchor, file: file, line: line)
        fill(formField("Email", index: 2), with: who.email, "Email", anchor: anchor, file: file, line: line)
        fill(formField("Contraseña", index: 3), with: password, "Contraseña", anchor: anchor, file: file, line: line)
        fill(formField("Repite la contraseña", index: 4), with: password, "Repite la contraseña", anchor: anchor, file: file, line: line)
        hideKeyboard(tapping: anchor)
        screenshot(shot)
        submit(button(AuthLabels.signUpCta), "Crear cuenta", file: file, line: line)

        let state = waitForAuth(120) { screen, error in
            (screen.signedOut && error != nil) || screen.afterAuth
        }
        if let error = state.error, state.screen.signedOut {
            XCTFail("El registro de \(who.email) falla: «\(error)»", file: file, line: line)
            return
        }
        XCTAssertEqual(
            state.screen,
            .onboarding,
            "Una cuenta nueva debe empezar por el cuestionario; la app está en \(state.screen.rawValue)",
            file: file,
            line: line
        )
    }

    /// Inicia sesión con email y contraseña y espera a estar dentro.
    func logIn(_ who: AuthE2E.Account, password: String, file: StaticString = #filePath, line: UInt = #line) {
        goToLoginForm(file: file, line: line)
        let anchor = text(containing: AuthLabels.loginTitle)
        fill(formField("Email", index: 0), with: who.email, "Email", anchor: anchor, file: file, line: line)
        fill(formField("Contraseña", index: 1), with: password, "Contraseña", anchor: anchor, file: file, line: line)
        hideKeyboard(tapping: anchor)
        submit(button(AuthLabels.loginCta), "Entrar", file: file, line: line)
        enterApp(after: "iniciar sesión como \(who.email)", file: file, line: line)
    }

    /// Tras enviar un formulario de cuenta: espera a la app. Si aparece la
    /// oferta del cuestionario nuevo, «Ahora no»; si aparece el cuestionario,
    /// se responde (y se deja una nota: una cuenta que ya lo hizo no debería
    /// verlo).
    func enterApp(after what: String, timeout: TimeInterval = 120, file: StaticString = #filePath, line: UInt = #line) {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            let state = waitForAuth(max(1, deadline.timeIntervalSinceNow)) { screen, error in
                (screen.signedOut && error != nil) || screen.afterAuth
            }
            switch state.screen {
            case .app:
                return
            case .onboarding:
                note("Tras \(what) aparece el cuestionario: se responde.")
                completeOnboardingIfNeeded(file: file, line: line)
            case .onboardingOffer:
                tap(button(AuthLabels.notNow), "Ahora no (cuestionario nuevo)", file: file, line: line)
            default:
                let error = state.error.map { ": «\($0)»" } ?? ""
                XCTFail("Tras \(what) la app está en \(state.screen.rawValue)\(error)", file: file, line: line)
                return
            }
        }
        XCTFail("Tras \(what) no se llega a la app en \(Int(timeout)) s", file: file, line: line)
    }

    // MARK: Dentro de la app

    /// Sale de la pantalla del entrenamiento SIN cerrarlo («Volver» de su
    /// cabecera): dentro de la sesión no hay barra de pestañas.
    func leaveWorkoutScreenIfShown(file: StaticString = #filePath, line: UInt = #line) {
        guard inSession else { return }
        tap(button(AuthLabels.back), "Volver (salir de la sesión sin cerrarla)", file: file, line: line)
        XCTAssertTrue(waitUntil(Wait.screen) { !inSession }, "No se sale de la pantalla del entrenamiento", file: file, line: line)
    }

    /// Una pestaña de la barra de abajo (son enlaces).
    func openTab(_ label: String, file: StaticString = #filePath, line: UInt = #line) {
        leaveWorkoutScreenIfShown(file: file, line: line)
        let link = web.links.matching(NSPredicate(format: "label == %@", label)).firstMatch
        tap(link.waitForExistence(timeout: Wait.short) ? link : button(label), "pestaña \(label)", file: file, line: line)
    }

    /// Una fila de «Más» por su texto exacto o, si WebKit le añade algo, por
    /// lo que contiene.
    func moreRow(_ label: String) -> XCUIElement {
        let exact = button(label)
        let row = exact.waitForExistence(timeout: Wait.short) ? exact : button(containing: label)
        // Las últimas filas («Ajustes») quedan bajo la barra de pestañas.
        if row.exists { scrollClearOfBottomBars(row) }
        return row
    }

    func openSettings(file: StaticString = #filePath, line: UInt = #line) {
        openTab(AuthLabels.more, file: file, line: line)
        tap(moreRow(AuthLabels.settings), "Ajustes (Más)", file: file, line: line)
        XCTAssertTrue(
            waitUntil(Wait.screen) { button(AuthLabels.logout).exists },
            "Ajustes no enseña «\(AuthLabels.logout)»: ¿hay sesión?",
            file: file,
            line: line
        )
    }

    func openHistory(file: StaticString = #filePath, line: UInt = #line) {
        openTab(AuthLabels.more, file: file, line: line)
        tap(moreRow(AuthLabels.history), "Historial (Más)", file: file, line: line)
        pause(1.5)
    }

    /// El historial enseña una tarjeta con `title`. Lo que viene de Firestore
    /// tras iniciar sesión tarda: se vuelve a abrir el historial cada pocos
    /// segundos hasta `timeout`.
    func historyShows(_ title: String, timeout: TimeInterval, file: StaticString = #filePath, line: UInt = #line) -> Bool {
        let card = button(containing: title)
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            openHistory(file: file, line: line)
            if waitUntil(10, { card.exists }) { return true }
        } while Date() < deadline
        return false
    }

    /// «Más» enseña la fila del perfil, «Nombre · @usuario», de esta cuenta.
    func showsAccount(_ who: AuthE2E.Account, file: StaticString = #filePath, line: UInt = #line) -> Bool {
        openTab(AuthLabels.more, file: file, line: line)
        let row = button(containing: "@\(who.username)")
        return waitUntil(Wait.screen) { row.exists }
    }

    /// Deja una nota si Ajustes no llega a «Sincronizado». No falla: la
    /// prueba que cuenta la hace el CI leyendo Firestore.
    func noteSyncStatus(timeout: TimeInterval) {
        let synced = text(containing: AuthLabels.synced)
        if !waitUntil(timeout, { synced.exists }) {
            note("Ajustes no enseña «\(AuthLabels.synced)» en \(Int(timeout)) s; el CI lo comprueba en Firestore.")
        }
    }

    /// Ajustes → «Cerrar sesión» → confirmación. Con un entrenamiento en curso
    /// el diálogo tiene que avisar y su botón decir «Cerrar sesión
    /// igualmente». Termina en una pantalla sin sesión.
    func logOut(expectActiveWorkout: Bool, shot: String, file: StaticString = #filePath, line: UInt = #line) {
        openSettings(file: file, line: line)
        tap(button(AuthLabels.logout), "Cerrar sesión (Ajustes)", file: file, line: line)
        let body = text(containing: AuthLabels.logoutConfirm)
        XCTAssertTrue(waitUntil(Wait.screen) { body.exists }, "No aparece la confirmación de cerrar sesión", file: file, line: line)

        let warning = text(containing: AuthLabels.logoutActiveWorkout)
        let anyway = button(AuthLabels.logoutAnyway)
        if expectActiveWorkout {
            let warned = waitUntil(Wait.short) { warning.exists }
            screenshot(shot)
            XCTAssertTrue(warned, "El diálogo no avisa del entrenamiento en curso («\(AuthLabels.logoutActiveWorkout)…»)", file: file, line: line)
            XCTAssertTrue(anyway.exists, "Con un entrenamiento en curso el botón debe decir «\(AuthLabels.logoutAnyway)»", file: file, line: line)
        } else {
            screenshot(shot)
        }

        if anyway.exists {
            // También sale si quedan cambios sin subir.
            tap(anyway, AuthLabels.logoutAnyway, file: file, line: line)
        } else {
            // El diálogo se pinta al final del documento: su botón es el último.
            tap(lastButton(AuthLabels.logout), "Cerrar sesión (confirmación)", file: file, line: line)
        }
        // Cerrar sesión espera hasta 8 s a la subida y 5 s a que pare la sincronización.
        let state = waitForAuth(90) { screen, _ in screen.signedOut }
        XCTAssertTrue(
            state.screen.signedOut,
            "Tras cerrar sesión no aparece la bienvenida; la app está en \(state.screen.rawValue)",
            file: file,
            line: line
        )
    }

    // MARK: Eliminar la cuenta

    /// La contraseña de la hoja de eliminar la cuenta: con la hoja abierta es
    /// el único campo de contraseña.
    func deletePasswordField() -> XCUIElement {
        let secure = web.secureTextFields.firstMatch
        if secure.waitForExistence(timeout: Wait.short) { return secure }
        return editableFields.matching(NSPredicate(format: "label ==[c] %@", "Contraseña")).firstMatch
    }

    /// «Escribe ELIMINAR para confirmar». Si WebKit no expone su etiqueta, es
    /// el último campo del documento: la hoja se pinta al final.
    func deleteWordField() -> XCUIElement {
        let named = web.textFields.matching(NSPredicate(format: "label CONTAINS[c] %@", AuthLabels.deleteWord)).firstMatch
        if named.waitForExistence(timeout: Wait.short) { return named }
        let count = editableFields.count
        return count > 0 ? editableFields.element(boundBy: count - 1) : named
    }
}
