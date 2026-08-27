# movement — Bewegungsanalyse aus Video

Ein Coach wählt eine Übung, entscheidet welche Winkel zählen, wählt ein
Smartphone-Video, es wird **auf dem Gerät** ausgewertet, und die abgeleiteten
Zahlen landen als ganz normale Messwerte am Test.

## Drei Rollen, sauber getrennt

|                     | wer entscheidet             | wo es lebt                              |
| ------------------- | --------------------------- | --------------------------------------- |
| **MovementProfile** | die Fachlichkeit            | `@apex/domain/movement/profile.ts`      |
| **Engine**          | misst, was MediaPipe sah    | `@apex/domain/movement/engine.ts`       |
| **Coach**           | welche Winkel, welche Ziele | Test-Konfiguration (`payload.movement`) |

Diese drei zu vermischen ist der Weg, auf dem „die Analyse" stillschweigend
Meinungen bekommt. Ein Profil mit Pflichtziel wäre die Plattform, die eine Tiefe
vorschreibt; eine Engine, die Knie kennt, wäre nicht wiederverwendbar; eine
Coach-Entscheidung im Profil würde zwischen Tests durchsickern.

## MovementProfile

Rein deklarativ — Landmark-Indizes, Schwellen, Beschriftungen, sonst nichts. Ein
Test prüft, dass kein Profil eine Funktion enthält und dass es JSON-Rundreise
unverändert übersteht.

```
key, name
tracks[]     { key, label, vertex, from, to, caution? }
sides[]      left | right
counting     { kind: 'hysteresis', track, descendBelow, ascendAbove, minRepMs }
             | { kind: 'none' }        für Halte-/Mobilitätsprüfungen
positions[]  { key, label, end: 'min' | 'max' }
suggestedTargets[]                      Vorschläge, nie angewandt
```

**Kniebeuge** (das einzige ausgelieferte Profil) bildet das bisherige Verhalten
ab: Knie = Hüfte–Knie–Sprunggelenk, Hüfte = Schulter–Hüfte–Knie, Schwellen
120/155/600 ms **unverändert**. Neu ist das **Sprunggelenk** = Knie–Sprunggelenk–
Zehe: geometrisch tragfähig, aber mit einem `caution`-Hinweis versehen, weil die
Fuß-Landmarks von Schuh, Hosenbein und Fußdrehung abhängen.

`positions[].end` sagt, welches Extrem der gemessenen Spanne gemeint ist — nicht
was es bedeutet. Eine Bewegung, bei der sich das Gelenk öffnet statt schließt,
benennt sie umgekehrt, ohne dass die Engine sich ändert.

## Übung → Profil

Über den **Katalog-Key** der Übung (`PROFILE_BY_EXERCISE`), systemweit in der
Domäne. **Keine Migration, keine Spalte**: welche Anatomie eine Übung
beschreibt, ist in jedem Workspace dieselbe Aussage, und die Katalog-Keys sind
stabil (§12a). Eine Übung ohne Eintrag hat schlicht kein Profil — die Oberfläche
sagt das, statt zu raten.

Die Auswahlliste fragt **nach diesen Keys** (`exercises.analysable`), statt den
Katalog zu paginieren und clientseitig zu filtern: er umfasst Hunderte Einträge
und ist nach Namen sortiert, sodass jede Seite die relevanten drei verfehlt.

## Testkonfiguration

Im vorhandenen `AssessmentModule.payload` unter `movement` — keine neue Tabelle:

```json
{ "profileKey": "squat", "tracks": ["knee", "ankle"], "targets": [ … ] }
```

**Alte Konfigurationen funktionieren unverändert.** Fehlt der Block, ist die
Antwort `null`, und `tracks: undefined` bedeutet „alle". `readMovementConfig`
gibt lieber `null` zurück, als einen unbekannten `profileKey` zu ersetzen.

## Zielwinkel

Optional, je gewähltem Winkel, mit `≤` / `≥` / `=`. Richtung **und** Position
werden gefragt, nie angenommen: eine Kniebeuge will einen kleineren Kniewinkel,
ein Mobilitätstest denselben Winkel größer — fest verdrahtet würde das beim
ersten anderen Einsatz die Aussage umdrehen. `=` hat eine Toleranz von 1°, weil
ein Pose-Schätzer zwischen Bildern um mehr als ein Grad zittert.

Ein abgewählter Winkel wird nicht gemessen, nicht gespeichert, nicht
zusammengefasst und **kann kein Ziel verfehlen**.

Beide Seiten müssen ein Ziel erfüllen, damit es als erreicht gilt. Die bessere
Seite zu melden wäre stille Schönfärberei im Athletenrecord.

## Eine Quelle für Tabelle und Text

`movementValues` erzeugt die Werteliste; Tabelle, Zielprüfung, Auswertungstext
und Speicherplan lesen **alle** daraus, einschließlich der Korrekturen des
Coaches. Ein nachträglich geänderter Messwert bewegt damit Tabelle, Satz und
Zielergebnis gemeinsam — ohne dass sich irgendetwas ans Neuberechnen erinnern
muss.

## Gespeicherte Messwerte

| Wert               | Messgröße             | Kontext              |
| ------------------ | --------------------- | -------------------- |
| Winkel je Position | `joint_angle` (°)     | `joint` + `position` |
| Bewegungsumfang    | `range_of_motion` (°) | `joint`              |
| Wiederholungen     | `repetitions`         | —                    |

Immer über `measurements.recordMany` mit `source: DERIVED`. Der automatisch
angelegte Test führt `joint_angle`; ein älterer mit `range_of_motion` bleibt, wie
er ist — **keine nachträgliche Umdeutung**, ein Test in
`analysis-results.test.tsx` hält das fest.

**Nicht gespeichert:** Video, Einzelbilder, Landmarks, Standbilder, sowie Dauer
und Tempo — für die beiden hat der Katalog keine Messgröße, sie stehen im Text.

## Reihenfolge auf dem Bildschirm

Übung → Winkel → optionale Ziele → Video → Analyse. Jeder Schritt verengt den
nächsten. Danach: Video links, Ergebnistext daneben, Winkeltabelle, Standbilder,
Kurve, Speichern.

## Web Worker

Weiterhin keiner. Rund 40 % der Zeit je Bild ist das Video-Seek, das ein Worker
nicht wegnehmen kann. Der Hebel bei langsamen Geräten ist `sampleFps`. Der
Durchlauf gibt den Main Thread alle 50 ms bewusst frei.

## Weitere Bewegungsprofile später

Ein neues Profil ist ein Eintrag in `MOVEMENT_PROFILES` plus eine Zeile in
`PROFILE_BY_EXERCISE` — kein Code in der Engine, keine Migration. Was ein neues
Profil zusätzlich braucht, hängt von der Bewegung ab:

- **andere Landmarks** (Ellbogen, Schulter) → `POSE_LANDMARKS` erweitern
- **einseitige Bewegungen** (Ausfallschritt) → `sides: ['left']` genügt heute
  nicht; die Engine misst beide Seiten und der Zähler wählt die klarere. Für
  eine echt einseitige Bewegung müsste die Seite Teil der Zählregel werden.
- **mehr als zwei Positionen** (Zwischenhalt) → `positions[]` trägt beliebig
  viele, die Tabelle rendert eine Spalte je Position.
- **Bewegungen ohne Wiederholungen** → `counting: { kind: 'none' }` ist gebaut
  und getestet.

## Modell und WASM kommen von einem CDN

Offline unbenutzbar und eine fremde Laufzeitabhängigkeit im Anfragepfad. Gehört
nach `public/`, bevor das in einer Halle mit schlechtem Empfang benutzt wird.
Video und Bilder verlassen den Browser in keinem Fall.
