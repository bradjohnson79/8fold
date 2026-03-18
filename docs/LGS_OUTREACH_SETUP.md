# LGS Outreach Engine Setup

## Overview

The LGS Outreach Engine is a semi-automatic contractor recruitment email system. It supports CSV/Excel import, GPT-5 Nano email generation, human approval, and Gmail API sending with strict rate limits.

## Environment Variables

Add to `apps/api/.env.local`:

```
# LGS Outreach (localhost only)
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
GMAIL_REFRESH_TOKEN_2=          # Optional: for support@8fold.app
GMAIL_SENDER_1=info@8fold.app
GMAIL_SENDER_2=support@8fold.app
```

`OPEN_AI_API_KEY` is already used by the API for GPT-5 Nano.

## Database Migration

Run the outreach migration:

```bash
DOTENV_CONFIG_PATH=apps/api/.env.local pnpm exec tsx scripts/apply-lgs-outreach-migration.ts
```

Or apply the SQL directly: `psql $DATABASE_URL -f drizzle/0136_lgs_outreach.sql`

## Gmail OAuth2 Setup

1. Create a Google Cloud project and enable Gmail API
2. Configure OAuth consent screen (Internal)
3. Create OAuth 2.0 Client ID (Desktop or Web)
4. Obtain refresh token via OAuth flow (one-time)
5. Store credentials in `.env.local`

## Running the Worker

Start the outreach worker (processes queue every minute):

```bash
pnpm -C apps/api run lgs:outreach:worker
```

## Workflow

1. **Import** – Upload CSV/Excel at `/outreach/import`
2. **Generate** – From Contacts list, click Generate per contact
3. **Review** – Approve/Edit/Reject at `/outreach/review`
4. **Queue** – Approved messages are sent by the worker (5 min interval, 50/account/day max)

## Safety Rules

- No email without approval
- 5-minute interval between sends
- 100 emails/day max (50 per account)
- Bounce protection: invalid emails marked and never retried
- Max 3 send attempts per queue item
