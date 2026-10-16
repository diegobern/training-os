import XCTest

/// Pruebas de interfaz de la app de iOS: arranque, Live Activity y aviso de
/// fin de descanso. Cómo se conduce la app está en `AppDriver`.
///
/// Las capturas se guardan SIEMPRE (`.keepAlways`) en el `.xcresult`. Lo que
/// pinta el sistema (Dynamic Island, pantalla de bloqueo) no se puede
/// comprobar desde XCUITest con fiabilidad, y la captura es la prueba que se
/// revisa. La Dynamic Island sólo existe en los iPhone Pro: el CI usa uno.
///
/// Los tests no dependen del orden: cada uno arranca la app, termina el
/// cuestionario si hace falta y cierra cualquier entrenamiento que siga
/// abierto antes de empezar el suyo.
final class TrainingOSUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    override func tearDownWithError() throws {
        AppDriver.attachFinalState(to: self)
    }

    /// El WKWebView aparece y, en menos de 30 s, algo suyo se puede tocar: la
    /// pantalla de arranque se ha ido (`SplashScreen.hide` desde JavaScript).
    @MainActor
    func testBootShowsUI() throws {
        let ui = AppDriver(test: self)
        ui.unlock()
        ui.app.launch()
        XCTAssertTrue(ui.web.waitForExistence(timeout: 30), "No aparece el WKWebView")
        let first = ui.waitForFirstScreen(30)
        ui.screenshot("Arranque: primera pantalla")
        XCTAssertNotNil(first, "A los 30 s no hay nada tocable: la pantalla de arranque no se ha ido")
    }

    /// Empezar un entrenamiento pide la Live Activity: se ve en la Dynamic
    /// Island al salir de la app y en la pantalla de bloqueo.
    @MainActor
    func testWorkoutStartsLiveActivity() throws {
        let ui = AppDriver(test: self)
        ui.launchReady()
        ui.startFreeWorkout()
        ui.addExercise()
        ui.pause(2)
        ui.screenshot("Live Activity 1: sesión en curso en la app")

        ui.goHome()
        ui.screenshot("Live Activity 2: Dynamic Island (iPhone Pro)")

        if ui.lock() {
            ui.screenshot("Live Activity 3: pantalla de bloqueo")
            if !ui.liveActivity.waitForExistence(timeout: 5) {
                ui.note("La Live Activity no aparece en la jerarquía de accesibilidad de la pantalla de bloqueo: revisar la captura «Live Activity 3».")
            }
            ui.unlock()
        }

        ui.app.activate()
        XCTAssertTrue(ui.waitUntil(AppDriver.Wait.screen) { ui.inSession }, "Al volver a la app la sesión no está")
        ui.screenshot("Live Activity 4: de vuelta en la app")

        // Sin series registradas: el diálogo ofrece descartar. Deja el
        // simulador sin Live Activity para lo que venga después.
        ui.finishWorkout()
    }

    /// El descanso corre con la app en segundo plano: cuenta atrás en la
    /// Dynamic Island y en la pantalla de bloqueo y, al acabar, el aviso
    /// «Descanso terminado» del sistema.
    @MainActor
    func testRestCountdownAndAlert() throws {
        let ui = AppDriver(test: self)
        ui.launchReady()
        ui.startFreeWorkout()
        ui.addExercise()
        ui.logFirstSet()

        // Un descanso de dos o tres minutos alargaría el test sin probar nada
        // más: se deja entre 15 y 45 s con «−30s», como lo haría una persona.
        let left = ui.shortenRest(to: 45)
        if left == nil {
            ui.note("No se pudo leer el contador del descanso: se espera el descanso entero.")
        }
        let restEnds = Date().addingTimeInterval(TimeInterval(left ?? 180))
        ui.screenshot("Descanso 1: cuenta atrás en la app")
        // Tiempo para que el JavaScript reprograme el aviso tras el último ajuste.
        ui.pause(3)

        ui.goHome()
        ui.screenshot("Descanso 2: cuenta atrás en la Dynamic Island")
        if ui.lock() {
            ui.screenshot("Descanso 3: cuenta atrás en la pantalla de bloqueo")
            ui.unlock()
        }

        // El cuerpo del aviso sólo está en el aviso: la Live Activity enseña
        // «Descanso terminado» al vencer, pero nunca «Siguiente serie».
        let alert = ui.system(NSPredicate(
            format: "label CONTAINS %@ OR label CONTAINS %@",
            "Siguiente serie",
            "Toca para volver al entrenamiento"
        ))
        var seen = alert.waitForExistence(timeout: max(restEnds.timeIntervalSinceNow, 0) + 45)
        if seen {
            ui.screenshot("Descanso 4: aviso «Descanso terminado»")
        } else {
            // El banner dura unos segundos; si se escapó, sigue en el Centro de
            // notificaciones.
            ui.openNotificationCenter()
            seen = alert.waitForExistence(timeout: 5)
            ui.screenshot("Descanso 4: Centro de notificaciones")
            ui.goHome()
        }
        XCTAssertTrue(seen, "No llega el aviso «Descanso terminado»")

        ui.app.activate()
        XCTAssertTrue(ui.waitUntil(AppDriver.Wait.screen) { ui.inSession }, "Al volver a la app la sesión no está")
        ui.screenshot("Descanso 5: de vuelta en la app")
        ui.finishWorkout()
    }

    /// Finalizar el entrenamiento termina la Live Activity: la Dynamic Island
    /// queda vacía.
    @MainActor
    func testFinishEndsLiveActivity() throws {
        let ui = AppDriver(test: self)
        ui.launchReady()
        ui.startFreeWorkout()
        ui.addExercise()
        ui.logFirstSet()
        ui.skipRestIfShown()

        ui.goHome()
        ui.screenshot("Finalizar 1: entrenamiento en curso en la Dynamic Island")

        ui.app.activate()
        XCTAssertTrue(ui.waitUntil(AppDriver.Wait.screen) { ui.inSession }, "Al volver a la app la sesión no está")
        ui.finishWorkout()
        ui.screenshot("Finalizar 2: entrenamiento guardado")

        ui.goHome()
        ui.pause(2)
        ui.screenshot("Finalizar 3: inicio sin Live Activity")
        if ui.lock() {
            // El plugin termina la actividad con `dismissalPolicy: .immediate`:
            // tampoco se queda en la pantalla de bloqueo. Si SpringBoard no
            // expone la actividad a la accesibilidad esto no prueba nada, y la
            // prueba es la captura.
            let gone = ui.waitUntil(10) { !ui.liveActivity.exists }
            ui.screenshot("Finalizar 4: pantalla de bloqueo sin Live Activity")
            XCTAssertTrue(gone, "La pantalla de bloqueo sigue enseñando el entrenamiento terminado")
            ui.unlock()
        }
    }

    /// `trainingos://workout/active?session=…` abierto desde el sistema, como
    /// lo abre un toque en la Live Activity:
    ///   - sin id (o con el de la sesión activa) → vuelve a la sesión;
    ///   - con un id que no existe → al inicio, sin crear ni duplicar nada;
    ///   - una ruta que no es la nuestra → no navega.
    /// iOS puede preguntar «¿Abrir en "Training OS"?»: se acepta con el mismo
    /// asistente que los permisos (su último botón es el afirmativo).
    @MainActor
    func testDeepLink() throws {
        let ui = AppDriver(test: self)
        ui.launchReady()
        ui.startFreeWorkout()
        let bar = ui.button(startingWith: "Volver al entrenamiento en curso")

        // 1. La sesión activa.
        XCTAssertTrue(ui.goHome(), "Tras pulsar Inicio no se ve el inicio del sistema")
        XCUIDevice.shared.system.open(URL(string: "trainingos://workout/active")!)
        ui.allowSystemAlertIfShown(timeout: 5)
        XCTAssertTrue(ui.app.wait(for: .runningForeground, timeout: 20), "El enlace no abre la app")
        XCTAssertTrue(ui.waitUntil(AppDriver.Wait.screen) { ui.inSession }, "El enlace no lleva a la sesión activa")
        ui.screenshot("Enlace 1: lleva a la sesión activa")

        // 2. Un id que no es de ninguna sesión de este dispositivo.
        XCTAssertTrue(ui.goHome(), "Tras pulsar Inicio no se ve el inicio del sistema")
        XCUIDevice.shared.system.open(URL(string: "trainingos://workout/active?session=00000000-0000-0000-0000-000000000000")!)
        ui.allowSystemAlertIfShown(timeout: 5)
        XCTAssertTrue(ui.app.wait(for: .runningForeground, timeout: 20), "El enlace no abre la app")
        XCTAssertTrue(ui.waitUntil(AppDriver.Wait.screen) { !ui.inSession && bar.exists }, "Un id desconocido debe llevar al inicio, con la sesión intacta")
        ui.screenshot("Enlace 2: id desconocido, al inicio")

        // 3. Una ruta ajena: la app no se mueve de donde está.
        XCUIDevice.shared.system.open(URL(string: "trainingos://evil/route?session=x")!)
        ui.allowSystemAlertIfShown(timeout: 5)
        ui.pause(3)
        XCTAssertFalse(ui.inSession, "Una ruta ajena no debe navegar")
        ui.screenshot("Enlace 3: ruta ajena ignorada")

        // Sigue habiendo exactamente una sesión: se vuelve a ella y se cierra.
        XCTAssertTrue(bar.waitForExistence(timeout: AppDriver.Wait.short), "La sesión activa ha desaparecido")
        ui.tap(bar, "barra del entrenamiento en curso")
        XCTAssertTrue(ui.waitUntil(AppDriver.Wait.screen) { ui.inSession }, "La barra no lleva a la sesión")
        ui.finishWorkout()
    }
}
