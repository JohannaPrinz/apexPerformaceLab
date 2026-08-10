# Apex OS – Core Domain Objects

> Erläuterndes Dokument. Die verbindlichen Festlegungen stehen in
> [DOMAIN_DECISIONS.md](./DOMAIN_DECISIONS.md) und gelten im Zweifel.
>
> **Benennung:** Abschnittstitel tragen den englischen Domänenbegriff — er ist
> zugleich der Name im Code. Der Fließtext ist deutsch.

---

## Grundprinzip

Apex OS ist ein Performance Operating System.

Im Mittelpunkt steht nicht der Trainingsplan und auch nicht das Coaching.

Ein Case bildet einen vollständigen Betreuungsprozess eines Athleten ab – von der
ersten Analyse bis zum Abschluss oder einer langfristigen Betreuung.

### Case und Assessment

Der Performance Case ist die **strukturgebende Klammer** des Athletenverlaufs.
Assessments sind die **eigentlichen Arbeitseinheiten** innerhalb eines Cases —
hier entstehen Beobachtungen, Messwerte, Insights und Empfehlungen. Der Case
stiftet Kontinuität über die Zeit, die Assessments halten einzelne
Bewertungszeitpunkte fest.

Case und Assessment sind damit keine konkurrierenden Zentren:
Der Case gibt den Rahmen, das Assessment füllt ihn.

---

## Domain Model

Die verbindliche Hierarchie:

```
Workspace
    ↓
Athlete
    ↓
Performance Case
    ↓
Assessment
    ↓
Module
    ↓
Measurement
```

Jede Ebene gehört zu genau einer Ebene darüber.

Am Modul hängen:

```
Measurement ──── Measurement Type
    ↓
Insight ──── Evidence (Verknüpfung)
    ↓
Recommendation
```

Reports hängen je nach Scope am Modul, am Assessment oder am Case:

```
Report (scope: MODULE | ASSESSMENT | CASE)
```

Über die Kontextleiter angehängt:
Document · Video · Program · Note · Appointment

Am Case hängen zusätzlich: Goal

---

## Workspace

Der Workspace ist der Mandant. Alle Daten gehören zu genau einem Workspace.

Im MVP erhält jeder Coach bei der Registrierung automatisch einen persönlichen
Workspace. Später kann ein Workspace mehrere Coaches enthalten.

---

## Coach

Ein Coach betreut Athleten.

Der Coach erstellt Cases, Assessments, Reports und Empfehlungen.

Das Coach-Profil enthält ausschließlich fachliche Informationen: Anzeigename,
Berufsbezeichnung, Kurzprofil und Qualifikationsnachweise.

### Das Coach-Profil ist organisationsunabhängig

Ein Coach existiert für sich. Das Profil trägt **keine** Organisation: Ein Coach
kann allein arbeiten, in einer Praxis, für mehrere Organisationen gleichzeitig
oder zwischen ihnen wechseln. Die Zugehörigkeit ist eine **Membership** — eine
eigene Beziehung zwischen Person und Workspace, nie eine Eigenschaft des Profils.

Alles, was ein Coach **erstellt** — Cases, Assessments, Insights, Reports,
Notizen — gehört zu einem Workspace. Die **Person** nicht. Das Profil an eine
Organisation zu binden würde jeden Wechsel zu einer Datenmigration machen.

Ein vollständiges Membership-Management ist nicht Teil des MVP. Entscheidend ist
nur, dass das Modell es nicht ausschließt.

**Athleten gehören dem Workspace, nicht einem einzelnen Coach.** Nur so lassen
sich später mehrere Coaches ergänzen, ohne Daten zu migrieren.

Vorgesehen ist, einen Athleten später weiteren Coaches desselben Workspace
zuzuteilen — etwa wenn mehrere Fachleute mit derselben Person arbeiten. **Die
Zuteilung setzt die aktive Zustimmung des Athleten voraus.** Sie wird vom
Athleten erteilt, nicht vom Coach, und sie wird festgehalten. Ein Coach kann
einen Athleten weder eigenmächtig weitergeben noch stellvertretend zustimmen.

Daraus folgt dreierlei:

- **Portal-Zugang ist Voraussetzung.** Zustimmen ist eine Handlung, und die kann
  nur ein Athlet mit verknüpftem Benutzerkonto vornehmen. Unter Shared Access
  ist keine Zuteilung möglich, bis der Portal-Zugang aktiviert ist.
- **Die Zustimmung gilt vollständig und rückwirkend.** Sie umfasst die gesamte
  Akte, auch Assessments und Reports von vorher. Es gibt keine Teilfreigaben und
  keine Zeitfenster — die Einheit ist der Athlet.
- **Die Zustimmung ist jederzeit widerrufbar.** Der Widerruf beendet den Zugriff.
  Gelöscht wird nichts, und wer wann Zugriff hatte, bleibt nachvollziehbar.

Deshalb wird der erstellende Coach festgehalten, das Eigentum bleibt aber beim
Workspace, und der Zugriff folgt der Zustimmung.

### Qualifikationsnachweise

Ein Coach kann Lizenzen, Zertifikate und Akkreditierungen hinterlegen, optional
mit Aussteller und Gültigkeitszeitraum.

Sie gehören dem Coach, nicht einem Athleten, und sind deshalb **keine
Dokumente**: Die Kontextleiter verankert jedes Dokument an einem Athleten — und
genau das macht die Timeline vollständig. Ein Qualifikationsnachweis hat dort
nichts zu suchen.

---

## Athlete

Der Athlet steht im Mittelpunkt der Plattform.

Ein Athlet besitzt eine vollständige Performance-Historie.

Ein Athlet kann beliebig viele Cases besitzen.

Ein Athlet existiert innerhalb seines Workspace genau einmal — unabhängig davon,
ob er ein Benutzerkonto besitzt. Ein Konto kann jederzeit nachträglich verknüpft
werden, ohne dass Daten migriert werden müssen.

Anders als das Coach-Profil ist der Athlet **workspace-gebunden**: Datensatz und
Historie gehören dem Workspace, der sie angelegt hat.

### „Genau einmal" ist eine fachliche Regel

Es gibt bewusst **keinen** natürlichen Schlüssel. Name, E-Mail und Geburtsdatum
bleiben optional, weil der Regelfall der Athlet ohne Konto und oft ohne
Kontaktdaten ist. Eine Unique-Regel auf optionalen Feldern würde genau dort nicht
greifen und falsche Sicherheit erzeugen.

Die Regel wirkt deshalb dort, wo sie etwas ausrichtet: Beim Anlegen sucht die
Domänenschicht nach wahrscheinlichen Dubletten und warnt. Doppelte Athleten
entstehen durch versehentliche Neuanlage, nicht durch Absicht.

---

## Performance Case

Die strukturgebende Klammer des Athletenverlaufs. Der Case stiftet Kontinuität
über die Zeit; die eigentliche Arbeit geschieht in seinen Assessments.

Ein Performance Case kann folgendes repräsentieren:

- eine einmalige Untersuchung oder Beurteilung (`SINGLE_ASSESSMENT`)
- eine langfristige Coaching-Beziehung (`ONGOING`)

Ein Case beschreibt einen abgeschlossenen oder laufenden Betreuungsprozess.

Beispiele:

- HYROX Performance Analyse
- Strength & Movement Analyse
- Wettkampfvorbereitung
- Return to Sport
- Offseason
- Performance Coaching

Ein Case besitzt:

- Titel
- Beschreibung
- Typ
- Status (`OPEN` → `CLOSED` → `ARCHIVED`)
- Ziele
- Startdatum
- Enddatum (optional)

Ein Case enthält:

- Assessments
- Reports
- Termine
- Notizen
- Dokumente, Videos, Programme

### Automatische Anlage

Der Case ist im Datenmodell verpflichtend, aber **kein manueller Arbeitsschritt**.

Legt ein Coach ein Assessment für einen Athleten ohne offenen Case an, erzeugt
das System den Case automatisch — nach demselben Muster wie den persönlichen
Workspace. In der Oberfläche erscheint der Case erst, wenn ein Athlet mehr als
einen besitzt.

Dadurch entfällt der Sonderfall „Assessment ohne Case": Es gibt genau einen
Abfrage- und Berechtigungspfad statt zweier.

---

## Goal

Goals beschreiben das Ziel eines Cases.

Beispiele:

- Sub 60 HYROX
- Deutsche Meisterschaft
- Return to Sport
- Muskelaufbau
- Marathon

Ein Goal besitzt Titel, optionales Zieldatum und optionales Erreichungsdatum.

Ein Case kann mehrere Goals besitzen. Sie dienen als Orientierung für alle
Assessments innerhalb des Cases.

---

## Assessment

Die eigentliche Arbeitseinheit innerhalb eines Cases: Hier entstehen
Beobachtungen, Messwerte, Insights und Empfehlungen. Ein Assessment hält einen
einzelnen Bewertungszeitpunkt fest.

Ein Assessment beschreibt eine konkrete Leistungsdiagnostik.

Ein Assessment gehört zu genau einem Performance Case. Über den Case gehört es
zu genau einem Athleten — diese Beziehung wird abgeleitet, nie doppelt
gespeichert.

Ein Case kann beliebig viele Assessments besitzen.

Jedes Assessment stellt eine Momentaufnahme des Athleten zu einem bestimmten
Zeitpunkt dar.

Assessments innerhalb desselben Performance Case können im Zeitverlauf
verglichen werden.

### Jedes Assessment beantwortet eine Frage

Ein Assessment besitzt ein Pflichtfeld `question` — die Coaching-Frage, zu deren
Beantwortung es durchgeführt wird. Ohne Fragestellung werden keine Daten erhoben.

Es gibt kein eigenes Question-Objekt. Die Frage ist ein Feld am Assessment.

### Typ

Der Typ beschreibt ausschließlich die **Position im Verlauf**:

- `INITIAL` — erstes Assessment im Case
- `RE_ASSESSMENT` — Wiederholung zum Vergleich
- `FOLLOW_UP` — Überprüfung empfohlener Maßnahmen

Der **Inhalt** ergibt sich allein aus den gewählten Modulen. Begriffe wie
„Laktattest", „Bewegungsanalyse" oder „Running Assessment" beschreiben keine
Typen, sondern Modulkombinationen — siehe Presets.

---

## Module

Jedes Assessment besteht aus einem oder mehreren Modulen.

Kanonische Liste (verbindlich in
[DOMAIN_DECISIONS.md §11](./DOMAIN_DECISIONS.md)):

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

Nicht jedes Assessment benötigt alle Module.
Module müssen unabhängig voneinander funktionieren.

Ein Modul wird als Schlüssel gespeichert; sein Verhalten liegt in einer Registry
im Code. Ein neues Modul ist eine neue Datei plus ein Registry-Eintrag — ohne
Migration und ohne Eingriff in bestehende Module.

Modulnamen sind ausschließlich Domänenbegriffe. Sie tragen nie einen Geräte-,
Hersteller- oder Wettkampfnamen.

### Gerätehersteller sind keine Module

VALD, MYOACT, Garmin und Polar sind **Datenquellen**, keine Module. Ihre
Messwerte werden dem fachlich passenden Modul zugeordnet; die Herkunft steht am
Messwert selbst.

Modul und Datenquelle sind zwei unabhängige Dimensionen: Ein VALD-Sprungtest
gehört zum Modul `strength` und hat VALD als Quelle.

### Wettkampfformate sind keine Module

HYROX und vergleichbare Formate sind **Assessment Presets** — benannte
Modulkombinationen:

| Preset               | Module                            |
| -------------------- | --------------------------------- |
| `hyrox`              | `running`, `strength`, `movement` |
| `movement_screening` | `movement`, `mobility`            |
| `lactate_test`       | `lactate`                         |

**Ein Preset-Name ist nie gleich einem Modulschlüssel.** Preset und Modul teilen
sich in der Oberfläche einen Namensraum; gleiche Namen würden „wähle
`movement`" mehrdeutig machen.

Presets sind Konfiguration, keine Objekte. Sie können später
benutzerdefinierbar werden.

### Video ist kein Modul

Video ist ein eigenständiges Domänenobjekt, kein Analysebereich.

---

## Measurement Type

Measurement Types definieren wiederverwendbare Vorlagen für objektive Messwerte.

Ein Measurement Type definiert:

| Feld            | Zweck                                      |
| --------------- | ------------------------------------------ |
| Name            | was gemessen wird                          |
| Einheit         | Einheit des Werts                          |
| Datentyp        | numerisch, Text oder boolesch              |
| Kategorie       | Klassifizierung für Filter und Gruppierung |
| Referenzbereich | Erwartungsbereich, optional                |

Die Kategorie ordnet einen Measurement Type einem fachlichen Bereich zu — etwa
Kraft, Ausdauer, Mobilität oder Körperzusammensetzung. Sie steuert Filterung,
Gruppierung und Darstellung und ist unabhängig davon, in welchem Modul ein
Messwert erfasst wurde.

Measurement Types enthalten keine sportlerspezifischen Daten.
Neue Measurement Types können hinzugefügt werden, ohne das Domänenmodell zu
ändern.

Jeder Messwert verweist auf genau einen Measurement Type.

Die **Seitigkeit gehört nicht zum Measurement Type**. Der Typ „Griffkraft" ist
links wie rechts derselbe; nur der erfasste Wert unterscheidet sich. Die
Seitigkeit steht am Measurement.

---

## Measurement

Measurements sind objektive Messwerte und Instanzen eines Measurement Type.

Beispiele:

- Lactate
- Heart Rate
- Pace
- Grip Strength
- Jump Height
- Range of Motion
- Weight
- Body Fat
- Running Cadence

Measurements besitzen keine Interpretation.
Sie stellen ausschließlich Rohdaten dar.

Es können beliebige Measurement Types hinzugefügt und definiert werden; nicht
jeder Athlet benötigt alle.

### Kontext

Jeder Messwert gehört zu genau einem Measurement Type und genau einem Modul.
Über das Modul gehört er zu einem Assessment, einem Performance Case und einem
Athleten. Diese Beziehungen werden abgeleitet, nie doppelt gespeichert.

### Seitigkeit

Jeder Messwert hält fest, welche Körperseite gemessen wurde:

```
LEFT | RIGHT | BILATERAL
```

Ohne dieses Feld lässt sich Asymmetrie nicht berechnen, und „Asymmetrische
Kraftentwicklung" ist einer der häufigsten Insights.

Beispiel:

```
Measurement Type: Griffkraft (kg)

  Messung 1    LEFT      51 kg
  Messung 2    RIGHT     58 kg
```

### Herkunft

Jeder Messwert hält fest, woher er stammt: manuell erfasst, von einem Gerät,
importiert oder abgeleitet. Bei externen Systemen werden zusätzlich das System
und dessen eigene ID gespeichert — dadurch kann ein wiederholter Import keine
Dubletten erzeugen.

Erfassungszeitpunkt und Eingangszeitpunkt werden getrennt geführt, weil Geräte
ihre Daten verzögert liefern.

### Korrekturen

Messwerte werden nie bearbeitet. Eine Korrektur ist ein neuer Messwert, der den
bisherigen ablöst. Der abgelöste Wert bleibt sichtbar — eine Fehlmessung gehört
zur wissenschaftlichen Dokumentation.

---

## Tracking Entry

Ein Tracking Entry ist ein Wert, den der **Athlet selbst** festhält oder den
sein Gerät liefert: Körpergewicht, Schritte, Herzfrequenz, im Training benutzte
Gewichte, Pausenlängen.

**Ein Tracking Entry ist kein Measurement.** Der Unterschied ist fachlich, nicht
technisch:

|              | Measurement                 | Tracking Entry                         |
| ------------ | --------------------------- | -------------------------------------- |
| Erfasst von  | ausschließlich dem Coach    | dem Athleten oder seinem Gerät         |
| Kontext      | immer in einem Modul        | keiner — er steht allein in der Zeit   |
| Korrigierbar | nie; eine Korrektur löst ab | ja, der Athlet darf ändern und löschen |
| Beweiskraft  | diagnostischer Befund       | Selbstauskunft                         |

Ein Measurement ist ein Fakt innerhalb eines Assessments und wird nie geändert.
Ein vertipptes Körpergewicht braucht diese Zeremonie nicht. Und die Pflicht, an
einem Modul zu hängen, ist eine Zusicherung für die gesamte Akte — jeder
Messwert hat einen fachlichen Kontext. Sie aufzuweichen, würde diese Zusicherung
für alle Messwerte kosten.

### Derselbe Katalog

Ein Tracking Entry verwendet **denselben Measurement Type** wie ein Measurement.
Das ist der Kern der Sache: „Körpergewicht" ist derselbe Typ mit derselben
Einheit, ob der Coach ihn im Assessment misst oder der Athlet dienstags auf die
Waage steigt. Der Coach kann beides auf einer Achse darstellen, ohne
Übersetzungsschicht — und genau das macht Selbstauskunft für die fachliche
Auswertung überhaupt brauchbar.

### Herkunft

Dieselben Quellen wie beim Measurement: manuell eingetragen, vom Gerät geliefert
oder aus einer Datei importiert. Bei Geräteimporten werden System und externe ID
mitgeführt, wodurch ein wiederholter Import keine Dubletten erzeugt.

Geräte werden bewusst verbunden und Daten bewusst importiert. Es gibt keinen
Hintergrundprozess, der von sich aus in die Akte eines Athleten schreibt.

### Grenze

Tracking Entries werden als **Verlauf** gelesen, nicht als Timeline-Ereignisse.
Sie erscheinen nicht in der Athleten-Timeline: tägliche Gewichte und
Schrittzahlen würden die Assessments, Reports und Dokumente zuschütten, für die
die Timeline da ist. Dargestellt werden sie als Kurve über die Zeit — gemeinsam
mit den Measurements desselben Typs.

Sie sind **nie Evidence für ein Insight**. Evidence stammt aus Measurements,
Dokumenten, Videos und Notizen. Eine Selbstauskunft trägt nicht das Gewicht
eines diagnostischen Befunds.

---

## Insight

Ein Insight beschreibt die Interpretation eines oder mehrerer Measurements.

Beispiele:

- Eingeschränkte Hüftmobilität
- Asymmetrische Kraftentwicklung
- Reduzierte Laufökonomie
- Technische Defizite am SkiErg

Insights bilden den wissenschaftlichen Kern von Apex OS.

### Evidence

Ein Insight hält fest, worauf er sich stützt. Evidence ist eine **Verknüpfung**,
kein eigenes Objekt. Sie kann auf einen Messwert, ein Video, ein Dokument oder
eine Notiz zeigen.

Die heterogene Verknüpfung ist notwendig, nicht optional: „Technische Defizite am
SkiErg" stützt sich auf ein Video, nicht auf eine Zahl.

Evidence wird beim Verfassen des Insights erfasst. Nachträglich ist sie nicht
rekonstruierbar.

---

## Recommendation

Empfehlungen entstehen aus Insights — nie direkt aus Messwerten.

Beispiele:

- Mobility Drill
- Techniktraining
- Belastung reduzieren
- Kraftblock
- Arztbesuch
- Laktat-Re-Test

### Lebenszyklus

Recommendation ist das **einzige** Objekt für Maßnahmen. Es gibt kein separates
Objekt für Action, Intervention, Maßnahme oder Task.

```
PROPOSED → ACCEPTED → IN_PROGRESS → DONE
                    ↘ SKIPPED
                    ↘ SUPERSEDED
```

Eine Empfehlung, die dem Athleten zugewiesen ist, erscheint im Portal als
Aufgabe.

Der Status darf sich auch bei veröffentlichten Empfehlungen ändern: Der Inhalt
ist eingefroren, der Fortschritt nicht.

---

## Report

Der Report ist das fachliche Ergebnis einer Diagnostik zu einem Zeitpunkt.

### Ein Objekt, drei Ebenen

| Scope        | Fasst zusammen                          |
| ------------ | --------------------------------------- |
| `MODULE`     | ein Modul                               |
| `ASSESSMENT` | alle Modul-Reports eines Assessments    |
| `CASE`       | alle Assessments eines Cases (optional) |

Alle drei teilen Status, Versionierung, PDF-Export und Freigabe. Sie sind ein
Objekt mit Gültigkeitsbereich, nicht drei Objekte.

Beispiele: Lactate Report, Running Report, Strength Report, Mobility Report
(jeweils Scope `MODULE`).

### Ein Report enthält

- Ergebnisse
- Messwerte
- Visualisierungen
- Videos
- Coach-Kommentare
- Insights
- Empfehlungen

### Status

```
DRAFT → PUBLISHED → ARCHIVED
```

**Die Veröffentlichung ist der Sperrpunkt.** Ein veröffentlichter Report ist
unveränderlich; mit ihm frieren die enthaltenen Insights und Empfehlungen ein.

Das Teilen ist **kein** Status. Es verändert den Report nicht und sperrt ihn
nicht — siehe Share.

Änderungen an einem veröffentlichten Report erfordern eine neue Version oder ein
neues Assessment.

### Was der Coach sieht

Für den Coach gibt es drei Zustände. Zwei sind gespeichert, der dritte wird
abgeleitet:

| Der Coach sieht                                   | Gespeichert als                          |
| ------------------------------------------------- | ---------------------------------------- |
| **Entwurf** — noch in Arbeit                      | `status = DRAFT`                         |
| **Fertiggestellt** — fertig, noch nicht übergeben | `status = PUBLISHED`, kein aktiver Share |
| **Geteilt** — der Athlet hat ihn                  | `status = PUBLISHED` + aktiver Share     |

Fertigstellen ist eine Aussage über den **Inhalt**, Teilen eine über den
**Zugriff**. Deshalb sperrt die Veröffentlichung, das Teilen nicht.

Dass der dritte Zustand abgeleitet und nicht gespeichert wird, erlaubt der
Oberfläche mehr Aussagen, als eine Statusspalte könnte: geteilt mit zwei
Empfängern, gestern abgelaufen, widerrufen, freigegeben bis 31.12. Als
Enum-Wert wäre das alles ein einziges `SHARED`.

Reports sind interaktiv und können als PDF exportiert werden.

---

## Share

Sichtbarkeit ist ein eigenes Objekt, kein Status am geteilten Gegenstand.

**Der Report ist der fachliche Inhalt. Der Share ist der Zugriff darauf.**
Beide haben eigene Lebenszyklen; keiner steuert den anderen.

Ein Share gewährt Zugriff auf **eine** Ressource — Report, Dokument, Video,
Programm, Empfehlung oder Notiz — über einen sicheren Link, optional
passwortgeschützt und zeitlich begrenzt, jederzeit widerrufbar.

Dadurch kann dieselbe Ressource unter verschiedenen Bedingungen an mehrere
Empfänger gehen: ein Report an den Athleten und an den behandelnden
Physiotherapeuten, mit unterschiedlicher Laufzeit.

### Status

```
ACTIVE → EXPIRED
```

Ein Share erreicht `EXPIRED` auf zwei Wegen: Die Frist in `expiresAt` läuft ab,
oder der Coach widerruft ihn und `revokedAt` wird gesetzt. Beides führt zum
selben Endzustand — der Link gewährt keinen Zugriff mehr. Deshalb gibt es einen
Endzustand, nicht zwei.

Ein abgelaufener Share wird nie gelöscht. Wer wie lange Zugriff hatte, gehört
zur Nachvollziehbarkeit.

### Zwei getrennte Lebenszyklen

```
Report   DRAFT → PUBLISHED → ARCHIVED     der Inhalt
Share    ACTIVE → EXPIRED                 der Zugriff darauf
```

Eine Veröffentlichung erzeugt keinen Share. Ein Share verändert keinen Report.

Ohne aktiven Share ist für den Athleten nichts sichtbar.

---

## Document

Dokumente gehören einem Athleten und können zusätzlich einem Case, Assessment
oder Modul zugeordnet werden (siehe Kontextleiter).

**Die Zuordnung setzt keinen Plattform-Zugang voraus.** Ein Arztbefund muss auch
für einen Athleten ohne Benutzerkonto ablegbar sein — das ist der Regelfall.

Sie können vom Coach oder Athleten hochgeladen werden — vom Athleten über das Portal. Unter
Shared Access gibt es keinen Upload.

Beispiele:

- Arztbefunde
- MRT
- Blutwerte
- Diagnosen
- PDFs
- Trainingsprotokolle
- Hochgeladene Trainingspläne

Dokumente bleiben während des gesamten Prozesses bearbeitbar und können ersetzt
werden.

---

## Video

Videos sind eigenständige Domänenobjekte. **Video ist kein Dokumenttyp.**

Sie können einem Athleten, Case, Assessment oder Modul zugeordnet werden und vom
Coach oder Athleten hochgeladen werden — vom Athleten über das Portal. Unter
Shared Access gibt es keinen Upload.

Videos können:

- an einem Zeitpunkt markiert und kommentiert
- analysiert
- KI-gestützt ausgewertet

werden.

Videos und Dokumente teilen Upload und Ablage. Das ist eine technische
Gemeinsamkeit, keine fachliche.

---

## Program

Programme sind strukturierte Trainingspläne, die innerhalb von Apex OS erstellt
werden. Program ist ein eigenständiges Domänenobjekt.

Programme sind dynamische Trainingsressourcen und können sich im Laufe der Zeit
weiterentwickeln.

Programme sind unabhängig von veröffentlichten Reports.

Hochgeladene PDF-Trainingspläne sind **Dokumente**. Programme sind bearbeitbare
Domänenobjekte.

---

## Note

Eine Notiz ist freier Text. **Coach und Athlet können beide eine schreiben.**

Ein Athlet mit Portal-Zugang schreibt Notizen zur eigenen Akte — Rückmeldung zu
einer Empfehlung, wie sich eine Einheit angefühlt hat, eine Beobachtung zwischen
zwei Terminen. Genau darin liegt der Nutzen: Das Bild des Coaches bleibt
unvollständig ohne das, was nur der Athlet berichten kann.

Eine Notiz des Athleten ist für den Coach sofort sichtbar. Der Share regelt nur
die Gegenrichtung — nichts, was der Coach schreibt, erreicht den Athleten ohne
aktiven Share.

Notizen sind immer optional. Kein Ablauf verlangt eine.

Eine Notiz ist **keine** Empfehlung: Eine Empfehlung muss aus einem Insight
hervorgehen, eine Notiz unterliegt keiner Einschränkung.

Notizen nutzen die Kontextleiter und können als Evidence für einen Insight
dienen. Zusätzlich kann eine Notiz an einem Termin hängen — was besprochen
wurde, gehört zu dem Termin, an dem es besprochen wurde.

### Sichtbarkeit ist asymmetrisch

Notizen laufen in beide Richtungen, aber nur eine davon braucht einen Share.

| Richtung       | Regel                                                                 |
| -------------- | --------------------------------------------------------------------- |
| Coach → Athlet | Braucht einen aktiven Share. Bis dahin bleibt die Notiz Coach-intern. |
| Athlet → Coach | Sofort. Der Coach sieht alles in seinem Workspace.                    |

Eine freigegebene Coach-Notiz wird dadurch über die eigene Dokumentation hinaus
nützlich: als allgemeiner Hinweis, als Kommentar zu einem Assessment, als
Beobachtung aus einer Videoauswertung oder als Hinweis zu einer Empfehlung.

Die Asymmetrie ist Absicht: Coach-Notizen sind fachliche Dokumentation und
werden bewusst freigegeben; Athleten-Notizen sind Beiträge zu einer Akte, die
dem Coach ohnehin gehört.

---

## Appointment

Ein Termin gehört zu einem Athleten. Der Performance Case ist **optional** — ein
Eingangsgespräch findet statt, bevor ein Case existiert.

Beispiele:

- Eingangsgespräch (Online-Meeting)
- Training
- Assessment
- Follow-Up
- Online Meeting
- Race Support
- Wettkampf

Wettkämpfe sind Termine, kein eigenes Objekt. Sie verankern die Timeline gegen
Ziele wie „Sub 60 HYROX".

---

## Kontextleiter

Dokumente, Videos, Programme, Notizen und Termine nutzen dieselbe Zuordnung:

| Ebene            | Pflicht  |
| ---------------- | -------- |
| Athlete          | immer    |
| Performance Case | optional |
| Assessment       | optional |
| Module           | optional |

Je spezifischer die Zuordnung, desto genauer der Kontext. Die Athleten-Bindung
ist immer vorhanden — dadurch bleibt die Timeline vollständig.

---

## Follow-Up

Ein Follow-Up überprüft den Erfolg der empfohlenen Maßnahmen.

Ein Follow-Up ist ein **Ablauf**, kein Objekt. Konkret besteht es aus:

- einem Termin vom Typ `FOLLOW_UP` und/oder
- einem Assessment vom Typ `FOLLOW_UP` oder `RE_ASSESSMENT`

Ein Follow-Up kann einen Case abschließen oder ein neues Assessment erzeugen.

---

## Athlete Timeline

Jeder Athlet besitzt eine durchgehende Performance-Historie.

Assessments, Reports, Messwerte, Dokumente, Videos, Programme, Empfehlungen und
Termine fließen in sie ein.

Die Timeline ist eine **Projektion** über die Domänenobjekte, keine zweite
Wahrheit. Jeder Eintrag verweist auf das Objekt, das er abbildet.
