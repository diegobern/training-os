import ActivityKit
import SwiftUI
import WidgetKit

/**
 * La Live Activity del entrenamiento: pantalla de bloqueo y Dynamic Island.
 *
 * La pide y la actualiza el plugin WorkoutNotification de la app
 * (App/WorkoutNotificationPlugin.swift); aquí sólo se pinta. Las vistas son
 * las de Shared/WorkoutActivityViews.swift, las mismas que rasteriza la app en
 * DEBUG para revisarlas.
 *
 * Sin botones (v1): cualquier acción desde la pantalla de bloqueo cambiaría el
 * entrenamiento sin pasar por la lógica de JavaScript. Tocar la actividad
 * abre la app en el entrenamiento por `widgetURL`.
 */
struct WorkoutLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
            WorkoutLockScreenActivityView(state: context.state, isStale: context.isStale)
                .widgetURL(WorkoutActivityLink.url(sessionId: context.attributes.sessionId))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    WorkoutIslandLeadingView()
                }
                DynamicIslandExpandedRegion(.trailing) {
                    WorkoutIslandTrailingView(state: context.state, isStale: context.isStale)
                }
                DynamicIslandExpandedRegion(.center) {
                    WorkoutIslandCenterView(state: context.state)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    WorkoutIslandBottomView(state: context.state, isStale: context.isStale)
                }
            } compactLeading: {
                WorkoutCompactLeadingView()
            } compactTrailing: {
                WorkoutCompactTrailingView(state: context.state, isStale: context.isStale)
            } minimal: {
                WorkoutMinimalView(state: context.state, isStale: context.isStale)
            }
            .widgetURL(WorkoutActivityLink.url(sessionId: context.attributes.sessionId))
            .keylineTint(WorkoutLivePalette.brandBolt)
        }
    }
}

/**
 * La vista de la pantalla de bloqueo con su fondo.
 *
 * El fondo (activityBackgroundTint) depende de la apariencia del sistema, y
 * la apariencia sólo se conoce dentro de una vista: por eso este envoltorio
 * lee `colorScheme` y aplica la paleta de la app que toca, en claro o en
 * oscuro. Así el texto siempre contrasta con su fondo.
 */
struct WorkoutLockScreenActivityView: View {
    let state: WorkoutActivityAttributes.ContentState
    let isStale: Bool

    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        let palette = WorkoutLivePalette.forScheme(colorScheme)
        WorkoutLockScreenView(state: state, isStale: isStale)
            .activityBackgroundTint(palette.background)
            .activitySystemActionForegroundColor(palette.ink)
    }
}
