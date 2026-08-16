/**
 * German naming.
 *
 * Names are **composed, not translated**. A canonical name like
 * "Barbell Incline Bench Press" is decomposed into equipment, modifiers and a
 * base movement; each part is looked up in the tables below; the result is
 * assembled the way German actually writes it — "Langhantel-Schrägbankdrücken",
 * not "Langhantel Schräg Bank Drücken".
 *
 * ## Why a dictionary rather than a translator
 *
 * Machine translation of gym vocabulary produces confident nonsense: "Deadlift"
 * becomes "Totheben", "Good Morning" stays "Guten Morgen". The established
 * German terms are a small, closed vocabulary — a few hundred words — and a
 * table of them is both more accurate and reviewable line by line.
 *
 * ## What happens to a word nobody entered
 *
 * It is **not guessed**. A base movement missing from `BASE_MOVEMENTS` marks the
 * whole candidate `REVIEW` with the unknown term named, so a person decides.
 * That is the difference between a proposal worth reviewing and 330 plausible
 * inventions.
 */

/** Equipment, as the German prefix of a compound noun. */
export const EQUIPMENT_TERMS: Readonly<Record<string, string>> = {
  barbell: 'Langhantel',
  dumbbell: 'Kurzhantel',
  kettlebell: 'Kettlebell',
  cable: 'Kabelzug',
  machine: 'Maschinen',
  smith: 'Multipresse',
  lever: 'Maschinen',
  band: 'Band',
  bands: 'Band',
  resistance_band: 'Band',
  'ez-bar': 'SZ-Hantel',
  'e-z': 'SZ-Hantel',
  ez: 'SZ-Hantel',
  medicine: 'Medizinball',
  'medicine ball': 'Medizinball',
  'exercise ball': 'Gymnastikball',
  'stability ball': 'Gymnastikball',
  'swiss ball': 'Gymnastikball',
  'bosu ball': 'Bosu-Ball',
  sled: 'Schlitten',
  trap: 'Trap-Bar',
  weighted: 'Gewichts',
  bodyweight: '',
};

/**
 * Equipment as a phrase *behind* the movement, which is how German says it.
 *
 * "Kurzhantel-Bankdrücken" is a compound a machine builds; a coach says
 * "Bankdrücken mit Kurzhanteln". The prefix form also stacks badly — three
 * modifiers in front of one noun produce names nobody reads.
 *
 * Each entry carries both numbers because only the implement pluralises:
 * two dumbbells, one cable tower. Which one applies is read off the English
 * name — "One-Arm …" means one implement.
 *
 * A term **absent** from this table stays a prefix. `Gewichts` is the reason:
 * "weighted" is not an implement, and "Sprungkniebeuge mit Gewichts" is not a
 * sentence.
 */
export const EQUIPMENT_PHRASES: Readonly<Record<string, { one: string; many: string }>> = {
  Langhantel: { one: 'mit Langhantel', many: 'mit Langhantel' },
  Kurzhantel: { one: 'mit Kurzhantel', many: 'mit Kurzhanteln' },
  Kettlebell: { one: 'mit Kettlebell', many: 'mit Kettlebells' },
  Kabelzug: { one: 'am Kabelzug', many: 'am Kabelzug' },
  Maschinen: { one: 'an der Maschine', many: 'an der Maschine' },
  Multipresse: { one: 'in der Multipresse', many: 'in der Multipresse' },
  Band: { one: 'mit Band', many: 'mit Band' },
  'SZ-Hantel': { one: 'mit SZ-Hantel', many: 'mit SZ-Hantel' },
  Medizinball: { one: 'mit Medizinball', many: 'mit Medizinball' },
  Gymnastikball: { one: 'auf dem Gymnastikball', many: 'auf dem Gymnastikball' },
  'Bosu-Ball': { one: 'auf dem Bosu-Ball', many: 'auf dem Bosu-Ball' },
  'Trap-Bar': { one: 'mit Trap-Bar', many: 'mit Trap-Bar' },
  Schlitten: { one: 'mit Schlitten', many: 'mit Schlitten' },
};

/**
 * Grammatical gender of each base movement.
 *
 * Needed for one thing only: a German adjective in front of a noun takes its
 * ending from that noun's gender. Without it every composed name carried the
 * neuter `-es` and produced "einarmiges Klimmzug" where German says
 * "einarmiger Klimmzug".
 *
 * Nominalised infinitives — Drücken, Rudern, Heben — are neuter without
 * exception, which covers most of this table. The rest is ordinary vocabulary.
 * A movement missing here is **not guessed**: the composition marks it for
 * review rather than picking an ending.
 */
export type Gender = 'm' | 'f' | 'n';

export const BASE_GENDER: Readonly<Record<string, Gender>> = {
  // Nominalised infinitives — all neuter.
  'bench press': 'n',
  'chest press': 'n',
  press: 'n',
  'shoulder press': 'n',
  'overhead press': 'n',
  'military press': 'n',
  row: 'n',
  pulldown: 'n',
  // Der Latzug — masculine. Recorded as neuter until the Block 1 review, which
  // is why the composition produced "Einarmiges Latzug".
  'lat pulldown': 'm',
  'pull-down': 'n',
  shrug: 'n',
  'upright row': 'n',
  extension: 'n',
  'triceps extension': 'n',
  'tricep extension': 'n',
  pushdown: 'n',
  'skull crusher': 'n',
  'french press': 'n',
  'leg extension': 'n',
  'leg curl': 'n',
  'calf raise': 'n',
  'hip thrust': 'n',
  deadlift: 'n',
  'back extension': 'n',
  'leg raise': 'n',
  'knee raise': 'n',
  clean: 'n',
  'clean and jerk': 'n',
  'clean and press': 'n',
  snatch: 'n',
  jerk: 'n',
  stretch: 'f',
  'hip flexor stretch': 'f',
  'hamstring stretch': 'f',
  'shoulder stretch': 'f',
  'chest stretch': 'f',
  'calf stretch': 'f',
  'butterfly stretch': 'f',
  'quad stretch': 'f',
  'groin stretch': 'f',
  'lat stretch': 'f',
  'neck stretch': 'f',
  'wrist stretch': 'f',
  run: 'n',
  running: 'n',
  jog: 'n',
  jogging: 'n',
  walk: 'n',
  walking: 'n',
  bike: 'n',
  'jump rope': 'n',
  'rope jumping': 'n',
  skipping: 'n',
  'foam roll': 'n',
  'foam rolling': 'n',
  smr: 'n',
  circle: 'n',
  circles: 'n',
  'arm circle': 'n',
  'hip circle': 'n',
  'shoulder circle': 'n',
  'ankle circle': 'n',
  'side bend': 'n',
  'lateral raise': 'n',
  'side lateral': 'n',
  'front raise': 'n',
  'deltoid raise': 'n',
  'shoulder raise': 'n',
  raise: 'n',
  adduction: 'f',
  abduction: 'f',
  'hip adduction': 'f',
  'hip abduction': 'f',
  'external rotation': 'f',
  'internal rotation': 'f',
  rotation: 'f',
  'thoracic rotation': 'f',
  'butt kick': 'n',
  'high knee': 'm',
  'flutter kick': 'm',
  'scissor kick': 'm',
  'ankle mobility': 'f',
  hang: 'n',
  hold: 'n',
  'bear crawl': 'm',
  'crab walk': 'm',
  'rope climb': 'n',
  'sled push': 'n',
  'sled drag': 'n',
  wiper: 'm',
  'windshield wiper': 'm',
  twist: 'f',
  bridge: 'f',
  thrust: 'm',
  'frog press': 'f',
  'glute ham raise': 'm',
  'nordic curl': 'm',
  'wall sit': 'm',

  // Masculine.
  squat: 'f',
  'split squat': 'm',
  lunge: 'm',
  lunges: 'm',
  'step-up': 'm',
  'step up': 'm',
  'leg press': 'f',
  'good morning': 'm',
  swing: 'm',
  hyperextension: 'f',
  'pull-through': 'm',
  crunch: 'm',
  crunches: 'm',
  'reverse crunch': 'm',
  'cable crunch': 'm',
  'sit-up': 'm',
  situp: 'm',
  'sit up': 'm',
  plank: 'm',
  'side plank': 'm',
  'russian twist': 'm',
  'ab rollout': 'm',
  rollout: 'm',
  'dead bug': 'm',
  'bird dog': 'm',
  'pallof press': 'm',
  'wood chop': 'm',
  woodchop: 'm',
  'hollow hold': 'm',
  'mountain climber': 'm',
  'power clean': 'm',
  'hang clean': 'm',
  'power snatch': 'm',
  'hang snatch': 'm',
  'high pull': 'm',
  'box jump': 'm',
  'jump squat': 'f',
  'broad jump': 'm',
  'depth jump': 'm',
  'tuck jump': 'm',
  bound: 'm',
  bounds: 'm',
  hop: 'm',
  hops: 'm',
  burpee: 'm',
  burpees: 'm',
  'jumping jack': 'm',
  'medicine ball throw': 'm',
  slam: 'm',
  throw: 'm',
  'overhead throw': 'm',
  'chest pass': 'm',
  'chest throw': 'm',
  'scoop throw': 'm',
  'chest push': 'm',
  pass: 'm',
  skip: 'n',
  leap: 'm',
  groiner: 'm',
  carry: 'm',
  "farmer's walk": 'm',
  sprint: 'm',
  'battle rope': 'n',
  dip: 'm',
  dips: 'm',
  'push-up': 'm',
  pushup: 'm',
  'push up': 'm',
  'pull-up': 'm',
  pullup: 'm',
  'pull up': 'm',
  'chin-up': 'm',
  chinup: 'm',
  'muscle up': 'm',
  'muscle-up': 'm',
  'inverted row': 'm',
  'pistol squat': 'm',
  'l-sit': 'm',
  'front lever': 'm',
  'back lever': 'm',
  'handstand push-up': 'm',
  handstand: 'm',
  'push press': 'm',
  'face pull': 'm',
  curl: 'm',
  'hammer curl': 'm',
  'preacher curl': 'm',
  'concentration curl': 'm',
  kickback: 'm',
  fly: 'f',
  flye: 'f',
  flyes: 'f',
  pullover: 'm',
  butterfly: 'm',
  'reverse butterfly': 'm',
  crossover: 'm',
  'cable crossover': 'm',
  'iron cross': 'n',
  'pull apart': 'm',
  'around the world': 'm',
  scaption: 'f',
  superman: 'm',
  'v-up': 'm',
  'toe touch': 'm',
  'toes to bar': 'm',
  'knee tuck': 'm',
  windmill: 'm',
  'turkish get-up': 'm',
  'get-up': 'm',
  'glute bridge': 'f',
  clamshell: 'f',
  'fire hydrant': 'm',
  'donkey kick': 'm',
  'leg swing': 'n',
  "child's pose": 'f',
  'cat stretch': 'm',
  'cat-cow': 'f',
  'thread the needle': 'n',
  'world greatest stretch': 'm',
  'pigeon pose': 'f',
  'downward dog': 'm',
  'cobra stretch': 'f',
  treadmill: 'n',
  'recumbent bike': 'n',
  'stationary bike': 'n',
  elliptical: 'm',
  'stair climber': 'm',
  climber: 'm',
  rower: 'n',
  'ball hug': 'f',
  'knee to chest': 'n',
  'hip flexor': 'm',
  squeeze: 'f',
  'jump squat ': 'f',
};

/**
 * Adjectival modifiers, as **stems**.
 *
 * The ending is added from the noun's gender, strong declension, nominative
 * singular: masculine `-er`, feminine `-e`, neuter `-es`. Storing the stem
 * rather than a finished word is what makes that possible — the old table held
 * "einarmiges" and had no way to produce anything else.
 */
export const ADJECTIVE_STEMS: Readonly<Record<string, string>> = {
  seated: 'sitzend',
  standing: 'stehend',
  lying: 'liegend',
  kneeling: 'kniend',
  'half kneeling': 'halbkniend',
  bent: 'vorgebeugt',
  'bent-over': 'vorgebeugt',
  'bent over': 'vorgebeugt',
  rear: 'hinter',
  reverse: 'umgekehrt',
  backward: 'rückwärtig',
  backwards: 'rückwärtig',
  wide: 'weit',
  narrow: 'eng',
  close: 'eng',
  single: 'einbeinig',
  'single-leg': 'einbeinig',
  'single leg': 'einbeinig',
  'one-leg': 'einbeinig',
  'one leg': 'einbeinig',
  'double leg': 'beidbeinig',
  'one-arm': 'einarmig',
  'one arm': 'einarmig',
  'single-arm': 'einarmig',
  'single arm': 'einarmig',
  'two-arm': 'zweiarmig',
  alternating: 'alternierend',
  side: 'seitlich',
  lateral: 'seitlich',
  hanging: 'hängend',
  suspended: 'aufgehängt',
  high: 'hoh',
  low: 'tief',
  conventional: 'konventionell',
  explosive: 'explosiv',
  eccentric: 'exzentrisch',
  isometric: 'isometrisch',
  static: 'statisch',
  active: 'aktiv',
  passive: 'passiv',
  assisted: 'unterstützt',
  negative: 'negativ',
  elevated: 'erhöht',
  'straight leg': 'gestreckt',
  'stiff leg': 'gestreckt',
  'stiff-legged': 'gestreckt',
  'bent knee': 'gebeugt',
  walking: 'gehend',
  romanian: 'rumänisch',
  bulgarian: 'bulgarisch',
};

/** Strong declension, nominative singular — the form a catalogue name uses. */
export function decline(stem: string, gender: Gender): string {
  const ending = gender === 'm' ? 'er' : gender === 'f' ? 'e' : 'es';

  return `${stem}${ending}`;
}

/** Modifiers that sit in front of the movement. */
export const MODIFIER_TERMS: Readonly<Record<string, string>> = {
  incline: 'Schräg',
  decline: 'Negativ',
  flat: 'Flach',
  seated: 'sitzendes',
  standing: 'stehendes',
  lying: 'liegendes',
  kneeling: 'kniendes',
  'half kneeling': 'halbkniendes',
  prone: 'Bauchlage-',
  supine: 'Rückenlage-',
  bent: 'vorgebeugtes',
  'bent-over': 'vorgebeugtes',
  'bent over': 'vorgebeugtes',
  front: 'Front',
  rear: 'hinteres',
  reverse: 'umgekehrtes',
  wide: 'weites',
  narrow: 'enges',
  close: 'enges',
  'close-grip': 'Enggriff-',
  'wide-grip': 'Weitgriff-',
  overhead: 'Überkopf',
  单: '',
  single: 'einbeiniges',
  'single-leg': 'einbeiniges',
  'single leg': 'einbeiniges',
  'one-arm': 'einarmiges',
  'one arm': 'einarmiges',
  'single-arm': 'einarmiges',
  alternating: 'alternierendes',
  side: 'seitliches',
  lateral: 'seitliches',
  hanging: 'hängendes',
  high: 'hohes',
  low: 'tiefes',
  romanian: 'Rumänisches',
  bulgarian: 'Bulgarisches',
  sumo: 'Sumo-',
  conventional: 'konventionelles',
  paused: 'Pause-',
  explosive: 'explosives',
  jump: 'Sprung',
  walking: 'gehende',
  goblet: 'Goblet-',
  zercher: 'Zercher-',
  hack: 'Hack-',
  box: 'Box-',
  pin: 'Pin-',
  floor: 'Boden',
  landmine: 'Landmine-',
  assisted: 'unterstützter',
  negative: 'negativer',
  isometric: 'isometrisches',
  static: 'statisches',
  cable: 'Kabelzug-',
  'smith machine': 'Multipresse-',
  'ez bar': 'SZ-Hantel-',
  'ez-bar': 'SZ-Hantel-',
  'straight leg': 'gestrecktes',
  'stiff leg': 'gestrecktes',
  'stiff-legged': 'gestrecktes',
  'bent knee': 'gebeugtes',
  wide_grip: 'Weitgriff-',
  hanging_: '',
  suspended: 'aufgehängtes',
  eccentric: 'exzentrisches',
  tempo: 'Tempo-',
  deficit: 'Defizit-',
  elevated: 'erhöhtes',
  banded: 'Band-',
  weighted_: '',
  'behind the neck': 'Nackendrücken-',
  'behind neck': 'Nacken-',

  // Body parts, so a suffixed name like "Hamstring-SMR" composes rather than
  // going to review for a word the reader already understands.
  hamstring: 'Hamstring',
  hamstrings: 'Hamstring',
  quadriceps: 'Quadrizeps',
  quads: 'Quadrizeps',
  calf: 'Waden',
  calves: 'Waden',
  glute: 'Gluteus',
  glutes: 'Gluteus',
  piriformis: 'Piriformis',
  peroneals: 'Peronaeus',
  rhomboids: 'Rhomboiden',
  'latissimus dorsi': 'Latissimus',
  lats: 'Latissimus',
  'iliotibial tract': 'Iliotibialband',
  'lower back': 'unterer Rücken',
  'upper back': 'oberer Rücken',
  adductor: 'Adduktoren',
  adductors: 'Adduktoren',
  abductor: 'Abduktoren',
  brachialis: 'Brachialis',
  'medicine ball': 'Medizinball-',
  'double leg': 'beidbeiniges',
  'single response': '',
  'multiple response': '',
  'two-arm': 'zweiarmiges',
  'one-knee': 'einknieiges',
};

/**
 * Base movements — the professional German term for each.
 *
 * The list a coach would recognise. Where German simply uses the English word
 * (Lunge, Plank, Burpee, Clean), that is recorded as such rather than forced
 * into a translation nobody says.
 */
export const BASE_MOVEMENTS: Readonly<Record<string, string>> = {
  // Press and push
  'bench press': 'Bankdrücken',
  'chest press': 'Brustdrücken',
  press: 'Drücken',
  'shoulder press': 'Schulterdrücken',
  'overhead press': 'Schulterdrücken',
  'military press': 'Nackendrücken',
  'push press': 'Push Press',
  'push-up': 'Liegestütz',
  pushup: 'Liegestütz',
  'push up': 'Liegestütz',
  dip: 'Dip',
  dips: 'Dips',
  fly: 'Fliegende',
  flye: 'Fliegende',
  flyes: 'Fliegende',
  pullover: 'Überzüge',

  // Pull
  row: 'Rudern',
  'pull-up': 'Klimmzug',
  pullup: 'Klimmzug',
  'pull up': 'Klimmzug',
  'chin-up': 'Klimmzug im Kammgriff',
  chinup: 'Klimmzug im Kammgriff',
  pulldown: 'Latzug',
  'lat pulldown': 'Latzug',
  'pull-down': 'Latzug',
  shrug: 'Schulterheben',
  'face pull': 'Face Pull',
  // Lower case, because the capital only belongs to it when it stands first:
  // "Aufrechtes Rudern" alone, "Stehendes aufrechtes Rudern" with a modifier.
  // The title-casing at the end of the composition supplies the capital.
  'upright row': 'aufrechtes Rudern',
  curl: 'Curl',
  'hammer curl': 'Hammercurl',
  'preacher curl': 'Scott-Curl',
  'concentration curl': 'Konzentrationscurl',

  // Triceps
  extension: 'Strecken',
  'triceps extension': 'Trizepsdrücken',
  'tricep extension': 'Trizepsdrücken',
  pushdown: 'Trizepsdrücken am Kabel',
  kickback: 'Kickback',
  'skull crusher': 'Stirndrücken',
  'french press': 'Stirndrücken',

  // Squat family
  squat: 'Kniebeuge',
  'split squat': 'Split Squat',
  lunge: 'Ausfallschritt',
  lunges: 'Ausfallschritte',
  'step-up': 'Step-up',
  'step up': 'Step-up',
  'leg press': 'Beinpresse',
  'leg extension': 'Beinstrecken',
  'leg curl': 'Beinbeugen',
  'calf raise': 'Wadenheben',
  'hip thrust': 'Hüftheben',
  'glute bridge': 'Glute Bridge',
  'good morning': 'Good Morning',

  // Hinge
  deadlift: 'Kreuzheben',
  swing: 'Swing',
  'back extension': 'Rückenstrecken',
  hyperextension: 'Hyperextension',
  'pull-through': 'Pull Through',

  // Core
  crunch: 'Crunch',
  crunches: 'Crunches',
  'sit-up': 'Sit-up',
  situp: 'Sit-up',
  'sit up': 'Sit-up',
  plank: 'Unterarmstütz',
  'side plank': 'Seitstütz',
  'leg raise': 'Beinheben',
  'knee raise': 'Knieheben',
  'russian twist': 'Russian Twist',
  'ab rollout': 'Ab Rollout',
  rollout: 'Rollout',
  'dead bug': 'Dead Bug',
  'bird dog': 'Bird Dog',
  'pallof press': 'Pallof Press',
  'wood chop': 'Holzfäller',
  woodchop: 'Holzfäller',
  'hollow hold': 'Hollow Hold',
  'mountain climber': 'Mountain Climber',

  // Olympic
  clean: 'Umsetzen',
  'power clean': 'Power Clean',
  'hang clean': 'Hang Clean',
  'clean and jerk': 'Umsetzen und Stoßen',
  'clean and press': 'Umsetzen und Drücken',
  snatch: 'Reißen',
  'power snatch': 'Power Snatch',
  'hang snatch': 'Hang Snatch',
  jerk: 'Stoßen',
  'high pull': 'High Pull',

  // Plyometrics
  'box jump': 'Kastensprung',
  'jump squat': 'Sprungkniebeuge',
  'broad jump': 'Standweitsprung',
  'depth jump': 'Tiefsprung',
  'tuck jump': 'Hocksprung',
  bound: 'Bound',
  bounds: 'Bounds',
  hop: 'Hop',
  hops: 'Hops',
  burpee: 'Burpee',
  burpees: 'Burpees',
  'jumping jack': 'Hampelmann',
  'medicine ball throw': 'Medizinballwurf',
  slam: 'Slam',

  // Mobility and stretching
  stretch: 'Dehnung',
  'hip flexor stretch': 'Hüftbeugerdehnung',
  'hamstring stretch': 'Hamstring-Dehnung',
  'shoulder stretch': 'Schulterdehnung',
  'chest stretch': 'Brustdehnung',
  'calf stretch': 'Wadendehnung',
  "child's pose": 'Kindhaltung',
  'cat stretch': 'Katzenbuckel',
  'cat-cow': 'Katze-Kuh',
  'thread the needle': 'Thread the Needle',
  'world greatest stretch': 'World’s Greatest Stretch',
  rotation: 'Rotation',
  circle: 'Kreisen',
  circles: 'Kreisen',
  'arm circle': 'Armkreisen',
  'leg swing': 'Beinpendel',
  'foam roll': 'Faszienrollen',

  // Carries and endurance
  carry: 'Carry',
  "farmer's walk": 'Farmer’s Walk',
  run: 'Laufen',
  running: 'Laufen',
  sprint: 'Sprint',
  row_machine: 'Rudern am Ergometer',
  cycling: 'Radfahren',
  'jump rope': 'Seilspringen',
  'rope jumping': 'Seilspringen',
  skipping: 'Seilspringen',
  'battle rope': 'Battle Rope',
  'sled push': 'Schlittenschieben',
  'sled drag': 'Schlittenziehen',

  // ── Added after measuring the gap ───────────────────────────────────────────
  // 565 of 583 wrkout-sourced candidates went to review for want of a term
  // rather than for want of data. These are the movements that gap named.

  // Shoulder and arm raises — German distinguishes them by direction.
  'lateral raise': 'Seitheben',
  'side lateral': 'Seitheben',
  'front raise': 'Frontheben',
  'rear delt raise': 'Reverse Flys',
  'rear delt fly': 'Reverse Flys',
  'deltoid raise': 'Deltaheben',
  'shoulder raise': 'Schulterheben',
  raise: 'Heben',
  scaption: 'Scaption',
  'pull apart': 'Band Pull Apart',
  'around the world': 'Around the World',
  butterfly: 'Butterfly',
  'reverse butterfly': 'Reverse Butterfly',
  crossover: 'Crossover',
  'cable crossover': 'Kabelzug-Crossover',
  'iron cross': 'Iron Cross',
  'external rotation': 'Außenrotation',
  'internal rotation': 'Innenrotation',

  // Hip and leg
  adduction: 'Adduktion',
  abduction: 'Abduktion',
  'hip adduction': 'Hüftadduktion',
  'hip abduction': 'Hüftabduktion',
  'glute ham raise': 'Glute-Ham-Raise',
  'nordic curl': 'Nordic Curl',
  'wall sit': 'Wandsitz',
  bridge: 'Brücke',
  thrust: 'Thrust',
  'frog press': 'Froschpresse',
  clamshell: 'Clamshell',
  'fire hydrant': 'Fire Hydrant',
  'donkey kick': 'Donkey Kick',

  // Core
  'side bend': 'Seitneigen',
  superman: 'Superman',
  'flutter kick': 'Flutterkicks',
  'scissor kick': 'Scherenschlag',
  wiper: 'Scheibenwischer',
  'windshield wiper': 'Scheibenwischer',
  'v-up': 'V-Up',
  'toe touch': 'Toe Touch',
  'toes to bar': 'Toes to Bar',
  'knee tuck': 'Knee Tuck',
  'reverse crunch': 'Reverser Crunch',
  'cable crunch': 'Kabelzug-Crunch',
  twist: 'Drehung',
  windmill: 'Windmill',
  'turkish get-up': 'Turkish Get-up',
  'get-up': 'Get-up',

  // Calisthenics
  'muscle up': 'Muscle-up',
  'muscle-up': 'Muscle-up',
  'inverted row': 'Australian Pull-up',
  'pistol squat': 'Pistol Squat',
  'l-sit': 'L-Sit',
  'front lever': 'Front Lever',
  'back lever': 'Back Lever',
  'handstand push-up': 'Handstand-Liegestütz',
  handstand: 'Handstand',
  hang: 'Hängen',
  hold: 'Halten',
  'bear crawl': 'Bärengang',
  'crab walk': 'Krebsgang',

  // Conditioning
  bike: 'Radfahren',
  'recumbent bike': 'Liegerad',
  'stationary bike': 'Ergometer',
  treadmill: 'Laufband',
  elliptical: 'Crosstrainer',
  'stair climber': 'Stepper',
  jog: 'Joggen',
  jogging: 'Joggen',
  walk: 'Gehen',
  walking: 'Gehen',
  climber: 'Climber',
  rower: 'Rudergerät',
  'rope climb': 'Seilklettern',

  // Mobility
  'hip circle': 'Hüftkreisen',
  'shoulder circle': 'Schulterkreisen',
  'ankle mobility': 'Sprunggelenksmobilisation',
  'thoracic rotation': 'Brustwirbelrotation',
  'pigeon pose': 'Taubenhaltung',
  'downward dog': 'Herabschauender Hund',
  'cobra stretch': 'Kobra',
  'butterfly stretch': 'Schmetterlingsdehnung',
  'quad stretch': 'Quadrizepsdehnung',
  'groin stretch': 'Adduktorendehnung',
  'lat stretch': 'Latissimusdehnung',
  'neck stretch': 'Nackendehnung',
  'wrist stretch': 'Handgelenksdehnung',
  'ankle circle': 'Fußkreisen',

  // Self-myofascial release. The sources write it as a suffix — "Hamstring-SMR"
  // — and it is foam rolling, which our equipment list already carries.
  smr: 'Faszienrollen',
  'foam rolling': 'Faszienrollen',

  // Medicine-ball throws: a plyometric family the sources name in many ways.
  throw: 'Wurf',
  'overhead throw': 'Überkopfwurf',
  'chest pass': 'Brustpass',
  'chest throw': 'Brustwurf',
  'scoop throw': 'Scoop Throw',
  'chest push': 'Bruststoß',
  pass: 'Pass',

  // Running and jumping drills that are exercises in their own right.
  'butt kick': 'Anfersen',
  skip: 'Skipping',
  'high knee': 'Kniehebelauf',
  leap: 'Sprung',
  groiner: 'Groiner',
  squeeze: 'Anspannung',
  'hip flexor': 'Hüftbeuger',
  'knee to chest': 'Knie zur Brust',
  'ball hug': 'Ball-Umarmung',
};

/** Words that carry no meaning for a name and are dropped before matching. */
export const NOISE_WORDS: readonly string[] = [
  'the',
  'a',
  'with',
  'on',
  'to',
  'and',
  'or',
  'exercise',
  'version',
  'variation',
];

export interface GermanName {
  readonly name: string;
  /** The base movement the name was built from. */
  readonly base: string;
  /** Terms no table knew — empty when the name is fully composed. */
  readonly unknown: readonly string[];
  /** Adjectives that could not be declined because the gender is unrecorded. */
  readonly undeclined: readonly string[];
}

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The tables are keyed the way they read; lookups happen on normalised text.
 *
 * Both sides are normalised through the same function, because they were not:
 * `normalise` strips hyphens, so every hyphenated key — `chin-up`, `pull-up`,
 * `step-up` — could never match, and 676 candidates went to review for want of
 * a term the table already held.
 */
function normalisedTable(table: Readonly<Record<string, string>>): Map<string, string> {
  return new Map(Object.entries(table).map(([key, value]) => [normalise(key), value]));
}

const BASE_TABLE = normalisedTable(BASE_MOVEMENTS);
const MODIFIER_TABLE = normalisedTable(MODIFIER_TERMS);
const EQUIPMENT_TABLE = normalisedTable(EQUIPMENT_TERMS);
const ADJECTIVE_TABLE = normalisedTable(ADJECTIVE_STEMS);
const GENDER_TABLE = new Map(
  Object.entries(BASE_GENDER).map(([key, value]) => [normalise(key), value]),
);

const BASE_KEYS = [...BASE_TABLE.keys()].sort((a, b) => b.length - a.length);

/** English plurals the sources use freely: "Crunches", "Mountain Climbers". */
function singular(word: string): string {
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('es') && !word.endsWith('ses')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);

  return word;
}

function lookUp(table: Map<string, string>, term: string): string | undefined {
  return table.get(term) ?? table.get(singular(term));
}

/**
 * Composes a German name from a canonical English one.
 *
 * The base movement is found first, and it is found **longest-first** — so
 * "romanian deadlift" wins over "deadlift", and "bench press" over "press".
 * Whatever precedes it is read as equipment and modifiers.
 *
 * Returns the unknown terms rather than dropping them: a name assembled from
 * half the words is worse than one flagged for review.
 */
export function composeGermanName(canonicalName: string): GermanName {
  const text = normalise(canonicalName);

  const singularText = text
    .split(' ')
    .map((word) => singular(word))
    .join(' ');

  const matches = (haystack: string, key: string) =>
    haystack === key ||
    haystack.endsWith(` ${key}`) ||
    haystack.startsWith(`${key} `) ||
    haystack.includes(` ${key} `);

  const base =
    BASE_KEYS.find((key) => matches(text, key)) ??
    BASE_KEYS.find((key) => matches(singularText, key));

  if (base === undefined) {
    return { name: '', base: '', unknown: [canonicalName], undeclined: [] };
  }

  const gender = GENDER_TABLE.get(base);

  const remainder = (matches(text, base) ? text : singularText)
    .replace(base, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = remainder.split(' ').filter((word) => word !== '' && !NOISE_WORDS.includes(word));

  const prefixes: string[] = [];
  const suffixes: string[] = [];
  const unknown: string[] = [];
  const undeclined: string[] = [];
  let index = 0;

  // One implement or several: "One-Arm Dumbbell Row" holds one dumbbell.
  const single = /\b(one|single)[ -]?(arm|leg|handed|sided)?\b/.test(text);

  /**
   * Equipment goes behind the movement; anything else stays in front.
   *
   * Returns whether the term was placed, so the caller can fall through to the
   * prefix path for terms this table does not cover.
   */
  const place = (term: string): boolean => {
    const phrase = EQUIPMENT_PHRASES[term];
    if (phrase === undefined) return false;

    const chosen = single ? phrase.one : phrase.many;
    if (!suffixes.includes(chosen)) suffixes.push(chosen);

    return true;
  };

  /**
   * An adjective takes its ending from the noun it stands in front of.
   *
   * Where the gender is unrecorded the stem is **not** given an ending — a
   * guessed one is a grammatical error that reads as deliberate. It is reported
   * instead, and the caller marks the name for review.
   */
  const adjective = (stem: string): string => {
    if (gender === undefined) {
      undeclined.push(stem);

      return stem;
    }

    return decline(stem, gender);
  };

  while (index < words.length) {
    // Two-word terms first: "one arm", "close grip", "medicine ball".
    const pair = index + 1 < words.length ? `${words[index]!} ${words[index + 1]!}` : '';

    const pairAdjective = pair === '' ? undefined : lookUp(ADJECTIVE_TABLE, pair);
    const pairEquipment = pair === '' ? undefined : lookUp(EQUIPMENT_TABLE, pair);
    const pairModifier = pair === '' ? undefined : lookUp(MODIFIER_TABLE, pair);

    if (pairAdjective !== undefined) {
      prefixes.push(adjective(pairAdjective));
      index += 2;
      continue;
    }

    if (pairEquipment !== undefined || pairModifier !== undefined) {
      const term = pairEquipment ?? pairModifier ?? '';
      if (term !== '' && !(pairEquipment !== undefined && place(term))) prefixes.push(term);
      index += 2;
      continue;
    }

    const word = words[index]!;
    const adjectiveStem = lookUp(ADJECTIVE_TABLE, word);
    const equipment = lookUp(EQUIPMENT_TABLE, word);
    const modifier = lookUp(MODIFIER_TABLE, word);

    // Adjectives are consulted first: several words appear in both tables, and
    // the declined form is the one a name should carry.
    if (adjectiveStem !== undefined) {
      prefixes.push(adjective(adjectiveStem));
    } else if (equipment !== undefined) {
      if (equipment !== '' && !place(equipment)) prefixes.push(equipment);
    } else if (modifier !== undefined) {
      if (modifier !== '') prefixes.push(modifier);
    } else {
      unknown.push(word);
    }

    index += 1;
  }

  const german = BASE_TABLE.get(base) ?? '';

  // A prefix ending in a letter joins the noun with a hyphen — German writes
  // "Langhantel-Bankdrücken", not "Langhantelbankdrücken", when the compound
  // would otherwise be hard to read. A prefix that is an adjective stays
  // separate.
  const name = prefixes.reduceRight((suffix, prefix) => {
    if (prefix.endsWith('-')) return `${prefix}${suffix}`;
    if (/^[a-zäöüß]/.test(prefix)) return `${prefix} ${suffix}`;

    return `${prefix}-${suffix}`;
  }, german);

  // An exercise name is a title, so its first word is capitalised — which is
  // also what makes a leading adjective correct: "Einarmiger Klimmzug", not
  // "einarmiger Klimmzug" standing alone in a list.
  const titled = name === '' ? '' : name.charAt(0).toUpperCase() + name.slice(1);
  const full = [titled, ...suffixes].join(' ').trim();

  return { name: full, base, unknown, undeclined };
}
