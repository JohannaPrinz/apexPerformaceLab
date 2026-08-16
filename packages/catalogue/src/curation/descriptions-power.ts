import type { Description } from './descriptions';

/**
 * Fourth and last batch — plyometrics, olympic weightlifting and stability.
 *
 * The olympic lifts are the case where a description matters most and a muscle
 * list helps least: clean, power clean and hang clean share every structured
 * field and differ only in where the bar starts and how deep it is caught.
 */
export const POWER_DESCRIPTIONS: readonly Description[] = [
  // Plyometrie — Sprünge
  {
    canonicalName: 'Front Box Jump',
    description:
      'Sprung auf einen Kasten mit beiden Beinen; abgestiegen wird bevorzugt, statt zurückzuspringen.',
  },
  {
    canonicalName: 'Lateral Box Jump',
    description: 'Sprung seitlich über einen niedrigen Kasten und zurück, mehrere Wiederholungen.',
  },
  {
    canonicalName: 'Dumbbell Seated Box Jump',
    description:
      'Sprung auf einen Kasten aus dem Sitzen mit Kurzhantel vor der Brust — der Start ohne Vorspannung macht ihn schwerer.',
  },
  {
    canonicalName: 'Weighted Jump Squat',
    description:
      'Sprungkniebeuge mit leichter Zusatzlast; das Gewicht darf die Absprunggeschwindigkeit nicht merklich senken.',
  },
  {
    canonicalName: 'Kneeling Jump Squat',
    description:
      'Sprung aus dem Kniestand in den Stand; die Hüfte muss allein genug Kraft für die Landung auf den Füßen erzeugen.',
  },
  {
    canonicalName: 'Split Squats',
    description:
      'Sprung-Ausfallschritt mit Beinwechsel in der Luft, 5 bis 10 Wiederholungen je Bein.',
  },
  {
    canonicalName: 'Lateral Bound',
    description:
      'Weiter Sprung zur Seite von einem Bein zum anderen und zurück; trainiert das seitliche Abdrücken.',
  },
  {
    canonicalName: 'Single-Leg Lateral Hop',
    description:
      'Sprung auf einem Bein seitlich über eine Markierung und sofort zurück — kurze Bodenkontaktzeit auf einem Bein.',
  },
  {
    canonicalName: 'Box Skip',
    description:
      'Sprunglauf über eine Reihe von Kästen mit Beinwechsel; verbindet Höhe und Weite über mehrere Sprünge.',
  },
  {
    canonicalName: 'Double Leg Butt Kick',
    description:
      'Vertikaler Sprung mit Anfersen in der Luft, beidbeinig; die Landung wird über die Beine abgefangen.',
  },
  {
    canonicalName: 'Single Leg Butt Kick',
    description:
      'Derselbe Sprung auf einem Bein; das freie Bein bleibt während der ganzen Übung in seiner Position.',
  },

  // Plyometrie — Würfe
  {
    canonicalName: 'Overhead Slam',
    description:
      'Medizinball aus voller Streckung vor dem Körper auf den Boden schlagen und im Rücksprung fangen.',
  },
  {
    canonicalName: 'One-Arm Medicine Ball Slam',
    description:
      'Derselbe Schlag mit einer Hand aus versetztem Stand; die einseitige Ausführung fordert die Rumpfrotation.',
  },
  {
    canonicalName: 'Supine Chest Throw',
    description:
      'Brustwurf aus der Rückenlage senkrecht nach oben — die Variante, wenn weder Partner noch belastbare Wand da sind.',
  },
  {
    canonicalName: 'Supine Two-Arm Overhead Throw',
    description:
      'Wurf nach vorne aus der Rückenlage mit beiden Armen hinter dem Kopf, verbunden mit dem Aufsetzen.',
  },
  {
    canonicalName: 'Supine One-Arm Overhead Throw',
    description: 'Derselbe Wurf mit einem Arm; die einseitige Last verlangt mehr Rumpfkontrolle.',
  },
  {
    canonicalName: 'Standing Two-Arm Overhead Throw',
    description:
      'Wurf nach vorne aus dem Stand mit Ausholen hinter den Kopf; der ganze Körper beschleunigt den Ball.',
  },
  {
    canonicalName: 'Backward Medicine Ball Throw',
    description:
      'Wurf über den Kopf nach hinten aus der Hocke — die Hüftstreckung erzeugt die gesamte Beschleunigung.',
  },
  {
    canonicalName: 'Medicine Ball Scoop Throw',
    description:
      'Wurf nach hinten aus der halben Hocke mit gestreckten Armen und Absprung; Ziel ist die größte Weite.',
  },

  // Olympisches Gewichtheben
  {
    canonicalName: 'Clean',
    description:
      'Umsetzen der Langhantel vom Boden auf die Schultern mit Untertauchen in die Frontkniebeuge — die vollständige Form des Umsetzens.',
  },
  {
    canonicalName: 'Power Clean',
    description:
      'Umsetzen vom Boden, aber oberhalb der Parallelen gefangen; verlangt mehr Zuggeschwindigkeit und weniger Beweglichkeit als das volle Umsetzen.',
  },
  {
    canonicalName: 'Hang Clean',
    description:
      'Umsetzen aus dem Hang an der Oberschenkelmitte statt vom Boden — kürzerer Weg, Betonung des zweiten Zugs.',
  },
  {
    canonicalName: 'Snatch',
    description:
      'Reißen der Langhantel in einem Zug vom Boden bis über den Kopf, gefangen in der tiefen Hocke.',
  },
  {
    canonicalName: 'Power Snatch',
    description:
      'Reißen vom Boden, aber in der Teilhocke gefangen; die höhere Fangposition begrenzt die Last und die nötige Beweglichkeit.',
  },
  {
    canonicalName: 'Hang Snatch',
    description: 'Reißen aus dem Hang an der Hüfte statt vom Boden.',
  },
  {
    canonicalName: 'Clean and Jerk',
    description:
      'Umsetzen und anschließendes Stoßen über Kopf mit Schrittstellung — die vollständige Wettkampfbewegung.',
  },
  {
    canonicalName: 'Clean and Press',
    description:
      'Umsetzen und anschließendes striktes Drücken über Kopf; ohne Beinantrieb in der zweiten Phase, anders als beim Stoßen.',
  },
  {
    canonicalName: 'Push Press - Behind the Neck',
    description:
      'Drücken aus dem Nacken mit Beinantrieb; das kurze Eintauchen erzeugt den Schwung für den Weg über Kopf.',
  },
  {
    canonicalName: 'Overhead Squat',
    description:
      'Kniebeuge mit gestreckten Armen über Kopf — prüft Schulter- und Rumpfbeweglichkeit stärker als jede andere Kniebeuge.',
  },

  // Stabilität
  {
    canonicalName: 'Plank',
    description:
      'Unterarmstütz mit gerader Körperlinie, so lange wie möglich gehalten; ein angehobener Arm oder ein angehobenes Bein erschwert ihn.',
  },
  {
    canonicalName: 'Dead Bug',
    description:
      'Wechselseitiges Strecken von Arm und Bein in Rückenlage bei flach gedrücktem Rücken — die Aufgabe ist, das Becken ruhig zu halten.',
  },
  {
    canonicalName: 'Barbell Ab Rollout',
    description:
      'Ausrollen mit der Langhantel aus der Liegestützposition; die Bauchmuskulatur arbeitet gegen das Durchhängen der Hüfte.',
  },
  {
    canonicalName: 'Pallof Press',
    description:
      'Griff seitlich am Kabelzug vor der Brust wegdrücken, ohne sich mitdrehen zu lassen — Widerstand gegen Rotation statt Rotation.',
  },
  {
    canonicalName: 'Standing Cable Wood Chop',
    description:
      'Diagonaler Zug von oben quer über den Körper zum Knie, Seite für Seite; hier wird rotiert, statt Rotation zu verhindern.',
  },
  {
    canonicalName: 'Russian Twist',
    description:
      'Rumpfrotation im V-Sitz mit gefassten Händen; die Füße sind fixiert, der Oberkörper dreht frei.',
  },
  {
    canonicalName: 'Dumbbell Side Bend',
    description:
      'Seitneigung im Stand mit einer Kurzhantel; das Gewicht auf einer Seite belastet die Gegenseite.',
  },
  {
    canonicalName: 'Barbell Side Bend',
    description:
      'Seitneigung mit der Langhantel im Nacken — beide Seiten gleich belastet, die Last sitzt höher.',
  },
];
