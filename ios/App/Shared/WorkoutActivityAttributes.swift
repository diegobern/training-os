import ActivityKit
import Foundation

/**
 * Lo que la Live Activity del entrenamiento necesita para pintarse, y nada más.
 *
 * Este fichero se compila en los DOS targets: la app (el plugin
 * WorkoutNotification pide y actualiza la actividad) y la extensión
 * TrainingOSWidgets (la pinta). Las dos copias tienen que entender los mismos
 * bytes, así que aquí no hay lógica: sólo datos y el enlace de vuelta.
 *
 * Reglas (docs/NATIVE-CONTRACT.md):
 *   - Atributos fijos: sólo `sessionId`. No cambia en toda la vida de la
 *     actividad y es lo que permite el upsert por sesión.
 *   - `ContentState`: todo lo demás, con los textos YA traducidos por
 *     JavaScript. La extensión no traduce nada ni conoce el idioma del
 *     teléfono; recibe también el identificador de idioma de la app para
 *     formatear los cronómetros.
 *   - Tiempos como fechas absolutas: el sistema pinta los contadores solo, sin
 *     que la app tenga que despertarse cada segundo.
 *   - Pequeño (Apple limita el estado a 4 KB): ni la sesión completa, ni datos
 *     de la cuenta, ni nada sensible. El plugin además recorta cada texto.
 */
struct WorkoutActivityAttributes: ActivityAttributes, Sendable {
    public struct ContentState: Codable, Hashable, Sendable {
        /// Desde cuándo cuenta la duración: `startedAt + pausedMs` de la sesión. Nunca en el futuro.
        var startedAt: Date
        /// «Entrenamiento en curso».
        var title: String
        var sessionName: String
        /// Ejercicio actual, si lo hay.
        var exerciseName: String?
        /// «Serie 3 de 4», si hay ejercicio actual.
        var setLabel: String?
        /// «7 de 20 series».
        var progressLabel: String
        /// Fin del descanso. Sólo hay descanso si está presente.
        var restEndsAt: Date?
        /// Inicio del descanso (`restEndsAt - total`); nunca posterior a `restEndsAt`.
        var restStartedAt: Date?
        /// Descanso en pausa: no hay cuenta atrás, sólo el tiempo que queda.
        var restPaused: Bool?
        /// Segundos que quedan, sólo significativo con `restPaused == true`.
        var restRemaining: Int?
        var restLabel: String
        var restOverLabel: String
        var elapsedLabel: String
        var pausedLabel: String
        /// Idioma de la app ('es-ES' | 'en-GB'), no el del teléfono.
        var localeIdentifier: String

        public init(
            startedAt: Date,
            title: String,
            sessionName: String,
            exerciseName: String? = nil,
            setLabel: String? = nil,
            progressLabel: String,
            restEndsAt: Date? = nil,
            restStartedAt: Date? = nil,
            restPaused: Bool? = nil,
            restRemaining: Int? = nil,
            restLabel: String,
            restOverLabel: String,
            elapsedLabel: String,
            pausedLabel: String,
            localeIdentifier: String
        ) {
            self.startedAt = startedAt
            self.title = title
            self.sessionName = sessionName
            self.exerciseName = exerciseName
            self.setLabel = setLabel
            self.progressLabel = progressLabel
            self.restEndsAt = restEndsAt
            self.restStartedAt = restStartedAt
            self.restPaused = restPaused
            self.restRemaining = restRemaining
            self.restLabel = restLabel
            self.restOverLabel = restOverLabel
            self.elapsedLabel = elapsedLabel
            self.pausedLabel = pausedLabel
            self.localeIdentifier = localeIdentifier
        }

        private enum CodingKeys: String, CodingKey {
            case startedAt
            case title
            case sessionName
            case exerciseName
            case setLabel
            case progressLabel
            case restEndsAt
            case restStartedAt
            case restPaused
            case restRemaining
            case restLabel
            case restOverLabel
            case elapsedLabel
            case pausedLabel
            case localeIdentifier
        }

        /*
         * Decodificación tolerante, campo a campo.
         *
         * Una actualización de la app puede llegar con un entrenamiento en
         * marcha: la actividad viva guarda el estado que codificó la versión
         * anterior y la extensión nueva lo tiene que poder leer. Un campo que
         * falte toma un valor neutro en vez de romper la decodificación (que
         * dejaría la pantalla de bloqueo en blanco hasta el siguiente
         * `start`). Por la misma razón, cualquier campo que se añada en el
         * futuro tiene que ser opcional o tener aquí su valor por defecto.
         */
        public init(from decoder: Decoder) throws {
            let values = try decoder.container(keyedBy: CodingKeys.self)
            startedAt = try values.decodeIfPresent(Date.self, forKey: .startedAt) ?? Date()
            title = try values.decodeIfPresent(String.self, forKey: .title) ?? ""
            sessionName = try values.decodeIfPresent(String.self, forKey: .sessionName) ?? ""
            exerciseName = try values.decodeIfPresent(String.self, forKey: .exerciseName)
            setLabel = try values.decodeIfPresent(String.self, forKey: .setLabel)
            progressLabel = try values.decodeIfPresent(String.self, forKey: .progressLabel) ?? ""
            restEndsAt = try values.decodeIfPresent(Date.self, forKey: .restEndsAt)
            restStartedAt = try values.decodeIfPresent(Date.self, forKey: .restStartedAt)
            restPaused = try values.decodeIfPresent(Bool.self, forKey: .restPaused)
            restRemaining = try values.decodeIfPresent(Int.self, forKey: .restRemaining)
            restLabel = try values.decodeIfPresent(String.self, forKey: .restLabel) ?? ""
            restOverLabel = try values.decodeIfPresent(String.self, forKey: .restOverLabel) ?? ""
            elapsedLabel = try values.decodeIfPresent(String.self, forKey: .elapsedLabel) ?? ""
            pausedLabel = try values.decodeIfPresent(String.self, forKey: .pausedLabel) ?? ""
            localeIdentifier = try values.decodeIfPresent(String.self, forKey: .localeIdentifier) ?? "en-GB"
        }
    }

    /// Id de la sesión activa (`^[A-Za-z0-9-]{1,64}$`). Fijo durante toda la actividad.
    var sessionId: String
}

/**
 * El enlace que devuelve a la persona a su entrenamiento:
 * `trainingos://workout/active?session=<id>`.
 *
 * Lo construye la extensión (`widgetURL`) y lo valida el plugin al llegar por
 * `.capacitorOpenURL`. Cualquier app o web puede abrir un esquema propio, así
 * que la lectura es estricta: ese esquema, ese host, esa ruta, un único
 * parámetro `session` con un id bien formado, y nada más. Lo que no encaje se
 * ignora sin más (la app se abre donde estuviera).
 */
enum WorkoutActivityLink {
    static let scheme = "trainingos"
    static let host = "workout"
    static let path = "/active"
    static let sessionParameter = "session"

    /// `^[A-Za-z0-9-]{1,64}$`, la misma regla que aplica JavaScript (routeForWorkoutTap).
    static func isValidSessionId(_ value: String) -> Bool {
        let bytes = value.utf8
        guard bytes.count >= 1 && bytes.count <= 64 else { return false }
        return bytes.allSatisfy { byte in
            (byte >= 0x30 && byte <= 0x39) // 0-9
                || (byte >= 0x41 && byte <= 0x5A) // A-Z
                || (byte >= 0x61 && byte <= 0x7A) // a-z
                || byte == 0x2D // -
        }
    }

    static func url(sessionId: String) -> URL? {
        guard isValidSessionId(sessionId) else { return nil }
        var components = URLComponents()
        components.scheme = scheme
        components.host = host
        components.path = path
        components.queryItems = [URLQueryItem(name: sessionParameter, value: sessionId)]
        return components.url
    }

    /// El id de sesión si `url` es exactamente un enlace nuestro; `nil` en cualquier otro caso.
    static func sessionId(from url: URL) -> String? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme?.lowercased() == scheme,
              components.host?.lowercased() == host,
              components.path == path,
              components.user == nil,
              components.password == nil,
              components.port == nil,
              components.fragment == nil,
              let items = components.queryItems,
              items.count == 1,
              items[0].name == sessionParameter,
              let value = items[0].value,
              isValidSessionId(value)
        else { return nil }
        return value
    }
}
