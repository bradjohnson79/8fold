# Job Post Wizard V2 — Rebuild Report

## Summary

Full rebuild of the Job Poster "Post a Job" wizard with a server-authoritative state machine, deterministic per-field autosave, robust resume/recovery, mandatory AI appraisal, and preserved Stripe payment flow.

## Implementation Status

| Phase | Status | Notes |
|-------|--------|-------|
| 0 | Done | Canonical route and sidebar/CTAs |
| 1 | Done | DB schema, migration, API routes |
| 2 | Done | Shared schemas, fieldKeys, steps |
| 3 | Done | Web proxies |
| 4 | Done | WizardV2, useDraftV2, return-v2 page |
| 5 | Done | Jurisdiction enforcement |
| 6 | Partial | Tests (minimal); Reports |

## API Contracts

### GET /api/web/job-poster/drafts-v2/current

**Response:**
```json
{
  "success": true,
  "draft": {
    "id": "uuid",
    "version": 1,
    "currentStep": "PROFILE",
    "countryCode": "US",
    "stateCode": "BC",
    "data": {},
    "validation": {},
    "fieldStates": {},
    "lastSavedAt": null
  },
  "traceId": "uuid"
}
```

### POST /api/web/job-poster/drafts-v2/save-field

**Request:**
```json
{
  "draftId": "uuid",
  "expectedVersion": 1,
  "fieldKey": "profile.fullName",
  "value": "John Doe"
}
```

**Response (success):**
```json
{
  "success": true,
  "draft": { "id", "version", "data", "validation", "fieldStates", "currentStep" },
  "traceId": "uuid"
}
```

**Response (409 VERSION_CONFLICT):**
```json
{
  "success": false,
  "code": "VERSION_CONFLICT",
  "draft": "<fresh server copy>",
  "traceId": "uuid"
}
```

### POST /api/web/job-poster/drafts-v2/advance

**Request:**
```json
{
  "draftId": "uuid",
  "expectedVersion": 1,
  "targetStep": "DETAILS"
}
```

### POST /api/web/job-poster/drafts-v2/start-appraisal

**Request:**
```json
{
  "draftId": "uuid",
  "expectedVersion": 1
}
```

**Response (503 AI_CONFIG_MISSING):**
```json
{
  "success": false,
  "code": "AI_CONFIG_MISSING",
  "requiresSupportTicket": true,
  "traceId": "uuid"
}
```

### POST /api/web/job-poster/drafts-v2/create-payment-intent

**Request:**
```json
{
  "draftId": "uuid",
  "expectedVersion": 1
}
```

**Response:**
```json
{
  "success": true,
  "clientSecret": "pi_xxx_secret_xxx",
  "returnUrl": "https://.../app/job-poster/payment/return-v2",
  "amount": 12345,
  "currency": "cad",
  "traceId": "uuid"
}
```

### POST /api/web/job-poster/drafts-v2/verify-payment

**Request:**
```json
{
  "paymentIntentId": "pi_xxx"
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "uuid",
  "funded": true,
  "idempotent": false,
  "traceId": "uuid"
}
```

## Step Machine

| Step | Allowed Next |
|------|--------------|
| PROFILE | DETAILS |
| DETAILS | PRICING |
| PRICING | PAYMENT |
| PAYMENT | CONFIRMED |
| CONFIRMED | — |

## Autosave Semantics

- Text: debounce 750ms or onBlur
- Select/Toggle: immediate
- Geo: only after successful resolve (coords + countryCode/stateCode)

## Test Commands

```bash
pnpm test:wizard-v2
```

## Files Created

- `apps/api/db/schema/jobDraftV2.ts`
- `apps/api/db/schema/jobDraftV2FieldState.ts`
- `drizzle/0048_job_draft_v2.sql`
- `packages/shared/src/jobDraftV2.schema.ts`
- `packages/shared/src/jobDraftV2.fieldKeys.ts`
- `packages/shared/src/jobDraftV2.steps.ts`
- `apps/api/app/api/web/job-poster/drafts-v2/*` (6 routes)
- `apps/web/src/app/api/app/job-poster/drafts-v2/*` (6 proxies)
- `apps/web/src/app/app/job-poster/(app)/post-a-job` wizard module files
- `apps/web/src/app/app/job-poster/payment/return-v2/page.tsx`
