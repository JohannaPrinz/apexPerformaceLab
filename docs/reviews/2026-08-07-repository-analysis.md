# Repository-Analyse vor der Domänen-Implementierung

> Datum: 2026-08-07 · **Reine Analyse. Kein Code geschrieben, keine Datei geändert.**
>
> Grundlage für den Abgleich: [docs/domain/](../domain/)

---

## Kernbefund vorab

Das Repository enthält **ausschließlich Infrastruktur**. Es existiert kein
einziges Feature, kein Domänenmodell und — entscheidend — **keine
Migrationshistorie**.

`packages/database/prisma/` enthält nur `schema.prisma` und `seed.ts`. Es gibt
keinen `migrations/`-Ordner, also wurde nie `prisma migrate dev` ausgeführt.
Bisher lief nur `prisma generate`.

**Konsequenz:** Die erste Migration ist vollständig offen. Das Domänenmodell
kann in einem Guss entstehen, ohne Altlast und ohne Datenmigration.

---

## 1. Aktuelle Projektstruktur

Monorepo mit pnpm-Workspaces und Turborepo. Ein Deployable.

```
apps/web/                    Next.js 16 App Router — einzige Anwendung
packages/auth/               Better Auth
packages/config/             ESLint- und TypeScript-Presets
packages/database/           Prisma
packages/types/              Domänentypen, Zod-Primitives
packages/ui/                 Design System
```

### apps/web/src im Detail

| Verzeichnis     | Inhalt                                                                        | Status                   |
| --------------- | ----------------------------------------------------------------------------- | ------------------------ |
| `app/`          | `layout.tsx`, `page.tsx`, `error.tsx`, `not-found.tsx` + 2 Route-Handler      | Gerüst                   |
| `components/`   | 8 Kategorien — 7 davon **nur** `README.md`, `common/` enthält `providers.tsx` | leer                     |
| `features/`     | 10 Slices — **ausnahmslos nur `README.md`**                                   | leer                     |
| `server/api/`   | `trpc.ts`, `root.ts`, `routers/health.ts`                                     | funktionsfähig           |
| `trpc/`         | `client.tsx`, `server.ts`, `query-client.ts`, `hydrate-client.tsx`            | funktionsfähig           |
| `services/`     | nur `README.md`                                                               | leer                     |
| `integrations/` | nur `README.md`                                                               | leer                     |
| `lib/`          | `utils.ts` (cn-Re-Export)                                                     | minimal                  |
| `config/`       | nur `README.md`                                                               | leer, nicht dokumentiert |
| Einzeldateien   | `env.ts`, `load-env.ts`, `proxy.ts`                                           | funktionsfähig           |

**Gesamtbilanz Anwendungscode:** 4 Seiten-/Fehlerdateien, 2 Route-Handler,
1 Provider-Komponente, 1 Health-Router. Alles andere ist Konfiguration.

---

## 2. Prisma-Struktur

| Aspekt          | Stand                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Version         | Prisma 7.9.1                                                                                        |
| Generator       | `prisma-client` (nicht `prisma-client-js`), Output `../generated/prisma`, gitignored                |
| Datasource      | `postgresql`, URL **nicht** im Schema — kommt aus `prisma.config.ts` (`DIRECT_URL ?? DATABASE_URL`) |
| Connection      | Driver Adapter `@prisma/adapter-pg`, keine Rust-Engine                                              |
| Client          | Singleton in `src/client.ts`, `globalThis`-Cache gegen Hot-Reload-Leaks                             |
| **Migrationen** | **keine** — `prisma/migrations/` existiert nicht                                                    |
| Konventionen    | IDs `cuid(2)`, Tabellen `@@map` snake_case plural, `createdAt`/`updatedAt` überall                  |

### Vorhandene Modelle (7)

**Identity — von Better Auth vorgegeben, Feldnamen nicht frei wählbar:**

| Modell         | Tabelle         | Besonderheit                                               |
| -------------- | --------------- | ---------------------------------------------------------- |
| `User`         | `users`         |                                                            |
| `Session`      | `sessions`      | **`activeOrganizationId`** — der Anker des Tenant-Scopings |
| `Account`      | `accounts`      | Credentials + OAuth                                        |
| `Verification` | `verifications` |                                                            |

**Tenancy:**

| Modell         | Tabelle         | Besonderheit                      |
| -------------- | --------------- | --------------------------------- |
| `Organization` | `organizations` | unique `slug`, `metadata Json?`   |
| `Membership`   | `memberships`   | unique `(userId, organizationId)` |
| `Invitation`   | `invitations`   | unique `(organizationId, email)`  |

**Enums:** `MembershipRole` (`owner`, `admin`, `coach`, `athlete`) ·
`InvitationStatus` (`pending`, `accepted`, `rejected`, `expired`)

### Datenzugriffs-Schicht

- `src/index.ts` — re-exportiert Modelltypen mit Alias (`UserModel as User` …),
  da Prisma 7 das Suffix `Model` vergibt
- `src/tenant.ts` — `scoped()`, `withTenant()`, `assertTenant()`;
  alle drei sind fest auf `organizationId` verdrahtet (`TENANT_KEY`)
- `prisma/seed.ts` — legt Organization `apex-demo` + Owner an, idempotent

---

## 3. Better Auth Integration

**Version 1.6.25**, selbst gehostet, Prisma-Adapter.

### Server — `packages/auth/src/server.ts`

| Einstellung     | Wert                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adapter         | `prismaAdapter(db, { provider: 'postgresql' })`                                                                                                               |
| E-Mail/Passwort | aktiv, `minPasswordLength: 12`, `requireEmailVerification: false`                                                                                             |
| OAuth           | GitHub + Google, **nur wenn Credentials gesetzt** (bedingtes Spreading)                                                                                       |
| Session         | 30 Tage, `updateAge` 1 Tag, `cookieCache` 5 Minuten                                                                                                           |
| ID-Erzeugung    | `generateId: false` — nutzt Prismas `cuid(2)`                                                                                                                 |
| Plugins         | `organization({ ac, roles, organizationLimit: 5, creatorRole: 'owner', membershipLimit: 500, invitationExpiresIn: 48h })`, `nextCookies()` (zwingend zuletzt) |

### Client — `packages/auth/src/client.ts`

`'use client'`, `createAuthClient` mit `organizationClient`. Exportiert
`signIn`, `signUp`, `signOut`, `useSession`, `organization`,
`useActiveOrganization`, `useListOrganizations`.

`src/index.ts` exportiert **bewusst nur** Server + Permissions — der Client
würde sonst die `'use client'`-Grenze in den Server-Graph ziehen.

### Einbindung in die App

- `app/api/auth/[...all]/route.ts` — `toNextJsHandler(auth.handler)`
- `proxy.ts` — Edge-Guard, prüft **nur die Cookie-Präsenz** (`getSessionCookie`),
  keine Session-Validierung, keine DB-Abfrage. Bewusst als Routing-Hilfe, nicht
  als Autorisierungsgrenze.

> **Befund:** `proxy.ts` schützt `/dashboard`, `/athletes`, `/training`,
> `/settings`. `/training` entspricht nicht mehr der Domäne.

---

## 4. tRPC-Struktur

**tRPC 11.18.0** mit `@trpc/tanstack-react-query`.

### Kontext und Prozeduren — `server/api/trpc.ts`

```
createTRPCContext({ headers }) → { db, headers, session }
```

Transformer `superjson`. Der `errorFormatter` reicht `zodError` (geflacht) und
`appErrorCode` an den Client durch. Eine `timingMiddleware` fügt im
Entwicklungsmodus 50–250 ms Verzögerung ein, damit fehlende Ladezustände lokal
auffallen.

**Prozedur-Leiter:**

| Prozedur                | Garantie                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `publicProcedure`       | keine                                                                                                         |
| `protectedProcedure`    | `ctx.session.user` existiert                                                                                  |
| `organizationProcedure` | liest `session.session.activeOrganizationId`, verifiziert `Membership`, injiziert `ctx.tenant: TenantContext` |
| `withPermission(p)`     | zusätzlich `hasPermission(role, p)`                                                                           |

Der Tenant-Scope stammt ausschließlich aus der Session, nie aus Client-Input.

### Router

- `root.ts` — `appRouter = { health }`, dazu `createCaller = createCallerFactory(appRouter)`
- `routers/health.ts` — `ping` und `database` (`SELECT 1`), beide `publicProcedure`

**Ein einziger Router. Keine Feature-Router.**

### Client-/Server-Anbindung

| Datei                          | Rolle                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `trpc/server.ts`               | `api` = direkter Caller (kein HTTP), `trpc` = Options-Proxy, `getQueryClient` (request-scoped via `cache()`) |
| `trpc/client.tsx`              | `TRPCProvider`, `useTRPC`, `useTRPCClient`; `httpBatchStreamLink` + `loggerLink`                             |
| `trpc/hydrate-client.tsx`      | `HydrateClient` für Prefetch-Übergabe                                                                        |
| `trpc/query-client.ts`         | `staleTime` 30 s, kein Retry bei `UNAUTHORIZED`/`FORBIDDEN`, superjson-Serialisierung                        |
| `app/api/trpc/[trpc]/route.ts` | `fetchRequestHandler`                                                                                        |

---

## 5. Vorhandene Packages

| Package          | Zweck                        | Exports                                                       | Laufzeit-Abhängigkeiten                                            |
| ---------------- | ---------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `@apex/types`    | Domänentypen, Zod-Primitives | `.`, `./common`, `./tenancy`, `./errors`                      | `zod`                                                              |
| `@apex/database` | Prisma, Tenant-Helfer        | `.`, `./client`, `./tenant`                                   | `@apex/types`, `@prisma/adapter-pg`, `@prisma/client`, `pg`, `zod` |
| `@apex/auth`     | Better Auth                  | `.`, `./server`, `./client`, `./permissions`                  | `@apex/database`, `@apex/types`, `better-auth`, `zod`              |
| `@apex/ui`       | Design System                | `.`, `./styles.css`, `./tokens`, `./lib/cn`, `./components/*` | `radix-ui`, `cva`, `clsx`, `tailwind-merge`, `lucide-react`        |
| `@apex/config`   | ESLint-/TS-Presets           | kein `exports`-Feld, Zugriff über Pfade                       | —                                                                  |

Alle `@apex/*` werden als **TypeScript-Quelle** konsumiert, nicht als Build-Artefakt.
`next.config.ts` listet sie in `transpilePackages`: `@apex/ui`, `@apex/auth`,
`@apex/database`, `@apex/types`.

### Inhalt von `@apex/types`

| Datei                         | Inhalt                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `common/primitives.ts`        | `Brand<>`, `UserId`, `OrganizationId`, **`AthleteId`** (bereits vorhanden), `cuidSchema`, `emailSchema`, `slugSchema`, `isoDateSchema`, `calendarDateSchema` |
| `common/pagination.ts`        | `paginationInputSchema` (cursor + limit), `Page<T>`, `sortInputSchema()`                                                                                     |
| `common/result.ts`            | `Result<T,E>`, `ok`/`err`/`isOk`/`isErr`/`unwrap`                                                                                                            |
| `errors/index.ts`             | 9 `APP_ERROR_CODES` inkl. `INTEGRATION_FAILED`, `AppError`, `ERROR_STATUS`                                                                                   |
| `tenancy/index.ts`            | Rollen, Permissions, `PERMISSIONS`, `hasPermission`, `TenantContext`                                                                                         |
| `tenancy/permissions.test.ts` | 7 Tests auf die Rollenmatrix                                                                                                                                 |

**Kein `packages/domain`.**

---

## 6. Bestehende Features

**Keine.** Zehn Slice-Verzeichnisse, jedes enthält ausschließlich `README.md`:

```
analysis · athletes · auth · calendar · chat
dashboard · nutrition · performance · settings · training
```

### Abgleich mit dem Domänenmodell

| Vorhandener Slice       | Verhältnis zur Domäne                              |
| ----------------------- | -------------------------------------------------- |
| `athletes`              | passt                                              |
| `auth`                  | passt (Infrastruktur, kein Domänenobjekt)          |
| `dashboard`, `settings` | neutral, unterstützend                             |
| `analysis`              | überschneidet sich unscharf mit `Insight`          |
| `performance`           | ohne Entsprechung im Domänenmodell                 |
| `training`, `nutrition` | sind laut Domäne **Module**, keine Slices          |
| `calendar`              | entspricht `Appointment` — unterstützend           |
| `chat`                  | entspricht `Note` / Coach-Feedback — unterstützend |

**Ohne Slice sind derzeit:** Performance Case · Goal · Assessment · Module ·
Measurement Type · Measurement · Insight · Recommendation · Report · Share ·
Document · Video · Program · Note · Timeline

---

## 7. Aktuelle Permission-Struktur

Die Berechtigungen existieren **zweifach**, in zwei Paketen, ohne technische
Kopplung.

### a) `packages/types/src/tenancy/index.ts` — für tRPC

```
organizationRoleSchema:  owner | admin | coach | athlete
```

14 Permissions:

| Ressource      | Aktionen                   |
| -------------- | -------------------------- |
| `organization` | `read`, `update`, `delete` |
| `member`       | `invite`, `remove`         |
| `athlete`      | `read`, `write`            |
| `training`     | `read`, `write`            |
| `nutrition`    | `read`, `write`            |
| `analysis`     | `read`, `write`            |
| `billing`      | `manage`                   |

Dazu `PERMISSIONS: Record<Role, Permission[]>`, `hasPermission()` und:

```ts
interface TenantContext {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
}
```

### b) `packages/auth/src/permissions.ts` — für Better Auth

`createAccessControl()` über acht Ressourcen: `organization`, `member`,
`invitation`, `athlete`, `training`, `nutrition`, `analysis`, `billing`.
Vier Rollen mit je eigener Rechteliste.

Der Dateikommentar benennt die Doppelung ausdrücklich:
_„Keep them in step when adding a capability."_ — also manuelle Synchronisation.

### Abgleich mit dem Domänenmodell

**Nicht abgedeckt:** `case`, `assessment`, `module`, `measurement_type`,
`measurement`, `insight`, `recommendation`, `report`, `share`, `document`,
`video`, `program`, `note`, `appointment`

**Vorhanden, aber nicht mehr Domäne:** `training`, `nutrition`, `analysis`

**Fehlend im Kontext:** `TenantContext` trägt keine `athleteId`. Ein
Portal-Athlet lässt sich damit nicht auf „nur eigene Daten" einschränken.

**Namenskollision:** `MembershipRole.athlete` (Rolle) gegen das künftige
Domänenobjekt `Athlete` (Entität) — zwei verschiedene Dinge, ein Name.

---

## 8. Integrationspunkte für das neue Domain Model

### A · Datenmodell

| Datei                                    | Eingriff                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/database/prisma/schema.prisma` | 17 Objekte plus Enums ergänzen. `Organization` bleibt und wird zum `Workspace`. Erste Migration erzeugen — **keine bestehende Historie im Weg**. |
| `packages/database/src/index.ts`         | Modelltyp-Re-Exports um die neuen Modelle erweitern (Alias-Muster `XModel as X` beibehalten)                                                     |
| `packages/database/src/tenant.ts`        | Heute ausschließlich `organizationId`. Für den Portal-Zugriff kommt eine zweite Scoping-Ebene auf `athleteId` hinzu.                             |
| `packages/database/prisma/seed.ts`       | Katalog der Measurement Types und die kanonischen Module als Seed                                                                                |

### B · Domänenlogik

| Ort                                                                  | Eingriff                                                                                                              |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **neu** `packages/domain/`                                           | Modul-Registry, Assessment-Presets, Invarianten (Recommendation braucht Insight, Publish friert ein, Case-Autoanlage) |
| `apps/web/next.config.ts`                                            | `transpilePackages` um `@apex/domain` ergänzen                                                                        |
| `packages/database/package.json` bzw. `packages/domain/package.json` | Abhängigkeitsrichtung festlegen                                                                                       |

### C · Typen und Berechtigungen

| Datei                                            | Eingriff                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `packages/types/src/tenancy/index.ts`            | `permissionSchema` und `PERMISSIONS` auf die Domänenressourcen umstellen; `TenantContext` um `athleteId` erweitern |
| `packages/auth/src/permissions.ts`               | `accessControl` aus `@apex/types` **ableiten** statt parallel pflegen                                              |
| `packages/types/src/tenancy/permissions.test.ts` | Matrix-Tests an die neuen Ressourcen anpassen                                                                      |
| `packages/types/src/common/primitives.ts`        | Branded IDs ergänzen (`CaseId`, `AssessmentId`, `MeasurementId` …); `AthleteId` existiert bereits                  |

### D · API-Schicht

| Datei                                      | Eingriff                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `apps/web/src/server/api/trpc.ts`          | `athleteProcedure` ergänzen; `TenantContext`-Aufbau um die Athleten-Auflösung erweitern |
| `apps/web/src/server/api/root.ts`          | Feature-Router registrieren (heute nur `health`)                                        |
| `apps/web/src/features/*/server/router.ts` | Router je Slice anlegen                                                                 |

### E · Feature-Struktur

| Ort                               | Eingriff                                                                  |
| --------------------------------- | ------------------------------------------------------------------------- |
| `apps/web/src/features/`          | Verzeichnisse an die Domäne angleichen — **heute leer, daher kostenlos**  |
| `apps/web/src/features/README.md` | Slice-Tabelle ersetzen                                                    |
| `commitlint.config.mjs`           | `scope-enum` an die neuen Slices anpassen, sonst werden Commits abgelehnt |

### F · Auth-Randbereiche

| Datei                         | Eingriff                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `packages/auth/src/server.ts` | Rollen des `organization`-Plugins; Portal-Zugriff des Athleten                 |
| `apps/web/src/proxy.ts`       | `PROTECTED_PREFIXES` enthält `/training` — an die neue Routenstruktur anpassen |

### G · Dokumentation im Nachlauf

`docs/ARCHITECTURE.md` §4 (alte Slices) · `docs/PRODUCT_REQUIREMENTS.md` §2 ·
`docs/DATABASE.md` §10 (Planned models) · `README.md` (Slice-Liste)

---

## Was bereits trägt und nicht angefasst werden muss

- **Tenant-Scoping aus der Session** — `Session.activeOrganizationId` funktioniert
  unverändert als Workspace-Anker
- **Prozedur-Leiter** — der Mechanismus stimmt, nur die Ressourcen ändern sich
- **Fehlertaxonomie** inkl. `INTEGRATION_FAILED` — passt zu den geplanten
  Geräteimporten
- **Pagination und Branded IDs** — direkt verwendbar, `AthleteId` ist bereits da
- **Prisma-Setup** — Driver Adapter, Singleton, `cuid(2)`, `@@map`-Konvention
- **Better-Auth-Konfiguration** — Session, Cookie-Cache, bedingte OAuth-Provider
- **Design System** — semantische Tokens, fünf Chart-Serien, `[data-numeric]`

---

## Reihenfolge-Hinweise aus der Analyse

Drei Beobachtungen, die die Schrittfolge beeinflussen:

1. **Keine Migration vorhanden** → das Schema kann in einem Zug entstehen, statt
   in mehreren Nachbesserungen. Das spricht dafür, das Schema früh und
   vollständig zu entwerfen.
2. **`features/` ist vollständig leer** → die Umbenennung kostet heute nichts.
   Sie muss aber vor dem ersten Feature-Code passieren, sonst wandert Code in
   Verzeichnisse, die danach umbenannt werden.
3. **Permissions sind doppelt gepflegt** → solange kein Feature sie nutzt, ist
   die Zusammenführung risikofrei. Mit dem ersten geschützten Endpunkt wird sie
   teurer.
