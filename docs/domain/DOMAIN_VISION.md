# Apex OS – Domain Vision

## Vision

Apex OS ist ein Performance Operating System für Coaches, Sportwissenschaftler, Physiotherapeuten und Performance Center.

Es unterstützt datenbasierte Leistungsdiagnostik, individuelle Trainingssteuerung und langfristige Performanceentwicklung.

Im Mittelpunkt stehen nicht Trainingspläne, sondern Assessments.

Jede Trainingsentscheidung basiert auf objektiven Daten, Beobachtungen und wiederholbaren Analysen.

---

## Warum Apex OS existiert

Viele Plattformen verwalten Trainingspläne oder Kommunikation.

Apex OS verfolgt einen anderen Ansatz.

Analyse → Erkenntnisse → Empfehlungen → Re-Assessment.

Ziel ist es, fundierte Entscheidungen zu treffen und die Leistungsentwicklung jedes Athleten langfristig nachvollziehbar zu dokumentieren.

---

## Unsere Philosophie

Performance beginnt mit Verstehen.

Nicht jedes Problem lässt sich durch mehr Training lösen.

Leistungsentwicklung entsteht durch das Zusammenspiel verschiedener Faktoren.

Zum Beispiel:

- Technik
- Kraft
- Bewegung
- Laufökonomie
- Beweglichkeit
- Belastungssteuerung
- Regeneration
- Verletzungsprävention
- Ernährung
- Schlaf
- individuelle Voraussetzungen (z. B. Menstruationszyklus)

Apex OS hilft dabei, diese Faktoren systematisch zu erfassen, miteinander zu verknüpfen und daraus individuelle Empfehlungen abzuleiten.

---

## Das Herzstück: Assessments

Das zentrale Element von Apex OS sind Assessments.

Assessments werden innerhalb eines Performance Cases durchgeführt.
Ein Performance Case beschreibt ein übergeordnetes Coaching-Ziel oder einen
Betreuungszeitraum und kann mehrere Assessments enthalten.

Der Performance Case ist die strukturgebende Klammer des Athletenverlaufs.
Assessments sind die eigentlichen Arbeitseinheiten innerhalb eines Cases — hier
entstehen Beobachtungen, Messwerte, Insights und Empfehlungen. Der Case stiftet
Kontinuität über die Zeit, die Assessments halten einzelne Bewertungszeitpunkte
fest.

Die Domäne folgt durchgehend einer Hierarchie:

```
Workspace → Athlete → Performance Case → Assessment → Module → Measurement
```

Ein Assessment besteht aus beliebigen Modulen.

Die kanonische Modulliste:

| Schlüssel          | Bezeichnung      |
| ------------------ | ---------------- |
| `running`          | Running          |
| `strength`         | Strength         |
| `movement`         | Movement         |
| `mobility`         | Mobility         |
| `lactate`          | Lactate          |
| `body_composition` | Body Composition |
| `nutrition`        | Nutrition        |
| `recovery`         | Recovery         |
| `sleep`            | Sleep            |
| `cycle`            | Cycle            |
| `custom`           | Custom           |

Dadurch bleibt Apex OS vollständig modular und sportartenübergreifend.

Modulnamen sind ausschließlich Domänenbegriffe:

- Wettkampfformate wie HYROX sind keine Module, sondern benannte
  Modulkombinationen (Assessment Presets) — etwa `hyrox`,
  `movement_screening` oder `lactate_test`.
- Diagnostiksysteme wie VALD, MYOACT, Garmin oder Polar sind Datenquellen,
  keine Module — ihre Messwerte fließen in das fachlich passende Modul ein.
- Video ist ein eigenständiges Domänenobjekt, kein Modul.

Verbindlich in
[DOMAIN_DECISIONS.md §11](./DOMAIN_DECISIONS.md).

---

## Der Athlet im Mittelpunkt

Jeder Athlet besitzt eine vollständige Performance-Historie.

Alle Daten werden an einem Ort zusammengeführt.

Dazu gehören unter anderem:

- Performance Cases
- Assessments und Re-Assessments
- Messwerte
- Videos
- Programme (im System erstellt) und hochgeladene Trainingspläne
- Termine, einschließlich Wettkämpfen
- Dokumente, Arztberichte und Diagnosen
- Empfehlungen, einschließlich der dem Athleten zugewiesenen Aufgaben
- Notizen
- Secure Report Sharing
- Athlete Portal (optional)

Dadurch entsteht eine vollständige Dokumentation der Leistungsentwicklung.

---

## Connected Performance

Apex OS soll langfristig als zentrale Plattform für Performance-Daten dienen.

Über Schnittstellen können Daten aus externen Systemen integriert werden.

Zum Beispiel:

- Garmin
- Apple Health
- Health Connect
- Polar
- COROS
- VALD
- MYOACT
- weitere Diagnostiksysteme

Alle Informationen fließen in dieselbe Athletenhistorie ein.

---

## Zusammenarbeit

Apex OS unterstützt die Zusammenarbeit zwischen Coach und Athlet.

Der Athlet trägt zu einem Assessment bei, der Coach verantwortet es.

Beispiele für Beiträge des Athleten (über das Portal):

- Trainingsvideos hochladen
- Laufvideos hochladen
- Arztberichte hochladen
- Notizen schreiben — Rückmeldung zu einer Empfehlung, wie sich eine Einheit
  angefühlt hat
- Dokumente einsehen, die der Coach geteilt hat
- Empfehlungen als erledigt markieren
- Fortschritte verfolgen

Messwerte, Insights, Empfehlungen und Reports werden ausschließlich vom Coach
erstellt und verantwortet. Nur dadurch bleibt die wissenschaftliche
Nachvollziehbarkeit gewahrt.

Dadurch können Assessments sowohl vor Ort als auch remote durchgeführt werden.

---

## Grundprinzipien

Apex OS ist:

- assessment-first
- datenbasiert
- modular
- sportartenübergreifend
- wissenschaftlich orientiert
- mobil optimiert
- intuitiv bedienbar
- skalierbar
- API-first
- AI-ready

---

## Kein klassisches Coaching-Tool

Apex OS ist kein Trainingsplan-Generator.

Termin-, Dokumenten- und Kommunikationsfunktionen sind **unterstützend, nicht
Produktkern**. Sie existieren, weil der Coachingprozess sie braucht — sie
definieren die Plattform aber nicht.

Der eigentliche Kern bleibt immer:

Assessment → Erkenntnisse → Empfehlungen → Entwicklung.

---

## Langfristige Vision

Apex OS soll zur zentralen Plattform für Performance Assessments und Leistungsentwicklung werden.

Unabhängig von Sportart, Coach oder eingesetzter Diagnostik.

Alle relevanten Daten eines Athleten werden an einem Ort zusammengeführt.

Dadurch entstehen bessere Entscheidungen, nachvollziehbare Entwicklungen und langfristig leistungsfähigere Athleten.
