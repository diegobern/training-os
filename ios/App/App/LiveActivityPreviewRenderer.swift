#if DEBUG
import SwiftUI
import UIKit

/**
 * Capturas de la Live Activity sin iPhone (sólo DEBUG).
 *
 * Una Live Activity no se puede ver en un navegador ni en las pruebas web, y
 * en el simulador sólo aparece en la pantalla de bloqueo, que las pruebas de
 * interfaz no fotografían bien. Este fichero rasteriza las MISMAS vistas que
 * pinta la extensión (Shared/WorkoutActivityViews.swift) con ImageRenderer y
 * deja los PNG en el contenedor de la app, de donde los recoge la CI.
 *
 *   Arranque:  la app con el argumento -renderLiveActivityPreviews
 *   Salida:    Documents/live-activity-previews/
 *              - <superficie>-<idioma>-<apariencia>-<caso>.png  (@3x, 360 pt de ancho propuesto)
 *              - index.json (se escribe el ÚLTIMO: su presencia indica que ha terminado)
 *
 * Superficies: lockScreen (claro y oscuro), islandExpanded, islandCompact e
 * islandMinimal (la isla es negra siempre: sólo oscuro, en maquetas
 * aproximadas de su forma).
 *
 * Los textos de abajo son FIJOS DE PRUEBA, copiados de src/lib/i18n/es.ts y
 * en.ts (live.*, workout.notifTitle, workout.progress) y de nombres reales del
 * catálogo; no son datos de nadie. En la app de verdad todos los textos los
 * manda JavaScript. Todo el fichero está dentro de `#if DEBUG`: en Release no
 * existe.
 */
enum LiveActivityPreviewRenderer {
    static let launchArgument = "-renderLiveActivityPreviews"
    static let folderName = "live-activity-previews"

    /// Se llama al arrancar; no hace nada sin el argumento.
    static func renderIfRequested() {
        guard ProcessInfo.processInfo.arguments.contains(launchArgument) else { return }
        // Después del arranque, en el hilo principal (ImageRenderer lo exige).
        Task { @MainActor in
            LiveActivityPreviewRenderer.renderAll()
        }
    }

    @MainActor
    static func renderAll() {
        let fileManager = FileManager.default
        guard let documents = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
            NSLog("%@", "LiveActivityPreviewRenderer: sin carpeta Documents")
            return
        }
        let folder = documents.appending(path: folderName, directoryHint: .isDirectory)
        do {
            if fileManager.fileExists(atPath: folder.path(percentEncoded: false)) {
                try fileManager.removeItem(at: folder)
            }
            try fileManager.createDirectory(at: folder, withIntermediateDirectories: true, attributes: nil)
        } catch {
            NSLog("%@", "LiveActivityPreviewRenderer: no se pudo preparar \(folder.path(percentEncoded: false)): \(error.localizedDescription)")
            return
        }

        let now = Date()
        var items: [PreviewItem] = []
        for texts in [PreviewTexts.spanish, PreviewTexts.english] {
            for preview in PreviewCase.all(texts: texts, now: now) {
                for scheme in [ColorScheme.light, ColorScheme.dark] {
                    let view = LockScreenPreview(state: preview.state, isStale: preview.isStale, scheme: scheme)
                    if let item = renderPNG(view, surface: "lockScreen", texts: texts, scheme: scheme, preview: preview, into: folder) {
                        items.append(item)
                    }
                }
                let expanded = IslandExpandedPreview(state: preview.state, isStale: preview.isStale)
                if let item = renderPNG(expanded, surface: "islandExpanded", texts: texts, scheme: .dark, preview: preview, into: folder) {
                    items.append(item)
                }
                let compact = IslandCompactPreview(state: preview.state, isStale: preview.isStale)
                if let item = renderPNG(compact, surface: "islandCompact", texts: texts, scheme: .dark, preview: preview, into: folder) {
                    items.append(item)
                }
                let minimal = IslandMinimalPreview(state: preview.state, isStale: preview.isStale)
                if let item = renderPNG(minimal, surface: "islandMinimal", texts: texts, scheme: .dark, preview: preview, into: folder) {
                    items.append(item)
                }
            }
        }

        let index = PreviewIndex(
            generatedAt: ISO8601DateFormatter().string(from: now),
            scale: 3,
            proposedWidthPoints: 360,
            items: items
        )
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(index)
            try data.write(to: folder.appending(path: "index.json", directoryHint: .notDirectory), options: .atomic)
            NSLog("%@", "LiveActivityPreviewRenderer: \(items.count) imágenes en \(folder.path(percentEncoded: false))")
        } catch {
            NSLog("%@", "LiveActivityPreviewRenderer: no se pudo escribir index.json: \(error.localizedDescription)")
        }
    }

    @MainActor
    private static func renderPNG<V: View>(
        _ view: V,
        surface: String,
        texts: PreviewTexts,
        scheme: ColorScheme,
        preview: PreviewCase,
        into folder: URL
    ) -> PreviewItem? {
        let schemeName = scheme == .dark ? "dark" : "light"
        let file = "\(surface)-\(texts.locale)-\(schemeName)-\(preview.name).png"
        let renderer = ImageRenderer(content: view)
        renderer.scale = 3
        renderer.proposedSize = ProposedViewSize(width: 360, height: nil)
        guard let image = renderer.uiImage, let data = image.pngData() else {
            NSLog("%@", "LiveActivityPreviewRenderer: no se pudo rasterizar \(file)")
            return nil
        }
        do {
            try data.write(to: folder.appending(path: file, directoryHint: .notDirectory), options: .atomic)
        } catch {
            NSLog("%@", "LiveActivityPreviewRenderer: no se pudo escribir \(file): \(error.localizedDescription)")
            return nil
        }
        return PreviewItem(
            file: file,
            surface: surface,
            locale: texts.locale,
            colorScheme: schemeName,
            state: preview.name,
            widthPixels: Int((image.size.width * image.scale).rounded()),
            heightPixels: Int((image.size.height * image.scale).rounded())
        )
    }
}

// MARK: - index.json

private struct PreviewIndex: Encodable {
    let generatedAt: String
    let scale: Int
    let proposedWidthPoints: Int
    let items: [PreviewItem]
}

private struct PreviewItem: Encodable {
    let file: String
    let surface: String
    let locale: String
    let colorScheme: String
    let state: String
    let widthPixels: Int
    let heightPixels: Int
}

// MARK: - Textos y casos de prueba

private struct PreviewTexts {
    let locale: String
    let title: String
    let sessionName: String
    let longSessionName: String
    let exerciseName: String
    let longExerciseName: String
    let setLabel: String
    let longSetLabel: String
    let progressLabel: String
    let longProgressLabel: String
    let rest: String
    let restOver: String
    let elapsed: String
    let paused: String

    static let spanish = PreviewTexts(
        locale: "es-ES",
        title: "Entrenamiento en curso",
        sessionName: "Empuje A",
        longSessionName: "Torso pesado · bloque de fuerza máxima con superseries de accesorios",
        exerciseName: "Press de Banca con Barra",
        longExerciseName: "Press Inclinado con Mancuernas en Banco Ajustable con Agarre Neutro y Pausa",
        setLabel: "Serie 3 de 4",
        longSetLabel: "Serie 12 de 12",
        progressLabel: "7 de 20 series",
        longProgressLabel: "118 de 120 series",
        rest: "Descanso",
        restOver: "Descanso terminado",
        elapsed: "Duración",
        paused: "En pausa"
    )

    static let english = PreviewTexts(
        locale: "en-GB",
        title: "Workout in progress",
        sessionName: "Push A",
        longSessionName: "Heavy upper body · maximum strength block with accessory supersets",
        exerciseName: "Barbell Bench Press",
        longExerciseName: "Incline Dumbbell Press on Adjustable Bench with Neutral Grip and Pause",
        setLabel: "Set 3 of 4",
        longSetLabel: "Set 12 of 12",
        progressLabel: "7 of 20 sets",
        longProgressLabel: "118 of 120 sets",
        rest: "Rest",
        restOver: "Rest over",
        elapsed: "Duration",
        paused: "Paused"
    )
}

private struct PreviewCase {
    let name: String
    let isStale: Bool
    let state: WorkoutActivityAttributes.ContentState

    /// Sin descanso, descanso en marcha, en pausa, terminado («stale»), entre
    /// ejercicios y con todos los textos muy largos (y más de una hora).
    static func all(texts: PreviewTexts, now: Date) -> [PreviewCase] {
        func state(
            elapsed: TimeInterval,
            session: String,
            exercise: String?,
            setText: String?,
            progress: String,
            restEndsIn: TimeInterval? = nil,
            restTotal: TimeInterval = 120,
            paused: Bool = false
        ) -> WorkoutActivityAttributes.ContentState {
            let endsAt = restEndsIn.map { now.addingTimeInterval($0) }
            return WorkoutActivityAttributes.ContentState(
                startedAt: now.addingTimeInterval(-elapsed),
                title: texts.title,
                sessionName: session,
                exerciseName: exercise,
                setLabel: setText,
                progressLabel: progress,
                restEndsAt: endsAt,
                restStartedAt: endsAt.map { min($0.addingTimeInterval(-restTotal), $0) },
                restPaused: endsAt == nil ? nil : paused,
                restRemaining: paused ? Int(max(0, restEndsIn ?? 0)) : nil,
                restLabel: texts.rest,
                restOverLabel: texts.restOver,
                elapsedLabel: texts.elapsed,
                pausedLabel: texts.paused,
                localeIdentifier: texts.locale
            )
        }

        let elapsed: TimeInterval = 42 * 60 + 18
        return [
            PreviewCase(
                name: "no-rest",
                isStale: false,
                state: state(elapsed: elapsed, session: texts.sessionName, exercise: texts.exerciseName, setText: texts.setLabel, progress: texts.progressLabel)
            ),
            PreviewCase(
                name: "rest-running",
                isStale: false,
                state: state(elapsed: elapsed, session: texts.sessionName, exercise: texts.exerciseName, setText: texts.setLabel, progress: texts.progressLabel, restEndsIn: 84)
            ),
            PreviewCase(
                name: "rest-paused",
                isStale: false,
                state: state(elapsed: elapsed, session: texts.sessionName, exercise: texts.exerciseName, setText: texts.setLabel, progress: texts.progressLabel, restEndsIn: 84, paused: true)
            ),
            PreviewCase(
                name: "rest-over",
                isStale: true,
                state: state(elapsed: elapsed, session: texts.sessionName, exercise: texts.exerciseName, setText: texts.setLabel, progress: texts.progressLabel, restEndsIn: -5)
            ),
            PreviewCase(
                name: "between-exercises",
                isStale: false,
                state: state(elapsed: elapsed, session: texts.sessionName, exercise: nil, setText: nil, progress: texts.progressLabel)
            ),
            PreviewCase(
                name: "long-names",
                isStale: false,
                state: state(
                    elapsed: 60 * 60 + 2 * 60 + 3,
                    session: texts.longSessionName,
                    exercise: texts.longExerciseName,
                    setText: texts.longSetLabel,
                    progress: texts.longProgressLabel,
                    restEndsIn: 600,
                    restTotal: 600
                )
            ),
        ]
    }
}

// MARK: - Maquetas

/// La tarjeta de la pantalla de bloqueo, con el fondo que le pone la extensión.
private struct LockScreenPreview: View {
    let state: WorkoutActivityAttributes.ContentState
    let isStale: Bool
    let scheme: ColorScheme

    var body: some View {
        let palette = WorkoutLivePalette.forScheme(scheme)
        WorkoutLockScreenView(state: state, isStale: isStale)
            .background(palette.background, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .padding(12)
            .background(scheme == .dark ? Color.black : Color(white: 0.85))
            .environment(\.colorScheme, scheme)
    }
}

/// La isla expandida, aproximada: marca, centro y descanso arriba; abajo, lo demás.
private struct IslandExpandedPreview: View {
    let state: WorkoutActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                WorkoutIslandLeadingView()
                WorkoutIslandCenterView(state: state)
                WorkoutIslandTrailingView(state: state, isStale: isStale)
            }
            WorkoutIslandBottomView(state: state, isStale: isStale)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .background(Color.black, in: RoundedRectangle(cornerRadius: 42, style: .continuous))
        .padding(12)
        .background(Color(white: 0.85))
        .environment(\.colorScheme, .dark)
    }
}

/// La isla compacta: marca a la izquierda de la cámara, tiempo a la derecha.
private struct IslandCompactPreview: View {
    let state: WorkoutActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        HStack(spacing: 0) {
            WorkoutCompactLeadingView()
            Spacer(minLength: 0)
            WorkoutCompactTrailingView(state: state, isStale: isStale)
        }
        .padding(.horizontal, 12)
        .frame(width: 250, height: 37)
        .background(Color.black, in: Capsule())
        .padding(12)
        .background(Color(white: 0.85))
        .environment(\.colorScheme, .dark)
    }
}

/// La isla mínima (cuando la comparte otra app).
private struct IslandMinimalPreview: View {
    let state: WorkoutActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        WorkoutMinimalView(state: state, isStale: isStale)
            .frame(width: 37, height: 37)
            .background(Color.black, in: Circle())
            .padding(12)
            .background(Color(white: 0.85))
            .environment(\.colorScheme, .dark)
    }
}
#endif
