import type { ExerciseRelationshipType } from '@apex/domain';

/**
 * Relationships between exercises, set by hand.
 *
 * The 403 automatic proposals were discarded after the catalogue review: they
 * came from a family word in the English name and then linked every member of a
 * family to every other, which declared the front squat a variant of the jump
 * squat. What replaces them is this file — pairs a person looked at, with the
 * reason recorded and the kind of relationship named.
 *
 * **`alternative`** means one can take the other's place: same movement, same
 * training goal, different implement or position. **`related`** means close but
 * not interchangeable — the difference is the point of having both.
 *
 * Two rules this file keeps, and both were learned the hard way:
 *
 * - **No transitivity.** A→B and B→C does not produce A→C. Where three
 *   exercises belong together, all three pairs are listed and each was judged.
 * - **Same muscles is not a relationship.** Nordic curl and wrist curl share a
 *   syllable; sit-up and hanging leg raise share `abs`. Neither is a pair.
 */

export interface Relationship {
  /** Canonical names — the identifier that survives a renaming. */
  readonly a: string;
  readonly b: string;
  readonly type: ExerciseRelationshipType;
  /** What makes the two related, in one sentence. */
  readonly basis: string;
}

const alternative = (a: string, b: string, basis: string): Relationship => ({
  a,
  b,
  type: 'alternative',
  basis,
});

const related = (a: string, b: string, basis: string): Relationship => ({
  a,
  b,
  type: 'related',
  basis,
});

export const RELATIONSHIPS: readonly Relationship[] = [
  // ── Bankdrücken und Brustdrücken ───────────────────────────────────────────
  alternative(
    'Dumbbell Bench Press',
    'Machine Bench Press',
    'Gleiches horizontales Drücken; die Maschine ist der Ersatz, wenn niemand sichern kann.',
  ),
  alternative(
    'Decline Dumbbell Bench Press',
    'Decline Barbell Bench Press',
    'Identische Bewegung und Bankneigung, nur anderes Gerät.',
  ),
  alternative(
    'Dumbbell Bench Press',
    'Cable Chest Press',
    'Vergleichbares Ziel; der Kabelzug ändert die Widerstandskurve, nicht die Bewegung.',
  ),
  alternative(
    'Diamond Push-Up',
    'Bench Dip',
    'Beide trizepsdominant, ohne Zusatzlast, aus dem Stütz.',
  ),
  related(
    'Incline Push-Up',
    'Decline Push-Up',
    'Derselbe Liegestütz in beide Richtungen skaliert — leichter und schwerer.',
  ),
  related(
    'Pike Push-Up',
    'Wall Handstand Push-Up',
    'Progression zur selben vertikalen Druckbewegung.',
  ),
  // Aus der ursprünglichen Variantenprüfung, jetzt typisiert.
  alternative(
    'Decline Dumbbell Bench Press',
    'Dumbbell Bench Press',
    'Dieselbe Druckbewegung mit anderer Bankneigung.',
  ),
  alternative(
    'Cable Chest Press - Incline',
    'Cable Chest Press',
    'Dieselbe Pressbewegung am Kabelzug mit anderer Bankneigung.',
  ),
  alternative(
    'Cable Chest Press',
    'Standing Cable Chest Press',
    'Dasselbe horizontale Drücken, sitzend gegenüber stehend.',
  ),
  alternative(
    'Cable Chest Press - Incline',
    'Standing Cable Chest Press',
    'Dieselbe Pressbewegung, Schrägbank gegenüber freiem Stand.',
  ),

  // ── Kniebeuge, Split Squat, Ausfallschritt ─────────────────────────────────
  alternative(
    'Barbell Squat',
    'Dumbbell Squat',
    'Gleiche Bewegung, Last vorne statt auf dem Rücken; kein Rack nötig.',
  ),
  alternative('Barbell Squat', 'Hack Squat', 'Maschinenersatz für dieselbe Kniestreckung.'),
  alternative(
    'Air Squat',
    'Dumbbell Squat',
    'Einstieg und belastete Fortsetzung derselben Bewegung.',
  ),
  alternative(
    'Barbell Squat',
    'Leg Press',
    'Vergleichbares Ziel, aber gestützter Rumpf — deshalb nur bedingt austauschbar.',
  ),
  alternative('Hack Squat', 'Lying Machine Squat', 'Zwei Maschinenwege zur selben Bewegung.'),
  alternative(
    'Split Squat with Dumbbells',
    'Smith Single-Leg Split Squat',
    'Gleiche einbeinige Bewegung, geführt statt frei.',
  ),
  alternative(
    'Split Squat with Dumbbells',
    'Suspended Split Squat',
    'Gleiche Position; die Schlinge erhöht die Stabilitätsanforderung.',
  ),
  alternative('Bodyweight Lunge', 'Barbell Lunge', 'Dieselbe Bewegung unbelastet und belastet.'),
  related(
    'Barbell Squat',
    'Front Barbell Squat',
    'Gleiche Grundbewegung, andere Lastposition und Rumpfanforderung — nicht austauschbar.',
  ),
  related(
    'Barbell Lunge',
    'Dumbbell Rear Lunge',
    'Vorwärts und rückwärts belasten Knie und Hüfte unterschiedlich.',
  ),
  related(
    'Pistol Squat',
    'Air Squat',
    'Beide ohne Gerät; der Unterschied ist die Anforderung, nicht die Bewegung.',
  ),
  related(
    'Bodyweight Step-Up',
    'Bodyweight Lunge',
    'Beide einbeinig ohne Gerät, aber andere Bewegungsrichtung.',
  ),
  related(
    'Overhead Squat',
    'Front Barbell Squat',
    'Reißderivat gegenüber Kraftübung; die Lastposition ändert die Anforderung grundlegend.',
  ),

  // ── Kreuzheben und Hip Hinge ───────────────────────────────────────────────
  related(
    'Barbell Deadlift',
    'Sumo Deadlift',
    'Standbreite verschiebt die Betonung — als Test nicht ersetzbar.',
  ),
  related(
    'Barbell Deadlift',
    'Romanian Deadlift',
    'Vom Boden gegenüber aus dem Stand; anderes Trainingsziel.',
  ),
  related(
    'Romanian Deadlift',
    'Stiff Leg Barbell Good Morning',
    'Gleiche Hüftbeugung, Last an der Hüfte gegenüber im Nacken.',
  ),
  related(
    'Good Morning',
    'Stiff Leg Barbell Good Morning',
    'Der Kniewinkel verschiebt die Belastung.',
  ),
  related(
    'Clean Deadlift',
    'Barbell Deadlift',
    'Technikvorstufe für eine andere Disziplin; gleiche Grundbewegung.',
  ),
  alternative(
    'Seated Leg Curl',
    'Standing Leg Curl',
    'Gleiche Kniebeugung an der Maschine, andere Position.',
  ),
  alternative(
    'Seated Leg Curl',
    'Nordic Hamstring Curl',
    'Kniebeugung ohne Maschine — deutlich schwerer, deshalb bedingt.',
  ),
  related(
    'Glute Ham Raise',
    'Nordic Hamstring Curl',
    'Gleiche exzentrische Kniebeugung, mit und ohne Gerät.',
  ),
  related(
    'Single Leg Glute Bridge',
    'Glute Bridge Hold',
    'Dieselbe Hüftstreckung dynamisch gegenüber gehalten.',
  ),
  related(
    'Reverse Band Deadlift',
    'Reverse Band Sumo Deadlift',
    'Gleiche Reverse-Band-Mechanik, andere Standbreite.',
  ),
  related(
    'Sumo Deadlift with Bands',
    'Reverse Band Sumo Deadlift',
    'Gleiche Sumo-Position; Band von unten gegenüber Reverse Band von oben.',
  ),

  // ── Rudern und Zug ─────────────────────────────────────────────────────────
  alternative(
    'Bent Over Barbell Row',
    'One-Arm Dumbbell Row',
    'Gleicher horizontaler Zug, abgestützt statt frei.',
  ),
  alternative(
    'Bent Over Barbell Row',
    'Two-Arm Kettlebell Row',
    'Gleiche Bewegung, anderes Gerät.',
  ),
  alternative(
    'Two-Arm Kettlebell Row',
    'Alternating Kettlebell Row',
    'Gleichzeitig gegenüber im Wechsel.',
  ),
  alternative(
    'Suspended Row',
    'Inverted Row',
    'Beides horizontales Ziehen am eigenen Körpergewicht.',
  ),
  alternative(
    'Upright Row - With Bands',
    'Standing Dumbbell Upright Row',
    'Gleicher vertikaler Zug auf den Trapez.',
  ),
  alternative(
    'Chin-Up',
    'One Arm Lat Pulldown',
    'Der Latzug ist der skalierbare Ersatz, wenn der Klimmzug nicht geht.',
  ),
  related('Chin-Up', 'Negative Pull-Up', 'Vorstufe derselben Bewegung.'),
  related(
    'Standing Dumbbell Upright Row',
    'Dumbbell One-Arm Upright Row',
    'Zweiseitig gegenüber einseitig.',
  ),
  related('Dumbbell Incline Row', 'One-Arm Dumbbell Row', 'Beide abgestützt, andere Zugrichtung.'),
  related(
    'Negative Pull-Up',
    'Inverted Row',
    'Zwei Skalierungswege zum Klimmzug — vertikal gegenüber horizontal.',
  ),

  // ── Schulterdrücken und Schulterheben ──────────────────────────────────────
  alternative(
    'Standing Military Press',
    'Dumbbell Shoulder Press',
    'Gleiches Überkopfdrücken, anderes Gerät.',
  ),
  alternative(
    'Dumbbell Shoulder Press',
    'Shoulder Press - With Bands',
    'Bandersatz ohne Gewichte.',
  ),
  alternative(
    'Dumbbell Shoulder Press',
    'Cable Shoulder Press',
    'Vergleichbares Ziel, andere Widerstandskurve.',
  ),
  alternative(
    'Cable Seated Lateral Raise',
    'Cable Rear Delt Fly',
    'Beide hintere Schulter am Kabelzug.',
  ),
  alternative(
    'Dumbbell Lying Rear Lateral Raise',
    'Cable Seated Lateral Raise',
    'Gleiches Ziel, Kurzhantel gegenüber Kabelzug.',
  ),
  alternative(
    'Cable Shoulder Press',
    'Seated Cable Shoulder Press',
    'Dasselbe vertikale Drücken; stehend gegenüber sitzend ändert die Stabilitätsanforderung.',
  ),
  alternative(
    'Seated Bent-Over Rear Delt Raise',
    'Lying Rear Delt Raise',
    'Gleiche Zielbewegung für die hintere Schulter; vorgebeugt sitzend gegenüber bäuchlings.',
  ),
  related(
    'Shoulder Press, Barbell',
    'Standing Military Press',
    'Sitzend gegenüber stehend — andere Rumpfanforderung.',
  ),
  related(
    'Dumbbell One-Arm Shoulder Press',
    'One-Arm Kettlebell Push Press',
    'Striktes Drücken gegenüber Drücken mit Beinantrieb.',
  ),
  related(
    'Front Raise (Cable)',
    'Side Laterals to Front Raise',
    'Die zweite Übung enthält die erste als Teilbewegung.',
  ),
  related(
    'One-Arm Incline Lateral Raise',
    'Lying One-Arm Lateral Raise',
    'Seitliche gegenüber hinterer Schulter, sonst gleiche Ausführung.',
  ),

  // ── Arme ───────────────────────────────────────────────────────────────────
  alternative(
    'Cable Preacher Curl',
    'Incline Dumbbell Curl',
    'Beide mit fixiertem Oberarm, Kabelzug gegenüber Kurzhantel.',
  ),
  alternative(
    'Cable Preacher Curl',
    'Lying Cable Curl',
    'Bizepscurl am Kabelzug mit deutlich anderer Oberarmposition.',
  ),
  related(
    'Cable Preacher Curl',
    'Overhead Cable Curl',
    'Bizepscurl am Kabelzug; Oberarm aufgelegt gegenüber waagerecht über Kopf.',
  ),
  related(
    'Lying Cable Curl',
    'Overhead Cable Curl',
    'Bizepscurl am Kabelzug mit anderer Ausgangsposition und Zugrichtung.',
  ),
  related('Reverse Curl', 'Rope Hammer Curl', 'Beide brachialisdominant mit anderer Griffhaltung.'),
  related('Wrist Curl', 'Reverse Wrist Curl', 'Gegenspieler am selben Gelenk.'),
  alternative(
    'Cable One Arm Tricep Extension',
    'Seated Bent-Over One-Arm Dumbbell Triceps Extension',
    'Gleiche einarmige Ellenbogenstreckung.',
  ),
  alternative('Dumbbell Floor Press', 'One Arm Floor Press', 'Zweiseitig gegenüber einseitig.'),
  related(
    'Kneeling Cable Triceps Extension',
    'Low Cable Triceps Extension',
    'Gleiche Streckung, andere Körperlage.',
  ),

  // ── Rumpf ──────────────────────────────────────────────────────────────────
  alternative(
    'Cable Crunch',
    'Cable Seated Crunch',
    'Dieselbe Rumpfflexion am Kabelzug, kniend gegenüber sitzend.',
  ),

  // ── Waden ──────────────────────────────────────────────────────────────────
  alternative(
    'Standing Calf Raises',
    'Standing Dumbbell Calf Raise',
    'Gleiche Bewegung, Maschine gegenüber freier Last.',
  ),
  alternative(
    'Standing Calf Raises',
    'Standing Barbell Calf Raise',
    'Gleiche Bewegung, Maschine gegenüber freier Last.',
  ),
  alternative('Calf Press', 'Standing Calf Raises', 'Beide mit gestrecktem Knie — Gastrocnemius.'),
  alternative('Standing Dumbbell Calf Raise', 'Calf Raises - With Bands', 'Ersatz ohne Gewichte.'),
  alternative(
    'Seated Calf Raise',
    'Barbell Seated Calf Raise',
    'Gleiche Soleus-Variante, anderes Gerät.',
  ),
  related(
    'Seated Calf Raise',
    'Dumbbell Seated One-Leg Calf Raise',
    'Zweiseitig gegenüber einseitig.',
  ),
  related(
    'Calf Raise On A Dumbbell',
    'Standing Dumbbell Calf Raise',
    'Einmal steht man auf der Hantel, einmal hält man sie — gleiche Zielmuskulatur.',
  ),

  // ── Olympisches Heben ──────────────────────────────────────────────────────
  related(
    'Power Clean',
    'Hang Power Clean',
    'Dieselbe Bewegung mit anderem Startpunkt: vom Boden gegenüber aus dem Hang.',
  ),
  related(
    'Hang Clean',
    'Hang Power Clean',
    'Gleicher Start aus dem Hang, andere Fangtiefe: unter der Stange gegenüber oberhalb der Parallele.',
  ),

  // ── Mobility ───────────────────────────────────────────────────────────────
  alternative(
    'Hamstring Stretch',
    'Seated Floor Hamstring Stretch',
    'Gleiche Dehnung mit und ohne Gurt.',
  ),
  alternative(
    'Standing Hamstring and Calf Stretch',
    'Seated Hamstring and Calf Stretch',
    'Gleiche Dehnung mit gleichem Hilfsmittel, stehend gegenüber sitzend.',
  ),
  related('Hamstring-SMR', 'Hamstring Stretch', 'Gleiche Struktur, andere Methode.'),
];

/**
 * Pairs the review looked at and confirmed as **separate exercises**.
 *
 * Kept so the duplicate check does not raise them again. Each was found by
 * comparing structured data — same category, pattern, muscles, equipment — and
 * each turned out to be a different movement once the instructions were read.
 *
 * That is the finding worth keeping: at these points the *data* is too coarse,
 * not the catalogue too full.
 */
export const NOT_RELATED: readonly Relationship[] = [
  related(
    'Cable Crunch',
    'Cable Reverse Crunch',
    'Andere Bewegung: beim Crunch geht der Oberkörper zur Hüfte, beim reversen Crunch Becken und Beine zum Oberkörper.',
  ),
  related(
    'Cable Reverse Crunch',
    'Cable Seated Crunch',
    'Beckenbewegung gegenüber Rumpfflexion im Sitzen — zwei Mechaniken.',
  ),
  related(
    'Decline Crunch',
    'Decline Reverse Crunch',
    'Wie am Kabelzug: der Oberkörper bewegt sich gegenüber Becken und Beinen.',
  ),
  related(
    'Wall Handstand Push-Up',
    'Handstand Hold',
    'Dynamisches vertikales Drücken gegenüber statischem Balancehalten.',
  ),
  related(
    'Clean and Press',
    'Clean and Jerk',
    'Gleicher Beginn, grundlegend andere Überkopfphase: Drücken gegenüber Stoßen mit Nachtauchen.',
  ),
  related(
    'Reverse Band Deadlift',
    'Sumo Deadlift with Bands',
    'Bewusst offen gelassen: Standbreite und Bandrichtung ändern sich gleichzeitig, die Unterschiede kumulieren.',
  ),
];

const canonical = (a: string, b: string) => [a, b].sort().join(' ↔ ');

const decided = new Set(
  [...RELATIONSHIPS, ...NOT_RELATED].map((pair) => canonical(pair.a, pair.b)),
);

/** Whether a pair has already been judged, in either direction. */
export const isDecided = (a: string, b: string): boolean => decided.has(canonical(a, b));
