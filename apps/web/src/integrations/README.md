# integrations

Adapters for third-party systems. One directory per provider.

## Why adapters rather than direct SDK calls

Every integration here is a vendor decision that may be revisited: Resend could
become Postmark, PostHog could become Amplitude. Feature code that imports the
SDK directly turns a swap into a repo-wide change. Feature code that imports
`sendEmail()` turns it into one file.

The adapter also owns the failure policy — retries, timeouts, and returning a
`Result` rather than throwing — so a third-party outage degrades a feature
instead of breaking a request.

## Planned

| Directory    | Provider      | Purpose                               |
| ------------ | ------------- | ------------------------------------- |
| `storage/`   | Cloudflare R2 | File upload, signed URLs              |
| `email/`     | Resend        | Transactional email + React templates |
| `analytics/` | PostHog       | Product analytics, feature flags      |
| `jobs/`      | Trigger.dev   | Background and scheduled tasks        |

Credentials come from `src/env.ts` only — never `process.env` directly, so a
missing key fails at build time.

_None implemented yet._
