# Domain-Konsistenzprüfung

> Datum: 2026-08-07 · **Kein Code und keine Dokumente geändert.**
>
> Geprüft: [DOMAIN_DECISIONS](../domain/DOMAIN_DECISIONS.md) ·
> [DOMAIN_RULES](../domain/DOMAIN_RULES.md) ·
> [DOMAIN_VISION](../domain/DOMAIN_VISION.md) ·
> [CORE_OBJECTS](../domain/CORE_OBJECTS.md) ·
> [USER_FLOWS](../domain/USER_FLOWS.md)

---

## Zusammenfassung

Die Dokumente sind seit dem letzten Review deutlich geschärft worden. Sechs
Punkte aus meinem vorherigen Report sind **gelöst**: Athlet ohne Account,
Messwerttyp-Katalog, Report-Immutability, Video-/Dokumentzuordnung,
Termin-Optionalität, Goal-Reihenfolge.

Dafür ist ein **neuer, fundamentaler Konflikt** entstanden.

`DOMAIN_DECISIONS.md` (07.08., neuestes Dokument, „Status: Accepted", _„All
future implementations must comply"_) **entfernt den Performance Case aus dem
Domänenmodell**. Die anderen vier Dokumente bauen weiterhin vollständig darauf
auf — `DOMAIN_RULES.md` erklärt ihn in Regel 7 sogar zum Kern und beansprucht
dieselbe Verbindlichkeit.

Damit existieren zwei sich ausschließende Modelle, beide als verbindlich
deklariert. Das blockiert das Prisma-Schema vollständig: Die Frage ist nicht
kosmetisch, sondern entscheidet über zwei oder drei Hierarchieebenen.

**Gefunden: 4 Blocker · 8 Definitionslücken · 7 Inkonsistenzen · 9 formale Mängel.**

---

# BLOCKER

Diese vier verhindern eine belastbare Schema-Entscheidung.

---

## B1 · Existiert der Performance Case — ja oder nein?

**Der Widerspruch**

| Dokument                 | Aussage                                                                                                                                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DOMAIN_DECISIONS` §3    | Core Objects: `Workspace, Coach, Athlete, Assessment, Module, Measurement, Insight, Recommendation, Report, Document, Program` — **Performance Case fehlt.** Dazu: _„These objects are the **only** primary business entities."_ |
| `DOMAIN_DECISIONS` §7    | _„Every Assessment belongs to exactly one **Athlete**."_                                                                                                                                                                         |
| `DOMAIN_DECISIONS` §9    | _„Every Measurement belongs to: one Athlete, one Assessment, one Module."_ — **kein Case**                                                                                                                                       |
| `DOMAIN_DECISIONS` §17.2 | _„Every Assessment belongs to exactly one Athlete."_                                                                                                                                                                             |
| `DOMAIN_RULES` #2        | _„Every Assessment belongs to exactly one **Performance Case**. Every Performance Case belongs to exactly one Athlete."_                                                                                                         |
| `DOMAIN_RULES` #7        | _„**Performance Case is the Core.** Everything belongs to a Performance Case."_                                                                                                                                                  |
| `DOMAIN_RULES` #3        | Jedes Measurement verlinkt auf _Athlete, **Performance Case**, Assessment, Module, Timestamp_                                                                                                                                    |
| `CORE_OBJECTS` :11 / :65 | _„Im Mittelpunkt steht der Performance Case."_ / _„Das wichtigste Objekt der Plattform."_                                                                                                                                        |
| `DOMAIN_VISION` :57      | _„Assessments werden innerhalb eines Performance Cases durchgeführt."_                                                                                                                                                           |
| `USER_FLOWS` #1–#5, #8   | Case in sechs von acht Flows tragend                                                                                                                                                                                             |

**Warum blockierend**

Es geht nicht um einen Namen, sondern um die Tiefe der Aggregation:

```
DECISIONS:  Workspace → Athlete → Assessment → Module → Measurement
RULES:      Workspace → Athlete → Case → Assessment → Module → Measurement
```

Davon hängt unmittelbar ab: Fremdschlüsselketten, URL-Struktur
(`/athletes/:id/assessments/:id` vs. `/cases/:id/...`), Autorisierungspfade,
Vergleichslogik (`CORE_OBJECTS:121`: _„Assessments innerhalb desselben
Performance Case können im Zeitverlauf verglichen werden"_ — ohne Case: welcher
Vergleichsrahmen?), und die gesamte Navigations-IA.

Nachträglich eine Ebene einzuziehen bedeutet Datenmigration plus Umbau jeder
Query. Nachträglich eine Ebene zu entfernen ebenso.

Zusätzlich wird der Prüf-Checkliste in `DOMAIN_RULES` (Zeile 251: _„Does it
belong to a Performance Case?"_) unter DECISIONS die Grundlage entzogen — sie
wäre nicht mehr beantwortbar.

**Entscheidung nötig**

Drei kohärente Optionen:

| Option                 | Bedeutung                                                                                                                                                                                               | Kosten                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **A — Case streichen** | DECISIONS gilt. Assessment hängt direkt am Athleten. Goal/Termin wandern an Athlete oder Assessment.                                                                                                    | RULES #2, #3, #7, CORE_OBJECTS, VISION, USER_FLOWS müssen überarbeitet werden |
| **B — Case behalten**  | RULES/CORE_OBJECTS gelten. DECISIONS §3, §7, §9, §17 nachziehen.                                                                                                                                        | DECISIONS muss korrigiert werden — es ist das jüngste Dokument                |
| **C — Case optional**  | Assessment hängt am Athleten; Case ist eine _optionale Klammer_ für langfristige Betreuung. Deckt `CORE_OBJECTS:69-70` („einmalige Untersuchung" **oder** „langfristige Coaching-Beziehung") sauber ab. | Nullable FK; „Everything belongs to a Case" muss aufgegeben werden            |

**Meine Empfehlung: C.** Sie ist die einzige Option, die den in CORE_OBJECTS
selbst beschriebenen Doppelcharakter des Cases abbildet, ohne für eine einmalige
Laktatmessung einen Pseudo-Case zu erzwingen. Für das MVP bleibt der Case
optional; die Struktur trägt später beides.

---

## B2 · Wodurch wird ein Report unveränderlich — Publish oder Share?

**Der Widerspruch**

| Fundstelle                                    | Auslöser                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `DOMAIN_DECISIONS` §2 „Reports are Snapshots" | _„A **published** report never changes retrospectively."_                                                           |
| `DOMAIN_DECISIONS` §12                        | _„Reports become immutable once **published**."_                                                                    |
| `DOMAIN_DECISIONS` Immutable Objects          | _„**Published** Reports / Published Insights / Published Recommendations"_                                          |
| `DOMAIN_RULES` #17                            | _„Reports may be edited while in Draft status. Once a Report is **shared with an Athlete**, it becomes immutable."_ |

**Warum blockierend**

_Published_ und _shared_ sind zwei verschiedene Ereignisse. `DOMAIN_DECISIONS`
§13 führt für Dokumente sogar explizit drei Zustände ein (`Draft / Shared /
Archived`) — für Reports gibt es damit potenziell **vier** Zustände (Draft,
Published, Shared, Archived) und zwei konkurrierende Sperrpunkte.

Konkreter Fall, der heute nicht entscheidbar ist: Coach veröffentlicht einen
Report intern, bemerkt einen Übertragungsfehler bei einem Messwert, hat den
Report aber noch nicht geteilt. Darf er korrigieren?

- Nach DECISIONS: **nein** (published ⇒ immutable)
- Nach RULES #17: **ja** (noch nicht shared)

Das ist kein Randfall, sondern der Normalfall bei Diagnostik.

**Entscheidung nötig**
Ein Zustandsautomat mit **einem** Sperrpunkt. Vorschlag:
`DRAFT → PUBLISHED (immutable) → SHARED → ARCHIVED`, wobei `PUBLISHED` sperrt
und `SHARED` nur Sichtbarkeit steuert. Dann ist RULES #17 anzupassen.

---

## B3 · Vier verschiedene Modul-Listen

**Der Widerspruch**

| Dokument                | Module                                                                                                                                | Anzahl |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `DOMAIN_RULES` #8       | Running, Strength, Mobility, Movement, Lactate, Video, Nutrition, Recovery, Cycle, VALD, MYOACT                                       | 11     |
| `DOMAIN_VISION` :64-77  | + HYROX, Sleep, Custom                                                                                                                | 14     |
| `CORE_OBJECTS` :131-144 | identisch zu VISION                                                                                                                   | 14     |
| `DOMAIN_DECISIONS` §8   | Running **Analysis**, Lactate **Test**, Strength **Testing**, Mobility, **Body Composition**, Cycle **Tracking**, Nutrition, Recovery | 8      |

DECISIONS **entfernt**: Movement, HYROX, Video, Sleep, VALD, MYOACT, Custom.
DECISIONS **ergänzt**: Body Composition.
DECISIONS **benennt um**: vier von acht Modulen tragen jetzt Suffixe
(`Analysis`, `Test`, `Testing`, `Tracking`) — ohne erkennbares Muster.

**Warum blockierend**

Der Modulname ist laut Architektur der **Registry-Key** — der Identifikator, an
dem Messwerttypen, Report-Renderer und Vergleichslogik hängen. Vier Listen mit
uneinheitlicher Namenskonvention bedeuten vier mögliche Schlüssel für dasselbe
Modul. Ein Wechsel von `running` auf `running_analysis` nach Sprint 1 ist eine
Datenmigration über alle Messwerte.

**Zwei Änderungen in DECISIONS sind fachlich richtig, aber nicht als
Entscheidung gekennzeichnet:**

1. **VALD und MYOACT sind keine Module.** Sie sind Geräte-/Herstellerquellen.
   Ein VALD-ForceDecks-Sprungtest gehört fachlich ins Modul _Strength_ oder
   _Movement_ — die Herkunft „VALD" ist eine **orthogonale Dimension**
   (Provenance). Beides in einer Taxonomie zu führen macht die Frage „welches
   Modul?" für Gerätedaten unbeantwortbar. Die Streichung in DECISIONS ist
   korrekt; sie sollte ausdrücklich begründet werden, weil RULES #8 und VISION
   sie weiterhin als Module führen.
2. **Body Composition schließt eine Lücke.** `CORE_OBJECTS:163-164` nennt
   _Weight_ und _Body Fat_ als Messwerte — bisher ohne zugehöriges Modul,
   womit sie unter RULES #3 nicht erfassbar gewesen wären.

**Auch „Video" ist kein Modul.** In CORE_OBJECTS existiert Video gleichzeitig
als Modul (:137) und als eigenständiges Artefakt (:306-318); in DECISIONS §13
ist Video ein _Document_-Typ. Drei Einordnungen für dasselbe Ding.

**Entscheidung nötig**
Eine kanonische Liste mit einheitlicher Namenskonvention (Empfehlung: reine
Domänenbegriffe ohne Suffix — `running`, `lactate`, `strength`, `mobility`,
`movement`, `body_composition`, `nutrition`, `recovery`, `sleep`, `cycle`) und
die ausdrückliche Feststellung, dass Geräteherkunft **kein** Modul ist.

---

## B4 · Dokument, Video und Program überschneiden sich

**Der Widerspruch**

| Fundstelle                 | Aussage                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `DOMAIN_DECISIONS` §13     | _„Documents belong to an **Athlete**."_ Beispiele: _Videos, Images, PDFs, MRI reports, Blood tests, **Training plans**, Invoices_ |
| `CORE_OBJECTS` :291        | _„Dokumente können allgemein einem **Athleten**, einem **Case** oder **Assessment** zugeordnet werden."_                          |
| `CORE_OBJECTS` :306        | Videos: eigener Objekttyp, ebenfalls Athlete/Case/Assessment                                                                      |
| `DOMAIN_DECISIONS` §3      | Core Objects enthalten `Document` **und** `Program` — **kein** `Video`                                                            |
| `DOMAIN_DECISIONS` §12/§14 | listet _„Shared Documents"_ und _„Shared Videos"_ getrennt auf                                                                    |

Drei Konflikte in einem:

1. **Zuordnungstiefe:** nur Athlete (DECISIONS) vs. Athlete/Case/Assessment
   (CORE_OBJECTS). Bei einem Bewegungsvideo ist die Assessment-Zuordnung
   fachlich zwingend — sonst ist es aus dem Report heraus nicht referenzierbar.
2. **Video = Dokument?** DECISIONS §13 sagt ja (Video ist ein Beispiel für
   Document), DECISIONS §14 behandelt sie getrennt, CORE_OBJECTS macht Video zu
   einem eigenen Objekt mit eigenen Fähigkeiten (kommentieren, markieren,
   KI-Auswertung). Ein Dokument hat diese Fähigkeiten nicht.
3. **Program vs. Trainingsplan:** `Program` ist in DECISIONS §3 ein Kernobjekt,
   wird aber **nirgends definiert**. Gleichzeitig steht _„Training plans"_ in
   §13 als Dokumenttyp. Und `DOMAIN_VISION:171` sagt: _„Apex OS ist kein
   Trainingsplan-Generator."_ Ist ein Program ein hochgeladenes PDF, eine
   strukturierte Entität oder eine Empfehlungssammlung?

**Warum blockierend**
Betrifft Storage-Modell, Freigabelogik (`Draft/Shared/Archived`), Report-Einbettung
und R2-Ablagestruktur. Alle drei müssen vor dem ersten Upload-Feature geklärt sein.

---

# DEFINITIONSLÜCKEN

Konzepte, die verbindlich gefordert, aber nirgends definiert sind.

| #      | Konzept                              | Gefordert in                                                                                                                                      | Fehlt in                                                                            | Auswirkung                                                                                                                                                                                                                                                                              |
| ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | **Question**                         | `RULES` #6 _„Every Assessment answers a Question"_, #14 (Kettenanfang), `USER_FLOWS` Philosophy                                                   | Kein Feld am Assessment — weder in `CORE_OBJECTS` §Assessment noch `DECISIONS` §7   | Eine als verpflichtend erklärte Eigenschaft hat kein Attribut. Ohne Feld wird RULES #6 nie erfüllt.                                                                                                                                                                                     |
| **D2** | **Evidence**                         | `RULES` #14 (Kettenglied), `CORE_OBJECTS`:206 _„Ein Insight basiert auf Evidenz"_                                                                 | Kein Objekt. `DECISIONS` §10 sagt nur _„Insights may use one or many Measurements"_ | Ist Evidence = Measurement, oder auch Video/Dokument? Entscheidet, ob Insight→Evidenz 1:n homogen oder n:m heterogen ist. Bewegungs-Insights stützen sich fachlich auf Videos.                                                                                                          |
| **D3** | **Action / Intervention / Maßnahme** | `RULES` #5 (_Action_), `RULES` #14 (_Intervention_), `VISION`:21,181 (_Maßnahmen_), `CORE_OBJECTS`:250 (_Maßnahmen_, getrennt von _Empfehlungen_) | Kein Objekt. `DECISIONS` §2 setzt gleich: _„Recommendations are actions."_          | Vier Begriffe. RULES #5 stellt Action **nach** Recommendation als eigenen Schritt; DECISIONS setzt beide gleich. Entweder ein Objekt oder zwei — das bestimmt, ob Ausführung/Erledigung modelliert wird.                                                                                |
| **D4** | **Task / Aufgabe**                   | `DECISIONS` Living Objects, §14 _„complete Tasks"_, `USER_FLOWS` #5, `VISION`:102, `CORE_OBJECTS`:99                                              | Nicht in `DECISIONS` §3 Core Objects. Nirgends definiert.                           | Vermutlich identisch mit D3 („Action"). Wenn ja: benennen. Wenn nein: definieren.                                                                                                                                                                                                       |
| **D5** | **Program**                          | `DECISIONS` §3 (Kernobjekt), §5, §14, `RULES` #10                                                                                                 | Keine Definition in irgendeinem Dokument                                            | Siehe B4.3                                                                                                                                                                                                                                                                              |
| **D6** | **Goal / Ziel**                      | `CORE_OBJECTS` §Ziel, `USER_FLOWS` #1                                                                                                             | Nicht in `DECISIONS` §3                                                             | `CORE_OBJECTS`:324: _„Goals beschreiben das Ziel eines **Cases**"_ — entfällt der Case (B1/Option A), hat Goal keinen Anker. Zudem: in `CORE_OBJECTS`:90 ist „Ziel" ein **Attribut** des Case (Singular), in §Ziel ein **Objekt** (Plural).                                             |
| **D7** | **Appointment / Termin**             | `USER_FLOWS` #6 (eigener Flow), `DECISIONS` §14 _„view Appointments"_, `CORE_OBJECTS` §Termin                                                     | Nicht in `DECISIONS` §3 Core Objects                                                | Ein Objekt mit eigenem User-Flow und Portal-Sichtbarkeit, das kein Kernobjekt ist.                                                                                                                                                                                                      |
| **D8** | **Measurement Type / Messwerttyp**   | `CORE_OBJECTS`:172-183 — _„Messwerte sind Instanzen vordefinierter Messwerttypen"_ mit `Name, Einheit, Werttyp`                                   | Nicht in `DECISIONS` §3, nicht in `DECISIONS` §9, nicht in `RULES`                  | Das Konzept ist genau richtig und deckt sich mit der Architekturempfehlung. Es fehlt aber in der maßgeblichen Objektliste. **Zusätzlich:** das Beispiel (:188 _„Links = 51 kg"_) zeigt Seitigkeit, aber `Name/Einheit/Werttyp` enthält kein Feld dafür. Wo lebt links/rechts/bilateral? |

---

# INKONSISTENZEN

## I1 · Unveränderlichkeit vs. „Update Insights / Adjust Recommendations"

`DECISIONS` Immutable Objects: _Published Insights, Published Recommendations, Measurements_.
Dagegen:

- `USER_FLOWS` #3: _„Update Insights → Update Recommendations → Generate **updated** Reports"_
- `USER_FLOWS` #8: _„Adjust Recommendations"_
- `CORE_OBJECTS`:224: _„Empfehlungen können … als erledigt, übersprungen oder ersetzt markiert werden."_

Teilweise auflösbar — Statusänderung ist keine Inhaltsänderung. Aber „Update"
und „Adjust" lesen sich als Inhaltsbearbeitung, und ob ein Statuswechsel an
einem als unveränderlich deklarierten Objekt zulässig ist, steht nirgends.
**Klärung nötig:** Statusfeld ausdrücklich von der Immutability ausnehmen, und
in USER_FLOWS „Update" durch „Supersede / neue Version" ersetzen.

## I2 · Assessment Report vs. Case Summary Report

`DECISIONS` §12: _„An Assessment combines all Module Reports into one **Assessment Report**."_ — klingt obligatorisch.
`CORE_OBJECTS` §Case Summary Report: _„**Optional.** Fasst alle Module eines **Cases** zusammen."_
`USER_FLOWS` #2: _„Generate Case Summary (optional)"_

Zwei verschiedene Aggregationsebenen (Assessment vs. Case), zwei Namen, einmal
obligatorisch und einmal optional. Mit B1/Option A verliert Case Summary die
Grundlage.

## I3 · „Der Report ist das eigentliche Ergebnis eines Cases" — aber optional

`CORE_OBJECTS`:230 erklärt den Report zum _Ergebnis eines Cases_, das Objekt
heißt aber _Module_ Report und aggregiert nur ein Modul. Die case-weite
Zusammenfassung ist dann ausdrücklich _optional_ (:259). Das eigentliche
Ergebnis eines Cases wäre damit optional — intern widersprüchlich.

## I4 · Kollaboration: gemeinsames Arbeiten vs. Lesen + Hochladen

`DOMAIN_VISION`:136: _„Coach und Athlet können **gemeinsam an einem Assessment arbeiten**."_
`DECISIONS` §14 Portal: Athlet darf ansehen und hochladen — kein Bearbeiten.
`DECISIONS` §14 Shared Access: _„The Athlete **cannot** … edit information"_.
`VISION`:144 nennt _„Feedback geben"_; im Portal-Flow (`USER_FLOWS` #5) kommt
Feedback nicht vor — nur `USER_FLOWS` #4 kennt _Coach Feedback_ (Coach→Athlet).
Athlet→Coach-Feedback ist nirgends abgebildet.

## I5 · Organization: MVP oder Zukunft?

`DECISIONS` §4: _„Internally a Personal Workspace is implemented as an Organization"_ — also MVP.
`DECISIONS` §16 Future Architecture listet _„Organizations"_ als künftiges Feature.
Widerspricht sich; gemeint ist vermutlich „Multi-Coach-Organisationen".

## I6 · Athletenbesitz: Coach oder Workspace?

`CORE_OBJECTS`:47: _„Ein Coach kann beliebig viele Athleten **besitzen**."_
`DECISIONS` §4: Ein Workspace kann mehrere Coaches enthalten.
Ungeklärt: Gehört der Athlet dem Coach oder dem Workspace? Was passiert bei
Coach-Wechsel? Sieht Coach B die Athleten von Coach A?
`DECISIONS` §17.1 _„Every Athlete exists exactly once"_ — einmalig **je
Workspace** oder global? Bei global entstünde eine mandantenübergreifende
Identität mit erheblichen Datenschutzfolgen.

## I7 · Assessment-Beispiele mischen zwei Dimensionen

`CORE_OBJECTS`:113-117: _Initial Assessment, Re-Assessment, Laktattest,
Bewegungsanalyse, Running Assessment_.

Die ersten beiden beschreiben die **Position im Verlauf**, die letzten drei den
**Inhalt**. Der Inhalt wird aber bereits durch die Module bestimmt — ein
„Laktattest" ist ein Assessment mit dem Modul _Lactate_. Werden beide Dimensionen
in einem Feld geführt, entsteht Redundanz zur Modulzuordnung.
**Empfehlung:** Assessment trägt nur die Verlaufsdimension
(`INITIAL | RE_ASSESSMENT | FOLLOW_UP`); der Inhalt ergibt sich aus den Modulen.

---

# FORMALE MÄNGEL

| #   | Fundstelle                                            | Mangel                                                                                                                                                                                                               |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Dateiname `DOMAIN_DESICIONS.md`                       | Tippfehler — muss `DOMAIN_DECISIONS.md` heißen. Die H1 im Dokument schreibt es bereits korrekt. Betrifft alle Verlinkungen.                                                                                          |
| F2  | `DOMAIN_RULES.md`:1                                   | Titel lautet `# AI_RULES.md` — Datei heißt `DOMAIN_RULES.md`. Veralteter Name aus einer früheren Fassung.                                                                                                            |
| F3  | `CORE_OBJECTS.md`:147                                 | Satz abgeschnitten: _„Module müssen unabhängig voneinander funktionie."_ → _funktionieren_. Trägt Regel 8.                                                                                                           |
| F4  | `CORE_OBJECTS.md`:340                                 | Grammatik: _„Ein Termin **können** zu einem Performance Case gehören."_ → _kann_. Zudem inhaltlich geändert (vorher „gehört immer") — die Optionalität ist eine echte Änderung und sollte als solche kenntlich sein. |
| F5  | `CORE_OBJECTS.md`:169,170                             | _„Measurments"_ (2×)                                                                                                                                                                                                 |
| F6  | `CORE_OBJECTS.md`:119,121,346 · `DOMAIN_VISION.md`:60 | _„Assesment"_ (4×)                                                                                                                                                                                                   |
| F7  | `CORE_OBJECTS.md`, `USER_FLOWS.md`, `DOMAIN_RULES.md` | Jeweils zwei H1-Überschriften (Dateiname + Titel). Bricht Gliederungswerkzeuge und Ankerlinks.                                                                                                                       |
| F8  | `CORE_OBJECTS.md`                                     | Sprachmix in Abschnittsnamen: _Coach, Athlete, Assessment, Measurement, Insight, Recommendation, Follow-Up_ (englisch) neben _Dokumente, Videos, Ziel, Termin_ (deutsch). Wandert sonst in die Code-Benennung.       |
| F9  | `CORE_OBJECTS.md`:37 vs :257                          | _„Case summary"_ vs. _„Case Summary Report"_ — zwei Schreibweisen desselben Objekts.                                                                                                                                 |

---

# Was zu entscheiden ist

Nach Dringlichkeit. Die ersten vier blockieren das Schema.

| Prio | Frage                                                                               | Empfehlung                                                                     |
| ---- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1    | **Performance Case: streichen, behalten oder optional?** (B1)                       | Optional (Option C)                                                            |
| 2    | **Report-Immutability: publish oder share?** (B2)                                   | `PUBLISHED` sperrt, `SHARED` steuert nur Sichtbarkeit                          |
| 3    | **Kanonische Modul-Liste + Namenskonvention** (B3)                                  | Domänenbegriffe ohne Suffix; VALD/MYOACT/Video ausdrücklich **keine** Module   |
| 4    | **Document / Video / Program abgrenzen** (B4)                                       | Video als eigener Typ (wegen Annotation/KI); Program definieren oder streichen |
| 5    | Question als Assessment-Feld (D1)                                                   | Pflichtfeld am Assessment                                                      |
| 6    | Evidence: nur Measurements oder auch Video/Dokument? (D2)                           | Heterogen — sonst sind Bewegungs-Insights nicht belegbar                       |
| 7    | Action/Intervention/Maßnahme/Task: ein Objekt oder zwei? (D3, D4)                   | Ein Objekt, ein Begriff                                                        |
| 8    | Seitigkeit: Teil des Messwerttyps oder des Messwerts? (D8)                          | Am Messwert — derselbe Typ gilt links wie rechts                               |
| 9    | Athletenbesitz Coach vs. Workspace; „exactly once" in welchem Geltungsbereich? (I6) | Workspace-Besitz, Eindeutigkeit je Workspace                                   |
| 10   | Immutability vs. Statusänderung (I1)                                                | Status ausdrücklich ausnehmen                                                  |

---

# Bereits gelöst

Zur Einordnung — diese Punkte aus dem Review vom 2026-08-03 sind durch die
Überarbeitung erledigt:

| Vorher                                              | Jetzt                                                                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Athlet nur als Rolle modellierbar                   | `DECISIONS` §6, §14 + `RULES` #16: Athlet ohne Account, Portal optional, keine Migration nötig — **exakt** die empfohlene Lösung |
| Kein Messwerttyp-Katalog                            | `CORE_OBJECTS`:172-183: Messwerttyp mit Name/Einheit/Werttyp                                                                     |
| Reports ohne Snapshot-Semantik                      | `DECISIONS` §2, §12 + `RULES` #17: Reports sind Snapshots, unveränderlich nach Veröffentlichung                                  |
| Video „immer zu einem Assessment" vs. Portal-Upload | `CORE_OBJECTS`:308: jetzt Athlete/Case/Assessment                                                                                |
| Termin „gehört immer zu einem Case"                 | `CORE_OBJECTS`:340: jetzt optional                                                                                               |
| Goal vor dem Case definiert                         | `USER_FLOWS` #1: jetzt Case → Goals                                                                                              |
| Freigabemodell unklar                               | `DECISIONS` §13, §14: `Draft/Shared/Archived` + zwei Zugriffsmodelle                                                             |
