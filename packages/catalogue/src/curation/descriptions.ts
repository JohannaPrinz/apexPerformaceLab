/**
 * One sentence per exercise, written to *distinguish* it.
 *
 * The catalogue has 131 exercises whose structured fields — category, muscles,
 * equipment, sidedness — match at least one other entry exactly. A filter
 * narrows to a group and the coach picks by name. This field is what makes that
 * pick informed: not "trains the chest", which the muscle list already says,
 * but what this exercise does that the one beside it does not.
 *
 * Written from the German instructions the catalogue already carries. **No new
 * claim** — if the difference is not in the instructions, it is not here either.
 * Nothing is taken from outside the licence line: wrkout is public domain, the
 * rest is ours, and a description assembled from web sources would quietly undo
 * that.
 */

import { MOBILITY_DESCRIPTIONS } from './descriptions-mobility';
import { POWER_DESCRIPTIONS } from './descriptions-power';
import { STRENGTH_DESCRIPTIONS } from './descriptions-strength';

export interface Description {
  readonly canonicalName: string;
  readonly description: string;
}

const CORE: readonly Description[] = [
  // ── Kraft · Drücken ────────────────────────────────────────────────────────
  {
    canonicalName: 'Dumbbell Bench Press',
    description:
      'Das Grundbankdrücken mit Kurzhanteln: Jede Seite arbeitet für sich, was mehr Kontrolle verlangt als eine Langhantel und eine größere Bewegungsweite zulässt.',
  },
  {
    canonicalName: 'Machine Bench Press',
    description:
      'Geführtes Bankdrücken an der Brustpresse — die Maschine übernimmt die Stabilisierung und macht die Übung ohne Sicherungsperson möglich.',
  },
  {
    canonicalName: 'Decline Dumbbell Bench Press',
    description:
      'Bankdrücken mit Kurzhanteln auf der Negativbank; die abfallende Neigung verlagert die Arbeit auf die untere Brust.',
  },
  {
    canonicalName: 'Decline Barbell Bench Press',
    description:
      'Wie das Negativ-Bankdrücken mit Kurzhanteln, aber mit der Langhantel — schwerere Lasten bei geringerer Bewegungsfreiheit der Arme.',
  },
  {
    canonicalName: 'One Arm Dumbbell Bench Press',
    description:
      'Bankdrücken mit nur einer Kurzhantel; die einseitige Last zwingt den Rumpf, die Drehung aktiv zu halten.',
  },
  {
    canonicalName: 'Reverse Band Bench Press',
    description:
      'Bankdrücken mit Bändern von oben, die unten entlasten und oben nachlassen — für schwere Lasten am oberen Bewegungsende.',
  },
  {
    canonicalName: 'Cable Chest Press',
    description:
      'Sitzendes Brustdrücken am Kabelzug; der Zug hält die Spannung über die ganze Bewegung, auch in der Streckung.',
  },
  {
    canonicalName: 'Cable Chest Press - Incline',
    description:
      'Brustdrücken am Kabelzug mit angestellter Lehne — dieselbe Bewegung mit Betonung der oberen Brust.',
  },
  {
    canonicalName: 'Standing Cable Chest Press',
    description:
      'Brustdrücken am Kabelzug im Stand; ohne Lehne muss der Rumpf den Druck selbst abfangen.',
  },
  {
    canonicalName: 'Incline Cable Flye',
    description:
      'Fliegende Bewegung am Kabelzug auf der Schrägbank: gestreckte Arme, Bewegung nur im Schultergelenk — anders als beim Drücken arbeitet der Trizeps nicht mit.',
  },
  {
    canonicalName: 'Dumbbell Floor Press',
    description:
      'Drücken am Boden: Der Ellenbogen stoppt am Boden, was die Bewegungsweite begrenzt und den Trizeps stärker fordert als das Bankdrücken.',
  },
  {
    canonicalName: 'One Arm Floor Press',
    description:
      'Floor Press mit einem Arm; die einseitige Last kommt zur begrenzten Bewegungsweite hinzu.',
  },

  // ── Kraft · Schulter ───────────────────────────────────────────────────────
  {
    canonicalName: 'Standing Military Press',
    description:
      'Überkopfdrücken mit der Langhantel im Stand — der ganze Körper stabilisiert, anders als bei jeder sitzenden Variante.',
  },
  {
    canonicalName: 'Shoulder Press, Barbell',
    description:
      'Überkopfdrücken mit der Langhantel im Sitzen; die Rückenlehne nimmt dem Rumpf die Arbeit ab und erlaubt mehr Gewicht.',
  },
  {
    canonicalName: 'Dumbbell Shoulder Press',
    description:
      'Überkopfdrücken mit Kurzhanteln im Sitzen: Beide Seiten arbeiten unabhängig, die Hanteln treffen sich oben.',
  },
  {
    canonicalName: 'Dumbbell One-Arm Shoulder Press',
    description:
      'Überkopfdrücken mit einer Kurzhantel; die einseitige Last fordert die seitliche Rumpfmuskulatur mit.',
  },
  {
    canonicalName: 'Cable Shoulder Press',
    description:
      'Überkopfdrücken am Kabelzug im Stand — der Zug bleibt auch in der Streckung auf der Schulter.',
  },
  {
    canonicalName: 'Seated Cable Shoulder Press',
    description:
      'Überkopfdrücken am Kabelzug im Sitzen; gegenüber der stehenden Variante entfällt die Rumpfarbeit.',
  },
  {
    canonicalName: 'Alternating Cable Shoulder Press',
    description:
      'Überkopfdrücken am Kabelzug im Wechsel — während eine Seite drückt, hält die andere die Last auf Schulterhöhe.',
  },
  {
    canonicalName: 'Shoulder Press - With Bands',
    description:
      'Überkopfdrücken mit Widerstandsband: Der Widerstand wächst nach oben, statt wie bei Hanteln gleich zu bleiben.',
  },
  {
    canonicalName: 'One-Arm Kettlebell Push Press',
    description:
      'Überkopfdrücken mit Beinantrieb: Ein kurzes Eintauchen erzeugt den Schwung, der die Kettlebell über den Kopf bringt.',
  },
  {
    canonicalName: 'Front Raise (Cable)',
    description:
      'Frontheben am Kabelzug, ein Arm nach dem anderen — hebt gerade nach vorne, anders als das Seitheben.',
  },
  {
    canonicalName: 'Side Laterals to Front Raise',
    description:
      'Kombination aus Front- und Seitheben: Die Hanteln gehen nach vorne hoch und werden oben zur Seite ausgeführt.',
  },
  {
    canonicalName: 'One-Arm Incline Lateral Raise',
    description:
      'Seitheben in Seitlage auf der Schrägbank; die Ablage nimmt den Schwung heraus und hält die Schulter über die ganze Bewegung unter Zug.',
  },
  {
    canonicalName: 'Cable Seated Lateral Raise',
    description:
      'Vorgebeugtes Seitheben am Kabelzug im Sitzen — die vorgebeugte Haltung trifft die hintere Schulter statt der seitlichen.',
  },
  {
    canonicalName: 'Cable Rear Delt Fly',
    description:
      'Reverse Fly an zwei über Kopf gestellten Kabelzügen; die gekreuzten Kabel ziehen die gestreckten Arme nach hinten aus.',
  },
  {
    canonicalName: 'Seated Bent-Over Rear Delt Raise',
    description:
      'Hinteres Seitheben im Sitzen, der Oberkörper auf den Oberschenkeln abgelegt — Kurzhantelvariante zum Kabelzug.',
  },
  {
    canonicalName: 'Lying Rear Delt Raise',
    description:
      'Hinteres Seitheben bäuchlings auf der Flachbank; die Bank verhindert jedes Ausweichen mit dem Rumpf.',
  },
  {
    canonicalName: 'Dumbbell Lying Rear Lateral Raise',
    description:
      'Hinteres Seitheben bäuchlings auf leicht angestellter Schrägbank — die Neigung verlagert den Zug etwas weiter nach oben.',
  },
  {
    canonicalName: 'Lying One-Arm Lateral Raise',
    description:
      'Hinteres Seitheben bäuchlings mit einem Arm auf der Flachbank; die freie Hand stabilisiert.',
  },
  {
    canonicalName: 'Dumbbell Lying One-Arm Rear Lateral Raise',
    description:
      'Hinteres Seitheben mit einem Arm auf leicht angestellter Schrägbank — einseitige Fassung der Schrägbankvariante.',
  },
  {
    canonicalName: 'Dumbbell Scaption',
    description:
      'Heben in der Schulterblattebene, etwa 30 Grad zwischen Front- und Seitheben; kräftigt die Stabilisatoren des Schulterblatts.',
  },
  {
    canonicalName: 'External Rotation',
    description:
      'Außenrotation in Seitlage mit Kurzhantel — kräftigt die Rotatorenmanschette, ohne die großen Schultermuskeln zu belasten.',
  },
  {
    canonicalName: 'External Rotation with Band',
    description:
      'Außenrotation im Stand am Band; der Widerstand wächst mit dem Weg, anders als bei der Kurzhantel in Seitlage.',
  },
  {
    canonicalName: 'External Rotation with Cable',
    description: 'Außenrotation am Kabelzug; der Zug bleibt über die ganze Drehung gleich hoch.',
  },
  {
    canonicalName: 'Cable Internal Rotation',
    description:
      'Innenrotation am Kabelzug — die Gegenbewegung zur Außenrotation, führt den Unterarm vor den Bauch.',
  },

  // ── Kraft · Rücken und Zug ─────────────────────────────────────────────────
  {
    canonicalName: 'Bent Over Barbell Row',
    description:
      'Vorgebeugtes Rudern mit der Langhantel: beide Seiten gleichzeitig, der Rumpf hält die vorgebeugte Haltung frei.',
  },
  {
    canonicalName: 'One-Arm Dumbbell Row',
    description:
      'Rudern mit einer Kurzhantel, auf der Bank abgestützt — der abgestützte Oberkörper nimmt dem unteren Rücken die Arbeit ab.',
  },
  {
    canonicalName: 'Dumbbell Incline Row',
    description: 'Rudern bäuchlings an der Schrägbank; die Ablage schließt jeden Schwung aus.',
  },
  {
    canonicalName: 'Two-Arm Kettlebell Row',
    description: 'Vorgebeugtes Rudern mit zwei Kettlebells vom Boden, beide Seiten gleichzeitig.',
  },
  {
    canonicalName: 'Alternating Kettlebell Row',
    description:
      'Rudern mit zwei Kettlebells im Wechsel — eine bleibt am Boden, während die andere zieht.',
  },
  {
    canonicalName: 'Elevated Cable Rows',
    description:
      'Rudern am Kabelzug von einer Erhöhung aus; der höhere Sitz vergrößert die Bewegungsweite nach unten.',
  },
  {
    canonicalName: 'Upright Row - With Bands',
    description:
      'Aufrechtes Rudern am Band: zieht senkrecht am Körper hoch auf den Trapez, anders als jedes vorgebeugte Rudern.',
  },
  {
    canonicalName: 'Standing Dumbbell Upright Row',
    description: 'Aufrechtes Rudern mit zwei Kurzhanteln im Stand — freie Gewichte statt Band.',
  },
  {
    canonicalName: 'Dumbbell One-Arm Upright Row',
    description:
      'Aufrechtes Rudern mit einer Kurzhantel; die einseitige Last erlaubt einen größeren Weg pro Seite.',
  },
  {
    canonicalName: 'Chin-Up',
    description:
      'Klimmzug im Kammgriff, die Handflächen zum Körper — der enge Untergriff beteiligt den Bizeps stärker als der Obergriff.',
  },
  {
    canonicalName: 'One Arm Lat Pulldown',
    description:
      'Latzug mit einem Arm; das Gewicht lässt sich frei wählen, weshalb er als Vorstufe zum Klimmzug taugt.',
  },
  {
    canonicalName: 'One Arm Chin-Up',
    description:
      'Vorstufe zum einarmigen Klimmzug: Eine Hand hält die Stange, die andere ein darübergelegtes Handtuch und nimmt einen Teil der Last.',
  },

  // ── Kraft · Beine ──────────────────────────────────────────────────────────
  {
    canonicalName: 'Barbell Squat',
    description:
      'Die Kniebeuge mit der Langhantel im Nacken — Grundübung für Bein- und Hüftstreckung unter hoher Last.',
  },
  {
    canonicalName: 'Front Barbell Squat',
    description:
      'Kniebeuge mit der Stange auf den vorderen Schultern; die Last vor dem Körper verlangt eine deutlich aufrechtere Haltung.',
  },
  {
    canonicalName: 'Dumbbell Squat',
    description:
      'Kniebeuge mit Kurzhanteln seitlich am Körper — kein Rack nötig, dafür durch die Griffkraft begrenzt.',
  },
  {
    canonicalName: 'Box Squat',
    description:
      'Kniebeuge bis zum Sitz auf einer Box: Die Pause unten nimmt den Rückschwung heraus und macht die Tiefe reproduzierbar.',
  },
  {
    canonicalName: 'Squat with Bands',
    description:
      'Kniebeuge mit Bändern an der Stange; der Widerstand wächst nach oben und fordert das Durchdrücken.',
  },
  {
    canonicalName: 'Weighted Squat',
    description:
      'Kniebeuge im Stand auf zwei Bänken mit hängendem Gewichtsgürtel — die tiefe Position erlaubt mehr Weg als am Boden.',
  },
  {
    canonicalName: 'Hack Squat',
    description:
      'Kniebeuge in der geführten Hackenschmidt-Maschine; der Rücken liegt am Polster und muss nichts stabilisieren.',
  },
  {
    canonicalName: 'Barbell Hack Squat',
    description:
      'Kniebeuge mit der Langhantel hinter dem Körper — die hinten geführte Last verlagert Arbeit auf die Hüftstreckung.',
  },
  {
    canonicalName: 'Lying Machine Squat',
    description:
      'Kniebeuge liegend in der Maschine; Rücken und Kopf liegen auf, gestartet wird unterhalb der Parallelen.',
  },
  {
    canonicalName: 'Leg Press',
    description:
      'Beinpresse im Sitzen: Kniestreckung unter hoher Last, ohne dass der Rumpf mitarbeiten muss.',
  },
  {
    canonicalName: 'One Leg Barbell Squat',
    description:
      'Einbeinige Kniebeuge mit der Langhantel, der hintere Fuß auf einer Bank abgelegt.',
  },
  {
    canonicalName: 'Split Squat with Dumbbells',
    description:
      'Split Squat mit erhöhtem hinteren Fuß und Kurzhanteln — das vordere Bein trägt fast die gesamte Last.',
  },
  {
    canonicalName: 'Smith Single-Leg Split Squat',
    description:
      'Split Squat in der Multipresse; die geführte Stange nimmt die Balancearbeit heraus.',
  },
  {
    canonicalName: 'Suspended Split Squat',
    description:
      'Split Squat mit dem hinteren Fuß in der Schlinge — die bewegliche Aufhängung erhöht die Stabilitätsanforderung deutlich.',
  },
  {
    canonicalName: 'Barbell Side Split Squat',
    description:
      'Seitlicher Split Squat mit der Langhantel: Die Absenkung geht zur Seite über das ausgedrehte Bein, nicht nach vorne.',
  },
  {
    canonicalName: 'Barbell Lunge',
    description: 'Ausfallschritt nach vorne mit der Langhantel im Nacken.',
  },
  {
    canonicalName: 'Dumbbell Rear Lunge',
    description:
      'Ausfallschritt nach hinten mit Kurzhanteln — der Rückschritt belastet das Knie des vorderen Beins geringer als der Vorwärtsschritt.',
  },
  {
    canonicalName: 'Single-Leg Leg Extension',
    description:
      'Beinstrecken an der Maschine mit einem Bein; isoliert die Kniestreckung ohne Beteiligung der Hüfte.',
  },
  {
    canonicalName: 'Seated Leg Curl',
    description:
      'Beinbeugen an der Maschine im Sitzen — beugt die Knie gegen Widerstand bei fixierter Hüfte.',
  },
  {
    canonicalName: 'Standing Leg Curl',
    description:
      'Beinbeugen an der Maschine im Stand, ein Bein nach dem anderen; der Oberkörper bleibt vorgebeugt.',
  },
  {
    canonicalName: 'Glute Ham Raise',
    description:
      'Kniebeugen gegen das eigene Körpergewicht im Gerät, aus der unteren Position aufgerichtet.',
  },
  {
    canonicalName: 'Nordic Hamstring Curl',
    description:
      'Kniebeugung ohne Gerät: Die Fersen sind fixiert, der Oberkörper senkt sich so langsam wie möglich nach vorne.',
  },
];

export const DESCRIPTIONS: readonly Description[] = [
  ...CORE,
  ...STRENGTH_DESCRIPTIONS,
  ...MOBILITY_DESCRIPTIONS,
  ...POWER_DESCRIPTIONS,
];
