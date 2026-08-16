import type { Description } from './descriptions';

/**
 * Third batch — mobility, plus the calisthenics and endurance entries.
 *
 * Mobility is where a differentiating description earns the most: 36 entries
 * share `mobility · static · isolation` and are told apart only by which
 * structure is worked and how. The muscle field says *what*; this says *how*
 * — rolled, stretched with a strap, or held.
 */
export const MOBILITY_DESCRIPTIONS: readonly Description[] = [
  // Faszienrollen
  {
    canonicalName: 'Hamstring-SMR',
    description:
      'Faszienrollen der Oberschenkelrückseite im Sitzen, ein Bein nach dem anderen, von der Hüfte bis zur Kniekehle.',
  },
  {
    canonicalName: 'Quadriceps-SMR',
    description: 'Faszienrollen der Oberschenkelvorderseite in Bauchlage, vom Knie bis zur Hüfte.',
  },
  {
    canonicalName: 'Calves-SMR',
    description: 'Faszienrollen der Wade im Sitzen, vom Knie bis zum Sprunggelenk.',
  },
  {
    canonicalName: 'Peroneals-SMR',
    description:
      'Faszienrollen der Unterschenkelaußenseite in Seitlage — trifft die Wadenbeinmuskulatur, nicht die Wade selbst.',
  },
  {
    canonicalName: 'Iliotibial Tract-SMR',
    description:
      'Faszienrollen der Oberschenkelaußenseite in Seitlage, von der Hüfte bis zum Knie.',
  },
  {
    canonicalName: 'Piriformis-SMR',
    description:
      'Faszienrollen des Gesäßes im Sitzen mit überkreuztem Bein; die Kreuzung bringt den Druck auf die tiefe Gesäßmuskulatur.',
  },
  {
    canonicalName: 'Latissimus Dorsi-SMR',
    description:
      'Faszienrollen der seitlichen Rückenmuskulatur in Seitlage, knapp hinter der Achsel.',
  },
  {
    canonicalName: 'Rhomboids-SMR',
    description:
      'Faszienrollen des oberen Rückens in Rückenlage; die vor der Brust verschränkten Arme schieben die Schulterblätter auseinander.',
  },
  {
    canonicalName: 'Lower Back-SMR',
    description:
      'Faszienrollen des unteren Rückens, seitlich versetzt neben der Wirbelsäule statt auf ihr.',
  },
  {
    canonicalName: 'Brachialis-SMR',
    description:
      'Faszienrollen der Oberarmaußenseite in Seitlage, mit dem Körpergewicht auf dem Arm.',
  },

  // Dehnungen mit Gurt
  {
    canonicalName: 'Hamstring Stretch',
    description:
      'Dehnung der Beinrückseite in Rückenlage mit Gurt am Fuß; das gestreckte Bein wird passiv zum Körper gezogen.',
  },
  {
    canonicalName: 'Quad Stretch',
    description:
      'Dehnung der Oberschenkelvorderseite in Seitlage mit Gurt am Fuß; die gestreckte Hüfte verstärkt die Dehnung.',
  },
  {
    canonicalName: 'Peroneals Stretch',
    description:
      'Dehnung der Unterschenkelaußenseite im Sitzen: Der Gurt kippt den Fuß nach innen.',
  },
  {
    canonicalName: 'Seated Hamstring and Calf Stretch',
    description:
      'Dehnung von Beinrückseite und Wade zugleich im Sitzen; der Gurt zieht die Zehen an.',
  },
  {
    canonicalName: 'Standing Hamstring and Calf Stretch',
    description:
      'Dieselbe Dehnung im Stand mit vorgesetztem Fuß — das hintere Bein trägt, das vordere wird gedehnt.',
  },

  // Dehnungen ohne Gerät
  {
    canonicalName: 'Seated Floor Hamstring Stretch',
    description:
      'Dehnung der Beinrückseite im Sitzen ohne Hilfsmittel; der Oberkörper beugt aus der Hüfte zum gestreckten Bein.',
  },
  {
    canonicalName: 'Seated Calf Stretch',
    description:
      'Dehnung der Wade im Sitzen; die Zehen werden mit Hand, Handtuch oder Band herangezogen.',
  },
  {
    canonicalName: 'Standing Toe Touches',
    description:
      'Vorbeuge im Stand mit hängendem Oberkörper — dehnt die gesamte Rückseite ohne aktives Ziehen.',
  },
  {
    canonicalName: 'Standing Elevated Quad Stretch',
    description:
      'Dehnung der Oberschenkelvorderseite mit dem hinteren Fuß auf einer Erhöhung, im Stand statt in Seitlage.',
  },
  {
    canonicalName: 'Kneeling Hip Flexor',
    description:
      'Dehnung des Hüftbeugers im Kniestand; das Verlagern nach vorne öffnet die Hüfte des hinteren Beins.',
  },
  {
    canonicalName: 'Standing Hip Flexors',
    description:
      'Dieselbe Dehnung im Stand — bleibt flacher, weil der Hüftbeuger im Stehen nicht loslassen kann.',
  },
  {
    canonicalName: 'Side Lying Groin Stretch',
    description:
      'Dehnung der Adduktoren in Seitlage; das obere Bein wird zur Schulter gezogen und gleichzeitig zum Boden gedrückt.',
  },
  {
    canonicalName: 'Chest Stretch on Stability Ball',
    description:
      'Dehnung der Brust im Vierfüßlerstand mit einem Ellenbogen auf dem Gymnastikball, Arm für Arm.',
  },
  {
    canonicalName: 'Shoulder Stretch',
    description: 'Dehnung der Schulter durch Führen des gestreckten Arms quer vor dem Körper.',
  },
  {
    canonicalName: 'Upper Back Stretch',
    description:
      'Dehnung des oberen Rückens im Stand: verschränkte Finger nach vorne strecken und die Schulterblätter auseinanderschieben.',
  },
  {
    canonicalName: 'Side-Lying Floor Stretch',
    description:
      'Dehnung der gesamten seitlichen Körperlinie in Seitlage, vom Fuß über die Flanke bis zum ausgestreckten Arm.',
  },
  {
    canonicalName: 'Seated Overhead Stretch',
    description:
      'Seitneigung im Sitzen mit einer Hand hinter dem Kopf; dehnt die seitliche Rumpfmuskulatur.',
  },
  {
    canonicalName: 'Standing Lateral Stretch',
    description:
      'Dieselbe Seitneigung im Stand — das Gewicht bleibt gleichmäßig auf beiden Beinen.',
  },
  {
    canonicalName: 'Overhead Stretch',
    description:
      'Strecken über Kopf mit verschränkten Fingern; dehnt Vorder- und Rückseite des Rumpfes zugleich.',
  },
  {
    canonicalName: 'Cat Stretch',
    description:
      'Rundmachen des Rückens im Vierfüßlerstand, 15 Sekunden gehalten — mobilisiert die Wirbelsäule in die Beugung.',
  },
  {
    canonicalName: "Child's Pose",
    description:
      'Gesäß auf den Fersen, Arme nach vorne ausgestreckt; streckt die gesamte Wirbelsäule passiv.',
  },

  // Dynamische Mobilisation
  {
    canonicalName: 'Front Leg Raises',
    description:
      'Beinschwung vor und zurück an einer Stütze; mobilisiert die Hüfte dynamisch, statt eine Position zu halten.',
  },
  {
    canonicalName: 'Side Leg Raises',
    description:
      'Beinschwung zur Seite und über das Standbein kreuzend; die Bewegungsweite wächst über die Wiederholungen.',
  },
  {
    canonicalName: 'Rear Leg Raises',
    description:
      'Beinstrecken nach hinten oben im Vierfüßlerstand; Knie und Hüfte strecken sich gemeinsam.',
  },
  {
    canonicalName: 'Windmills',
    description:
      'Beinkreuzen über den Körper in Rückenlage im Wechsel — mobilisiert die Rumpfrotation zügig statt gehalten.',
  },
  {
    canonicalName: 'Shoulder Raise',
    description:
      'Schulterheben zu den Ohren und zurück; lockert den Nacken- und Trapezbereich ohne Zusatzlast.',
  },

  // Calisthenics
  {
    canonicalName: 'Incline Push-Up',
    description:
      'Liegestütz mit den Händen auf einer Erhöhung — die leichteste Variante; eine weitere Handstellung betont die Brust, eine enge den Trizeps.',
  },
  {
    canonicalName: 'Decline Push-Up',
    description:
      'Liegestütz mit den Füßen auf einer Erhöhung; die schwerere Gegenrichtung zum Schräg-Liegestütz.',
  },
  {
    canonicalName: 'Single-Arm Push-Up',
    description:
      'Liegestütz auf einem Arm mit breiterem Fußstand; die freie Hand liegt hinter dem Rücken.',
  },
  {
    canonicalName: 'Suspended Push-Up',
    description:
      'Liegestütz mit den Händen in Schlingen; je waagerechter der Körper, desto schwerer wird die Übung.',
  },
  {
    canonicalName: 'Inverted Row',
    description:
      'Waagerechtes Ziehen unter einer hüfthohen Stange mit den Fersen am Boden — die Einsteigerform des Klimmzugs.',
  },
  {
    canonicalName: 'Muscle Up',
    description:
      'Klimmzug an Ringen, der oben in einen Stütz übergeht; verbindet Zug- und Druckbewegung in einer Wiederholung.',
  },

  // Ausdauer
  {
    canonicalName: 'Walking, Treadmill',
    description:
      'Zügiges Gehen auf dem Laufband; die Steigung steuert die Belastung, nicht das Tempo.',
  },
  {
    canonicalName: 'Recumbent Bike',
    description:
      'Radfahren im Liegesitz mit Rückenlehne — gelenkschonend und ohne Belastung des unteren Rückens.',
  },
  {
    canonicalName: 'Rope Jumping',
    description:
      'Seilspringen in gleichmäßiger Frequenz; fordert neben der Ausdauer die Koordination.',
  },
];
