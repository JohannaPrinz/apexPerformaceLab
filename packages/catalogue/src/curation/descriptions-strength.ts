import type { Description } from './descriptions';

/**
 * Second batch of descriptions — the remaining strength entries.
 *
 * Split across files only because of length; the standard is the one set in
 * `descriptions.ts`: one sentence saying what this exercise does that the one
 * beside it does not, derived from the instructions the catalogue already
 * carries.
 */
export const STRENGTH_DESCRIPTIONS: readonly Description[] = [
  // Kettlebell — olympische Bewegungen, die keine olympischen Übungen sind
  {
    canonicalName: 'One-Arm Kettlebell Clean',
    description:
      'Umsetzen einer Kettlebell auf die Schulter aus der Hüftstreckung; im Gegensatz zum Langhantel-Umsetzen ohne Untertauchen.',
  },
  {
    canonicalName: 'Alternating Hang Clean',
    description:
      'Umsetzen zweier Kettlebells im Wechsel aus dem Hang — eine bleibt hängen, während die andere zur Schulter geht.',
  },
  {
    canonicalName: 'Kettlebell Hang Clean',
    description:
      'Umsetzen aus dem Hang zwischen den Beinen; die Beinrückseite bleibt zwischen den Wiederholungen unter Spannung.',
  },
  {
    canonicalName: 'Two-Arm Kettlebell Clean',
    description: 'Umsetzen zweier Kettlebells gleichzeitig auf beide Schultern.',
  },
  {
    canonicalName: 'One-Arm Kettlebell Snatch',
    description:
      'Reißen einer Kettlebell in einem Zug vom Schwung zwischen den Beinen bis über den Kopf — ohne Zwischenablage an der Schulter.',
  },
  {
    canonicalName: 'One-Arm Kettlebell Jerk',
    description:
      'Stoßen einer Kettlebell über Kopf mit Nachtauchen unter die Last; vom Push Press unterscheidet es das zweite Beugen der Knie.',
  },
  {
    canonicalName: 'One-Arm Kettlebell Clean and Jerk',
    description:
      'Umsetzen und Stoßen in einem Zug — die Kombination aus beiden Einzelübungen mit einer Kettlebell.',
  },
  {
    canonicalName: 'Kettlebell Sumo High Pull',
    description:
      'Zug einer Kettlebell aus weitem Stand bis auf Schulterhöhe; endet im Schulterzug statt in einer Ablage.',
  },
  {
    canonicalName: 'Dumbbell Clean',
    description:
      'Umsetzen mit zwei Kurzhanteln vom Boden auf die Schultern; die getrennten Gewichte erlauben mehr Spielraum als eine Stange.',
  },

  // Kreuzheben und Hüftstreckung
  {
    canonicalName: 'Barbell Deadlift',
    description:
      'Kreuzheben vom Boden mit hüftbreitem Stand — die Grundform, an der sich alle anderen Kreuzhebe-Varianten messen.',
  },
  {
    canonicalName: 'Sumo Deadlift',
    description:
      'Kreuzheben aus sehr weitem Stand mit Griff innerhalb der Beine; der kürzere Weg und der aufrechtere Rücken verlagern Arbeit auf die Hüfte.',
  },
  {
    canonicalName: 'Deficit Deadlift',
    description:
      'Kreuzheben von einer Erhöhung aus; der verlängerte Weg macht den ersten Zug vom Boden schwerer.',
  },
  {
    canonicalName: 'Romanian Deadlift',
    description:
      'Kreuzheben aus dem Stand mit kaum gebeugten Knien: Die Stange geht nur bis unter die Knie und die Hüfte führt die Bewegung.',
  },
  {
    canonicalName: 'One-Arm Side Deadlift',
    description:
      'Kreuzheben mit einer seitlich stehenden Langhantel im Koffergriff; die einseitige Last fordert die seitliche Rumpfmuskulatur.',
  },
  {
    canonicalName: 'Sumo Deadlift with Bands',
    description:
      'Sumo-Kreuzheben mit Bändern unter den Füßen — der Widerstand wächst nach oben und fordert das Durchdrücken der Hüfte.',
  },
  {
    canonicalName: 'Reverse Band Deadlift',
    description:
      'Kreuzheben mit Bändern von oben, die unten entlasten: schwere Lasten am oberen Bewegungsende bei geringerer Belastung am Boden.',
  },
  {
    canonicalName: 'Reverse Band Sumo Deadlift',
    description:
      'Kreuzheben mit Reverse Band im weiten Sumo-Stand — verbindet die Entlastung unten mit dem kürzeren Weg des Sumo-Stands.',
  },
  {
    canonicalName: 'Good Morning',
    description:
      'Hüftbeugung mit der Stange im Nacken bei leicht gebeugten Knien; die Last sitzt weiter oben als beim Kreuzheben und wirkt stärker auf den Rücken.',
  },
  {
    canonicalName: 'Stiff Leg Barbell Good Morning',
    description:
      'Good Morning mit gestreckten Beinen — der fehlende Kniewinkel verlagert die Dehnung vollständig auf die Beinrückseite.',
  },
  {
    canonicalName: 'Single Leg Glute Bridge',
    description:
      'Hüftstreckung in Rückenlage auf einem Bein; ohne Zusatzlast, aber durch die Einbeinigkeit ausreichend fordernd.',
  },

  // Rumpf
  {
    canonicalName: 'Crunches',
    description:
      'Der Grund-Crunch am Boden: Die Schultern heben sich nur wenige Zentimeter, der untere Rücken bleibt liegen.',
  },
  {
    canonicalName: 'Sit-Up',
    description:
      'Vollständiges Aufrichten bis zum V mit den Oberschenkeln — größerer Weg als beim Crunch, mit stärkerer Beteiligung der Hüftbeuger.',
  },
  {
    canonicalName: 'Decline Crunch',
    description:
      'Crunch auf der Negativbank; die Neigung erhöht den Widerstand gegenüber dem Crunch am Boden.',
  },
  {
    canonicalName: 'Cable Crunch',
    description:
      'Crunch kniend am hohen Kabelzug — der Zug hält die Bauchmuskulatur auch in der Streckung unter Spannung.',
  },
  {
    canonicalName: 'Cable Seated Crunch',
    description:
      'Crunch am Kabelzug im Sitzen; gegenüber der knienden Variante ist der Rumpf fixierter.',
  },
  {
    canonicalName: 'Reverse Crunch',
    description:
      'Umgekehrter Crunch: Nicht der Oberkörper, sondern Becken und Beine bewegen sich zum Rumpf.',
  },
  {
    canonicalName: 'Decline Reverse Crunch',
    description:
      'Umgekehrter Crunch auf der Negativbank; die Neigung verlängert den Weg der Beine.',
  },
  {
    canonicalName: 'Cable Reverse Crunch',
    description:
      'Umgekehrter Crunch mit Fußmanschetten am Kabelzug — der Zug macht das Zurückführen der Beine zur Arbeitsphase.',
  },
  {
    canonicalName: 'Suspended Reverse Crunch',
    description:
      'Umgekehrter Crunch mit den Füßen in Schlingen; die bewegliche Aufhängung fordert zusätzlich die Rumpfstabilisierung.',
  },
  {
    canonicalName: 'Hanging Leg Raise',
    description:
      'Beinheben im freien Hang an der Stange; verlangt zusätzlich Griffkraft und Schulterstabilität.',
  },
  {
    canonicalName: 'Scissor Kick',
    description:
      'Wechselseitiges Beinheben in Rückenlage bei durchgehend angehobenen Fersen — die Bauchmuskulatur arbeitet ohne Pause.',
  },
  {
    canonicalName: 'Flutter Kicks',
    description:
      'Wechselseitiges Beinheben bäuchlings über die Bankkante; belastet anders als der Scherenschlag die hintere Kette.',
  },
  {
    canonicalName: 'Seated Barbell Twist',
    description:
      'Rumpfrotation im Sitzen mit der Stange im Nacken; die Stange verlängert den Hebel, ohne Gewicht hinzuzufügen.',
  },
  {
    canonicalName: 'Cable Russian Twists',
    description:
      'Rumpfrotation auf dem Gymnastikball gegen den seitlichen Zug des Kabels — der Ball nimmt dem Rücken die Auflage.',
  },
  {
    canonicalName: 'Superman',
    description:
      'Gleichzeitiges Anheben von Armen, Beinen und Brust aus der Bauchlage, jeweils zwei Sekunden gehalten.',
  },
  {
    canonicalName: 'Lower Back Curl',
    description:
      'Rückenstreckung aus der Bauchlage ohne Armeinsatz; die Arme liegen seitlich und dürfen nicht mitdrücken.',
  },
  {
    canonicalName: 'Mountain Climbers',
    description:
      'Schneller Beinwechsel in der Liegestützposition über 20 bis 30 Sekunden; Rumpfarbeit unter Konditionsbelastung.',
  },
  {
    canonicalName: 'Isometric Wipers',
    description:
      'Seitliches Verlagern des Körpergewichts im Liegestütz von Arm zu Arm — jede Seite trägt kurzzeitig fast allein.',
  },
  {
    canonicalName: 'Groiners',
    description:
      'Sprung aus der Liegestützposition mit beiden Füßen neben die Hände; öffnet die Hüfte dynamisch über 10 bis 20 Wiederholungen.',
  },

  // Arme
  {
    canonicalName: 'Incline Dumbbell Curl',
    description:
      'Bizepscurl zurückgelehnt auf der Schrägbank; die hängende Ausgangsposition dehnt den Bizeps stärker vor.',
  },
  {
    canonicalName: 'Cable Preacher Curl',
    description:
      'Bizepscurl mit auf der Scott-Bank aufgelegten Oberarmen — die Auflage schließt jedes Ausholen aus.',
  },
  {
    canonicalName: 'Lying Cable Curl',
    description:
      'Bizepscurl in Rückenlage am tiefen Kabelzug; der Zug kommt von unten und hält die Spannung bis in die Streckung.',
  },
  {
    canonicalName: 'Overhead Cable Curl',
    description:
      'Bizepscurl zwischen zwei hohen Kabelzügen mit waagerecht ausgestreckten Armen — der Zug wirkt von der Seite statt von unten.',
  },
  {
    canonicalName: 'Standing One-Arm Cable Curl',
    description:
      'Bizepscurl am Kabelzug mit einem Arm im Stand; die freie Hand an der Hüfte gibt Halt.',
  },
  {
    canonicalName: 'Cable One Arm Tricep Extension',
    description:
      'Trizepsdrücken am hohen Kabelzug mit einem Arm im Untergriff; der Oberarm bleibt fest an der Seite.',
  },
  {
    canonicalName: 'Kneeling Cable Triceps Extension',
    description:
      'Trizepsdrücken kniend mit auf einer Bank abgelegten Oberarmen — die Auflage nimmt jede Ausweichbewegung heraus.',
  },
  {
    canonicalName: 'Low Cable Triceps Extension',
    description:
      'Trizepsdrücken in Rückenlage mit dem Seil hinter dem Kopf; die Arme drücken senkrecht nach oben.',
  },
  {
    canonicalName: 'Seated Bent-Over One-Arm Dumbbell Triceps Extension',
    description:
      'Trizeps-Kickback vorgebeugt im Sitzen: Der Unterarm wird nach hinten gestreckt, der Oberarm bleibt am Rumpf.',
  },

  // Hüfte und Waden
  {
    canonicalName: 'Cable Hip Adduction',
    description:
      'Heranführen des Beins gegen den Zug des Kabels; kräftigt die Adduktoren einseitig im Stand.',
  },
  {
    canonicalName: 'Standing Calf Raises',
    description:
      'Wadenheben im Stand an der Maschine mit gestrecktem Knie — die gestreckte Position beansprucht den zweigelenkigen Wadenmuskel.',
  },
  {
    canonicalName: 'Standing Dumbbell Calf Raise',
    description:
      'Wadenheben im Stand mit Kurzhanteln auf einem Brett; ohne Maschine, dafür durch die Griffkraft begrenzt.',
  },
  {
    canonicalName: 'Standing Barbell Calf Raise',
    description:
      'Wadenheben im Stand mit der Langhantel im Nacken; erlaubt mehr Last als Kurzhanteln.',
  },
  {
    canonicalName: 'Calf Raises - With Bands',
    description: 'Wadenheben gegen ein Widerstandsband — der Ersatz, wenn keine Gewichte da sind.',
  },
  {
    canonicalName: 'Calf Press',
    description:
      'Wadendrücken an der Beinpresse mit gestreckten Beinen; die Maschine trägt die Last, nicht die Wirbelsäule.',
  },
  {
    canonicalName: 'Calf Raise On A Dumbbell',
    description:
      'Wadenheben im Stand auf der Stange einer Kurzhantel — das Rollen der Hantel verlangt zusätzliche Stabilisierung.',
  },
  {
    canonicalName: 'Seated Calf Raise',
    description:
      'Wadenheben im Sitzen an der Maschine: Das gebeugte Knie schaltet den zweigelenkigen Wadenmuskel aus und trifft den darunterliegenden Schollenmuskel.',
  },
  {
    canonicalName: 'Barbell Seated Calf Raise',
    description:
      'Wadenheben im Sitzen mit einer Langhantel auf den Oberschenkeln; dieselbe Soleus-Betonung ohne Maschine.',
  },
  {
    canonicalName: 'Dumbbell Seated One-Leg Calf Raise',
    description:
      'Wadenheben im Sitzen mit Kurzhantel auf einem Oberschenkel, Bein für Bein ausgeführt.',
  },

  // Übriges
  {
    canonicalName: 'Incline Dumbbell Press',
    description:
      'Drücken mit Kurzhanteln auf der Schrägbank; die ansteigende Neigung betont die obere Brust.',
  },
  {
    canonicalName: 'Suspended Row',
    description:
      'Waagerechtes Ziehen am eigenen Körpergewicht in Schlingen — die Schrägstellung des Körpers bestimmt die Schwierigkeit.',
  },
];
