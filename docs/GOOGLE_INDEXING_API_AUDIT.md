# Google Indexing API Configuration Audit

**Date**: 2025-03-10  
**Issue**: Admin Analytics shows "Google Indexing API → Not Configured" despite credentials being set in Vercel.

---

## 1. Environment Variables — MISMATCH FOUND & FIXED

| Expected (per prompt) | Actual used by code | Status |
|----------------------|---------------------|--------|
| `GOOGLE_INDEXING_CLIENT_EMAIL` | `GOOGLE_INDEXING_CLIENT_EMAIL` | ✅ Now supported |
| `GOOGLE_INDEXING_PRIVATE_KEY` | `GOOGLE_INDEXING_PRIVATE_KEY` | ✅ Now supported |
| `GOOGLE_INDEXING_PROJECT_ID` | Not required for JWT | Optional |
| `GOOGLE_INDEXING_API_ENABLED` | Not used | N/A |
| — | `GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON` | Original format (base64 JSON) |

**Root cause**: The code originally expected only `GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON` (base64-encoded full service account JSON). Vercel was configured with individual vars (`GOOGLE_INDEXING_CLIENT_EMAIL`, `GOOGLE_INDEXING_PRIVATE_KEY`).

**Fix applied**: `indexingService.ts` now supports both:
1. `GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON` (base64 JSON) — original
2. `GOOGLE_INDEXING_CLIENT_EMAIL` + `GOOGLE_INDEXING_PRIVATE_KEY` — individual vars

---

## 2. Google Indexing Service

- **Location**: `apps/api/src/services/v4/seo/indexingService.ts`
- **Auth**: Uses Web Crypto API (no `google.auth.JWT` or `googleapis` — custom JWT signing for Edge/Node compatibility)
- **Endpoint**: `https://indexing.googleapis.com/v3/urlNotifications:publish`
- **Scope**: `https://www.googleapis.com/auth/indexing`

---

## 3. Private Key Formatting — FIXED

**Pattern**: `replace(/\\n/g, '\n')` for escaped newlines.

**Status**: Implemented for individual-vars path. When using `GOOGLE_INDEXING_PRIVATE_KEY`, the service now converts literal `\n` to actual newlines (Vercel env vars often store keys with escaped newlines).

---

## 4. Admin Status Detection — FIXED

- **File**: `apps/api/app/api/admin/v4/seo/analytics/route.ts`
- **Logic**: `googleIndexingConfigured` now checks:
  - `GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON` **OR**
  - `GOOGLE_INDEXING_CLIENT_EMAIL` **AND** `GOOGLE_INDEXING_PRIVATE_KEY`

---

## 5. Admin Analytics API

- **Endpoint**: `GET /api/admin/v4/seo/analytics`
- **Response**: Includes `integrations.googleIndexingConfigured: true` when configured
- **Admin UI**: `apps/admin/src/app/(admin)/seo/analytics/page.tsx` reads `data.integrations.googleIndexingConfigured` ✅

---

## 6. Worker Initialization

- **File**: `apps/api/instrumentation.ts`
- **Process**: No dedicated Google Index worker. The `seo_index_queue` is processed by **Vercel Cron** via `POST /api/internal/seo/process-index-queue` (see `vercel.json`).
- **Note**: The queue processor only submits to **IndexNow**, not Google. Google Indexing is triggered by:
  - `notificationEventMapper` → `safeSeoIndexAndSitemap` → `pingUrl` (includes `pingGoogle`) for **JOB_PUBLISHED**
  - Manual ping: `POST /api/admin/v4/seo/indexing/ping`

---

## 7. Index Trigger

- **seoEventHandler**: Enqueues URLs to `seo_index_queue` for JOB_PUBLISHED, JOB_UPDATED, JOB_ARCHIVED, JOB_DELETED ✅
- **Queue processor**: Submits to IndexNow only (not Google)
- **Google Indexing**: Triggered directly from `notificationEventMapper` on JOB_PUBLISHED via `pingUrl` which calls both `pingGoogle` and `pingIndexNow` ✅

---

## 8. Admin UI

- **File**: `apps/admin/src/app/(admin)/seo/analytics/page.tsx`
- **Fetches**: `/api/admin/v4/seo/analytics` (proxied to API)
- **Displays**: `IntegrationBadge` for "Google Indexing API" using `data.integrations.googleIndexingConfigured` ✅

---

## 9. Debug Endpoint — ADDED

- **Endpoint**: `GET /api/admin/v4/seo/google-indexing-debug`
- **Auth**: Requires admin session
- **Response**:
```json
{
  "ok": true,
  "data": {
    "envClientEmail": true,
    "envPrivateKey": true,
    "envProjectId": false,
    "envServiceAccountJson": false,
    "serviceInitialized": true,
    "expectedVars": ["..."]
  }
}
```

Use this to diagnose production config when Admin shows "Not Configured".

---

## Summary of Fixes

| Item | Fix |
|------|-----|
| Env vars | Support `GOOGLE_INDEXING_CLIENT_EMAIL` + `GOOGLE_INDEXING_PRIVATE_KEY` |
| Private key | `replace(/\\n/g, '\n')` for individual-vars path |
| Status detection | Check both JSON and individual vars |
| Debug endpoint | `GET /api/admin/v4/seo/google-indexing-debug` |

---

## When Admin Will Show "Configured"

After redeploying the API with these changes, Admin → Analytics will show **Google Indexing API → Configured** when either:

1. `GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON` is set (base64 JSON), or  
2. Both `GOOGLE_INDEXING_CLIENT_EMAIL` and `GOOGLE_INDEXING_PRIVATE_KEY` are set in Vercel.

---

## Vercel Env Checklist

Ensure these are set in **Vercel → API project → Environment Variables**:

- `GOOGLE_INDEXING_CLIENT_EMAIL` = service account email
- `GOOGLE_INDEXING_PRIVATE_KEY` = full private key (with `\n` for newlines if needed)

Optional: `GOOGLE_INDEXING_PROJECT_ID` (not required for JWT auth).
