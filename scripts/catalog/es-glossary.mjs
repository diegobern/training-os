/**
 * El glosario fijo de `docs/GLOSARIO-INSTRUCCIONES-ES.md`, en la forma en que
 * lo puede comprobar un programa.
 *
 * Cada regla dice: «si el original en inglés de una ficha usa este término,
 * su traducción tiene que usar éste». Se comprueba por ficha y no por paso,
 * porque el español a veces cambia el término de frase al reordenarla; lo que
 * no puede pasar es que el término desaparezca de la ficha o que se diga de
 * otra manera.
 *
 * `strict: true` son las que `tests/catalog-integrity.mjs` exige al 100 %.
 * Las demás sólo se informan: son términos con usos que no se traducen igual
 * (*squat* es un ejercicio y también el verbo agacharse; *set* es una serie y
 * también «colocar»), y forzarlos llenaría la traducción de calcos.
 */

/** @typedef {{ id: string, en: RegExp, es: RegExp, strict: boolean, note?: string }} GlossaryRule */

/** @type {GlossaryRule[]} */
export const GLOSSARY = [
  // --- material -------------------------------------------------------------
  { id: 'barbell', en: /\bbarbells?\b/i, es: /\bbarras?\b/i, strict: true },
  { id: 'dumbbell', en: /\bdumbbells?\b/i, es: /\bmancuernas?\b/i, strict: true },
  { id: 'kettlebell', en: /\bkettlebells?\b/i, es: /\bkettlebells?\b/i, strict: true },
  { id: 'ez-bar', en: /\bE-?Z[- ]?(curl )?bars?\b/i, es: /\bbarras? Z\b/i, strict: true },
  { id: 'smith', en: /\bsmith machine\b/i, es: /\bm[aá]quina Smith\b/i, strict: true },
  { id: 'bench', en: /\bbench(es)?\b/i, es: /\bbanc[oa]s?\b/i, strict: true },
  { id: 'pulley', en: /\bpulleys?\b/i, es: /\bpoleas?\b/i, strict: true },
  { id: 'cable', en: /\bcables?\b/i, es: /\b(poleas?|cables?)\b/i, strict: true },
  { id: 'rack', en: /\b(re-?)?rack\b/i, es: /\b(rack|jaula)\b/i, strict: true, note: '«power rack» es «jaula de potencia»' },
  { id: 'band', en: /\b(resistance )?bands?\b/i, es: /\bbandas?\b/i, strict: true },
  { id: 'fitball', en: /\b(exercise|stability|swiss) balls?\b/i, es: /\bfitball\b/i, strict: true },
  { id: 'medicine-ball', en: /\bmedicine balls?\b/i, es: /\bbal[oó]n(es)? medicinal(es)?\b/i, strict: true },
  { id: 'foam-roller', en: /\bfoam roll(er)?s?\b/i, es: /\brodillo de espuma\b/i, strict: true },
  { id: 'box', en: /\bbox(es)?\b/i, es: /\bcaj[oó]n(es)?\b/i, strict: true },
  { id: 'handle', en: /\bhandles?\b/i, es: /\b(empu[ñn]aduras?|asas?|mangos?)\b/i, strict: false, note: 'empuñadura en poleas y máquinas; asa en la kettlebell; «handle» también es el verbo manejar' },
  { id: 'partner', en: /\bpartners?\b/i, es: /\bcompa[ñn]er[oa]s?\b/i, strict: true },
  { id: 'spotter', en: /\bspotters?\b/i, es: /\bayudantes?\b/i, strict: true },

  // --- cuerpo ---------------------------------------------------------------
  { id: 'torso', en: /\btorso\b/i, es: /\btorso\b/i, strict: true },
  { id: 'upper-arm', en: /\bupper arms?\b/i, es: /\bbrazos?\b/i, strict: true },
  { id: 'forearm', en: /\bforearms?\b/i, es: /\bantebrazos?\b/i, strict: true },
  { id: 'shoulder-blades', en: /\bshoulder blades?\b/i, es: /\besc[aá]pulas?\b/i, strict: true },
  {
    id: 'lower-back',
    // Sólo el sustantivo. «Lower back down to the starting position» es el
    // verbo «bajar de nuevo», y exigir «lumbar» ahí obligaba a añadir al
    // paso una indicación que el original no trae.
    en: /\b(your|the|his|her|a|my)\s+lower\s+back\b|\blower back (muscles|pain|injur\w*|area|region)\b/i,
    es: /\blumbar(es)?\b/i,
    strict: true,
  },
  { id: 'glutes', en: /\bglute(s|us)?\b/i, es: /\bgl[uú]teos?\b/i, strict: true },
  { id: 'hamstrings', en: /\bhamstrings?\b/i, es: /\bisquiotibiales?\b/i, strict: true },
  { id: 'quads', en: /\bquad(s|riceps)\b/i, es: /\bcu[aá]driceps\b/i, strict: true },
  { id: 'calves', en: /\bcalves\b/i, es: /\bpantorrillas?\b/i, strict: false, note: '«calf raise» es «elevación de talones»' },
  { id: 'lats', en: /\blats\b/i, es: /\bdorsal(es)?\b/i, strict: true },
  { id: 'traps', en: /\b(traps|trapezius)\b/i, es: /\btrapecios?\b/i, strict: true },
  { id: 'delts', en: /\b(delts?|deltoids?)\b/i, es: /\bdeltoides\b/i, strict: true },
  { id: 'abs', en: /\b(abs|abdominals?)\b/i, es: /\babdomin(ales|al)\b/i, strict: true },
  { id: 'obliques', en: /\bobliques?\b/i, es: /\boblicuos?\b/i, strict: true },
  { id: 'biceps', en: /\bbiceps?\b/i, es: /\bb[ií]ceps\b/i, strict: true },
  { id: 'triceps', en: /\btriceps?\b/i, es: /\btr[ií]ceps\b/i, strict: true },
  { id: 'chest', en: /\bchest\b/i, es: /\b(pecho|pectoral(es)?)\b/i, strict: true },
  { id: 'thighs', en: /\bthighs?\b/i, es: /\bmuslos?\b/i, strict: true },
  { id: 'heels', en: /\bheels?\b/i, es: /\btal(ón|on|ones)\b/i, strict: true },
  { id: 'toes', en: /\btoes?\b/i, es: /\b(puntas?|puntillas|dedos?)\b/i, strict: true },

  // --- posición y agarre ----------------------------------------------------
  { id: 'starting-position', en: /\b(start(ing)?|initial) position\b/i, es: /\bposici[oó]n inicial\b/i, strict: true },
  { id: 'shoulder-width', en: /\bshoulder[- ]width\b/i, es: /\banchura de (los )?hombros\b/i, strict: true },
  { id: 'pronated', en: /\b(pronated|overhand)\b/i, es: /\b(pron[oa]s?|pronaci[oó]n)\b/i, strict: true },
  { id: 'supinated', en: /\b(supinated|underhand)\b/i, es: /\b(supin[oa]s?|supinaci[oó]n)\b/i, strict: true },
  { id: 'neutral-grip', en: /\bneutral grip\b/i, es: /\bagarre neutro\b/i, strict: true },
  { id: 'hook-grip', en: /\bhook grip\b/i, es: /\bagarre de gancho\b/i, strict: true },
  { id: 'floor', en: /\b(floor|ground)\b/i, es: /\bsuelo\b/i, strict: true },
  { id: 'stationary', en: /\bstationary\b/i, es: /\binm[oó]vil(es)?\b/i, strict: false, note: '«stationary bike» es una bicicleta estática' },

  // --- acciones y repeticiones ----------------------------------------------
  { id: 'inhale', en: /\b(inhal\w*|breath(e|es|ing) in)\b/i, es: /\binhal\w*/i, strict: true },
  { id: 'exhale', en: /\b(exhal\w*|breath(e|es|ing) out)\b/i, es: /\bexhal\w*/i, strict: true },
  {
    id: 'prescribed-reps',
    en: /\b(prescribed|recommended) (amount|number) of (repetitions|reps|times)\b/i,
    es: /\b(repeticiones|veces) indicadas\b/i,
    strict: true,
  },
  { id: 'repetitions', en: /\b(repetitions?|reps?)\b/i, es: /\brepetici(ón|on|ones)\b/i, strict: true },
  { id: 'deadlift', en: /\bdeadlifts?\b/i, es: /\bpeso muerto\b/i, strict: true },
  { id: 'squat', en: /\bsquats?\b/i, es: /\bsentadillas?\b/i, strict: false, note: '«squat down» es agacharse' },
  { id: 'lunge', en: /\blunges?\b/i, es: /\bzancadas?\b/i, strict: false },

  // --- etiquetas --------------------------------------------------------------
  { id: 'note', en: /\bNote:/, es: /\bNota:/, strict: true },
  { id: 'caution', en: /\bCaution\b/, es: /\bPrecauci[oó]n\b/, strict: true },
  { id: 'variation', en: /\bVariations?\b/, es: /\bVariantes?\b/, strict: true },
]

/**
 * `Tip` se comprueba aparte y contando, no sólo presente/ausente: si el
 * original da tres consejos, la traducción tiene que dar tres. Con mayúscula y
 * seguido de dos puntos o de un espacio, para no confundirlo con «the tip of
 * your nose», que es la punta de la nariz.
 */
export const TIP_EN = /\bTip\b(?=[:\s])/g
export const TIP_ES = /\bConsejo:/g

/**
 * Palabras que en una frase en español sólo pueden estar porque se ha colado
 * inglés sin traducir. Son palabras de función y de uso constante en estas
 * fichas, ninguna de las cuales existe en español. Los préstamos que sí se
 * usan en español (*press*, *curl*, *rack*, *step*, *core*, *kettlebell*…) no
 * están aquí a propósito.
 */
export const ENGLISH_LEAKS = [
  'the', 'your', 'you', 'with', 'and', 'then', 'while', 'until', 'keep', 'hold',
  'slowly', 'toward', 'towards', 'position', 'starting', 'repeat', 'should', 'will',
  'this', 'that', 'into', 'onto', 'from', 'over', 'under', 'each', 'other', 'both',
  'of', 'to', 'at', 'it', 'is', 'are', 'be', 'by', 'for', 'if', 'an', 'up', 'down',
  'out', 'back', 'arms', 'legs', 'feet', 'knees', 'hands', 'weight', 'floor',
  'shoulder', 'shoulders', 'straight', 'when', 'after', 'which', 'sure', 'make',
  'begin', 'lower', 'raise', 'lift', 'bend', 'extend', 'place', 'grip', 'bar',
  'bench', 'dumbbell', 'dumbbells', 'barbell', 'barbells', 'repetitions', 'reps',
  'exercise', 'movement', 'second', 'seconds', 'times', 'knee', 'elbow', 'elbows',
  'hip', 'hips', 'arm', 'leg', 'foot', 'hand', 'body', 'side',
]

const LEAK_RE = new RegExp(`(?<![\\p{L}\\p{N}])(${ENGLISH_LEAKS.join('|')})(?![\\p{L}\\p{N}])`, 'giu')

/** Las palabras inglesas de la lista que aparecen en `text`, en minúsculas y sin repetir. */
export function englishLeaks(text) {
  const hits = new Set()
  for (const m of text.matchAll(LEAK_RE)) hits.add(m[1].toLowerCase())
  return [...hits]
}

/** Los pasos que cuentan: el original trae dos fichas con un paso vacío. */
export function meaningfulSteps(en) {
  return (en ?? []).filter((s) => typeof s === 'string' && s.trim().length > 0)
}
