# Design- & Architektur-Review

> Datum: 2026-08-03 · Stand: Foundation v0.1.0
> Grundlage: [RULES.md](../RULES.md) · [DOMAIN_VISION.md](../domain/DOMAIN_VISION.md) ·
> [CORE_OBJECTS.md](../domain/CORE_OBJECTS.md) · [USER_FLOWS.md](../domain/USER_FLOWS.md)
>
> **Kein Code geändert.** Dieser Report ist reine Analyse.

---

## Kernaussage

Ja, es gibt kritische Probleme — aber nicht die, die man erwarten würde.

Das Fundament ist technisch sauber: Tenancy, Typsicherheit, Tooling, Build laufen.
Das Problem liegt eine Ebene höher: **Das Repository kodiert eine andere Domäne
als die, die jetzt verbindlich ist.**

Die vorhandene Struktur (`training`, `nutrition`, `calendar`, `chat`,
`performance`) beschreibt eine generische Coaching-Plattform. DOMAIN_VISION.md
sagt in drei aufeinanderfolgenden Sätzen explizit das Gegenteil:

> Apex OS ist kein Trainingsplan-Generator. Apex OS ist kein Kalender. Apex OS
> ist kein Chat-System.

Die tatsächlichen Kernobjekte — **Performance Case, Assessment, Module,
Measurement, Insight, Recommendation, Report** — existieren im Code an keiner
Stelle: nicht im Prisma-Schema, nicht in `features/`, nicht im Permission-Modell.

**Die gute Nachricht:** Das Prisma-Schema enthält bisher _ausschließlich_
Identity und Tenancy. Es gibt keine Migrationshistorie, keine Produktionsdaten,
keine Altlast. Die teuren Entscheidungen stehen alle noch bevor — das ist genau
der richtige Zeitpunkt für diesen Review. Der Aufwand liegt bei Umbenennungen
und Modellierung, nicht bei Datenmigration.

**Bewertung nach Prüfbereich:**

| Bereich                              | Status                             | Kommentar                                                     |
| ------------------------------------ | ---------------------------------- | ------------------------------------------------------------- |
| Projektstruktur (Monorepo, Layering) | ✅ tragfähig                       | Schichtung, Grenzen und Tooling passen                        |
| Type System                          | 🟡 gut, unvollständig              | Branded IDs, Zod, Fehlertaxonomie stark — Domain-Typen fehlen |
| Multi-Tenancy                        | ✅ tragfähig                       | Session-abgeleitetes Scoping ist korrekt                      |
| **Feature-Struktur**                 | ❌ **falsche Domäne**              | P0-2                                                          |
| **Domain Model**                     | ❌ **nicht vorhanden**             | P0-1, P0-3, P0-6                                              |
| **Prisma Schema / Datenmodell**      | ❌ **nur Identity**                | P0-1, P0-3, P0-4                                              |
| API-Struktur                         | 🟡 Mechanik gut, Ressourcen falsch | P0-5, P0-8                                                    |
| **Erweiterbarkeit (Module)**         | ❌ **kein Mechanismus**            | P0-6 — verletzt Regel 8                                       |
| **Integrationsvorbereitung**         | ❌ **keine Provenance**            | P0-4                                                          |
| Modularität                          | 🟡 Slices ja, Domain-Module nein   | P0-6, P0-7                                                    |
| Benennung                            | 🟡 Kollisionen                     | P1-7                                                          |

---

# P0 — vor Sprint 1 beheben

Neun Punkte. Alle sind **Entscheidungen, keine Implementierungen** — sie kosten
jetzt Stunden und nach Sprint 1 Wochen.

---

## P0-1 · Athlete ist als Rolle modelliert, nicht als Entität

**Problem**
Es gibt kein `Athlete`-Modell. Der Athlet existiert nur als
`MembershipRole.athlete` — also als User-Account mit Organisationszugehörigkeit.

**Warum problematisch**
USER_FLOWS #1 lautet `Create Athlete → Define Goals → Create Performance Case`.
Ein Login kommt darin nicht vor. In der Praxis legt ein Coach einen Athleten vor
Ort an — der Athlet hat zu diesem Zeitpunkt keinen Account und braucht keinen.

Mit dem aktuellen Modell ist das unmöglich: Einen Athleten anzulegen erzwingt
`User` + `Membership` + Invitation-Flow. Das blockiert direkt den ersten
User-Flow der Plattform.

Weitere Folgen:

- CORE_OBJECTS: _„Ein Athlet besitzt eine vollständige Performance-Historie."_
  Wird der User-Account gelöscht (DSGVO-Auskunftsrecht), kaskadiert die gesamte
  Diagnostikhistorie mit — obwohl sie fachlich dem Case gehört.
- Ein Athlet, der Portal-Zugang erhält, müsste rückwirkend mit seiner Historie
  verknüpft werden. Ohne getrennte Entität existiert kein Anker dafür.

**Lösungsvorschlag**
`Athlete` als eigene, organisationsgebundene Entität mit **optionalem**
`userId`-Link:

```prisma
model Athlete {
  id             String   @id @default(cuid(2))
  organizationId String
  userId         String?  @unique   // erst gesetzt, wenn Portal-Zugang gewährt wird
  firstName      String
  lastName       String
  dateOfBirth    DateTime?
  // ...
  @@index([organizationId])
}
```

Die Rolle `athlete` bedeutet dann nicht mehr „ist ein Athlet", sondern
„hat Portal-Zugriff auf den verknüpften Athlete-Datensatz".

**Betroffene Dateien**
`packages/database/prisma/schema.prisma` ·
`packages/types/src/tenancy/index.ts` · `packages/auth/src/permissions.ts`

---

## P0-2 · Die Feature-Taxonomie kodiert die falsche Domäne

**Problem**
Aktuelle Slices: `auth`, `athletes`, `analysis`, `training`, `nutrition`,
`calendar`, `chat`, `dashboard`, `performance`, `settings`.

Kein einziger Kernbegriff der Domäne hat einen Slice: Case, Assessment, Module,
Measurement, Insight, Recommendation, Report, Follow-Up, Document.

Umgekehrt sind `training` und `nutrition` laut CORE_OBJECTS **Assessment-Module**
— eine Ebene tief im Modell, nicht Top-Level-Features. `calendar` und `chat`
sind in DOMAIN_VISION explizit als Nicht-Ziele benannt.

`analysis` und `performance` überlappen zudem inhaltlich und sind beide vage
gegenüber dem präzisen `Insight`.

**Warum problematisch**
Slice-Namen sind keine Ordnernamen. Sie werden zu Import-Pfaden, Route-Segmenten,
commitlint-Scopes, tRPC-Router-Keys und Doku-Referenzen. Nach Sprint 1 ist eine
Umbenennung ein repo-weiter Rename über hunderte Stellen — jetzt sind es leere
Verzeichnisse.

Schwerwiegender: Eine falsche Taxonomie lenkt die Implementierung. Wer einen
Slice `training` vorfindet, baut dort einen Trainingsplan-Generator — genau das
Produkt, das die Vision ausschließt.

**Lösungsvorschlag**
Neustrukturierung entlang der Kernobjekte:

```text
features/
  athletes/          Athletenstamm, Profile, Portal-Verknüpfung
  cases/             Performance Cases — Lifecycle, Goals, Status
  assessments/       Assessments + Modul-Zusammenstellung
  measurements/      Erfassung, Definitionen-Katalog
  insights/          Interpretation (ersetzt `analysis`)
  recommendations/   Maßnahmen aus Insights
  reports/           Module Reports, Case Summary, PDF-Export
  follow-ups/        Re-Assessment-Zyklus
  documents/         Dokumente & Videos
  scheduling/        Termine (unterstützend, ersetzt `calendar`)
  collaboration/     Feedback, Aufgaben (unterstützend, ersetzt `chat`)
  auth/  dashboard/  settings/
```

`training`, `nutrition`, `mobility` etc. entfallen als Slices und werden zu
Einträgen der Modul-Registry (siehe P0-6).

**Betroffene Dateien**
`apps/web/src/features/*` (10 Verzeichnisse) ·
`apps/web/src/features/README.md` · `commitlint.config.mjs` (scope-enum) ·
`docs/ARCHITECTURE.md` §4 · `docs/PRODUCT_REQUIREMENTS.md` §2 · `README.md`

---

## P0-3 · Das Measurement-Modell ist die folgenreichste offene Entscheidung

**Problem**
CORE_OBJECTS fordert zwei Dinge gleichzeitig:

> Measurements sind objektive Messwerte. […] Es können aber beliebige
> Measurements hinzugefügt und definiert werden.

Also: strukturierte, auswertbare Fakten — **und** benutzerdefinierbar zur
Laufzeit. Es existiert bisher kein Modell dafür.

**Warum problematisch**
Die beiden naheliegenden Ansätze scheitern beide:

| Ansatz                                                 | Bricht an                                                                                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Breite Tabelle (`lactate Float?`, `heartRate Int?`, …) | Jede neue Messgröße = Migration. Widerspricht „beliebig definierbar" direkt.                                                                                                         |
| JSON-Blob (`values Json`)                              | Keine Aggregation, keine Trendabfragen, keine Einheitensicherheit, keine Vergleichbarkeit über Assessments. Damit fällt der Kernnutzen weg: Fortschritt vergleichen (USER_FLOWS #8). |

Zusätzlich fehlen zwei Dimensionen, die die Domäne implizit verlangt:

- **Einheit.** Laktat in mmol/L, ROM in Grad, Pace in min/km. Ohne Einheit am
  Wert sind Vergleich und Re-Assessment unzuverlässig.
- **Seitigkeit.** CORE_OBJECTS nennt _„Asymmetrische Kraftentwicklung"_ als
  Insight-Beispiel. Asymmetrie ist ohne ein `side`-Feld (links/rechts/bilateral)
  nicht berechenbar. Das nachträglich einzuführen bedeutet, alle bestehenden
  Grip-Strength- und ROM-Werte neu zu interpretieren.

**Lösungsvorschlag**
Katalog und Fakt trennen:

```prisma
// Katalog — was gemessen werden kann. Global oder org-spezifisch.
model MeasurementDefinition {
  id             String          @id @default(cuid(2))
  organizationId String?         // null = systemweiter Standardkatalog
  key            String          // "lactate", "grip_strength", "hip_flexion_rom"
  label          String
  unit           String          // "mmol/L", "kg", "deg"
  valueType      MeasurementType // NUMERIC | TEXT | BOOLEAN | ENUM
  moduleKey      String          // welchem Modul zugeordnet
  @@unique([organizationId, key])
}

// Fakt — ein Messwert. Unveränderlich (siehe P1-6).
model Measurement {
  id           String   @id @default(cuid(2))
  definitionId String
  side         BodySide @default(BILATERAL)
  numericValue Decimal?
  textValue    String?
  capturedAt   DateTime
  // Kontext + Provenance: siehe P0-4
}
```

`Decimal` statt `Float`: Laktatwerte und Gewichte sind fachliche Größen, bei
denen Fließkomma-Rundung in Trendberechnungen sichtbar wird.

**Betroffene Dateien**
`packages/database/prisma/schema.prisma` · neu: `packages/domain` (siehe P0-7)

---

## P0-4 · Keine Provenance — Integrationen sind nicht vorbereitet

**Problem**
Regel 12 (API First) und DOMAIN_VISION („Connected Performance") nennen VALD,
MYOACT, Garmin, Apple Health, Health Connect, Polar, COROS. Im Datenmodell
existiert keine Vorbereitung: keine Quellenkennzeichnung, keine externen IDs,
keine Trennung von Mess- und Importzeitpunkt.

**Warum problematisch**
Provenance ist das klassische Feld, das man nicht nachrüsten kann. Sobald
Messwerte ohne Quelle existieren:

- **Keine Deduplizierung.** Ein erneuter Garmin-Sync über denselben Zeitraum
  erzeugt Dubletten. Ohne `externalId` gibt es keine Idempotenz.
- **Keine Vertrauensdifferenzierung.** Ein VALD-Kraftmesswert und eine manuelle
  Coach-Schätzung sind fachlich nicht gleichwertig — ein Insight muss das
  unterscheiden können.
- **Kein Reimport.** Ändert ein Anbieter seine Berechnung, kann ohne Rohdaten
  nicht neu abgeleitet werden.
- **Zeitachse falsch.** Garmin liefert Daten von gestern heute aus. Ohne
  Trennung von `capturedAt` und `ingestedAt` landen sie an der falschen Stelle
  der Athleten-Timeline — und Regel 10 macht die Timeline zum Kernartefakt.

**Lösungsvorschlag**
Provenance direkt am `Measurement` verankern, plus Rohdatenablage:

```prisma
enum MeasurementSource { MANUAL DEVICE IMPORT DERIVED }

model Measurement {
  // ...
  source         MeasurementSource @default(MANUAL)
  externalSystem String?           // "vald", "garmin", "myoact"
  externalId     String?           // Idempotenzschlüssel des Fremdsystems
  capturedAt     DateTime          // wann gemessen
  ingestedAt     DateTime @default(now())  // wann bei uns angekommen
  rawPayloadId   String?

  @@unique([externalSystem, externalId])
}

model ExternalConnection {   // OAuth-Tokens, Sync-Cursor pro Athlet/Org
  provider     String
  athleteId    String?
  syncCursor   String?
  // ...
}
```

Der `@@unique([externalSystem, externalId])` ist der eigentliche Kern: Er macht
jeden Sync idempotent, ohne Anwendungslogik.

**Betroffene Dateien**
`packages/database/prisma/schema.prisma` ·
neu: `packages/integrations/` (siehe P1-4) · `docs/ARCHITECTURE.md`

---

## P0-5 · Permission-Modell doppelt gepflegt und an der falschen Domäne

**Problem**
Zwei parallele Repräsentationen derselben Berechtigungen:

- `packages/types/src/tenancy/index.ts` → `PERMISSIONS` (für tRPC-Prozeduren)
- `packages/auth/src/permissions.ts` → `accessControl` (für Better Auth)

Der Kommentar dort räumt es offen ein: _„Keep them in step when adding a
capability."_ Manuelle Synchronisation.

Zusätzlich passen die Ressourcen nicht zur Domäne. Vorhanden: `athlete`,
`training`, `nutrition`, `analysis`, `billing`. Nicht vorhanden: `case`,
`assessment`, `measurement`, `insight`, `recommendation`, `report`.

**Warum problematisch**
Zwei Punkte, beide ernst:

1. **Regel 15 („One Source of Truth") wird an einer sicherheitsrelevanten
   Stelle verletzt.** Divergenz zwischen beiden Tabellen bedeutet, dass eine
   Rolle über den Better-Auth-Endpunkt darf, was ihr die tRPC-Prozedur verwehrt
   — oder umgekehrt. Solche Abweichungen fallen im Review nicht auf, weil beide
   Dateien für sich plausibel aussehen.
2. **Die Kernobjekte sind nicht schützbar.** Es gibt keine Berechtigung, die
   „darf einen Case abschließen" oder „darf ein Insight freigeben" ausdrückt —
   also wird die Autorisierung beim Bau dieser Features ad hoc improvisiert.

**Lösungsvorschlag**
`@apex/types` als einzige Quelle, die Better-Auth-Statements daraus **ableiten**
statt danebenstellen (Regel 15: _derive instead of duplicate_).

Ressourcen an der Domäne ausrichten:

```ts
'case:read' | 'case:write' | 'case:close';
'assessment:read' | 'assessment:write';
'measurement:read' | 'measurement:write';
'insight:read' | 'insight:write';
'recommendation:read' | 'recommendation:write';
'report:read' | 'report:generate' | 'report:share';
```

Der bestehende Test `permissions.test.ts` prüft bereits Monotonie der Rollen —
er sollte zusätzlich prüfen, dass beide Repräsentationen deckungsgleich sind
(bzw. entfällt diese Prüfung, sobald abgeleitet wird).

**Betroffene Dateien**
`packages/types/src/tenancy/index.ts` · `packages/auth/src/permissions.ts` ·
`packages/types/src/tenancy/permissions.test.ts`

---

## P0-6 · Regel 8 („Modular by Design") hat keinen Mechanismus

**Problem**
Regel 8 ist unmissverständlich:

> New modules must be addable without changing existing ones.

Es existiert keine Struktur, die das ermöglicht — weder eine Registry, noch ein
Modul-Interface, noch ein Payload-Vertrag.

**Warum problematisch**
Ohne bewusste Entscheidung landet der Modultyp als Prisma-Enum. Dann bedeutet
jedes neue Modul: Enum ändern → Migration → alle `switch`-Statements anfassen.
Das ist exakt das, was Regel 8 verbietet, und es fällt erst beim fünften Modul
auf — wenn der Umbau teuer ist.

Gleichzeitig darf es nicht ins andere Extrem kippen: Ein reines `Json`-Feld
ohne Vertrag macht Module beliebig, aber auch untypisiert und nicht validierbar.

**Lösungsvorschlag**
Modul-Identität als **Daten** (String-Key), Modul-Verhalten als **Registry im
Code**:

```ts
// packages/domain/src/modules/registry.ts
export interface ModuleDefinition<TPayload> {
  key: string; // "running", "lactate", "vald"
  label: string;
  payloadSchema: z.ZodType<TPayload>; // Validierung
  measurementKeys: readonly string[]; // welche Definitionen es nutzt
  report: ModuleReportRenderer<TPayload>;
}

export const MODULE_REGISTRY = defineModules([
  runningModule,
  lactateModule,
  strengthModule,
  valdModule /* ... */,
]);
```

In der Datenbank nur `AssessmentModule { moduleKey String, payload Json }`.
Ein neues Modul ist dann **eine neue Datei plus ein Registry-Eintrag** — keine
Migration, kein Eingriff in bestehende Module. Regel 8 erfüllt.

**Betroffene Dateien**
neu: `packages/domain/src/modules/` ·
`packages/database/prisma/schema.prisma` · `apps/web/src/features/assessments/`

---

## P0-7 · Kein Domain-Package — Fachlogik wäre in `apps/web` eingesperrt

**Problem**
Die aktuelle Architektur sieht Fachlogik in `apps/web/src/features/*/server/`
vor. Domain-Invarianten wie „Recommendation braucht ein Insight" (Regel 5)
lägen damit ausschließlich in der Next.js-Anwendung.

**Warum problematisch**
Mindestens vier absehbare Konsumenten liegen außerhalb von `apps/web`:

- **Trigger.dev-Jobs** — Garmin-/VALD-Sync (P0-4) erzeugt Measurements und muss
  dieselben Regeln einhalten.
- **PDF-Report-Generierung** — läuft als Job, nicht im Request.
- **Öffentliche API** (Regel 12) — eigener Deployable.
- **Mobile/BFF** — Regel 11 (Mobile First).

Jeder davon müsste die Regeln entweder duplizieren oder `apps/web` importieren.
Beides ist falsch.

**Lösungsvorschlag**
`packages/domain` einführen: framework-frei, kennt weder Next.js noch tRPC.

```text
packages/domain/src/
  case/           Lifecycle, Statusübergänge
  assessment/     Zusammenstellung, Modulzuordnung
  measurement/    Validierung gegen Definition, Einheiten
  insight/        Evidenzverknüpfung
  recommendation/ Ableitungsregeln (Regel 5)
  modules/        Registry (P0-6)
```

`features/*/server/` wird damit zur dünnen Schicht: Autorisierung + Aufruf der
Domain-Funktion. Das ist auch die Voraussetzung dafür, die Kernregeln
überhaupt testbar zu machen.

**Betroffene Dateien**
neu: `packages/domain/` · `apps/web/src/features/*/server/` ·
`docs/ARCHITECTURE.md` §3 · `README.md`

---

## P0-8 · `TenantContext` kennt keine Athleten-Identität — Portal nicht autorisierbar

**Problem**
`TenantContext` enthält `{ organizationId, userId, role }`. USER_FLOWS #5
(Athlete Portal) verlangt: Athlet meldet sich an und sieht **seine eigenen**
Cases, Reports, Empfehlungen und Aufgaben.

Mit `role === 'athlete'` allein lässt sich das nicht ausdrücken — es fehlt der
Bezug, _welcher_ Athlet der eingeloggte User ist.

**Warum problematisch**
Die Prozedur-Leiter (`organizationProcedure`, `withPermission`) ist sonst sauber
gebaut. Ohne `athleteId` im Kontext muss jede Portal-Prozedur die Auflösung
selbst vornehmen — und genau dort entstehen Lücken. Ein vergessener Filter
bedeutet: Athlet A sieht die Diagnostik von Athlet B. Innerhalb derselben
Organisation greift das Tenant-Scoping nicht mehr; es ist die zweite
Isolationsebene, die bisher komplett fehlt.

**Lösungsvorschlag**
Kontext erweitern und eine eigene Prozedur ergänzen:

```ts
export interface TenantContext {
  readonly organizationId: string;
  readonly userId: string;
  readonly role: OrganizationRole;
  /** Gesetzt, wenn der User mit einem Athlete-Datensatz verknüpft ist (P0-1). */
  readonly athleteId?: string;
}

/** Erzwingt Portal-Scope: nur eigene Daten, athleteId garantiert vorhanden. */
export const athleteProcedure = /* ... */;
```

Ergänzend in `docs/SECURITY.md` als zweite Isolationsebene dokumentieren —
neben der Tenant-Isolation.

**Betroffene Dateien**
`packages/types/src/tenancy/index.ts` · `apps/web/src/server/api/trpc.ts` ·
`docs/SECURITY.md` §4 · `docs/API.md` §3

---

## P0-9 · Coach-zu-Athlet-Zuordnung ist undefiniert

**Problem**
CORE_OBJECTS beginnt mit `Coach → Athlete`. DOMAIN_VISION adressiert
„Performance Center" — also Organisationen mit mehreren Coaches, Physios und
Sportwissenschaftlern.

Offen und nirgends entschieden: **Sieht Coach A die Athleten von Coach B?**

**Warum problematisch**
Diese Frage wird beantwortet — entweder jetzt bewusst, oder später implizit
durch die erste Query, die jemand schreibt. Sie wirkt sich aus auf:

- Permission-Modell (P0-5): braucht es einen Scope-Modifier `own` vs. `all`?
- Jede Athleten-, Case- und Report-Abfrage
- DSGVO: Zugriff auf Gesundheitsdaten ist begründungspflichtig. In einem
  Physio-Kontext ist organisationsweiter Vollzugriff schwer haltbar.

Nachträglich einzuschränken ist deutlich teurer als initial zu öffnen: Jede
bestehende Query muss dann einzeln geprüft werden.

**Lösungsvorschlag**
Jetzt entscheiden und modellieren. Empfehlung: **explizite Zuordnung mit
konfigurierbarer Sichtbarkeit** — `CoachAssignment(coachId, athleteId, role)`,
dazu ein Org-Setting `athleteVisibility: ASSIGNED_ONLY | ORGANIZATION_WIDE`.
Default `ASSIGNED_ONLY`, weil restriktiv starten und öffnen der billigere Weg
ist.

**Betroffene Dateien**
`packages/database/prisma/schema.prisma` ·
`packages/types/src/tenancy/index.ts` · `packages/database/src/tenant.ts`

---

# P1 — vor Beta sinnvoll

## P1-1 · Regel 10 („Athlete Timeline") hat kein Modell

Die Timeline wird als Kernartefakt beschrieben („Every new feature should enrich
the athlete's timeline"), existiert aber nicht. Wird sie erst spät gebaut, muss
sie aus heterogenen Tabellen rekonstruiert werden — mit Lücken für alles, was
kein Zeitstempel-Feld bekommen hat.
→ Append-only `TimelineEvent` (athleteId, occurredAt, type, refId), das Features
beim Schreiben mitbefüllen.
**Dateien:** `schema.prisma`, `packages/domain/`

## P1-2 · Reports brauchen Snapshot-Semantik

CORE_OBJECTS: Reports sind interaktiv **und** PDF-exportierbar. Wird ein Report
live aus Measurements abgeleitet, ändert sich rückwirkend ein Dokument, das der
Athlet bereits erhalten hat. In einem diagnostischen Kontext ist das nicht
vertretbar.
→ `Report` als versionierten Snapshot mit eingefrorenen Daten; die interaktive
Ansicht rendert den Snapshot, nicht den Live-Stand.
**Dateien:** `schema.prisma`, `features/reports/`

## P1-3 · Dokumente sind polymorph zugeordnet — Prisma kann das nicht direkt

_„Dokumente können einem Case oder Assessment zugeordnet werden."_ Prisma hat
keine polymorphen Relationen. Ohne Entscheidung entsteht ein `entityType`/
`entityId`-Paar ohne Fremdschlüssel — und damit verwaiste Zeilen.
→ Zwei nullable FKs (`caseId`, `assessmentId`) plus CHECK-Constraint auf genau
einen gesetzten Wert. Referentielle Integrität bleibt erhalten.
**Dateien:** `schema.prisma`

## P1-4 · `integrations/` und `services/` liegen in `apps/web`

Aus demselben Grund wie P0-7: Der VALD-/Garmin-Sync läuft als Trigger.dev-Job,
nicht im Next.js-Request.
→ `packages/integrations/` (Vendor-Clients) und `packages/services/`
(Storage, Mail) hochziehen.
**Dateien:** `apps/web/src/integrations/`, `apps/web/src/services/`,
`docs/ARCHITECTURE.md` §3

## P1-5 · Rollenmodell zu eng für die adressierten Nutzer

DOMAIN_VISION nennt Coaches, **Sportwissenschaftler**, **Physiotherapeuten**,
Performance Center. Rollen sind `owner | admin | coach | athlete`. Ein Physio
braucht andere Rechte als ein Coach (Arztbefunde, Return-to-Sport).
→ Rollen erweitern oder Rolle von Fachdisziplin trennen.
**Dateien:** `schema.prisma` (`MembershipRole`),
`packages/types/src/tenancy/index.ts`, `packages/auth/src/permissions.ts`

## P1-6 · Measurements sind laut Regel 4 Fakten — aber nicht unveränderlich

Regel 4: _„Measurements are Facts."_ Ein `UPDATE` auf einen Messwert ändert
rückwirkend die Grundlage bereits erstellter Insights und Reports.
→ Append-only mit Korrektureinträgen (`supersededById`) statt In-Place-Update.
**Dateien:** `schema.prisma`, `packages/domain/src/measurement/`

## P1-7 · Namenskollisionen

| Kollision                                     | Problem                                              |
| --------------------------------------------- | ---------------------------------------------------- |
| `Session` (Better Auth) vs. Trainingssession  | Zwei Bedeutungen im selben Namensraum                |
| Slice `analysis` vs. `Insight`                | `analysis` ist unpräzise für ein präzises Konzept    |
| Slice `performance` vs. `Performance Case`    | Suggeriert Zugehörigkeit, die nicht besteht          |
| `MembershipRole.athlete` vs. `Athlete` (P0-1) | Rolle und Entität gleich benannt, verschiedene Dinge |

→ Mit P0-2 gemeinsam auflösen; Auth-`Session` ggf. als `AuthSession` mappen.
**Dateien:** `schema.prisma`, `features/*`

## P1-8 · DSGVO Art. 9 — das Cycle-Modul erhöht die Anforderung deutlich

`docs/SECURITY.md` behandelt Gesundheitsdaten bereits. Neu und schärfer:
DOMAIN_VISION und CORE_OBJECTS nennen explizit **Menstruationszyklus**,
Arztbefunde, MRT und Blutwerte. Das ist besondere Kategorie personenbezogener
Daten in der sensibelsten Ausprägung.
→ Einwilligungsmodell pro Datenkategorie, Feldverschlüsselung für Zyklus- und
Befunddaten prüfen, Athleten-Datenexport, Zweckbindung dokumentieren.
**Dateien:** `docs/SECURITY.md` §8/§9, `schema.prisma`

## P1-9 · Doku behauptet Compiler-Einstellungen, die nicht aktiv sind

`README.md` und `docs/CONTRIBUTING.md` §7 nennen `exactOptionalPropertyTypes`
als aktiv. In `packages/config/typescript/base.json` steht `false`.
→ Entweder aktivieren oder die Doku korrigieren. (Aktivieren ist jetzt billig —
es gibt kaum Code.)
**Dateien:** `packages/config/typescript/base.json`, `README.md`,
`docs/CONTRIBUTING.md`

## P1-10 · Doku-Referenzen zeigen auf die alte Domäne

`features/README.md` beschreibt die alten Slices inkl. „Programmes, sessions,
exercise library". `docs/ARCHITECTURE.md` §4 und `docs/PRODUCT_REQUIREMENTS.md`
§2 ebenso. Zusätzlich: `RULES.md` liegt unter `docs/`, wurde aber als
Root-Dokument referenziert, und trägt intern die Überschrift `# AI_RULES.md`.
→ Mit P0-2 gemeinsam nachziehen; Pfad und Titel von RULES.md vereinheitlichen.
**Dateien:** `apps/web/src/features/README.md`, `docs/ARCHITECTURE.md`,
`docs/PRODUCT_REQUIREMENTS.md`, `docs/RULES.md`, `commitlint.config.mjs`

---

# P2 — nach MVP

| #    | Thema                             | Kern                                                                                                                      |
| ---- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| P2-1 | **Referenzwerte & Normen**        | Insights brauchen Vergleichsmaßstäbe (alters-/geschlechts-/sportartspezifisch). Eigenes Katalogmodell, versioniert.       |
| P2-2 | **Einheiten-Normalisierung**      | Kanonische Speichereinheit + Anzeigekonvertierung (metrisch/imperial), sobald internationale Nutzung ansteht.             |
| P2-3 | **Athleten-Portabilität**         | Wechselt ein Athlet die Organisation, endet seine Historie. Widerspricht „vollständige Performance-Historie" langfristig. |
| P2-4 | **Offline-Erfassung**             | Regel 11: Coaches arbeiten vor Ort. Messwerterfassung in Halle/Labor ohne stabiles Netz braucht lokale Queue.             |
| P2-5 | **Postgres RLS**                  | Zweite Verteidigungslinie hinter dem Applikations-Scoping — relevanter geworden durch Art.-9-Daten.                       |
| P2-6 | **AI-Evaluation**                 | Regel 9 (Coach-Centered AI) braucht messbare Qualität: Akzeptanzrate von Vorschlägen als Primärmetrik.                    |
| P2-7 | **Öffentliche API-Versionierung** | Regel 12 zu Ende gedacht: tRPC bleibt intern, öffentliche API separat und versioniert.                                    |

---

# Offene Fragen an die Domäne

Beim Abgleich sind **sieben Widersprüche bzw. Lücken in den Domain-Dokumenten
selbst** aufgefallen. Sie blockieren die Modellierung und sollten fachlich
geklärt werden, bevor Schema-Entscheidungen fallen.

| #   | Frage                                                           | Fundstelle                                                                                                             | Warum relevant                                                                                                                                 |
| --- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Gehört ein Goal zum Athleten oder zum Case?**                 | USER_FLOWS #1 definiert Goals **vor** dem Case; CORE_OBJECTS beschreibt Goal als Ziel **des Cases**                    | Bestimmt die Fremdschlüsselrichtung                                                                                                            |
| 2   | **Muss ein Termin zwingend zu einem Case gehören?**             | CORE_OBJECTS: _„Ein Termin gehört immer zu einem Performance Case"_; USER_FLOWS #6 kennt aber das Erstgespräch         | Ein Erstgespräch findet vor dem Case statt — sonst braucht es einen Pseudo-Case                                                                |
| 3   | **Muss ein Video zwingend zu einem Assessment gehören?**        | CORE_OBJECTS: _„Videos gehören immer zu einem Assessment"_; USER_FLOWS #4/#5: Athlet lädt im Portal Videos hoch        | Ad-hoc-Upload ohne offenes Assessment ist sonst unmöglich                                                                                      |
| 4   | **Kann ein Insight mehrere Module oder Assessments umspannen?** | CORE_OBJECTS beschreibt Insights modulnah, Case Summary aber übergreifend                                              | Entscheidet über 1:n vs. n:m zwischen Insight und Evidenz                                                                                      |
| 5   | **Was genau ist eine „Aufgabe"?**                               | Als Case-Inhalt und im Portal („Complete Tasks") genannt, aber nicht als Core Object definiert                         | Unklar, ob Task = Recommendation im Ausführungszustand oder eigenes Objekt                                                                     |
| 6   | **Regel 3 vs. Regel 15**                                        | Regel 3 fordert Verknüpfung jedes Measurements mit Athlete + Case + Assessment + Modul; Regel 15 verbietet Duplikation | Denormalisierung von `athleteId` auf Measurement ist für Timeline-Abfragen fast unvermeidbar — sollte bewusst als Ausnahme dokumentiert werden |
| 7   | **Satz unvollständig**                                          | `CORE_OBJECTS.md:138`: _„Module müssen unabhängig voneinander funktionie"_                                             | Abgeschnitten — Aussage sollte vervollständigt werden, sie trägt Regel 8                                                                       |

---

# Empfohlene Reihenfolge

Die P0-Punkte hängen voneinander ab. Sinnvolle Sequenz:

```text
1.  Offene Domänenfragen klären        (blockiert alles Weitere)
2.  P0-1  Athlete als Entität           ─┐
3.  P0-9  Coach-Athlet-Zuordnung        ─┤ zusammen entscheiden
4.  P0-5  Permission-Modell             ─┘
5.  P0-3  Measurement-Modell            ─┐
6.  P0-4  Provenance                    ─┤ zusammen modellieren
7.  P0-6  Modul-Registry                ─┘
8.  P0-7  packages/domain anlegen
9.  P0-2  Feature-Struktur umbauen      (billigste Stelle: leere Verzeichnisse)
10. P0-8  TenantContext erweitern
```

Schritte 2–7 sind eine zusammenhängende Modellierungssession und ergeben eine
einzige Migration. Schritt 9 ist reine Verzeichnisarbeit, solange kein Code
darin liegt — deshalb sollte er nicht aufgeschoben werden.

---

# Was gut ist und bleiben sollte

Damit der Report nicht den falschen Eindruck erweckt — folgendes trägt und
sollte nicht angefasst werden:

- **Tenant-Scoping aus der Session**, nie aus Client-Input. Diese Entscheidung
  ist korrekt und wird durch P0-8 nur ergänzt, nicht ersetzt.
- **Branded IDs** (`AthleteId`, `OrganizationId`). Zahlen sich bei einem Modell
  mit sieben verketteten Entitäten stark aus.
- **Fehlertaxonomie** mit stabilen Codes inkl. `INTEGRATION_FAILED` — passt
  bereits zu P0-4.
- **Prozedur-Leiter** (`public` → `protected` → `organization` → `withPermission`).
  Der Mechanismus ist richtig; nur die Ressourcen sind es nicht.
- **Design-System mit semantischen Tokens**, inkl. fünf Chart-Serien und
  `[data-numeric]` für Tabellenziffern — genau richtig für messwertlastige
  Reports.
- **Regel: nur `@apex/database` öffnet DB-Verbindungen.** Wird durch
  `packages/domain` gestärkt, nicht geschwächt.
