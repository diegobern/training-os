/**
 * Rule-based English -> Spanish translation of exercise NAMES.
 *
 * Everything this produces is marked `machine`, never `reviewed`. It is a
 * scaffold so that a Spanish-speaking user sees Spanish instead of English,
 * not a claim that a human checked it. The 68 curated exercises and the 14
 * cardio entries bypass this entirely — those names were written by hand and
 * are marked `reviewed`.
 *
 * The grammar being applied: English stacks modifiers in front of the head
 * noun ("Incline Barbell Bench Press"), Spanish puts the head first and hangs
 * the rest off it ("Press de Banca Inclinado con Barra"). So the translator
 * pulls out equipment and posture, translates the core, and reassembles:
 *
 *     <core> <posture> <con/en equipment> <unilateral>
 */

/** Whole phrases, matched longest-first, before any word-level work. */
const PHRASES = [
  ['bench press', 'Press de Banca'],
  ['lat pulldown', 'Jalón al Pecho'],
  ['pulldown', 'Jalón'],
  ['pull up', 'Dominada'],
  ['pull ups', 'Dominadas'],
  ['pullup', 'Dominada'],
  ['chin up', 'Dominada Supina'],
  ['chin ups', 'Dominadas Supinas'],
  ['push up', 'Flexión'],
  ['push ups', 'Flexiones'],
  ['pushup', 'Flexión'],
  ['sit up', 'Abdominal'],
  ['sit ups', 'Abdominales'],
  ['good morning', 'Buenos Días'],
  ['good mornings', 'Buenos Días'],
  ['leg press', 'Prensa de Piernas'],
  ['leg curl', 'Curl Femoral'],
  ['leg extension', 'Extensión de Cuádriceps'],
  ['leg raise', 'Elevación de Piernas'],
  ['leg raises', 'Elevaciones de Piernas'],
  ['calf raise', 'Elevación de Talones'],
  ['calf raises', 'Elevaciones de Talones'],
  ['lateral raise', 'Elevación Lateral'],
  ['lateral raises', 'Elevaciones Laterales'],
  ['front raise', 'Elevación Frontal'],
  ['front raises', 'Elevaciones Frontales'],
  ['rear delt', 'Deltoides Posterior'],
  ['face pull', 'Face Pull'],
  ['upright row', 'Remo al Mentón'],
  ['bent over row', 'Remo Inclinado'],
  ['bent over', 'Inclinado'],
  ['romanian deadlift', 'Peso Muerto Rumano'],
  ['stiff leg deadlift', 'Peso Muerto Piernas Rígidas'],
  ['sumo deadlift', 'Peso Muerto Sumo'],
  ['deadlift', 'Peso Muerto'],
  ['hip thrust', 'Empuje de Cadera'],
  ['glute bridge', 'Puente de Glúteos'],
  ['skull crusher', 'Press Francés'],
  ['skullcrusher', 'Press Francés'],
  ['triceps extension', 'Extensión de Tríceps'],
  ['tricep extension', 'Extensión de Tríceps'],
  ['triceps pushdown', 'Extensión de Tríceps en Polea'],
  ['pushdown', 'Extensión en Polea'],
  ['preacher curl', 'Curl Predicador'],
  ['hammer curl', 'Curl Martillo'],
  ['concentration curl', 'Curl Concentrado'],
  ['wrist curl', 'Curl de Muñeca'],
  ['bicep curl', 'Curl de Bíceps'],
  ['biceps curl', 'Curl de Bíceps'],
  ['overhead press', 'Press Militar'],
  ['military press', 'Press Militar'],
  ['shoulder press', 'Press de Hombros'],
  ['chest press', 'Press de Pecho'],
  ['chest fly', 'Aperturas'],
  ['pec deck', 'Contractora de Pecho'],
  ['cable crossover', 'Cruce de Poleas'],
  ['shrug', 'Encogimiento'],
  ['shrugs', 'Encogimientos'],
  ['split squat', 'Sentadilla Búlgara'],
  ['front squat', 'Sentadilla Frontal'],
  ['hack squat', 'Sentadilla Hack'],
  ['goblet squat', 'Sentadilla Goblet'],
  ['squat', 'Sentadilla'],
  ['squats', 'Sentadillas'],
  ['lunge', 'Zancada'],
  ['lunges', 'Zancadas'],
  ['step up', 'Subida al Cajón'],
  ['step ups', 'Subidas al Cajón'],
  ['plank', 'Plancha'],
  ['side plank', 'Plancha Lateral'],
  ['crunch', 'Crunch'],
  ['crunches', 'Crunches'],
  ['russian twist', 'Giro Ruso'],
  ['mountain climber', 'Escalador'],
  ['mountain climbers', 'Escaladores'],
  ['burpee', 'Burpee'],
  ['burpees', 'Burpees'],
  ['jump rope', 'Comba'],
  ['jumping jack', 'Salto de Tijera'],
  ['jumping jacks', 'Saltos de Tijera'],
  ['farmers walk', 'Paseo del Granjero'],
  ['dip', 'Fondo'],
  ['dips', 'Fondos'],
  ['row', 'Remo'],
  ['rows', 'Remos'],
  ['fly', 'Apertura'],
  ['flyes', 'Aperturas'],
  ['flys', 'Aperturas'],
  ['flies', 'Aperturas'],
  ['curl', 'Curl'],
  ['curls', 'Curls'],
  ['press', 'Press'],
  ['raise', 'Elevación'],
  ['raises', 'Elevaciones'],
  ['extension', 'Extensión'],
  ['extensions', 'Extensiones'],
  ['stretch', 'Estiramiento'],
  ['clean and jerk', 'Cargada y Envión'],
  ['clean', 'Cargada'],
  ['snatch', 'Arrancada'],
  ['jerk', 'Envión'],
  ['thruster', 'Thruster'],
  ['pullover', 'Pullover'],
  ['kickback', 'Patada de Tríceps'],
  ['pull through', 'Pull Through'],
  ['hyperextension', 'Hiperextensión'],
  ['back extension', 'Extensión Lumbar'],
  ['reverse fly', 'Apertura Invertida'],
  ['shoulder', 'Hombro'],
  ['rotation', 'Rotación'],
  ['twist', 'Giro'],
  ['walk', 'Caminata'],
  ['carry', 'Transporte'],
  ['hold', 'Isometría'],
  ['throw', 'Lanzamiento'],
  ['jump', 'Salto'],
  ['jumps', 'Saltos'],
  ['sprint', 'Sprint'],
  ['run', 'Carrera'],
  ['running', 'Carrera'],
  ['pull', 'Tirón'],
  ['push', 'Empuje'],
  ['hang', 'Suspensión'],
  ['bridge', 'Puente'],
  ['circles', 'Círculos'],
  ['swing', 'Swing'],
  ['sled', 'Trineo'],
  ['heel touch', 'Toque de Talón'],
  ['heel touchers', 'Toques de Talón'],
  ['windmill', 'Molino'],
  ['wood chop', 'Leñador'],
  ['woodchop', 'Leñador'],
  ['chop', 'Leñador'],
  ['halo', 'Halo'],
  ['clean and press', 'Cargada y Press'],
  ['power clean', 'Cargada de Potencia'],
  ['hang clean', 'Cargada Colgante'],
  ['high pull', 'Tirón Alto'],
  ['muscle up', 'Muscle Up'],
  ['toes to bar', 'Punta a la Barra'],
  ['knee raise', 'Elevación de Rodillas'],
  ['knee raises', 'Elevaciones de Rodillas'],
  ['flutter kick', 'Patada de Aleteo'],
  ['scissor kick', 'Tijeras'],
  ['bicycle crunch', 'Crunch Bicicleta'],
  ['v up', 'V-Up'],
  ['superman', 'Superman'],
  ['bird dog', 'Bird Dog'],
  ['dead bug', 'Dead Bug'],
  ['hollow hold', 'Hollow Hold'],
  ['ab roller', 'Rueda Abdominal'],
  ['ab wheel', 'Rueda Abdominal'],
  ['roller', 'Rodillo'],
  ['box jump', 'Salto al Cajón'],
  ['broad jump', 'Salto Horizontal'],
  ['depth jump', 'Salto en Profundidad'],
  ['tuck jump', 'Salto Agrupado'],
  ['bound', 'Zancada Saltada'],
  ['bounds', 'Zancadas Saltadas'],
  ['sprawl', 'Sprawl'],
  ['bear crawl', 'Marcha del Oso'],
  ['crawl', 'Reptación'],
  ['battle rope', 'Cuerda de Batalla'],
  ['tire flip', 'Volteo de Rueda'],
  ['atlas stone', 'Piedra de Atlas'],
  ['atlas stones', 'Piedras de Atlas'],
  ['yoke walk', 'Paseo con Yugo'],
  ['keg', 'Barril'],
  ['log', 'Tronco'],
  ['axle', 'Barra Axle'],
  ['pinch', 'Pinza'],
  ['gripper', 'Pinza de Mano'],
  ['towel', 'Toalla'],
  ['sit', 'Abdominal'],
  ['adductor', 'Aductores'],
  ['abductor', 'Abductores'],
  ['groin', 'Aductores'],
  ['tibialis', 'Tibial'],
  ['piriformis', 'Piramidal'],
  ['iliotibial', 'Banda Iliotibial'],
  ['it band', 'Banda Iliotibial'],
  ['achilles', 'Aquiles'],
  ['soleus', 'Sóleo'],
  ['scapular', 'Escapular'],
  ['rotator cuff', 'Manguito Rotador'],
  ['external rotation', 'Rotación Externa'],
  ['internal rotation', 'Rotación Interna'],
  ['cuban', 'Cubano'],
  ['pike', 'Pica'],
  ['handstand', 'Pino'],
  ['planche', 'Planche'],
  ['lever', 'Palanca'],
  ['flag', 'Bandera'],
  ['sled push', 'Empuje de Trineo'],
  ['sled drag', 'Arrastre de Trineo'],
  ['air bike', 'Bicicleta de Aire'],
  ['bike', 'Bicicleta'],
  ['treadmill', 'Cinta de Correr'],
  ['rowing', 'Remo Ergómetro'],
  ['elliptical', 'Elíptica'],
  ['stair', 'Escalera'],
  ['swim', 'Natación'],
  ['swimming', 'Natación'],
  ['walking', 'Caminata'],
]

/** Equipment, rendered as a trailing prepositional phrase. */
const EQUIPMENT_ES = {
  barbell: 'con Barra',
  dumbbell: 'con Mancuernas',
  dumbbells: 'con Mancuernas',
  kettlebell: 'con Kettlebell',
  kettlebells: 'con Kettlebells',
  cable: 'en Polea',
  machine: 'en Máquina',
  smith: 'en Multipower',
  band: 'con Banda',
  bands: 'con Bandas',
  ezbar: 'con Barra Z',
  ez: 'con Barra Z',
  bodyweight: '',
  lever: 'en Máquina',
  leverage: 'en Máquina',
  plate: 'con Disco',
  ball: 'con Pelota',
  rope: 'con Cuerda',
  chains: 'con Cadenas',
  sled: 'en Trineo',
  pulley: 'en Polea',
}

/** Posture and position, rendered as trailing adjectives. */
const POSTURE_ES = {
  incline: 'Inclinado',
  decline: 'Declinado',
  flat: 'Plano',
  seated: 'Sentado',
  standing: 'de Pie',
  lying: 'Tumbado',
  kneeling: 'de Rodillas',
  prone: 'Boca Abajo',
  supine: 'Boca Arriba',
  reverse: 'Invertido',
  close: 'Agarre Cerrado',
  wide: 'Agarre Ancho',
  narrow: 'Agarre Estrecho',
  overhead: 'por Encima de la Cabeza',
  behind: 'por Detrás',
  front: 'Frontal',
  rear: 'Posterior',
  side: 'Lateral',
  lateral: 'Lateral',
  alternating: 'Alterno',
  alternate: 'Alterno',
  floor: 'en el Suelo',
  hang: 'Colgado',
  hanging: 'Colgado',
  high: 'Alto',
  low: 'Bajo',
  straight: 'Recto',
  bent: 'Flexionado',
  single: '',
  power: 'de Potencia',
  strict: 'Estricto',
  kipping: 'Kipping',
  isometric: 'Isométrico',
  eccentric: 'Excéntrico',
  explosive: 'Explosivo',
  deficit: 'con Déficit',
  paused: 'con Pausa',
  tempo: 'a Tempo',
  wall: 'en Pared',
  box: 'al Cajón',
  bosu: 'en Bosu',
  stability: 'en Fitball',
  suspended: 'en Suspensión',
  advanced: 'Avanzado',
  anterior: 'Anterior',
  posterior: 'Posterior',
  diagonal: 'Diagonal',
  backward: 'Hacia Atrás',
  forward: 'Hacia Delante',
  lateral2: '',
  inner: 'Interno',
  outer: 'Externo',
  upper: 'Superior',
  lower: 'Inferior',
  middle: 'Medio',
  double: 'Doble',
  half: 'Medio',
  full: 'Completo',
  partial: 'Parcial',
  wall2: '',
  elevated: 'Elevado',
  bent2: '',
  cross: 'Cruzado',
  crossed: 'Cruzado',
  static: 'Estático',
  dynamic: 'Dinámico',
  jumping: 'con Salto',
  walking: 'Caminando',
  running: 'Corriendo',
  hanging2: '',
  supported: 'con Apoyo',
  unsupported: 'sin Apoyo',
  incline2: '',
  weighted: 'Lastrado',
  assisted: 'Asistido',
  bulgarian: 'Búlgara',
  sumo: 'Sumo',
  romanian: 'Rumano',
  单: '',
}

const UNILATERAL = new Set(['one', 'single', 'unilateral'])

/**
 * Words kept exactly as they are. A person's name attached to a lift is part
 * of the lift's name — "Zercher Squat" is not "Sentadilla de Zercher" to
 * anyone who actually trains, and inventing a translation would be worse than
 * leaving it. These count as translated, because leaving them is correct.
 */
const PROPER = new Set([
  'arnold', 'zercher', 'pendlay', 'meadows', 'jefferson', 'turkish', 'larsen',
  'scott', 'nordic', 'sissy', 'cossack', 'renegade', 'spider', 'zottman',
  'svend', 'kroc', 'jm', 'tate', 'bradford', 'bulgarian', 'romanian',
  'smr', 'tabata', 'amrap', 'emom', 'crossfit', 'yoga', 'pilates',
  'kelso', 'gironda', 'poliquin', 'hise', 'steinborn', 'anderson',
  'sumo', 'zercher', 'viking', 'landmine', 'trap', 'hex', 'safety',
  'goblet', 'thruster', 'burpee', 'devil', 'man', 'maker', 'farmer', 'farmers',
])

/** Body parts, used when they appear as a qualifier rather than the head. */
const PART_ES = {
  deltoid: 'de Deltoides', deltoids: 'de Deltoides',
  pectoral: 'de Pectoral', oblique: 'de Oblicuos', obliques: 'de Oblicuos',
  hamstrings2: '', thigh: 'de Muslo', foot: 'de Pie', hand: 'de Mano',
  finger: 'de Dedos', elbow: 'de Codo', torso: 'de Torso', waist: 'de Cintura',
  ab: 'Abdominal', abdominals: 'Abdominales', abdominal: 'Abdominal',
  chestx: '',
  arm: 'de Brazo', arms: 'de Brazos', leg: 'de Pierna', legs: 'de Piernas',
  chest: 'de Pecho', back: 'de Espalda', shoulder: 'de Hombro',
  shoulders: 'de Hombros', triceps: 'de Tríceps', tricep: 'de Tríceps',
  biceps: 'de Bíceps', bicep: 'de Bíceps', calf: 'de Gemelo',
  hamstring: 'de Isquiotibiales', quad: 'de Cuádriceps', glute: 'de Glúteo',
  hip: 'de Cadera', neck: 'de Cuello', wrist: 'de Muñeca', ankle: 'de Tobillo',
  abdominal: 'Abdominal', abs: 'Abdominal', core: 'de Core', knee: 'de Rodilla',
  lat: 'de Dorsal', lats: 'de Dorsales', trap: 'de Trapecio', traps: 'de Trapecios',
  forearm: 'de Antebrazo', spine: 'de Columna', groin: 'de Aductores',
  hamstrings: 'de Isquiotibiales', quads: 'de Cuádriceps', glutes: 'de Glúteos',
}

const sorted = [...PHRASES].sort((a, b) => b[0].split(' ').length - a[0].split(' ').length)

function cap(w) {
  return w.charAt(0).toUpperCase() + w.slice(1)
}

/**
 * Returns `{ es, confident }`. `confident` is false when the core of the name
 * could not be translated at all — the caller keeps the English name in that
 * case rather than emitting half-Spanish, which reads worse than English.
 */
export function translateName(englishName) {
  let rest = ` ${String(englishName).toLowerCase().replace(/[^a-z0-9 -]/g, ' ').replace(/[-\s]+/g, ' ').trim()} `

  // Grip phrases are lifted first: "reverse grip" must not leave a bare "grip"
  // behind, and "reverse" on its own means something different.
  const grips = []
  for (const [en, es] of [
    ['reverse grip', 'Agarre Invertido'],
    ['neutral grip', 'Agarre Neutro'],
    ['close grip', 'Agarre Cerrado'],
    ['wide grip', 'Agarre Ancho'],
    ['narrow grip', 'Agarre Estrecho'],
    ['supinated grip', 'Agarre Supino'],
    ['pronated grip', 'Agarre Prono'],
    ['mixed grip', 'Agarre Mixto'],
  ]) {
    if (rest.includes(` ${en} `)) {
      grips.push(es)
      rest = rest.replace(` ${en} `, ' ')
    }
  }

  // The core comes BEFORE equipment is stripped, because some cores contain an
  // equipment word themselves — "cable crossover" is one phrase, not a
  // crossover performed with cables.
  let core = ''
  for (const [en, es] of sorted) {
    if (rest.includes(` ${en} `)) {
      core = es
      rest = rest.replace(` ${en} `, ' ')
      break
    }
  }

  const equipment = []
  const posture = []
  const parts = []
  let unilateral = false

  for (const [en, es] of Object.entries(EQUIPMENT_ES)) {
    if (rest.includes(` ${en} `)) {
      if (es) equipment.push(es)
      rest = rest.replace(new RegExp(`\\s${en}\\s`, 'g'), ' ')
    }
  }
  for (const [en, es] of Object.entries(POSTURE_ES)) {
    if (es && rest.includes(` ${en} `)) {
      posture.push(es)
      rest = rest.replace(new RegExp(`\\s${en}\\s`, 'g'), ' ')
    }
  }
  for (const w of UNILATERAL) {
    if (rest.includes(` ${w} `)) {
      unilateral = true
      rest = rest.replace(new RegExp(`\\s${w}\\s`, 'g'), ' ')
    }
  }

  const leftovers = rest.trim().split(/\s+/).filter(Boolean)
  for (const w of leftovers) if (PART_ES[w]) parts.push(PART_ES[w])
  // Filler words that survived the phrase pass would otherwise be treated as
  // untranslatable and drag a perfectly good name down to low confidence.
  const FILLER = new Set(['with', 'the', 'a', 'an', 'and', 'or', 'on', 'in', 'to', 'of', 'for', 'from', 'over', 'up', 'down', 'out', 'off', 'by', 'at', 'medicine', 'exercise', 'bar', 'board', 'machine', 'trainer'])
  const kept = leftovers.filter((w) => PROPER.has(w))
  const untranslated = leftovers.filter(
    (w) => !PART_ES[w] && w !== 'grip' && !PROPER.has(w) && !FILLER.has(w) && !/^\d+$/.test(w),
  )

  if (!core) return { es: englishName, confident: false }

  // "a una Mano" already says it is one arm; "de Brazo" on top of it is noise.
  const trimmedParts = unilateral ? parts.filter((p) => p !== 'de Brazo' && p !== 'de Brazos') : parts

  // Deduplicate: "Bulgarian Split Squat" resolves both to a core that already
  // carries "Búlgara" and to a posture word that repeats it.
  const seen = new Set()
  const pieces = []
  for (const piece of [core, ...trimmedParts, ...kept.map(cap), ...grips, ...posture, ...equipment]) {
    if (!piece) continue
    const key = piece.toLowerCase()
    if (core.toLowerCase().includes(key) || seen.has(key)) continue
    seen.add(key)
    pieces.push(piece)
  }

  let out = [core, ...pieces.filter((p) => p !== core)].join(' ').replace(/\s+/g, ' ').trim()
  if (unilateral) out += ' a una Mano'

  if (untranslated.length) {
    out = `${out} ${untranslated.map(cap).join(' ')}`.trim()
    return { es: out, confident: false }
  }
  return { es: out, confident: true }
}
