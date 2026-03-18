# 8Fold LGS (Lead Generation System) Setup

## Overview

LGS is the contractor acquisition engine: lead CRM, outreach tracking, conversion funnel, and investor-ready reporting.

## Database Migration

Run the LGS migration:

```bash
DOTENV_CONFIG_PATH=apps/api/.env.local pnpm exec tsx scripts/apply-lgs-migration.ts
```

This creates `contractor_leads`, `region_launches`, `acquisition_channels` and seeds channel names.

Run the sender pool migration:

```bash
DOTENV_CONFIG_PATH=apps/api/.env.local pnpm exec tsx scripts/apply-lgs-sender-pool-migration.ts
```

This creates `sender_pool`, adds verification/bounce columns to `contractor_leads`, and seeds 4 senders (info@, support@, hello@, partners@).

Run the outreach messages + discovery migration:

```bash
DOTENV_CONFIG_PATH=apps/api/.env.local pnpm exec tsx scripts/apply-lgs-outreach-messages-migration.ts
```

This creates `outreach_messages`, `lgs_outreach_queue`, `discovery_runs`, `discovery_domain_logs`, `discovery_domain_cache`, `discovery_run_leads`, and extends `contractor_leads` with discovery/verification fields.

Run the discovery runs schema extension (failed_domains, skipped_domains, domains_total, status):

```bash
DOTENV_CONFIG_PATH=apps/api/.env.local pnpm exec tsx scripts/apply-discovery-runs-migration.ts
```

Run the discovery contact/industry extension (contact_name, industry on leads; contacts_found on runs):

```bash
DOTENV_CONFIG_PATH=apps/api/.env.local pnpm exec tsx scripts/apply-discovery-contact-industry-migration.ts
```

Run the discovery auto_import_source extension (for website import flow):

```bash
DOTENV_CONFIG_PATH=apps/api/.env.local pnpm exec tsx scripts/apply-discovery-auto-import-migration.ts
```

## Workers

### Email Verification Worker

Verifies leads (syntax, DNS, MX, SMTP). Sets `verification_score` and `verification_status`. Score >= 85 = eligible for outreach.

```bash
pnpm -C apps/api run lgs:verification:worker
```

Runs every 5 minutes.

### LGS Outreach Worker

Sends outreach emails to verified leads via sender pool rotation. Uses Gmail API.

```bash
pnpm -C apps/api run lgs:outreach:worker
```

Runs every minute.

### Daily Counter Reset

Reset `sender_pool.sent_today` at midnight Pacific (run via cron):

```bash
pnpm -C apps/api run lgs:reset-counters
```

**Cron (midnight Pacific):** Set `TZ=America/Los_Angeles` so `0 0` = midnight Pacific:

```cron
0 0 * * * TZ=America/Los_Angeles cd /path/to/8Fold_Local && DOTENV_CONFIG_PATH=apps/api/.env.local pnpm -C apps/api run lgs:reset-counters
```

(Replace `/path/to/8Fold_Local` with your repo path.)

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `LGS_EMAIL_INTERVAL_MINUTES` | 7 | Min minutes between sends |
| `LGS_SENDER_DAILY_LIMIT` | 50 | Per-sender daily cap |
| `LGS_DOMAIN_DAILY_LIMIT` | 220 | Domain-wide daily cap |
| `LGS_OUTREACH_SUBJECT` | (required) | Email subject template |
| `LGS_OUTREACH_BODY` | (required) | Email body template |

Gmail: `GMAIL_SENDER_1`..`GMAIL_SENDER_4`, `GMAIL_REFRESH_TOKEN`..`GMAIL_REFRESH_TOKEN_4`.

## Signup Detection Job

Match contractor signups to leads (run periodically, e.g. cron every 15 min):

```bash
DOTENV_CONFIG_PATH=apps/api/.env.local pnpm -C apps/api exec tsx scripts/lgs-signup-detection-job.ts
```

## Key Routes

- `/dashboard` – Funnel widget, metrics (emails today/week, bounce rate, verification rate, outreach conversion, discovery success)
- `/leads` – Contractor leads table (with verification columns, Generate message button)
- `/leads/import` – CSV/Excel import (email normalized)
- `/discovery` – Bulk domain search (crawl, email extract, pattern generation, verify, import)
- `/messages` – GPT-generated outreach messages (approve/reject to queue)
- `/outreach` – Email campaigns (legacy contractor_contacts)
- `/outreach/queue` – Queue monitor
- `/verification` – Email verification status
- `/workers` – Worker status
- `/settings/senders` – Sender pool management (daily limit, status)
- `/channels` – Acquisition channel performance + ROI
- `/reports/pipeline` – Stage counts
- `/reports/investor` – Investor snapshot
- `/regions` – Region launch tracker

## Outreach Throttling (LGS)

- 4 senders × 50/day = 200 emails/day (configurable)
- Domain cap: 220/day (configurable)
- 6–8 minute random interval between sends
- Retry: 3 attempts, 30s delay on transient failures
