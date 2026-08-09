# Domain-Konsistenzprüfung — Durchgang 2

> Datum: 2026-08-07 · **Kein Code und keine Dokumente geändert.**
>
> Geändert seit Durchgang 1: `DOMAIN_DECISIONS` (+1.460 B), `DOMAIN_RULES` (+132 B),
> `CORE_OBJECTS` (+773 B). Unverändert: `DOMAIN_VISION`, `USER_FLOWS`.

---

## Ergebnis

**3 von 4 Blockern gelöst. 1 hat sich verschlechtert.**

| Blocker                                         | Status                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| **B1** Performance Case existiert?              | ✅ **gelöst** — Case ist wieder Kernobjekt                              |
| **B2** Report-Immutability: publish oder share? | ❌ **verschlechtert** — jetzt _innerhalb_ von DECISIONS widersprüchlich |
| **B3** Vier Modul-Listen                        | 🟡 **fachlich gelöst, nicht propagiert**                                |
| **B4** Document / Video / Program               | ✅ **gelöst** — saubere Trennung                                        |

Die Klarstellung in `DOMAIN_DECISIONS` §8, dass **Geräte­hersteller keine Module,
sondern Datenquellen** sind, ist die wichtigste inhaltliche Verbesserung dieses
Durchgangs. Sie beseitigt die schwerwiegendste Taxonomie-Schwäche.

Der Preis: `DOMAIN_DECISIONS` wurde an mehreren Stellen ergänzt, ohne die
jeweils korrespondierenden Stellen im selben Dokument nachzuziehen. Dadurch sind
**sechs neue interne Widersprüche** entstanden. `DOMAIN_RULES` und
`CORE_OBJECTS` hinken der neuen Fassung an vier Stellen hinterher.

**Neue Bilanz: 1 Blocker · 3 undefinierte Kernobjekte · 11 Inkonsistenzen · 13 formale Mängel.**

---

# BLOCKER

## B2 · Report-Immutability — jetzt vier Aussagen, zwei Auslöser

Der Auslöser wurde in §12 von _published_ auf _shared_ geändert, aber die drei
anderen Stellen im selben Dokument blieben auf _published_.

**Innerhalb von `DOMAIN_DECISIONS`:**

| Zeile                  | Aussage                                                   | Auslöser  |
| ---------------------- | --------------------------------------------------------- | --------- |
| §12 :412               | _„Reports become immutable once **shared**."_             | shared    |
| §12 :414-421           | `Draft → Published → **Shared (immutable)** → Archived`   | shared    |
| §2 :66                 | _„A **published** report never changes retrospectively."_ | published |
| Immutable Objects :118 | _„**Published** Reports"_                                 | published |
| §17.9 :607             | _„Reports are immutable after **publication**."_          | published |

**Und innerhalb von `DOMAIN_RULES` #17 — drei Zeilen, die sich gegenseitig aufheben:**

```
:237   Once a Report is shared with an Athlete, it becomes immutable.
:239   Shared Reports only control visibility.
:241   Sharing never changes report content.
```

Zeile 239–241 sagt: Teilen ist reine Sichtbarkeitssteuerung ohne inhaltliche
Wirkung. Zeile 237 sagt: Teilen bewirkt Unveränderlichkeit — also sehr wohl eine
inhaltliche Wirkung. Beides gleichzeitig ist nicht haltbar.

**Warum weiterhin blockierend**

Der Zustand `Published` hat unter der neuen Fassung **keine Semantik mehr**. Er
sperrt nicht (das tut `Shared`) und steuert keine Sichtbarkeit (das tut ebenfalls
`Shared`). Damit ist offen:

- Was passiert beim Übergang `Draft → Published`, wenn er nichts bewirkt?
- Ein Report wird veröffentlicht, aber nie geteilt — bleibt er dauerhaft
  änderbar? Dann widerspricht das §2 („Reports are Snapshots") und §17.9.
- `Immutable Objects` nennt zusätzlich _„Published Insights"_ und _„Published
  Recommendations"_. Für Insights und Recommendations ist **nirgends ein
  Publish-Zustand definiert** — nur Reports haben eine Statuskette. Was
  veröffentlicht ein Insight?

**Entscheidung nötig** — genau eine der beiden Varianten, dann alle fünf Stellen
angleichen:

| Variante | Sperrpunkt                                    | Konsequenz                                                                                                                                                                                                      |
| -------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A**    | `PUBLISHED` sperrt, `SHARED` nur Sichtbarkeit | §12 und RULES #17 anpassen. Passt zu §2, Immutable Objects, §17.9 und zu RULES #17:239-241. **Empfohlen** — drei von vier Stellen sagen das bereits, und ein separater Sichtbarkeitsschalter ist ohnehin nötig. |
| **B**    | `SHARED` sperrt                               | §2, Immutable Objects, §17.9 und RULES #17:239-241 anpassen. Zusätzlich muss definiert werden, was `Published` dann überhaupt bedeutet.                                                                         |

Zusätzlich zu klären: Statuskette für Insight und Recommendation, oder deren
Streichung aus `Immutable Objects`.

---

# NEU ENTSTANDENE WIDERSPRÜCHE

Alle sechs stammen aus Ergänzungen, bei denen die korrespondierende Stelle nicht
nachgezogen wurde.

## N1 · Performance Case ist Kernobjekt ohne Definition

`DOMAIN_DECISIONS` §3 listet `Performance Case` jetzt korrekt als Kernobjekt —
aber das Dokument enthält **keinen Abschnitt, der ihn definiert**. Von sechzehn
gelisteten Kernobjekten haben dreizehn einen eigenen Abschnitt; `Performance
Case`, `Evidence` und `Task` nicht.

Für einen Case existiert damit im maßgeblichen Dokument keine Aussage zu Feldern,
Status oder Lebenszyklus. Diese stehen nur in `CORE_OBJECTS` (:83-101) — einem
Dokument, das laut Kopfzeile keine Autorität beansprucht.

## N2 · §7 und §17 widersprechen sich zum Assessment

| Fundstelle | Aussage                                                           |
| ---------- | ----------------------------------------------------------------- |
| §7 :251    | _„Every Assessment belongs to exactly one **Performance Case**."_ |
| §7 :253    | _„Every Assessment belongs to exactly one **Athlete**."_          |
| §17.2 :593 | _„Every Assessment belongs to exactly one **Athlete**."_          |

§7 wurde um den Case ergänzt, die Regelliste §17 nicht. Zusätzlich stehen in §7
beide Sätze unverbunden nebeneinander: Ist die Athleten-Bindung eine **direkte**
Beziehung oder eine **über den Case abgeleitete**?

`DOMAIN_RULES` #15 (_„Derive instead of duplicate"_) verlangt Ableitung; #3
(_„Through the Module it belongs to … one Performance Case and one Athlete"_)
beschreibt sie auch so. §7 :253 liest sich dagegen wie ein zweiter
Fremdschlüssel. Das ist genau die Stelle, an der im Schema ein denormalisiertes
`athleteId` entsteht — bewusst oder versehentlich.

## N3 · „Videos are not Documents" — aber Videos stehen in der Dokumentliste

`DOMAIN_DECISIONS` §13 :473: _„Videos are **not** Documents although they share
similar upload workflows."_
`DOMAIN_DECISIONS` §13 :437: Beispiele für Documents: _„**Videos**, Images, PDFs, …"_

Die Beispielliste wurde beim Einfügen des Video-Abschnitts nicht bereinigt.

## N4 · Evidence und Task: aus „undefiniert" wurde „verpflichtend und undefiniert"

Beide sind neu in §3 Core Objects aufgenommen — ohne Definition:

- **Evidence** erscheint ausschließlich in der Objektliste. Kein Abschnitt, keine
  Erwähnung in §10 (Insights). §10 sagt weiterhin nur _„Insights may use one or
  many **Measurements**"_ — womit offenbleibt, ob Evidence ein eigenes Objekt
  zwischen Measurement und Insight ist oder ein Sammelbegriff. Für
  Bewegungs-Insights ist die Frage entscheidend: Ein Video ist Evidenz, aber kein
  Measurement.
- **Task** erscheint in §3, in `Living Objects` und in §14 (_„complete Tasks"_) —
  ohne Definition. Das Verhältnis zu `Recommendation` bleibt offen (siehe I4).

Vorher waren beide unbenannte Lücken. Jetzt sind es benannte Pflichtobjekte ohne
Inhalt — das ist für die Modellierung schlechter, weil sie im Schema auftauchen
müssen.

## N5 · „It is not part of the MVP" — Bezug verloren

`DOMAIN_DECISIONS` §8:

```
:314   License information is reserved for future subscription models.
:316   Device manufacturers and external systems (e.g. VALD, MYOACT, Garmin,
       Polar) are not Modules.
:317   They are data sources.
:318   Measurements originating from external systems are assigned to the
       appropriate Module.
:320   It is not part of the MVP.
```

Der Absatz 316–318 wurde zwischen die Lizenz-Aussage (314) und ihren Nachsatz
(320) eingeschoben. Dadurch bezieht sich „It" jetzt grammatisch auf die
Datenquellen-Regel — was bedeuten würde, dass Geräte­integrationen nicht
MVP-relevant sind. Gemeint ist ersichtlich die Lizenzstufe.

## N6 · Zwei verschiedene Measurement-Type-Definitionen in `CORE_OBJECTS`

| Fundstelle                         | Felder                                                                |
| ---------------------------------- | --------------------------------------------------------------------- |
| :150-163 „# Measurment Types"      | Name, Einheit, Werttyp, **Kategorie**, **Referenzbereich (optional)** |
| :189-195 innerhalb „# Measurement" | Name, Einheit, Werttyp                                                |

Der neue Abschnitt wurde ergänzt, die alte Definition im Measurement-Abschnitt
nicht entfernt. Zwei Definitionen desselben Konzepts mit unterschiedlichem
Feldumfang — direkter Verstoß gegen `DOMAIN_RULES` #15.

Zusätzlich steht die Aussage _„Measurements sind Instanzen von Messungstypen"_
(:170) und _„Messwerte sind Instanzen vordefinierter Messwerttypen"_ (:189)
doppelt, mit zwei verschiedenen deutschen Begriffen für dasselbe
(_Messungstyp_ / _Messwerttyp_).

---

# NICHT PROPAGIERT

`DOMAIN_DECISIONS` ist an diesen vier Stellen aktualisiert worden,
`DOMAIN_RULES` und `CORE_OBJECTS` nicht.

## P1 · VALD, MYOACT und Video stehen weiterhin als Module

| Dokument                   | Modul-Liste                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DOMAIN_DECISIONS` §8      | Running, Strength, Movement, Mobility, Lactate, Body Composition, Nutrition, Recovery, Sleep, Cycle, Custom **(11)** — ausdrücklich **ohne** Gerätehersteller |
| `DOMAIN_RULES` #8 :117-127 | Running, Strength, Mobility, Movement, Lactate, **Video**, Nutrition, Recovery, Cycle, **VALD**, **MYOACT** **(11)** — ohne Body Composition, Sleep, Custom   |
| `CORE_OBJECTS` :131-144    | zusätzlich **HYROX**, **Video**, **VALD**, **MYOACT**, Custom **(14)**                                                                                        |
| `DOMAIN_VISION` :64-77     | identisch zu `CORE_OBJECTS` **(14)**                                                                                                                          |

Drei von vier Dokumenten führen weiterhin genau das als Modul, was
`DOMAIN_DECISIONS` §8 :316 nun ausdrücklich ausschließt. Da der Modulname der
Registry-Schlüssel ist, muss genau eine Liste gelten.

**Zusätzlich ungeklärt:** _HYROX_ steht nur in `CORE_OBJECTS`/`DOMAIN_VISION`.
HYROX ist eine **Wettkampfformat**, kein Analysebereich — dieselbe
Kategorienverwechslung wie bei VALD, nur auf der Sport-Achse statt der
Geräte-Achse. Ein HYROX-Assessment ist fachlich eine Kombination aus _Running_,
_Strength_ und _Movement_.

## P2 · Dokumentzuordnung an Portal-Zugang geknüpft

`CORE_OBJECTS` :308: _„Dokumente können allgemein einem Athleten **(wenn
Plattform-Zugang vorhanden)**, einem Case oder Assessment zugeordnet werden."_

`DOMAIN_DECISIONS` §13 :427: _„Documents belong to an Athlete."_ — ohne Bedingung.

Die Einschränkung widerspricht dem tragenden Prinzip aus §6, §14 und
`DOMAIN_RULES` #16: Ein Athlet existiert unabhängig von einem Benutzerkonto.
Ein Arztbefund muss auch für einen Athleten ohne Portal ablegbar sein — das ist
der Standardfall („Shared Access (Default)").

## P3 · Video-Zuordnung: Modul fehlt

`DOMAIN_DECISIONS` §13 :459-464: Athlete, Performance Case, Assessment, **Module**
`CORE_OBJECTS` :325-331: Athlete, Performance Case, Assessment — **ohne Modul**

## P4 · Measurement-Kontext unvollständig

`DOMAIN_RULES` #3 :35-41: Athlete, **Performance Case**, Assessment, Module, **Timestamp** — plus neu :34 _„Every Measurement belongs to a Measurement Type."_
`DOMAIN_DECISIONS` §9 :358-362: _„one Athlete, one Assessment, one Module"_ — ohne Case, ohne Timestamp, ohne Measurement Type

---

# WEITERHIN OFFEN

Aus Durchgang 1, unverändert.

| #       | Thema                                                     | Kern                                                                                                                                                                                                                                                                                                                                                          |
| ------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I1**  | **Question**                                              | `DOMAIN_RULES` #6 erklärt sie für jedes Assessment verpflichtend, #14 stellt sie an den Anfang der Kette. Weiterhin **kein Feld** — weder in `CORE_OBJECTS` §Assessment noch `DECISIONS` §7, und nicht in §3 Core Objects.                                                                                                                                    |
| **I2**  | **Seitigkeit (links/rechts)**                             | `CORE_OBJECTS` :205 zeigt _„Links = 51 kg"_. Measurement Type definiert Name/Einheit/Werttyp/Kategorie/Referenzbereich — **kein Seitenfeld**. `DECISIONS` §10 nennt _„Left/right imbalance"_ als Insight-Beispiel, ist also zwingend. Gehört ans Measurement, nicht an den Typ — derselbe Typ gilt beidseitig.                                                |
| **I3**  | **Goal, Appointment, Follow-Up, Note**                    | Vier Objekte mit eigenen Abschnitten bzw. User-Flows, keines in `DECISIONS` §3 Core Objects. `Note` erscheint nur in `Living Objects`; `CORE_OBJECTS` :98 vermischt es weiterhin als _„Empfehlungen/Notizen"_ mit einem regelgebundenen Objekt.                                                                                                               |
| **I4**  | **Action / Intervention / Maßnahme / Task**               | `DECISIONS` §2 + §11 setzen Recommendation = Action. `DOMAIN_RULES` #5 stellt Action **nach** Recommendation als eigenen Schritt, #14 nennt denselben Schritt _Intervention_. `CORE_OBJECTS` :266-267 listet _„Empfehlungen"_ und _„Maßnahmen"_ im Report getrennt. Jetzt zusätzlich `Task` als Kernobjekt. Fünf Begriffe, ungeklärt ob ein Objekt oder zwei. |
| **I5**  | **Report-Ebenen: jetzt drei**                             | Durch die Wiederaufnahme des Case entstehen drei Aggregationsstufen: `Module Report` → `Assessment Report` (`DECISIONS` §12) → `Case Summary Report` (`CORE_OBJECTS` :274, _optional_). **Kein Dokument beschreibt alle drei.** `DECISIONS` §12 kennt Case Summary nicht; `CORE_OBJECTS` kennt Assessment Report nicht.                                       |
| **I6**  | **„Report ist das Ergebnis eines Cases" — aber optional** | `CORE_OBJECTS` :247 erklärt den Report zum Ergebnis des Case; das Objekt aggregiert aber nur ein Modul, und die case-weite Zusammenfassung ist :276 ausdrücklich _optional_.                                                                                                                                                                                  |
| **I7**  | **Athletenbesitz: Coach oder Workspace?**                 | `CORE_OBJECTS` :47 _„Ein Coach kann beliebig viele Athleten besitzen"_ vs. `DECISIONS` §4 (Workspace mit mehreren Coaches). `DECISIONS` §17.1 _„Every Athlete exists exactly once"_ — Geltungsbereich weiterhin offen (je Workspace oder global?). Bei global entstünde mandantenübergreifende Identität.                                                     |
| **I8**  | **Immutability vs. Statusänderung**                       | `CORE_OBJECTS` :241: Empfehlungen als _erledigt/übersprungen/ersetzt_ markierbar. `DECISIONS` `Immutable Objects`: _„Published Recommendations"_. `USER_FLOWS` #3 _„Update Insights → Update Recommendations"_, #8 _„Adjust Recommendations"_. Statusfeld müsste ausdrücklich ausgenommen werden.                                                             |
| **I9**  | **Kollaboration**                                         | `DOMAIN_VISION` :136 _„Coach und Athlet können gemeinsam an einem Assessment arbeiten"_ vs. `DECISIONS` §14: Athlet darf ansehen und hochladen, _„cannot edit information"_.                                                                                                                                                                                  |
| **I10** | **Organization: MVP oder Zukunft?**                       | `DECISIONS` §4 (Workspace **ist** eine Organization, MVP) vs. §16 (_„Organizations"_ als künftige Architektur).                                                                                                                                                                                                                                               |
| **I11** | **Assessment-Beispiele mischen zwei Dimensionen**         | `CORE_OBJECTS` :113-117: _Initial Assessment_ / _Re-Assessment_ (Verlaufsposition) neben _Laktattest_ / _Bewegungsanalyse_ / _Running Assessment_ (Inhalt). Der Inhalt ergibt sich bereits aus den Modulen.                                                                                                                                                   |

---

# FORMALE MÄNGEL

Aus Durchgang 1 unverändert offen — plus vier neue.

| #       | Fundstelle                                   | Mangel                                                                                                                                                                                 | Status  |
| ------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| F1      | Dateiname `DOMAIN_DESICIONS.md`              | Tippfehler, muss `DOMAIN_DECISIONS.md` heißen (H1 im Dokument ist korrekt)                                                                                                             | offen   |
| F2      | `DOMAIN_RULES.md` :1                         | Titel `# AI_RULES.md` — Datei heißt `DOMAIN_RULES.md`                                                                                                                                  | offen   |
| F3      | `CORE_OBJECTS.md` :147                       | _„Module müssen unabhängig voneinander **funktionie**."_                                                                                                                               | offen   |
| F4      | `CORE_OBJECTS.md` :379                       | _„Ein Termin **können** zu einem Performance Case gehören."_                                                                                                                           | offen   |
| F5      | `CORE_OBJECTS.md` :186,187                   | _„Measurments"_ (2×)                                                                                                                                                                   | offen   |
| F6      | `CORE_OBJECTS.md` :119,121,385               | _„Assesment"_ (3×) · `DOMAIN_VISION.md` :60 (1×)                                                                                                                                       | offen   |
| F7      | `CORE_OBJECTS`, `USER_FLOWS`, `DOMAIN_RULES` | jeweils zwei H1 (Dateiname + Titel)                                                                                                                                                    | offen   |
| F8      | `CORE_OBJECTS.md`                            | Sprachmix in Abschnittstiteln: _Coach, Athlete, Assessment, Insight_ (en) neben _Dokumente, Videos, Ziel, Termin, Programme_ (de)                                                      | offen   |
| F9      | `CORE_OBJECTS.md` :37 / :274                 | _„Case summary"_ vs. _„Case Summary Report"_                                                                                                                                           | offen   |
| **F10** | `CORE_OBJECTS.md` :150,152,154,162,163       | **neu:** Tippfehler _„Measurment"_ in den neuen Abschnittstitel übernommen — sollte _Measurement_ heißen (6×)                                                                          | **neu** |
| **F11** | `CORE_OBJECTS.md` :170 vs :189               | **neu:** zwei deutsche Begriffe für dasselbe: _Messungstyp_ / _Messwerttyp_                                                                                                            | **neu** |
| **F12** | `DOMAIN_DECISIONS.md` §9 :324/:326           | **neu:** _„# 9. Measurements"_ direkt gefolgt von _„# Measurement Types"_ — beide H1. Measurement Types ist inhaltlich ein Unterabschnitt.                                             | **neu** |
| **F13** | `DOMAIN_DECISIONS.md` §13 :425/:455/:475     | **neu:** _„# Videos"_ und _„# Programs"_ stehen als H1 innerhalb von §13 Documents. Zwei Kernobjekte sind dadurch in einem fremden Abschnitt vergraben und außerhalb der Nummerierung. | **neu** |

---

# Was jetzt zu entscheiden ist

| Prio   | Frage                                                                                     | Empfehlung                                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | **Immutability-Auslöser: `Published` oder `Shared`?** (B2)                                | `PUBLISHED` sperrt, `SHARED` steuert nur Sichtbarkeit — drei von vier Stellen sagen das bereits. Danach §12 und `RULES` #17 angleichen. |
| **2**  | Statuskette für Insight und Recommendation — oder Streichung aus `Immutable Objects` (B2) | Streichen; Insights/Recommendations folgen dem Report-Status                                                                            |
| **3**  | Kanonische Modul-Liste in alle vier Dokumente (P1)                                        | `DECISIONS` §8 gilt. HYROX zusätzlich streichen — Wettkampfformat, kein Analysebereich                                                  |
| **4**  | Definitionen für `Performance Case`, `Evidence`, `Task` in `DECISIONS` (N1, N4)           | Je ein Abschnitt; Evidence als heterogene Belegmenge (Measurement + Video + Dokument)                                                   |
| **5**  | Assessment→Athlete: direkt oder über Case abgeleitet? (N2)                                | Abgeleitet, gemäß `RULES` #15. §17.2 nachziehen.                                                                                        |
| **6**  | Question als Assessment-Pflichtfeld (I1)                                                  | Feld am Assessment, Aufnahme in §3                                                                                                      |
| **7**  | Seitigkeit am Measurement (I2)                                                            | Feld `side` am Measurement, nicht am Typ                                                                                                |
| **8**  | Report-Ebenen: zwei oder drei? (I5)                                                       | Module → Assessment → Case Summary, alle drei in `DECISIONS` §12 beschreiben                                                            |
| **9**  | Goal, Appointment, Follow-Up, Note als Kernobjekte (I3)                                   | In §3 aufnehmen oder ausdrücklich als Hilfsobjekte kennzeichnen                                                                         |
| **10** | Action/Intervention/Maßnahme/Task vereinheitlichen (I4)                                   | Ein Objekt, ein Begriff                                                                                                                 |

---

# Fortschritt gegenüber Durchgang 1

| Punkt                              | Vorher                                                  | Jetzt                                                                                                         |
| ---------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **B1 Performance Case**            | Aus `DECISIONS` §3 entfernt, in vier Dokumenten tragend | ✅ Wieder Kernobjekt; §7 ergänzt                                                                              |
| **B3 Gerätehersteller als Module** | VALD/MYOACT in allen Modul-Listen                       | ✅ `DECISIONS` §8 :316 stellt ausdrücklich klar: Datenquellen, keine Module — **die wichtigste Verbesserung** |
| **B3 Namenskonvention**            | _Running Analysis_, _Lactate Test_, _Cycle Tracking_    | ✅ Auf reine Domänenbegriffe vereinheitlicht                                                                  |
| **B4 Video vs. Document**          | Video zugleich Modul, Dokumenttyp und Objekt            | ✅ _„Videos are first-class domain objects … not Documents"_                                                  |
| **B4 Program**                     | Kernobjekt ohne Definition                              | ✅ Definiert in `DECISIONS` §13 und `CORE_OBJECTS` §Programme; Abgrenzung zu hochgeladenen PDFs klar          |
| **D8 Measurement Type**            | Nur in `CORE_OBJECTS`, ohne Autorität                   | ✅ In §3 Core Objects, §9 definiert mit Kategorie und Referenzbereich; `RULES` #3 ergänzt                     |
| **B4 Dokumentzuordnung**           | nur Athlete                                             | ✅ Athlete + optional Case/Assessment/Module                                                                  |
