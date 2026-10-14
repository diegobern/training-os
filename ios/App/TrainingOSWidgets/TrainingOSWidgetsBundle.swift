import SwiftUI
import WidgetKit

/**
 * La extensión de Training OS existe sólo para la Live Activity del
 * entrenamiento: no hay widgets de pantalla de inicio. Si algún día los hay,
 * se añaden aquí.
 */
@main
struct TrainingOSWidgetsBundle: WidgetBundle {
    var body: some Widget {
        WorkoutLiveActivityWidget()
    }
}
