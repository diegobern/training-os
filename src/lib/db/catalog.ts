import type { Equipment, ExerciseType, MuscleGroup } from './schema'

/**
 * Built-in exercise library. Seeded once on first run and then owned by the
 * user — they can edit, favourite or delete any of these.
 *
 * `en`/`es` names are both stored so the library reads naturally in either
 * language; the active language decides which one is shown and searched.
 */
export interface CatalogEntry {
  slug: string
  en: string
  es: string
  muscleGroup: MuscleGroup
  primaryEn: string
  primaryEs: string
  secondary: MuscleGroup[]
  equipment: Equipment
  type: ExerciseType
  repMin: number
  repMax: number
  sets: number
  rest: number
  cueEn?: string
  cueEs?: string
}

const E = (
  slug: string,
  en: string,
  es: string,
  muscleGroup: MuscleGroup,
  primaryEn: string,
  primaryEs: string,
  equipment: Equipment,
  type: ExerciseType,
  repMin: number,
  repMax: number,
  sets: number,
  rest: number,
  secondary: MuscleGroup[] = [],
  cueEn = '',
  cueEs = '',
): CatalogEntry => ({
  slug, en, es, muscleGroup, primaryEn, primaryEs, secondary, equipment, type,
  repMin, repMax, sets, rest, cueEn, cueEs,
})

export const CATALOG: CatalogEntry[] = [
  /* ---------------------------------------------------------------- CHEST */
  E('barbell-bench-press', 'Barbell Bench Press', 'Press de Banca con Barra', 'chest', 'Mid chest', 'Pectoral medio', 'barbell', 'compound', 5, 8, 4, 180, ['triceps', 'shoulders'], 'Shoulder blades retracted, feet planted, bar to lower sternum.', 'Escápulas retraídas, pies fijos, barra al esternón bajo.'),
  E('incline-barbell-press', 'Incline Barbell Press', 'Press Inclinado con Barra', 'chest', 'Upper chest', 'Pectoral superior', 'barbell', 'compound', 6, 10, 3, 150, ['shoulders', 'triceps'], 'Bench at 30°. Bar to upper chest.', 'Banco a 30°. Barra al pecho alto.'),
  E('incline-dumbbell-press', 'Incline Dumbbell Press', 'Press Inclinado con Mancuernas', 'chest', 'Upper chest', 'Pectoral superior', 'dumbbell', 'compound', 6, 10, 3, 150, ['shoulders', 'triceps'], 'Bench angle 30°. Elbows ~45° from torso.', 'Banco a 30°. Codos a ~45° del torso.'),
  E('flat-dumbbell-press', 'Flat Dumbbell Press', 'Press Plano con Mancuernas', 'chest', 'Mid chest', 'Pectoral medio', 'dumbbell', 'compound', 8, 12, 3, 150, ['triceps', 'shoulders']),
  E('chest-press-machine', 'Chest Press Machine', 'Press de Pecho en Máquina', 'chest', 'Mid chest', 'Pectoral medio', 'machine', 'compound', 8, 12, 3, 120, ['triceps']),
  E('cable-fly-mid', 'Cable Fly', 'Aperturas en Polea', 'chest', 'Mid chest', 'Pectoral medio', 'cable', 'isolation', 10, 15, 3, 90, [], 'Soft elbow angle held constant; squeeze at the midline.', 'Ángulo de codo constante; aprieta en la línea media.'),
  E('cable-fly-low-high', 'Low-to-High Cable Fly', 'Aperturas de Abajo a Arriba', 'chest', 'Upper chest', 'Pectoral superior', 'cable', 'isolation', 12, 15, 3, 90),
  E('pec-deck', 'Pec Deck', 'Contractora de Pecho', 'chest', 'Mid chest', 'Pectoral medio', 'machine', 'isolation', 10, 15, 3, 90),
  E('dips-chest', 'Chest Dips', 'Fondos para Pecho', 'chest', 'Lower chest', 'Pectoral inferior', 'bodyweight', 'compound', 6, 12, 3, 150, ['triceps', 'shoulders'], 'Lean forward ~30° to bias the chest.', 'Inclínate ~30° hacia delante para enfatizar pecho.'),
  E('push-up', 'Push-Up', 'Flexiones', 'chest', 'Mid chest', 'Pectoral medio', 'bodyweight', 'compound', 10, 20, 3, 90, ['triceps', 'core']),

  /* ----------------------------------------------------------------- BACK */
  E('pull-up', 'Pull-Up', 'Dominadas', 'back', 'Lats', 'Dorsal', 'bodyweight', 'compound', 5, 10, 4, 180, ['biceps'], 'Full stretch at the bottom, chest to bar at the top.', 'Estiramiento completo abajo, pecho a la barra arriba.'),
  E('chin-up', 'Chin-Up', 'Dominadas Supinas', 'back', 'Lats', 'Dorsal', 'bodyweight', 'compound', 5, 10, 3, 180, ['biceps']),
  E('lat-pulldown', 'Lat Pulldown', 'Jalón al Pecho', 'back', 'Lats', 'Dorsal', 'machine', 'compound', 8, 12, 3, 120, ['biceps'], 'Drive elbows down and back; avoid leaning too far.', 'Lleva los codos abajo y atrás; no te eches demasiado atrás.'),
  E('barbell-row', 'Barbell Row', 'Remo con Barra', 'back', 'Mid back', 'Espalda media', 'barbell', 'compound', 6, 10, 4, 180, ['biceps', 'hamstrings']),
  E('dumbbell-row', 'Single-Arm Dumbbell Row', 'Remo con Mancuerna', 'back', 'Lats', 'Dorsal', 'dumbbell', 'compound', 8, 12, 3, 120, ['biceps']),
  E('seated-cable-row', 'Seated Cable Row', 'Remo Sentado en Polea', 'back', 'Mid back', 'Espalda media', 'cable', 'compound', 8, 12, 3, 120, ['biceps']),
  E('chest-supported-row', 'Chest-Supported Row', 'Remo con Apoyo en Pecho', 'back', 'Mid back', 'Espalda media', 'machine', 'compound', 8, 12, 3, 120, ['biceps']),
  E('t-bar-row', 'T-Bar Row', 'Remo en T', 'back', 'Mid back', 'Espalda media', 'barbell', 'compound', 8, 12, 3, 150, ['biceps']),
  E('straight-arm-pulldown', 'Straight-Arm Pulldown', 'Pullover en Polea', 'back', 'Lats', 'Dorsal', 'cable', 'isolation', 10, 15, 3, 90),
  E('deadlift', 'Deadlift', 'Peso Muerto', 'back', 'Posterior chain', 'Cadena posterior', 'barbell', 'compound', 3, 6, 3, 240, ['hamstrings', 'glutes'], 'Brace hard, bar against the legs, hips and chest rise together.', 'Aprieta el core, barra pegada, cadera y pecho suben a la vez.'),
  E('face-pull', 'Face Pull', 'Face Pull', 'back', 'Rear delts', 'Deltoides posterior', 'cable', 'isolation', 12, 20, 3, 75, ['shoulders']),
  E('shrug', 'Shrug', 'Encogimientos', 'back', 'Traps', 'Trapecio', 'dumbbell', 'isolation', 10, 15, 3, 90),

  /* ------------------------------------------------------------ SHOULDERS */
  E('overhead-press', 'Overhead Press', 'Press Militar', 'shoulders', 'Front delts', 'Deltoides anterior', 'barbell', 'compound', 5, 8, 4, 180, ['triceps'], 'Squeeze glutes, head through at lockout.', 'Aprieta glúteos, cabeza a través en el bloqueo.'),
  E('dumbbell-shoulder-press', 'Dumbbell Shoulder Press', 'Press de Hombros con Mancuernas', 'shoulders', 'Front delts', 'Deltoides anterior', 'dumbbell', 'compound', 8, 12, 3, 150, ['triceps']),
  E('lateral-raise', 'Lateral Raise', 'Elevaciones Laterales', 'shoulders', 'Side delts', 'Deltoides lateral', 'dumbbell', 'isolation', 12, 20, 4, 75, [], 'Lead with the elbow, stop at shoulder height, control the way down.', 'Guía con el codo, para a la altura del hombro, baja controlado.'),
  E('cable-lateral-raise', 'Cable Lateral Raise', 'Elevación Lateral en Polea', 'shoulders', 'Side delts', 'Deltoides lateral', 'cable', 'isolation', 12, 20, 3, 75),
  E('machine-lateral-raise', 'Machine Lateral Raise', 'Elevación Lateral en Máquina', 'shoulders', 'Side delts', 'Deltoides lateral', 'machine', 'isolation', 12, 20, 3, 75),
  E('rear-delt-fly', 'Rear Delt Fly', 'Pájaros', 'shoulders', 'Rear delts', 'Deltoides posterior', 'dumbbell', 'isolation', 12, 20, 3, 75),
  E('reverse-pec-deck', 'Reverse Pec Deck', 'Contractora Inversa', 'shoulders', 'Rear delts', 'Deltoides posterior', 'machine', 'isolation', 12, 20, 3, 75),
  E('upright-row', 'Upright Row', 'Remo al Mentón', 'shoulders', 'Side delts', 'Deltoides lateral', 'cable', 'compound', 10, 15, 3, 90, ['back']),

  /* --------------------------------------------------------------- BICEPS */
  E('barbell-curl', 'Barbell Curl', 'Curl con Barra', 'biceps', 'Biceps', 'Bíceps', 'barbell', 'isolation', 8, 12, 3, 90),
  E('dumbbell-curl', 'Dumbbell Curl', 'Curl con Mancuernas', 'biceps', 'Biceps', 'Bíceps', 'dumbbell', 'isolation', 8, 12, 3, 90),
  E('incline-dumbbell-curl', 'Incline Dumbbell Curl', 'Curl Inclinado', 'biceps', 'Long head', 'Porción larga', 'dumbbell', 'isolation', 10, 15, 3, 90, [], 'Arms behind the torso to stretch the long head.', 'Brazos por detrás del torso para estirar la porción larga.'),
  E('preacher-curl', 'Preacher Curl', 'Curl Predicador', 'biceps', 'Short head', 'Porción corta', 'machine', 'isolation', 10, 15, 3, 90),
  E('hammer-curl', 'Hammer Curl', 'Curl Martillo', 'biceps', 'Brachialis', 'Braquial', 'dumbbell', 'isolation', 10, 15, 3, 90, ['forearms']),
  E('cable-curl', 'Cable Curl', 'Curl en Polea', 'biceps', 'Biceps', 'Bíceps', 'cable', 'isolation', 10, 15, 3, 90),

  /* -------------------------------------------------------------- TRICEPS */
  E('close-grip-bench', 'Close-Grip Bench Press', 'Press Cerrado', 'triceps', 'Triceps', 'Tríceps', 'barbell', 'compound', 6, 10, 3, 150, ['chest']),
  E('triceps-pushdown', 'Triceps Pushdown', 'Extensión en Polea', 'triceps', 'Triceps', 'Tríceps', 'cable', 'isolation', 10, 15, 3, 90),
  E('rope-pushdown', 'Rope Pushdown', 'Extensión con Cuerda', 'triceps', 'Triceps', 'Tríceps', 'cable', 'isolation', 12, 15, 3, 75),
  E('overhead-triceps-extension', 'Overhead Triceps Extension', 'Extensión sobre la Cabeza', 'triceps', 'Long head', 'Porción larga', 'cable', 'isolation', 10, 15, 3, 90, [], 'Elbows high and still; full stretch overhead.', 'Codos altos y quietos; estiramiento completo arriba.'),
  E('skull-crusher', 'Skull Crusher', 'Press Francés', 'triceps', 'Triceps', 'Tríceps', 'barbell', 'isolation', 8, 12, 3, 120),
  E('dips-triceps', 'Triceps Dips', 'Fondos para Tríceps', 'triceps', 'Triceps', 'Tríceps', 'bodyweight', 'compound', 8, 12, 3, 120, ['chest'], 'Stay upright to bias the triceps.', 'Mantente vertical para enfatizar tríceps.'),

  /* ----------------------------------------------------------------- QUADS */
  E('back-squat', 'Back Squat', 'Sentadilla Trasera', 'quads', 'Quads', 'Cuádriceps', 'barbell', 'compound', 5, 8, 4, 210, ['glutes', 'hamstrings'], 'Knees track over toes, brace before descending.', 'Rodillas hacia las puntas, aprieta el core antes de bajar.'),
  E('front-squat', 'Front Squat', 'Sentadilla Frontal', 'quads', 'Quads', 'Cuádriceps', 'barbell', 'compound', 5, 8, 3, 210, ['core']),
  E('hack-squat', 'Hack Squat', 'Hack Squat', 'quads', 'Quads', 'Cuádriceps', 'machine', 'compound', 8, 12, 3, 180, ['glutes']),
  E('leg-press', 'Leg Press', 'Prensa', 'quads', 'Quads', 'Cuádriceps', 'machine', 'compound', 10, 15, 3, 150, ['glutes']),
  E('bulgarian-split-squat', 'Bulgarian Split Squat', 'Sentadilla Búlgara', 'quads', 'Quads', 'Cuádriceps', 'dumbbell', 'compound', 8, 12, 3, 150, ['glutes']),
  E('leg-extension', 'Leg Extension', 'Extensión de Cuádriceps', 'quads', 'Quads', 'Cuádriceps', 'machine', 'isolation', 12, 20, 3, 90),
  E('walking-lunge', 'Walking Lunge', 'Zancadas', 'quads', 'Quads', 'Cuádriceps', 'dumbbell', 'compound', 10, 14, 3, 120, ['glutes']),

  /* ------------------------------------------------------------ HAMSTRINGS */
  E('romanian-deadlift', 'Romanian Deadlift', 'Peso Muerto Rumano', 'hamstrings', 'Hamstrings', 'Isquiosurales', 'barbell', 'compound', 8, 12, 3, 180, ['glutes'], 'Push the hips back, keep the bar close, stop at the stretch.', 'Lleva la cadera atrás, barra pegada, para en el estiramiento.'),
  E('lying-leg-curl', 'Lying Leg Curl', 'Curl Femoral Tumbado', 'hamstrings', 'Hamstrings', 'Isquiosurales', 'machine', 'isolation', 10, 15, 3, 90),
  E('seated-leg-curl', 'Seated Leg Curl', 'Curl Femoral Sentado', 'hamstrings', 'Hamstrings', 'Isquiosurales', 'machine', 'isolation', 10, 15, 3, 90),
  E('good-morning', 'Good Morning', 'Buenos Días', 'hamstrings', 'Hamstrings', 'Isquiosurales', 'barbell', 'compound', 8, 12, 3, 150, ['glutes']),
  E('nordic-curl', 'Nordic Curl', 'Curl Nórdico', 'hamstrings', 'Hamstrings', 'Isquiosurales', 'bodyweight', 'compound', 5, 8, 3, 120),

  /* ---------------------------------------------------------------- GLUTES */
  E('hip-thrust', 'Hip Thrust', 'Hip Thrust', 'glutes', 'Glutes', 'Glúteos', 'barbell', 'compound', 8, 12, 3, 150, ['hamstrings'], 'Ribs down, chin tucked, pause at lockout.', 'Costillas abajo, mentón recogido, pausa arriba.'),
  E('glute-bridge', 'Glute Bridge', 'Puente de Glúteo', 'glutes', 'Glutes', 'Glúteos', 'bodyweight', 'compound', 12, 20, 3, 90),
  E('cable-kickback', 'Cable Kickback', 'Patada de Glúteo en Polea', 'glutes', 'Glutes', 'Glúteos', 'cable', 'isolation', 12, 20, 3, 75),
  E('hip-abduction', 'Hip Abduction', 'Abductores en Máquina', 'glutes', 'Glute medius', 'Glúteo medio', 'machine', 'isolation', 15, 20, 3, 75),

  /* ---------------------------------------------------------------- CALVES */
  E('standing-calf-raise', 'Standing Calf Raise', 'Elevación de Talones de Pie', 'calves', 'Gastrocnemius', 'Gemelos', 'machine', 'isolation', 10, 15, 4, 75, [], 'Pause at the top and at the stretch.', 'Pausa arriba y en el estiramiento.'),
  E('seated-calf-raise', 'Seated Calf Raise', 'Elevación de Talones Sentado', 'calves', 'Soleus', 'Sóleo', 'machine', 'isolation', 12, 20, 3, 75),
  E('leg-press-calf-raise', 'Leg Press Calf Raise', 'Gemelos en Prensa', 'calves', 'Gastrocnemius', 'Gemelos', 'machine', 'isolation', 12, 20, 3, 75),

  /* ------------------------------------------------------------------ CORE */
  E('hanging-leg-raise', 'Hanging Leg Raise', 'Elevación de Piernas Colgado', 'core', 'Abs', 'Abdomen', 'bodyweight', 'compound', 8, 15, 3, 90),
  E('cable-crunch', 'Cable Crunch', 'Crunch en Polea', 'core', 'Abs', 'Abdomen', 'cable', 'isolation', 12, 20, 3, 75),
  E('plank', 'Plank', 'Plancha', 'core', 'Abs', 'Abdomen', 'bodyweight', 'isolation', 1, 1, 3, 60, [], 'Log seconds in the reps field.', 'Registra los segundos en el campo de repeticiones.'),
  E('ab-wheel', 'Ab Wheel Rollout', 'Rueda Abdominal', 'core', 'Abs', 'Abdomen', 'other', 'compound', 8, 15, 3, 90),
  E('pallof-press', 'Pallof Press', 'Press Pallof', 'core', 'Obliques', 'Oblicuos', 'cable', 'isolation', 10, 15, 3, 60),

  /* -------------------------------------------------------------- FOREARMS */
  E('wrist-curl', 'Wrist Curl', 'Curl de Muñeca', 'forearms', 'Forearm flexors', 'Flexores', 'dumbbell', 'isolation', 15, 20, 3, 60),
  E('reverse-curl', 'Reverse Curl', 'Curl Inverso', 'forearms', 'Brachioradialis', 'Braquiorradial', 'barbell', 'isolation', 12, 15, 3, 75),
  E('farmers-walk', "Farmer's Walk", 'Paseo del Granjero', 'forearms', 'Grip', 'Agarre', 'dumbbell', 'compound', 1, 1, 3, 120, ['core'], 'Log distance or seconds in the reps field.', 'Registra distancia o segundos en repeticiones.'),
]

export const CATALOG_BY_SLUG = new Map(CATALOG.map((c) => [c.slug, c]))
