# Vereinfachungsvorschlag für das Domänenmodell

> Datum: 2026-08-07 · **Vorschlag — kein Code, keine Dokumente geändert.**
>
> Bezug: [Konsistenzprüfung Durchgang 2](./2026-08-07-domain-consistency-check-2.md)

---

## Leitidee

Die 30 Einzelbefunde aus den beiden Prüfdurchgängen haben eine gemeinsame
Ursache: **Das Modell führt mehr Objekte, als es Sachverhalte gibt.**

`DOMAIN_DECISIONS` §3 listet 16 Kernobjekte; dazu kommen Goal, Appointment,
Follow-Up, Note und drei Report-Ebenen aus den anderen Dokumenten — rund 21
Konzepte. Ein erheblicher Teil davon beschreibt **denselben Sachverhalt in einem
anderen Zustand** (Recommendation/Action/Intervention/Maßnahme/Task) oder **auf
einer anderen Ebene** (Module Report / Assessment Report / Case Summary Report).

Jedes zusätzliche Objekt kostet dreifach: eine Tabelle, ein Berechtigungspfad,
ein Satz Zustandsübergänge. Und jedes Paar aus zwei Objekten, die dasselbe
meinen, erzeugt genau die Widersprüche, die beide Prüfdurchgänge gefunden haben.

Die folgenden Vorschläge reduzieren auf **17 Objekte** und lösen dabei alle vier
Blocker sowie die elf Inkonsistenzen. Nicht durch Weglassen von Funktionalität —
jeder fachliche Sachverhalt aus den Dokumenten bleibt abgebildet.

### Fünf Prinzipien

| #     | Prinzip                                  | Wirkung                                                                                                                                   |
| ----- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **Zustand statt Objekt**                 | Wenn zwei Begriffe dasselbe Ding in verschiedenen Phasen meinen, ist es ein Objekt mit einem Statusfeld.                                  |
| **2** | **Diskriminator statt Parallel-Tabelle** | Drei Report-Ebenen mit identischem Verhalten sind eine Tabelle mit `scope`.                                                               |
| **3** | **Beziehung statt Entität**              | „Evidence" ist keine Sache, sondern eine Verknüpfung.                                                                                     |
| **4** | **Orthogonales trennen**                 | Sichtbarkeit ist kein Status, sondern ein eigenes Objekt — sonst wird sie viermal implementiert.                                          |
| **5** | **Pflicht statt Optional**               | Ein Pflichtfeld erzeugt einen Abfragepfad, ein optionales zwei. Fehlt der Wert fachlich, wird er automatisch erzeugt — nicht weggelassen. |

---

# Teil 1 — Was zusammenfällt

Sechs Vereinfachungen. Jede löst mehrere Befunde gleichzeitig.

---

## V1 · Recommendation, Action, Intervention, Maßnahme, Task → **ein Objekt**

**Befund:** I4 — fünf Begriffe in vier Dokumenten für einen Sachverhalt.

**Vorschlag:** `Recommendation` mit Lebenszyklus-Status. Die Dokumente sagen es
bereits selbst — `DOMAIN_DECISIONS` §2: _„Recommendations are actions."_

```
Recommendation.status:  PROPOSED → ACCEPTED → IN_PROGRESS → DONE
                                 ↘ SKIPPED
                                 ↘ SUPERSEDED
```

Damit ist:

| Bisheriger Begriff               | Ist in Wahrheit                           |
| -------------------------------- | ----------------------------------------- |
| Recommendation                   | `status = PROPOSED`                       |
| Action / Intervention / Maßnahme | `status = IN_PROGRESS` oder `DONE`        |
| Task (im Athleten-Portal)        | Recommendation mit `assignedTo = ATHLETE` |

`CORE_OBJECTS`:241 beschreibt bereits _„erledigt, übersprungen oder ersetzt"_ —
exakt drei dieser Zustände. Der Vorschlag formalisiert nur, was dort schon steht.

**Löst:** I4, D3, D4, N4 (Task) · **Spart:** 1 Objekt (`Task`)
**Aufwand in den Dokumenten:** `RULES` #5 und #14 auf _Recommendation_ vereinheitlichen;
`CORE_OBJECTS`:266-267 („Empfehlungen" **und** „Maßnahmen" im Report) auf einen Eintrag reduzieren.

---

## V2 · Module Report, Assessment Report, Case Summary → **ein Objekt mit `scope`**

**Befund:** I5 — drei Ebenen, kein Dokument beschreibt alle drei.

**Vorschlag:** Ein `Report` mit Gültigkeitsbereich.

```
Report.scope:  MODULE | ASSESSMENT | CASE
```

Alle drei teilen dasselbe Verhalten: Statuskette, Versionierung, PDF-Export,
Freigabe, Snapshot-Inhalt. Drei Tabellen würden diese Logik dreimal enthalten —
und beim ersten Bugfix zweimal vergessen.

Eine vierte Ebene (z. B. eine Jahresauswertung je Athlet) ist später ein
zusätzlicher Enum-Wert, keine neue Tabelle.

**Löst:** I5, I6 · **Spart:** 2 Objekte
**Aufwand:** `DECISIONS` §12 um `CASE`-Scope ergänzen; `CORE_OBJECTS` §Case Summary Report als Scope beschreiben statt als eigenes Objekt.

---

## V3 · Evidence → **Beziehung, kein Objekt**

**Befund:** N4 — `Evidence` steht in §3 Core Objects, ist aber nirgends definiert.

**Vorschlag:** Evidenz ist die Verknüpfung zwischen einem Insight und dem, was
ihn belegt. Als eigene Entität hätte sie keine eigenen Attribute — sie wäre eine
leere Hülle mit zwei Fremdschlüsseln.

```prisma
model InsightEvidence {
  insightId     String
  // genau eines der drei gesetzt (CHECK-Constraint)
  measurementId String?
  assetId       String?
  noteId        String?
}
```

Das ist wichtig und **nicht** nur Kosmetik: `DECISIONS` §10 sagt heute nur
_„Insights may use one or many **Measurements**"_. Ein Insight wie _„Technische
Defizite am SkiErg"_ (`CORE_OBJECTS`:221) stützt sich fachlich auf ein **Video**,
nicht auf eine Zahl. Ohne heterogene Evidenz ist genau dieses Beispiel nicht
belegbar.

**Löst:** N4 (Evidence), D2 · **Spart:** 1 Objekt
**Aufwand:** `Evidence` aus §3 streichen, §10 um einen Satz ergänzen.

---

## V4 · Follow-Up → **Arbeitsablauf, kein Objekt**

**Befund:** I3 — Follow-Up hat einen Abschnitt in `CORE_OBJECTS`, fehlt aber in §3.

**Vorschlag:** `CORE_OBJECTS`:296-302 beschreibt Follow-Up selbst als _Ablauf_
(_„kann einen Case abschließen **oder** ein neues Assessment erzeugen"_) — das
sind zwei Aktionen auf bestehenden Objekten, kein eigener Datensatz.

Ein Follow-Up ist konkret:

- ein `Appointment` mit `type = FOLLOW_UP`, **und/oder**
- ein `Assessment` mit `type = RE_ASSESSMENT`

**Löst:** I3 (Follow-Up) · **Spart:** 1 Objekt
**Aufwand:** In `CORE_OBJECTS` als Ablauf kennzeichnen, nicht als Objekt.

---

## V5 · Document und Video → **ein Speichermodell, zwei Domänenobjekte**

**Befund:** B4/N3 — `DECISIONS`:473 sagt _„Videos are not Documents"_, :437 listet
Videos als Dokumentbeispiel.

**Vorschlag:** Beide Aussagen sind vereinbar, wenn man Domänenebene und
Persistenz trennt — genau nach dem Muster, das die Dokumente bereits akzeptieren
(`DECISIONS` §4: _„Internally a Personal Workspace is implemented as an
Organization. This implementation detail remains invisible to the user."_).

```prisma
model Asset {
  kind  AssetKind   // DOCUMENT | VIDEO | IMAGE
  // gemeinsame Kontextleiter + Storage-Felder
}

model VideoAnnotation {   // nur für kind = VIDEO
  assetId    String
  timestampMs Int
  body       String
}
```

Fachlich bleiben es zwei Objekte: getrennte tRPC-Namensräume (`video.*` /
`document.*`), getrennte Oberflächen, getrennte Fähigkeiten. Technisch teilen
sie Upload, R2-Ablage, Kontextzuordnung und Freigabe — also genau das, was
`DECISIONS`:473 selbst als gemeinsam benennt (_„although they share similar
upload workflows"_).

Zwei getrennte Tabellen würden Upload, Storage-Keys, Kontextleiter und
Freigabelogik doppelt enthalten. Ein späterer `AUDIO`-Typ (Coach-Sprachnotiz)
ist hier ein Enum-Wert.

**Löst:** B4, N3, P3 · **Spart:** doppelte Storage-Logik
**Aufwand:** §13 Beispielliste bereinigen (Videos entfernen), Verhältnis in einem Satz klarstellen.

---

## V6 · Kontextzuordnung → **eine Leiter, überall gleich**

**Befund:** P2, P3, B4 — Assets, Notes, Appointments und Programs hängen je nach
Dokument an unterschiedlichen Ebenen.

**Vorschlag:** Eine einheitliche Kontextleiter für alle „anhängbaren" Objekte:

```
athleteId     Pflicht  ← immer, unabhängig von Portal-Zugang
caseId        optional
assessmentId  optional
moduleId      optional
```

Regel: Je spezifischer gesetzt, desto genauer die Zuordnung; die Athleten-Bindung
ist immer vorhanden und macht die Timeline vollständig.

**Wichtig:** Damit entfällt die Einschränkung in `CORE_OBJECTS`:308 _„(wenn
Plattform-Zugang vorhanden)"_. Sie widerspricht dem tragenden Prinzip
(`RULES` #16, `DECISIONS` §6): Ein Arztbefund muss gerade für den Athleten **ohne**
Konto ablegbar sein — das ist der Standardfall _Shared Access_.

**Löst:** P2, P3 · **Aufwand:** ein Satz in `CORE_OBJECTS`, einmal definiert für alle vier Objekte.

---

# Teil 2 — Die vier Blocker

---

## B2 · Report-Immutability — **Sichtbarkeit aus dem Status herauslösen**

Das ist der einzige verbliebene Blocker und zugleich die Stelle mit dem größten
Vereinfachungsgewinn.

**Ursache des Widerspruchs:** `Shared` wird gleichzeitig als _Statusschritt_ und
als _Sichtbarkeitsschalter_ verwendet. Deshalb widerspricht sich `RULES` #17 in
drei aufeinanderfolgenden Zeilen selbst.

**Vorschlag: Sichtbarkeit ist kein Status, sondern ein eigenes Objekt.**

```
Report.status:  DRAFT → PUBLISHED (gesperrt) → ARCHIVED

model Share {
  resourceType  ShareResource   // REPORT | ASSET | PROGRAM | RECOMMENDATION
  resourceId    String
  token         String @unique
  passwordHash  String?
  expiresAt     DateTime?
  revokedAt     DateTime?
}
```

**Warum das gleichzeitig einfacher und richtiger ist:**

1. **Ein Sperrpunkt.** `PUBLISHED` sperrt — eindeutig. Drei der vier Fundstellen
   in `DECISIONS` sagen das bereits (§2, `Immutable Objects`, §17.9); nur §12
   weicht ab. Es ist die kleinere Korrektur.
2. **`Published` bekommt wieder Bedeutung.** Heute sperrt es nicht und steuert
   keine Sichtbarkeit — es ist ein bedeutungsloser Zwischenschritt.
3. **Der praktische Fall wird lösbar.** Coach veröffentlicht, entdeckt einen
   Übertragungsfehler, hat noch nicht geteilt → er erzeugt Version 2. Der Fehler
   bleibt nachvollziehbar, statt still überschrieben zu werden. Das ist bei
   Diagnostik der Normalfall, nicht der Sonderfall.
4. **Freigabelogik wird einmal gebaut statt viermal.** Reports, Assets, Programs
   und Recommendations sollen laut `DECISIONS` §14 alle teilbar sein. Als Status
   auf jedem Objekt bedeutet das vier Implementierungen von Token, Passwort,
   Ablauf und Widerruf.
5. **Mehrere Empfänger werden möglich.** Ein Report an den Athleten **und** an
   den behandelnden Physiotherapeuten, mit unterschiedlicher Laufzeit — mit
   einem Boolean-Status unmöglich, mit `Share` selbstverständlich.
6. **`RULES` #17:239-241 wird wahr:** _„Shared Reports only control visibility.
   Sharing never changes report content."_ Genau das leistet diese Trennung.

**Insights und Recommendations** brauchen dann keine eigene Statuskette (heute in
`Immutable Objects` gefordert, aber nirgends definiert — N4): Sie werden
**gemeinsam mit dem Report gesperrt**, der sie referenziert. Eine Nutzeraktion,
ein konsistenter Zustand.

**Measurements** brauchen ohnehin keinen Status: Sie sind laut `RULES` #4 Fakten
und damit **von Anfang an unveränderlich**. Korrekturen erfolgen als neuer
Datensatz mit `supersededById` — die Fehlmessung bleibt sichtbar, was
wissenschaftlich zwingend ist.

**Dokumentzustand vereinfacht sich mit:** `Draft/Shared/Archived` (§13) wird zu
`ACTIVE | ARCHIVED` plus `Share`. Ein Zustand weniger, und „geteilt" ist keine
Eigenschaft des Dokuments mehr, sondern eine Beziehung.

**Löst:** B2, N4 (Published Insights/Recommendations), I8
**Aufwand:** `DECISIONS` §12 und §13 anpassen, `RULES` #17 Zeile 237 auf _published_ ändern.

---

## B1 · Performance Case — **verpflichtend, aber automatisch erzeugt**

> **Korrektur meiner früheren Empfehlung.** In Durchgang 1 hatte ich „optional"
> vorgeschlagen. Nachdem die Entscheidung für „verpflichtend" gefallen ist und
> Einfachheit das Ziel ist, ist verpflichtend die **bessere** Wahl — aus einem
> Grund, den ich vorher nicht ausreichend gewichtet habe.

Ein optionaler Case bedeutet: **jede** Abfrage, jeder Berechtigungspfad und jede
Oberfläche muss zwei Fälle behandeln (mit Case / ohne Case). Das ist dauerhafte
Komplexität an jeder Stelle des Systems.

Der Einwand gegen „verpflichtend" war, dass eine einmalige Laktatmessung keinen
Case-Anlagevorgang erzwingen sollte. Den lösen die Dokumente bereits selbst —
mit einem Muster, das sie an anderer Stelle akzeptieren:

> `DECISIONS` §4: _„Every newly registered coach automatically receives a
> Personal Workspace. **The user never needs to create one manually.**"_

**Vorschlag:** Genauso beim Case. Legt ein Coach ein Assessment für einen
Athleten ohne offenen Case an, erzeugt das System still einen Case
(`type = SINGLE_ASSESSMENT`, Titel aus dem Assessment). Im Datenmodell ist die
Kette lückenlos; in der Oberfläche taucht der Case erst auf, wenn es mehr als
einen gibt.

`CORE_OBJECTS`:69-70 beschreibt beide Ausprägungen bereits — _„eine einmalige
Untersuchung"_ und _„eine langfristige Coaching-Beziehung"_. Ein `Case.type`
macht das explizit, ohne einen zweiten Abfragepfad zu erzeugen.

**Löst:** B1 · **Ergebnis:** ein Pfad statt zwei, kein Nullable-FK
**Offen bleibt:** `Performance Case` braucht einen definierenden Abschnitt in `DECISIONS` (N1).

---

## B3 · Module — **Registry statt Enum, HYROX als Preset**

**Vorschlag Teil 1 — Erweiterbarkeit (`RULES` #8):**

Modulidentität als **Daten**, Modulverhalten als **Registry im Code**:

```prisma
model AssessmentModule {
  assessmentId String
  moduleKey    String   // "running", "lactate", …
  payload      Json     // je Modul per Zod validiert
}
```

```ts
// packages/domain/src/modules/registry.ts
export interface ModuleDefinition<TPayload> {
  key: string;
  label: string;
  category: ModuleCategory;
  version: number; // DECISIONS §8 fordert Version
  payloadSchema: z.ZodType<TPayload>;
  measurementTypeKeys: readonly string[];
  report: ModuleReportRenderer<TPayload>;
}
```

Ein neues Modul ist damit **eine Datei plus ein Registry-Eintrag** — keine
Migration, kein Eingriff in bestehende Module. Als Prisma-Enum wäre jedes neue
Modul eine Migration plus Anpassung jedes `switch` — genau das, was `RULES` #8
verbietet.

**Vorschlag Teil 2 — kanonische Liste:**

```
running · strength · movement · mobility · lactate
body_composition · nutrition · recovery · sleep · cycle · custom
```

Maßgeblich ist `DECISIONS` §8. `RULES` #8 und `CORE_OBJECTS` sind nachzuziehen
(P1) — beide führen weiterhin VALD, MYOACT und Video als Module, was §8:316
ausdrücklich ausschließt.

**Vorschlag Teil 3 — HYROX als Assessment-Preset:**

HYROX steht nur in `CORE_OBJECTS`/`DOMAIN_VISION` als Modul. Es ist ein
**Wettkampfformat**, kein Analysebereich — dieselbe Kategorienverwechslung wie
bei VALD, nur auf der Sport- statt der Geräteachse.

Statt es zu streichen: **Preset** — eine benannte Modulkombination.

```ts
export const ASSESSMENT_PRESETS = {
  hyrox: ['running', 'strength', 'movement'],
  lactate: ['lactate'],
  movement: ['movement', 'mobility'],
} as const;
```

Das erklärt zugleich die Assessment-Beispiele in `CORE_OBJECTS`:113-117
(_Laktattest_, _Bewegungsanalyse_, _Running Assessment_) — es sind Presets, keine
Assessment-Typen. Damit löst sich **I11** ohne neues Objekt: Presets sind
Konfiguration, später optional als benutzerdefinierte Vorlagen erweiterbar.

**Löst:** B3, P1, I11 · **Ergebnis:** neues Modul ohne Migration; HYROX bleibt erhalten

---

## B4 · Document / Video / Program

Durch **V5** (ein Speichermodell) und **V6** (eine Kontextleiter) gelöst.
`Program` ist in `DECISIONS` §13 sauber definiert und bleibt als eigenes Objekt —
die Abgrenzung _„Uploaded PDF training plans are Documents"_ ist eindeutig und
tragfähig.

---

# Teil 3 — Die kleineren Punkte

| Befund                      | Vorschlag                                                                                                                                                                                                                                                                                                                                                                                                                         | Umfang    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **I1 · Question**           | `Assessment.question String` — Pflichtfeld, kein Objekt. Erfüllt `RULES` #6 mit einer Zeile.                                                                                                                                                                                                                                                                                                                                      | 1 Feld    |
| **I2 · Seitigkeit**         | `Measurement.side: LEFT \| RIGHT \| BILATERAL` (Default `BILATERAL`) plus `MeasurementType.isLateral Boolean` — damit die Oberfläche weiß, wann die Auswahl anzuzeigen ist. Am Messwert, **nicht** am Typ: derselbe Typ „Griffkraft" gilt beidseitig.                                                                                                                                                                             | 2 Felder  |
| **N2 · Assessment→Athlete** | Kein zweiter Fremdschlüssel. Der Athlet wird über den Case abgeleitet (`RULES` #15). §17.2 auf §7 nachziehen. Für Timeline-Abfragen siehe unten.                                                                                                                                                                                                                                                                                  | Doku      |
| **Rule 3 vs. Rule 15**      | Keine denormalisierten Spalten verstreuen. Stattdessen **eine** projizierte Tabelle `TimelineEntry (athleteId, occurredAt, kind, refId)`, append-only. Das erfüllt `RULES` #10 (Athlete Timeline) und löst zugleich das Abfrageproblem — ein Mechanismus statt zweier Kompromisse.                                                                                                                                                | 1 Tabelle |
| **I3 · Goal**               | Eigenes leichtes Objekt am Case (`title`, `targetDate?`, `achievedAt?`). Beseitigt die Attribut/Entität-Doppeldeutigkeit (`CORE_OBJECTS`:90 vs. §Ziel) dauerhaft. Ein Case kann mehrere Ziele haben.                                                                                                                                                                                                                              | 1 Objekt  |
| **I3 · Appointment**        | Eigenes Objekt, `caseId` **optional** — sonst ist das Erstgespräch vor Case-Anlage nicht abbildbar (`USER_FLOWS` #6). In §3 aufnehmen.                                                                                                                                                                                                                                                                                            | 1 Objekt  |
| **I3 · Note**               | Eigenes Objekt mit Kontextleiter. `CORE_OBJECTS`:98 („Empfehlungen/Notizen") trennen — eine Notiz ist frei, eine Recommendation muss laut `RULES` #5 aus einem Insight stammen. Die Vermischung würde eine der beiden Regeln brechen.                                                                                                                                                                                             | 1 Objekt  |
| **I7 · Athletenbesitz**     | `Athlete.workspaceId` — **nicht** `coachId`. Eindeutigkeit je Workspace. Die Coach-Sichtbarkeitsfrage ist im MVP gegenstandslos (§4: ein Coach je Workspace) und wird durch Workspace-Scoping bereits beantwortet. `CoachAssignment` erst bei Multi-Coach. **Korrektur meiner früheren Einschätzung** — ich hatte eine sofortige Entscheidung gefordert; sie ist gefahrlos aufschiebbar, weil die Ebene darüber bereits abgrenzt. | 1 Feld    |
| **I9 · Kollaboration**      | `DOMAIN_VISION`:136 („gemeinsam an einem Assessment arbeiten") auf das tatsächliche Modell abschwächen: Der Athlet trägt **bei** (Uploads, Aufgabenstatus, Feedback), der Coach verantwortet das Assessment. Sonst kollidiert es mit der Unveränderlichkeit.                                                                                                                                                                      | Doku      |
| **I10 · Organization**      | §16 präzisieren: nicht _„Organizations"_, sondern _„Multi-Coach-Workspaces"_. Die Organization existiert im MVP bereits (§4).                                                                                                                                                                                                                                                                                                     | Doku      |
| **I11 · Assessment-Typ**    | `Assessment.type: INITIAL \| RE_ASSESSMENT \| FOLLOW_UP` — nur die Verlaufsdimension. Der Inhalt ergibt sich aus den Modulen bzw. dem Preset.                                                                                                                                                                                                                                                                                     | 1 Feld    |

---

# Teil 4 — Das resultierende Objektmodell

**17 Objekte** statt ~21, bei vollständiger fachlicher Abdeckung.

| #   | Objekt             | Zweck                                                       | Änderung         |
| --- | ------------------ | ----------------------------------------------------------- | ---------------- |
| 1   | `Workspace`        | Mandant (= Organization)                                    | —                |
| 2   | `Coach`            | Profil des Fachanwenders                                    | —                |
| 3   | `Athlete`          | Person, Konto optional                                      | —                |
| 4   | `PerformanceCase`  | Betreuungsprozess, Pflicht, ggf. autom. erzeugt             | **B1**           |
| 5   | `Goal`             | Ziel eines Case                                             | **neu, geklärt** |
| 6   | `Assessment`       | Momentaufnahme, mit `question` + `type`                     | **I1, I11**      |
| 7   | `AssessmentModule` | `moduleKey` + `payload`, Registry-gestützt                  | **B3**           |
| 8   | `MeasurementType`  | Katalog: Name, Einheit, Werttyp, Kategorie, Referenzbereich | —                |
| 9   | `Measurement`      | Fakt, unveränderlich, mit `side` + Provenance               | **I2**           |
| 10  | `Insight`          | Interpretation                                              | —                |
| 11  | `InsightEvidence`  | Verknüpfung zu Beleg (Measurement/Asset/Note)               | **V3**           |
| 12  | `Recommendation`   | Maßnahme mit Lebenszyklus                                   | **V1**           |
| 13  | `Report`           | `scope: MODULE\|ASSESSMENT\|CASE`, versioniert              | **V2**           |
| 14  | `Asset`            | `kind: DOCUMENT\|VIDEO\|IMAGE`                              | **V5**           |
| 15  | `VideoAnnotation`  | Video-spezifisch                                            | **V5**           |
| 16  | `Program`          | Strukturierter Trainingsplan                                | —                |
| 17  | `Note`             | Freie Notiz                                                 | **I3**           |
| 18  | `Appointment`      | Termin, Case optional                                       | **I3**           |
| 19  | `Share`            | Sichtbarkeit, für alle Ressourcen                           | **B2**           |
| 20  | `TimelineEntry`    | Projektion für `RULES` #10                                  | **Rule 3/15**    |

**Entfallen:** `Evidence` (→ Beziehung) · `Task` (→ Recommendation-Status) ·
`Follow-Up` (→ Ablauf) · `Assessment Report` + `Case Summary Report` (→ `Report.scope`)

---

# Teil 5 — Schema-Skizze der tragenden Entscheidungen

Nur die Stellen, an denen die Vorschläge sichtbar werden.

```prisma
// ── Kette: lückenlos, keine Nullable-FKs im Kernpfad ──────────────────
model PerformanceCase {
  id          String   @id @default(cuid(2))
  workspaceId String
  athleteId   String
  type        CaseType @default(ONGOING)   // SINGLE_ASSESSMENT | ONGOING
  status      CaseStatus @default(OPEN)    // OPEN | CLOSED | ARCHIVED
  goals       Goal[]
  assessments Assessment[]
  @@index([workspaceId, athleteId])
}

model Assessment {
  id       String @id @default(cuid(2))
  caseId   String                          // Pflicht — Athlet wird abgeleitet
  question String                          // RULES #6, Pflichtfeld
  type     AssessmentType                  // INITIAL | RE_ASSESSMENT | FOLLOW_UP
  modules  AssessmentModule[]
  @@index([caseId])
}

// ── Modul: Schlüssel als Daten, Verhalten in der Registry ─────────────
model AssessmentModule {
  id           String @id @default(cuid(2))
  assessmentId String
  moduleKey    String                      // kein Enum → keine Migration
  payload      Json
  @@unique([assessmentId, moduleKey])
}

// ── Measurement: Fakt + Seitigkeit + Provenance ───────────────────────
model Measurement {
  id                String   @id @default(cuid(2))
  moduleId          String                  // Kontext via Modul (RULES #3)
  measurementTypeId String
  side              BodySide @default(BILATERAL)
  numericValue      Decimal?
  textValue         String?
  capturedAt        DateTime
  ingestedAt        DateTime @default(now())

  // Herkunft — Geräte sind Quellen, keine Module (DECISIONS §8)
  source         MeasurementSource @default(MANUAL)
  externalSystem String?                    // "vald", "garmin", …
  externalId     String?
  supersededById String?  @unique           // Korrektur statt Update

  @@unique([externalSystem, externalId])    // macht jeden Sync idempotent
  @@index([moduleId, measurementTypeId])
}

// ── Report: ein Objekt, drei Ebenen, ein Sperrpunkt ───────────────────
model Report {
  id           String       @id @default(cuid(2))
  scope        ReportScope                  // MODULE | ASSESSMENT | CASE
  moduleId     String?
  assessmentId String?
  caseId       String?                      // genau einer, per CHECK
  status       ReportStatus @default(DRAFT) // DRAFT | PUBLISHED | ARCHIVED
  version      Int          @default(1)
  content      Json                         // eingefrorener Snapshot
  publishedAt  DateTime?
}

// ── Sichtbarkeit: eigenes Objekt, nicht Status ────────────────────────
model Share {
  id           String        @id @default(cuid(2))
  resourceType ShareResource                // REPORT | ASSET | PROGRAM | …
  resourceId   String
  token        String        @unique
  passwordHash String?
  expiresAt    DateTime?
  revokedAt    DateTime?
  @@index([resourceType, resourceId])
}
```

Der `@@unique([externalSystem, externalId])` ist die kompakteste Absicherung für
`RULES` #12 und die Connected-Performance-Vision: Jeder wiederholte Garmin- oder
VALD-Sync wird dadurch idempotent, ohne eine Zeile Anwendungslogik.

---

# Teil 6 — Was in welchem Dokument zu ändern ist

| Dokument           | Änderungen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DOMAIN_DECISIONS` | §3: `Evidence`, `Task` streichen; `Goal`, `Appointment`, `Note`, `Share` aufnehmen · §7: Athleten-Bindung als abgeleitet kennzeichnen · §9: Kontext um Case/Timestamp/MeasurementType ergänzen · §12: `CASE`-Scope, Sperrpunkt auf `PUBLISHED` · §13: Videos aus der Dokumentliste entfernen; `Videos`/`Programs` aus §13 herauslösen und eigenständig nummerieren · §17.2 auf §7 angleichen · **neuer Abschnitt: Performance Case** · §8: „It is not part of the MVP" wieder direkt hinter die Lizenzaussage |
| `DOMAIN_RULES`     | #5/#14: einheitlich _Recommendation_ statt Action/Intervention · #8: Modul-Liste auf `DECISIONS` §8, VALD/MYOACT/Video entfernen · #17: Zeile 237 auf _published_ · Titel `# AI_RULES.md` → `# Apex OS – Development Rules`                                                                                                                                                                                                                                                                                   |
| `CORE_OBJECTS`     | Modul-Liste angleichen (VALD/MYOACT/Video raus, HYROX → Preset) · doppelte MeasurementType-Definition (:189-195) entfernen · :308 „(wenn Plattform-Zugang vorhanden)" streichen · :98 „Empfehlungen/Notizen" trennen · Follow-Up als Ablauf kennzeichnen · Case Summary als `Report.scope` · :247 „Ergebnis eines Cases" präzisieren · Tippfehler F3–F11                                                                                                                                                      |
| `DOMAIN_VISION`    | Modul-Liste angleichen · :136 Kollaboration präzisieren                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `USER_FLOWS`       | #3/#8: „Update Insights/Recommendations" → „neue Version / Re-Assessment" (sonst Widerspruch zur Unveränderlichkeit)                                                                                                                                                                                                                                                                                                                                                                                          |
| Datei-Umbenennung  | `DOMAIN_DESICIONS.md` → `DOMAIN_DECISIONS.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

---

# Teil 7 — Vorgeschlagene Reihenfolge

| Schritt | Inhalt                                                                 | Ergebnis                                                     |
| ------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| **1**   | B2 entscheiden: `PUBLISHED` sperrt, `Share` als Objekt                 | Letzter Blocker fällt                                        |
| **2**   | V1–V6 in `DOMAIN_DECISIONS` §3 nachziehen                              | Objektliste steht                                            |
| **3**   | Fehlende Definitionen: Performance Case, Goal, Appointment, Note       | Kein Objekt ohne Abschnitt                                   |
| **4**   | `RULES` + `CORE_OBJECTS` + `VISION` angleichen (Modul-Liste, Begriffe) | Vier Dokumente, eine Aussage                                 |
| **5**   | `packages/domain` anlegen: Modul-Registry + Invarianten                | Fachlogik außerhalb von `apps/web`                           |
| **6**   | Prisma-Schema + erste Migration                                        | Ein Guss statt sechs Nachbesserungen                         |
| **7**   | Feature-Struktur umbauen                                               | Solange die Verzeichnisse leer sind, reine Verzeichnisarbeit |

Schritte 1–4 sind Dokumentarbeit und Voraussetzung für 5–6. Schritt 7 sollte
nicht warten — er ist heute kostenlos und nach Sprint 1 ein repo-weiter Rename.

---

# Was dieser Vorschlag _nicht_ ändert

Damit klar ist, wo ich nichts anfasse — diese Entscheidungen sind tragfähig und
sollten so bleiben:

- **Athlet ohne Benutzerkonto**, Portal später verknüpfbar (`DECISIONS` §6, §14).
  Das ist sauber gelöst und der Kern des Zugriffsmodells.
- **Measurements sind Fakten**, Insights interpretieren, Recommendations leiten
  ab (`RULES` #4, #5). Die Kette ist richtig und wird durch V1 nur benannt.
- **Geräte sind Datenquellen, keine Module** (`DECISIONS` §8:316). Die wichtigste
  Klarstellung der letzten Überarbeitung.
- **Reports sind Snapshots** (`DECISIONS` §2). Nur der Auslöser war unklar.
- **Workspace als Mandant**, intern Organization (`DECISIONS` §4). Deckt sich mit
  dem vorhandenen Tenancy-Modell — kein Umbau nötig.
- **Coach entscheidet, AI unterstützt** (`RULES` #9, `DECISIONS` §15).
