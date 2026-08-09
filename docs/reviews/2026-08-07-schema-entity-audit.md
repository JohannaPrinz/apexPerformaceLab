# Schema-Audit: Entität für Entität

> Datum: 2026-08-07 · Grundlage: [docs/domain/](../domain/)
>
> Geprüft je Entität: Verantwortlichkeit · Beziehungen · Kardinalitäten ·
> optionale Beziehungen · Lebenszyklus · Status · Indizes · Cascade/Restrict ·
> Unique Constraints · Begründung aus den Domain-Dokumenten.

> [!IMPORTANT]
> **Momentaufnahme vor den Korrekturen.** Alle vier Befunde sind inzwischen
> behoben; einzelne Zeilen der Entitätstabellen beschreiben daher nicht mehr den
> aktuellen Stand. Maßgeblich ist `packages/database/prisma/schema.prisma`.
>
> Die Analyse bleibt erhalten, weil sie die Begründungen enthält — die Befunde
> selbst sind erledigt.

## Was sich seither geändert hat

| Befund                                     | Auflösung                                                                                                                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1** Join-Tabellen ohne `organizationId` | Als dokumentierte Ausnahme im Schema-Kopf festgehalten, mit der Bedingung, dass eine Join-Tabelle mit eigenen Attributen sie verliert                                             |
| **B2** Benutzerlöschung blockiert          | Coach-Profil ist löschbar, aber **anonymisierend**: `deletedAt` neu, `userId` nullable, `User → Coach` auf `SetNull`. Die Zeile bleibt als Grabstein, Autorschaft bleibt erhalten |
| **B3** Uneinheitliche Coach-Verweise       | `Asset.uploadedByCoachId` und `VideoAnnotation.authorCoachId` auf `Restrict` — `NULL` behält seine Bedeutung                                                                      |
| **B4** Fehlende Indizes                    | Ergänzt, danach auf zusammengesetzte Indizes umgestellt                                                                                                                           |

**Zusätzlich beschlossen:**

- Zusammengesetzte Indizes `(organizationId, athleteId, …)` bei `Athlete`,
  `Asset`, `Note`, `Program`, `Appointment` — je ein Index weniger bei gleicher
  Abdeckung
- `Note.authorCoachId` ist nullable: `NULL` heißt, der Athlet hat geschrieben
- `Share` hat ein fünftes Ziel (`noteId`)
- `Appointment` nutzt die vollständige Kontextleiter
- `AssessmentModule.moduleVersion` für die Re-Renderbarkeit veröffentlichter Reports
- `CoachCredential` als eigenes Modell — bewusst kein `Asset`

---

## Zusammenfassung (Stand der Prüfung)

**24 Domänenmodelle geprüft, 4 Befunde.** Keiner davon blockiert die Migration;
zwei sollten vorher entschieden werden.

| #      | Befund                                                                                                                                                         | Schwere                 |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **B1** | `InsightEvidence` und `RecommendationInsight` tragen kein `organizationId` — die Kopfzeilen-Konvention fordert es für _jedes_ mandantenbezogene Modell         | Konvention vs. Realität |
| **B2** | `User` → `Coach` ist `Cascade`, `Coach` ← Case/Insight/Report/Note ist `Restrict`. Das Löschen eines Benutzers, der je etwas verfasst hat, ist damit blockiert | Entscheidung nötig      |
| **B3** | Coach-Verweise sind uneinheitlich: `Restrict` bei Autorschaft, `SetNull` bei Upload und Annotation                                                             | Asymmetrie              |
| **B4** | `Note` und `Program` fehlen die Indizes auf `assessmentId` / `assessmentModuleId`, die `Asset` hat                                                             | Performance             |

---

# Teil 1 — Entitäten

## Coach

| Dimension              | Befund                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verantwortlichkeit** | Fachliches Profil eines professionellen Nutzers (§6). Trägt Anzeigename, Berufsbezeichnung, Kurzprofil — keine Zugangsdaten.                        |
| **Beziehungen**        | → `User`, → `Organization`; ← `CoachCredential`, `PerformanceCase`, `Appointment`, `Insight`, `Report`, `Note`, `VideoAnnotation`, `Asset`, `Share` |
| **Kardinalitäten**     | `User` 1:n `Coach` (eine Person kann in mehreren Workspaces coachen) · `Organization` 1:n `Coach`                                                   |
| **Optional**           | Alle Profilfelder optional — ein Coach existiert schon durch die Verknüpfung                                                                        |
| **Lebenszyklus**       | Erstellt bei Workspace-Beitritt · `archivedAt` statt Löschung                                                                                       |
| **Status**             | Kein Enum. `archivedAt` als weiches Aus                                                                                                             |
| **Indizes**            | `@@index([organizationId])`                                                                                                                         |
| **Cascade**            | `User` Cascade, `Organization` Cascade — **siehe B2**                                                                                               |
| **Unique**             | `@@unique([organizationId, userId])` — eine Person, ein Profil je Workspace                                                                         |
| **Begründung**         | §6 trennt Profil von Auth; `Membership` trägt die Rolle, `Coach` das Profil (§26.22)                                                                |

## CoachCredential

| Dimension              | Befund                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verantwortlichkeit** | Qualifikationsnachweis — Lizenz, Zertifikat, Akkreditierung (§6)                                                                                        |
| **Beziehungen**        | → `Coach`, → `Organization`                                                                                                                             |
| **Kardinalitäten**     | `Coach` 1:n `CoachCredential`                                                                                                                           |
| **Optional**           | `issuer`, `issuedAt`, `expiresAt`, **und die gesamte Datei** — ein Coach darf eine Lizenz benennen, ohne sie hochzuladen                                |
| **Lebenszyklus**       | Frei änderbar; `expiresAt` = Gültigkeit, kein Statuswechsel                                                                                             |
| **Status**             | Keiner. Abgelaufen ist aus `expiresAt` ableitbar — dieselbe Logik wie beim Share                                                                        |
| **Indizes**            | `organizationId`, `coachId`                                                                                                                             |
| **Cascade**            | `Coach` Cascade — der Nachweis überlebt den Coach nicht                                                                                                 |
| **Unique**             | `storageKey` unique (nullable, mehrere NULLs erlaubt ✓)                                                                                                 |
| **Begründung**         | §6 — bewusst **kein** `Asset`: die Kontextleiter verankert jedes Asset an einem Athleten (§18), ein Coach-Zertifikat gehört auf keine Athleten-Timeline |

## Athlete

| Dimension              | Befund                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verantwortlichkeit** | Die betreute Person (§7). Zentrum der Kette.                                                                                                |
| **Beziehungen**        | → `Organization`, → `User` (optional); ← `PerformanceCase`, `Asset`, `Program`, `Note`, `Appointment`, `TimelineEntry`                      |
| **Kardinalitäten**     | `Organization` 1:n `Athlete` · `User` 1:**1** `Athlete`                                                                                     |
| **Optional**           | `userId`, `dateOfBirth`, `email`, `phone` — der Athlet existiert ohne Konto                                                                 |
| **Lebenszyklus**       | Erstellt durch Coach · Konto optional später verknüpfbar, ohne Migration (§21) · `archivedAt`, nie gelöscht                                 |
| **Status**             | Keiner. `archivedAt` genügt                                                                                                                 |
| **Indizes**            | `organizationId`; `(organizationId, lastName, firstName)` für die Roster-Sortierung                                                         |
| **Cascade**            | `Organization` Cascade · `User` **SetNull** — die Akte überlebt das Konto (§22)                                                             |
| **Unique**             | `userId` **global** unique                                                                                                                  |
| **Begründung**         | §7. Die globale Unique-Regel folgt aus „Identity is not shared across Workspaces": Wer von zwei Betrieben betreut wird, ist zwei Datensätze |

## PerformanceCase

| Dimension              | Befund                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Verantwortlichkeit** | Strukturgebende Klammer des Athletenverlaufs (§8)                                                                                 |
| **Beziehungen**        | → `Organization`, → `Athlete`, → `Coach` (Ersteller); ← `Goal`, `Assessment`, `Report`, `Asset`, `Program`, `Note`, `Appointment` |
| **Kardinalitäten**     | `Athlete` 1:n `Case` · `Case` 1:n `Assessment`                                                                                    |
| **Optional**           | `description`, `endedAt`                                                                                                          |
| **Lebenszyklus**       | Manuell **oder automatisch** erzeugt (§8) · `OPEN → CLOSED → ARCHIVED`, wiedereröffenbar solange nicht archiviert                 |
| **Status**             | `CaseStatus` + `CaseType` (`SINGLE_ASSESSMENT` \| `ONGOING`)                                                                      |
| **Indizes**            | `organizationId`; `(athleteId, status)` für „offene Cases dieses Athleten"; `createdByCoachId`                                    |
| **Cascade**            | `Athlete` Cascade · `Coach` **Restrict** — ein Coach mit Cases wird deaktiviert, nicht gelöscht                                   |
| **Unique**             | Keiner. Ein Athlet darf mehrere gleichnamige Cases haben                                                                          |
| **Begründung**         | §8. `createdByCoachId` statt `coachId`, weil §5 die Zuteilung verschiebt und §26.24 das Eigentum beim Workspace lässt             |

## Goal

| Dimension              | Befund                                                                          |
| ---------------------- | ------------------------------------------------------------------------------- |
| **Verantwortlichkeit** | Was ein Case erreichen soll (§9)                                                |
| **Beziehungen**        | → `Organization`, → `PerformanceCase`                                           |
| **Kardinalitäten**     | `Case` 1:n `Goal` — mehrere Ziele je Case                                       |
| **Optional**           | `targetDate`, `achievedAt`                                                      |
| **Lebenszyklus**       | Living Object (§4) · Erreicht = `achievedAt` gesetzt                            |
| **Status**             | Keiner. Zwei Zustände, ein Zeitstempel                                          |
| **Indizes**            | `organizationId`, `caseId`                                                      |
| **Cascade**            | `Case` Cascade — ein Ziel ohne Case ist bedeutungslos                           |
| **Unique**             | Keiner                                                                          |
| **Begründung**         | §9. Eigene Entität statt Skalar am Case, weil ein Case mehrere Ziele haben kann |

## Assessment

| Dimension              | Befund                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Verantwortlichkeit** | Die eigentliche Arbeitseinheit (§10) — Momentaufnahme zu einem Zeitpunkt                                                         |
| **Beziehungen**        | → `Organization`, → `PerformanceCase`; ← `AssessmentModule`, `Report`, `Asset`, `Program`, `Note`, `Appointment`                 |
| **Kardinalitäten**     | `Case` 1:n `Assessment` · `Assessment` 1:n `Module`                                                                              |
| **Optional**           | Nichts Fachliches. `question` ist **Pflicht**                                                                                    |
| **Lebenszyklus**       | Erstellt, mit Modulen befüllt · Kein eigener Statuswechsel — die Veröffentlichung geschieht am Report                            |
| **Status**             | Nur `AssessmentType` (Position im Verlauf, nie Inhalt)                                                                           |
| **Indizes**            | `organizationId`; `(caseId, performedAt)` für den chronologischen Vergleich                                                      |
| **Cascade**            | `Case` Cascade                                                                                                                   |
| **Unique**             | Keiner                                                                                                                           |
| **Begründung**         | §10. **Kein `athleteId`** — der Athlet wird über den Case abgeleitet (§26.4). `question` als Pflichtfeld erfüllt DOMAIN_RULES #6 |

## AssessmentModule

| Dimension              | Befund                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verantwortlichkeit** | Ein Modul innerhalb eines Assessments (§11). Container für Messwerte, Insights, Empfehlungen                                                             |
| **Beziehungen**        | → `Organization`, → `Assessment`; ← `Measurement`, `Insight`, `Recommendation`, `Report`, `Asset`, `Program`, `Note`, `Appointment`                      |
| **Kardinalitäten**     | `Assessment` 1:n `Module` · `Module` 1:n `Measurement`                                                                                                   |
| **Optional**           | `payload`                                                                                                                                                |
| **Lebenszyklus**       | Mit dem Assessment erstellt · friert faktisch mit dem Report ein                                                                                         |
| **Status**             | Keiner                                                                                                                                                   |
| **Indizes**            | `organizationId`, `moduleKey` (für modulübergreifende Auswertungen)                                                                                      |
| **Cascade**            | `Assessment` Cascade                                                                                                                                     |
| **Unique**             | `@@unique([assessmentId, moduleKey])` — ein Modul höchstens einmal je Assessment                                                                         |
| **Begründung**         | §11. `moduleKey` als **String, nie Enum** (DOMAIN_RULES #8) · `moduleVersion` auf der Zeile, damit ein veröffentlichter Report re-renderbar bleibt (§16) |

## MeasurementType

| Dimension              | Befund                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| **Verantwortlichkeit** | Wiederverwendbare Vorlage für objektive Messwerte (§12)                                          |
| **Beziehungen**        | → `Organization` (**optional**); ← `Measurement`                                                 |
| **Kardinalitäten**     | `Organization` 1:n `MeasurementType` · `Type` 1:n `Measurement`                                  |
| **Optional**           | `organizationId` = **Systemkatalog**, `referenceMin/Max`, `archivedAt`                           |
| **Lebenszyklus**       | Frei erweiterbar, nie gelöscht — `archivedAt`                                                    |
| **Status**             | Keiner                                                                                           |
| **Indizes**            | `organizationId`, `category`                                                                     |
| **Cascade**            | `Organization` Cascade — Workspace-Typen gehen mit, Systemtypen (`NULL`) bleiben                 |
| **Unique**             | `@@unique([organizationId, key])` — **plus** partieller Index für den Systemkatalog (Raw SQL #1) |
| **Begründung**         | §12. **Keine Seitigkeit** hier — „Griffkraft" ist links wie rechts derselbe Typ (§26.10)         |

## Measurement

| Dimension              | Befund                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verantwortlichkeit** | Der objektive Fakt (§13)                                                                                                                          |
| **Beziehungen**        | → `Organization`, → `AssessmentModule`, → `MeasurementType`, → `Measurement` (Korrektur); ← `InsightEvidence`                                     |
| **Kardinalitäten**     | `Module` 1:n `Measurement` · `Measurement` 1:1 `Measurement` (Ablösung)                                                                           |
| **Optional**           | Alle drei Wertspalten (genau eine gesetzt), `externalSystem`, `externalId`, `supersededById`                                                      |
| **Lebenszyklus**       | **Unveränderlich ab Erstellung.** Korrektur = neue Zeile, alte bleibt sichtbar                                                                    |
| **Status**             | Keiner. Abgelöst = `supersededById` gesetzt                                                                                                       |
| **Indizes**            | `organizationId`; `assessmentModuleId`; `(measurementTypeId, capturedAt)` für den Zeitreihenvergleich                                             |
| **Cascade**            | `Module` Cascade · `MeasurementType` **Restrict** — ein Typ mit Messwerten wird archiviert, nicht gelöscht · Korrekturkette SetNull               |
| **Unique**             | `supersededById` unique (1:1-Kette) · `@@unique([externalSystem, externalId])`                                                                    |
| **Begründung**         | §13, §4. **Kein `updatedAt`** — bewusst, ein Fakt wird nie geändert. Die externe Unique-Regel macht jeden Re-Import idempotent (DOMAIN_RULES #12) |

> **Geprüft:** Bei manueller Erfassung sind `externalSystem` und `externalId`
> beide NULL. Postgres behandelt NULLs in Unique-Constraints als verschieden —
> beliebig viele manuelle Messwerte sind also möglich. Der Constraint greift nur
> für echte Importe. ✓

## Insight

| Dimension              | Befund                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| **Verantwortlichkeit** | Fachliche Interpretation von Messwerten (§14)                                                           |
| **Beziehungen**        | → `Organization`, → `AssessmentModule`, → `Coach` (Autor); ← `InsightEvidence`, `RecommendationInsight` |
| **Kardinalitäten**     | `Module` 1:n `Insight` · `Insight` n:m `Recommendation`                                                 |
| **Optional**           | Nichts                                                                                                  |
| **Lebenszyklus**       | Änderbar solange der Report `DRAFT` ist · friert mit der Veröffentlichung ein (§4)                      |
| **Status**             | **Kein eigener** — §4: „no publication state of their own"                                              |
| **Indizes**            | `organizationId`, `assessmentModuleId`                                                                  |
| **Cascade**            | `Module` Cascade · `Coach` **Restrict**                                                                 |
| **Unique**             | Keiner                                                                                                  |
| **Begründung**         | §14. Hängt am Modul, nicht am Assessment (§3)                                                           |

## InsightEvidence

| Dimension              | Befund                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| **Verantwortlichkeit** | Verknüpfung zwischen Insight und Beleg. **Keine Entität** (§3)                                       |
| **Beziehungen**        | → `Insight`; → `Measurement` \| `Asset` \| `Note` (genau eines)                                      |
| **Kardinalitäten**     | `Insight` 1:n `Evidence`                                                                             |
| **Optional**           | Alle drei Ziele nullable — genau eines gesetzt (Raw SQL #3)                                          |
| **Lebenszyklus**       | Beim Verfassen des Insights erzeugt; nachträglich nicht rekonstruierbar                              |
| **Status**             | Keiner                                                                                               |
| **Indizes**            | `insightId`, `measurementId`, `assetId`, `noteId`                                                    |
| **Cascade**            | Alle Cascade — verschwindet der Beleg, verschwindet die Verknüpfung                                  |
| **Unique**             | Keiner — **siehe B1**                                                                                |
| **Begründung**         | §3, §14. Drei Spalten decken vier dokumentierte Ziele ab, weil Video und Document beide `Asset` sind |

## Recommendation

| Dimension              | Befund                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| **Verantwortlichkeit** | Das einzige Objekt für Maßnahmen (§15)                                                                    |
| **Beziehungen**        | → `Organization`, → `AssessmentModule`, → `Recommendation` (Ablösung); ← `RecommendationInsight`, `Share` |
| **Kardinalitäten**     | `Module` 1:n `Recommendation` · n:m `Insight` · 1:1 Ablösung                                              |
| **Optional**           | `body`, `dueDate`, `completedAt`, `supersededById`                                                        |
| **Lebenszyklus**       | Inhalt friert mit dem Report ein, **der Status nicht** (§4)                                               |
| **Status**             | `PROPOSED → ACCEPTED → IN_PROGRESS → DONE \| SKIPPED \| SUPERSEDED` + `assignee`                          |
| **Indizes**            | `organizationId`, `assessmentModuleId`, `(status, assignee)` für „offene Aufgaben des Athleten"           |
| **Cascade**            | `Module` Cascade · Ablösung SetNull                                                                       |
| **Unique**             | `supersededById` unique                                                                                   |
| **Begründung**         | §15. Task/Action/Intervention sind Zustände hier, keine Objekte (§3)                                      |

## RecommendationInsight

| Dimension              | Befund                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| **Verantwortlichkeit** | Reine Verbindungstabelle für „eine Empfehlung stützt sich auf ein oder mehrere Insights"              |
| **Beziehungen**        | → `Recommendation`, → `Insight`                                                                       |
| **Kardinalitäten**     | n:m                                                                                                   |
| **Optional**           | Nichts                                                                                                |
| **Lebenszyklus**       | Mit der Empfehlung                                                                                    |
| **Status**             | Keiner                                                                                                |
| **Indizes**            | `insightId` (die Gegenrichtung deckt der zusammengesetzte Primärschlüssel ab)                         |
| **Cascade**            | Beide Cascade                                                                                         |
| **Unique**             | `@@id([recommendationId, insightId])` — Doppelverknüpfung ausgeschlossen                              |
| **Begründung**         | §26.14. Das Minimum von **einem** Insight kann SQL nicht erzwingen → `packages/domain` — **siehe B1** |

## Report

| Dimension              | Befund                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verantwortlichkeit** | Fachliches Ergebnis zu einem Zeitpunkt (§16)                                                                                                |
| **Beziehungen**        | → `Organization`, → `Coach` (Autor); → `AssessmentModule` \| `Assessment` \| `PerformanceCase` (genau eines, passend zu `scope`); ← `Share` |
| **Kardinalitäten**     | Je Scope-Ziel 1:n (mehrere Versionen)                                                                                                       |
| **Optional**           | `content` (null solange `DRAFT`), `publishedAt`, `archivedAt`, zwei der drei Scope-Ziele                                                    |
| **Lebenszyklus**       | `DRAFT → PUBLISHED → ARCHIVED`. **Veröffentlichung ist der Sperrpunkt** und friert enthaltene Insights und Empfehlungen mit ein             |
| **Status**             | `ReportStatus` + `ReportScope` + `version`                                                                                                  |
| **Indizes**            | `(organizationId, status)` für „meine Entwürfe"; je Scope-Ziel                                                                              |
| **Cascade**            | Alle Scope-Ziele Cascade · `Coach` **Restrict**                                                                                             |
| **Unique**             | Prisma keiner — drei partielle Unique-Indizes je Scope-Ziel (Raw SQL #5)                                                                    |
| **Begründung**         | §16. Ein Objekt mit `scope` statt drei Tabellen (§2 „One Concept, One Object")                                                              |

## Share

| Dimension              | Befund                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Verantwortlichkeit** | Zugriff auf Inhalt — nie ein Status am Inhalt selbst (§17)                                                              |
| **Beziehungen**        | → `Organization`, → `Coach` (Ersteller); → `Report` \| `Asset` \| `Program` \| `Recommendation` \| `Note` (genau eines) |
| **Kardinalitäten**     | Eine Ressource n:1 `Share` — mehrere Empfänger unter verschiedenen Bedingungen                                          |
| **Optional**           | `passwordHash`, `expiresAt`, `revokedAt`, vier der fünf Ziele                                                           |
| **Lebenszyklus**       | `ACTIVE → EXPIRED`. Nie gelöscht — wer wann Zugriff hatte, gehört zur Nachvollziehbarkeit                               |
| **Status**             | **Keine Spalte.** Abgeleitet aus `revokedAt` / `expiresAt` — zwei Ursachen, ein Endzustand                              |
| **Indizes**            | `organizationId` + je Ziel · `token` unique = Index für den heißen Pfad                                                 |
| **Cascade**            | Alle Ziele Cascade · `Coach` **Restrict**                                                                               |
| **Unique**             | `token` global unique                                                                                                   |
| **Begründung**         | §17. Getrennt vom Report, weil eine Ressource an mehrere Empfänger mit unterschiedlicher Laufzeit gehen können muss     |

## Asset

| Dimension              | Befund                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verantwortlichkeit** | Hochgeladene Datei — Document, Video oder Image (§18)                                                                                                           |
| **Beziehungen**        | → `Organization`, Kontextleiter (`Athlete` → `Case` → `Assessment` → `Module`), → `Coach` (Uploader, optional); ← `VideoAnnotation`, `InsightEvidence`, `Share` |
| **Kardinalitäten**     | `Athlete` 1:n `Asset`                                                                                                                                           |
| **Optional**           | Alle Leiterstufen außer `athleteId`; `durationMs` (nur Video); `uploadedByCoachId` (**null = Athlet hat hochgeladen**)                                          |
| **Lebenszyklus**       | Living Object · `archivedAt`                                                                                                                                    |
| **Status**             | Nur `kind`                                                                                                                                                      |
| **Indizes**            | `organizationId`; `(athleteId, kind)`; je Leiterstufe                                                                                                           |
| **Cascade**            | `Athlete` Cascade · Leiterstufen **SetNull** — ein archivierter Case entwertet kein Dokument · `Coach` SetNull — **siehe B3**                                   |
| **Unique**             | `storageKey` unique — zwei Zeilen dürfen nie auf dasselbe Objekt zeigen                                                                                         |
| **Begründung**         | §18. Eine Tabelle für zwei Domänenobjekte, weil sie Upload, Ablage und Kontext teilen — nach dem Muster „Personal Workspace ist intern eine Organization" (§5)  |

## VideoAnnotation

| Dimension              | Befund                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Verantwortlichkeit** | Kommentar an einem Zeitpunkt im Video (§18)                                                                                       |
| **Beziehungen**        | → `Organization`, → `Asset`, → `Coach` (optional)                                                                                 |
| **Kardinalitäten**     | `Asset` 1:n `VideoAnnotation`                                                                                                     |
| **Optional**           | `authorCoachId` — **null = KI-erzeugt**                                                                                           |
| **Lebenszyklus**       | Living Object                                                                                                                     |
| **Status**             | Keiner                                                                                                                            |
| **Indizes**            | `organizationId`; `(assetId, timestampMs)` für die Wiedergabe in Reihenfolge                                                      |
| **Cascade**            | `Asset` Cascade · `Coach` SetNull — **siehe B3**                                                                                  |
| **Unique**             | Keiner                                                                                                                            |
| **Begründung**         | §18, §24 — KI-Ausgabe braucht weiterhin Coach-Freigabe. **Nur gültig für `kind = VIDEO`**, per Raw SQL nicht prüfbar (Raw SQL #7) |

## Program

| Dimension              | Befund                                                                          |
| ---------------------- | ------------------------------------------------------------------------------- |
| **Verantwortlichkeit** | Strukturierter Trainingsplan, im System erstellt (§19)                          |
| **Beziehungen**        | → `Organization`, Kontextleiter; ← `Share`                                      |
| **Kardinalitäten**     | `Athlete` 1:n `Program`                                                         |
| **Optional**           | `content`, alle Leiterstufen außer `athleteId`, `archivedAt`                    |
| **Lebenszyklus**       | Living Object — entwickelt sich weiter, unabhängig von veröffentlichten Reports |
| **Status**             | Keiner                                                                          |
| **Indizes**            | `organizationId`, `athleteId`, `caseId` — **siehe B4**                          |
| **Cascade**            | `Athlete` Cascade · Leiterstufen SetNull                                        |
| **Unique**             | Keiner                                                                          |
| **Begründung**         | §19. Abgrenzung zum hochgeladenen PDF ist die Urheberschaft, nicht der Inhalt   |

## Note

| Dimension              | Befund                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| **Verantwortlichkeit** | Freier Coach-Text (§20)                                                                                   |
| **Beziehungen**        | → `Organization`, → `Coach` (Autor), Kontextleiter **plus `appointmentId`**; ← `InsightEvidence`, `Share` |
| **Kardinalitäten**     | `Athlete` 1:n `Note`                                                                                      |
| **Optional**           | Alle Leiterstufen außer `athleteId`; `appointmentId`                                                      |
| **Lebenszyklus**       | Living Object · **immer optional** — kein Ablauf verlangt eine Notiz                                      |
| **Status**             | Keiner. Sichtbarkeit steuert der Share                                                                    |
| **Indizes**            | `organizationId`, `athleteId`, `caseId`, `appointmentId` — **siehe B4**                                   |
| **Cascade**            | `Athlete` Cascade · `Coach` **Restrict** · Leiterstufen und Termin SetNull                                |
| **Unique**             | Keiner                                                                                                    |
| **Begründung**         | §20. Fünfte Leiterstufe nur hier: Besprochenes gehört zum Termin. Teilbar seit §17/§20                    |

## Appointment

| Dimension              | Befund                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Verantwortlichkeit** | Geplantes Ereignis, einschließlich Wettkämpfen (§20)                                                                     |
| **Beziehungen**        | → `Organization`, → `Coach` (Ersteller), Kontextleiter; ← `Note`                                                         |
| **Kardinalitäten**     | `Athlete` 1:n `Appointment`                                                                                              |
| **Optional**           | `endsAt`, `location`, `meetingUrl`, alle Leiterstufen außer `athleteId`                                                  |
| **Lebenszyklus**       | Living Object                                                                                                            |
| **Status**             | Nur `AppointmentType` (7 Werte, deckt alle Beispiele aus §20 ab)                                                         |
| **Indizes**            | `organizationId`; `(athleteId, startsAt)` für die Kalenderansicht; `caseId`, `assessmentId`                              |
| **Cascade**            | `Athlete` Cascade · `Coach` **Restrict** · Leiterstufen SetNull                                                          |
| **Unique**             | Keiner                                                                                                                   |
| **Begründung**         | §20. `caseId` **optional**, weil ein Eingangsgespräch vor jedem Case stattfindet. Wettkampf als Typ statt eigenes Objekt |

## TimelineEntry

| Dimension              | Befund                                                                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verantwortlichkeit** | Projektion über alle Domänenobjekte (§22) — nie zweite Wahrheit                                                                                                                        |
| **Beziehungen**        | → `Organization`, → `Athlete`; `kind` + `refId` **ohne** Fremdschlüssel                                                                                                                |
| **Kardinalitäten**     | `Athlete` 1:n `TimelineEntry`                                                                                                                                                          |
| **Optional**           | Nichts                                                                                                                                                                                 |
| **Lebenszyklus**       | Aus den Domänenobjekten jederzeit neu aufbaubar                                                                                                                                        |
| **Status**             | Nur `kind`                                                                                                                                                                             |
| **Indizes**            | `organizationId`; `(athleteId, occurredAt)` — der einzige Abfragepfad                                                                                                                  |
| **Cascade**            | `Athlete` Cascade                                                                                                                                                                      |
| **Unique**             | `@@unique([kind, refId])` — ein Eintrag je Domänenobjekt                                                                                                                               |
| **Begründung**         | §22. Polymorpher Verweis bewusst ohne FK: Integrität kommt aus dem Neuaufbau, nicht aus dem Constraint. Existiert, damit `athleteId` nicht auf jede Tabelle denormalisiert werden muss |

---

# Teil 2 — Befunde

## B1 · Reine Verbindungstabellen ohne `organizationId`

Der Schema-Kopf sagt absolut:

> Every tenant-scoped model MUST hold an `organizationId` field […] and declare
> `@@index([organizationId])`.

`InsightEvidence` und `RecommendationInsight` tun das nicht.

**Bewertung:** fachlich vertretbar. Beide sind reine Verbindungen ohne eigene
Attribute und werden nie eigenständig abgefragt — der Zugriff läuft immer über
den Insight bzw. die Empfehlung, die beide `organizationId` tragen. Ein
Mandantenwechsel über die Verbindungstabelle ist nicht erreichbar.

**Aber:** Die Konvention ist als Ausnahmslosigkeit formuliert. Entweder die
beiden Spalten ergänzen, oder den Kopfkommentar um einen Satz erweitern.

**Empfehlung:** Kommentar erweitern. Zwei zusätzliche Spalten plus Indizes auf
Tabellen, die nur über ihren Elternteil erreichbar sind, kosten Schreibaufwand
ohne Sicherheitsgewinn.

## B2 · Benutzerlöschung ist für Coaches blockiert

```
User --Cascade--> Coach --Restrict--> PerformanceCase, Insight, Report, Note
```

Ein `DELETE` auf `User` versucht per Cascade den `Coach` zu löschen; dessen
`Restrict`-Beziehungen blockieren das. **Nettoeffekt: Der Benutzer lässt sich
nicht löschen, sobald der Coach je einen Case, Insight, Report oder eine Notiz
angelegt hat.**

Das ist inhaltlich vermutlich richtig — die wissenschaftliche Nachvollziehbarkeit
verlangt, dass Autorschaft erhalten bleibt. Aber es kollidiert mit dem
DSGVO-Löschanspruch eines Coaches und **es ist nirgends entschieden worden**.

**Zu klären:** Soll ein Coach überhaupt löschbar sein, oder ist `archivedAt` der
einzige Weg? Wenn Letzteres: Der `Cascade` von `User` auf `Coach` sollte zu
`Restrict` werden, damit der Fehler beim Löschversuch verständlich ist statt
über zwei Ebenen hinweg.

## B3 · Coach-Verweise sind uneinheitlich

| Verweis                            | Verhalten   |
| ---------------------------------- | ----------- |
| `PerformanceCase.createdByCoachId` | Restrict    |
| `Insight.authorCoachId`            | Restrict    |
| `Report.authorCoachId`             | Restrict    |
| `Note.authorCoachId`               | Restrict    |
| `Appointment.createdByCoachId`     | Restrict    |
| `Share.createdByCoachId`           | Restrict    |
| `Asset.uploadedByCoachId`          | **SetNull** |
| `VideoAnnotation.authorCoachId`    | **SetNull** |

Die beiden SetNull-Fälle sind nicht willkürlich: Bei `Asset` bedeutet `null`
bereits „vom Athleten hochgeladen", bei `VideoAnnotation` „von der KI erzeugt".
Ein SetNull würde diese Bedeutung fälschen — ein gelöschter Coach sähe aus wie
ein Athlet bzw. wie die KI.

**Empfehlung:** beide auf `Restrict`. Dann bleibt `null` eindeutig, und die
Löschregel ist über alle Coach-Verweise dieselbe. Hängt an B2.

## B4 · Fehlende Indizes auf der Kontextleiter

| Modell        | organizationId | athleteId | caseId | assessmentId | assessmentModuleId |
| ------------- | -------------- | --------- | ------ | ------------ | ------------------ |
| `Asset`       | ✓              | ✓         | ✓      | ✓            | ✓                  |
| `Program`     | ✓              | ✓         | ✓      | ✗            | ✗                  |
| `Note`        | ✓              | ✓         | ✓      | ✗            | ✗                  |
| `Appointment` | ✓              | ✓         | ✓      | ✓            | ✗                  |

„Alle Notizen zu diesem Assessment" ist ein Standardaufruf in der
Assessment-Ansicht und läuft heute als Sequential Scan.

**Empfehlung:** `assessmentId` auf `Program`, `Note` und `Appointment`
ergänzen. `assessmentModuleId` bei `Note` ebenfalls — Modulnotizen erscheinen im
Modul-Report. Bei `Program` und `Appointment` ist die Modulstufe unwahrscheinlich
genug, um sie wegzulassen.

---

# Teil 3 — Anlagereihenfolge

Prisma ist deklarationsunabhängig — für die **Datei** spielt die Reihenfolge
keine Rolle. Sie spielt eine Rolle für Seeds, Fixtures und für das Verständnis
der Abhängigkeiten. Das Folgende ist die topologische Ordnung: Jede Stufe darf
nur auf Stufen darüber verweisen.

### Stufe 0 — ohne Abhängigkeiten

| #   | Modell            | Warum hier                                                            |
| --- | ----------------- | --------------------------------------------------------------------- |
| 1   | `Organization`    | Der Mandant. Alles hängt daran                                        |
| 2   | `User`            | Identität, unabhängig von der Domäne                                  |
| 3   | `MeasurementType` | Systemkatalog (`organizationId = null`) existiert vor jedem Workspace |

### Stufe 1 — Identität und Mandant

| #   | Modell                               | Abhängig von           |
| --- | ------------------------------------ | ---------------------- |
| 4   | `Session`, `Account`, `Verification` | `User`                 |
| 5   | `Membership`                         | `User`, `Organization` |
| 6   | `Invitation`                         | `User`, `Organization` |

### Stufe 2 — Akteure

| #   | Modell            | Abhängig von                    |
| --- | ----------------- | ------------------------------- |
| 7   | `Coach`           | `User`, `Organization`          |
| 8   | `CoachCredential` | `Coach`                         |
| 9   | `Athlete`         | `Organization`, optional `User` |

### Stufe 3 — die Kette

| #   | Modell             | Abhängig von       |
| --- | ------------------ | ------------------ |
| 10  | `PerformanceCase`  | `Athlete`, `Coach` |
| 11  | `Goal`             | `PerformanceCase`  |
| 12  | `Assessment`       | `PerformanceCase`  |
| 13  | `AssessmentModule` | `Assessment`       |

### Stufe 4 — Modulinhalt

| #   | Modell                  | Abhängig von                          |
| --- | ----------------------- | ------------------------------------- |
| 14  | `Measurement`           | `AssessmentModule`, `MeasurementType` |
| 15  | `Insight`               | `AssessmentModule`, `Coach`           |
| 16  | `Recommendation`        | `AssessmentModule`                    |
| 17  | `RecommendationInsight` | `Recommendation`, `Insight`           |

### Stufe 5 — Kontextleiter

Reihenfolge innerhalb der Stufe ist relevant: `Note` verweist auf `Appointment`.

| #   | Modell        | Abhängig von                                                    |
| --- | ------------- | --------------------------------------------------------------- |
| 18  | `Appointment` | `Athlete`, `Coach`, optional Leiter                             |
| 19  | `Asset`       | `Athlete`, optional Leiter, optional `Coach`                    |
| 20  | `Program`     | `Athlete`, optional Leiter                                      |
| 21  | `Note`        | `Athlete`, `Coach`, optional Leiter, **optional `Appointment`** |

### Stufe 6 — Querverweise

| #   | Modell            | Abhängig von                                                             |
| --- | ----------------- | ------------------------------------------------------------------------ |
| 22  | `VideoAnnotation` | `Asset`, optional `Coach`                                                |
| 23  | `InsightEvidence` | `Insight` + `Measurement` \| `Asset` \| `Note`                           |
| 24  | `Report`          | `Coach` + `AssessmentModule` \| `Assessment` \| `PerformanceCase`        |
| 25  | `Share`           | `Coach` + `Report` \| `Asset` \| `Program` \| `Recommendation` \| `Note` |
| 26  | `TimelineEntry`   | `Athlete` (Projektion, zuletzt)                                          |

### Zur Dateireihenfolge

Die Datei ist aktuell **thematisch** gruppiert (Coach & Athlete · Case & Goal ·
Assessment & Module · …), nicht topologisch. An drei Stellen weicht sie ab:
`InsightEvidence` steht vor `Asset` und `Note`, `Share` vor seinen Zielen,
`Note` vor `Appointment`.

**Empfehlung: so lassen.** Die thematische Gruppierung folgt der Domäne und
damit den Dokumenten; die topologische Ordnung ist für Prisma bedeutungslos und
wird nur beim Seeding gebraucht — dort steht sie jetzt hier.
