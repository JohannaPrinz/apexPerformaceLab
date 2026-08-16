/**
 * Decisions taken in the human review, block by block.
 *
 * The curation rules produce a *proposal*. Where a coach looked at an entry and
 * decided otherwise, the decision is recorded here and overlays the generated
 * value — it is never edited back into the rules, because a rule that has been
 * hand-patched for one exercise stops being a rule.
 *
 * Two things follow from that:
 *
 * - Every override names the field it replaces and *why*. A later reader must be
 *   able to tell a considered judgement from a typo.
 * - Overrides are keyed by `canonicalName`, not by the generated key. The
 *   English technical name is the one identifier that survives a renaming of the
 *   German display name.
 *
 * **German text.** Instructions arriving from wrkout are English. The
 * application is German, so the catalogue carries German instructions, written
 * here from the source text: condensed, in coaching German, and making no claim
 * the English did not make. The exercise data still comes from wrkout and the
 * attribution stays; the German wording is ours and is recorded as such in
 * `provenance`.
 */

export interface ReviewDecision {
  /** Stable identifier across renamings. */
  readonly canonicalName: string;
  /** Which review block took the decision. */
  readonly block: number;
  /** Why the generated value was not kept. One line, for the changelog. */
  readonly note: string;

  readonly name?: string;
  readonly category?: string;
  readonly primaryMuscles?: readonly string[];
  readonly secondaryMuscles?: readonly string[];
  readonly equipment?: readonly string[];
  readonly forceType?: string;
  readonly mechanic?: string;
  readonly difficulty?: string;
  readonly unilateral?: boolean;
  readonly instructions?: readonly string[];
  /**
   * Something the review could not settle from the data.
   *
   * Recorded rather than guessed, and surfaced in the changelog. A decision may
   * carry a conflict *and* changes — the parts that were certain still apply.
   */
  readonly conflict?: string;
  /**
   * Why the exercise leaves the catalogue.
   *
   * A removal is a decision like any other and is recorded here rather than by
   * deleting a row somewhere: the run after next must still be able to answer
   * why an exercise a reader remembers is gone.
   */
  readonly remove?: string;
}

/**
 * Block 1 — Strength, part 1. Reviewed 2026-08-13.
 *
 * Muscle assignments follow the rule set in the review: **primary** is what
 * drives the movement, **secondary** is what meaningfully assists. The source
 * data listed everything anatomically involved, which makes a "filter by muscle"
 * in the coach UI useless — every exercise matches every muscle.
 */
export const BLOCK_1: readonly ReviewDecision[] = [
  {
    canonicalName: 'Alternating Hang Clean',
    block: 1,
    note: 'Umsetzen wird von Hüftstreckung und Nacken erzeugt, nicht allein von der Beinrückseite.',
    primaryMuscles: ['glutes', 'hamstrings', 'traps'],
    secondaryMuscles: ['forearms', 'lower_back', 'shoulders'],
    instructions: [
      'Stelle zwei Kettlebells zwischen deine Füße. Schiebe das Gesäß nach hinten und richte den Blick geradeaus.',
      'Setze eine Kettlebell an der Schulter ab, während die andere in der hängenden Position bleibt. Strecke dafür Beine und Hüfte und ziehe die Kettlebell zur Schulter; drehe dabei das Handgelenk ein.',
      'Senke die abgesetzte Kettlebell zurück in die hängende Position und setze die andere um. Im Wechsel wiederholen.',
    ],
  },
  {
    canonicalName: 'Alternating Cable Shoulder Press',
    block: 1,
    note: 'Deutscher Sprachgebrauch: „im Wechsel" statt „alternierend"; Gerät nachgestellt (Regel A).',
    name: 'Schulterdrücken am Kabelzug im Wechsel',
    instructions: [
      'Führe die Kabelzüge nach unten und wähle ein passendes Gewicht.',
      'Greife die Griffe und halte sie auf Schulterhöhe, die Handflächen zeigen nach vorne. Das ist die Ausgangsposition.',
      'Kopf und Brust bleiben aufgerichtet. Strecke einen Arm und drücke den Griff gerade über den Kopf.',
      'Halte oben kurz, kehre in die Ausgangsposition zurück und wiederhole auf der Gegenseite.',
    ],
  },
  {
    canonicalName: 'Alternating Kettlebell Row',
    block: 1,
    note: 'Rudern ist mehrgelenkig; alle übrigen Ruderübungen stehen auf compound.',
    mechanic: 'compound',
    instructions: [
      'Stelle zwei Kettlebells vor deine Füße. Beuge die Knie leicht, schiebe das Gesäß weit nach hinten und greife im Vorbeugen beide Griffe.',
      'Ziehe eine Kettlebell vom Boden, während du die andere hältst. Ziehe das Schulterblatt der Arbeitsseite zurück und führe die Kettlebell bei gebeugtem Ellenbogen zum Bauch beziehungsweise zum Rippenbogen.',
      'Senke die Kettlebell wieder ab und wiederhole mit dem anderen Arm.',
    ],
  },
  {
    canonicalName: 'Suspended Reverse Crunch',
    block: 1,
    note: 'Gerät wird im Deutschen nachgestellt, nicht vorangestellt. Das im Namen genannte Gerät fehlte im Equipment; `suspension_trainer` steht seit Block 7 im Vokabular.',
    equipment: ['suspension_trainer'],
    name: 'Reverse Crunch im Schlingentrainer',
    instructions: [
      'Hänge die Schlingen so ein, dass die Griffe etwa 30 cm über dem Boden hängen. Gehe in eine Liegestützposition mit dem Rücken zur Aufhängung.',
      'Setze die Füße in die Griffe. Halte den Körper gestreckt und lasse die Hüfte nicht durchhängen. Das ist die Ausgangsposition.',
      'Beuge Knie und Hüfte und ziehe die Knie zum Rumpf. Kippe dabei das Becken nach vorne, sodass die Wirbelsäule mitgeht.',
      'Kehre am Ende der kontrollierten Bewegung in die Ausgangsposition zurück.',
    ],
  },
  {
    canonicalName: 'Suspended Split Squat',
    block: 1,
    note: 'Gerät wird im Deutschen nachgestellt. Varianten bleiben für die spätere Variantenreview offen. Das im Namen genannte Gerät fehlte im Equipment; `suspension_trainer` steht seit Block 7 im Vokabular.',
    equipment: ['suspension_trainer'],
    name: 'Split Squat im Schlingentrainer',
    instructions: [
      'Hänge die Schlingen so ein, dass die Griffe etwa 45 bis 75 cm über dem Boden hängen.',
      'Mit dem Rücken zur Aufhängung setzt du den hinteren Fuß in den Griff. Blick nach vorne, Brust auf, das vordere Knie leicht gebeugt. Das ist die Ausgangsposition.',
      'Beuge Knie und Hüfte und senke dich ab. Das Gewicht bleibt auf der Ferse des vorderen Fußes, die Haltung bleibt über die gesamte Bewegung erhalten.',
      'Kehre die Bewegung unten um und strecke Hüfte und Knie zurück in die Ausgangsposition.',
    ],
  },
  {
    canonicalName: 'Suspended Row',
    block: 1,
    note: 'Gerät wird im Deutschen nachgestellt. Das im Namen genannte Gerät fehlte im Equipment; `suspension_trainer` steht seit Block 7 im Vokabular.',
    equipment: ['suspension_trainer'],
    name: 'Rudern im Schlingentrainer',
    instructions: [
      'Hänge die Schlingen etwa auf Brusthöhe ein. Nimm in jede Hand einen Griff und lehne dich zurück. Der Körper bleibt gestreckt, Kopf und Brust aufgerichtet, die Arme sind gestreckt. Das ist die Ausgangsposition.',
      'Leite die Bewegung ein, indem du die Ellenbogen beugst und die Schulterblätter zusammenführst.',
      'Halte am Ende der Bewegung kurz und kehre in die Ausgangsposition zurück.',
    ],
  },
  {
    canonicalName: 'External Rotation',
    block: 1,
    note: 'Fachlich unverändert freigegeben; nur die deutsche Textfassung ist neu.',
    instructions: [
      'Lege dich seitlich auf eine Flachbank. Die eine Hand hält eine Kurzhantel, der andere Arm liegt angewinkelt auf der Bank, sodass du den Kopf darauf ablegen kannst.',
      'Winkle den Arm mit der Kurzhantel auf 90 Grad zwischen Oberarm und Unterarm an. Der Oberarm liegt parallel zum Rumpf und bleibt dort während der gesamten Übung.',
      'Der Unterarm zeigt nach vorne und steht senkrecht zum Rumpf. Das ist die Ausgangsposition.',
      'Rotiere beim Ausatmen den Unterarm im Halbkreis nach außen, bis er senkrecht zum Boden steht. Der 90-Grad-Winkel im Ellenbogen bleibt erhalten. Halte die Spannung eine Sekunde.',
      'Führe den Arm beim Einatmen langsam in die Ausgangsposition zurück.',
      'Wiederhole die vorgesehene Anzahl und wechsle dann den Arm.',
    ],
  },
  {
    canonicalName: 'Upright Row - With Bands',
    block: 1,
    note: 'Gerät nachgestellt. Aufrechtes Rudern zieht vertikal auf den Trapez und ist keine Variante des vorgebeugten Ruderns; die Variantenzuordnung bleibt offen.',
    name: 'Aufrechtes Rudern mit Band',
    primaryMuscles: ['traps'],
    secondaryMuscles: ['shoulders', 'biceps'],
    instructions: [
      'Stelle dich mittig auf ein Widerstandsband, sodass bei gestreckten Armen bereits Spannung anliegt. Greife die Griffe im Obergriff etwas enger als schulterbreit; die Hände liegen vor den Oberschenkeln, der Rücken ist gerade. Das ist die Ausgangsposition.',
      'Ziehe die Griffe beim Ausatmen eng am Körper nach oben, bis sie fast das Kinn erreichen. Die Ellenbogen führen die Bewegung und bleiben stets höher als die Unterarme. Der Rumpf bleibt ruhig; halte oben kurz.',
      'Senke die Griffe beim Einatmen langsam in die Ausgangsposition zurück.',
    ],
  },
  {
    canonicalName: 'External Rotation with Band',
    block: 1,
    note: 'Außenrotation ist eingelenkig; dieselbe Übung mit Kurzhantel steht korrekt auf isolation.',
    mechanic: 'isolation',
    instructions: [
      'Befestige das Band auf Ellenbogenhöhe an einem festen Punkt. Stelle dich mit der linken Seite zum Band, etwa einen Schritt entfernt.',
      'Greife das Bandende mit der rechten Hand und presse den Ellenbogen fest an die Seite. Ein untergeklemmtes Polster hilft, ihn dort zu halten.',
      'Der Ellenbogen ist auf 90 Grad gebeugt, die Hand liegt vor dem Bauch. Das ist die Ausgangsposition.',
      'Rotiere den Unterarm nach außen, ohne den Ellenbogen von der Seite zu lösen.',
      'Führe die Bewegung so weit wie möglich, halte kurz und kehre in die Ausgangsposition zurück.',
    ],
  },
  {
    canonicalName: 'Squat with Bands',
    block: 1,
    note: 'Bänder sind hier der kennzeichnende Widerstand; die Langhantel wird zusätzlich benötigt.',
    equipment: ['resistance_band', 'barbell'],
    instructions: [
      'Befestige die Bänder an den Hantelenden und spanne sie so, dass eine passende Zugspannung anliegt.',
      'Tritt unter die Stange und lege sie auf den oberen Rücken. Führe die Schulterblätter zusammen, drehe die Ellenbogen nach vorne, hebe die Stange aus der Ablage und tritt zurück. Ein weiter Stand betont Rücken, Gesäß, Adduktoren und Beinrückseite. Der Blick bleibt nach vorne gerichtet.',
      'Rücken, Schultern und Rumpf bleiben fest. Schiebe Knie und Gesäß nach außen und beginne die Abwärtsbewegung. Setze die Hüfte so weit wie möglich zurück; die Schienbeine bleiben möglichst senkrecht. Gehe bis unter die Parallele, also bis die Hüftbeuge auf Höhe der Kniescheibe liegt.',
      'Drücke dich mit dem Gewicht auf den Fersen und nach außen geschobenen Knien wieder nach oben, geführt vom Kopf, bis du in der Ausgangsposition stehst.',
    ],
  },
  {
    canonicalName: 'Shoulder Press - With Bands',
    block: 1,
    note: 'Gerät wird im Deutschen nachgestellt.',
    name: 'Schulterdrücken mit Band',
    instructions: [
      'Stelle dich auf ein Widerstandsband, sodass bei gestreckten Armen Spannung anliegt. Greife die Griffe und hebe sie seitlich auf Schulterhöhe.',
      'Drehe die Handgelenke so, dass die Handflächen nach vorne zeigen. Die Ellenbogen sind gebeugt, Ober- und Unterarme liegen in einer Linie zum Rumpf. Das ist die Ausgangsposition.',
      'Drücke die Griffe beim Ausatmen nach oben, bis die Arme vollständig gestreckt sind.',
    ],
  },
  {
    canonicalName: 'Calf Raises - With Bands',
    block: 1,
    note: 'Gerät wird im Deutschen nachgestellt.',
    name: 'Wadenheben mit Band',
    instructions: [
      'Stelle dich mit den Fußballen auf ein Widerstandsband. Achte darauf, dass das Band auf beiden Seiten gleich lang ist.',
      'Halte die Griffe seitlich neben dem Kopf, wie zum Schulterdrücken: Handflächen nach vorne, Ellenbogen gebeugt und seitlich. Dadurch entsteht Spannung auf dem Band. Das ist die Ausgangsposition.',
      'Halte die Hände an den Schultern, gehe beim Ausatmen auf die Fußballen und spanne die Waden oben fest an.',
      'Halte die Spannung eine Sekunde und senke die Fersen langsam in die Ausgangsposition.',
    ],
  },
  {
    canonicalName: 'Leg Press',
    block: 1,
    note: 'Waden arbeiten an der Beinpresse allenfalls unterstützend; primär bleiben Kniestrecker und Hüftstrecker.',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings', 'calves'],
    instructions: [
      'Setze dich in die Beinpresse und stelle die Füße etwa schulterbreit mittig auf die Platte.',
      'Löse die Sicherungen und drücke die Platte nach oben, bis die Beine gestreckt sind, ohne die Knie durchzudrücken. Das ist die Ausgangsposition.',
      'Senke die Platte beim Einatmen langsam ab, bis Ober- und Unterschenkel einen rechten Winkel bilden.',
      'Drücke beim Ausatmen vor allem über die Fersen und die Oberschenkelvorderseite zurück in die Ausgangsposition.',
      'Sichere die Verriegelung nach dem Satz zuverlässig, bevor du die Maschine verlässt.',
    ],
  },
  {
    canonicalName: 'Box Squat',
    block: 1,
    note: 'Soleus als Primärmuskel bei einer Kniebeuge nicht plausibel.',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings', 'adductors', 'lower_back'],
    instructions: [
      'Stelle eine Box in passender Höhe hinter dich in das Rack. Üblicherweise wählst du sie so, dass du auf Parallele kommst; höher oder tiefer ist je nach Ziel möglich.',
      'Tritt unter die Stange und lege sie auf den oberen Rücken. Führe die Schulterblätter zusammen, drehe die Ellenbogen nach vorne, hebe die Stange aus der Ablage und tritt zurück. Ein weiter Stand betont Rücken, Gesäß, Adduktoren und Beinrückseite, ein engerer die Oberschenkelvorderseite.',
      'Rücken, Schultern und Rumpf bleiben fest. Schiebe Knie und Gesäß nach außen und setze die Hüfte zurück, bis du auf der Box sitzt. Halte dort kurz an und federe niemals von der Box ab.',
      'Drücke dich mit dem Gewicht auf den Fersen wieder nach oben und halte die Körperspannung bis zum Stand.',
    ],
  },
  {
    canonicalName: 'Crunches',
    block: 1,
    note: 'Singular, wie alle übrigen Katalogeinträge.',
    name: 'Crunch',
    instructions: [
      'Lege dich flach auf den Rücken. Die Füße stehen auf dem Boden oder liegen auf einer Bank, die Knie sind etwa 90 Grad gebeugt.',
      'Lege die Hände locker seitlich an den Kopf und halte die Ellenbogen nach innen. Verschränke die Finger nicht hinter dem Kopf.',
      'Drücke den unteren Rücken in den Boden und rolle die Schultern vom Boden ab.',
      'Spanne die Bauchmuskulatur beim Ausatmen an. Die Schultern heben sich nur wenige Zentimeter, der untere Rücken bleibt am Boden. Halte die Spannung oben eine Sekunde und arbeite langsam statt mit Schwung.',
      'Senke den Oberkörper beim Einatmen langsam in die Ausgangsposition zurück.',
    ],
  },
  {
    canonicalName: 'Deficit Deadlift',
    block: 1,
    note: 'Kreuzheben ist eine Hüftstreckung; die Quelle nannte neun Sekundärmuskeln, was jede Muskelfilterung unbrauchbar macht.',
    primaryMuscles: ['hamstrings', 'glutes', 'lower_back'],
    secondaryMuscles: ['quads', 'upper_back', 'traps', 'forearms'],
    instructions: [
      'Stelle dich auf eine Erhöhung von etwa 3 bis 8 cm. Tritt so an die Stange heran, dass sie über der Mitte deiner Füße liegt; die Füße stehen etwa hüftbreit. Beuge dich aus der Hüfte und greife die Stange schulterbreit, im Obergriff oder bei schweren Sätzen im Kreuzgriff.',
      'Nimm mit gesetztem Stand und Griff tief Luft, senke die Hüfte und beuge die Knie, bis die Schienbeine die Stange berühren. Blick nach vorne, Brust auf, Rücken gestreckt. Drücke über die Fersen und führe die Stange nach oben. Sobald sie die Knie passiert hat, ziehe die Schulterblätter zusammen und schiebe die Hüfte nach vorne an die Stange.',
      'Senke die Stange, indem du aus der Hüfte beugst und sie geführt zum Boden bringst.',
    ],
  },
  {
    canonicalName: 'One-Arm Kettlebell Push Press',
    block: 1,
    note: 'Fachlich unverändert freigegeben; Kategorie bleibt strength.',
    instructions: [
      'Halte eine Kettlebell am Griff. Setze sie an der Schulter ab, indem du Beine und Hüfte streckst und die Kettlebell zur Schulter ziehst; drehe dabei das Handgelenk, sodass die Handfläche nach vorne zeigt. Das ist die Ausgangsposition.',
      'Gehe mit gebeugten Knien leicht in die Knie, der Oberkörper bleibt aufrecht.',
      'Kehre die Bewegung sofort um und drücke über die Fersen nach oben. Drücke die Kettlebell mit dem so erzeugten Schwung über den Kopf, bis der Arm gestreckt ist. Senke das Gewicht für die nächste Wiederholung ab.',
    ],
  },
  {
    canonicalName: 'One-Arm Medicine Ball Slam',
    block: 1,
    note: 'Fachlich unverändert freigegeben.',
    instructions: [
      'Stehe in einer versetzten, athletischen Grundstellung. Halte den Medizinball in einer Hand auf der Seite des hinteren Beins. Das ist die Ausgangsposition.',
      'Hole mit dem Arm aus und führe den Ball über den Kopf. Strecke dabei Hüfte, Knie und Sprunggelenke, um Spannung aufzubauen.',
      'Wirf den Ball aus der vollen Streckung heraus kraftvoll direkt vor dir auf den Boden, indem du Schulter, Wirbelsäule und Hüfte beugst.',
      'Fange den zurückspringenden Ball und wiederhole.',
    ],
  },
  {
    canonicalName: 'One Arm Floor Press',
    block: 1,
    note: 'Im deutschen Coaching-Sprachgebrauch bleibt „Floor Press" englisch.',
    name: 'Einarmiges Floor Press',
    instructions: [
      'Lege dich mit dem Rücken flach auf den Boden oder eine Matte, die Knie sind angewinkelt.',
      'Lass dir die Stange von einem Partner in eine Hand geben. Der Arm ist zu Beginn nahezu gestreckt, der Griff neutral, die Handfläche zeigt zum Rumpf. Der freie Arm liegt seitlich am Boden.',
      'Senke die Stange beim Einatmen ab, bis der Ellenbogen den Boden berührt.',
      'Drücke die Stange beim Ausatmen zurück in die Ausgangsposition.',
      'Wechsle nach der vorgesehenen Anzahl den Arm.',
    ],
  },
  {
    canonicalName: 'One-Arm Kettlebell Snatch',
    block: 1,
    note: 'Kategorie bleibt strength. Das Reißen wird von der Hüftstreckung erzeugt; die Schulter fängt die Last nur auf.',
    primaryMuscles: ['glutes', 'hamstrings', 'shoulders'],
    secondaryMuscles: ['traps', 'lower_back', 'forearms'],
    instructions: [
      'Stelle eine Kettlebell zwischen deine Füße. Beuge die Knie und schiebe das Gesäß nach hinten.',
      'Blicke geradeaus und schwinge die Kettlebell zwischen den Beinen nach hinten.',
      'Kehre die Richtung sofort um, strecke Hüfte und Knie explosiv und beschleunige die Kettlebell nach oben. Drehe auf Schulterhöhe die Hand ein und stoße gerade nach oben durch, sodass du das Gewicht mit gestrecktem Arm über dem Kopf auffängst.',
    ],
  },
  {
    canonicalName: 'One-Arm Kettlebell Jerk',
    block: 1,
    note: 'Kategorie bleibt strength. Der Antrieb kommt aus den Beinen, die Schulter stabilisiert über Kopf.',
    primaryMuscles: ['shoulders', 'quads'],
    secondaryMuscles: ['glutes', 'triceps', 'calves'],
    instructions: [
      'Halte eine Kettlebell am Griff. Setze sie an der Schulter ab, indem du Beine und Hüfte streckst und die Kettlebell zur Schulter ziehst; drehe dabei das Handgelenk, sodass die Handfläche nach vorne zeigt. Das ist die Ausgangsposition.',
      'Gehe leicht in die Knie, der Oberkörper bleibt aufrecht.',
      'Kehre die Bewegung sofort um und drücke explosiv über die Fersen nach oben. Bringe die Kettlebell mit diesem Schwung über den Kopf in die Armstreckung und tauche dafür in eine Kniebeugeposition unter das Gewicht. Richte dich mit dem Gewicht über Kopf wieder auf.',
      'Senke das Gewicht für die nächste Wiederholung ab.',
    ],
  },
  {
    canonicalName: 'One-Arm Kettlebell Clean',
    block: 1,
    note: 'Umsetzen wird von der Hüftstreckung erzeugt, nicht allein von der Beinrückseite.',
    primaryMuscles: ['glutes', 'hamstrings', 'traps'],
    secondaryMuscles: ['lower_back', 'shoulders', 'forearms'],
    instructions: [
      'Stelle eine Kettlebell zwischen deine Füße. Schiebe im Herunterbeugen das Gesäß nach hinten und halte den Blick nach vorne.',
      'Setze die Kettlebell an der Schulter ab, indem du Beine und Hüfte streckst und sie zur Schulter führst. Das Handgelenk dreht dabei ein.',
      'Führe das Gewicht zurück in die Ausgangsposition.',
    ],
  },
  {
    canonicalName: 'One-Arm Kettlebell Clean and Jerk',
    block: 1,
    note: 'Kategorie bleibt strength. Kombination aus Umsetzen und Stoßen, daher Hüfte und Schulter gemeinsam primär.',
    primaryMuscles: ['glutes', 'shoulders'],
    secondaryMuscles: ['hamstrings', 'quads', 'traps', 'triceps'],
    instructions: [
      'Halte eine Kettlebell am Griff.',
      'Setze sie an der Schulter ab, indem du Beine und Hüfte streckst und die Kettlebell zur Schulter ziehst; das Handgelenk dreht ein, bis die Handfläche nach vorne zeigt.',
      'Gehe leicht in die Knie, der Oberkörper bleibt aufrecht.',
      'Kehre die Bewegung sofort um und drücke explosiv über die Fersen nach oben. Bringe die Kettlebell mit diesem Schwung in die Armstreckung über den Kopf.',
      'Tauche dafür in eine Kniebeugeposition unter das Gewicht.',
      'Richte dich mit dem Gewicht über Kopf auf und setze es anschließend für die nächste Wiederholung ab.',
    ],
  },
  {
    canonicalName: 'One Arm Dumbbell Bench Press',
    block: 1,
    note: 'Fachlich unverändert freigegeben.',
    instructions: [
      'Lege dich auf eine Flachbank und stelle die Kurzhantel zunächst auf dem Oberschenkel ab.',
      'Bringe die Kurzhantel mit Hilfe des Oberschenkels nach oben, bis du sie auf Schulterhöhe vor dir hältst. Die freie Hand hilft beim Positionieren.',
      'Drehe das Handgelenk so, dass die Handfläche von dir weg zeigt. Das ist die Ausgangsposition.',
      'Senke das Gewicht beim Einatmen langsam und kontrolliert zur Seite ab.',
      'Drücke die Kurzhantel beim Ausatmen über die Brustmuskulatur nach oben, halte oben kurz und senke wieder langsam ab. Das Absenken darf ruhig doppelt so lange dauern wie das Drücken.',
      'Wechsle nach der vorgesehenen Anzahl den Arm.',
    ],
  },
  {
    canonicalName: 'One-Arm Dumbbell Row',
    block: 1,
    note: 'Fachlich unverändert freigegeben.',
    instructions: [
      'Lege je eine Kurzhantel neben eine Flachbank.',
      'Stelle das rechte Knie auf das Ende der Bank, beuge den Oberkörper aus der Hüfte nach vorne, bis er parallel zum Boden steht, und stütze dich mit der rechten Hand auf der Bank ab.',
      'Nimm die Kurzhantel mit der linken Hand auf und halte den unteren Rücken gerade. Die Handfläche zeigt zum Rumpf. Das ist die Ausgangsposition.',
      'Ziehe das Gewicht beim Ausatmen gerade nach oben zur Seite des Brustkorbs. Der Oberarm bleibt eng am Körper, der Rumpf ruhig. Die Arbeit kommt aus dem Rücken, nicht aus den Armen; die Unterarme halten nur die Hantel.',
      'Senke das Gewicht beim Einatmen gerade in die Ausgangsposition ab.',
      'Wechsle nach der vorgesehenen Anzahl die Seite.',
    ],
  },
  {
    canonicalName: 'One Arm Lat Pulldown',
    block: 1,
    note: 'Der Latzug ist maskulin — die Genustabelle führte ihn als Neutrum.',
    name: 'Einarmiger Latzug',
    instructions: [
      'Wähle ein passendes Gewicht und stelle das Beinpolster so ein, dass es dich sicher hält. Greife den Griff im Obergriff. Das ist die Ausgangsposition.',
      'Ziehe den Griff nach unten und führe den Ellenbogen bei der Beugung eng an die Seite.',
      'Halte unten kurz und führe den Griff langsam in die Ausgangsposition zurück.',
      'Lass das Gewicht zwischen den Wiederholungen nicht vollständig ablegen, damit die Spannung erhalten bleibt.',
    ],
  },
  {
    canonicalName: 'One-Arm Incline Lateral Raise',
    block: 1,
    note: 'Seitheben ist im Schema der Quelle pull; die übrigen Seithebe-Einträge stehen ebenfalls so.',
    forceType: 'pull',
    instructions: [
      'Lege dich seitlich auf eine Schrägbank. Die Schulter liegt an der Bank an, der untere Arm liegt quer vor dem Körper.',
      'Halte die Kurzhantel im oberen Arm und strecke ihn parallel zum Boden vor dir aus. Das ist die Ausgangsposition.',
      'Führe ein Seitheben aus: Der Arm wandert gestreckt nach oben, bis er zur Decke zeigt. Atme dabei aus und halte die Spannung in der Schulter kurz.',
      'Senke das Gewicht beim Einatmen quer vor dem Körper in die Ausgangsposition zurück.',
      'Wechsle nach der vorgesehenen Anzahl den Arm.',
    ],
  },
  {
    canonicalName: 'One-Arm Side Deadlift',
    block: 1,
    note: 'Kreuzheben belastet die hintere Kette; quads als Primärmuskel widerspricht dem Bewegungsmuster hinge.',
    primaryMuscles: ['hamstrings', 'glutes'],
    secondaryMuscles: ['lower_back', 'quads', 'traps', 'forearms'],
    instructions: [
      'Stelle dich seitlich neben die Mitte einer Langhantel. Beuge die Knie und senke den Körper, bis du die Stange erreichst.',
      'Greife die Stange wie einen Koffer, die Handfläche zeigt zum Körper. Bei hohen Lasten kann eine Handgelenkbandage sinnvoll sein. Das ist die Ausgangsposition.',
      'Hebe die Stange beim Ausatmen über die Beinarbeit an, bis du aufrecht stehst und der Arm gestreckt ist.',
      'Senke die Stange beim Einatmen langsam ab und beuge dabei die Knie.',
      'Wechsle nach der vorgesehenen Anzahl die Seite.',
    ],
  },
  {
    canonicalName: 'Single Leg Glute Bridge',
    block: 1,
    note: 'Fachlich unverändert freigegeben.',
    instructions: [
      'Lege dich auf den Rücken, die Füße stehen auf dem Boden, die Knie sind gebeugt.',
      'Hebe ein Bein an und ziehe das Knie zur Brust. Das ist die Ausgangsposition.',
      'Drücke über die Ferse des Standbeins, strecke die Hüfte nach oben und hebe das Gesäß vom Boden.',
      'Strecke so weit wie möglich, halte kurz und kehre in die Ausgangsposition zurück.',
    ],
  },
  {
    canonicalName: 'One Leg Barbell Squat',
    block: 1,
    note: 'Fachlich unverändert freigegeben.',
    instructions: [
      'Stelle dich mit dem Rücken zu einer Flachbank, etwa 60 bis 90 cm davor. Die Langhantel liegt vor dir auf dem Boden, die Füße stehen schulterbreit.',
      'Beuge die Knie und hebe die Stange im Obergriff etwas weiter als schulterbreit an, bis du sie vor der Brust ablegen kannst.',
      'Führe die Stange über den Kopf auf den Nacken. Setze einen Fuß nach hinten auf die Bank, der andere bleibt vorne stehen. Halte den Kopf oben und den Rücken gerade; ein Blick nach unten kostet das Gleichgewicht.',
      'Senke dich beim Einatmen langsam ab, bis der Oberschenkel des vorderen Beins parallel zum Boden steht. Das Knie steht dann über den Zehen, die Brust über der Mitte des Oberschenkels.',
      'Drücke dich beim Ausatmen über die Oberschenkelvorderseite zurück nach oben; Brust und Hüfte führen die Bewegung.',
      'Wechsle nach der vorgesehenen Anzahl das Bein.',
    ],
  },
  {
    canonicalName: 'Single-Leg Leg Extension',
    block: 1,
    note: 'Fachlich unverändert freigegeben.',
    instructions: [
      'Setze dich in die Maschine und stelle sie passend ein. Das Polster liegt am unteren Schienbein an, ohne das Sprunggelenk zu berühren; der Drehpunkt liegt auf Höhe des Knies.',
      'Strecke bei aufrechter Haltung ein Bein vollständig und halte oben kurz.',
      'Führe das Gewicht zurück, ohne es abzulegen, damit die Spannung erhalten bleibt.',
    ],
  },
  {
    canonicalName: 'Elevated Cable Rows',
    block: 1,
    note: 'Rudern am Kabelzug arbeitet primär über den oberen Rücken; Latissimus und Trapez unterstützen.',
    primaryMuscles: ['upper_back', 'lats'],
    secondaryMuscles: ['biceps', 'traps'],
    instructions: [
      'Lege eine etwa 10 bis 15 cm hohe Erhöhung auf den Sitz der Rudermaschine.',
      'Setze dich darauf und stelle die Füße auf das Trittbrett. Die Knie bleiben leicht gebeugt und nicht durchgedrückt.',
      'Beuge dich mit natürlicher Rückenhaltung nach vorne und greife den V-Griff.',
      'Ziehe dich mit gestreckten Armen auf, bis der Oberkörper im rechten Winkel zu den Beinen steht. Der Rücken ist leicht gestreckt, die Brust heraus; du spürst eine Dehnung im Latissimus. Das ist die Ausgangsposition.',
      'Ziehe den Griff bei ruhigem Oberkörper eng am Körper zum Bauch, atme dabei aus und spanne die Rückenmuskulatur fest an. Halte kurz und führe den Griff beim Einatmen langsam zurück.',
    ],
  },
  {
    canonicalName: 'Flutter Kicks',
    block: 1,
    note: 'In der Bauchlage über die Bankkante arbeitet die hintere Kette, nicht die Bauchmuskulatur.',
    primaryMuscles: ['glutes', 'hamstrings'],
    secondaryMuscles: ['lower_back'],
    instructions: [
      'Lege dich bäuchlings auf eine Flachbank, die Hüfte an der Kante. Die Beine sind gestreckt und angehoben, die Hände greifen die vordere Bankkante.',
      'Spanne Gesäß und Beinrückseite an und hebe die gestreckten Beine bis auf Hüfthöhe. Das ist die Ausgangsposition.',
      'Hebe das linke Bein höher als das rechte.',
      'Senke das linke Bein, während du das rechte hebst.',
      'Wechsle so weiter, als würdest du im Wasser strampeln. Bleibe durchgehend kontrolliert und atme normal weiter.',
    ],
  },
  {
    canonicalName: 'Front Barbell Squat',
    block: 1,
    note: 'Gebräuchlicher deutscher Name. Die Frontkniebeuge ist eine Standardübung im Coaching und nicht advanced.',
    name: 'Frontkniebeuge',
    difficulty: 'intermediate',
    instructions: [
      'Führe die Übung aus Sicherheitsgründen im Rack aus. Lege die Stange auf passender Höhe ab, tritt darunter und führe die Arme unter der Stange durch. Die Ellenbogen bleiben hoch, die Oberarme knapp über der Parallelen. Die Stange liegt auf den vorderen Schultern; kreuze die Arme und halte sie sicher.',
      'Hebe die Stange aus der Ablage, indem du gleichzeitig mit den Beinen drückst und den Oberkörper aufrichtest.',
      'Tritt zurück und stelle die Füße etwa schulterbreit mit leicht nach außen gedrehten Zehen. Halte den Kopf oben und den Rücken gerade. Das ist die Ausgangsposition.',
      'Senke dich beim Einatmen langsam ab, indem du die Knie beugst und die Haltung aufrecht hältst. Gehe so tief, bis die Oberschenkel etwas unter der Parallelen sind. Die Knie bleiben dabei über den Zehen und wandern nicht darüber hinaus.',
      'Drücke dich beim Ausatmen vor allem über den Mittelfuß nach oben und strecke die Beine zurück in die Ausgangsposition.',
    ],
  },
];

/**
 * Block 2 — Strength, part 2. Reviewed 2026-08-15.
 *
 * The category, force-type and naming rules settled in this block apply to the
 * whole catalogue and live in `rules.ts`; only what is specific to one exercise
 * is here.
 */
export const BLOCK_2: readonly ReviewDecision[] = [
  {
    canonicalName: 'Stiff Leg Barbell Good Morning',
    block: 2,
    note: 'Dieselbe Bewegung wie der Good Morning, dort primär hamstrings. Gestreckt ist die schwerere Variante.',
    name: 'Good Morning mit gestreckten Beinen',
    primaryMuscles: ['hamstrings', 'glutes'],
    secondaryMuscles: ['lower_back', 'abs'],
    difficulty: 'intermediate',
    forceType: 'pull',
  },
  {
    canonicalName: 'Weighted Squat',
    block: 2,
    note: 'Zwei Bänke, Kurzhantel und Gewichtsgürtel — die Ausführung braucht alle drei. Dafür wurde `weight_belt` ins Equipment-Vokabular aufgenommen. Der Name benennt jetzt die Zusatzlast statt sie zu verschweigen.',
    name: 'Kniebeuge mit Gewicht',
    equipment: ['dumbbell', 'weight_belt', 'bench'],
  },
  {
    canonicalName: 'Hanging Leg Raise',
    block: 2,
    note: 'Die Anleitung verlangt gestreckte Beine nur in der Ausgangsposition, nicht über die ganze Bewegung.',
    difficulty: 'intermediate',
  },
  {
    canonicalName: 'Isometric Wipers',
    block: 2,
    note: '„Scheibenwischer" ist im Deutschen für die liegende Beinrotation belegt. Die Anleitung beschreibt ein seitliches Verlagern im Liegestütz.',
    name: 'Seitliches Verlagern im Liegestütz',
  },
  {
    canonicalName: 'External Rotation with Cable',
    block: 2,
    note: 'Der Quelltext war der der Bandvariante und nannte durchgehend das falsche Gerät.',
    instructions: [
      'Stelle den Kabelzug auf Ellenbogenhöhe ein. Stelle dich mit der linken Seite zum Gerät, etwa einen Schritt entfernt.',
      'Greife den Griff mit der rechten Hand und presse den Ellenbogen fest an die Seite. Ein untergeklemmtes Polster hilft, ihn dort zu halten.',
      'Der Ellenbogen ist auf 90 Grad gebeugt, die Hand liegt vor dem Bauch. Das ist die Ausgangsposition.',
      'Rotiere den Unterarm nach außen, ohne den Ellenbogen von der Seite zu lösen.',
      'Führe die Bewegung so weit wie möglich, halte kurz und kehre kontrolliert in die Ausgangsposition zurück.',
    ],
  },
  {
    canonicalName: 'Cable Hip Adduction',
    block: 2,
    note: 'Eine Adduktion wird von den Adduktoren erzeugt; die Manschette sitzt an einem Knöchel.',
    primaryMuscles: ['adductors'],
    secondaryMuscles: [],
    unilateral: true,
  },
  {
    canonicalName: 'Cable Internal Rotation',
    block: 2,
    note: 'Eingelenkig, wie die Außenrotation.',
    mechanic: 'isolation',
  },
  {
    canonicalName: 'Cable Rear Delt Fly',
    block: 2,
    note: 'Der Arm bleibt gestreckt — der Trizeps arbeitet nicht; die Bewegung zieht über den oberen Rücken.',
    secondaryMuscles: ['upper_back'],
  },
  {
    canonicalName: 'Cable Russian Twists',
    block: 2,
    note: 'Die Anleitung verlangt einen Gymnastikball; eine Rumpfrotation ist Arbeit der schrägen Bauchmuskulatur.',
    equipment: ['cable', 'exercise_ball'],
    primaryMuscles: ['abs', 'obliques'],
  },
  {
    canonicalName: 'Cable Chest Press - Incline',
    block: 2,
    note: 'Der Quelltext beschrieb die Flachversion und erwähnte die Schrägstellung mit keinem Wort.',
    instructions: [
      'Stelle die Rückenlehne auf eine Schrägstellung von etwa 30 bis 45 Grad und wähle ein passendes Gewicht.',
      'Setze dich an die Lehne und greife die Griffe. Die Oberarme stehen etwa auf Höhe der oberen Brust, die Ellenbogen sind gebeugt. Das ist die Ausgangsposition.',
      'Drücke die Griffe schräg nach vorne oben zusammen und strecke die Ellenbogen. Die Schultern bleiben an der Lehne.',
      'Halte in der Streckung kurz und führe die Griffe kontrolliert zurück, ohne die Spannung auf den Kabeln abzulegen.',
    ],
  },
  {
    canonicalName: 'Cable Seated Lateral Raise',
    block: 2,
    note: 'Die Anleitung beschreibt vorgebeugtes Seitheben — also die hintere Schulter, nicht die seitliche.',
    name: 'Vorgebeugtes Seitheben am Kabelzug',
  },
  {
    canonicalName: 'Kettlebell Hang Clean',
    block: 2,
    note: 'Angleichung an Block 1 #1: Umsetzen kommt aus der Hüftstreckung.',
    primaryMuscles: ['glutes', 'hamstrings', 'traps'],
    secondaryMuscles: ['lower_back', 'shoulders', 'forearms'],
  },
  {
    canonicalName: 'Kettlebell Sumo High Pull',
    block: 2,
    note: 'Der High Pull wird aus der Hüfte erzeugt; der Trapez zieht nach.',
    primaryMuscles: ['glutes', 'hamstrings', 'traps'],
    secondaryMuscles: ['quads', 'adductors', 'shoulders'],
  },
  {
    canonicalName: 'Chin-Up',
    block: 2,
    note: 'Ein Klimmzug im Kammgriff ist für Anfänger in der Regel nicht ausführbar.',
    difficulty: 'intermediate',
  },
  {
    canonicalName: 'Dumbbell Prone Incline Curl',
    block: 2,
    note: 'Gestrichen.',
    remove:
      'Gestrichen. Der Name blieb in jeder regelkonformen Fassung ein Dreifachkompositum, und die Übung ist gegenüber dem Schräg-Curl mit Kurzhanteln keine eigenständige Bewegung, sondern dieselbe in Bauchlage.',
  },
  {
    canonicalName: 'Dumbbell Floor Press',
    block: 2,
    note: 'Angleichung an Block 1 #19 („Einarmiges Floor Press"); der Bizeps arbeitet bei einer Druckbewegung nicht.',
    name: 'Floor Press mit Kurzhanteln',
    secondaryMuscles: ['shoulders'],
  },
  {
    canonicalName: 'Dumbbell One-Arm Upright Row',
    block: 2,
    note: 'Angleichung an Block 1 #8: aufrechtes Rudern zieht primär über den Trapez.',
    primaryMuscles: ['traps'],
    secondaryMuscles: ['shoulders', 'biceps'],
    forceType: 'pull',
  },
  {
    canonicalName: 'Dumbbell One-Arm Shoulder Press',
    block: 2,
    note: 'Die Anleitung verlangt eine Bank mit Rückenlehne.',
    equipment: ['dumbbell', 'bench'],
  },
];

/**
 * Block 3 — Strength, part 3. Reviewed 2026-08-15.
 *
 * Two implements entered the vocabulary here: `weight_plate` and
 * `gymnastic_rings`. Both because an exercise could not otherwise say what it
 * needs — a plate pinch was filed under `machine`, a ring muscle-up under
 * `pull_up_bar`. Neither is a special case; both are ordinary equipment.
 *
 * The recurring correction in this block is the bench. Fourteen exercises name
 * a bench in their instructions and did not list one, because the source
 * recorded only the implement that carries the load.
 */
export const BLOCK_3: readonly ReviewDecision[] = [
  {
    canonicalName: 'Barbell Lunge',
    block: 3,
    note: 'Der Ausfallschritt streckt die Hüfte mit; das Gesäß ist nicht nur unterstützend.',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings', 'calves'],
  },
  {
    canonicalName: 'Smith Single-Leg Split Squat',
    block: 3,
    note: 'Angleichung an die übrige Ausfallschritt-Familie.',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings', 'calves'],
  },
  {
    canonicalName: 'Barbell Hack Squat',
    block: 3,
    note: 'Die hinter dem Körper geführte Hantel verlagert Arbeit auf die Hüftstreckung.',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings', 'forearms'],
  },
  {
    canonicalName: 'Barbell Deadlift',
    block: 3,
    note: 'Angleichung an das Defizit-Kreuzheben aus Block 1; acht Sekundärmuskeln machen jede Muskelfilterung unbrauchbar.',
    primaryMuscles: ['hamstrings', 'glutes', 'lower_back'],
    secondaryMuscles: ['quads', 'upper_back', 'traps', 'forearms'],
  },
  {
    canonicalName: 'Lying Rear Delt Raise',
    block: 3,
    note: 'Unflektierter englischer Plural; die Flachbank fehlte im Equipment.',
    name: 'Liegendes hinteres Seitheben',
    equipment: ['dumbbell', 'bench'],
  },
  {
    canonicalName: 'Dumbbell Lying One-Arm Rear Lateral Raise',
    block: 3,
    note: 'Die Anleitung verlangt eine leicht angestellte Schrägbank.',
    equipment: ['dumbbell', 'incline_bench'],
  },
  {
    canonicalName: 'Lying One-Arm Lateral Raise',
    block: 3,
    note: 'Die Anleitung beschreibt ein hinteres Seitheben in Bauchlage; der Name sagte das nicht.',
    name: 'Einarmiges liegendes hinteres Seitheben',
    equipment: ['dumbbell', 'bench'],
  },
  {
    canonicalName: 'Dumbbell Lying Rear Lateral Raise',
    block: 3,
    note: 'Die Anleitung verlangt eine leicht angestellte Schrägbank.',
    equipment: ['dumbbell', 'incline_bench'],
  },
  {
    canonicalName: 'Muscle Up',
    block: 3,
    note: 'Die Anleitung beschreibt Ringe, nicht die Stange. Der Muscle-up ist die Kernübung der Disziplin und keine Zwischenstufe.',
    equipment: ['gymnastic_rings'],
    difficulty: 'advanced',
    category: 'calisthenics',
  },
  {
    canonicalName: 'Decline Reverse Crunch',
    block: 3,
    note: 'Die Negativbank fehlte; derselbe Crunch ohne Bank steht korrekt auf isolation.',
    equipment: ['bench'],
    mechanic: 'isolation',
  },
  {
    canonicalName: 'Plate Pinch Hold',
    block: 3,
    note: 'Eine gehaltene Hantelscheibe ist keine Maschine. Dafür wurde `weight_plate` ins Vokabular aufgenommen.',
    equipment: ['weight_plate'],
  },
  {
    canonicalName: 'Power Clean',
    block: 3,
    note: 'Die Brust hat am Umsetzen keinen Anteil. Langhantelübung der Disziplin (Regel G). 24 Quellschritte auf 7 verdichtet.',
    primaryMuscles: ['glutes', 'hamstrings', 'traps'],
    secondaryMuscles: ['quads', 'lower_back', 'upper_back', 'forearms'],
    category: 'olympic_weightlifting',
    instructions: [
      'Stelle dich etwas weiter als schulterbreit vor die Stange, die Zehen leicht nach außen. Die Stange liegt über den Fußballen, etwa eine Handbreit vor den Schienbeinen.',
      'Gehe in die Hocke und greife die Stange im Obergriff, die Hände etwas weiter als schulterbreit außerhalb der Knie, die Arme gestreckt. Rücken flach oder leicht gestreckt, Brust heraus, Schulterblätter zusammengezogen, Blick geradeaus.',
      'Hebe die Stange vom Boden, indem du Hüfte und Knie kraftvoll streckst. Der Oberkörperwinkel bleibt dabei gleich — die Hüfte darf nicht vor den Schultern hochkommen. Die Arme bleiben gestreckt, die Stange läuft eng an den Schienbeinen.',
      'Sobald die Stange die Knie passiert hat, schiebe die Hüfte nach vorne an die Stange und beuge die Knie wieder leicht. Die Oberschenkel berühren die Stange.',
      'Strecke Hüfte und Knie explosiv und komme auf die Fußballen. Ziehe unmittelbar danach die Schultern kraftvoll nach oben, ohne die Ellenbogen schon zu beugen. Die Stange bleibt eng am Körper.',
      'Auf dem höchsten Punkt des Schulterzugs beugst du die Ellenbogen und ziehst dich unter die Stange. Drehe die Arme um die Stange herum und fange sie in einer Viertelkniebeuge auf den vorderen Schultern auf. Die Oberarme stehen parallel zum Boden, der Oberkörper bleibt aufrecht.',
      'Richte dich mit gestreckter Hüfte und gestreckten Knien auf. Senke die Stange anschließend kontrolliert auf die Oberschenkel und aus der Hüfte und den Knien heraus bis zum Boden ab.',
    ],
  },
  {
    canonicalName: 'Incline Cable Flye',
    block: 3,
    note: 'Die Anleitung verlangt eine auf 45 Grad gestellte Schrägbank.',
    equipment: ['cable', 'incline_bench'],
  },
  {
    canonicalName: 'Dumbbell Shoulder Press',
    block: 3,
    note: 'Bank mit Rückenlehne, wie bei der einarmigen Variante in Block 2 entschieden.',
    equipment: ['dumbbell', 'bench'],
  },
  {
    canonicalName: 'Shoulder Press, Barbell',
    block: 3,
    note: 'Bank mit Rückenlehne; die Brust arbeitet beim Überkopfdrücken nicht.',
    equipment: ['barbell', 'bench'],
    secondaryMuscles: ['triceps', 'upper_back'],
  },
  {
    canonicalName: 'Dumbbell Seated One-Leg Calf Raise',
    block: 3,
    note: 'Sitzend ist das Knie gebeugt — das ist die Soleus-Variante, genau darin unterscheidet sie sich vom stehenden Wadenheben.',
    equipment: ['dumbbell', 'bench'],
    primaryMuscles: ['soleus'],
    secondaryMuscles: ['calves'],
  },
  {
    canonicalName: 'Barbell Seated Calf Raise',
    block: 3,
    note: 'Sitzend ist das Knie gebeugt — Soleus statt Gastrocnemius.',
    equipment: ['barbell', 'bench'],
    primaryMuscles: ['soleus'],
    secondaryMuscles: ['calves'],
  },
  {
    canonicalName: 'Split Squat with Dumbbells',
    block: 3,
    note: 'Die Anleitung setzt den hinteren Fuß erhöht ab; ohne Bank nicht ausführbar.',
    equipment: ['dumbbell', 'bench'],
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings'],
  },
  {
    canonicalName: 'Dumbbell Clean',
    block: 3,
    note: 'Angleichung an die übrigen Umsetz-Varianten aus Block 1 und 2.',
    primaryMuscles: ['glutes', 'hamstrings', 'traps'],
    secondaryMuscles: ['quads', 'lower_back', 'forearms', 'shoulders'],
  },
  {
    canonicalName: 'Calf Raise On A Dumbbell',
    block: 3,
    note: 'Man steht auf der Hantelstange, statt Kurzhanteln zu halten — „mit Kurzhanteln" sagte das Gegenteil.',
    name: 'Wadenheben auf einer Kurzhantel',
  },
];

/**
 * Block 4 — Strength, part 4. Reviewed 2026-08-15.
 *
 * Two naming decisions of this block reach beyond it. „Nackendrücken" means
 * *behind the neck* in German, and both military presses lower the bar to the
 * collarbone — the name described a different, far more shoulder-loading
 * exercise. The seated variant is dropped rather than renamed: with the standing
 * press correctly named, the two differ only in whether one sits down.
 *
 * Adjectives inside a name are lower case — „Stehendes aufrechtes Rudern". That
 * is carried by the term table, not by an override here.
 */
export const BLOCK_4: readonly ReviewDecision[] = [
  {
    canonicalName: 'Incline Dumbbell Curl',
    block: 4,
    note: 'Ohne Schrägbank nicht ausführbar.',
    equipment: ['dumbbell', 'incline_bench'],
    instructions: [
      'Setze dich auf eine Schrägbank und lasse die Arme mit je einer Kurzhantel gestreckt hängen. Die Ellenbogen bleiben nah am Rumpf, die Handflächen zeigen nach vorne.',
      'Beuge die Ellenbogen und führe die Hanteln bei ruhigem Oberarm bis auf Schulterhöhe. Nur die Unterarme bewegen sich. Halte oben eine Sekunde.',
      'Senke die Hanteln langsam in die Ausgangsposition zurück.',
    ],
  },
  {
    canonicalName: 'Incline Dumbbell Press',
    block: 4,
    note: 'Gebräuchlicher Begriff; ohne Schrägbank nicht ausführbar.',
    name: 'Schrägbankdrücken mit Kurzhanteln',
    equipment: ['dumbbell', 'incline_bench'],
    instructions: [
      'Setze dich auf eine Schrägbank und lege je eine Kurzhantel auf den Oberschenkeln ab, die Handflächen zeigen zueinander.',
      'Bringe die Hanteln mit Hilfe der Oberschenkel nacheinander auf Schulterhöhe und drehe die Handgelenke so, dass die Handflächen nach vorne zeigen. Das ist die Ausgangsposition.',
      'Drücke die Hanteln über die Brustmuskulatur nach oben und strecke die Arme.',
      'Halte oben kurz und senke das Gewicht langsam ab — das Absenken darf etwa doppelt so lange dauern wie das Drücken.',
      'Lege die Hanteln nach dem Satz zuerst auf den Oberschenkeln ab und dann auf dem Boden.',
    ],
  },
  {
    canonicalName: 'Side Laterals to Front Raise',
    block: 4,
    note: 'Der bisherige Name enthielt „seitliches" doppelt und benannte die Bewegung nicht.',
    name: 'Seit- und Frontheben im Wechsel',
    instructions: [
      'Stehe aufrecht und halte in jeder Hand eine Kurzhantel seitlich am Körper.',
      'Hebe die Hanteln bei leicht gebeugten Ellenbogen gerade nach vorne bis auf Schulterhöhe, ohne Schwung zu nehmen.',
      'Führe die Arme oben gestreckt zur Seite aus und senke sie von dort kontrolliert ab.',
      'Hebe bei der nächsten Wiederholung wieder zuerst nach vorne und führe die Hanteln dann seitlich aus. Wechsle so weiter.',
    ],
  },
  {
    canonicalName: 'Sit-Up',
    block: 4,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Lege dich auf den Rücken und klemme die Füße unter einen festen Gegenstand. Die Knie sind gebeugt.',
      'Lege die Hände hinter dem Kopf zusammen. Das ist die Ausgangsposition.',
      'Richte den Oberkörper beim Ausatmen auf, bis er mit den Oberschenkeln ein V bildet.',
      'Halte die Spannung eine Sekunde und senke den Oberkörper beim Einatmen langsam zurück.',
    ],
  },
  {
    canonicalName: 'Seated Bent-Over Rear Delt Raise',
    block: 4,
    note: 'Unflektierter Name mit englischem Plural; Flachbank fehlte; der obere Rücken arbeitet mit.',
    name: 'Sitzendes vorgebeugtes hinteres Seitheben',
    equipment: ['dumbbell', 'bench'],
    secondaryMuscles: ['upper_back'],
    instructions: [
      'Lege zwei Kurzhanteln vor eine Flachbank und setze dich an deren Ende, die Beine geschlossen.',
      'Beuge dich mit geradem Rücken aus der Hüfte nach vorne und nimm die Hanteln auf. Die Handflächen zeigen zueinander. Das ist die Ausgangsposition.',
      'Hebe die Hanteln bei ruhigem Oberkörper und leicht gebeugten Ellenbogen gerade zur Seite, bis beide Arme parallel zum Boden stehen. Führe die Arme dabei nicht nach hinten.',
      'Halte oben eine Sekunde und senke die Hanteln langsam in die Ausgangsposition.',
    ],
  },
  {
    canonicalName: 'Seated Barbell Twist',
    block: 4,
    note: 'Rumpfrotation ist Arbeit der schrägen Bauchmuskulatur; die Bank fehlte.',
    primaryMuscles: ['abs', 'obliques'],
    equipment: ['barbell', 'bench'],
    instructions: [
      'Setze dich ans Ende einer Flachbank, die Füße etwa schulterbreit. Lege eine Langhantel auf den Oberschenkeln ab und greife sie im Obergriff etwas weiter als schulterbreit.',
      'Hebe die Stange über den Kopf und lege sie im Nacken ab. Das ist die Ausgangsposition.',
      'Drehe den Oberkörper bei ruhigem Kopf und ruhigen Füßen langsam zur Seite, so weit es die Rumpfbeweglichkeit zulässt. Zu weit zu drehen ist die häufigste Verletzungsursache dieser Übung.',
      'Drehe kontrolliert zurück und wechsle die Seite.',
    ],
  },
  {
    canonicalName: 'Seated Leg Curl',
    block: 4,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Stelle die Maschine auf deine Körpergröße ein und setze dich mit dem Rücken an die Lehne.',
      'Lege die Unterschenkel oberhalb der Fersen auf die Rolle und sichere das Beckenpolster knapp über den Knien. Greife die seitlichen Griffe; die Beine sind gestreckt. Das ist die Ausgangsposition.',
      'Ziehe die Rolle beim Ausatmen durch Beugen der Knie so weit wie möglich zu den Oberschenkeln. Der Oberkörper bleibt ruhig. Halte eine Sekunde.',
      'Führe die Beine beim Einatmen langsam in die Ausgangsposition zurück.',
    ],
  },
  {
    canonicalName: 'Seated Barbell Military Press',
    block: 4,
    remove:
      'Wird nicht als eigener Eintrag geführt. Nach der Umbenennung des stehenden Militärdrückens unterscheiden sich beide nur noch dadurch, ob man dabei sitzt — das gehört in die Ausführungshinweise, nicht in einen zweiten Katalogeintrag.',
    note: 'Gestrichen zugunsten der stehenden Variante.',
  },
  {
    canonicalName: 'Seated Cable Shoulder Press',
    block: 4,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Wähle ein passendes Gewicht, setze dich und greife die Griffe. Die Oberarme stehen etwa im rechten Winkel zum Rumpf, die Ellenbogen sind ebenfalls etwa rechtwinklig gebeugt, Kopf und Brust aufgerichtet.',
      'Strecke die Ellenbogen und drücke die Griffe über dem Kopf zusammen.',
      'Halte oben kurz und führe die Griffe zurück, ohne die Spannung auf den Kabeln abzulegen.',
    ],
  },
  {
    canonicalName: 'Seated Bent-Over One-Arm Dumbbell Triceps Extension',
    block: 4,
    note: 'Der gebräuchliche deutsche Name derselben Übung; die Bank fehlte.',
    name: 'Trizeps-Kickback mit Kurzhantel',
    equipment: ['dumbbell', 'bench'],
    instructions: [
      'Setze dich ans Ende einer Flachbank und nimm eine Kurzhantel im Neutralgriff auf.',
      'Beuge die Knie leicht und den Oberkörper aus der Hüfte nach vorne, bis er beinahe parallel zum Boden steht. Der Rücken bleibt gerade, der Kopf oben.',
      'Der Oberarm liegt eng am Rumpf und parallel zum Boden, der Unterarm zeigt nach unten — etwa 90 Grad im Ellenbogen. Das ist die Ausgangsposition.',
      'Strecke den Arm beim Ausatmen über den Trizeps, bis der Unterarm parallel zum Boden steht. Nur der Unterarm bewegt sich.',
      'Halte oben eine Sekunde, senke langsam ab und wechsle nach der vorgesehenen Anzahl den Arm.',
    ],
  },
  {
    canonicalName: 'Seated Calf Raise',
    block: 4,
    note: 'Sitzend ist das Knie gebeugt — Soleus statt Gastrocnemius, wie in Block 3 für die beiden anderen sitzenden Wadenheben entschieden.',
    primaryMuscles: ['soleus'],
    secondaryMuscles: ['calves'],
    instructions: [
      'Setze dich in die Maschine und stelle die Fußballen auf die untere Kante der Trittfläche, die Fersen ragen darüber hinaus.',
      'Stelle das Polster auf die Oberschenkel knapp über den Knien ein und lege die Hände darauf. Hebe die Fersen leicht an und löse die Sicherung. Das ist die Ausgangsposition.',
      'Senke die Fersen beim Einatmen langsam ab, bis die Waden vollständig gedehnt sind.',
      'Drücke die Fersen beim Ausatmen so hoch wie möglich und halte die Spannung oben eine Sekunde.',
    ],
  },
  {
    canonicalName: 'Standing One-Arm Cable Curl',
    block: 4,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Greife einen Einzelgriff am unteren Kabelzug und stelle dich so weit vom Gerät entfernt auf, dass der Arm das Gewicht bereits hält.',
      'Der Oberarm steht senkrecht und ruhig, der Ellenbogen liegt am Körper, die Handfläche zeigt nach vorne. Die freie Hand stützt an der Hüfte.',
      'Beuge den Ellenbogen beim Ausatmen und führe den Griff nach oben, bis der Unterarm den Bizeps berührt. Nur der Unterarm bewegt sich.',
      'Halte die Spannung kurz und senke den Griff beim Einatmen zurück. Wechsle anschließend den Arm.',
    ],
  },
  {
    canonicalName: 'Standing Dumbbell Upright Row',
    block: 4,
    note: 'Fachlich unverändert; deutsche Textfassung. Der Name folgt der Kleinschreibung von Adjektiven im Namensinneren.',
    instructions: [
      'Halte in jeder Hand eine Kurzhantel im Obergriff, etwas enger als schulterbreit, vor den Oberschenkeln. Die Arme sind leicht gebeugt, der Rücken gerade.',
      'Ziehe die Hanteln beim Ausatmen eng am Körper nach oben, bis sie fast das Kinn erreichen. Die Ellenbogen führen die Bewegung und bleiben stets höher als die Unterarme.',
      'Halte oben eine Sekunde bei ruhigem Oberkörper.',
      'Senke die Hanteln beim Einatmen langsam in die Ausgangsposition zurück.',
    ],
  },
  {
    canonicalName: 'Standing Leg Curl',
    block: 4,
    note: 'Die Anleitung führt ausdrücklich ein Bein nach dem anderen.',
    unilateral: true,
    instructions: [
      'Stelle die Maschine auf deine Körpergröße ein und beuge den Oberkörper etwa 30 bis 45 Grad nach vorne. Die Rolle liegt oberhalb der Ferse am hinteren Unterschenkel, der Oberschenkel liegt auf dem Polster.',
      'Halte den Oberkörper vorgebeugt, greife die seitlichen Griffe und strecke das Bein vollständig. Das ist die Ausgangsposition.',
      'Beuge das Bein beim Ausatmen so weit wie möglich, ohne den Oberschenkel vom Polster zu heben. Halte oben eine Sekunde.',
      'Senke beim Einatmen kontrolliert ab und wechsle nach der vorgesehenen Anzahl das Bein.',
    ],
  },
  {
    canonicalName: 'Standing Cable Chest Press',
    block: 4,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Stelle beide Kabelzüge auf Brusthöhe ein und stelle dich mit je einem Griff in der Hand ein bis zwei Schritte davor. Ein versetzter Stand gibt mehr Halt.',
      'Die Oberarme stehen im rechten Winkel zum Rumpf, die Schulterblätter sind zusammengeführt. Das ist die Ausgangsposition.',
      'Strecke die Ellenbogen und drücke die Griffe nach vorne zusammen, während der übrige Körper ruhig bleibt.',
      'Halte vorne kurz und führe die Griffe in die Ausgangsposition zurück.',
    ],
  },
  {
    canonicalName: 'Standing Military Press',
    block: 4,
    note: '„Nackendrücken" heißt hinter dem Kopf; die Anleitung führt die Stange zum Schlüsselbein, also davor.',
    name: 'Schulterdrücken mit Langhantel im Stehen',
    instructions: [
      'Lege die Langhantel etwa auf Brusthöhe in ein Rack und greife sie im Obergriff, etwas weiter als schulterbreit.',
      'Beuge die Knie leicht, nimm die Stange auf das Schlüsselbein, hebe sie aus dem Rack und tritt zurück. Die Füße stehen schulterbreit.',
      'Drücke die Stange über den Kopf und strecke die Arme. Halte sie leicht vor dem Kopf. Das ist die Ausgangsposition.',
      'Senke die Stange beim Einatmen langsam zum Schlüsselbein.',
      'Drücke sie beim Ausatmen zurück nach oben.',
    ],
  },
  {
    canonicalName: 'Standing Calf Raises',
    block: 4,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Stelle das Polster der Wadenmaschine auf deine Körpergröße ein.',
      'Nimm die Polster auf die Schultern und stelle die Fußballen auf den Tritt, die Fersen ragen darüber hinaus. Strecke Hüfte und Knie, bis du aufrecht stehst; die Knie bleiben leicht gebeugt und werden nie durchgedrückt.',
      'Hebe die Fersen beim Ausatmen so hoch wie möglich und spanne die Waden an. Das Knie bleibt dabei unbewegt. Halte oben eine Sekunde.',
      'Senke die Fersen beim Einatmen langsam ab, bis die Waden gedehnt sind.',
    ],
  },
  {
    canonicalName: 'Standing Dumbbell Calf Raise',
    block: 4,
    note: 'Dieselbe Bewegung wie das Wadenheben an der Maschine und mit Langhantel; beide stehen auf beginner.',
    difficulty: 'beginner',
    instructions: [
      'Stehe aufrecht mit je einer Kurzhantel seitlich am Körper. Stelle die Fußballen auf ein stabiles Brett von etwa 5 bis 8 cm Höhe, die Fersen berühren den Boden.',
      'Hebe die Fersen beim Ausatmen über die Wadenspannung an und halte oben eine Sekunde. Die Zehen können geradeaus, nach innen oder nach außen zeigen und betonen so verschiedene Anteile der Wade.',
      'Senke die Fersen beim Einatmen langsam ab.',
    ],
  },
  {
    canonicalName: 'Standing Barbell Calf Raise',
    block: 4,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Führe die Übung im Rack aus. Lege die Stange auf passender Höhe ab, tritt darunter und nimm sie auf den oberen Rücken, knapp unterhalb des Nackens.',
      'Hebe die Stange aus dem Rack, indem du mit den Beinen drückst und den Oberkörper aufrichtest, und tritt zurück. Die Füße stehen schulterbreit, die Zehen leicht nach außen, die Knie leicht gebeugt.',
      'Hebe die Fersen beim Ausatmen so hoch wie möglich und spanne die Waden an. Das Knie bleibt unbewegt.',
      'Senke die Fersen beim Einatmen langsam ab, bis die Waden gedehnt sind.',
    ],
  },
  {
    canonicalName: 'Sumo Deadlift',
    block: 4,
    note: 'Angleichung an die Kreuzheben-Familie aus Block 1 und 3.',
    primaryMuscles: ['hamstrings', 'glutes', 'lower_back'],
    secondaryMuscles: ['quads', 'adductors', 'traps', 'forearms'],
    instructions: [
      'Tritt so an die beladene Stange, dass sie über der Mitte der Füße liegt. Die Füße stehen sehr weit, fast an den Hantelscheiben.',
      'Beuge dich aus der Hüfte und greife die Stange innerhalb der Beine, die Arme senkrecht unter den Schultern. Ober-, Kreuz- oder Hakengriff sind möglich. Lass die Schultern locker.',
      'Nimm Luft, senke die Hüfte, Blick nach vorne, Brust auf. Drücke in den Boden, als wolltest du die Füße auseinanderschieben, und strecke Hüfte und Knie.',
      'Sobald die Stange die Knie passiert hat, lehne dich zurück, schiebe die Hüfte an die Stange und ziehe die Schulterblätter zusammen.',
      'Senke die Last kontrolliert aus der Hüfte heraus zum Boden ab.',
    ],
  },
  {
    canonicalName: 'Sumo Deadlift with Bands',
    block: 4,
    note: 'Der Name nennt das Band, das Equipment führte es nicht. Angleichung an die Kreuzheben-Familie.',
    primaryMuscles: ['hamstrings', 'glutes', 'lower_back'],
    secondaryMuscles: ['quads', 'adductors', 'traps', 'forearms'],
    equipment: ['barbell', 'resistance_band'],
    instructions: [
      'Lege kurze Bänder über die Stange und stelle dich hinein, sodass sie unter der hinteren Fußhälfte liegen — genau dort, wo du in den Boden drückst.',
      'Tritt so an die Stange, dass sie über der Mitte der Füße liegt. Die Füße stehen sehr weit, fast an den Hantelscheiben. Greife innerhalb der Beine, die Arme senkrecht unter den Schultern.',
      'Nimm Luft, senke die Hüfte, Blick nach vorne, Brust auf. Drücke in den Boden und strecke Hüfte und Knie.',
      'Sobald die Stange die Knie passiert hat, lehne dich zurück und schiebe die Hüfte an die Stange.',
      'Senke die Last kontrolliert aus der Hüfte heraus zum Boden ab.',
    ],
  },
  {
    canonicalName: 'Low Cable Triceps Extension',
    block: 4,
    note: '„Tief" beschreibt die Rolle, nicht die Übung; die Anleitung liegt auf einer Bank.',
    name: 'Liegendes Trizepsdrücken am Kabelzug',
    equipment: ['cable', 'bench'],
    instructions: [
      'Lege dich mit dem Rücken auf die Bank einer Rudermaschine mit Seilgriff, der Kopf zeigt zum Gerät.',
      'Fasse die Seilenden im Neutralgriff. Die Oberarme zeigen zur Decke und stehen senkrecht zum Rumpf, die Ellenbogen sind etwa 90 Grad gebeugt, die Unterarme zeigen nach hinten zum Zug. Das ist die Ausgangsposition.',
      'Strecke die Unterarme beim Ausatmen, bis die Arme gerade nach oben zeigen. Ober- und Ellenbogen bleiben unbewegt; nur die Unterarme arbeiten. Spanne den Trizeps eine Sekunde an.',
      'Kehre beim Einatmen langsam in die Ausgangsposition zurück.',
    ],
  },
  {
    canonicalName: 'Overhead Cable Curl',
    block: 4,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Wähle auf beiden Seiten der Kabelzugstation dasselbe Gewicht und stelle beide Rollen höher als deine Schultern ein.',
      'Stelle dich mittig zwischen die Züge und greife die Griffe im Untergriff, die Handflächen zeigen zur Decke. Die Arme sind gestreckt und parallel zum Boden, die Füße schulterbreit. Das ist die Ausgangsposition.',
      'Beuge die Ellenbogen beim Ausatmen langsam, bis Unterarm und Bizeps sich berühren.',
      'Führe die Unterarme beim Einatmen zurück. Außer den Unterarmen bewegt sich nichts.',
    ],
  },
  {
    canonicalName: 'Reverse Band Bench Press',
    block: 4,
    note: 'Ein Bankdrücken ist keine Trizepsübung; Bank und Band fehlten im Equipment.',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['shoulders', 'triceps'],
    equipment: ['barbell', 'resistance_band', 'bench'],
    instructions: [
      'Stelle eine Bank ins Power Rack und die Stange auf die passende Höhe. Befestige die Bänder oben am Rack und das andere Ende an der Hantel.',
      'Lege dich auf die Bank, ziehe die Füße unter dich und baue eine Spannung im Rücken auf. Führe die Schulterblätter zusammen und halte diese Körperspannung über die gesamte Bewegung.',
      'Hebe die Stange aus der Ablage, ohne die Schultern nach vorne zu schieben. Senke sie zur unteren Brust; Handgelenk und Ellenbogen bleiben in einer Linie.',
      'Halte kurz, sobald die Stange den Oberkörper berührt, und drücke sie mit voller Kraft nach oben. Die Ellenbogen bleiben bis zur Streckung angelegt.',
    ],
  },
  {
    canonicalName: 'Reverse Band Deadlift',
    block: 4,
    note: 'Angleichung an die Kreuzheben-Familie; das namensgebende Band fehlte im Equipment.',
    primaryMuscles: ['hamstrings', 'glutes', 'lower_back'],
    secondaryMuscles: ['quads', 'upper_back', 'traps', 'forearms'],
    equipment: ['barbell', 'resistance_band'],
    instructions: [
      'Stelle die Stange ins Power Rack, befestige die Bänder oben am Rack und das andere Ende an der Stange.',
      'Tritt so an die Stange, dass sie über der Mitte der Füße liegt; die Füße stehen etwa hüftbreit. Beuge dich aus der Hüfte und greife schulterbreit im Ober- oder Kreuzgriff.',
      'Nimm tief Luft, senke die Hüfte und beuge die Knie, bis die Schienbeine die Stange berühren. Blick nach vorne, Brust auf, Rücken gestreckt. Drücke über die Fersen nach oben.',
      'Sobald die Stange die Knie passiert hat, ziehe die Schulterblätter zusammen und schiebe die Hüfte nach vorne an die Stange.',
      'Senke die Stange aus der Hüfte heraus geführt zum Boden ab.',
    ],
  },
  {
    canonicalName: 'Reverse Band Sumo Deadlift',
    block: 4,
    note: 'Angleichung an die Kreuzheben-Familie; das namensgebende Band fehlte im Equipment.',
    primaryMuscles: ['hamstrings', 'glutes', 'lower_back'],
    secondaryMuscles: ['quads', 'adductors', 'traps', 'forearms'],
    equipment: ['barbell', 'resistance_band'],
    instructions: [
      'Lege die beladene Stange ins Power Rack, befestige die Bänder oben am Rack und das andere Ende an der Stange.',
      'Tritt so an die Stange, dass sie über der Mitte der Füße liegt. Die Füße stehen sehr weit, fast an den Hantelscheiben. Greife innerhalb der Beine, die Arme senkrecht unter den Schultern.',
      'Nimm Luft, senke die Hüfte, Blick nach vorne, Brust auf. Drücke in den Boden und strecke Hüfte und Knie.',
      'Sobald die Stange die Knie passiert hat, lehne dich zurück und schiebe die Hüfte an die Stange.',
      'Senke die Last kontrolliert aus der Hüfte heraus zum Boden ab.',
    ],
  },
  {
    canonicalName: 'Clean and Press',
    block: 4,
    note: 'Langhantelübung der Disziplin (Regel G), wie der bereits verschobene Power Clean. Muskeln analog der Umsetz-Familie.',
    category: 'olympic_weightlifting',
    primaryMuscles: ['glutes', 'hamstrings', 'traps', 'shoulders'],
    secondaryMuscles: ['quads', 'lower_back', 'upper_back', 'triceps'],
    instructions: [
      'Stelle dich schulterbreit an die Stange, die Knie innerhalb der Arme. Beuge Knie und Hüfte bei flachem Rücken und greife die Stange im Obergriff etwas weiter als schulterbreit, die Ellenbogen nach außen. Die Stange liegt nah an den Schienbeinen, die Schultern über oder knapp vor der Stange.',
      'Beginne den Zug, indem du die Knie streckst. Hüfte und Schultern heben sich gleichmäßig, der Rückenwinkel bleibt gleich; die Stange läuft eng am Körper nach oben.',
      'Sobald die Stange die Knie passiert hat, strecke Sprunggelenke, Knie und Hüfte explosiv wie zu einem Sprung und ziehe die Schultern hoch. Die Ellenbogen bleiben außen.',
      'Auf dem höchsten Punkt ziehst du dich unter die Stange und gehst dabei in die Hocke.',
      'Drehe die Ellenbogen um die Stange herum und fange sie auf den vorderen Schultern auf. Der Oberkörper bleibt aufrecht, Hüfte und Knie federn die Last ab.',
      'Richte dich vollständig auf.',
      'Drücke die Stange beim Ausatmen über den Kopf, ohne die Füße zu versetzen, und senke sie kontrolliert wieder ab.',
    ],
  },
  {
    canonicalName: 'Bent Over Barbell Row',
    block: 4,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Greife die Langhantel im Obergriff, beuge die Knie leicht und den Oberkörper aus der Hüfte nach vorne, bis er beinahe parallel zum Boden steht. Der Rücken bleibt gerade, der Kopf oben. Die Stange hängt senkrecht unter dir.',
      'Ziehe die Stange beim Ausatmen bei ruhigem Oberkörper zum Bauch. Die Ellenbogen bleiben eng am Körper. Spanne oben die Rückenmuskulatur an und halte kurz.',
      'Senke die Stange beim Einatmen langsam in die Ausgangsposition.',
    ],
  },
  {
    canonicalName: 'Calf Press',
    block: 4,
    note: '„Waden-Drücken" ist kein deutscher Fachbegriff; die Anleitung beschreibt die Beinpresse.',
    name: 'Wadenheben an der Beinpresse',
    instructions: [
      'Stelle den Sitz so ein, dass die Beine in der Ausgangsposition nur leicht gebeugt sind. Die Fußballen stehen fest auf der Platte.',
      'Wähle ein passendes Gewicht und greife die Haltegriffe. Das ist die Ausgangsposition.',
      'Strecke die Beine so weit, dass das Gewicht gerade vom Stapel abhebt. Das Sprunggelenk ist angezogen, die Zehen zeigen nach oben.',
      'Drücke die Platte so weit wie möglich über die Fußballen weg, halte kurz und kehre die Bewegung kontrolliert um.',
    ],
  },
  {
    canonicalName: 'Two-Arm Kettlebell Row',
    block: 4,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Stelle zwei Kettlebells vor deine Füße. Beuge die Knie leicht und schiebe im Vorbeugen das Gesäß weit nach hinten.',
      'Greife beide Kettlebells und ziehe sie zum Bauch. Führe die Schulterblätter zusammen und beuge die Ellenbogen; der Rücken bleibt gerade.',
      'Senke die Kettlebells kontrolliert ab und wiederhole.',
    ],
  },
  {
    canonicalName: 'Two-Arm Kettlebell Clean',
    block: 4,
    note: 'Angleichung an die Umsetz-Familie: die Bewegung kommt aus der Hüftstreckung.',
    primaryMuscles: ['glutes', 'hamstrings', 'traps'],
    secondaryMuscles: ['lower_back', 'shoulders', 'forearms'],
    instructions: [
      'Stelle zwei Kettlebells zwischen deine Füße. Schiebe das Gesäß nach hinten und richte den Blick geradeaus.',
      'Setze die Kettlebells an den Schultern ab, indem du Beine und Hüfte streckst und sie zu den Schultern führst. Die Handgelenke drehen dabei ein.',
      'Senke die Kettlebells zurück in die Ausgangsposition und wiederhole.',
    ],
  },
];

/**
 * Blocks 5 and 6 — Mobility. Reviewed 2026-08-15.
 *
 * `unilateral` is set here rather than derived: every one of these entries says
 * "switch sides" in its source text, and a rule reading that phrase would have
 * to keep matching it after the text became German. An explicit value cannot
 * drift out from under the translation.
 *
 * `forceType` and `mechanic` come from rule H instead, because there they are
 * the same for every mobility entry and repeating them thirty-nine times would
 * bury the decisions that differ.
 *
 * Three entries leave mobility altogether: two back extensions and a jump that
 * had been filed as a stretch.
 */
export const BLOCK_5_6: readonly ReviewDecision[] = [
  // ── Block 5 ────────────────────────────────────────────────────────────────
  {
    canonicalName: 'Brachialis-SMR',
    block: 5,
    note: 'Die Übung ist nach dem Muskel benannt, den sie bearbeitet; `brachialis` steht im Vokabular.',
    primaryMuscles: ['brachialis'],
    unilateral: true,
    instructions: [
      'Lege dich seitlich auf den Boden und positioniere die Faszienrolle unter dem Oberarm, die Außenseite des Bizeps liegt auf.',
      'Hebe die Hüfte an und stütze dein Gewicht auf Arm und Füßen.',
      'Halte 10 bis 30 Sekunden und wechsle dann die Seite.',
    ],
  },
  {
    canonicalName: 'Chest Stretch on Stability Ball',
    block: 5,
    unilateral: true,
    note: 'Wird Arm für Arm ausgeführt.',
    instructions: [
      'Gehe neben einem Gymnastikball in den Vierfüßlerstand.',
      'Lege einen Ellenbogen oben auf den Ball, der Arm zeigt zur Seite. Das ist die Ausgangsposition.',
      'Senke den Oberkörper zum Boden, während der Ellenbogen auf dem Ball bleibt. Halte 20 bis 30 Sekunden und wechsle dann den Arm.',
    ],
  },
  {
    canonicalName: 'Front Leg Raises',
    block: 5,
    note: 'Die Anleitung beschreibt ein Schwingen vor und zurück, kein Heben und Halten. „Beinheben" ist im Katalog eine Kraftübung.',
    name: 'Beinschwung nach vorne',
    unilateral: true,
    instructions: [
      'Stelle dich neben einen Stuhl oder eine andere Stütze und halte dich mit einer Hand fest.',
      'Schwinge ein Bein gestreckt nach vorne und anschließend so weit nach hinten, wie es die Beweglichkeit zulässt.',
      'Wiederhole 5 bis 10 Mal und wechsle dann das Bein.',
    ],
  },
  {
    canonicalName: 'Groiners',
    block: 5,
    note: 'Ein Sprung über 10 bis 20 Wiederholungen ist keine Mobilisation. Als Kraftübung greift Regel H nicht mehr auf ihn — der Widerspruch zwischen `static` und einer Sprungbewegung entfällt damit.',
    category: 'strength',
    forceType: 'static',
    mechanic: 'isolation',
    instructions: [
      'Gehe in die Liegestützposition. Das ist die Ausgangsposition.',
      'Springe mit beiden Beinen nach vorne und lande mit den Füßen neben den Händen. Der Kopf bleibt oben.',
      'Springe zurück in die Ausgangsposition und wiederhole unmittelbar, 10 bis 20 Mal.',
    ],
  },
  {
    canonicalName: 'Hamstring Stretch',
    block: 5,
    note: 'Der Gurt ist für die Ausführung zwingend und wird als `resistance_band` geführt.',
    equipment: ['resistance_band'],
    unilateral: true,
    instructions: [
      'Lege dich auf den Rücken und strecke ein Bein senkrecht nach oben, die Hüfte etwa 90 Grad gebeugt. Das andere Bein bleibt flach am Boden.',
      'Lege einen Gurt oder ein Band um den Fußballen des gestreckten Beins. Das ist die Ausgangsposition.',
      'Ziehe am Gurt, bis du eine Dehnung in Wade und Beinrückseite spürst. Halte 10 bis 30 Sekunden und wechsle dann das Bein.',
    ],
  },
  {
    canonicalName: 'Hamstring-SMR',
    block: 5,
    note: 'Wird Bein für Bein ausgeführt.',
    unilateral: true,
    instructions: [
      'Setze dich auf den Boden und lege die Oberschenkelrückseite auf eine Faszienrolle. Stütze dich mit den Händen seitlich oder hinter dir ab.',
      'Hebe die Hüfte vom Boden und verlagere das Gewicht auf ein Bein. Lass die Muskulatur dieses Beins locker.',
      'Rolle von unterhalb der Hüfte bis oberhalb der Kniekehle und halte an druckempfindlichen Stellen 10 bis 30 Sekunden. Wechsle dann das Bein.',
    ],
  },
  {
    canonicalName: 'Rear Leg Raises',
    block: 5,
    note: 'Die Anleitung streckt Hüfte und Knie — eine Hüftstreckung leistet das Gesäß, nicht der Quadrizeps.',
    primaryMuscles: ['glutes'],
    secondaryMuscles: ['hamstrings'],
    unilateral: true,
    instructions: [
      'Gehe auf einer Matte in den Vierfüßlerstand. Der Blick geht nach vorne, die Knie sind etwa 90 Grad gebeugt. Das ist die Ausgangsposition.',
      'Strecke ein Bein nach hinten oben aus. Knie und Hüfte strecken sich dabei gemeinsam.',
      'Wiederhole 5 bis 10 Mal und wechsle dann die Seite.',
    ],
  },
  {
    canonicalName: 'Iliotibial Tract-SMR',
    block: 5,
    note: 'Wird Bein für Bein ausgeführt.',
    unilateral: true,
    instructions: [
      'Lege dich seitlich auf den Boden und die Faszienrolle zwischen Hüfte und Knie unter das untenliegende Bein. Das obere Bein kann davor abgestellt werden.',
      'Verlagere so viel Gewicht auf das untere Bein, wie du aushältst, und lass dessen Muskulatur locker.',
      'Rolle von der Hüfte bis zum Knie und halte an druckempfindlichen Stellen 10 bis 30 Sekunden. Wechsle dann das Bein.',
    ],
  },
  {
    canonicalName: 'Cat Stretch',
    block: 5,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Gehe in den Vierfüßlerstand.',
      'Ziehe den Bauch ein und mache den Rücken rund — Lendenwirbelsäule, Schultern und Nacken folgen, der Kopf sinkt.',
      'Halte 15 Sekunden.',
    ],
  },
  {
    canonicalName: "Child's Pose",
    block: 5,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Gehe in den Vierfüßlerstand und wandere mit den Händen nach vorne.',
      'Setze das Gesäß auf die Fersen und lass die Arme dabei am Boden mitgleiten, sodass sich die ganze Wirbelsäule streckt.',
      'Lege die Stirn ab, bringe die Hände neben die Füße und atme ruhig in den Rücken. Bei Knieproblemen ist diese Position zu meiden.',
    ],
  },
  {
    canonicalName: 'Kneeling Hip Flexor',
    block: 5,
    note: 'Der Name benannte den Muskel statt der Übung — es kniet kein Hüftbeuger.',
    name: 'Hüftbeugerdehnung im Kniestand',
    unilateral: true,
    instructions: [
      'Knie auf einer Matte und stelle ein Bein vor dir auf, sodass der Fuß flach am Boden steht. Das andere Bein liegt mit dem Fußrücken hinten am Boden.',
      'Verlagere das Gewicht nach vorne, bis du eine Dehnung in der Hüfte des hinteren Beins spürst.',
      'Halte 15 Sekunden und wechsle dann die Seite.',
    ],
  },
  {
    canonicalName: 'Latissimus Dorsi-SMR',
    block: 5,
    note: 'Wird Seite für Seite ausgeführt.',
    unilateral: true,
    instructions: [
      'Lege dich auf den Boden und die Faszienrolle seitlich unter den Rücken, knapp hinter der Achsel. Das ist die Ausgangsposition.',
      'Halte den Arm der bearbeiteten Seite hinter und neben dem Körper und verlagere das Gewicht auf den Latissimus. Der Oberkörper bleibt vom Boden abgehoben.',
      'Halte 10 bis 30 Sekunden und wechsle dann die Seite.',
    ],
  },
  {
    canonicalName: 'Lying Crossover',
    block: 5,
    remove:
      'Partnerübung. Die Anleitung verlangt einen Partner, der die Schulter fixiert, die Bewegung blockiert und anschließend nachdrückt — ohne ihn ist die Übung nicht ausführbar. Der Katalog führt keine Übungen, die ein Athlet nicht allein ausführen kann.',
    note: 'Gestrichen: zwingende Partnerübung.',
  },
  {
    canonicalName: 'Upper Back Stretch',
    block: 5,
    note: 'Drei unverbundene Wörter ohne Fugenzeichen; die Quelle hatte nur einen Schritt ohne Ausgangsposition und Haltedauer.',
    name: 'Dehnung des oberen Rückens',
    instructions: [
      'Stelle dich aufrecht hin und verschränke die Finger vor dem Körper, die Daumen zeigen nach unten.',
      'Strecke die Arme nach vorne und mache dabei den oberen Rücken rund, sodass die Schulterblätter auseinandergehen.',
      'Halte die Dehnung und löse sie langsam wieder auf.',
    ],
  },
  {
    canonicalName: 'Peroneals Stretch',
    block: 5,
    note: 'Der Gurt ist für die Ausführung zwingend.',
    equipment: ['resistance_band'],
    unilateral: true,
    instructions: [
      'Setze dich auf den Boden und lege einen Gurt oder ein Band um einen Fuß. Das ist die Ausgangsposition.',
      'Strecke das Bein und hebe die Ferse vom Boden. Ziehe am Gurt, bis der Fuß nach innen kippt und die Fußinnenkante zu dir zeigt.',
      'Halte 10 bis 20 Sekunden und wechsle dann die Seite.',
    ],
  },
  {
    canonicalName: 'Peroneals-SMR',
    block: 5,
    note: 'Wird Bein für Bein ausgeführt.',
    unilateral: true,
    instructions: [
      'Lege dich seitlich auf den Boden und stütze dich auf den Unterarm. Die Faszienrolle liegt an der Außenseite des unteren Unterschenkels. Das obere Bein liegt auf oder wird davor abgestellt.',
      'Hebe die Hüfte vom Boden und rolle an der Außenseite von unterhalb des Knies bis oberhalb des Sprunggelenks.',
      'Halte an druckempfindlichen Stellen 10 bis 30 Sekunden und wechsle dann das Bein.',
    ],
  },
  {
    canonicalName: 'Piriformis-SMR',
    block: 5,
    note: 'Wird Seite für Seite ausgeführt.',
    unilateral: true,
    instructions: [
      'Setze dich mit dem Gesäß auf eine Faszienrolle. Beuge die Knie und lege ein Sprunggelenk über das gegenüberliegende Knie. Das ist die Ausgangsposition.',
      'Verlagere das Gewicht auf die Seite des überkreuzten Beins und rolle über das Gesäß, bis du Spannung im oberen Gesäßbereich spürst. Du kannst die Dehnung verstärken, indem du das gebeugte Knie mit einer Hand zur Brust ziehst.',
      'Halte 10 bis 30 Sekunden und wechsle dann die Seite.',
    ],
  },
  {
    canonicalName: 'Quadriceps-SMR',
    block: 5,
    note: 'Wird Bein für Bein ausgeführt.',
    unilateral: true,
    instructions: [
      'Lege dich bäuchlings auf den Boden und stütze dich auf Händen oder Unterarmen ab. Die Faszienrolle liegt unter dem Oberschenkel eines Beins, der Fuß bleibt in der Luft. Halte das Bein so locker wie möglich.',
      'Verlagere so viel Gewicht auf dieses Bein, wie du aushältst, und rolle von oberhalb des Knies bis unterhalb der Hüfte.',
      'Halte an druckempfindlichen Stellen 10 bis 30 Sekunden und wechsle dann das Bein.',
    ],
  },
  {
    canonicalName: 'Quad Stretch',
    block: 5,
    note: 'Der Gurt ist für die Ausführung zwingend.',
    equipment: ['resistance_band'],
    unilateral: true,
    instructions: [
      'Lege dich auf die Seite und lege einen Gurt oder ein Band um den Fuß des oberen Beins. Beuge das Knie und strecke die Hüfte, sodass die Ferse zum Gesäß kommt, und halte den Gurt mit den Händen. Das ist die Ausgangsposition.',
      'Führe den Gurt über die Schulter und ziehe behutsam an, um die Dehnung in der Oberschenkelvorderseite zu verstärken.',
      'Halte 10 bis 20 Sekunden und wechsle dann die Seite.',
    ],
  },
  {
    canonicalName: 'Rhomboids-SMR',
    block: 5,
    note: '„Rhomboiden" ist keine deutsche Form; der Muskel heißt Rhomboideus.',
    name: 'Rhomboideus-Faszienrollen',
    instructions: [
      'Lege dich mit dem Rücken auf den Boden und die Faszienrolle unter den oberen Rücken. Verschränke die Arme vor der Brust und schiebe die Schultern nach vorne. Das ist die Ausgangsposition.',
      'Hebe die Hüfte vom Boden und verlagere das Gewicht auf die Rolle.',
      'Rolle über den mittleren und oberen Rücken, jeweils leicht zur Seite verlagert, und halte an druckempfindlichen Stellen 10 bis 30 Sekunden.',
    ],
  },
  {
    canonicalName: 'Scissor Kick',
    block: 5,
    note: 'Wechselseitiges Beinheben in Rückenlage gegen die Schwerkraft — eine Bauchübung, keine Mobilisation.',
    category: 'strength',
    instructions: [
      'Lege dich auf den Rücken, die Arme seitlich gestreckt, die Handflächen nach unten. Die Arme bleiben während der ganzen Übung liegen.',
      'Hebe die Beine bei leicht gebeugten Knien an, bis die Fersen etwa 15 cm über dem Boden stehen. Das ist die Ausgangsposition.',
      'Hebe ein Bein auf etwa 45 Grad, während du das andere absenkst, bis die Ferse noch wenige Zentimeter über dem Boden ist.',
      'Wechsle die Beine im gleichmäßigen Rhythmus und atme dabei ruhig weiter.',
    ],
  },

  /**
   * Not a Block 5 exercise, but the same decision: the catalogue carries no
   * exercise an athlete cannot perform alone.
   */
  {
    canonicalName: 'Medicine Ball Chest Pass',
    block: 5,
    remove:
      'Partnerübung. Die Anleitung beginnt mit „You will need a partner for this exercise" — anders als bei den übrigen Medizinballwürfen ist die Wand keine genannte Alternative.',
    note: 'Gestrichen: zwingende Partnerübung.',
  },

  // ── Block 6 ────────────────────────────────────────────────────────────────
  {
    canonicalName: 'Shoulder Stretch',
    block: 6,
    note: 'Die Quelle hatte einen Schritt ohne Ausgangsposition und Haltedauer.',
    unilateral: true,
    instructions: [
      'Stelle dich aufrecht hin und lass die Schultern locker.',
      'Führe einen gestreckten Arm quer vor dem Körper zur Gegenseite und ziehe ihn mit der anderen Hand behutsam näher an die Brust.',
      'Halte die Dehnung und wechsle dann den Arm.',
    ],
  },
  {
    canonicalName: 'Shoulder Raise',
    block: 6,
    note: 'Schulterheben zu den Ohren ist Trapezarbeit; der Latissimus zieht die Schulter nach unten. Die Quelle hatte einen Schritt.',
    secondaryMuscles: ['traps'],
    instructions: [
      'Stelle dich aufrecht hin und lass die Arme seitlich locker hängen.',
      'Ziehe die Schultern in Richtung der Ohren.',
      'Senke sie kontrolliert wieder ab und wiederhole gleichmäßig.',
    ],
  },
  {
    canonicalName: 'Side Lying Groin Stretch',
    block: 6,
    note: 'Wird Seite für Seite ausgeführt.',
    unilateral: true,
    instructions: [
      'Lege dich auf die rechte Seite und stelle das rechte Knie vor dir ab, um den Rumpf zu stabilisieren.',
      'Lege den Kopf auf der rechten Hand ab. Hebe das linke Bein an und halte es in der Kniekehle — oder am Fuß, wenn du es schwerer möchtest.',
      'Ziehe das linke Knie zur linken Schulter und drücke gleichzeitig Fuß oder Knie zum Boden. Das gestreckte Bein verstärkt die Dehnung. Wechsle anschließend die Seite.',
    ],
  },
  {
    canonicalName: 'Side-Lying Floor Stretch',
    block: 6,
    note: '„Boden-Dehnung" benennt den Untergrund, nicht die Übung.',
    name: 'Seitliche Rumpfdehnung in Seitlage',
    unilateral: true,
    instructions: [
      'Lege dich auf die linke Seite und stelle das linke Knie vor dir ab. Halte den Rumpf mit der Bauchmuskulatur aufrecht.',
      'Strecke das rechte Bein und setze den rechten Fuß hinter dem linken am Boden ab.',
      'Strecke den rechten Arm über den Kopf und ziehe behutsam am Handgelenk, bis die gesamte rechte Körperseite gedehnt ist. Wechsle anschließend die Seite.',
    ],
  },
  {
    canonicalName: 'Side Leg Raises',
    block: 6,
    note: 'Das Bein wird zur Seite geführt — das ist Abduktion. Die Anleitung beschreibt zudem ein Schwingen, kein Heben und Halten.',
    name: 'Beinschwung seitlich',
    primaryMuscles: ['abductors'],
    secondaryMuscles: ['adductors'],
    unilateral: true,
    instructions: [
      'Stelle dich neben einen Stuhl, an dem du dich festhalten kannst, und stehe auf einem Bein. Das ist die Ausgangsposition.',
      'Schwinge das freie Bein gestreckt so weit wie möglich zur Seite und anschließend zurück, sodass es vor dem Standbein kreuzt.',
      'Wiederhole 5 bis 10 Mal mit wachsender Bewegungsweite und wechsle dann das Bein.',
    ],
  },
  {
    canonicalName: 'Seated Floor Hamstring Stretch',
    block: 6,
    note: '„Boden-" trägt nichts bei — jede sitzende Dehnung findet dort statt.',
    name: 'Sitzende Hamstring-Dehnung',
    unilateral: true,
    instructions: [
      'Setze dich auf eine Matte, strecke ein Bein nach vorne aus und lege den Fuß des angewinkelten anderen Beins an dessen Innenseite.',
      'Beuge dich aus der Hüfte nach vorne und greife in Richtung Knöchel, bis du eine Dehnung in der Beinrückseite spürst.',
      'Halte 15 Sekunden und wechsle dann die Seite.',
    ],
  },
  {
    canonicalName: 'Seated Hamstring and Calf Stretch',
    block: 6,
    note: 'Der Gurt ist für die Ausführung zwingend.',
    equipment: ['resistance_band'],
    unilateral: true,
    instructions: [
      'Lege einen Gurt oder ein Band um einen Fuß und setze dich mit beiden gestreckten Beinen hin. Das ist die Ausgangsposition.',
      'Lehne dich leicht nach vorne und ziehe am Gurt, sodass die Zehen zu dir kommen.',
      'Halte 10 bis 20 Sekunden und wechsle dann das Bein.',
    ],
  },
  {
    canonicalName: 'Seated Overhead Stretch',
    block: 6,
    note: 'Die Anleitung beschreibt eine Seitneigung — das leistet die schräge Bauchmuskulatur.',
    primaryMuscles: ['obliques'],
    secondaryMuscles: ['abs'],
    unilateral: true,
    instructions: [
      'Setze dich aufrecht auf eine Matte und lege die Fußsohlen aneinander, etwa 15 bis 20 cm vor der Hüfte.',
      'Stütze eine Hand seitlich am Boden ab und lege die andere hinter den Kopf.',
      'Ziehe den Ellenbogen zur Decke und neige den Oberkörper zur Gegenseite. Halte 10 bis 20 Sekunden und wechsle dann die Seite.',
    ],
  },
  {
    canonicalName: 'Seated Calf Stretch',
    block: 6,
    note: 'Wird Bein für Bein ausgeführt. Kein Gurt im Equipment: die Anleitung nennt ihn ausdrücklich als eine von drei Möglichkeiten neben Handtuch und bloßer Hand.',
    secondaryMuscles: ['hamstrings'],
    unilateral: true,
    instructions: [
      'Setze dich aufrecht auf eine Matte.',
      'Beuge ein Knie und stelle diesen Fuß auf, um den Rumpf zu stabilisieren. Strecke das andere Bein und ziehe das Sprunggelenk an.',
      'Ziehe die Zehen des gestreckten Beins zu dir — mit der Hand, einem Handtuch oder einem Band. Halte 10 bis 20 Sekunden und wechsle dann die Seite.',
    ],
  },
  {
    canonicalName: 'Split Squats',
    block: 6,
    note: 'Die Anleitung beschreibt einen Sprung mit Beinwechsel (Regel D). Der bisherige Name behauptete dieselbe Übung wie der Split Squat mit Kurzhanteln.',
    name: 'Sprung-Ausfallschritt im Wechsel',
    category: 'plyometrics',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings', 'calves'],
    mechanic: 'compound',
    instructions: [
      'Stehe aufrecht. Springe in eine Schrittstellung, ein Bein vorne, eines hinten, und senke die Hüfte dabei leicht ab.',
      'Kehre die Bewegung unten sofort um, springe nach oben und wechsle in der Luft die Beinstellung.',
      'Wiederhole 5 bis 10 Mal je Bein.',
    ],
  },
  {
    canonicalName: 'Standing Elevated Quad Stretch',
    block: 6,
    note: 'Ohne Erhöhung nicht ausführbar.',
    equipment: ['bench'],
    unilateral: true,
    instructions: [
      'Stelle dich mit dem Rücken etwa 60 bis 90 cm vor eine Bank oder Stufe.',
      'Hebe ein Bein nach hinten an und lege den Fuß auf der Erhöhung ab — auf dem Spann oder dem Fußballen, je nachdem, was angenehmer ist.',
      'Halte das Standbein leicht gebeugt und lass das Knie nicht über die Zehen hinauswandern. Wechsle anschließend die Seite.',
    ],
  },
  {
    canonicalName: 'Standing Hamstring and Calf Stretch',
    block: 6,
    note: 'Der Gurt ist für die Ausführung zwingend.',
    equipment: ['resistance_band'],
    unilateral: true,
    instructions: [
      'Lege einen Gurt oder ein Band um einen Fuß und setze diesen Fuß im Stand nach vorne.',
      'Beuge das hintere Bein und halte das vordere gestreckt. Hebe die Zehen des vorderen Fußes vom Boden und beuge dich nach vorne.',
      'Ziehe am Gurt, um die Dehnung in der Wade zu verstärken. Halte 10 bis 20 Sekunden und wechsle dann das Bein.',
    ],
  },
  {
    canonicalName: 'Standing Lateral Stretch',
    block: 6,
    note: 'Seitneigung — Arbeit der schrägen Bauchmuskulatur.',
    primaryMuscles: ['obliques'],
    secondaryMuscles: ['abs'],
    unilateral: true,
    instructions: [
      'Stelle dich etwas weiter als hüftbreit hin, die Knie leicht gebeugt.',
      'Lege die rechte Hand auf die rechte Hüfte, um die Wirbelsäule zu stützen.',
      'Hebe den linken Arm senkrecht und lege die linke Hand hinter den Kopf. Neige den Oberkörper nach rechts und halte das Gewicht gleichmäßig auf beiden Beinen. Wechsle anschließend die Seite.',
    ],
  },
  {
    canonicalName: 'Standing Hip Flexors',
    block: 6,
    note: 'Der Name benannte den Muskel statt der Übung.',
    name: 'Hüftbeugerdehnung im Stand',
    unilateral: true,
    instructions: [
      'Stelle dich aufrecht hin, die Wirbelsäule senkrecht, ein Fuß etwas vor dem anderen.',
      'Beuge beide Knie und hebe die hintere Ferse vom Boden, während du die Hüfte der hinteren Seite nach vorne schiebst.',
      'Halte die Dehnung und wechsle dann die Seite. Im Stand bleibt sie flacher als im Kniestand, weil sich der Hüftbeuger beim Stehen nicht vollständig lösen lässt.',
    ],
  },
  {
    canonicalName: 'Standing Toe Touches',
    block: 6,
    note: '„Toe Touch" ist im deutschen Coaching nicht etabliert.',
    name: 'Vorbeuge im Stand',
    instructions: [
      'Stelle dich mit etwas Platz vor und hinter dir aufrecht hin.',
      'Beuge dich mit gestreckten Beinen aus der Hüfte nach vorne und lass den Oberkörper locker nach unten hängen. Arme und Hände hängen frei.',
      'Halte 10 bis 20 Sekunden und richte dich langsam wieder auf.',
    ],
  },
  {
    canonicalName: 'Superman',
    block: 6,
    note: 'Anheben von Armen, Beinen und Brust gegen die Schwerkraft mit Wiederholungen — eine Rückenkräftigung, keine Mobilisation.',
    category: 'strength',
    instructions: [
      'Lege dich bäuchlings auf den Boden oder eine Matte, die Arme nach vorne gestreckt. Das ist die Ausgangsposition.',
      'Hebe Arme, Beine und Brust gleichzeitig vom Boden und halte die Spannung zwei Sekunden. Der untere Rücken leistet die Arbeit; atme dabei aus.',
      'Senke Arme, Beine und Brust beim Einatmen langsam wieder ab.',
    ],
  },
  {
    canonicalName: 'Overhead Stretch',
    block: 6,
    note: 'Vier Sekundärmuskeln für ein Strecken über Kopf; die Unterarme sind nicht beteiligt.',
    secondaryMuscles: ['lats', 'chest'],
    instructions: [
      'Stelle dich aufrecht hin, verschränke die Finger und drehe die Handflächen zur Decke.',
      'Strecke die Arme nach oben und halte die Schultern dabei tief.',
      'Ziehe das Steißbein nach unten und stabilisiere den Rumpf, sodass Vorder- und Rückseite gleichermaßen gedehnt werden.',
    ],
  },
  {
    canonicalName: 'Lower Back Curl',
    block: 6,
    note: 'Doppelt falsch benannt: eine Streckung, kein Curl — und „Curl" heißt im Katalog Armbeugen. Die Anleitung nennt den arbeitenden Muskel wörtlich.',
    name: 'Rückenstrecken in Bauchlage',
    category: 'strength',
    primaryMuscles: ['lower_back'],
    secondaryMuscles: ['glutes'],
    forceType: 'pull',
    mechanic: 'isolation',
    instructions: [
      'Lege dich bäuchlings auf den Boden, die Arme seitlich ausgestreckt. Das ist die Ausgangsposition.',
      'Strecke die Wirbelsäule über die Rückenmuskulatur und hebe die Brust vom Boden. Stütze dich dabei nicht mit den Armen ab; der Kopf bleibt in Verlängerung der Wirbelsäule.',
      'Senke den Oberkörper kontrolliert ab und wiederhole 10 bis 20 Mal.',
    ],
  },
  {
    canonicalName: 'Lower Back-SMR',
    block: 6,
    note: 'Drei unverbundene Wörter ohne Fugenzeichen.',
    name: 'Faszienrollen für den unteren Rücken',
    unilateral: true,
    instructions: [
      'Setze dich auf den Boden und lege die Faszienrolle unter den unteren Rücken. Verschränke die Arme vor der Brust und schiebe die Schultern nach vorne. Das ist die Ausgangsposition.',
      'Hebe die Hüfte vom Boden und lehne dich zurück, sodass das Gewicht auf dem unteren Rücken liegt.',
      'Verlagere das Gewicht leicht zu einer Seite, sodass es neben der Wirbelsäule auf der Muskulatur liegt, und rolle dort. Halte an druckempfindlichen Stellen 10 bis 30 Sekunden und wechsle dann die Seite.',
    ],
  },
  {
    canonicalName: 'Calves-SMR',
    block: 6,
    note: 'Wird Bein für Bein ausgeführt.',
    unilateral: true,
    instructions: [
      'Setze dich auf den Boden und lege die Faszienrolle unter einen Unterschenkel. Das andere Bein kannst du überkreuzen oder abstellen. Das ist die Ausgangsposition.',
      'Stütze die Hände seitlich oder hinter dir ab und drücke die Hüfte vom Boden, sodass ein großer Teil des Gewichts auf der Wade liegt.',
      'Rolle von unterhalb des Knies bis oberhalb des Sprunggelenks, halte an druckempfindlichen Stellen 10 bis 30 Sekunden und wechsle dann das Bein.',
    ],
  },
  {
    canonicalName: 'Windmills',
    block: 6,
    note: 'Das Bein kreuzt über den Körper — Rotation und Adduktion, nicht Abduktion.',
    primaryMuscles: ['obliques'],
    secondaryMuscles: ['glutes', 'adductors'],
    instructions: [
      'Lege dich auf den Rücken, die Arme seitlich ausgestreckt, die Beine gestreckt. Das ist die Ausgangsposition.',
      'Hebe ein Bein und führe es zügig quer über den Körper, als wolltest du mit dem Fuß den Boden neben der gegenüberliegenden Hand berühren.',
      'Führe das Bein zurück und wiederhole mit dem anderen. Wechsle so 10 bis 20 Mal.',
    ],
  },
];

/**
 * Blocks 7 and 8 — Calisthenics and Stability. Reviewed 2026-08-15.
 *
 * Most of both blocks was written by us and needed nothing: 14 of 21 and 13 of
 * 21 entries are editorial, already German and already reviewed once when they
 * were authored. What the sourced rows needed was mostly the implement their
 * instructions name and their data omitted.
 *
 * `suspension_trainer` entered the vocabulary here. Three exercises carried
 * "im Schlingentrainer" in their own German name while their equipment list
 * said bodyweight — the name was right and the data was wrong.
 *
 * **Stability keeps its mixed force types.** Unlike mobility, the entries are
 * not one kind of thing: a dead bug and a wood chop have repetitions, a plank
 * and a carry do not. Unifying them would have made the field lie about half
 * the block.
 */
export const BLOCK_7_8: readonly ReviewDecision[] = [
  // ── Block 7 · Calisthenics ─────────────────────────────────────────────────
  {
    canonicalName: 'Suspended Push-Up',
    block: 7,
    note: 'Ohne Schlingentrainer nicht ausführbar; das Gerät fehlte im Equipment.',
    equipment: ['suspension_trainer'],
    instructions: [
      'Hänge die Schlingen sicher an einem Rack oder einem anderen festen Punkt ein.',
      'Lehne dich in die Schlingen, nimm in jede Hand einen Griff und gehe in die Liegestützposition. Je näher der Körper an der Waagerechten ist, desto schwerer wird die Übung. Die Arme sind gestreckt, der Rumpf bleibt gespannt.',
      'Senke dich mit geradem, festem Oberkörper langsam ab, indem du die Ellenbogen beugst.',
      'Gehe bis unter 90 Grad im Ellenbogen, halte kurz und drücke dich zurück in die Ausgangsposition.',
    ],
  },
  {
    canonicalName: 'Inverted Row',
    block: 7,
    note: 'Die Anleitung verlangt eine Stange im Rack; „Körpergewicht" war als Equipment unvollständig.',
    equipment: ['barbell'],
    instructions: [
      'Lege eine Stange etwa auf Hüfthöhe in ein Rack; auch eine Multipresse ist geeignet.',
      'Greife sie etwas weiter als schulterbreit und hänge dich darunter. Der Körper bleibt gestreckt, die Fersen stehen am Boden, die Arme sind gestreckt. Das ist die Ausgangsposition.',
      'Beuge die Ellenbogen und ziehe die Brust zur Stange. Führe dabei die Schulterblätter zusammen.',
      'Halte oben kurz und senke dich kontrolliert zurück.',
    ],
  },
  {
    canonicalName: 'One Arm Chin-Up',
    block: 7,
    note: 'Die Anleitung beschreibt die am Handtuch assistierte Vorstufe, nicht den freien einarmigen Klimmzug. Ein Klimmzug zieht primär über den Latissimus.',
    primaryMuscles: ['lats'],
    secondaryMuscles: ['biceps', 'upper_back'],
    instructions: [
      'Lege ein Handtuch über die Klimmzugstange. Diese Übung ist die assistierte Vorstufe zum freien einarmigen Klimmzug.',
      'Greife die Stange mit einer Hand im Kammgriff, die Handfläche zeigt zu dir. Die andere Hand fasst das Handtuch.',
      'Lehne den Oberkörper etwa 30 Grad zurück, mache ein leichtes Hohlkreuz und schiebe die Brust heraus. Das ist die Ausgangsposition.',
      'Ziehe dich beim Ausatmen nach oben, bis die Stange die obere Brust erreicht. Führe Schultern und Oberarme dabei nach unten und hinten; nur die Arme bewegen sich.',
      'Halte oben eine Sekunde und senke dich beim Einatmen langsam ab, bis die Arme gestreckt sind. Wechsle nach der vorgesehenen Anzahl die Seite.',
    ],
  },
  {
    canonicalName: 'Single-Arm Push-Up',
    block: 7,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Gehe in eine Liegestützposition und stütze dein Gewicht auf den Fußspitzen und einem Arm. Der Arbeitsarm steht gestreckt unter der Schulter. Ein breiterer Stand als beim normalen Liegestütz gibt mehr Halt.',
      'Halte die Körperspannung und lege die freie Hand hinter den Rücken. Das ist die Ausgangsposition.',
      'Senke dich langsam ab, indem du den Ellenbogen beugst, bis du den Boden berührst.',
      'Drücke dich über die Armstreckung zurück in die Ausgangsposition.',
    ],
  },
  {
    canonicalName: 'Decline Push-Up',
    block: 7,
    note: 'Die Füße stehen auf einer Box oder Bank.',
    equipment: ['bench'],
    instructions: [
      'Gehe in die Liegestützposition, die Hände etwa 90 cm auseinander, und stelle die Füße auf eine Box oder Bank. Das ist die Ausgangsposition.',
      'Senke dich beim Einatmen ab, bis die Brust den Boden fast berührt.',
      'Drücke dich beim Ausatmen über die Brustmuskulatur zurück nach oben.',
      'Halte oben kurz und wiederhole.',
    ],
  },
  {
    canonicalName: 'Incline Push-Up',
    block: 7,
    note: 'Ohne Erhöhung nicht ausführbar.',
    equipment: ['bench'],
    instructions: [
      'Stelle dich vor eine Bank oder eine stabile Erhöhung und setze die Hände etwas weiter als schulterbreit auf deren Kante.',
      'Gehe mit den Füßen nach hinten, bis Arme und Körper gestreckt sind und die Arme senkrecht zum Körper stehen. Das ist die Ausgangsposition.',
      'Senke die Brust bei gestrecktem Körper zur Kante, indem du die Arme beugst.',
      'Drücke dich zurück, bis die Arme wieder gestreckt sind.',
      'Variation: Eine deutlich weitere Handstellung verlagert die Arbeit stärker auf die Brust, eine engere stärker auf den Trizeps.',
    ],
  },
  {
    canonicalName: 'Incline Push-Up Wide',
    block: 7,
    note: 'Gestrichen zugunsten des Schräg-Liegestützes.',
    remove:
      'Unterscheidet sich vom Schräg-Liegestütz allein in der Handbreite — nach unserer Regel eine Ausführungsvariation, kein eigener Katalogeintrag. Die weite Handstellung steht jetzt als Variation in dessen Instructions.',
  },
  {
    canonicalName: 'Air Squat',
    block: 7,
    note: 'Der Katalog nennt dieselbe Wortbildung bereits zweimal „ohne Gewicht" — beim Ausfallschritt und beim Step-up.',
    name: 'Kniebeuge ohne Gewicht',
  },
  {
    canonicalName: 'Nordic Hamstring Curl',
    block: 7,
    note: 'Regel C trennt nach Disziplin: eine Kräftigung der Beinrückseite, keine Calisthenics-Fertigkeit. Die Fixierung war zudem sprachlich offen und hätte einen Partner meinen können.',
    category: 'strength',
    instructions: [
      'Knie auf einer Matte und klemme die Fersen unter eine feste Auflage — Sprossenwand, Hantel oder Gerätefuß. Die Hüfte bleibt gestreckt.',
      'Senke den Oberkörper so langsam wie möglich nach vorne und halte dabei die Linie von Knie bis Schulter.',
      'Fange dich mit den Händen am Boden ab und drücke dich zurück in den Kniestand.',
    ],
  },

  // ── Block 8 · Stability ────────────────────────────────────────────────────
  {
    canonicalName: 'Barbell Ab Rollout',
    block: 8,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Gehe in eine Liegestützposition, greife dabei aber statt des Bodens eine Langhantel mit leichten Scheiben. Das ist die Ausgangsposition.',
      'Hebe bei leicht gestrecktem Rücken die Hüfte und rolle die Stange beim Ausatmen zu den Füßen. Das Gesäß kommt nach oben, die Bauchmuskulatur bleibt fest.',
      'Halte oben eine Sekunde und rolle die Stange beim Einatmen langsam zurück in die Ausgangsposition. Die Arme bleiben dabei senkrecht — sonst arbeiten Schultern und Rücken statt des Bauches.',
    ],
  },
  {
    canonicalName: 'Dead Bug',
    block: 8,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Lege dich auf den Rücken und strecke die Arme zur Decke. Bringe Füße, Knie und Hüfte in einen rechten Winkel.',
      'Atme kräftig aus, ziehe den Rippenbogen nach unten und drücke den Rücken flach auf den Boden. Kippe das Becken auf und spanne das Gesäß an. Diese Position hältst du während der gesamten Übung.',
      'Strecke ein Bein aus Knie und Hüfte, bis es knapp über dem Boden steht.',
      'Halte Lendenwirbelsäule und Becken dabei unverändert — der Rücken will ins Hohlkreuz ausweichen.',
      'Führe das Bein zurück und wiederhole im Wechsel mit der Gegenseite.',
    ],
  },
  {
    canonicalName: 'Pallof Press',
    block: 8,
    note: 'Sechs Primärmuskeln machen jede Muskelfilterung wertlos. Der Pallof Press ist eine Anti-Rotations-Übung.',
    primaryMuscles: ['obliques', 'abs'],
    secondaryMuscles: ['shoulders', 'glutes'],
    instructions: [
      'Befestige einen Griff am Kabelzug, möglichst auf Schulterhöhe; eine tiefe Rolle genügt ebenfalls.',
      'Stelle dich seitlich zum Gerät, greife den Griff mit beiden Händen und tritt etwa eine Armlänge zur Seite, bis Zug auf dem Kabel liegt.',
      'Die Füße stehen hüftbreit, die Knie sind leicht gebeugt, der Griff liegt vor der Brustmitte. Das ist die Ausgangsposition.',
      'Drücke den Griff gerade von der Brust weg, bis beide Arme gestreckt sind. Der Rumpf bleibt fest und lässt sich nicht zur Seite drehen.',
      'Halte einige Sekunden und führe den Griff zurück. Wiederhole den Satz anschließend zur anderen Seite gewandt.',
    ],
  },
  {
    canonicalName: 'Russian Twist',
    block: 8,
    note: 'Der Latissimus rotiert den Rumpf nicht; ein Gymnastikball kommt in der Anleitung nicht vor.',
    primaryMuscles: ['obliques', 'abs'],
    equipment: ['dumbbell', 'gym_mat'],
    instructions: [
      'Lege dich auf den Rücken und klemme die Füße unter einen festen Gegenstand. Die Knie sind gebeugt.',
      'Richte den Oberkörper auf, bis er mit den Oberschenkeln ein V bildet. Die Arme sind vor dem Körper gestreckt, die Hände gefasst. Das ist die Ausgangsposition.',
      'Drehe den Oberkörper beim Ausatmen zur rechten Seite, bis die Arme parallel zum Boden stehen.',
      'Halte eine Sekunde, komm zurück in die Mitte und drehe anschließend zur linken Seite.',
    ],
  },
  {
    canonicalName: 'Dumbbell Side Bend',
    block: 8,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Stehe aufrecht mit einer Kurzhantel in der linken Hand, die Handfläche zeigt zum Rumpf. Die rechte Hand liegt in der Taille, die Füße stehen schulterbreit. Das ist die Ausgangsposition.',
      'Neige dich bei geradem Rücken und erhobenem Kopf nur aus der Taille so weit wie möglich nach rechts. Atme dabei ein, halte kurz und komm beim Ausatmen zurück. Der übrige Körper bleibt ruhig.',
      'Neige dich anschließend zur linken Seite und halte dort ebenfalls kurz.',
      'Wechsle nach der vorgesehenen Anzahl die Hand.',
    ],
  },
  {
    canonicalName: 'Barbell Side Bend',
    block: 8,
    note: 'Die Seitneigung ist Arbeit der schrägen Bauchmuskulatur; die Variante mit Kurzhantel steht bereits so.',
    primaryMuscles: ['abs', 'obliques'],
    instructions: [
      'Stehe aufrecht mit einer Langhantel auf dem oberen Rücken, knapp unterhalb des Nackens. Die Füße stehen schulterbreit. Das ist die Ausgangsposition.',
      'Neige dich bei geradem Rücken und erhobenem Kopf nur aus der Taille so weit wie möglich nach rechts. Atme dabei ein, halte kurz und komm beim Ausatmen zurück.',
      'Neige dich anschließend zur linken Seite. Der übrige Körper bleibt ruhig.',
    ],
  },
  {
    canonicalName: 'Standing Cable Wood Chop',
    block: 8,
    note: 'Eine Rotationsbewegung; die Anleitung führt den Satz zuerst zur einen, dann zur anderen Seite.',
    primaryMuscles: ['obliques'],
    secondaryMuscles: ['abs', 'shoulders'],
    unilateral: true,
    instructions: [
      'Befestige einen Griff an der obersten Rolle des Kabelzugs.',
      'Stelle dich seitlich zum Gerät, greife den Griff mit einer Hand und tritt etwa eine Armlänge zur Seite. Der gestreckte Arm zeigt in Verlängerung des Kabels.',
      'Die Füße stehen schulterbreit. Greife nun mit der zweiten Hand nach oben, sodass beide Hände den Griff halten und die Arme gestreckt bleiben.',
      'Ziehe den Griff in einer Bewegung diagonal nach unten zum vorderen Knie und drehe dabei den Oberkörper. Rücken und Arme bleiben gestreckt, der Rumpf fest; der hintere Fuß dreht mit und die Knie beugen sich.',
      'Führe den Griff langsam und kontrolliert zurück. Wiederhole den Satz anschließend zur anderen Seite.',
    ],
  },
  {
    canonicalName: 'Plank',
    block: 8,
    note: 'Bizeps und Trizeps arbeiten im Unterarmstütz nicht.',
    secondaryMuscles: ['quads', 'shoulders'],
    instructions: [
      'Gehe in Bauchlage und stütze dein Gewicht auf den Fußspitzen und den Unterarmen. Die Ellenbogen stehen direkt unter den Schultern.',
      'Halte den Körper durchgehend gerade und die Position so lange wie möglich.',
      'Um die Übung zu erschweren, kannst du einen Arm oder ein Bein anheben.',
    ],
  },
];

/**
 * Blocks 9, 10 and 11 — Plyometrics, Olympic Weightlifting, Endurance.
 * Reviewed 2026-08-16. With these the catalogue has been read through once.
 *
 * The recurring correction is the same one that ran through the strength
 * blocks: the sourced rows list every muscle anatomically involved, so a jump
 * carries five secondary muscles and a snatch eight. The editorial rows beside
 * them carry two or three, which is what makes a muscle filter usable.
 *
 * `jump_rope` and `battle_rope` entered the vocabulary here — the last two of
 * five implements the review added, each because an exercise named a tool the
 * catalogue could not express.
 */
export const BLOCK_9_10_11: readonly ReviewDecision[] = [
  // ── Block 9 · Plyometrics ──────────────────────────────────────────────────
  {
    canonicalName: 'Double Leg Butt Kick',
    block: 9,
    note: 'Das Anfersen beugt das Knie — die Beinrückseite gehört nach vorne, nicht ans Ende einer Fünferliste.',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings', 'calves'],
    instructions: [
      'Stehe aufrecht mit leicht gebeugten Knien.',
      'Gehe kurz in die Hocke und springe unmittelbar danach so hoch wie möglich ab.',
      'Ziehe im Aufstieg die Fersen zum Gesäß, indem du die Knie beugst.',
      'Lande mit nur leicht gebeugten Knien und fange den Aufprall über die Beine ab.',
    ],
  },
  {
    canonicalName: 'Box Skip',
    block: 9,
    note: 'Der Absprung kommt aus der Hüftstreckung; fünf Sekundärmuskeln sind eine Aufzählung, keine Zuordnung.',
    primaryMuscles: ['glutes', 'quads'],
    secondaryMuscles: ['hamstrings', 'calves'],
    instructions: [
      'Stelle mehrere Kästen in etwa zweieinhalb Metern Abstand hintereinander auf.',
      'Stelle dich vor den ersten Kasten, ein Bein leicht hinter dem anderen.',
      'Drücke dich vom hinteren Bein ab und bringe die Hüfte so hoch wie möglich.',
      'Sobald du auf dem Kasten landest, ziehe das andere Bein nach vorne oben und springe vom Kasten ab. Lande zwischen den ersten beiden Kästen auf demselben Bein.',
      'Gehe zum nächsten Kasten und wiederhole.',
    ],
  },
  {
    canonicalName: 'Single-Leg Lateral Hop',
    block: 9,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Stelle dich seitlich neben eine Markierung oder Hürde und stehe auf einem Bein, das Knie leicht gebeugt.',
      'Springe mit einem kurzen Gegenschwung seitlich über die Markierung.',
      'Lande auf demselben Bein und springe unmittelbar zurück in die Ausgangsposition.',
      'Springe im Rhythmus hin und her.',
    ],
  },
  {
    canonicalName: 'Single Leg Butt Kick',
    block: 9,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Stehe auf einem Bein, das andere Knie ist angehoben. Das ist die Ausgangsposition.',
      'Springe mit einem kurzen Gegenschwung ab, indem du Hüfte, Knie und Sprunggelenk des Standbeins streckst.',
      'Beuge sofort das Knie und ziehe die Ferse zum Gesäß.',
      'Setze das Bein leicht gebeugt unter der Hüfte wieder auf. Das andere Bein bleibt während der ganzen Übung in seiner Position.',
    ],
  },
  {
    canonicalName: 'Front Box Jump',
    block: 9,
    note: 'Ein Kastensprung wird aus Knie- und Hüftstreckung erzeugt; der sitzende Kastensprung steht bereits auf `quads`.',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings', 'calves'],
    instructions: [
      'Stelle einen Kasten passender Höhe etwa einen halben Meter vor dich. Die Füße stehen schulterbreit.',
      'Gehe kurz in die Hocke und schwinge die Arme nach hinten.',
      'Springe unmittelbar aus dieser Position ab, strecke Hüfte, Knie und Sprunggelenke und schwinge die Arme nach vorne oben.',
      'Lande mit gebeugten Knien auf dem Kasten und fange den Aufprall über die Beine ab. Steige anschließend besser Bein für Bein herunter, als herunterzuspringen.',
    ],
  },
  {
    canonicalName: 'Mountain Climbers',
    block: 9,
    note: 'Kein Sprung und kein Wurf — Regel D bindet `plyometrics` an explosives Springen und Werfen.',
    category: 'strength',
    instructions: [
      'Gehe in die Liegestützposition und stütze dein Gewicht auf Händen und Fußspitzen. Ziehe ein Knie an, bis es etwa unter der Hüfte steht. Das ist die Ausgangsposition.',
      'Wechsle die Beinstellung explosiv: Strecke das gebeugte Bein bis auf die Fußspitze durch und ziehe gleichzeitig das andere Knie nach vorne.',
      'Setze den Wechsel 20 bis 30 Sekunden im gleichmäßigen Rhythmus fort.',
    ],
  },
  {
    canonicalName: 'Supine Chest Throw',
    block: 9,
    note: 'Ein Brustwurf ist eine Druckbewegung der Brust; der Trizeps streckt nur mit.',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['shoulders', 'triceps'],
    instructions: [
      'Lege dich auf den Rücken, die Knie gebeugt. Diese Variante eignet sich, wenn weder Partner noch belastbare Wand zur Verfügung stehen.',
      'Halte den Ball mit beiden Händen von unten auf der Brust.',
      'Stoße ihn explosiv durch Strecken der Arme gerade nach oben, so hoch wie möglich.',
      'Fange ihn mit beiden Händen wieder auf.',
    ],
  },
  {
    canonicalName: 'Supine One-Arm Overhead Throw',
    block: 9,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Lege dich auf den Rücken, die Knie gebeugt. Halte den Ball in einer Hand und strecke den Arm hinter den Kopf. Das ist die Ausgangsposition.',
      'Leite die Bewegung aus der Schulter ein und wirf den Ball nach vorne, während du dich aufsetzt. Ziel ist die größtmögliche Weite.',
      'Wirf gegen eine Wand oder hole den Ball selbst zurück; wechsle nach der Serie die Seite.',
    ],
  },
  {
    canonicalName: 'Supine Two-Arm Overhead Throw',
    block: 9,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Lege dich auf den Rücken, die Knie gebeugt.',
      'Halte den Ball mit beiden Händen und strecke die Arme hinter den Kopf. Das ist die Ausgangsposition.',
      'Leite die Bewegung aus der Schulter ein und wirf den Ball nach vorne, während du dich aufsetzt. Ziel ist die größtmögliche Weite.',
      'Wirf gegen eine Wand oder hole den Ball selbst zurück.',
    ],
  },
  {
    canonicalName: 'Backward Medicine Ball Throw',
    block: 9,
    note: 'Der Rückwärtswurf wird aus Hocke und Hüftstreckung erzeugt; die Schulter führt nur.',
    primaryMuscles: ['glutes', 'hamstrings'],
    secondaryMuscles: ['shoulders', 'lower_back'],
    instructions: [
      'Halte den Ball mit beiden Händen zwischen den Beinen. Wirf gegen eine Wand oder hole den Ball selbst zurück.',
      'Gehe in die Hocke und kehre die Bewegung kraftvoll um.',
      'Wirf den Ball aus der vollen Streckung über den Kopf nach hinten.',
    ],
  },
  {
    canonicalName: 'Medicine Ball Scoop Throw',
    block: 9,
    note: '„Scoop Throw" ist im deutschen Coaching nicht etabliert; die Bewegung ist ein Wurf aus der Hocke.',
    name: 'Wurf aus der Hocke mit Medizinball',
    instructions: [
      'Gehe in eine halbe Hocke und halte den Medizinball mit hängenden Armen nahe an den Füßen.',
      'Schiebe die Hüfte nach vorne, strecke die Beine und springe dabei ab.',
      'Schwinge die gestreckten Arme nach oben über den Kopf und lass den Ball am höchsten Punkt los. Ziel ist die größtmögliche Weite nach hinten.',
    ],
  },
  {
    canonicalName: 'Lateral Bound',
    block: 9,
    note: 'Der seitliche Absprung drückt vom Standbein weg — Hüftstreckung und Abduktion. Die Adduktoren bremsen nur die Landung.',
    primaryMuscles: ['glutes', 'quads'],
    secondaryMuscles: ['abductors', 'adductors', 'calves'],
    instructions: [
      'Gehe in eine halbe Hocke, quer zur Sprungrichtung. Das ist die Ausgangsposition.',
      'Verlagere das Gewicht auf das äußere Bein und hole mit dem führenden Bein kurz nach innen aus.',
      'Drücke dich sofort ab und springe so weit wie möglich zur Seite.',
      'Drücke dich bei der Landung unmittelbar in die Gegenrichtung ab und kehre in die Ausgangsposition zurück.',
      'Springe mehrere Wiederholungen hin und her.',
    ],
  },
  {
    canonicalName: 'Lateral Box Jump',
    block: 9,
    note: 'Wie beim seitlichen Bound: der Absprung ist Hüftstreckung, nicht Adduktion.',
    primaryMuscles: ['glutes', 'quads'],
    secondaryMuscles: ['abductors', 'adductors', 'calves'],
    instructions: [
      'Stelle dich neben einen niedrigen Kasten. Das ist die Ausgangsposition.',
      'Gehe kurz in eine Viertelhocke und kehre die Bewegung sofort um, um nach oben und zur Seite zu springen.',
      'Ziehe die Knie hoch genug an, damit die Füße den Kasten sicher überqueren.',
      'Lande mittig auf dem Kasten und fange den Aufprall über die Beine ab.',
      'Springe kontrolliert auf die andere Seite herunter und wiederhole hin und her.',
    ],
  },
  {
    canonicalName: 'Dumbbell Seated Box Jump',
    block: 9,
    note: 'Die Anleitung setzt auf einer Bank an.',
    equipment: ['dumbbell', 'bench'],
    instructions: [
      'Stelle einen Kasten etwa einen halben Meter vor eine Bank. Setze dich mit Blick zum Kasten auf die Bank und halte eine Kurzhantel mit beiden Händen vor der Brust.',
      'Stelle die Füße fest auf, neige dich nach vorne und springe durch Strecken von Hüfte und Knien nach oben und vorne.',
      'Lande mit beiden Füßen auf dem Kasten und fange den Aufprall über Hüfte und Knie ab.',
      'Steige herunter und setze dich wieder hin.',
    ],
  },
  {
    canonicalName: 'Standing Two-Arm Overhead Throw',
    block: 9,
    note: 'Fachlich unverändert; deutsche Textfassung.',
    instructions: [
      'Stehe schulterbreit und halte den Medizinball mit beiden Händen. Führe ihn weit hinter den Kopf, beuge die Knie leicht und lehne dich zurück.',
      'Wirf den Ball kraftvoll nach vorne, indem du aus der Hüfte beugst und den ganzen Körper einsetzt.',
      'Wirf gegen eine Wand und fange den zurückspringenden Ball.',
    ],
  },
  {
    canonicalName: 'Overhead Slam',
    block: 9,
    note: 'Ein Slam schlägt aus Latissimus und Rumpfbeugung zu.',
    primaryMuscles: ['lats', 'abs'],
    secondaryMuscles: ['shoulders'],
    instructions: [
      'Stehe schulterbreit und halte den Medizinball mit beiden Händen. Das ist die Ausgangsposition.',
      'Führe den Ball über den Kopf und strecke den Körper vollständig.',
      'Kehre die Bewegung um und schlage den Ball so kraftvoll wie möglich direkt vor dir auf den Boden.',
      'Fange den zurückspringenden Ball mit beiden Händen und wiederhole.',
    ],
  },

  // ── Block 10 · Olympic Weightlifting ───────────────────────────────────────
  {
    canonicalName: 'Kneeling Jump Squat',
    block: 10,
    note: 'Kein Reiß- oder Umsetzderivat, sondern ein Sprung mit Zusatzlast. Regel G begrenzt die Kategorie auf die Disziplin.',
    category: 'plyometrics',
    primaryMuscles: ['glutes', 'quads'],
    secondaryMuscles: ['hamstrings', 'calves'],
    instructions: [
      'Knie auf dem Boden, die Langhantel liegt auf dem oberen Rücken — alternativ ohne Zusatzlast. Im Power Rack lässt sich die Stange leichter aufnehmen.',
      'Setze die Hüfte zurück, bis das Gesäß die Fersen berührt. Kopf und Brust bleiben aufgerichtet.',
      'Strecke die Hüfte explosiv und erzeuge genug Kraft, um mit beiden Füßen flach auf dem Boden zu landen.',
      'Drücke aus der Hocke über die Fersen weiter nach oben, bis du aufrecht stehst.',
    ],
  },
  {
    canonicalName: 'Hang Clean',
    block: 10,
    note: 'Angleichung an die Umsetz-Familie; sieben Sekundärmuskeln machen jede Filterung wertlos.',
    primaryMuscles: ['glutes', 'hamstrings', 'traps'],
    secondaryMuscles: ['quads', 'lower_back', 'shoulders', 'forearms'],
    instructions: [
      'Halte die Stange schulterbreit im Ober- oder Hakengriff auf Höhe der Oberschenkelmitte. Der Rücken ist gerade und leicht nach vorne geneigt.',
      'Strecke Hüfte, Knie und Sprunggelenke kraftvoll und beschleunige die Stange nach oben. Ziehe dabei die Schultern zu den Ohren.',
      'Tauche unter die Stange, fange sie auf den vorderen Schultern und richte dich über die Fersen wieder auf. Der Oberkörper bleibt aufrecht, die Ellenbogen hoch.',
    ],
  },
  {
    canonicalName: 'Hang Snatch',
    block: 10,
    note: 'Angleichung an die Reiß-Familie; acht Sekundärmuskeln sind eine Aufzählung, keine Zuordnung.',
    primaryMuscles: ['glutes', 'hamstrings', 'shoulders'],
    secondaryMuscles: ['quads', 'traps', 'lower_back', 'forearms'],
    instructions: [
      'Greife die Stange weit im Ober- oder Hakengriff. Die Füße stehen unter der Hüfte, leicht nach außen gedreht, die Knie sind leicht gebeugt, der Oberkörper ist nach vorne geneigt und der Rücken gestreckt. Die Stange liegt an der Hüfte.',
      'Strecke Beine und Hüfte kraftvoll. Ziehe auf dem höchsten Punkt die Schultern hoch und lass die Ellenbogen zur Seite ausweichen.',
      'Ziehe dich unter die Stange, während du sie über den Kopf führst, und fange sie so tief wie möglich mit gestreckten Armen auf.',
      'Richte dich mit der Last über Kopf auf und setze sie anschließend kontrolliert ab.',
    ],
  },
  {
    canonicalName: 'Push Press - Behind the Neck',
    block: 10,
    note: 'Fachlich unverändert; deutsche Textfassung. Der Name ist hier korrekt — die Stange liegt tatsächlich im Nacken.',
    instructions: [
      'Die Stange liegt auf dem oberen Rücken, die Füße stehen unter der Hüfte. Gehe leicht in die Knie, ohne die Hüfte nach hinten zu schieben.',
      'Kehre die Bewegung so kraftvoll wie möglich um und drücke über die Fersen. Die Stange läuft senkrecht nach oben.',
      'Nutze den erzeugten Schwung und drücke die Stange mit gestreckten Armen über den Kopf.',
      'Senke sie zurück in die Ausgangsposition und fange sie über die Beine ab.',
    ],
  },
  {
    canonicalName: 'Power Snatch',
    block: 10,
    note: 'Angleichung an die Reiß-Familie.',
    primaryMuscles: ['glutes', 'hamstrings', 'shoulders'],
    secondaryMuscles: ['quads', 'traps', 'lower_back', 'forearms'],
    instructions: [
      'Die beladene Stange liegt nah an den Schienbeinen. Greife sie weit, die Füße stehen unter der Hüfte, bei Bedarf leicht nach außen gedreht. Senke die Hüfte, Brust auf, Blick nach vorne, die Schultern knapp vor der Stange.',
      'Beginne den ersten Zug über die Fersen und hebe die Stange vom Boden. Der Rückenwinkel bleibt gleich, bis die Stange die Knie passiert.',
      'Gehe in den zweiten Zug über: Strecke Hüfte, Knie und Sprunggelenke so schnell wie möglich, die Stange bleibt eng am Körper. Ziehe auf dem höchsten Punkt die Schultern hoch und lass die Ellenbogen zur Seite ausweichen.',
      'Setze die Füße in die Fangposition, ziehe dich unter die Stange und fange sie mit gestreckten Armen in einer Teilhocke über Kopf auf.',
      'Richte dich mit der Last über Kopf auf.',
    ],
  },
  {
    canonicalName: 'Snatch',
    block: 10,
    note: 'Beim Reißen bleiben die Arme gestreckt — der Bizeps arbeitet nicht und ist dort ein Verletzungsrisiko.',
    primaryMuscles: ['glutes', 'hamstrings', 'shoulders'],
    secondaryMuscles: ['quads', 'traps', 'lower_back', 'forearms'],
    instructions: [
      'Stelle dich schulterbreit hin; die Stange liegt über dem Fußballen.',
      'Beuge die Knie, halte den Rücken flach und greife die Stange im Obergriff deutlich weiter als schulterbreit. Senke die Hüfte, als würdest du dich setzen. Das ist die Ausgangsposition.',
      'Drücke die Füße in den Boden und hebe die Stange körpernah an.',
      'Sobald die Stange die Oberschenkelmitte erreicht, drücke explosiv weiter und komme in die vollständige Streckung.',
      'Ziehe die Schultern hoch und führe die Ellenbogen dabei zur Seite und so lange wie möglich über der Stange.',
      'Tauche in einer schnellen Bewegung unter die Stange, strecke die Arme durch und fange die Last in der Hocke über Kopf auf.',
      'Richte dich aus der Hocke auf; am Ende stehen beide Füße auf einer Linie und die Arme sind gestreckt.',
    ],
  },
  {
    canonicalName: 'Overhead Squat',
    block: 10,
    note: 'Kategorie bleibt: die Überkopfkniebeuge ist ein anerkanntes Reißderivat. Sieben Sekundärmuskeln sind zu viele.',
    secondaryMuscles: ['hamstrings', 'shoulders', 'lower_back', 'abs'],
    instructions: [
      'Die Langhantel liegt vor dir am Boden, die Füße stehen weiter als schulterbreit.',
      'Beuge die Knie, greife die Stange im Obergriff deutlich weiter als schulterbreit und hebe sie zunächst auf die Brust.',
      'Führe die Stange über den Kopf und leicht dahinter, die Arme vollständig gestreckt. Kopf oben, Rücken gerade, Schulterblätter zusammengezogen. Das ist die Ausgangsposition.',
      'Senke dich beim Einatmen langsam ab, bis die Oberschenkel parallel zum Boden stehen. Die Arme bleiben durchgehend gestreckt über dem Kopf.',
      'Drücke dich beim Ausatmen über Füße und Beine zurück in die Ausgangsposition.',
    ],
  },
  {
    canonicalName: 'Clean',
    block: 10,
    note: 'Die Referenz der Umsetz-Familie; `lats` und `abs` im Sekundären erweitern sie ins Beliebige.',
    primaryMuscles: ['glutes', 'hamstrings', 'traps'],
    secondaryMuscles: ['quads', 'lower_back', 'shoulders', 'forearms'],
    instructions: [
      'Die Stange liegt nah an den Schienbeinen. Greife sie im Ober- oder Hakengriff knapp außerhalb der Beine. Senke die Hüfte, das Gewicht auf den Fersen, Rücken gerade, Blick nach vorne, Brust auf, die Schultern knapp vor der Stange.',
      'Erster Zug: Drücke über die Fersen und strecke die Knie. Der Rückenwinkel bleibt gleich, die Arme bleiben gestreckt. Führe die Stange kontrolliert bis über die Knie.',
      'Zweiter Zug — hier entsteht die Beschleunigung: Sobald die Stange die Oberschenkelmitte erreicht, strecke Hüfte, Knie und Sprunggelenke wie zu einem Sprung. Die Arme ziehen nicht mit; am Ende bist du vollständig gestreckt und lehnst leicht zurück.',
      'Dritter Zug: Ziehe die Schultern kraftvoll hoch, beuge die Arme mit Ellenbogen nach oben und außen und ziehe dich unter die Stange. Drehe die Ellenbogen unter die Stange und fange sie in der Frontkniebeuge auf den vorderen Schultern auf.',
      'Richte dich über die Fersen auf, der Oberkörper bleibt aufrecht und die Ellenbogen hoch.',
    ],
  },
  {
    canonicalName: 'Clean and Jerk',
    block: 10,
    note: 'Angleichung an „Umsetzen und Drücken" aus Block 4; acht Quellschritte auf sieben verdichtet.',
    primaryMuscles: ['glutes', 'hamstrings', 'traps', 'shoulders'],
    secondaryMuscles: ['quads', 'lower_back', 'triceps', 'forearms'],
    instructions: [
      'Die Stange liegt nah an den Schienbeinen. Greife sie im Ober- oder Hakengriff knapp außerhalb der Beine. Senke die Hüfte, Rücken gerade, Brust auf, die Schultern knapp vor der Stange.',
      'Erster Zug: Drücke über die Fersen und strecke die Knie. Der Rückenwinkel bleibt gleich, die Arme bleiben gestreckt, bis die Stange über den Knien ist.',
      'Zweiter Zug: Strecke ab der Oberschenkelmitte Hüfte, Knie und Sprunggelenke wie zu einem Sprung. Die Arme ziehen nicht mit.',
      'Dritter Zug: Ziehe die Schultern hoch, ziehe dich unter die Stange und fange sie in der Frontkniebeuge auf den vorderen Schultern auf. Richte dich über die Fersen auf.',
      'Zweite Phase, das Stoßen: Gehe aus dem Stand leicht in die Knie, ohne die Hüfte zurückzuschieben, und kehre die Bewegung so kraftvoll wie möglich um.',
      'Drücke über die Fersen und bringe den Kopf aus dem Weg, sobald die Stange die Schultern verlässt.',
      'Setze die Füße in die Schrittstellung — ein Fuß vor, einer zurück — und fange die Stange mit gestreckten Armen über Kopf auf. Richte dich anschließend auf.',
    ],
  },
  {
    canonicalName: 'Hang Power Clean',
    block: 10,
    note: 'Umsetz-Familie. Bei den Zügen ist `traps` primär richtig, beim Umsetzen nicht.',
    primaryMuscles: ['glutes', 'hamstrings', 'traps'],
    secondaryMuscles: ['quads', 'shoulders'],
  },
  {
    canonicalName: 'Clean Deadlift',
    block: 10,
    note: 'Kreuzheben-Familie, wie in Block 1, 3 und 4 entschieden.',
    primaryMuscles: ['hamstrings', 'glutes', 'lower_back'],
    secondaryMuscles: ['traps', 'quads'],
  },

  // ── Block 11 · Endurance ───────────────────────────────────────────────────
  {
    canonicalName: 'Battle Rope Waves',
    block: 11,
    note: 'Ein Battle Rope ist kein Widerstandsband: Es gibt nicht nach, es wird beschleunigt. Dafür wurde `battle_rope` ins Vokabular aufgenommen.',
    equipment: ['battle_rope'],
  },
  {
    canonicalName: 'Rope Jumping',
    block: 11,
    note: 'Ohne Springseil nicht ausführbar; die Quelle bestand zur Hälfte aus einem Kalorienvergleich.',
    equipment: ['jump_rope'],
    instructions: [
      'Halte je ein Seilende in einer Hand und lege das Seil hinter dir auf den Boden.',
      'Führe die Arme nach oben und schwinge das Seil über den Kopf nach vorne.',
      'Springe darüber, sobald es den Boden erreicht, und finde eine Frequenz, die du halten kannst.',
      'Tempo und Technik lassen sich variieren, um die Belastung zu steuern.',
    ],
  },
  {
    canonicalName: 'Double Under',
    block: 11,
    note: 'Ohne Springseil nicht ausführbar.',
    equipment: ['jump_rope'],
  },
  {
    canonicalName: 'Walking, Treadmill',
    block: 11,
    note: 'Das Laufband geht nicht. Die Quelle beschrieb überwiegend die Menüführung des Geräts und einen Kalorienvergleich.',
    name: 'Gehen auf dem Laufband',
    instructions: [
      'Stelle dich auf das Band und wähle Programm oder manuelle Einstellung. Über die Steigung steuerst du die Belastung.',
      'Gehe in einem zügigen, nicht gemütlichen Tempo und halte den Oberkörper aufrecht.',
      'Halte dich nur fest, wenn es nötig ist — beim Auf- und Absteigen oder zur Pulsmessung.',
    ],
  },
  {
    canonicalName: 'Recumbent Bike',
    block: 11,
    note: 'Vier Primärmuskeln machen die Muskelfilterung wertlos. Die Quelle beschrieb überwiegend die Menüführung.',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings', 'calves'],
    instructions: [
      'Setze dich auf das Rad und stelle den Sitz auf deine Beinlänge ein.',
      'Wähle Programm oder manuelle Einstellung; bei manchen Geräten startet die Anzeige erst beim Treten.',
      'Steuere die Belastung über den Widerstand und halte eine gleichmäßige Trittfrequenz.',
    ],
  },
  {
    canonicalName: 'Steady-State Rowing',
    block: 11,
    note: 'Die eigene Anleitung sagt es: Der Zug kommt aus den Beinen.',
    primaryMuscles: ['quads'],
    secondaryMuscles: ['upper_back', 'lats', 'glutes'],
  },
  {
    canonicalName: 'Rowing Intervals',
    block: 11,
    note: 'Wie beim Rudern im Grundlagenbereich: der Zug kommt aus den Beinen.',
    primaryMuscles: ['quads'],
    secondaryMuscles: ['upper_back', 'lats', 'glutes'],
  },
  {
    canonicalName: 'Easy Jog',
    block: 11,
    note: 'Der Dauerlauf ist dieselbe Bewegung langsamer und steht auf `quads`.',
    primaryMuscles: ['quads'],
    secondaryMuscles: ['hamstrings', 'calves'],
  },
];

export const REVIEWED: readonly ReviewDecision[] = [
  ...BLOCK_1,
  ...BLOCK_2,
  ...BLOCK_3,
  ...BLOCK_4,
  ...BLOCK_5_6,
  ...BLOCK_7_8,
  ...BLOCK_9_10_11,
];

const byCanonicalName = new Map(REVIEWED.map((decision) => [decision.canonicalName, decision]));

export const reviewDecision = (canonicalName: string): ReviewDecision | undefined =>
  byCanonicalName.get(canonicalName);

/** Which fields a decision actually overrides — drives the changelog. */
export function overriddenFields(decision: ReviewDecision): readonly string[] {
  const skip = new Set(['canonicalName', 'block', 'note', 'conflict', 'remove']);

  return Object.entries(decision)
    .filter(([field, value]) => !skip.has(field) && value !== undefined)
    .map(([field]) => field);
}
