# Auto Indexing Pipeline Discovery Report

**Date**: 2025-03-10  
**Goal**: Locate the correct integration point for the SEO indexing engine so search engines are automatically pinged whenever a new public page is created.

---

## Executive Summary

The SEO indexing infrastructure (Google Indexing API + IndexNow) is **already implemented** and wired to the `JOB_PUBLISHED` event. However, **`JOB_PUBLISHED` is never emitted** anywhere in the codebase. The moment a job becomes publicly accessible is when payment is secured and status is `OPEN_FOR_ROUTING`, but the code emits `PAYMENT_CAPTURED` instead. **Indexing never fires** for new jobs.

---

## Step 1 — Public Page Creation Points

### 1.1 Job Pages

| File | Function | URL Format | When Job Becomes Public |
|-----|----------|------------|-------------------------|
| `apps/api/src/payments/finalizeJobFundingFromPaymentIntent.ts` | `finalizeJobFundingFromPaymentIntent()` | `https://8fold.app/jobs/{jobId}` | When Stripe payment is captured and job status transitions from `DRAFT` → `OPEN_FOR_ROUTING` (line 195) |
| `apps/api/src/services/escrow/jobDraftSubmitService.ts` | `submitJobFromActiveDraft()` | `https://8fold.app/jobs/{jobId}` | When user submits draft with payment; job created with `OPEN_FOR_ROUTING` directly (line 165) |
| `apps/api/src/services/v4/jobFinalizeService.ts` | `finalizeJob()` | `https://8fold.app/jobs/{jobId}` | When user finalizes post-a-job flow; job created with `OPEN_FOR_ROUTING` (line 158) |
| `apps/api/app/api/job/create/route.ts` | `POST` handler | `https://8fold.app/jobs/{jobId}` | Legacy route; job created with `OPEN_FOR_ROUTING` (line 67) |
| `apps/api/src/services/v4/jobCreateService.ts` | (insert) | `https://8fold.app/jobs/{jobId}` | Job created with `OPEN_FOR_ROUTING` (line 175) |

**Canonical URL format**: `{canonicalDomain}/jobs/{jobId}` (uses `jobId`, not slug). See `apps/api/src/services/v4/seo/canonicalUrlService.ts` → `resolveJobUrl()`.

### 1.2 Contractor Profiles

- **File**: `apps/api/src/services/v4/seo/sitemapService.ts` — sitemap type `contractors`
- **URL format**: `https://8fold.app/contractors/{contractorId}`
- **Creation point**: Contractor profile activation is not yet traced in this audit; sitemap includes contractors from DB.

### 1.3 Location / Category Pages

- **Sitemap types**: `cities`, `service-locations`
- **URL format**: `/jobs/{country}/{region}/{city}/{service}` (e.g. `/jobs/ca/bc/vancouver/handyman`)
- **Enqueued by**: `seoEventHandler` on `JOB_PUBLISHED` via `enqueueJobIndexing()` → `seo_index_queue` → Vercel Cron

---

## Step 2 — Sitemap Generator

| Property | Value |
|----------|-------|
| **File** | `apps/api/src/services/v4/seo/sitemapService.ts` |
| **Function** | `getOrGenerateSitemap(type)` |
| **Types** | `index`, `jobs`, `services`, `contractors`, `cities`, `service-locations` |
| **Cache TTL** | 1 hour (`SITEMAP_TTL_MS = 60 * 60 * 1000`) |
| **Invalidation** | `invalidateSitemapCache(type)` — called by `safeSeoIndexAndSitemap()` on job indexing |

---

## Step 3 — Existing Ping Engine

| Property | Value |
|----------|-------|
| **File** | `apps/api/src/services/v4/seo/indexingService.ts` |
| **Functions** | `pingUrl(url, triggeredBy)` → calls `pingGoogle` + `pingIndexNow` |
| **Google** | `pingGoogle()` → `https://indexing.googleapis.com/v3/urlNotifications:publish` |
| **IndexNow** | `pingIndexNow()` → `https://api.indexnow.org/indexnow` |
| **Logging** | `seo_indexing_log` table (engine, url, status, response_code, error_message, triggered_by) |

**Invocation path** (when `JOB_PUBLISHED` is handled):

```
notificationEventMapper(JOB_PUBLISHED)
  → safeSeoIndexAndSitemap(jobId, "JOB_PUBLISHED")
    → resolveJobUrl(jobId)
    → pingUrl(jobUrl, "JOB_PUBLISHED")  // Google + IndexNow
    → invalidateSitemapCache("jobs")
    → invalidateSitemapCache("service-locations")
```

---

## Step 4 — Critical Gap: JOB_PUBLISHED Never Emitted

| Event | Emitted? | Where | SEO Triggered? |
|-------|----------|-------|----------------|
| `JOB_PUBLISHED` | **No** | Never emitted | Would trigger `safeSeoIndexAndSitemap` |
| `PAYMENT_CAPTURED` | **Yes** | `finalizeJobFundingFromPaymentIntent` (line 246) | No — only notifications |

**Flow today**:

1. Payment captured → `finalizeJobFundingFromPaymentIntent` updates job to `OPEN_FOR_ROUTING`
2. `PAYMENT_CAPTURED` emitted → `notificationEventMapper` sends notifications only
3. `JOB_PUBLISHED` handler exists but is never invoked
4. **Result**: No automatic indexing for new jobs

---

## Step 5 — Recommended Hook Points

### Option A (Preferred): Trigger indexing on PAYMENT_CAPTURED

When `PAYMENT_CAPTURED` fires, the job is funded and public. Add SEO indexing to the `PAYMENT_CAPTURED` case in `notificationEventMapper.ts`:

```ts
case "PAYMENT_CAPTURED": {
  const p = event.payload;
  // ... existing notification logic ...

  // SEO: job is now public — ping search engines (best-effort)
  if (mode === "best_effort") {
    void safeSeoIndexAndSitemap(p.jobId, "PAYMENT_CAPTURED");
  }
  return;
}
```

**Pros**: Single change; covers webhook path.  
**Cons**: Misses jobs created with `OPEN_FOR_ROUTING` directly (no payment capture event).

### Option B (Complete): Multi-point triggers

Trigger indexing at every point a job becomes public:

| Location | Trigger |
|----------|---------|
| `finalizeJobFundingFromPaymentIntent.ts` | After successful finalize, call `safeSeoIndexAndSitemap(job.id, "PAYMENT_CAPTURED")` |
| `jobDraftSubmitService.ts` | After job insert, call `safeSeoIndexAndSitemap(jobId, "JOB_DRAFT_SUBMIT")` |
| `jobFinalizeService.ts` | After job insert, call `safeSeoIndexAndSitemap(jobId, "JOB_FINALIZE")` |
| `job/create/route.ts` | After job insert, call `safeSeoIndexAndSitemap(jobId, "JOB_CREATE")` |
| `jobCreateService.ts` | After job insert, call `safeSeoIndexAndSitemap(jobId, "JOB_CREATE")` |

### Option C: Emit JOB_PUBLISHED and use existing handler

Emit `JOB_PUBLISHED` when a job becomes public, so the existing `JOB_PUBLISHED` handler runs:

1. **finalizeJobFundingFromPaymentIntent**: After status → `OPEN_FOR_ROUTING`, emit `JOB_PUBLISHED` (in addition to `PAYMENT_CAPTURED`)
2. **jobDraftSubmitService**: After job creation, emit `JOB_PUBLISHED` via `emitDomainEvent`
3. **jobFinalizeService**: After job creation, emit `JOB_PUBLISHED`
4. **job/create route**: After job creation, emit `JOB_PUBLISHED`

**Note**: `emitDomainEvent` calls `notificationEventMapper` directly (no outbox). The `seoEventHandler` (which enqueues location URLs to `seo_index_queue`) is only invoked from `processEventOutbox`, which reads `v4_event_outbox`. So emitting `JOB_PUBLISHED` via `emitDomainEvent` would trigger job-page indexing but **not** location-URL enqueue. To get both, either:
- Insert `JOB_PUBLISHED` into `v4_event_outbox` at each creation point, or
- Call `safeSeoIndexAndSitemap` + `enqueueJobIndexing` directly at each point

---

## Step 6 — Implementation Plan

### Minimal fix (Option A)

**File**: `apps/api/src/services/v4/notifications/notificationEventMapper.ts`

In the `PAYMENT_CAPTURED` case (around line 659), after the admin notification loop and before `return`, add:

```ts
// SEO: job is now public — ping search engines and invalidate sitemap (best-effort)
if (mode === "best_effort") {
  void safeSeoIndexAndSitemap(p.jobId, "PAYMENT_CAPTURED");
}
```

### Complete fix (Option B)

1. Extract `safeSeoIndexAndSitemap` from `notificationEventMapper.ts` into a shared module (e.g. `apps/api/src/services/v4/seo/triggerJobIndexing.ts`) to avoid circular imports.
2. Create `triggerJobIndexing(jobId, triggeredBy)` that:
   - Calls the extracted ping + sitemap invalidation logic
   - Optionally loads job location fields and calls `enqueueJobIndexing()` for location URLs
3. Call `triggerJobIndexing(jobId, "PAYMENT_CAPTURED")` (or appropriate trigger) from:
- `finalizeJobFundingFromPaymentIntent`
- `jobDraftSubmitService`
- `jobFinalizeService`
- `job/create` route
- `jobCreateService`

### Fallback / retry

- `safeSeoIndexAndSitemap` is fire-and-forget (`void`); errors are logged to `[SEO_AUTO_INDEX_ERROR]`
- `seo_indexing_log` records each ping (success/error) for debugging
- No built-in retry; consider a cron that re-pings failed URLs from `seo_indexing_log` if needed

### Logging

- `seo_indexing_log`: per-engine result (google, indexnow)
- Console: `[SEO_AUTO_INDEX_ERROR]` on exception

---

## Step 7 — Rate Safety

| Engine | Limit | Current behavior |
|--------|-------|------------------|
| **Google Indexing API** | 200 URLs/day (per [docs](https://developers.google.com/search/apis/indexing-api/v3/quota)) | 1 URL per new job; well under quota for typical volume |
| **IndexNow** | 10,000 URLs/day (per [docs](https://www.indexnow.org/documentation)) | 1 URL per new job; safe |

**Recommendations**:

- No batching needed for job-page URLs (1 per job)
- `seo_index_queue` (location URLs) is processed by Vercel Cron every 5 min, 50 URLs/batch — already rate-safe
- If volume grows, consider a dedicated queue for job URLs with batch submission to IndexNow

---

## Summary Table

| Component | File | Function |
|-----------|------|----------|
| **Public job creation (main)** | `finalizeJobFundingFromPaymentIntent.ts` | `finalizeJobFundingFromPaymentIntent()` |
| **Public job creation (draft submit)** | `jobDraftSubmitService.ts` | `submitJobFromActiveDraft()` |
| **Public job creation (finalize)** | `jobFinalizeService.ts` | `finalizeJob()` |
| **SEO ping service** | `indexingService.ts` | `pingUrl()`, `pingGoogle()`, `pingIndexNow()` |
| **Sitemap** | `sitemapService.ts` | `getOrGenerateSitemap()`, `invalidateSitemapCache()` |
| **Indexing trigger (existing)** | `notificationEventMapper.ts` | `safeSeoIndexAndSitemap()` on `JOB_PUBLISHED` |
| **Recommended hook** | `notificationEventMapper.ts` | Add `safeSeoIndexAndSitemap` to `PAYMENT_CAPTURED` + creation points |

---

## Next Steps

1. **Immediate**: Add `safeSeoIndexAndSitemap(p.jobId, "PAYMENT_CAPTURED")` to the `PAYMENT_CAPTURED` handler in `notificationEventMapper.ts`.
2. **Complete**: Add indexing triggers to `jobDraftSubmitService`, `jobFinalizeService`, `job/create`, and `jobCreateService` for jobs created directly as `OPEN_FOR_ROUTING`.
3. **Optional**: Insert `JOB_PUBLISHED` into `v4_event_outbox` at creation points so `seoEventHandler` enqueues location URLs; or call `enqueueJobIndexing` directly.
