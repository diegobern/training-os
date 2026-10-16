import XCTest

/// Conduce Training OS desde fuera, como lo haría una persona: tocando lo que
/// se ve en el WKWebView por su texto o por su etiqueta de accesibilidad.
///
/// Reglas que siguen todos los tests:
///
/// - La app va en español: se lanza con `-AppleLanguages (es)` y, en una
///   instalación nueva, el idioma de la app sigue al del dispositivo.
/// - La compilación de CI es SÓLO LOCAL: sin claves de Firebase la app arranca
///   sin cuenta y, la primera vez, en el cuestionario. Nada depende de la red.
/// - Las esperas son largas a propósito. Un WKWebView en el simulador de CI
///   tarda en arrancar y en pintar, y un test que falla por impaciente no dice
///   nada de la app.
/// - El estado (IndexedDB) sobrevive entre tests en el mismo simulador. Cada
///   test se coloca solo en el punto de partida (cuestionario hecho, ningún
///   entrenamiento en curso) en vez de suponer en qué orden se ejecutan.
@MainActor
final class AppDriver {
    /// Tiempos máximos, en segundos.
    enum Wait {
        static let boot: TimeInterval = 60
        static let screen: TimeInterval = 25
        static let short: TimeInterval = 5
    }

    let app: XCUIApplication
    let springboard: XCUIApplication
    private let test: XCTestCase

    init(test: XCTestCase) {
        self.test = test
        app = XCUIApplication()
        springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        app.launchArguments += ["-AppleLanguages", "(es)", "-AppleLocale", "es_ES"]
    }

    var web: XCUIElement { app.webViews.firstMatch }

    /// Deja en el resultado del test, pase o falle, cómo quedó todo: una
    /// captura de pantalla, el árbol de accesibilidad de la app (lo que
    /// XCUITest «ve» del WKWebView) y quién está delante. Es lo que permite
    /// saber, sin un Mac delante, por qué un paso no encontró lo que buscaba.
    @MainActor
    static func attachFinalState(to test: XCTestCase) {
        let app = XCUIApplication(bundleIdentifier: "com.trainingos.app")
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = "Final: pantalla"
        shot.lifetime = .keepAlways
        test.add(shot)
        let state = XCTAttachment(string: "estado de la app: \(app.state.rawValue) (4 = en primer plano)\n\n" + app.debugDescription)
        state.name = "Final: árbol de la app"
        state.lifetime = .keepAlways
        test.add(state)
        let board = XCTAttachment(string: springboard.debugDescription)
        board.name = "Final: árbol de SpringBoard"
        board.lifetime = .keepAlways
        test.add(board)
    }

    // MARK: - Esperas

    func pause(_ seconds: TimeInterval) {
        RunLoop.current.run(until: Date().addingTimeInterval(seconds))
    }

    /// Repite `condition` hasta que se cumple o se acaba el tiempo. Mientras
    /// espera atiende el permiso de notificaciones si aparece: el diálogo tapa
    /// la app y cualquier espera fallaría sin decir por qué.
    @discardableResult
    func waitUntil(_ timeout: TimeInterval, _ condition: () -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while true {
            if condition() { return true }
            if Date() >= deadline { return false }
            allowSystemAlertIfShown()
            pause(0.5)
        }
    }

    // MARK: - Encontrar cosas en el WKWebView

    /// Lo que se puede tocar: botones, enlaces e interruptores. WebKit expone
    /// un `<button aria-pressed>` como interruptor, no como botón, y los chips
    /// del cuestionario y la casilla de cada serie lo son.
    private func control(_ predicate: NSPredicate) -> XCUIElementQuery {
        let types: [XCUIElement.ElementType] = [.button, .toggle, .switch, .checkBox, .link]
        let tappable = NSPredicate(
            format: "elementType IN %@",
            argumentArray: [types.map { NSNumber(value: $0.rawValue) }]
        )
        return web.descendants(matching: .any)
            .matching(NSCompoundPredicate(andPredicateWithSubpredicates: [tappable, predicate]))
    }

    func button(_ label: String) -> XCUIElement {
        control(NSPredicate(format: "label == %@", label)).firstMatch
    }

    func button(containing text: String) -> XCUIElement {
        control(NSPredicate(format: "label CONTAINS[c] %@", text)).firstMatch
    }

    func button(startingWith text: String) -> XCUIElement {
        control(NSPredicate(format: "label BEGINSWITH %@", text)).firstMatch
    }

    /// El último de varios botones iguales. Los diálogos de la app se pintan
    /// al final del documento, así que el «DESCARTAR» del diálogo va detrás
    /// del «DESCARTAR» de la propia pantalla de la sesión.
    func lastButton(_ label: String) -> XCUIElement {
        let query = control(NSPredicate(format: "label == %@", label))
        let count = query.count
        return count > 0 ? query.element(boundBy: count - 1) : query.firstMatch
    }

    func text(containing text: String) -> XCUIElement {
        web.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }

    /// Un campo por su `aria-label` («Peso», «Repeticiones»).
    func field(_ label: String) -> XCUIElement {
        web.textFields.matching(NSPredicate(format: "label == %@", label)).firstMatch
    }

    /// Un campo sin etiqueta, por su texto de ejemplo (el buscador: «Buscar»).
    func field(placeholder: String) -> XCUIElement {
        let types: [XCUIElement.ElementType] = [.textField, .searchField]
        let editable = NSPredicate(
            format: "elementType IN %@",
            argumentArray: [types.map { NSNumber(value: $0.rawValue) }]
        )
        let named = NSPredicate(format: "placeholderValue == %@ OR label == %@", placeholder, placeholder)
        return web.descendants(matching: .any)
            .matching(NSCompoundPredicate(andPredicateWithSubpredicates: [editable, named]))
            .firstMatch
    }

    private func isOn(_ element: XCUIElement) -> Bool {
        if element.isSelected { return true }
        if let value = element.value as? String { return value == "1" || value.lowercased() == "true" }
        if let value = element.value as? NSNumber { return value.boolValue }
        return false
    }

    // MARK: - Tocar y escribir

    /// Toca `element` en cuanto se puede tocar. Si existe pero no está a la
    /// vista, desplaza la página poco a poco: «Entrenamiento libre» y
    /// «FINALIZAR ENTRENAMIENTO» quedan al final de pantallas largas.
    func tap(
        _ element: XCUIElement,
        _ what: String,
        timeout: TimeInterval = Wait.screen,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertTrue(waitUntil(timeout) { element.exists }, "No aparece: \(what)", file: file, line: line)
        if !waitUntil(3, { element.isHittable }) {
            // Con el teclado en pantalla no se arrastra: el gesto empezaría
            // sobre una tecla y escribiría en el campo.
            for _ in 0..<8 where !element.isHittable && !app.keyboards.firstMatch.exists {
                // Arrastre lento y sostenido: sin inercia, para no pasarse.
                let from = web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.72))
                let to = web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.38))
                from.press(forDuration: 0.05, thenDragTo: to, withVelocity: .slow, thenHoldForDuration: 0.1)
                pause(0.6)
            }
        }
        // En pantallas pequeñas el teclado tapa lo que hay debajo del campo
        // (el primer resultado del buscador): se esconde y se vuelve a mirar.
        if !element.isHittable && app.keyboards.firstMatch.exists {
            dismissKeyboard()
            waitUntil(3) { element.isHittable }
        }
        // Un botón desactivado (la casilla de la serie hasta que hay peso y
        // repeticiones válidos) se toca sin efecto: mejor esperar a que no lo esté.
        waitUntil(Wait.short) { element.isEnabled }
        if element.isHittable {
            element.tap()
        } else {
            // WebKit a veces publica como «no tocable» un elemento que está a
            // la vista (dentro de un contenedor con su propio scroll, como la
            // hoja del buscador). Si su marco cae dentro de la ventana, se toca
            // en su centro; si no, es que de verdad no se ve.
            let frame = element.frame
            let window = app.windows.firstMatch.frame
            XCTAssertTrue(
                !frame.isEmpty && window.intersects(frame),
                "Está pero no se puede tocar: \(what)",
                file: file,
                line: line
            )
            // Bajo el teclado, el toque caería en una tecla y escribiría en el
            // campo que tiene el foco.
            let keyboard = app.keyboards.firstMatch
            XCTAssertFalse(
                keyboard.exists && keyboard.frame.contains(CGPoint(x: frame.midX, y: frame.midY)),
                "El teclado tapa: \(what)",
                file: file,
                line: line
            )
            element.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        pause(0.4)
    }

    /// Lo que la app fija abajo, encima del contenido: las pestañas y la barra
    /// del entrenamiento en curso.
    static let tabLabels = ["Inicio", "Rutinas", "Entreno", "Progreso", "Más"]

    /// WebKit da por tocable lo que queda DEBAJO de una barra fija, y el toque
    /// se lo lleva la barra: «Ajustes», la última fila de «Más», se tocó en
    /// (57, 822) y abrió «Inicio». Si el elemento cae bajo una de esas
    /// barras, se sube la página (arrastre lento, por encima de ellas) hasta
    /// que quede libre. A las barras mismas no se les hace nada. Sólo para
    /// páginas sin hojas ni diálogos abiertos: un arrastre sobre el fondo de
    /// una hoja la cerraría.
    func scrollClearOfBottomBars(_ element: XCUIElement) {
        guard !app.keyboards.firstMatch.exists else { return }
        let fixed = NSPredicate(
            format: "label IN %@ OR label BEGINSWITH %@",
            AppDriver.tabLabels,
            "Volver al entrenamiento en curso"
        )
        for _ in 0..<6 {
            let bars = (web.links.matching(fixed).allElementsBoundByIndex + web.buttons.matching(fixed).allElementsBoundByIndex)
                .filter { $0.exists }
                .map { $0.frame }
                .filter { !$0.isEmpty }
            let target = element.frame
            guard let top = bars.map({ $0.minY }).min(), !bars.contains(target), target.maxY > top else { return }
            let from = web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6))
            let to = web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.42))
            from.press(forDuration: 0.05, thenDragTo: to, withVelocity: .slow, thenHoldForDuration: 0.1)
            pause(0.6)
        }
    }

    /// Esconde el teclado de pantalla. Primero con «OK» («Done») de la barra
    /// que WKWebView pone encima del teclado: quita el foco sin enviar nada.
    /// Esa barra es otra ventana, no forma parte de `app.keyboards`. Si no
    /// está, con la tecla de acción del teclado (que en el buscador es
    /// «Buscar» y en los números no existe) o, si no la tiene, enviando un
    /// salto de línea, que en estos campos no escribe nada.
    func dismissKeyboard() {
        let keyboard = app.keyboards.firstMatch
        guard keyboard.exists else { return }
        let done = app.toolbars.buttons.matching(NSPredicate(format: "label IN %@", ["OK", "Done", "Listo", "Aceptar"])).firstMatch
        if done.exists && done.isHittable {
            done.tap()
            if waitUntil(2, { !keyboard.exists }) { return }
        }
        for label in ["Buscar", "Search", "Done", "OK", "Listo", "Return", "Intro", "return"] {
            let key = keyboard.buttons[label]
            if key.exists && key.isHittable {
                key.tap()
                pause(0.5)
                return
            }
        }
        app.typeText("\n")
        pause(0.5)
    }

    /// Escribe en un campo del WKWebView. Borra antes lo que hubiera (un peso
    /// precargado de la sesión anterior) para no acabar con «6060».
    func type(
        _ text: String,
        into field: XCUIElement,
        _ what: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        tap(field, what, file: file, line: line)
        // Con teclado físico conectado en el simulador no sale el de pantalla;
        // la espera sólo da tiempo a que el campo reciba el foco.
        _ = app.keyboards.firstMatch.waitForExistence(timeout: 3)
        requireFocus(field, what, file: file, line: line)
        if !isEmpty(field) {
            clearFocusedField(field, what, file: file, line: line)
        }
        app.typeText(text)
        pause(0.4)
    }

    /// Vacío o con su texto de ejemplo.
    func isEmpty(_ field: XCUIElement) -> Bool {
        let current = field.value as? String ?? ""
        return current.isEmpty || current == field.placeholderValue
    }

    /// Vacía el campo que tiene el foco con la tecla de borrar del teclado,
    /// mantenida pulsada. Mandar borrados como texto (`typeText` con
    /// `XCUIKeyboardKey.delete`) no hizo nada en un campo de WKWebView: en
    /// ios-auth la contraseña buena acabó escrita detrás de la equivocada.
    /// Sin teclado en pantalla (teclado físico) no hay tecla que pulsar y se
    /// mandan como texto.
    func clearFocusedField(_ field: XCUIElement, _ what: String, file: StaticString = #filePath, line: UInt = #line) {
        let delete = app.keys["delete"]
        // El toque de XCTest cae en el borde izquierdo del campo y WebKit deja
        // el cursor donde cae: DELANTE del texto (se ve «|•••••••••••» en los
        // fotogramas de ios-auth), y borrar desde ahí no borra nada. Un toque
        // en la parte derecha, antes del ojo de las contraseñas, lo lleva al
        // final.
        field.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.5)).tap()
        pause(0.3)
        for _ in 0..<3 where !isEmpty(field) {
            if delete.exists {
                delete.press(forDuration: 3)
            } else {
                app.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 60))
            }
            pause(0.3)
        }
        XCTAssertTrue(isEmpty(field), "No se puede vaciar «\(what)» (muestra «\(field.value as? String ?? "")»)", file: file, line: line)
    }

    /// `typeText` escribe donde esté el foco: si el toque no se lo dio a
    /// `field`, el texto acabaría en otro campo (la contraseña repetida
    /// escrita dos veces en «Contraseña»). Mejor fallar aquí, diciendo cuál.
    func requireFocus(_ field: XCUIElement, _ what: String, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(
            waitUntil(3) { (field.value(forKey: "hasKeyboardFocus") as? Bool) == true },
            "El campo no recibe el foco: \(what)",
            file: file,
            line: line
        )
    }

    // MARK: - Sistema: permisos, inicio, bloqueo, capturas

    /// Si el sistema está preguntando algo (en estos tests, sólo el permiso de
    /// notificaciones que la app pide al empezar el primer entrenamiento), lo
    /// acepta. El diálogo es de SpringBoard y va en el idioma del SISTEMA, no
    /// en el de la app: se busca «Allow» y «Permitir» y, si no, el último botón,
    /// que en los diálogos de permiso de iOS es el afirmativo.
    @discardableResult
    func allowSystemAlertIfShown(timeout: TimeInterval = 0) -> Bool {
        let alert = springboard.alerts.firstMatch
        let shown = timeout > 0 ? alert.waitForExistence(timeout: timeout) : alert.exists
        guard shown else { return false }
        let allow = alert.buttons.matching(NSPredicate(format: "label == %@ OR label == %@", "Allow", "Permitir")).firstMatch
        if allow.exists {
            allow.tap()
        } else {
            let count = alert.buttons.count
            guard count > 0 else { return false }
            alert.buttons.element(boundBy: count - 1).tap()
        }
        pause(1)
        return true
    }

    /// Al inicio del sistema. Devuelve si el inicio está a la vista: un enlace
    /// abierto antes de eso lo recibe la app que todavía está delante y, al
    /// terminar la animación, queda en segundo plano. Se mira el icono de la
    /// app en SpringBoard y no `app.state`: con el inicio ya en pantalla (y
    /// la Live Activity en la isla) `app.state` seguía diciendo «en primer
    /// plano», también al acabar el test.
    @discardableResult
    func goHome() -> Bool {
        XCUIDevice.shared.press(.home)
        let icon = springboard.icons["Training OS"]
        let shown = waitUntil(Wait.short) { icon.exists && icon.isHittable }
        pause(3)
        return shown
    }

    /// Bloquea el simulador con el botón lateral. `pressLockButton` es un
    /// método privado de XCUIDevice: si un Xcode futuro lo quita, el test sigue
    /// sin la captura de la pantalla de bloqueo en vez de romperse.
    @discardableResult
    func lock() -> Bool {
        let selector = NSSelectorFromString("pressLockButton")
        guard XCUIDevice.shared.responds(to: selector) else {
            note("XCUIDevice ya no responde a pressLockButton: sin captura de la pantalla de bloqueo.")
            return false
        }
        _ = XCUIDevice.shared.perform(selector)
        pause(3)
        return true
    }

    /// Desbloquea. El simulador no tiene código: el botón de inicio despierta
    /// la pantalla y deslizar desde abajo la abre. En la pantalla de inicio los
    /// dos gestos no hacen nada, así que se puede llamar siempre.
    func unlock() {
        XCUIDevice.shared.press(.home)
        pause(1)
        let from = springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.99))
        let to = springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.35))
        from.press(forDuration: 0.05, thenDragTo: to)
        pause(1.5)
    }

    /// Desliza desde arriba a la izquierda: Centro de notificaciones (a la
    /// derecha saldría el Centro de control).
    func openNotificationCenter() {
        let from = springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.25, dy: 0.005))
        let to = springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.25, dy: 0.75))
        from.press(forDuration: 0.05, thenDragTo: to)
        pause(1.5)
    }

    func screenshot(_ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        test.add(shot)
    }

    /// Deja una nota en el informe del test sin hacerlo fallar.
    func note(_ text: String) {
        let attachment = XCTAttachment(string: text)
        attachment.name = "Nota"
        attachment.lifetime = .keepAlways
        test.add(attachment)
    }

    /// Algo de SpringBoard (pantalla de bloqueo, aviso, Centro de
    /// notificaciones) cuya etiqueta cumple `predicate`.
    func system(_ predicate: NSPredicate) -> XCUIElement {
        springboard.descendants(matching: .any).matching(predicate).firstMatch
    }

    /// La Live Activity del entrenamiento en la pantalla de bloqueo, si
    /// SpringBoard la expone a la accesibilidad: su titular es el ejercicio
    /// actual o, sin ejercicio, el nombre de la sesión. Se excluye el aviso de
    /// descanso («Siguiente serie: Press Inclinado…»), que también lo nombra
    /// y puede seguir en el Centro de notificaciones de un test anterior.
    var liveActivity: XCUIElement {
        system(NSPredicate(
            format: "(label CONTAINS %@ OR label CONTAINS %@) AND NOT (label CONTAINS %@)",
            "Inclinado con Mancuernas",
            "Entrenamiento libre",
            "Siguiente serie"
        ))
    }

    // MARK: - Arranque

    /// Lo primero tocable de cualquiera de las pantallas con las que puede
    /// arrancar la app: el cuestionario, el inicio o la sesión en curso.
    private var firstScreenMarkers: [XCUIElement] {
        [
            button("Siguiente"),
            button("30-39"),
            button("Entreno"),
            button("Hecho"),
            button(startingWith: "Volver al entrenamiento en curso"),
        ]
    }

    /// Espera a que la app enseñe algo que se pueda TOCAR. Mientras la
    /// pantalla de arranque está encima, el WKWebView existe pero nada suyo es
    /// tocable: esto es lo que prueba que el splash se va.
    func waitForFirstScreen(_ timeout: TimeInterval) -> XCUIElement? {
        var found: XCUIElement?
        waitUntil(timeout) {
            found = firstScreenMarkers.first { $0.exists && $0.isHittable }
            return found != nil
        }
        return found
    }

    func launch(file: StaticString = #filePath, line: UInt = #line) {
        // Un test anterior pudo acabar con el simulador bloqueado o en otra app.
        unlock()
        app.launch()
        XCTAssertTrue(web.waitForExistence(timeout: Wait.boot), "No aparece el WKWebView", file: file, line: line)
        // En un simulador recién arrancado (el lanzamiento tardó 47 s) WebKit
        // pintó la bienvenida pero no le pasó NADA de su contenido a la
        // accesibilidad en toda la sesión: el árbol de la WebView acababa en
        // un «Other» vacío y ningún test podía verla. Se reinicia la app una
        // vez, con nota y captura; si sigue sin verse, falla.
        if !waitUntil(Wait.boot, { webHasContent() }) {
            screenshot("WebView sin contenido accesible")
            note("WebKit no expone el contenido de la WebView a XCTest: se reinicia la app una vez.")
            app.terminate()
            app.launch()
            XCTAssertTrue(
                web.waitForExistence(timeout: Wait.boot) && waitUntil(Wait.boot, { webHasContent() }),
                "WebKit no expone el contenido de la WebView a XCTest",
                file: file,
                line: line
            )
        }
    }

    /// ¿Expone la WebView algo con texto? (Leído de un `snapshot`, de una vez.)
    func webHasContent() -> Bool {
        guard web.exists, let root = try? web.snapshot() else { return false }
        var pending: [XCUIElementSnapshot] = [root]
        while let node = pending.popLast() {
            if !node.label.isEmpty && node.elementType != .webView { return true }
            pending.append(contentsOf: node.children)
        }
        return false
    }

    /// Arranca y deja la app en el inicio: cuestionario hecho y sin ningún
    /// entrenamiento en curso.
    func launchReady(file: StaticString = #filePath, line: UInt = #line) {
        launch(file: file, line: line)
        XCTAssertNotNil(waitForFirstScreen(Wait.boot), "La app no enseña nada tocable", file: file, line: line)
        completeOnboardingIfNeeded(file: file, line: line)
        let later = button("Ahora no")
        if later.exists && later.isHittable { later.tap() }
        endActiveWorkoutIfAny()
    }

    // MARK: - Cuestionario

    /// El «Paso N de M» del cuestionario, o nil si no está en pantalla.
    func onboardingStep() -> Int? {
        let label = web.staticTexts
            .matching(NSPredicate(format: "label MATCHES %@", "Paso\\s+[0-9]+\\s+de\\s+[0-9]+"))
            .firstMatch
        // Una sola lectura (`snapshot`): entre `exists` y `label` el paso puede
        // cambiar en plena transición, y leer `label` de un elemento que ya no
        // está hace fallar el test («Failed to get matching snapshot»).
        guard let text = try? label.snapshot().label else { return nil }
        let numbers = text.components(separatedBy: CharacterSet.decimalDigits.inverted).filter { !$0.isEmpty }
        return numbers.first.flatMap { Int($0) }
    }

    /// Lo que se ve al acabar el cuestionario: la barra de pestañas o, si hay
    /// un resumen final, su «Hecho».
    var appAfterOnboarding: Bool {
        button("Entreno").exists || button("Hecho").exists
    }

    /// Responde el cuestionario con las mismas respuestas que
    /// `e2e/onboarding.mjs`. Retoma desde el paso en que esté: un arranque
    /// anterior pudo quedarse a medias.
    func completeOnboardingIfNeeded(file: StaticString = #filePath, line: UInt = #line) {
        var previous = 0
        var repeats = 0
        while let step = onboardingStep() {
            repeats = step == previous ? repeats + 1 : 0
            previous = step
            guard repeats < 3 else {
                XCTFail("El cuestionario no pasa del paso \(step)", file: file, line: line)
                return
            }
            let choice: (element: XCUIElement, what: String)?
            switch step {
            case 1: choice = (element: button("30-39"), what: "edad 30-39")
            case 2: choice = (element: button(containing: "Ganar fuerza"), what: "objetivo «Ganar fuerza»")
            case 3: choice = (element: button(startingWith: "Intermedio"), what: "experiencia «Intermedio»")
            case 4: choice = (element: button("3"), what: "3 días por semana")
            case 5: choice = (element: button(containing: "Gimnasio en casa"), what: "entorno «Gimnasio en casa»")
            default: choice = nil // 6: todo opcional; 7: resumen.
            }
            // Tocar un chip ya marcado podría desmarcarlo al retomar.
            if let choice = choice, !isOn(choice.element) {
                tap(choice.element, choice.what, file: file, line: line)
            }
            let finish = button("Empezar a entrenar")
            if finish.exists {
                tap(finish, "Empezar a entrenar", file: file, line: line)
            } else {
                tap(button("Siguiente"), "Siguiente (paso \(step))", file: file, line: line)
            }
            // Al paso siguiente o a la app; no basta con que el paso actual
            // desaparezca: en mitad de la transición no hay ninguno y el
            // bucle acabaría antes de tiempo.
            waitUntil(Wait.screen) {
                if let next = onboardingStep() { return next != step }
                return appAfterOnboarding
            }
        }
        XCTAssertTrue(
            waitUntil(Wait.screen) { appAfterOnboarding },
            "Tras el cuestionario no aparece la app",
            file: file,
            line: line
        )
    }

    // MARK: - Entrenamiento

    var inSession: Bool {
        button("FINALIZAR ENTRENAMIENTO").exists || button("Añadir ejercicio").exists
    }

    /// Termina (o descarta) un entrenamiento que siga abierto de un test
    /// anterior, para que cada test empiece con su propia sesión.
    func endActiveWorkoutIfAny() {
        let bar = button(startingWith: "Volver al entrenamiento en curso")
        // La sesión se restaura de IndexedDB después de pintar el inicio.
        waitUntil(Wait.short) { bar.exists || inSession }
        if bar.exists && !inSession { tap(bar, "barra del entrenamiento en curso") }
        guard waitUntil(Wait.short, { inSession }) else { return }
        finishWorkout()
    }

    func skipRestIfShown() {
        let skip = button("Saltar")
        if skip.exists && skip.isHittable {
            skip.tap()
            pause(0.6)
        }
    }

    /// Pestaña Entreno → «Entrenamiento libre». La app pide el permiso de
    /// notificaciones al empezar el primer entrenamiento: se acepta aquí.
    func startFreeWorkout(file: StaticString = #filePath, line: UInt = #line) {
        tap(button("Entreno"), "pestaña Entreno", file: file, line: line)
        // Etiqueta exacta: las tarjetas del historial de tests anteriores
        // también contienen «Entrenamiento libre».
        tap(button("Entrenamiento libre"), "Entrenamiento libre", file: file, line: line)
        XCTAssertTrue(waitUntil(Wait.screen) { inSession }, "No se abre la sesión", file: file, line: line)
        allowSystemAlertIfShown(timeout: 8)
    }

    /// Añade un ejercicio desde el buscador. Se escribe una sola palabra a
    /// propósito: sin espacios no salta el autocorrector del teclado, que con
    /// el teclado en inglés podría cambiar «inclinado».
    func addExercise(
        search: String = "inclinado",
        pick: String = "Inclinado con Mancuernas",
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        tap(button("Añadir ejercicio"), "Añadir ejercicio", file: file, line: line)
        type(search, into: field(placeholder: "Buscar"), "buscador de ejercicios", file: file, line: line)
        tap(button(containing: pick), "resultado «\(pick)»", file: file, line: line)
        // La sesión guarda el ejercicio (`await addExercise`) y sólo después
        // cierra la hoja del buscador: mientras guarda, «Peso» ya existe
        // debajo con la hoja todavía encima, y un toque entonces cae en su
        // fondo y el campo no recibe el foco (test1 de ios-auth, donde guardar
        // tarda más). Se espera también a que la hoja se vaya.
        let search = field(placeholder: "Buscar")
        XCTAssertTrue(
            waitUntil(Wait.screen) { field("Peso").exists && !search.exists },
            "El ejercicio no se añade a la sesión",
            file: file,
            line: line
        )
    }

    /// Registra la primera serie. Al marcarla empieza el descanso.
    func logFirstSet(weight: String = "60", reps: String = "8", file: StaticString = #filePath, line: UInt = #line) {
        type(weight, into: field("Peso"), "Peso", file: file, line: line)
        type(reps, into: field("Repeticiones"), "Repeticiones", file: file, line: line)
        tap(button("Serie 1 completada"), "Serie 1 completada", file: file, line: line)
        XCTAssertTrue(waitUntil(Wait.screen) { button("Saltar").exists }, "El descanso no empieza", file: file, line: line)
        allowSystemAlertIfShown(timeout: 3)
    }

    /// Los segundos que le quedan al descanso, leídos del contador de su barra
    /// («02:27»). Es el «MM:SS» más bajo de lo que se VE, y en la mitad de
    /// abajo: arriba está el tiempo de la sesión, y lo que queda fuera de la
    /// pantalla (un «2:30» de descanso configurado más abajo) no cuenta. Si no
    /// lo encuentra, nil: mejor esperar el descanso entero que leer otro reloj.
    func restRemaining() -> Int? {
        let clocks = web.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "[0-9]{1,2}:[0-9]{2}"))
        let visible = web.frame
        var lowest: (y: CGFloat, seconds: Int)?
        for clock in clocks.allElementsBoundByIndex where clock.exists {
            let parts = clock.label.split(separator: ":").compactMap { Int($0) }
            guard parts.count == 2 else { continue }
            let y = clock.frame.minY
            guard y > visible.midY, clock.frame.maxY <= visible.maxY else { continue }
            if let current = lowest, current.y >= y { continue }
            lowest = (y: y, seconds: parts[0] * 60 + parts[1])
        }
        return lowest?.seconds
    }

    /// Acorta el descanso con «−30s» hasta dejarlo en `limit` segundos o menos
    /// (y más de `limit − 30`: nunca lo da por terminado). Devuelve lo que
    /// queda, o nil si no se pudo leer el contador.
    func shortenRest(to limit: Int = 45) -> Int? {
        let minus = button("\u{2212}30s")
        for _ in 0..<12 {
            guard let left = restRemaining() else { return nil }
            if left <= limit { return left }
            tap(minus, "\u{2212}30s")
            pause(0.6)
        }
        return restRemaining()
    }

    /// «FINALIZAR ENTRENAMIENTO» y confirmar. Con series registradas el
    /// diálogo guarda («FINALIZAR»); sin ninguna ofrece descartar
    /// («DESCARTAR»). Para la Live Activity las dos cosas son lo mismo: `stop`.
    func finishWorkout(file: StaticString = #filePath, line: UInt = #line) {
        skipRestIfShown()
        tap(button("FINALIZAR ENTRENAMIENTO"), "FINALIZAR ENTRENAMIENTO", file: file, line: line)
        let confirm = button("FINALIZAR")
        let empty = text(containing: "No has completado ninguna serie")
        XCTAssertTrue(
            waitUntil(Wait.screen) { confirm.exists || empty.exists },
            "No aparece el diálogo de finalizar",
            file: file,
            line: line
        )
        if confirm.exists {
            tap(confirm, "FINALIZAR (diálogo)", file: file, line: line)
        } else {
            tap(lastButton("DESCARTAR"), "DESCARTAR (diálogo)", file: file, line: line)
        }
        XCTAssertTrue(
            waitUntil(Wait.screen) { !button("FINALIZAR ENTRENAMIENTO").exists },
            "La sesión sigue abierta después de finalizar",
            file: file,
            line: line
        )
        // Tras guardar, el resumen; «Hecho» vuelve al inicio.
        let done = button("Hecho")
        if waitUntil(Wait.short, { done.exists && done.isHittable }) {
            done.tap()
            pause(1)
        }
    }
}
