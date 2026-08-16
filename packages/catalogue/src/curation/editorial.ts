import type { CuratedExercise } from './select';

/**
 * Exercises written here, because no licence-clear source carries them.
 *
 * ## Why this file exists
 *
 * The research pool reaches its limit in five places. Endurance is the starkest:
 * the material exists almost only in wger, whose text is CC-BY-SA and therefore
 * not ours to ship. Stability and calisthenics are barely categorised by any
 * source. Olympic derivatives and plyometric drills are named inconsistently.
 * Rather than pad the catalogue with rows we cannot stand behind, these are
 * authored.
 *
 * ## What "authored" means
 *
 * Every name, description and instruction below is written for this catalogue.
 * **No wger prose is copied**, paraphrased or translated. Where a movement also
 * appears in wrkout, the editorial entry is not created — the public-domain row
 * is used instead, and the curation run drops the duplicate.
 *
 * `source: 'editorial'` is a registered provenance value with its own licence
 * (see `@apex/domain` → `exercises/sources`), so "where did this text come
 * from" stays answerable for every row in the catalogue.
 *
 * ## Instructions are cues, not prose
 *
 * Two to four steps, in the imperative, describing set-up and execution. They
 * are deliberately short: a coach needs the shape of the movement, not an
 * essay, and a long text is a translation liability.
 */

type Entry = Omit<
  CuratedExercise,
  'provenance' | 'movementPattern' | 'review' | 'conflicts' | 'media'
>;

const editorial = (
  key: string,
  name: string,
  canonicalName: string,
  category: string,
  difficulty: string,
  primaryMuscles: string[],
  fields: {
    secondary?: string[];
    equipment?: string[];
    force?: string | null;
    mechanic?: string | null;
    unilateral?: boolean;
    description: string;
    instructions: string[];
  },
): Entry => ({
  key,
  name,
  canonicalName,
  category,
  difficulty,
  primaryMuscles,
  secondaryMuscles: fields.secondary ?? [],
  equipment: fields.equipment ?? [],
  forceType: fields.force ?? null,
  mechanic: fields.mechanic ?? null,
  unilateral: fields.unilateral ?? false,
  description: fields.description,
  instructions: fields.instructions,
  source: 'editorial',
  sourceId: key,
  license: 'Proprietary — authored for Apex OS',
});

// ── Stability ────────────────────────────────────────────────────────────────
// Resisting a direction rather than producing one. `forceType` is `static`
// where the position is held; `mechanic` stays null — a plank is neither
// compound nor isolation in any useful sense.

const stability: Entry[] = [
  editorial('forearm_plank', 'Unterarmstütz', 'Forearm Plank', 'stability', 'beginner', ['abs'], {
    secondary: ['obliques', 'shoulders', 'glutes'],
    force: 'static',
    description: 'Rumpfstabilität gegen Streckung, gehalten im Unterarmstütz.',
    instructions: [
      'Unterarme schulterbreit auflegen, Ellbogen unter den Schultern.',
      'Becken leicht aufrichten, Gesäß und Bauch anspannen.',
      'Kopf, Brustkorb und Becken in einer Linie halten, ruhig weiteratmen.',
    ],
  }),
  editorial('side_plank', 'Seitstütz', 'Side Plank', 'stability', 'beginner', ['obliques'], {
    secondary: ['abs', 'glutes', 'shoulders'],
    force: 'static',
    unilateral: true,
    description: 'Stabilität gegen seitliche Neigung, einseitig gehalten.',
    instructions: [
      'Auf die Seite legen, Ellbogen unter der Schulter, Beine gestreckt.',
      'Becken anheben, bis Schulter, Hüfte und Fuß eine Linie bilden.',
      'Position halten, ohne die Hüfte absinken zu lassen.',
    ],
  }),
  editorial(
    'copenhagen_plank',
    'Copenhagen-Seitstütz',
    'Copenhagen Plank',
    'stability',
    'advanced',
    ['adductors'],
    {
      secondary: ['obliques', 'abs'],
      equipment: ['bench'],
      force: 'static',
      unilateral: true,
      description: 'Seitstütz mit aufgelegtem oberem Bein, belastet die Adduktoren.',
      instructions: [
        'Im Seitstütz das obere Bein mit der Innenseite auf eine Bank legen.',
        'Becken anheben, das untere Bein frei oder angewinkelt halten.',
        'Position halten, Hüfte nicht nach hinten kippen lassen.',
      ],
    },
  ),
  editorial('bird_dog', 'Bird Dog', 'Bird Dog', 'stability', 'beginner', ['lower_back'], {
    secondary: ['glutes', 'abs', 'shoulders'],
    equipment: ['gym_mat'],
    force: 'static',
    unilateral: true,
    description: 'Diagonale Streckung im Vierfüßlerstand, kontrolliert gegen Rotation.',
    instructions: [
      'Vierfüßlerstand, Hände unter den Schultern, Knie unter der Hüfte.',
      'Gegengleich Arm und Bein strecken, Becken bleibt waagerecht.',
      'Kurz halten, kontrolliert zurückführen, Seite wechseln.',
    ],
  }),
  editorial('dead_bug', 'Dead Bug', 'Dead Bug', 'stability', 'beginner', ['abs'], {
    secondary: ['obliques'],
    equipment: ['gym_mat'],
    force: 'static',
    description: 'Rumpfkontrolle in Rückenlage gegen Hohlkreuzbildung.',
    instructions: [
      'In Rückenlage Arme senkrecht, Hüfte und Knie im rechten Winkel.',
      'Lendenwirbelsäule flach an den Boden drücken.',
      'Gegengleich Arm und Bein absenken, ohne den Rücken abheben zu lassen.',
    ],
  }),
  editorial(
    'pallof_press',
    'Pallof Press',
    'Pallof Press',
    'stability',
    'intermediate',
    ['obliques'],
    {
      secondary: ['abs', 'shoulders'],
      equipment: ['cable'],
      force: 'static',
      unilateral: true,
      description: 'Widerstand gegen Rotation, im Stand gegen seitlichen Zug.',
      instructions: [
        'Seitlich zum Kabelzug stehen, Griff auf Brusthöhe vor dem Körper.',
        'Arme nach vorn strecken, ohne dass der Oberkörper sich dreht.',
        'Kontrolliert zurückführen, Rumpf bleibt durchgehend angespannt.',
      ],
    },
  ),
  editorial(
    'half_kneeling_pallof_press',
    'Pallof Press im Kniestand',
    'Half-Kneeling Pallof Press',
    'stability',
    'intermediate',
    ['obliques'],
    {
      secondary: ['abs', 'glutes'],
      equipment: ['cable'],
      force: 'static',
      unilateral: true,
      description: 'Anti-Rotation im halben Kniestand, nimmt die Beine aus der Gleichung.',
      instructions: [
        'Halber Kniestand seitlich zum Kabelzug, hinteres Knie unter der Hüfte.',
        'Griff auf Brusthöhe, Arme nach vorn strecken.',
        'Becken bleibt gerade, kein Ausweichen zur Seite.',
      ],
    },
  ),
  editorial(
    'suitcase_carry',
    'Koffertragen',
    'Suitcase Carry',
    'stability',
    'beginner',
    ['obliques'],
    {
      secondary: ['forearms', 'traps', 'abs'],
      equipment: ['kettlebell'],
      force: 'static',
      unilateral: true,
      description: 'Einseitiges Tragen gegen seitliche Neigung.',
      instructions: [
        'Ein Gewicht neben dem Körper aufnehmen, Schultern gleich hoch.',
        'Aufrecht und ruhig gehen, ohne zur Seite zu kippen.',
        'Nach der Strecke Seite wechseln.',
      ],
    },
  ),
  editorial(
    'farmers_carry',
    'Farmer’s Walk',
    'Farmer’s Carry',
    'stability',
    'beginner',
    ['forearms'],
    {
      secondary: ['traps', 'abs', 'quads'],
      equipment: ['dumbbell'],
      force: 'static',
      description: 'Beidseitiges Tragen für Griffkraft und Rumpfstabilität.',
      instructions: [
        'Zwei Gewichte neben dem Körper aufnehmen, Brust aufrichten.',
        'Kontrolliert gehen, Schultern hinten, Blick nach vorn.',
        'Griff nicht abrollen lassen; Strecke oder Zeit vorgeben.',
      ],
    },
  ),
  editorial(
    'overhead_carry',
    'Überkopftragen',
    'Overhead Carry',
    'stability',
    'intermediate',
    ['shoulders'],
    {
      secondary: ['abs', 'traps'],
      equipment: ['kettlebell'],
      force: 'static',
      unilateral: true,
      description: 'Tragen mit gestrecktem Arm über Kopf, fordert Schulterstabilität.',
      instructions: [
        'Gewicht über Kopf drücken, Ellbogen durchgestreckt.',
        'Rippenbogen geschlossen halten, nicht ins Hohlkreuz gehen.',
        'Ruhig gehen, Arm bleibt senkrecht.',
      ],
    },
  ),
  editorial('hollow_hold', 'Hollow Hold', 'Hollow Hold', 'stability', 'intermediate', ['abs'], {
    secondary: ['obliques'],
    equipment: ['gym_mat'],
    force: 'static',
    description: 'Gehaltene Hohlkörperposition gegen Streckung.',
    instructions: [
      'In Rückenlage Arme und Beine strecken und leicht anheben.',
      'Lendenwirbelsäule bleibt am Boden, Rippen geschlossen.',
      'Position halten; bei Hohlkreuz Arme oder Beine höher nehmen.',
    ],
  }),
  editorial('superman_hold', 'Superman', 'Superman Hold', 'stability', 'beginner', ['lower_back'], {
    secondary: ['glutes', 'upper_back'],
    equipment: ['gym_mat'],
    force: 'static',
    description: 'Gehaltene Streckung in Bauchlage für die hintere Kette.',
    instructions: [
      'In Bauchlage Arme nach vorn strecken.',
      'Arme, Brust und Beine gleichzeitig anheben.',
      'Position halten, Nacken lang lassen.',
    ],
  }),
  editorial(
    'glute_bridge_hold',
    'Glute Bridge im Halt',
    'Glute Bridge Hold',
    'stability',
    'beginner',
    ['glutes'],
    {
      secondary: ['hamstrings', 'abs'],
      equipment: ['gym_mat'],
      force: 'static',
      description: 'Gehaltene Hüftstreckung in Rückenlage.',
      instructions: [
        'In Rückenlage Fersen hüftbreit aufsetzen, Knie gebeugt.',
        'Becken anheben, bis Knie, Hüfte und Schulter eine Linie bilden.',
        'Gesäß aktiv anspannen und die Position halten.',
      ],
    },
  ),
  editorial(
    'single_leg_stance',
    'Einbeinstand',
    'Single-Leg Stance',
    'stability',
    'beginner',
    ['glutes'],
    {
      secondary: ['calves', 'abs'],
      force: 'static',
      unilateral: true,
      description: 'Grundlegende einbeinige Standstabilität.',
      instructions: [
        'Auf einem Bein stehen, das andere Knie hüfthoch anheben.',
        'Becken waagerecht halten, Standbein leicht gebeugt.',
        'Position halten; Augen schließen erhöht die Anforderung.',
      ],
    },
  ),
  editorial('wall_sit', 'Wandsitz', 'Wall Sit', 'stability', 'beginner', ['quads'], {
    secondary: ['glutes'],
    force: 'static',
    description: 'Isometrische Kniebeugehaltung an der Wand.',
    instructions: [
      'Mit dem Rücken zur Wand abrutschen, bis Knie und Hüfte rechtwinklig sind.',
      'Gewicht auf die ganzen Füße verteilen.',
      'Position halten, Knie über den Fußspitzen.',
    ],
  }),
  editorial(
    'bear_crawl_hold',
    'Bärenstand',
    'Bear Crawl Hold',
    'stability',
    'intermediate',
    ['abs'],
    {
      secondary: ['shoulders', 'quads', 'obliques'],
      equipment: ['gym_mat'],
      force: 'static',
      description: 'Vierfüßlerstand mit angehobenen Knien, hohe Rumpfspannung.',
      instructions: [
        'Vierfüßlerstand, Zehen aufgestellt.',
        'Knie eine Handbreit vom Boden abheben.',
        'Rücken flach halten, Position ruhig halten.',
      ],
    },
  ),
  editorial(
    'single_leg_rdl_balance',
    'Einbeiniges Standwaage-Kreuzheben',
    'Single-Leg RDL (Balance)',
    'stability',
    'intermediate',
    ['hamstrings'],
    {
      secondary: ['glutes', 'lower_back'],
      force: 'static',
      unilateral: true,
      description: 'Hüftbeuge auf einem Bein ohne Zusatzlast, für Balance und Kontrolle.',
      instructions: [
        'Auf einem Bein stehen, Standbein leicht gebeugt.',
        'Oberkörper nach vorn neigen, freies Bein nach hinten strecken.',
        'Becken waagerecht halten, kontrolliert aufrichten.',
      ],
    },
  ),
];

// ── Calisthenics ─────────────────────────────────────────────────────────────

const calisthenics: Entry[] = [
  editorial(
    'incline_push_up',
    'Liegestütz erhöht',
    'Incline Push-Up',
    'calisthenics',
    'beginner',
    ['chest'],
    {
      secondary: ['triceps', 'shoulders'],
      equipment: ['bench'],
      force: 'push',
      mechanic: 'compound',
      description: 'Liegestütz mit erhöhten Händen, geringere Last als am Boden.',
      instructions: [
        'Hände schulterbreit auf einer Bank oder Erhöhung aufsetzen.',
        'Körper in einer Linie halten, Brust zur Bank senken.',
        'Kontrolliert nach oben drücken.',
      ],
    },
  ),
  editorial(
    'decline_push_up',
    'Liegestütz mit erhöhten Füßen',
    'Decline Push-Up',
    'calisthenics',
    'intermediate',
    ['chest'],
    {
      secondary: ['shoulders', 'triceps'],
      equipment: ['bench'],
      force: 'push',
      mechanic: 'compound',
      description:
        'Liegestütz mit erhöhten Füßen, verlagert Last auf die obere Brust und Schulter.',
      instructions: [
        'Füße auf eine Bank legen, Hände schulterbreit am Boden.',
        'Körper gestreckt halten, Brust zum Boden senken.',
        'Kontrolliert nach oben drücken.',
      ],
    },
  ),
  editorial(
    'diamond_push_up',
    'Diamant-Liegestütz',
    'Diamond Push-Up',
    'calisthenics',
    'intermediate',
    ['triceps'],
    {
      secondary: ['chest', 'shoulders'],
      force: 'push',
      mechanic: 'compound',
      description: 'Liegestütz mit eng zusammenstehenden Händen, stärkere Trizepsbeteiligung.',
      instructions: [
        'Hände unter der Brust zusammensetzen, Daumen und Zeigefinger berühren sich.',
        'Ellbogen eng am Körper führen.',
        'Brust zu den Händen senken und zurückdrücken.',
      ],
    },
  ),
  editorial(
    'pike_push_up',
    'Pike-Liegestütz',
    'Pike Push-Up',
    'calisthenics',
    'intermediate',
    ['shoulders'],
    {
      secondary: ['triceps'],
      force: 'push',
      mechanic: 'compound',
      description: 'Liegestütz in der Hüftbeuge, Vorstufe zum Handstand-Drücken.',
      instructions: [
        'Aus dem Liegestütz die Hüfte hoch schieben, Körper bildet ein umgekehrtes V.',
        'Kopf zwischen den Händen zum Boden senken.',
        'Über die Schultern zurückdrücken.',
      ],
    },
  ),
  editorial(
    'wall_handstand_push_up',
    'Handstand-Liegestütz an der Wand',
    'Wall Handstand Push-Up',
    'calisthenics',
    'advanced',
    ['shoulders'],
    {
      secondary: ['triceps', 'traps'],
      force: 'push',
      mechanic: 'compound',
      description: 'Vertikales Drücken im Handstand mit Wandkontakt.',
      instructions: [
        'Im Handstand an der Wand abstützen, Hände schulterbreit.',
        'Kontrolliert absenken, bis der Kopf knapp über dem Boden ist.',
        'Kraftvoll nach oben drücken, Rumpf bleibt gespannt.',
      ],
    },
  ),
  editorial(
    'negative_pull_up',
    'Negativer Klimmzug',
    'Negative Pull-Up',
    'calisthenics',
    'beginner',
    ['lats'],
    {
      secondary: ['biceps', 'upper_back'],
      equipment: ['pull_up_bar'],
      force: 'pull',
      mechanic: 'compound',
      description: 'Nur die absenkende Phase des Klimmzugs, als Vorstufe.',
      instructions: [
        'Von einer Erhöhung in die obere Klimmzugposition steigen.',
        'So langsam wie möglich absenken, bis die Arme gestreckt sind.',
        'Erneut aufsteigen statt hochzuziehen.',
      ],
    },
  ),
  editorial(
    'australian_pull_up',
    'Australian Pull-up',
    'Australian Pull-Up',
    'calisthenics',
    'beginner',
    ['upper_back'],
    {
      secondary: ['lats', 'biceps'],
      equipment: ['pull_up_bar'],
      force: 'pull',
      mechanic: 'compound',
      description: 'Horizontales Ziehen unter einer tief eingestellten Stange.',
      instructions: [
        'Unter eine hüfthohe Stange legen, Fersen aufsetzen.',
        'Körper gestreckt halten und die Brust zur Stange ziehen.',
        'Kontrolliert absenken.',
      ],
    },
  ),
  editorial('bench_dip', 'Bankdip', 'Bench Dip', 'calisthenics', 'beginner', ['triceps'], {
    secondary: ['shoulders', 'chest'],
    equipment: ['bench'],
    force: 'push',
    mechanic: 'compound',
    description: 'Trizepsdip mit den Händen auf einer Bank.',
    instructions: [
      'Hände hinter dem Körper auf die Bankkante setzen, Beine nach vorn.',
      'Ellbogen nach hinten beugen und absenken.',
      'Über die Trizeps zurückdrücken.',
    ],
  }),
  editorial(
    'air_squat',
    'Körpergewichts-Kniebeuge',
    'Air Squat',
    'calisthenics',
    'beginner',
    ['quads'],
    {
      secondary: ['glutes', 'hamstrings'],
      force: 'push',
      mechanic: 'compound',
      description: 'Kniebeuge ohne Zusatzlast, Grundmuster für alles Weitere.',
      instructions: [
        'Schulterbreiter Stand, Füße leicht nach außen.',
        'Hüfte nach hinten und unten führen, Knie folgen den Zehen.',
        'Bis mindestens zur Parallele beugen und aufrichten.',
      ],
    },
  ),
  editorial('pistol_squat', 'Pistol Squat', 'Pistol Squat', 'calisthenics', 'advanced', ['quads'], {
    secondary: ['glutes', 'hamstrings', 'abs'],
    force: 'push',
    mechanic: 'compound',
    unilateral: true,
    description: 'Einbeinige Kniebeuge bis in die tiefe Hocke.',
    instructions: [
      'Auf einem Bein stehen, das andere gestreckt nach vorn halten.',
      'Kontrolliert bis in die tiefe Hocke absenken.',
      'Über das Standbein wieder aufrichten.',
    ],
  }),
  editorial(
    'bodyweight_lunge',
    'Ausfallschritt ohne Gewicht',
    'Bodyweight Lunge',
    'calisthenics',
    'beginner',
    ['quads'],
    {
      secondary: ['glutes', 'hamstrings'],
      force: 'push',
      mechanic: 'compound',
      unilateral: true,
      description: 'Ausfallschritt ohne Zusatzlast.',
      instructions: [
        'Aus dem Stand einen großen Schritt nach vorn setzen.',
        'Hinteres Knie Richtung Boden senken, Oberkörper aufrecht.',
        'Über das vordere Bein zurück in den Stand drücken.',
      ],
    },
  ),
  editorial(
    'hanging_knee_raise',
    'Hängendes Knieheben',
    'Hanging Knee Raise',
    'calisthenics',
    'beginner',
    ['abs'],
    {
      secondary: ['obliques', 'forearms'],
      equipment: ['pull_up_bar'],
      force: 'pull',
      mechanic: 'isolation',
      description: 'Hüftbeugung im Hang, Vorstufe zum Beinheben.',
      instructions: [
        'Frei an der Stange hängen, Schultern aktiv.',
        'Knie kontrolliert zur Brust ziehen, Becken kippt mit.',
        'Ohne Schwung absenken.',
      ],
    },
  ),
  editorial(
    'hanging_leg_raise',
    'Hängendes Beinheben',
    'Hanging Leg Raise',
    'calisthenics',
    'advanced',
    ['abs'],
    {
      secondary: ['obliques', 'forearms'],
      equipment: ['pull_up_bar'],
      force: 'pull',
      mechanic: 'isolation',
      description: 'Beinheben mit gestreckten Beinen im Hang.',
      instructions: [
        'Frei an der Stange hängen, Beine gestreckt.',
        'Beine kontrolliert bis mindestens auf Hüfthöhe anheben.',
        'Ohne Pendeln absenken.',
      ],
    },
  ),
  editorial('l_sit', 'L-Sit', 'L-Sit', 'calisthenics', 'advanced', ['abs'], {
    secondary: ['quads', 'triceps', 'shoulders'],
    force: 'static',
    mechanic: 'compound',
    description: 'Gehaltener Stütz mit waagerecht vorgestreckten Beinen.',
    instructions: [
      'Auf Barren oder Boden abstützen, Schultern nach unten ziehen.',
      'Beine gestreckt anheben, bis sie waagerecht sind.',
      'Position halten, Rücken rund lassen ist erlaubt.',
    ],
  }),
  editorial(
    'tuck_front_lever',
    'Front Lever gehockt',
    'Tuck Front Lever',
    'calisthenics',
    'advanced',
    ['lats'],
    {
      secondary: ['abs', 'upper_back'],
      equipment: ['pull_up_bar'],
      force: 'static',
      mechanic: 'compound',
      description: 'Gehockte Vorstufe des Front Lever.',
      instructions: [
        'Im Hang die Knie eng an die Brust ziehen.',
        'Rücken waagerecht bringen, Arme gestreckt lassen.',
        'Position halten, Schultern aktiv nach unten.',
      ],
    },
  ),
  editorial(
    'handstand_hold',
    'Handstand',
    'Handstand Hold',
    'calisthenics',
    'advanced',
    ['shoulders'],
    {
      secondary: ['traps', 'abs'],
      force: 'static',
      mechanic: 'compound',
      description: 'Gehaltener Handstand, an der Wand oder frei.',
      instructions: [
        'Hände schulterbreit aufsetzen, Blick zwischen die Hände.',
        'Kontrolliert in die Senkrechte kommen, Rippen geschlossen.',
        'Position halten, über die Finger ausbalancieren.',
      ],
    },
  ),
  editorial(
    'step_up_bodyweight',
    'Step-up ohne Gewicht',
    'Bodyweight Step-Up',
    'calisthenics',
    'beginner',
    ['quads'],
    {
      secondary: ['glutes', 'hamstrings'],
      equipment: ['bench'],
      force: 'push',
      mechanic: 'compound',
      unilateral: true,
      description: 'Aufsteigen auf eine Erhöhung, einbeinig.',
      instructions: [
        'Einen Fuß vollständig auf die Erhöhung setzen.',
        'Über das obere Bein aufsteigen, ohne mit dem hinteren abzudrücken.',
        'Kontrolliert absteigen.',
      ],
    },
  ),
  editorial(
    'nordic_hamstring_curl',
    'Nordic Curl',
    'Nordic Hamstring Curl',
    'calisthenics',
    'advanced',
    ['hamstrings'],
    {
      secondary: ['glutes', 'lower_back'],
      equipment: ['gym_mat'],
      force: 'pull',
      mechanic: 'isolation',
      description: 'Exzentrische Kniebeugung im Kniestand mit fixierten Fersen.',
      instructions: [
        'Im Kniestand die Fersen fixieren lassen, Hüfte gestreckt.',
        'So langsam wie möglich nach vorn absenken.',
        'Mit den Händen abfangen und zurückdrücken.',
      ],
    },
  ),
];

// ── Endurance ────────────────────────────────────────────────────────────────
// `forceType` and `mechanic` stay null throughout: neither question applies to
// a cyclical activity, and the rule change makes saying so possible.

const endurance: Entry[] = [
  editorial(
    'steady_state_run',
    'Dauerlauf',
    'Steady-State Run',
    'endurance',
    'beginner',
    ['quads'],
    {
      secondary: ['hamstrings', 'calves', 'glutes'],
      description: 'Gleichmäßiger Lauf im aeroben Bereich über längere Zeit.',
      instructions: [
        'Tempo so wählen, dass Sprechen durchgehend möglich bleibt.',
        'Gleichmäßige Schrittfrequenz und ruhige Atmung halten.',
        'Dauer statt Tempo steigern.',
      ],
    },
  ),
  editorial('tempo_run', 'Tempolauf', 'Tempo Run', 'endurance', 'intermediate', ['quads'], {
    secondary: ['hamstrings', 'calves'],
    description: 'Lauf an der Schwelle, deutlich zügiger als der Dauerlauf.',
    instructions: [
      'Nach Einlaufen ein Tempo wählen, das etwa 20 bis 40 Minuten haltbar ist.',
      'Tempo gleichmäßig halten, nicht anfangs überziehen.',
      'Mit lockerem Auslaufen beenden.',
    ],
  }),
  editorial(
    'interval_run',
    'Intervalllauf',
    'Interval Run',
    'endurance',
    'intermediate',
    ['quads'],
    {
      secondary: ['hamstrings', 'calves', 'glutes'],
      description: 'Wechsel aus schnellen Abschnitten und Trabpausen.',
      instructions: [
        'Nach Einlaufen die Belastungs- und Pausenlänge festlegen.',
        'Belastungen gleichmäßig laufen, nicht die erste überziehen.',
        'In den Pausen locker traben statt stehen zu bleiben.',
      ],
    },
  ),
  editorial('hill_sprint', 'Bergsprint', 'Hill Sprint', 'endurance', 'advanced', ['quads'], {
    secondary: ['glutes', 'calves', 'hamstrings'],
    description: 'Kurze, maximale Antritte bergauf.',
    instructions: [
      'Eine gleichmäßige Steigung wählen und gründlich aufwärmen.',
      'Acht bis fünfzehn Sekunden maximal bergauf sprinten.',
      'Gehend zurück zum Start, vollständig erholen.',
    ],
  }),
  editorial(
    'sprint_intervals',
    'Sprintintervalle',
    'Sprint Intervals',
    'endurance',
    'advanced',
    ['quads'],
    {
      secondary: ['hamstrings', 'glutes', 'calves'],
      description: 'Sehr kurze maximale Läufe mit vollständiger Pause.',
      instructions: [
        'Gründlich aufwärmen, inklusive Steigerungsläufen.',
        'Kurze Strecken maximal laufen, Technik nicht verlieren.',
        'Pausen so lang wählen, dass jeder Antritt frisch ist.',
      ],
    },
  ),
  editorial('easy_jog', 'Lockerer Dauerlauf', 'Easy Jog', 'endurance', 'beginner', ['calves'], {
    secondary: ['quads', 'hamstrings'],
    description: 'Sehr lockerer Lauf zur Regeneration.',
    instructions: [
      'Bewusst langsamer laufen als beim Dauerlauf.',
      'Locker und aufrecht bleiben, kurze Schritte.',
      'Kurz halten; Ziel ist Erholung, nicht Reiz.',
    ],
  }),
  editorial(
    'cycling_steady',
    'Radfahren im Grundlagenbereich',
    'Steady-State Cycling',
    'endurance',
    'beginner',
    ['quads'],
    {
      secondary: ['glutes', 'calves', 'hamstrings'],
      equipment: ['machine'],
      description: 'Gleichmäßiges Radfahren im aeroben Bereich.',
      instructions: [
        'Widerstand so wählen, dass eine ruhige Trittfrequenz möglich ist.',
        'Gleichmäßig treten, Oberkörper locker.',
        'Dauer nach Trainingsziel festlegen.',
      ],
    },
  ),
  editorial(
    'cycling_intervals',
    'Radintervalle',
    'Cycling Intervals',
    'endurance',
    'intermediate',
    ['quads'],
    {
      secondary: ['glutes', 'calves'],
      equipment: ['machine'],
      description: 'Belastungsblöcke auf dem Rad mit definierten Pausen.',
      instructions: [
        'Einfahren, dann Widerstand für die Belastung erhöhen.',
        'Trittfrequenz während der Belastung halten.',
        'In der Pause locker weitertreten.',
      ],
    },
  ),
  editorial(
    'rowing_steady',
    'Rudern im Grundlagenbereich',
    'Steady-State Rowing',
    'endurance',
    'beginner',
    ['upper_back'],
    {
      secondary: ['quads', 'lats', 'glutes'],
      equipment: ['machine'],
      description: 'Gleichmäßiges Rudern auf dem Ergometer.',
      instructions: [
        'Reihenfolge einhalten: Beine, Rumpf, Arme — und umgekehrt zurück.',
        'Gleichmäßige Schlagzahl halten.',
        'Rücken bleibt gestreckt, Zug kommt aus den Beinen.',
      ],
    },
  ),
  editorial(
    'rowing_intervals',
    'Ruderintervalle',
    'Rowing Intervals',
    'endurance',
    'intermediate',
    ['upper_back'],
    {
      secondary: ['quads', 'lats', 'glutes'],
      equipment: ['machine'],
      description: 'Intervalle auf dem Ruderergometer.',
      instructions: [
        'Einrudern, dann Belastungs- und Pausenlänge festlegen.',
        'Während der Belastung Schlagzahl und Technik halten.',
        'In der Pause locker weiterrudern.',
      ],
    },
  ),
  editorial('jump_rope', 'Seilspringen', 'Jump Rope', 'endurance', 'beginner', ['calves'], {
    secondary: ['soleus', 'shoulders', 'forearms'],
    description: 'Gleichmäßiges Seilspringen als Ausdauer- und Fußarbeit.',
    instructions: [
      'Seil auf Körpergröße einstellen, Ellbogen eng am Körper.',
      'Aus den Handgelenken drehen, nur wenige Zentimeter abspringen.',
      'Über dem Vorfuß landen, Knie leicht gebeugt.',
    ],
  }),
  editorial('double_under', 'Double Under', 'Double Under', 'endurance', 'advanced', ['calves'], {
    secondary: ['soleus', 'forearms'],
    description: 'Seilspringen mit zwei Seildurchgängen pro Sprung.',
    instructions: [
      'Etwas höher springen als beim einfachen Durchschlag.',
      'Seil schneller aus den Handgelenken drehen.',
      'Rhythmus halten statt Sprunghöhe zu erhöhen.',
    ],
  }),
  editorial(
    'stair_climbing',
    'Treppensteigen',
    'Stair Climbing',
    'endurance',
    'beginner',
    ['quads'],
    {
      secondary: ['glutes', 'calves'],
      equipment: ['machine'],
      description: 'Gleichmäßiges Steigen auf Treppe oder Stepper.',
      instructions: [
        'Aufrecht bleiben, nicht am Geländer abstützen.',
        'Ganzen Fuß aufsetzen, Tempo gleichmäßig halten.',
        'Dauer statt Tempo steigern.',
      ],
    },
  ),
  editorial('incline_walk', 'Steigungsgehen', 'Incline Walk', 'endurance', 'beginner', ['glutes'], {
    secondary: ['quads', 'calves', 'hamstrings'],
    equipment: ['machine'],
    description: 'Zügiges Gehen bei Steigung, gelenkschonende Grundlagenarbeit.',
    instructions: [
      'Steigung einstellen und zügig gehen, ohne sich abzustützen.',
      'Aufrecht bleiben, Arme mitschwingen lassen.',
      'Tempo so wählen, dass die Atmung ruhig bleibt.',
    ],
  }),
  editorial('shuttle_run', 'Pendellauf', 'Shuttle Run', 'endurance', 'intermediate', ['quads'], {
    secondary: ['calves', 'glutes', 'hamstrings'],
    description: 'Wiederholte kurze Läufe mit Richtungswechsel.',
    instructions: [
      'Zwei Markierungen in definiertem Abstand setzen.',
      'Zwischen den Markierungen pendeln, Linie jeweils berühren.',
      'Beim Abbremsen tief gehen, Knie stabil halten.',
    ],
  }),
  editorial('high_knees', 'Kniehebelauf', 'High Knees', 'endurance', 'beginner', ['quads'], {
    secondary: ['calves', 'abs'],
    description: 'Lauf-ABC mit hoher Kniehebung, am Ort oder in Bewegung.',
    instructions: [
      'Knie abwechselnd bis Hüfthöhe anheben.',
      'Über den Vorfuß abdrücken, Oberkörper aufrecht.',
      'Frequenz hoch halten statt weit zu kommen.',
    ],
  }),
  editorial('butt_kicks', 'Anfersen', 'Butt Kicks', 'endurance', 'beginner', ['hamstrings'], {
    secondary: ['calves', 'quads'],
    description: 'Lauf-ABC mit Fersenanschlag zum Gesäß.',
    instructions: [
      'Fersen abwechselnd Richtung Gesäß ziehen.',
      'Oberschenkel bleiben weitgehend senkrecht.',
      'Aufrecht bleiben, Frequenz hoch halten.',
    ],
  }),
  editorial(
    'battle_rope_waves',
    'Battle-Rope-Wellen',
    'Battle Rope Waves',
    'endurance',
    'intermediate',
    ['shoulders'],
    {
      secondary: ['forearms', 'abs', 'upper_back'],
      equipment: ['resistance_band'],
      description: 'Wechselseitige Wellen mit schwerem Tau.',
      instructions: [
        'Hüftbreiter Stand, Knie leicht gebeugt, Tauenden locker greifen.',
        'Arme abwechselnd schnell auf und ab bewegen.',
        'Rumpf stabil halten, Intervalle nach Zeit setzen.',
      ],
    },
  ),
  editorial(
    'mountain_climber_conditioning',
    'Mountain Climber',
    'Mountain Climber',
    'endurance',
    'beginner',
    ['abs'],
    {
      secondary: ['quads', 'shoulders'],
      equipment: ['gym_mat'],
      description: 'Schneller Kniewechsel im Stütz, konditionell geführt.',
      instructions: [
        'Liegestützposition einnehmen, Hände unter den Schultern.',
        'Knie abwechselnd zügig zur Brust ziehen.',
        'Hüfte tief halten, Tempo über die Intervalldauer halten.',
      ],
    },
  ),
];

// ── Olympic weightlifting ────────────────────────────────────────────────────

const olympic: Entry[] = [
  editorial(
    'clean_pull',
    'Umsetzzug',
    'Clean Pull',
    'olympic_weightlifting',
    'intermediate',
    ['traps'],
    {
      secondary: ['glutes', 'hamstrings', 'upper_back'],
      equipment: ['barbell'],
      force: 'pull',
      mechanic: 'compound',
      description: 'Zugphase des Umsetzens ohne Umgreifen unter die Hantel.',
      instructions: [
        'Startposition wie beim Umsetzen, Schultern über der Stange.',
        'Über die Beine beschleunigen und die Hüfte kraftvoll strecken.',
        'Schultern hochziehen, ohne die Stange umzusetzen.',
      ],
    },
  ),
  editorial(
    'snatch_pull',
    'Reißzug',
    'Snatch Pull',
    'olympic_weightlifting',
    'advanced',
    ['traps'],
    {
      secondary: ['glutes', 'hamstrings', 'upper_back'],
      equipment: ['barbell'],
      force: 'pull',
      mechanic: 'compound',
      description: 'Zugphase des Reißens im weiten Griff.',
      instructions: [
        'Weiter Griff, Startposition wie beim Reißen.',
        'Über die Beine beschleunigen, Hüfte vollständig strecken.',
        'Stange eng am Körper führen, ohne unterzugehen.',
      ],
    },
  ),
  editorial(
    'hang_power_clean',
    'Hang Power Clean',
    'Hang Power Clean',
    'olympic_weightlifting',
    'intermediate',
    ['traps'],
    {
      secondary: ['glutes', 'quads', 'shoulders'],
      equipment: ['barbell'],
      force: 'pull',
      mechanic: 'compound',
      description: 'Umsetzen aus dem Hang, Fangen über der Parallele.',
      instructions: [
        'Stange aus dem Stand bis über die Knie absenken.',
        'Explosiv die Hüfte strecken und die Stange beschleunigen.',
        'In die Ablage umgreifen und über der Parallele fangen.',
      ],
    },
  ),
  editorial(
    'hang_power_snatch',
    'Hang Power Snatch',
    'Hang Power Snatch',
    'olympic_weightlifting',
    'advanced',
    ['shoulders'],
    {
      secondary: ['traps', 'glutes', 'quads'],
      equipment: ['barbell'],
      force: 'pull',
      mechanic: 'compound',
      description: 'Reißen aus dem Hang, Fangen über der Parallele.',
      instructions: [
        'Weiter Griff, Stange bis über die Knie absenken.',
        'Hüfte explosiv strecken, Stange eng am Körper führen.',
        'Über Kopf fangen, Arme durchgestreckt.',
      ],
    },
  ),
  editorial(
    'push_jerk',
    'Push Jerk',
    'Push Jerk',
    'olympic_weightlifting',
    'intermediate',
    ['shoulders'],
    {
      secondary: ['triceps', 'quads'],
      equipment: ['barbell'],
      force: 'push',
      mechanic: 'compound',
      description: 'Stoßen mit zweitem Kniebeugeimpuls, ohne Schrittstellung.',
      instructions: [
        'Stange in der Ablage auf den Schultern, Ellbogen leicht vorn.',
        'Kurz in die Knie gehen und kraftvoll nach oben abdrücken.',
        'Unter der Stange erneut leicht beugen und ausstrecken.',
      ],
    },
  ),
  editorial(
    'split_jerk',
    'Split Jerk',
    'Split Jerk',
    'olympic_weightlifting',
    'advanced',
    ['shoulders'],
    {
      secondary: ['triceps', 'quads', 'glutes'],
      equipment: ['barbell'],
      force: 'push',
      mechanic: 'compound',
      description: 'Stoßen mit Schrittstellung unter der Hantel.',
      instructions: [
        'Aus der Ablage kurz beugen und die Stange abdrücken.',
        'Gleichzeitig in die Schrittstellung springen.',
        'Stange über Kopf stabilisieren, dann Füße zusammenführen.',
      ],
    },
  ),
  editorial(
    'overhead_squat',
    'Überkopfkniebeuge',
    'Overhead Squat',
    'olympic_weightlifting',
    'advanced',
    ['quads'],
    {
      secondary: ['shoulders', 'glutes', 'abs'],
      equipment: ['barbell'],
      force: 'push',
      mechanic: 'compound',
      description: 'Kniebeuge mit der Hantel in gestreckten Armen über Kopf.',
      instructions: [
        'Weiter Griff, Stange über Kopf, Arme durchgestreckt.',
        'Kontrolliert in die tiefe Hocke gehen, Stange bleibt über der Mitte.',
        'Aufrichten, ohne die Arme nach vorn kippen zu lassen.',
      ],
    },
  ),
  editorial(
    'snatch_balance',
    'Snatch Balance',
    'Snatch Balance',
    'olympic_weightlifting',
    'advanced',
    ['shoulders'],
    {
      secondary: ['quads', 'traps'],
      equipment: ['barbell'],
      force: 'push',
      mechanic: 'compound',
      description: 'Schnelles Untergehen unter die Hantel in die Überkopfhocke.',
      instructions: [
        'Stange im weiten Griff im Nacken ablegen.',
        'Kurz abdrücken und zügig in die Überkopfhocke untergehen.',
        'Arme sofort durchstrecken, dann aufrichten.',
      ],
    },
  ),
  editorial(
    'clean_deadlift',
    'Umsetz-Kreuzheben',
    'Clean Deadlift',
    'olympic_weightlifting',
    'beginner',
    ['hamstrings'],
    {
      secondary: ['glutes', 'lower_back', 'traps'],
      equipment: ['barbell'],
      force: 'pull',
      mechanic: 'compound',
      description: 'Kreuzheben in der Startposition und Griffbreite des Umsetzens.',
      instructions: [
        'Griffbreite und Startposition wie beim Umsetzen einnehmen.',
        'Stange kontrolliert und körpernah anheben.',
        'Rücken durchgehend gestreckt, Schultern über der Stange halten.',
      ],
    },
  ),
];

// ── Plyometrics ──────────────────────────────────────────────────────────────

const plyometrics: Entry[] = [
  editorial('depth_jump', 'Tiefsprung', 'Depth Jump', 'plyometrics', 'advanced', ['quads'], {
    secondary: ['glutes', 'calves'],
    equipment: ['bench'],
    force: 'push',
    mechanic: 'compound',
    description: 'Absprung unmittelbar nach der Landung von einer Erhöhung.',
    instructions: [
      'Von einer Erhöhung heruntertreten, nicht springen.',
      'Sofort nach der Landung maximal nach oben abspringen.',
      'Bodenkontaktzeit so kurz wie möglich halten.',
    ],
  }),
  editorial(
    'broad_jump',
    'Standweitsprung',
    'Broad Jump',
    'plyometrics',
    'intermediate',
    ['glutes'],
    {
      secondary: ['quads', 'hamstrings', 'calves'],
      force: 'push',
      mechanic: 'compound',
      description: 'Beidbeiniger Sprung auf Weite aus dem Stand.',
      instructions: [
        'Hüftbreiter Stand, Arme nach hinten schwingen.',
        'Kraftvoll nach vorn und oben abspringen.',
        'Weich auf beiden Beinen landen, Landung kontrollieren.',
      ],
    },
  ),
  editorial(
    'lateral_bound',
    'Seitlicher Bound',
    'Lateral Bound',
    'plyometrics',
    'intermediate',
    ['glutes'],
    {
      secondary: ['quads', 'abductors', 'calves'],
      force: 'push',
      mechanic: 'compound',
      unilateral: true,
      description: 'Seitlicher Absprung von einem Bein auf das andere.',
      instructions: [
        'Auf einem Bein stehen, leicht in die Hüfte gehen.',
        'Seitlich abspringen und auf dem anderen Bein landen.',
        'Landung kurz stabilisieren, dann zurückspringen.',
      ],
    },
  ),
  editorial('skater_jump', 'Skater-Sprung', 'Skater Jump', 'plyometrics', 'beginner', ['glutes'], {
    secondary: ['quads', 'abductors'],
    force: 'push',
    mechanic: 'compound',
    unilateral: true,
    description: 'Seitliche Sprünge im Wechsel, wie beim Schlittschuhlauf.',
    instructions: [
      'Seitlich von einem Bein auf das andere springen.',
      'Freies Bein hinter dem Standbein kreuzen lassen.',
      'Weich landen und den Rhythmus halten.',
    ],
  }),
  editorial('tuck_jump', 'Hocksprung', 'Tuck Jump', 'plyometrics', 'intermediate', ['quads'], {
    secondary: ['glutes', 'abs', 'calves'],
    force: 'push',
    mechanic: 'compound',
    description: 'Vertikaler Sprung mit Anhocken der Knie.',
    instructions: [
      'Aus dem Stand maximal nach oben abspringen.',
      'In der Luft die Knie zur Brust ziehen.',
      'Weich landen und sofort zum nächsten Sprung ansetzen.',
    ],
  }),
  editorial(
    'single_leg_hop',
    'Einbeiniger Hop',
    'Single-Leg Hop',
    'plyometrics',
    'intermediate',
    ['calves'],
    {
      secondary: ['quads', 'glutes', 'soleus'],
      force: 'push',
      mechanic: 'compound',
      unilateral: true,
      description: 'Wiederholte Sprünge auf einem Bein.',
      instructions: [
        'Auf einem Bein stehen, Knie leicht gebeugt.',
        'Wiederholt nach vorn oder auf der Stelle springen.',
        'Über den Vorfuß landen, Knie stabil über dem Fuß.',
      ],
    },
  ),
  editorial('pogo_hop', 'Pogo-Sprung', 'Pogo Hop', 'plyometrics', 'beginner', ['calves'], {
    secondary: ['soleus'],
    force: 'push',
    mechanic: 'isolation',
    description: 'Kurze, steife Sprünge aus dem Sprunggelenk.',
    instructions: [
      'Beine nahezu gestreckt lassen, Sprung kommt aus dem Sprunggelenk.',
      'Nur wenige Zentimeter abspringen.',
      'Bodenkontakt so kurz wie möglich halten.',
    ],
  }),
  editorial(
    'medicine_ball_slam',
    'Medizinball-Slam',
    'Medicine Ball Slam',
    'plyometrics',
    'beginner',
    ['abs'],
    {
      secondary: ['lats', 'shoulders'],
      equipment: ['medicine_ball'],
      force: 'push',
      mechanic: 'compound',
      description: 'Explosives Werfen des Balls zu Boden.',
      instructions: [
        'Ball mit gestreckten Armen über Kopf führen.',
        'Kraftvoll aus dem Rumpf zu Boden schlagen.',
        'Ball aufnehmen und ohne Pause wiederholen.',
      ],
    },
  ),
  editorial(
    'medicine_ball_chest_pass',
    'Medizinball-Brustpass',
    'Medicine Ball Chest Pass',
    'plyometrics',
    'beginner',
    ['chest'],
    {
      secondary: ['triceps', 'shoulders'],
      equipment: ['medicine_ball'],
      force: 'push',
      mechanic: 'compound',
      description: 'Explosiver Stoß des Balls von der Brust nach vorn.',
      instructions: [
        'Ball auf Brusthöhe halten, Ellbogen angelegt.',
        'Ball kraftvoll gegen Wand oder Partner stoßen.',
        'Ball auffangen und ohne Verzögerung wiederholen.',
      ],
    },
  ),
  editorial(
    'medicine_ball_rotational_throw',
    'Medizinball-Rotationswurf',
    'Medicine Ball Rotational Throw',
    'plyometrics',
    'intermediate',
    ['obliques'],
    {
      secondary: ['abs', 'shoulders'],
      equipment: ['medicine_ball'],
      force: 'push',
      mechanic: 'compound',
      unilateral: true,
      description: 'Explosiver Wurf aus der Rumpfdrehung gegen die Wand.',
      instructions: [
        'Seitlich zur Wand stehen, Ball vor dem Körper halten.',
        'Aus der Hüfte drehen und den Ball gegen die Wand werfen.',
        'Ball aufnehmen, Seite nach der Serie wechseln.',
      ],
    },
  ),
];

// ── Brachialis and forearms ──────────────────────────────────────────────────
// The two muscles the source-derived selection never reached.

const arms: Entry[] = [
  editorial(
    'reverse_curl',
    'Umgekehrter Curl',
    'Reverse Curl',
    'strength',
    'beginner',
    ['brachialis'],
    {
      secondary: ['forearms', 'biceps'],
      equipment: ['ez_curl_bar'],
      force: 'pull',
      mechanic: 'isolation',
      description: 'Curl im Obergriff, betont Brachialis und Unterarmstrecker.',
      instructions: [
        'Stange im Obergriff schulterbreit fassen.',
        'Ellbogen am Körper fixieren und die Stange anheben.',
        'Kontrolliert absenken, Handgelenke gerade halten.',
      ],
    },
  ),
  editorial(
    'hammer_curl_rope',
    'Hammercurl am Seil',
    'Rope Hammer Curl',
    'strength',
    'beginner',
    ['brachialis'],
    {
      secondary: ['biceps', 'forearms'],
      equipment: ['cable'],
      force: 'pull',
      mechanic: 'isolation',
      description: 'Hammercurl am Kabel mit neutralem Griff.',
      instructions: [
        'Seilgriff am unteren Kabelzug neutral fassen.',
        'Ellbogen am Körper halten und beugen.',
        'Kontrolliert absenken, ohne Schwung zu nehmen.',
      ],
    },
  ),
  editorial('wrist_curl', 'Handgelenkcurl', 'Wrist Curl', 'strength', 'beginner', ['forearms'], {
    equipment: ['dumbbell', 'bench'],
    force: 'pull',
    mechanic: 'isolation',
    description: 'Beugung im Handgelenk für die Unterarmbeuger.',
    instructions: [
      'Unterarme auf einer Bank ablegen, Handflächen nach oben.',
      'Gewicht nur über das Handgelenk anheben.',
      'Kontrolliert bis in die volle Dehnung absenken.',
    ],
  }),
  editorial(
    'reverse_wrist_curl',
    'Umgekehrter Handgelenkcurl',
    'Reverse Wrist Curl',
    'strength',
    'beginner',
    ['forearms'],
    {
      equipment: ['dumbbell', 'bench'],
      force: 'pull',
      mechanic: 'isolation',
      description: 'Streckung im Handgelenk für die Unterarmstrecker.',
      instructions: [
        'Unterarme auf einer Bank ablegen, Handflächen nach unten.',
        'Gewicht nur über das Handgelenk anheben.',
        'Kontrolliert absenken, Unterarme bleiben liegen.',
      ],
    },
  ),
  editorial(
    'plate_pinch_hold',
    'Plattenhalten',
    'Plate Pinch Hold',
    'strength',
    'intermediate',
    ['forearms'],
    {
      equipment: ['machine'],
      force: 'static',
      mechanic: 'isolation',
      description: 'Gehaltenes Kneifen zweier Scheiben, für die Greifkraft.',
      instructions: [
        'Zwei glatte Scheiben mit den Fingern zusammenkneifen.',
        'Aufrecht stehen und die Scheiben so lange wie möglich halten.',
        'Absetzen, bevor der Griff schlagartig nachgibt.',
      ],
    },
  ),
];

export const EDITORIAL_EXERCISES: readonly Entry[] = [
  ...stability,
  ...calisthenics,
  ...endurance,
  ...olympic,
  ...plyometrics,
  ...arms,
];
