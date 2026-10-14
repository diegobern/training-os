import Foundation
import SwiftUI

/*
 * Las vistas de la Live Activity del entrenamiento.
 *
 * Se compilan en los dos targets: la extensión TrainingOSWidgets las pinta en
 * la pantalla de bloqueo y en la Dynamic Island, y la app (sólo en DEBUG) las
 * rasteriza con LiveActivityPreviewRenderer para revisarlas sin un iPhone.
 * Por eso reciben valores simples (`state`, `isStale`) y no un
 * `ActivityViewContext`, que sólo existe dentro de la extensión.
 *
 * Idioma: ninguna palabra visible sale de aquí. Todo llega en `state`, ya
 * traducido por JavaScript con t(); el único texto fijo es la marca
 * «Training OS», que no se traduce y va con Text(verbatim:). Los separadores
 * («·», «:») no son palabras.
 *
 * Cronómetros: los pinta el sistema con Text(timerInterval:), así que siguen
 * corriendo con el teléfono bloqueado y la app suspendida. Cada rango se
 * construye con el límite inferior <= superior (un rango al revés es un fallo
 * en tiempo de ejecución, no de compilación).
 */

// MARK: - Colores

/// La paleta de la app (src/styles/index.css), en claro y en oscuro.
struct WorkoutLivePalette {
    let background: Color
    let ink: Color
    let muted: Color
    let accent: Color

    /// #0A0B0D: el fondo del icono.
    static let brandInk = Color(red: 10 / 255, green: 11 / 255, blue: 13 / 255)
    /// #CDFF4F: el rayo.
    static let brandBolt = Color(red: 205 / 255, green: 255 / 255, blue: 79 / 255)

    /// --c-surface, --c-ink, --c-muted y --c-accent del tema claro. El verde
    /// lima de la marca no se lee sobre blanco; el acento claro de la app sí.
    static let light = WorkoutLivePalette(
        background: Color(red: 1, green: 1, blue: 1),
        ink: Color(red: 14 / 255, green: 16 / 255, blue: 19 / 255),
        muted: Color(red: 90 / 255, green: 100 / 255, blue: 114 / 255),
        accent: Color(red: 77 / 255, green: 107 / 255, blue: 0)
    )

    /// Los mismos tokens del tema oscuro. También es la paleta de la Dynamic
    /// Island, que es negra siempre, sea cual sea la apariencia del sistema.
    static let dark = WorkoutLivePalette(
        background: Color(red: 19 / 255, green: 21 / 255, blue: 26 / 255),
        ink: Color(red: 242 / 255, green: 244 / 255, blue: 247 / 255),
        muted: Color(red: 158 / 255, green: 166 / 255, blue: 178 / 255),
        accent: Color(red: 205 / 255, green: 255 / 255, blue: 79 / 255)
    )

    static func forScheme(_ scheme: ColorScheme) -> WorkoutLivePalette {
        scheme == .dark ? dark : light
    }
}

// MARK: - Estado → qué se pinta

/// En qué punto está el descanso, ya resuelto para pintar.
enum WorkoutRestPhase {
    /// Sin descanso.
    case noRest
    /// Cuenta atrás en marcha. El rango está garantizado (inferior <= superior).
    case running(ClosedRange<Date>)
    /// En pausa: tiempo fijo, sin cuenta atrás.
    case paused(remaining: Int)
    /// Ha pasado `staleDate` (= fin del descanso) y la app aún no ha actualizado:
    /// «Descanso terminado».
    case over
}

extension WorkoutActivityAttributes.ContentState {
    func restPhase(isStale: Bool) -> WorkoutRestPhase {
        guard let endsAt = restEndsAt else { return .noRest }
        if restPaused == true {
            return .paused(remaining: max(0, restRemaining ?? 0))
        }
        // Una actividad sólo se vuelve «stale» por su staleDate, que el plugin
        // fija en el fin del descanso en marcha (y en nada si está en pausa).
        if isStale { return .over }
        let start = min(restStartedAt ?? endsAt, endsAt)
        return .running(start...endsAt)
    }

    /// Rango del cronómetro de la duración, que cuenta hacia arriba desde `startedAt`.
    ///
    /// El tope de 24 h no se alcanza nunca (iOS termina una Live Activity a las
    /// 8 h y la retira de la pantalla de bloqueo como mucho 4 h después), pero
    /// acota el ancho que el sistema reserva para el texto del cronómetro, que
    /// con una fecha lejana sería enorme.
    var elapsedRange: ClosedRange<Date> {
        startedAt...startedAt.addingTimeInterval(24 * 60 * 60)
    }

    /// Línea secundaria: «Serie 3 de 4 · 7 de 20 series» (lo que haya).
    var detailLine: String {
        [setLabel, progressLabel]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    /// «Descanso · En pausa» (lo que haya).
    var pausedRestCaption: String {
        [restLabel, pausedLabel]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    /// Lo que se nombra en primer lugar: el ejercicio actual o, si no hay, la sesión.
    var headline: String {
        if let exerciseName, !exerciseName.isEmpty { return exerciseName }
        return sessionName
    }

    var locale: Locale { Locale(identifier: localeIdentifier) }
}

enum WorkoutLiveFormat {
    /// «1:24» o «1:02:03»: el tiempo fijo de un descanso en pausa, con el mismo
    /// aspecto que los cronómetros del sistema.
    static func clock(_ seconds: Int) -> String {
        let total = max(0, seconds)
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        // Cifras ASCII, como los cronómetros del sistema en español e inglés.
        func twoDigits(_ value: Int) -> String { value < 10 ? "0\(value)" : "\(value)" }
        if hours > 0 {
            return "\(hours):\(twoDigits(minutes)):\(twoDigits(secs))"
        }
        return "\(minutes):\(twoDigits(secs))"
    }
}

// MARK: - Marca

/// El rayo de Training OS: `M40.6 6.4 14.9 32.5h11.3L24.4 57.6 50.1 30.2H38.1Z`
/// (public/favicon.svg), dibujado como trazado para no depender de imágenes
/// en la extensión.
struct WorkoutBoltShape: Shape {
    /// Zona del dibujo original que se ajusta al rectángulo. Por defecto la
    /// caja completa de 64×64 (con el aire del icono); `boltBounds` recorta
    /// al rayo para usarlo suelto.
    var viewBox = CGRect(x: 0, y: 0, width: 64, height: 64)

    static let boltBounds = CGRect(x: 14.9, y: 6.4, width: 35.2, height: 51.2)

    func path(in rect: CGRect) -> Path {
        // El trazado SVG, con las coordenadas relativas (h, H) ya resueltas.
        let points: [CGPoint] = [
            CGPoint(x: 40.6, y: 6.4),
            CGPoint(x: 14.9, y: 32.5),
            CGPoint(x: 26.2, y: 32.5),
            CGPoint(x: 24.4, y: 57.6),
            CGPoint(x: 50.1, y: 30.2),
            CGPoint(x: 38.1, y: 30.2),
        ]
        guard viewBox.width > 0, viewBox.height > 0 else { return Path() }
        let scale = min(rect.width / viewBox.width, rect.height / viewBox.height)
        let dx = rect.midX - viewBox.midX * scale
        let dy = rect.midY - viewBox.midY * scale
        var path = Path()
        path.addLines(points.map { CGPoint(x: dx + $0.x * scale, y: dy + $0.y * scale) })
        path.closeSubpath()
        return path
    }
}

/// El icono completo: rayo lima sobre la loseta oscura de la marca.
struct WorkoutBrandTile: View {
    var size: CGFloat

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 14 / 64, style: .continuous)
                .fill(WorkoutLivePalette.brandInk)
            WorkoutBoltShape()
                .fill(WorkoutLivePalette.brandBolt)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// Sólo el rayo, para la Dynamic Island (ya es negra: la loseta no se vería).
struct WorkoutBoltMark: View {
    var size: CGFloat

    var body: some View {
        WorkoutBoltShape(viewBox: WorkoutBoltShape.boltBounds)
            .fill(WorkoutLivePalette.brandBolt)
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

// MARK: - Pantalla de bloqueo

/**
 * La Live Activity en la pantalla de bloqueo (y en los avisos de los iPhone
 * sin Dynamic Island).
 *
 *   [▮] Training OS                 Entrenamiento en curso
 *   Press de Banca con Barra                      Descanso
 *   Serie 3 de 4 · 7 de 20 series                     1:24
 *   Duración 42:18
 *
 * Sin descanso, la columna derecha es la duración en grande. El fondo lo pone
 * quien la usa (activityBackgroundTint en la extensión, un rectángulo en las
 * capturas de DEBUG) con la paleta de la misma apariencia.
 */
struct WorkoutLockScreenView: View {
    let state: WorkoutActivityAttributes.ContentState
    let isStale: Bool

    // Sin `private`: una propiedad privada puede volver privado el
    // inicializador por miembros, y esta vista se crea desde otros ficheros.
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        let palette = WorkoutLivePalette.forScheme(colorScheme)
        let phase = state.restPhase(isStale: isStale)
        VStack(alignment: .leading, spacing: 10) {
            header(palette)
            HStack(alignment: .center, spacing: 12) {
                summary(palette, phase: phase)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .layoutPriority(0)
                mainTimer(palette, phase: phase)
                    .layoutPriority(1)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .environment(\.locale, state.locale)
    }

    private func header(_ palette: WorkoutLivePalette) -> some View {
        HStack(spacing: 8) {
            WorkoutBrandTile(size: 20)
            Text(verbatim: "Training OS")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(palette.ink)
                .lineLimit(1)
                .fixedSize()
            Spacer(minLength: 8)
            Text(state.title)
                .font(.footnote)
                .foregroundStyle(palette.muted)
                .lineLimit(1)
        }
    }

    /// Columna izquierda: qué se está haciendo y, si la derecha es el
    /// descanso, la duración en pequeño.
    @ViewBuilder
    private func summary(_ palette: WorkoutLivePalette, phase: WorkoutRestPhase) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(state.headline)
                .font(.headline)
                .foregroundStyle(palette.ink)
                .lineLimit(1)
            if !state.detailLine.isEmpty {
                Text(state.detailLine)
                    .font(.footnote)
                    .foregroundStyle(palette.muted)
                    .lineLimit(1)
            }
            switch phase {
            case .noRest:
                EmptyView()
            case .running, .paused, .over:
                HStack(spacing: 4) {
                    Text(state.elapsedLabel)
                        .font(.footnote)
                        .foregroundStyle(palette.muted)
                        .lineLimit(1)
                    Text(timerInterval: state.elapsedRange, countsDown: false)
                        .font(.footnote.monospacedDigit())
                        .foregroundStyle(palette.ink)
                        .lineLimit(1)
                        .frame(width: 64, alignment: .leading)
                }
            }
        }
    }

    /// Columna derecha: el descanso si lo hay; si no, la duración.
    @ViewBuilder
    private func mainTimer(_ palette: WorkoutLivePalette, phase: WorkoutRestPhase) -> some View {
        let big = Font.system(size: 32, weight: .bold, design: .rounded).monospacedDigit()
        switch phase {
        case .running(let range):
            VStack(alignment: .trailing, spacing: 0) {
                Text(state.restLabel)
                    .font(.caption)
                    .foregroundStyle(palette.muted)
                    .lineLimit(1)
                Text(timerInterval: range, countsDown: true)
                    .font(big)
                    .foregroundStyle(palette.accent)
                    .multilineTextAlignment(.trailing)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .frame(width: 118, alignment: .trailing)
            }
        case .paused(let remaining):
            VStack(alignment: .trailing, spacing: 0) {
                Text(state.pausedRestCaption)
                    .font(.caption)
                    .foregroundStyle(palette.muted)
                    .lineLimit(1)
                Text(verbatim: WorkoutLiveFormat.clock(remaining))
                    .font(big)
                    .foregroundStyle(palette.ink)
                    .multilineTextAlignment(.trailing)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .frame(width: 118, alignment: .trailing)
            }
        case .over:
            Text(state.restOverLabel)
                .font(.headline)
                .foregroundStyle(palette.accent)
                .multilineTextAlignment(.trailing)
                .lineLimit(2)
                .frame(maxWidth: 150, alignment: .trailing)
                .fixedSize(horizontal: false, vertical: true)
        case .noRest:
            VStack(alignment: .trailing, spacing: 0) {
                Text(state.elapsedLabel)
                    .font(.caption)
                    .foregroundStyle(palette.muted)
                    .lineLimit(1)
                Text(timerInterval: state.elapsedRange, countsDown: false)
                    .font(big)
                    .foregroundStyle(palette.ink)
                    .multilineTextAlignment(.trailing)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .frame(width: 118, alignment: .trailing)
            }
        }
    }
}

// MARK: - Dynamic Island

/*
 * Cada región es su propia vista: la extensión las coloca en el DynamicIsland
 * y las capturas de DEBUG las componen a mano. La isla es negra siempre, así
 * que todas usan la paleta oscura, y cada una fija el idioma de la app (son
 * jerarquías separadas, no heredan el entorno de las demás).
 */

/// Expandida, arriba a la izquierda: la marca.
struct WorkoutIslandLeadingView: View {
    var body: some View {
        WorkoutBoltMark(size: 34)
            .padding(.leading, 4)
    }
}

/// Expandida, arriba a la derecha: el descanso si lo hay; si no, la duración.
struct WorkoutIslandTrailingView: View {
    let state: WorkoutActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        let palette = WorkoutLivePalette.dark
        let font = Font.system(size: 26, weight: .semibold, design: .rounded).monospacedDigit()
        VStack(alignment: .trailing, spacing: 0) {
            switch state.restPhase(isStale: isStale) {
            case .running(let range):
                Text(state.restLabel)
                    .font(.caption2)
                    .foregroundStyle(palette.muted)
                    .lineLimit(1)
                Text(timerInterval: range, countsDown: true)
                    .font(font)
                    .foregroundStyle(palette.accent)
                    .multilineTextAlignment(.trailing)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            case .paused(let remaining):
                Text(state.pausedLabel)
                    .font(.caption2)
                    .foregroundStyle(palette.muted)
                    .lineLimit(1)
                Text(verbatim: WorkoutLiveFormat.clock(remaining))
                    .font(font)
                    .foregroundStyle(palette.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            case .over, .noRest:
                // «Descanso terminado» no cabe aquí: va abajo, y aquí la duración.
                Text(state.elapsedLabel)
                    .font(.caption2)
                    .foregroundStyle(palette.muted)
                    .lineLimit(1)
                Text(timerInterval: state.elapsedRange, countsDown: false)
                    .font(font)
                    .foregroundStyle(palette.ink)
                    .multilineTextAlignment(.trailing)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
        }
        .frame(width: 96, alignment: .trailing)
        .environment(\.locale, state.locale)
    }
}

/// Expandida, en el centro (bajo la cámara): ejercicio y serie.
struct WorkoutIslandCenterView: View {
    let state: WorkoutActivityAttributes.ContentState

    var body: some View {
        let palette = WorkoutLivePalette.dark
        VStack(alignment: .leading, spacing: 2) {
            Text(state.headline)
                .font(.headline)
                .foregroundStyle(palette.ink)
                .lineLimit(1)
            if !state.detailLine.isEmpty {
                Text(state.detailLine)
                    .font(.footnote)
                    .foregroundStyle(palette.muted)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .environment(\.locale, state.locale)
    }
}

/// Expandida, abajo: la duración cuando arriba está el descanso, o
/// «Descanso terminado». Sin descanso no hay nada que añadir.
struct WorkoutIslandBottomView: View {
    let state: WorkoutActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        let palette = WorkoutLivePalette.dark
        HStack(spacing: 4) {
            switch state.restPhase(isStale: isStale) {
            case .running, .paused:
                Text(state.elapsedLabel)
                    .font(.footnote)
                    .foregroundStyle(palette.muted)
                    .lineLimit(1)
                Text(timerInterval: state.elapsedRange, countsDown: false)
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(palette.ink)
                    .lineLimit(1)
                    .frame(width: 64, alignment: .leading)
                Spacer(minLength: 0)
            case .over:
                Text(state.restOverLabel)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(palette.accent)
                    .lineLimit(1)
                Spacer(minLength: 0)
            case .noRest:
                EmptyView()
            }
        }
        .environment(\.locale, state.locale)
    }
}

/// Compacta, a la izquierda de la cámara: la marca.
struct WorkoutCompactLeadingView: View {
    var body: some View {
        WorkoutBoltMark(size: 20)
    }
}

/// Compacta, a la derecha: la cuenta atrás del descanso o, si no hay, la duración.
struct WorkoutCompactTrailingView: View {
    let state: WorkoutActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        let palette = WorkoutLivePalette.dark
        let font = Font.system(size: 15, weight: .semibold, design: .rounded).monospacedDigit()
        Group {
            switch state.restPhase(isStale: isStale) {
            case .running(let range):
                Text(timerInterval: range, countsDown: true)
                    .font(font)
                    .foregroundStyle(palette.accent)
            case .paused(let remaining):
                Text(verbatim: WorkoutLiveFormat.clock(remaining))
                    .font(font)
                    .foregroundStyle(palette.muted)
            case .over, .noRest:
                Text(timerInterval: state.elapsedRange, countsDown: false)
                    .font(font)
                    .foregroundStyle(palette.ink)
            }
        }
        .multilineTextAlignment(.trailing)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .frame(width: 54, alignment: .trailing)
        .environment(\.locale, state.locale)
    }
}

/// Mínima (cuando otra app comparte la isla): la cuenta atrás si hay
/// descanso en marcha; si no, la marca.
struct WorkoutMinimalView: View {
    let state: WorkoutActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        let palette = WorkoutLivePalette.dark
        Group {
            switch state.restPhase(isStale: isStale) {
            case .running(let range):
                Text(timerInterval: range, countsDown: true)
                    .font(Font.system(size: 12, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(palette.accent)
                    .multilineTextAlignment(.center)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .frame(width: 36)
            case .paused, .over, .noRest:
                WorkoutBoltMark(size: 18)
            }
        }
        .environment(\.locale, state.locale)
    }
}
