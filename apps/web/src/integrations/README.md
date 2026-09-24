# integrations

Adapters for third-party systems. **One directory per capability, named for the
capability and not for the vendor** — the vendor stays inside the file.

## Why adapters rather than direct SDK calls

Every integration here is a vendor decision that may be revisited. Feature code
that imports the SDK directly turns a swap into a repo-wide change; feature code
that imports `sendEmail()` turns it into one file.

Both adapters have now proved this the hard way. The object store changed from
S3 to Supabase Storage, and email from an HTTP API to SMTP — and in each case
nothing outside the adapter's own file moved. That is also why the directory is
`object-store/` rather than a vendor's name.

The adapter owns the failure policy, and reports failure **as a value rather
than by throwing**, so a third-party outage degrades a feature instead of
breaking a request.

## Here now

| Directory       | Provider          | Purpose                                                |
| --------------- | ----------------- | ------------------------------------------------------ |
| `object-store/` | Supabase Storage  | Private bucket; every read is decided by the app first |
| `email/`        | SMTP (nodemailer) | Transactional email from the coach's own mailbox       |

### "Not configured" is a normal answer

Neither adapter throws when its settings are absent, and neither guesses. Each
exposes a predicate — `objectStoreReady()`, `emailReady()` — and callers ask
before offering the feature. A workspace without storage must still record an
assessment and publish an analysis; it simply has no pictures. An adapter that
exploded at import time would take the whole screen with it.

## Not implemented

`analytics/` (PostHog) and `jobs/` (Trigger.dev) do not exist. Their environment
variables are declared in `src/env.ts` and `.env.example`, and `posthog-js` is a
dependency of `apps/web`, but nothing imports or instruments either.

Credentials come from `src/env.ts` only — never `process.env` directly, so a
missing key fails at build time.
