/**
 * German instructions for the exercises the block review passed as "OK".
 *
 * These 61 entries were correct in every field, so no decision was recorded for
 * them — and that left them with their English source text. They are kept apart
 * from `reviewed.ts` deliberately: a translation is not a review decision, and
 * filing it as one would make an exercise carry two entries and blur what was
 * actually judged.
 *
 * Same standard as everywhere else: three to seven steps, no breathing and
 * repetition boilerplate, and **no claim the English did not make**. The wrkout
 * attribution stays; a second provenance entry records the German wording as
 * ours.
 */

export interface Translation {
  readonly canonicalName: string;
  readonly instructions: readonly string[];
}

export const TRANSLATIONS: readonly Translation[] = [
  {
    canonicalName: 'Chin-Up',
    instructions: [
      'Greife die Klimmzugstange im Kammgriff, die Handflächen zeigen zu dir, etwas enger als schulterbreit.',
      'Hänge mit gestreckten Armen, halte den Oberkörper aufrecht, mache ein leichtes Hohlkreuz und schiebe die Brust heraus. Das ist die Ausgangsposition.',
      'Ziehe dich beim Ausatmen nach oben, bis der Kopf etwa auf Höhe der Stange ist. Die Ellenbogen bleiben eng am Körper; nur die Arme bewegen sich.',
      'Halte oben eine Sekunde und senke dich beim Einatmen langsam ab, bis die Arme wieder gestreckt sind.',
    ],
  },
  {
    canonicalName: 'Front Raise (Cable)',
    instructions: [
      'Stelle dich mit dem Rücken zum tiefen Kabelzug und greife den Einzelgriff. Der Arm hängt gestreckt vor dem Oberschenkel, die Handfläche zeigt zum Bein. Das ist die Ausgangsposition.',
      'Hebe den Arm bei ruhigem Oberkörper und leicht gebeugtem Ellenbogen nach vorne, bis er etwas über der Waagerechten steht. Die Handfläche zeigt dabei nach unten. Halte oben kurz.',
      'Senke den Arm beim Einatmen langsam ab.',
      'Wechsle nach der vorgesehenen Anzahl den Arm.',
    ],
  },
  {
    canonicalName: 'Cable Hip Adduction',
    instructions: [
      'Stelle dich seitlich zum tiefen Kabelzug und befestige die Fußmanschette am inneren Knöchel.',
      'Tritt in einem weiten Stand vom Gerät weg und halte dich am Rahmen fest. Das Gewicht steht auf dem äußeren Bein, das Manschettenbein wird zum Kabelzug gezogen. Das ist die Ausgangsposition.',
      'Führe das Manschettenbein beim Ausatmen über die Adduktoren vor das Standbein.',
      'Lass es beim Einatmen langsam zurückgleiten und wechsle nach der vorgesehenen Anzahl die Seite.',
    ],
  },
  {
    canonicalName: 'Weighted Jump Squat',
    instructions: [
      'Lege eine leicht beladene Langhantel auf den oberen Rücken. Eine Gewichtsweste oder ein Sandsack sind ebenso geeignet.',
      'Die Last muss leicht genug sein, dass sie dich nicht merklich verlangsamt. Die Füße stehen etwas weiter als schulterbreit, Kopf und Brust aufgerichtet. Das ist die Ausgangsposition.',
      'Gehe kurz in die Hocke und kehre die Bewegung sofort um. Springe durch Strecken von Hüfte, Knien und Sprunggelenken ab und halte die Haltung während des Sprungs.',
      'Fange die Landung über die Beine ab.',
    ],
  },
  {
    canonicalName: 'Cable Preacher Curl',
    instructions: [
      'Stelle eine Scott-Bank etwa einen halben Meter vor den Kabelzug und befestige eine gerade Stange am tiefen Zug.',
      'Setze dich an die Bank und lege Ellenbogen und Oberarme fest auf das Polster. Greife die Stange und strecke die Arme. Das ist die Ausgangsposition.',
      'Beuge die Ellenbogen beim Ausatmen und führe die Stange zu den Schultern. Spanne den Bizeps oben eine Sekunde an.',
      'Senke die Stange langsam in die Ausgangsposition zurück.',
    ],
  },
  {
    canonicalName: 'Cable Crunch',
    instructions: [
      'Knie unter einem hohen Kabelzug mit Seilgriff.',
      'Greife das Seil und führe die Hände neben das Gesicht. Beuge die Hüfte leicht und lass das Gewicht den unteren Rücken strecken. Das ist die Ausgangsposition.',
      'Beuge bei ruhiger Hüfte den Rumpf, sodass die Ellenbogen zur Mitte der Oberschenkel wandern. Halte die Spannung eine Sekunde.',
      'Kehre langsam zurück und halte die Bauchmuskulatur durchgehend unter Spannung. Wähle das Gewicht nicht so schwer, dass der untere Rücken die Arbeit übernimmt.',
    ],
  },
  {
    canonicalName: 'Hack Squat',
    instructions: [
      'Lehne den Rücken an das Polster der Maschine und bringe die Schultern unter die Schulterpolster.',
      'Stelle die Füße etwa schulterbreit auf die Platte, die Zehen leicht nach außen. Kopf oben, Rücken durchgehend am Polster.',
      'Löse die Sicherung und strecke die Beine, ohne die Knie durchzudrücken. Das ist die Ausgangsposition.',
      'Senke die Last beim Einatmen langsam ab, bis die Oberschenkel etwas unter der Parallelen sind. Die Knie bleiben über den Zehen und wandern nicht darüber hinaus.',
      'Drücke dich beim Ausatmen vor allem über die Fersen zurück nach oben.',
    ],
  },
  {
    canonicalName: 'Cable Rear Delt Fly',
    instructions: [
      'Stelle beide Rollen über Kopfhöhe ein und wähle ein passendes Gewicht.',
      'Greife den linken Zug mit der rechten Hand und den rechten mit der linken, sodass die Kabel sich vor dir kreuzen. Das ist die Ausgangsposition.',
      'Führe die gestreckten Arme nach hinten und außen auseinander.',
      'Halte am Ende der Bewegung kurz und führe die Griffe kontrolliert zurück.',
    ],
  },
  {
    canonicalName: 'Kettlebell Sumo High Pull',
    instructions: [
      'Stelle eine Kettlebell zwischen deine Füße und nimm einen weiten Stand ein. Greife sie mit beiden Händen, schiebe die Hüfte weit nach hinten und beuge die Knie. Brust und Kopf bleiben oben. Das ist die Ausgangsposition.',
      'Strecke Hüfte und Knie und ziehe die Kettlebell gleichzeitig zu den Schultern, während die Ellenbogen nach oben führen.',
      'Kehre die Bewegung kontrolliert um.',
    ],
  },
  {
    canonicalName: 'Cable Seated Lateral Raise',
    instructions: [
      'Stelle eine Flachbank zwischen zwei gegenüberliegende tiefe Kabelzüge und setze dich an deren Kante, die Füße vor den Knien.',
      'Beuge dich mit flachem Rücken nach vorne und lege den Oberkörper auf den Oberschenkeln ab.',
      'Greife den linken Zug mit der rechten Hand und den rechten mit der linken; die Kabel laufen unter den Knien, die Arme sind mit leicht gebeugten Ellenbogen gestreckt. Das ist die Ausgangsposition.',
      'Hebe die Oberarme bei ruhigem Ellenbogenwinkel zur Seite, bis sie parallel zum Boden auf Schulterhöhe stehen. Halte oben eine Sekunde.',
      'Senke die Arme beim Einatmen langsam ab.',
    ],
  },
  {
    canonicalName: 'Kneeling Cable Triceps Extension',
    instructions: [
      'Stelle eine Bank seitlich vor einen hohen Kabelzug und knie mit dem Rücken zum Gerät davor.',
      'Greife die gerade Stange über dem Kopf, die Hände etwa 15 cm auseinander, die Handflächen nach unten. Lege Kopf und Oberarmrückseite auf der Bank ab; die Unterarme zeigen zum Zug. Das ist die Ausgangsposition.',
      'Strecke die Arme beim Ausatmen im Halbkreis nach vorne, bis sie parallel zum Boden stehen. Die Oberarme bleiben dicht am Kopf. Spanne den Trizeps eine Sekunde an.',
      'Kehre beim Einatmen langsam in die Ausgangsposition zurück.',
    ],
  },
  {
    canonicalName: 'Isometric Wipers',
    instructions: [
      'Gehe in die Liegestützposition, die Hände etwas außerhalb der Schulterbreite, der Körper gestreckt. Das ist die Ausgangsposition.',
      'Verlagere das Gewicht so weit wie möglich zu einer Seite und lass dabei den Ellenbogen dieser Seite beugen, während du dich absenkst.',
      'Drücke dich über den gebeugten Arm zurück nach oben und verlagere unmittelbar zur anderen Seite.',
    ],
  },
  {
    canonicalName: 'Good Morning',
    instructions: [
      'Lege die Stange auf Schulterhöhe im Rack ab und nimm sie auf den oberen Rücken, nicht auf den Nacken. Rücken fest, Schulterblätter zusammengezogen, Knie leicht gebeugt. Tritt zurück.',
      'Beuge aus der Hüfte, schiebe sie nach hinten und senke den Oberkörper bis etwa zur Waagerechten. Der Rücken bleibt gestreckt, der Kopf in Verlängerung der Wirbelsäule.',
      'Kehre die Bewegung um, indem du die Hüfte über Gesäß und Beinrückseite streckst, bis du wieder aufrecht stehst.',
    ],
  },
  {
    canonicalName: 'Dumbbell One-Arm Shoulder Press',
    instructions: [
      'Setze dich auf eine Bank mit Rückenlehne und lege die Kurzhantel aufrecht auf dem Oberschenkel ab.',
      'Bringe die Hantel auf Schulterhöhe. Der freie Arm bleibt seitlich oder hält sich an einer festen Fläche.',
      'Drehe das Handgelenk so, dass die Handfläche nach vorne zeigt. Das ist die Ausgangsposition.',
      'Drücke die Hantel beim Ausatmen nach oben, bis der Arm gestreckt ist.',
      'Halte kurz, senke beim Einatmen langsam ab und wechsle nach der vorgesehenen Anzahl den Arm.',
    ],
  },
  {
    canonicalName: 'Cable Reverse Crunch',
    instructions: [
      'Befestige Fußmanschetten am tiefen Kabelzug und lege eine Matte davor.',
      'Setze dich mit den Füßen zum Gerät, lege die Manschetten an und lege dich hin. Hebe die Beine an und beuge die Knie rechtwinklig; Beine und Kabel liegen in einer Linie.',
      'Lege die Hände hinter den Kopf, ziehe die Knie zum Rumpf und hebe dabei die Hüfte vom Boden.',
      'Halte kurz und senke Hüfte und Beine langsam zurück in den rechten Winkel. Auch in der Ruheposition bleibt Spannung auf der Bauchmuskulatur.',
    ],
  },
  {
    canonicalName: 'Glute Ham Raise',
    instructions: [
      'Stelle das Gerät auf deine Körpergröße ein. Lege dich bäuchlings hinein und setze die Füße zwischen den Rollen gegen die Fußplatte; die Knie liegen knapp hinter dem Polster.',
      'Beginne unten. Halte den Rücken gestreckt und beuge die Knie, während du die Fußballen gegen die Platte drückst. Der Oberkörper bleibt gerade, bis du aufrecht bist.',
      'Senke dich kontrolliert zurück in die Ausgangsposition.',
    ],
  },
  {
    canonicalName: 'Dumbbell One-Arm Upright Row',
    instructions: [
      'Stehe aufrecht mit einer Kurzhantel vor dem Oberschenkel, der Arm leicht gebeugt, die Handfläche zum Bein. Der freie Arm hängt seitlich oder hält sich fest. Das ist die Ausgangsposition.',
      'Ziehe die Hantel beim Ausatmen eng am Körper nach oben, bis sie fast auf Kinnhöhe ist. Der Ellenbogen führt die Bewegung und bleibt höher als der Unterarm; der Oberkörper bleibt ruhig.',
      'Halte oben kurz und senke die Hantel beim Einatmen langsam ab.',
      'Wechsle nach der vorgesehenen Anzahl den Arm.',
    ],
  },
  {
    canonicalName: 'Cable Shoulder Press',
    instructions: [
      'Stelle beide Kabelzüge nach unten und wähle ein passendes Gewicht. Stelle dich mittig zwischen die Türme.',
      'Greife die Griffe und halte sie auf Schulterhöhe, die Handflächen nach vorne. Das ist die Ausgangsposition.',
      'Strecke die Ellenbogen und drücke die Griffe gerade über den Kopf. Kopf und Brust bleiben aufgerichtet.',
      'Halte oben kurz und führe die Griffe zurück.',
    ],
  },
  {
    canonicalName: 'Cable Seated Crunch',
    instructions: [
      'Setze dich mit dem Rücken zum hohen Kabelzug auf eine Flachbank.',
      'Greife das Seil mit beiden Händen, die Handflächen zueinander, und lege die Hände über den Schultern ab. Das Gewicht streckt den unteren Rücken leicht. Das ist die Ausgangsposition.',
      'Beuge bei ruhiger Hüfte den Rumpf, sodass die Ellenbogen zur Hüfte wandern. Atme dabei aus.',
      'Kehre beim Einatmen langsam in die Ausgangsposition zurück.',
    ],
  },
  {
    canonicalName: 'Kettlebell Hang Clean',
    instructions: [
      'Stelle die Kettlebell zwischen deine Füße. Schiebe das Gesäß nach hinten und richte den Blick geradeaus.',
      'Setze die Kettlebell an der Schulter ab, indem du Beine und Hüfte streckst und sie nach oben führst. Das Handgelenk dreht dabei ein.',
      'Senke sie in die hängende Position zwischen den Beinen zurück und halte die Beinrückseite dabei unter Spannung. Der Kopf bleibt oben.',
    ],
  },
  {
    canonicalName: 'Dumbbell Floor Press',
    instructions: [
      'Lege dich mit je einer Kurzhantel in den Händen auf den Boden, die Knie dürfen gebeugt sein. Beginne mit gestreckten Armen über der Brust.',
      'Senke die Hanteln ab, bis die Oberarme den Boden berühren. Eng angelegte Ellenbogen betonen den Trizeps, eine weitere Armhaltung die Brust.',
      'Halte unten kurz und drücke die Hanteln über die Armstreckung wieder zusammen.',
    ],
  },
  {
    canonicalName: 'Stiff Leg Barbell Good Morning',
    instructions: [
      'Führe die Übung im Rack aus. Lege die Stange auf passender Höhe ab, tritt darunter und nimm sie auf den oberen Rücken, knapp unterhalb des Nackens.',
      'Hebe die Stange aus dem Rack, indem du mit den Beinen drückst und den Oberkörper aufrichtest, und tritt zurück. Die Füße stehen schulterbreit, der Kopf bleibt oben.',
      'Beuge dich bei gestreckten Beinen aus der Hüfte nach vorne, bis der Oberkörper parallel zum Boden steht. Atme dabei ein.',
      'Richte dich beim Ausatmen zurück in die Ausgangsposition auf.',
    ],
  },
  {
    canonicalName: 'Cable Internal Rotation',
    instructions: [
      'Setze dich seitlich neben einen tiefen Kabelzug und greife den Einzelgriff mit dem Arm, der dem Gerät am nächsten ist.',
      'Presse den Ellenbogen an die Seite und beuge ihn auf 90 Grad; der Unterarm zeigt zum Kabelzug. Das ist die Ausgangsposition.',
      'Rotiere die Schulter nach innen und führe den Griff im Halbkreis vor den Bauch. Der Unterarm bleibt durchgehend senkrecht zum Rumpf.',
      'Kehre langsam zurück und wechsle nach der vorgesehenen Anzahl den Arm.',
    ],
  },
  {
    canonicalName: 'Dumbbell Bench Press',
    instructions: [
      'Lege dich auf eine Flachbank und lege je eine Kurzhantel auf den Oberschenkeln ab, die Handflächen zueinander.',
      'Bringe die Hanteln mit Hilfe der Oberschenkel nacheinander auf Schulterhöhe.',
      'Drehe die Handgelenke so, dass die Handflächen nach vorne zeigen. Die Hanteln stehen seitlich der Brust, Ober- und Unterarm bilden einen rechten Winkel. Das ist die Ausgangsposition.',
      'Drücke die Hanteln beim Ausatmen über die Brustmuskulatur nach oben, strecke die Arme und halte oben kurz.',
      'Senke das Gewicht langsam ab — das Absenken darf etwa doppelt so lange dauern wie das Drücken.',
    ],
  },
  {
    canonicalName: 'Hanging Leg Raise',
    instructions: [
      'Hänge mit gestreckten Armen an der Klimmzugstange, im mittleren oder weiten Griff. Die Beine hängen gestreckt nach unten, das Becken ist leicht nach hinten gekippt. Das ist die Ausgangsposition.',
      'Hebe die Beine beim Ausatmen an, bis Rumpf und Beine einen rechten Winkel bilden. Halte die Spannung kurz.',
      'Senke die Beine beim Einatmen langsam zurück.',
    ],
  },
  {
    canonicalName: 'Weighted Squat',
    instructions: [
      'Stelle zwei Flachbänke schulterbreit nebeneinander und stelle dich darauf. Lege den Gewichtsgürtel mit einer passenden Last an; die Zehen zeigen leicht nach außen.',
      'Im aufrechten Stand hängt das Gewicht zwischen den Beinen, die Arme hängen seitlich gestreckt. Das ist die Ausgangsposition.',
      'Beuge die Knie und senke dich bei aufrechter Haltung und erhobenem Kopf ab, bis die Oberschenkel etwas unter der Parallelen sind. Die Knie bleiben über den Zehen.',
      'Drücke dich beim Ausatmen über die Fußballen zurück nach oben und strecke die Beine.',
    ],
  },
  {
    canonicalName: 'Cable Chest Press',
    instructions: [
      'Wähle ein passendes Gewicht und setze dich mit je einem Griff in der Hand hin. Die Oberarme stehen etwa 45 Grad zum Rumpf, die Ellenbogen sind rechtwinklig gebeugt, Kopf und Brust aufgerichtet. Das ist die Ausgangsposition.',
      'Strecke die Ellenbogen und drücke die Griffe gerade nach vorne zusammen. Die Schulterblätter bleiben zusammengeführt.',
      'Halte in der Streckung kurz und führe die Griffe zurück, ohne die Spannung auf den Kabeln abzulegen.',
    ],
  },
  {
    canonicalName: 'Cable Russian Twists',
    instructions: [
      'Stelle die Rolle auf mittlere Höhe und befestige einen Griff.',
      'Lege dich quer zum Kabelzug auf einen Gymnastikball, etwa eine Armlänge entfernt, und greife den Griff mit beiden Händen. Strecke die Arme über der Brust; die Hände liegen in einer Linie mit der Rolle.',
      'Halte die Hüfte oben und den Rumpf fest. Drehe den Oberkörper eine Vierteldrehung vom Kabelzug weg; der Körper bleibt von Kopf bis Knie gerade.',
      'Halte kurz und kehre langsam zurück; auch in der Ruheposition bleibt seitlicher Zug auf dem Kabel.',
      'Wiederhole den Satz anschließend zur anderen Seite.',
    ],
  },
  {
    canonicalName: 'Cable One Arm Tricep Extension',
    instructions: [
      'Stelle dich vor den hohen Kabelzug und greife den Einzelgriff im Untergriff, die Handfläche zeigt nach oben.',
      'Ziehe den Griff so weit herunter, dass Oberarm und Ellenbogen fest an der Körperseite liegen und Ober- und Unterarm einen spitzen Winkel bilden. Ein versetzter Stand gibt Halt. Das ist die Ausgangsposition.',
      'Strecke den Arm beim Ausatmen über den Trizeps nach unten. Nur der Unterarm bewegt sich; der Oberarm bleibt unbewegt.',
      'Halte in der Streckung eine Sekunde und führe den Griff langsam zurück. Wechsle anschließend den Arm.',
    ],
  },
  {
    canonicalName: 'Decline Barbell Bench Press',
    instructions: [
      'Klemme die Beine am Ende der Negativbank fest und lege dich langsam hin.',
      'Greife die Stange mittelbreit — so, dass Ober- und Unterarm in der Mitte der Bewegung einen rechten Winkel bilden — und hebe sie mit gestreckten Armen aus der Ablage. Ein Helfer beim Aushängen schont die Rotatorenmanschette.',
      'Senke die Stange beim Einatmen langsam, bis sie die untere Brust berührt.',
      'Drücke sie nach kurzer Pause beim Ausatmen über die Brustmuskulatur zurück nach oben und halte oben kurz. Das Absenken darf doppelt so lange dauern wie das Drücken.',
      'Lege die Stange nach dem Satz zurück in die Ablage.',
    ],
  },
  {
    canonicalName: 'Romanian Deadlift',
    instructions: [
      'Greife die vor dir liegende Langhantel im Obergriff, etwas weiter als schulterbreit.',
      'Beuge die Knie leicht, halte die Schienbeine senkrecht, die Hüfte zurück und den Rücken gerade. Das ist die Ausgangsposition.',
      'Hebe die Stange beim Ausatmen über die Hüftstreckung an; Rücken und Arme bleiben durchgehend gestreckt. Die Bewegung bleibt gleichmäßig und kontrolliert.',
      'Senke die Stange im aufrechten Stand ab, indem du die Hüfte nach hinten schiebst und die Knie nur leicht beugst — anders als bei der Kniebeuge.',
    ],
  },
  {
    canonicalName: 'Dumbbell Incline Row',
    instructions: [
      'Lehne dich bäuchlings an eine Schrägbank und nimm in jede Hand eine Kurzhantel im Neutralgriff. Die Arme hängen gestreckt. Das ist die Ausgangsposition.',
      'Führe die Schulterblätter zusammen und beuge die Ellenbogen, um die Hanteln zur Körperseite zu ziehen.',
      'Halte oben kurz und senke die Hanteln kontrolliert in die Ausgangsposition zurück.',
    ],
  },
  {
    canonicalName: 'Dumbbell Rear Lunge',
    instructions: [
      'Stehe aufrecht mit je einer Kurzhantel seitlich am Körper. Das ist die Ausgangsposition.',
      'Setze ein Bein etwa 60 cm nach hinten und senke den Oberkörper ab, während du aufrecht bleibst und das Gleichgewicht hältst. Atme dabei ein. Das vordere Schienbein bleibt senkrecht, das Knie wandert nicht über die Zehen hinaus.',
      'Drücke dich beim Ausatmen zurück in den Stand. Über die Fußballen betonst du die Oberschenkelvorderseite, über die Fersen das Gesäß.',
      'Wiederhole mit dem anderen Bein.',
    ],
  },
  {
    canonicalName: 'Shoulder Press, Barbell',
    instructions: [
      'Setze dich im Rack auf eine Bank mit Rückenlehne und lege die Stange knapp über Kopfhöhe ab. Greife sie im Obergriff.',
      'Hebe die Stange über den Kopf und strecke die Arme. Halte sie etwa auf Schulterhöhe leicht vor dem Kopf. Das ist die Ausgangsposition.',
      'Senke die Stange beim Einatmen langsam zu den Schultern.',
      'Drücke sie beim Ausatmen zurück nach oben.',
    ],
  },
  {
    canonicalName: 'Reverse Crunch',
    instructions: [
      'Lege dich auf den Rücken, die Beine gestreckt, die Arme seitlich am Rumpf, die Handflächen am Boden. Die Arme bleiben während der ganzen Übung liegen.',
      'Hebe die Beine an, bis die Oberschenkel senkrecht stehen; die Füße sind geschlossen und parallel zum Boden. Das ist die Ausgangsposition.',
      'Ziehe die Beine beim Einatmen zum Rumpf, kippe das Becken nach hinten und hebe die Hüfte vom Boden, bis die Knie die Brust berühren.',
      'Halte kurz und senke die Beine beim Ausatmen zurück in die Ausgangsposition.',
    ],
  },
  {
    canonicalName: 'Barbell Seated Calf Raise',
    instructions: [
      'Lege einen Block etwa 30 cm vor eine Flachbank.',
      'Setze dich auf die Bank und stelle die Fußballen auf den Block. Lege eine Langhantel auf den Oberschenkeln ab, etwa eine Handbreit über den Knien, und halte sie dort. Das ist die Ausgangsposition.',
      'Drücke dich beim Ausatmen so hoch wie möglich auf die Fußballen und spanne die Waden an.',
      'Senke die Fersen nach kurzer Spannung langsam ab und dehne die Waden so weit wie möglich.',
    ],
  },
  {
    canonicalName: 'Decline Dumbbell Bench Press',
    instructions: [
      'Klemme die Beine am Ende der Negativbank fest und lege dich mit je einer Kurzhantel auf den Oberschenkeln hin, die Handflächen zueinander.',
      'Bringe die Hanteln auf Schulterhöhe und drehe die Handgelenke so, dass die Handflächen nach vorne zeigen. Das ist die Ausgangsposition.',
      'Senke die Hanteln langsam zur Seite ab; die Unterarme bleiben dabei senkrecht zum Boden.',
      'Drücke sie beim Ausatmen über die Brustmuskulatur nach oben, halte oben kurz und senke wieder langsam ab.',
    ],
  },
  {
    canonicalName: 'Smith Single-Leg Split Squat',
    instructions: [
      'Stelle eine Flachbank etwa einen Meter hinter die Multipresse und die Stange auf passende Höhe. Tritt darunter und nimm sie auf den oberen Rücken.',
      'Entriegele die Stange und hebe sie aus der Ablage, indem du mit den Beinen drückst und den Oberkörper aufrichtest.',
      'Setze einen Fuß leicht nach vorne unter die Stange und lege den Spann des anderen Fußes hinter dir auf der Bank ab. Das ist die Ausgangsposition.',
      'Senke dich beim Einatmen ab, indem du das vordere Knie beugst; die Haltung bleibt aufrecht, der Kopf oben. Gehe so tief, bis der Oberschenkel etwas unter der Parallelen ist.',
      'Drücke dich beim Ausatmen über die Ferse des vorderen Fußes zurück nach oben und wechsle anschließend das Bein.',
    ],
  },
  {
    canonicalName: 'Dumbbell Shoulder Press',
    instructions: [
      'Setze dich mit je einer Kurzhantel auf eine Bank mit Rückenlehne und lege die Hanteln aufrecht auf den Oberschenkeln ab.',
      'Bringe sie nacheinander auf Schulterhöhe, indem du dir mit den Oberschenkeln hilfst.',
      'Drehe die Handgelenke so, dass die Handflächen nach vorne zeigen. Das ist die Ausgangsposition.',
      'Drücke die Hanteln beim Ausatmen nach oben, bis sie sich oben berühren.',
      'Halte kurz und senke sie beim Einatmen langsam in die Ausgangsposition zurück.',
    ],
  },
  {
    canonicalName: 'Muscle Up',
    instructions: [
      'Greife die Ringe im falschen Griff, die Handballen liegen oben auf. Leite einen Klimmzug ein, indem du die Ellenbogen nach unten an die Seite ziehst.',
      'Ziehe die Ringe am oberen Punkt des Klimmzugs zu den Achseln und rolle die Schultern nach vorne, sodass die Ellenbogen gerade nach hinten wandern. Aus dieser Position geht es in den Dip über.',
      'Strecke die Arme kontrolliert und stabil, bis du über den Ringen stützt.',
      'Lass dich anschließend vorsichtig wieder ab.',
    ],
  },
  {
    canonicalName: 'Barbell Lunge',
    instructions: [
      'Führe die Übung im Rack aus. Lege die Stange knapp unter Schulterhöhe ab, tritt darunter und nimm sie auf den oberen Rücken, knapp unterhalb des Nackens.',
      'Hebe die Stange aus dem Rack, indem du mit den Beinen drückst und den Oberkörper aufrichtest, und tritt zurück.',
      'Mache einen Ausfallschritt nach vorne und senke dich über die Hüfte ab, während der Oberkörper aufrecht bleibt. Atme dabei ein. Das Knie wandert nicht über die Zehen hinaus.',
      'Drücke dich beim Ausatmen vor allem über die Ferse zurück in den Stand.',
      'Wiederhole anschließend mit dem anderen Bein.',
    ],
  },
  {
    canonicalName: 'Decline Crunch',
    instructions: [
      'Klemme die Beine am Ende der Negativbank fest und lege dich hin.',
      'Lege die Hände locker seitlich an den Kopf und halte die Ellenbogen nach innen. Verschränke die Finger nicht hinter dem Kopf.',
      'Drücke den unteren Rücken in die Bank und rolle die Schultern ab.',
      'Spanne die Bauchmuskulatur beim Ausatmen an. Die Schultern heben sich nur wenige Zentimeter, der untere Rücken bleibt auf der Bank. Halte die Spannung oben eine Sekunde und arbeite langsam statt mit Schwung.',
      'Senke den Oberkörper beim Einatmen langsam zurück.',
    ],
  },
  {
    canonicalName: 'Dumbbell Seated One-Leg Calf Raise',
    instructions: [
      'Lege einen Block etwa 30 cm vor eine Flachbank.',
      'Setze dich auf die Bank und lege eine Kurzhantel auf dem Oberschenkel ab, etwa eine Handbreit über dem Knie. Stelle den Fußballen dieses Beins auf den Block. Das ist die Ausgangsposition.',
      'Drücke dich beim Ausatmen so hoch wie möglich auf den Fußballen und spanne die Wade eine Sekunde an.',
      'Senke die Ferse langsam ab und dehne so weit wie möglich. Wechsle anschließend das Bein.',
    ],
  },
  {
    canonicalName: 'Lying Rear Delt Raise',
    instructions: [
      'Lege dich mit je einer Kurzhantel bäuchlings auf eine Flachbank.',
      'Die Handflächen zeigen zueinander, die Arme hängen mit leicht gebeugten Ellenbogen gestreckt nach unten. Das ist die Ausgangsposition.',
      'Hebe die Arme beim Ausatmen zur Seite, bis die Ellenbogen auf Schulterhöhe sind und die Arme etwa parallel zum Boden stehen. Halte oben eine Sekunde.',
      'Senke die Hanteln beim Einatmen langsam ab.',
    ],
  },
  {
    canonicalName: 'Barbell Squat',
    instructions: [
      'Führe die Übung im Rack aus. Lege die Stange knapp unter Schulterhöhe ab, tritt darunter und nimm sie auf den oberen Rücken, knapp unterhalb des Nackens.',
      'Hebe die Stange aus dem Rack, indem du mit den Beinen drückst und den Oberkörper aufrichtest, und tritt zurück.',
      'Stelle die Füße etwa schulterbreit, die Zehen leicht nach außen. Kopf oben, Rücken gerade. Das ist die Ausgangsposition.',
      'Senke dich beim Einatmen langsam ab, indem du Knie und Hüfte beugst, bis die Oberschenkel etwas unter der Parallelen sind. Die Knie bleiben über den Zehen.',
      'Drücke dich beim Ausatmen über die Fersen zurück nach oben und strecke die Beine.',
    ],
  },
  {
    canonicalName: 'Machine Bench Press',
    instructions: [
      'Setze dich in die Brustpresse und wähle das Gewicht.',
      'Bringe die Griffe über den Fußhebel nach vorne, greife sie im Obergriff und strecke die Arme. Die Oberarme stehen dabei etwa parallel zum Boden seitlich des Rumpfes. Das ist die Ausgangsposition.',
      'Führe die Griffe beim Einatmen zu dir zurück.',
      'Drücke sie beim Ausatmen über die Brustmuskulatur wieder nach vorne und halte die Spannung eine Sekunde.',
      'Bringe die Griffe nach dem Satz über den Fußhebel in ihre Ausgangslage zurück.',
    ],
  },
  {
    canonicalName: 'Dumbbell Clean',
    instructions: [
      'Stehe schulterbreit mit je einer Kurzhantel in den Händen.',
      'Senke die Hanteln zum Boden, indem du Hüfte und Knie beugst und das Gesäß nach hinten schiebst. Das ist die Ausgangsposition.',
      'Strecke Hüfte, Knie und Sprunggelenke explosiv wie zu einem Sprung und beschleunige die Hanteln nach oben. Der Griff bleibt neutral, die Arme bleiben bis zur vollen Streckung gestreckt.',
      'Beuge Hüfte und Knie erneut und fange die Last in der Hocke auf; die Arme führen die Hanteln dabei zu den Schultern.',
      'Richte dich mit den Hanteln auf den Schultern auf.',
    ],
  },
  {
    canonicalName: 'Barbell Side Split Squat',
    instructions: [
      'Stehe aufrecht mit einer Langhantel auf dem oberen Rücken, knapp unterhalb des Nackens. Die Füße stehen weit auseinander, der Fuß des Führungsbeins zeigt zur Seite. Das ist die Ausgangsposition.',
      'Senke den Körper beim Einatmen zur Seite des ausgedrehten Fußes, indem du Knie und Hüfte des Führungsbeins beugst. Das andere Bein bleibt nur leicht gebeugt.',
      'Richte dich beim Ausatmen über Hüfte und Knie des Führungsbeins wieder auf.',
      'Wiederhole anschließend zur anderen Seite.',
    ],
  },
  {
    canonicalName: 'Lying Cable Curl',
    instructions: [
      'Greife die gerade Stange oder SZ-Stange am tiefen Kabelzug mit beiden Händen im Untergriff, schulterbreit.',
      'Lege dich mit dem Rücken auf eine Matte vor den Gewichtsblock; die Füße stehen am Rahmen, die Beine sind gestreckt.',
      'Die Arme sind gestreckt, die Ellenbogen liegen eng am Körper und sind leicht gebeugt. Das ist die Ausgangsposition.',
      'Beuge die Ellenbogen beim Ausatmen und führe die Stange langsam zur Brust. Die Oberarme bleiben unbewegt.',
      'Halte oben eine Sekunde und senke die Stange langsam zurück.',
    ],
  },
  {
    canonicalName: 'Calf Raise On A Dumbbell',
    instructions: [
      'Halte dich an einem festen Gegenstand fest und stelle dich mit einem Fuß auf die Stange einer Kurzhantel — am besten eine mit runden Scheiben, damit sie rollt und du mehr stabilisieren musst.',
      'Rolle den Fuß leicht nach vorne, bis die Wade gedehnt ist. Das ist die Ausgangsposition.',
      'Drücke dich beim Ausatmen nach oben und rolle den Fuß dabei über die Stange, bis die Wade vollständig gestreckt ist. Halte die Spannung oben eine Sekunde.',
      'Rolle beim Einatmen wieder leicht nach vorne und senke dich in die Dehnung ab.',
    ],
  },
  {
    canonicalName: 'Dumbbell Scaption',
    instructions: [
      'Diese Kräftigungsübung stabilisiert das Schulterblatt. Halte in jeder Hand ein leichtes Gewicht seitlich am Körper, die Daumen zeigen nach oben.',
      'Hebe die gestreckten Arme etwa 30 Grad zur Seite versetzt nach vorne an.',
      'Führe die Bewegung bis zur Waagerechten und senke die Arme anschließend kontrolliert ab.',
    ],
  },
  {
    canonicalName: 'Split Squat with Dumbbells',
    instructions: [
      'Gehe in eine Schrittstellung und lege den hinteren Fuß erhöht ab, der vordere steht vorne auf.',
      'Halte in jeder Hand eine Kurzhantel seitlich am Körper. Das ist die Ausgangsposition.',
      'Senke dich ab, indem du Knie und Hüfte des vorderen Beins beugst. Die Haltung bleibt aufrecht, das vordere Knie in Linie mit dem Fuß.',
      'Drücke dich unten über die Ferse zurück nach oben und strecke Knie und Hüfte.',
    ],
  },
  {
    canonicalName: 'Lying Machine Squat',
    instructions: [
      'Stelle die Maschine so ein, dass du mit gebeugten Knien und den Oberschenkeln etwas unter der Parallelen hineinpasst.',
      'Lege dich mit dem Blick nach oben hinein; Rücken und Kopf liegen am Polster, die Knie wandern nicht über die Zehen hinaus.',
      'Greife die Haltegriffe und stelle die Füße etwa schulterbreit, leicht nach außen gedreht. Das ist die Ausgangsposition.',
      'Drücke dich beim Ausatmen über die Fußballen in die Streckung und spanne die Oberschenkel eine Sekunde an.',
      'Senke dich beim Einatmen langsam ab, aber nur bis die Oberschenkel parallel zur Platte stehen.',
    ],
  },
  {
    canonicalName: 'Incline Cable Flye',
    instructions: [
      'Stelle beide Rollen auf die tiefste Position und eine auf 45 Grad eingestellte Schrägbank zwischen die Kabelzüge.',
      'Nimm in jede Hand einen Griff, lege dich auf die Bank und führe die Hände mit gestreckten Armen über dem Gesicht zusammen. Das ist die Ausgangsposition.',
      'Senke die Arme mit leicht gebeugten Ellenbogen in einem weiten Bogen zur Seite, bis du eine Dehnung in der Brust spürst. Die Arme bleiben dabei unverändert gebeugt; die Bewegung findet nur im Schultergelenk statt.',
      'Führe die Arme beim Ausatmen auf demselben Bogen zurück und spanne die Brust oben eine Sekunde an.',
    ],
  },
  {
    canonicalName: 'Decline Reverse Crunch',
    instructions: [
      'Lege dich auf eine Negativbank und halte dich mit beiden Händen am oberen Ende fest, damit du nicht rutschst.',
      'Halte die nahezu gestreckten Beine mit der Bauchmuskulatur parallel zum Boden, Knie und Füße geschlossen. Das ist die Ausgangsposition.',
      'Ziehe die Beine beim Ausatmen zum Rumpf, kippe das Becken nach hinten und hebe die Hüfte von der Bank, bis die Knie die Brust berühren.',
      'Halte kurz und senke die Beine beim Einatmen zurück in die Ausgangsposition.',
    ],
  },
  {
    canonicalName: 'Dumbbell Squat',
    instructions: [
      'Stehe aufrecht mit je einer Kurzhantel seitlich am Körper, die Handflächen zeigen zu den Beinen.',
      'Stelle die Füße etwa schulterbreit, die Zehen leicht nach außen. Kopf oben, Rücken gerade. Das ist die Ausgangsposition.',
      'Senke dich langsam ab, indem du die Knie beugst, bis die Oberschenkel parallel zum Boden stehen. Die Knie bleiben über den Zehen.',
      'Drücke dich beim Ausatmen über die Fersen zurück nach oben und strecke die Beine.',
    ],
  },
  {
    canonicalName: 'Barbell Deadlift',
    instructions: [
      'Stelle dich vor die beladene Langhantel.',
      'Beuge Knie und Hüfte bei möglichst geradem Rücken und greife die Stange schulterbreit im Obergriff. Das ist die Ausgangsposition. Bei schwerem Gewicht helfen Kreuzgriff oder Zughilfen.',
      'Hebe die Stange, indem du mit den Beinen drückst und den Oberkörper zugleich aufrichtest. Atme dabei aus. Oben schiebst du die Brust heraus und führst die Schulterblätter zusammen.',
      'Senke die Stange ab, indem du die Knie beugst und den Oberkörper bei geradem Rücken aus der Hüfte nach vorne neigst, bis die Scheiben den Boden berühren.',
    ],
  },
  {
    canonicalName: 'Lying One-Arm Lateral Raise',
    instructions: [
      'Lege dich mit einer Kurzhantel bäuchlings auf eine Flachbank; die freie Hand kann sich am Bankfuß festhalten.',
      'Die Handfläche zeigt zum Rumpf, der Arm hängt mit leicht gebeugtem Ellenbogen gestreckt nach unten. Das ist die Ausgangsposition.',
      'Hebe den Arm beim Ausatmen zur Seite, bis der Ellenbogen auf Schulterhöhe ist und der Arm etwa parallel zum Boden steht. Halte oben eine Sekunde.',
      'Senke die Hantel beim Einatmen langsam ab und wechsle nach der vorgesehenen Anzahl die Seite.',
    ],
  },
  {
    canonicalName: 'Dumbbell Lying Rear Lateral Raise',
    instructions: [
      'Lege dich mit je einer Kurzhantel bäuchlings auf eine leicht angestellte Schrägbank, etwa 15 Grad zum Boden.',
      'Die Handflächen zeigen zueinander, die Arme hängen mit leicht gebeugten Ellenbogen gestreckt nach unten. Das ist die Ausgangsposition.',
      'Hebe die Arme beim Ausatmen zur Seite, bis die Ellenbogen auf Schulterhöhe sind und die Arme etwa parallel zum Boden stehen. Halte oben eine Sekunde.',
      'Senke die Hanteln beim Einatmen langsam ab.',
    ],
  },
  {
    canonicalName: 'Barbell Hack Squat',
    instructions: [
      'Stehe aufrecht und halte die Langhantel mit gestreckten Armen hinter dem Körper, die Füße schulterbreit. Ein schulterbreiter Griff mit den Handflächen nach hinten funktioniert am besten. Das ist die Ausgangsposition.',
      'Gehe beim Einatmen langsam in die Hocke, bis die Oberschenkel parallel zum Boden stehen. Kopf und Blick bleiben oben, der Rücken gerade.',
      'Drücke dich beim Ausatmen vor allem über die Fersen zurück nach oben und spanne die Oberschenkel an.',
    ],
  },
  {
    canonicalName: 'Dumbbell Lying One-Arm Rear Lateral Raise',
    instructions: [
      'Lege dich mit einer Kurzhantel bäuchlings auf eine leicht angestellte Schrägbank, etwa 15 Grad zum Boden; die freie Hand hält sich am Bankfuß fest.',
      'Die Handfläche zeigt zum Rumpf, der Arm hängt mit leicht gebeugtem Ellenbogen gestreckt nach unten. Das ist die Ausgangsposition.',
      'Hebe den Arm beim Ausatmen zur Seite, bis der Ellenbogen auf Schulterhöhe ist und der Arm etwa parallel zum Boden steht. Halte oben eine Sekunde.',
      'Senke die Hantel beim Einatmen langsam ab.',
    ],
  },
];
