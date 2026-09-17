/** Free Exercise DB vocabularies mapped onto ours. */

export const MUSCLE_MAP = {
  abdominals: 'core', abductors: 'glutes', adductors: 'quads',
  biceps: 'biceps', calves: 'calves', chest: 'chest', forearms: 'forearms',
  glutes: 'glutes', hamstrings: 'hamstrings', lats: 'back',
  'lower back': 'back', 'middle back': 'back', neck: 'other',
  quadriceps: 'quads', shoulders: 'shoulders', traps: 'back', triceps: 'triceps',
}

/** Human-readable primary-muscle labels, in both languages. */
export const MUSCLE_LABEL = {
  abdominals: { en: 'Abdominals', es: 'Abdominales' },
  abductors: { en: 'Abductors', es: 'Abductores' },
  adductors: { en: 'Adductors', es: 'Aductores' },
  biceps: { en: 'Biceps', es: 'Bíceps' },
  calves: { en: 'Calves', es: 'Gemelos' },
  chest: { en: 'Chest', es: 'Pectoral' },
  forearms: { en: 'Forearms', es: 'Antebrazos' },
  glutes: { en: 'Glutes', es: 'Glúteos' },
  hamstrings: { en: 'Hamstrings', es: 'Isquiotibiales' },
  lats: { en: 'Lats', es: 'Dorsales' },
  'lower back': { en: 'Lower back', es: 'Lumbares' },
  'middle back': { en: 'Mid back', es: 'Espalda media' },
  neck: { en: 'Neck', es: 'Cuello' },
  quadriceps: { en: 'Quads', es: 'Cuádriceps' },
  shoulders: { en: 'Shoulders', es: 'Hombros' },
  traps: { en: 'Traps', es: 'Trapecios' },
  triceps: { en: 'Triceps', es: 'Tríceps' },
}

/**
 * `null` equipment covers 77 entries and is not an error — it means the
 * dataset did not say. Those become `other`, which is exactly what `other`
 * is for, rather than a guess.
 */
export const EQUIPMENT_MAP = {
  barbell: 'barbell', dumbbell: 'dumbbell', 'body only': 'bodyweight',
  bands: 'band', kettlebells: 'kettlebell', cable: 'cable', machine: 'machine',
  'e-z curl bar': 'barbell', 'foam roll': 'other', 'exercise ball': 'other',
  'medicine ball': 'other', other: 'other',
}

/**
 * Category to exercise kind.
 *
 * Plyometrics, powerlifting, olympic weightlifting and strongman are all
 * logged as sets of reps against a load, so they are `strength` even though
 * the dataset keeps them apart. Stretching is `mobility` — held for time, not
 * loaded. Only `cardio` is cardio.
 */
export const KIND_MAP = {
  strength: 'strength', powerlifting: 'strength', 'olympic weightlifting': 'strength',
  strongman: 'strength', plyometrics: 'strength', stretching: 'mobility', cardio: 'cardio',
}

export const LEVEL_MAP = { beginner: 'beginner', intermediate: 'intermediate', expert: 'advanced' }

/** Weight increment ladder, by equipment. Mirrors the app's own mapping. */
export const INCREMENT_SOURCE = {
  dumbbell: 'dumbbell', kettlebell: 'dumbbell', barbell: 'barbell',
  smith: 'barbell', cable: 'cable', band: 'cable', bodyweight: 'bodyweight',
  machine: 'machine', other: 'machine',
}

/**
 * The cardio exercises, written by hand rather than taken from the dataset.
 *
 * Free Exercise DB has only 14 cardio entries and they are a poor fit — things
 * like "Rowing, Stationary" with strength-style instructions. These are the
 * machines and activities people actually log, each declaring the metrics that
 * make sense for it: a rower has resistance and no incline, an outdoor run has
 * neither, a jump rope has only time.
 */
export const CARDIO_CATALOG = [
  { slug: 'treadmill', en: 'Treadmill', es: 'Cinta de Correr', mode: 'run',
    metrics: ['duration', 'distance', 'incline', 'speed', 'avgHr', 'calories'],
    cueEn: 'Keep your posture tall and avoid holding the rails.',
    cueEs: 'Mantén el tronco erguido y evita agarrarte a las barras.' },
  { slug: 'outdoor-running', en: 'Outdoor Running', es: 'Carrera al Aire Libre', mode: 'outdoor',
    metrics: ['duration', 'distance', 'avgHr', 'calories'],
    cueEn: 'Land under your hips rather than reaching forward with the heel.',
    cueEs: 'Apoya el pie bajo la cadera, no adelantando el talón.' },
  { slug: 'walking', en: 'Walking', es: 'Caminata', mode: 'walk',
    metrics: ['duration', 'distance', 'incline', 'avgHr', 'calories'],
    cueEn: 'A brisk pace you could hold a conversation at.',
    cueEs: 'Un ritmo vivo en el que aún puedas mantener una conversación.' },
  { slug: 'cycling-outdoor', en: 'Cycling', es: 'Ciclismo', mode: 'outdoor',
    metrics: ['duration', 'distance', 'avgHr', 'calories'],
    cueEn: 'Keep cadence around 80-90 rpm on flat ground.',
    cueEs: 'Mantén una cadencia de 80-90 rpm en llano.' },
  { slug: 'stationary-bike', en: 'Stationary Bike', es: 'Bicicleta Estática', mode: 'bike',
    metrics: ['duration', 'distance', 'resistance', 'avgHr', 'calories'],
    cueEn: 'Set the saddle so your knee stays slightly bent at the bottom.',
    cueEs: 'Ajusta el sillín para que la rodilla quede algo flexionada abajo.' },
  { slug: 'rowing-machine', en: 'Rowing Machine', es: 'Remo Ergómetro', mode: 'row',
    metrics: ['duration', 'distance', 'resistance', 'avgHr', 'calories'],
    cueEn: 'Legs, then body, then arms — and the reverse on the way back.',
    cueEs: 'Piernas, tronco y brazos — y al revés en la vuelta.' },
  { slug: 'stair-climber', en: 'Stair Climber', es: 'Escaladora', mode: 'machine',
    metrics: ['duration', 'resistance', 'avgHr', 'calories'],
    cueEn: 'Stand tall; leaning on the handles takes the work out of it.',
    cueEs: 'Mantente erguido; apoyarte en las barras te quita el trabajo.' },
  { slug: 'elliptical', en: 'Elliptical', es: 'Elíptica', mode: 'machine',
    metrics: ['duration', 'distance', 'resistance', 'incline', 'avgHr', 'calories'],
    cueEn: 'Drive through the whole foot rather than the toes.',
    cueEs: 'Empuja con todo el pie, no solo con la punta.' },
  { slug: 'swimming', en: 'Swimming', es: 'Natación', mode: 'swim',
    metrics: ['duration', 'distance', 'avgHr', 'calories'],
    cueEn: 'Count lengths; distance matters more than speed at first.',
    cueEs: 'Cuenta largos; al principio importa más la distancia que la velocidad.' },
  { slug: 'jump-rope', en: 'Jump Rope', es: 'Comba', mode: 'hiit',
    metrics: ['duration', 'calories', 'avgHr'],
    cueEn: 'Small jumps, wrists doing the turning, not the arms.',
    cueEs: 'Saltos pequeños; giran las muñecas, no los brazos.' },
  { slug: 'ski-erg', en: 'Ski Erg', es: 'Ski Erg', mode: 'machine',
    metrics: ['duration', 'distance', 'resistance', 'avgHr', 'calories'],
    cueEn: 'Hinge at the hips and finish the pull past your thighs.',
    cueEs: 'Bisagra de cadera y termina el tirón pasando los muslos.' },
  { slug: 'assault-bike', en: 'Assault Bike', es: 'Assault Bike', mode: 'bike',
    metrics: ['duration', 'distance', 'avgHr', 'calories'],
    cueEn: 'Push and pull with the arms; it is not just a bike.',
    cueEs: 'Empuja y tira con los brazos; no es solo una bicicleta.' },
  { slug: 'hiit-circuit', en: 'HIIT Circuit', es: 'Circuito HIIT', mode: 'hiit',
    metrics: ['duration', 'avgHr', 'calories'],
    cueEn: 'The rest interval is part of the session, not a break from it.',
    cueEs: 'El descanso forma parte de la sesión, no es una pausa.' },
  { slug: 'other-cardio', en: 'Other Cardio', es: 'Otro Cardio', mode: 'other',
    metrics: ['duration', 'distance', 'avgHr', 'calories'],
    cueEn: 'Anything with a duration worth recording.',
    cueEs: 'Cualquier actividad con una duración que merezca registrarse.' },
]
