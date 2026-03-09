# Dashboard Completion State — Diagnosis Report

**Date:** March 8, 2026  
**Job ID:** `52d7114d-0daf-48eb-95e4-4efaa81ff6ba`  
**Symptom:** Contractor and Job Poster dashboards show pre-completion state after hard refresh, despite job being completed in the system.

---

## STEP 1 — DATABASE JOB STATE

**Query:**
```sql
SELECT
  id,
  status,
  contractor_user_id,
  contractor_marked_complete_at,
  poster_marked_complete_at,
  completed_at,
  completion_window_expires_at,
  job_poster_user_id
FROM jobs
WHERE id = '52d7114d-0daf-48eb-95e4-4efaa81ff6ba';
```

**To run:** Execute the script:
```bash
DOTENV_CONFIG_PATH=apps/api/.env.local npx tsx scripts/verify-job-completion-state.ts
```

**Note:** The schema uses `contractor_marked_complete_at` and `poster_marked_complete_at` (not `contractor_completed_at` / `job_poster_completed_at`). The `completed_at` column is set when both reports are submitted.

**Expected for completed job:**
- `status` = `'COMPLETED'`
- `contractor_marked_complete_at` IS NOT NULL
- `poster_marked_complete_at` IS NOT NULL
- `completed_at` IS NOT NULL

---

## STEP 2 — ASSIGNMENT STATE

**Query:**
```sql
SELECT
  job_id,
  contractor_user_id,
  status,
  assigned_at
FROM v4_job_assignments
WHERE job_id = '52d7114d-0daf-48eb-95e4-4efaa81ff6ba';
```

**Note:** `v4_job_assignments` has no `completed_at` column. The `status` must be `'COMPLETED'` for the job to appear in contractor's completed list (from jobs table, not assignments).

**Contractor summary uses two sources:**
- `assignedJobsCount` → `listJobs(userId, "assigned")` → `v4_job_assignments` WHERE status IN (ASSIGNED, IN_PROGRESS)
- `fullyCompletedJobs` (and `completedJobsCount`) → `jobs` table WHERE contractor_user_id = userId AND completed_at IS NOT NULL AND status = 'COMPLETED'

---

## STEP 3 — SUMMARY API RESPONSES

**Endpoints:**
- `GET /api/web/v4/contractor/dashboard/summary` (Bearer token required)
- `GET /api/web/v4/job-poster/dashboard/summary` (Bearer token required)

**To capture:** Open DevTools → Network → hard refresh dashboard → find the summary request → copy response JSON.

**Expected shape for completed job:**

Contractor:
```json
{
  "completedJobsCount": 1,
  "fullyCompletedJobs": [{ "jobId": "...", "title": "...", "completedAt": "...", "payoutStatus": "...", "contractorPayoutCents": ... }]
}
```

Job Poster:
```json
{
  "awaitingPosterReport": [],
  "fullyCompletedJobs": [{ "jobId": "...", "title": "...", "completedAt": "...", "hasReview": false }]
}
```

---

## STEP 4 — SUMMARY QUERY FILTERS

### jobPosterSummaryService.ts

| Field | WHERE clause | Excludes COMPLETED? |
|-------|--------------|---------------------|
| **activeAssignments** | `status IN ('ASSIGNED','PUBLISHED','JOB_STARTED','IN_PROGRESS','CONTRACTOR_COMPLETED')` | **YES** — COMPLETED not in list |
| **awaitingPosterReport** | `contractor_marked_complete_at IS NOT NULL AND poster_marked_complete_at IS NULL AND completed_at IS NULL` | N/A (mid-flow) |
| **fullyCompletedJobs** | `completed_at IS NOT NULL AND status = 'COMPLETED'` | **NO** — explicitly includes COMPLETED |

### contractor/dashboard/summary/route.ts (inline queries)

| Field | WHERE clause | Excludes COMPLETED? |
|-------|--------------|---------------------|
| **assignedJobsCount** | Via `listJobs("assigned")` → v4_job_assignments status IN (ASSIGNED, IN_PROGRESS) | **YES** — completed jobs have assignment status COMPLETED |
| **awaitingPosterCompletion** | `contractor_marked_complete_at IS NOT NULL AND poster_marked_complete_at IS NULL AND completed_at IS NULL` | N/A |
| **fullyCompletedJobs** | `contractor_user_id = userId AND completed_at IS NOT NULL AND status = 'COMPLETED'` | **NO** — explicitly includes COMPLETED |

**Conclusion:** Summary queries do **not** incorrectly exclude COMPLETED jobs. `fullyCompletedJobs` and `completedRows` explicitly require `status = 'COMPLETED'` and `completed_at IS NOT NULL`.

---

## STEP 5 — DASHBOARD UI CONDITIONS

### Job Poster (JobPosterOverviewClient.tsx)

| Card | Boolean expression |
|------|--------------------|
| **Hide "Great news!"** | `acceptNotifs.length > 0 && !hasCompletionCards` |
| **hasCompletionCards** | `beyondAcceptance \|\| awaitingReport.length > 0 \|\| completedJobs.length > 0` |
| **beyondAcceptance** | `effectiveState && ["CONTRACTOR_COMPLETED","AWAITING_POSTER_COMPLETION","COMPLETED","PAID","REVIEW_STAGE"].includes(effectiveState)` |
| **Show completion reminder** | `(overrideState && ["CONTRACTOR_COMPLETED","AWAITING_POSTER_COMPLETION"].includes(overrideState)) \|\| awaitingReport.length > 0` |
| **Show completed card** | `(overrideState === "COMPLETED" \|\| overrideState === "REVIEW_STAGE") \|\| completedJobs.length > 0` |

**Data source:** `awaitingReport = summary?.awaitingPosterReport ?? []`, `completedJobs = summary?.fullyCompletedJobs ?? []`

**If `fullyCompletedJobs` is empty:** `completedJobs.length === 0` → `hasCompletionCards` is false (unless override or awaitingReport) → "Great news!" stays visible.

### Contractor (ContractorOverviewClient.tsx)

| Card | Boolean expression |
|------|--------------------|
| **Show Completed Job Actions** | `showCompletedActionsByOverride \|\| hasRealCompletedActions` |
| **hasRealCompletedActions** | `(awaitingPosterCompletion.length > 0 \|\| fullyCompletedJobs.length > 0) && !showCompletedActionsByOverride` |

**Data source:** `summary?.awaitingPosterCompletion`, `summary?.fullyCompletedJobs`

**If `fullyCompletedJobs` is empty:** No completed cards render.

---

## STEP 6 — CACHING STATUS

**apiFetch** (routerApi.ts):
```ts
return fetch(apiUrl(path), {
  ...init,
  headers: { authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  cache: "no-store",  // <-- present
});
```

**Conclusion:** Dashboard fetches use `cache: "no-store"`. Next.js caching is **not** the cause.

---

## STEP 7 — ROOT CAUSE ANALYSIS

### Most likely causes (in order)

1. **Database state mismatch**
   - Job `52d7114d` may not have `status = 'COMPLETED'` and `completed_at` set.
   - If the completion flow used a different path (e.g. legacy or timeout worker), the job row might not have been updated.
   - **Action:** Run the DB query (Step 1) and confirm the row.

2. **User ID mismatch**
   - Job `job_poster_user_id` or `contractor_user_id` may not match the logged-in user.
   - Summary queries filter by `userId` from the session. If the job belongs to a different user, it won't appear.
   - **Action:** Compare `job_poster_user_id` / `contractor_user_id` from the DB with the logged-in user's ID from `/api/app/me`.

3. **v4_job_assignments not updated**
   - Contractor `fullyCompletedJobs` comes from the **jobs** table, not from `v4_job_assignments`. So assignment status does not affect contractor completed count.
   - Job Poster uses the same jobs table.

4. **API not reaching production**
   - If the deployed API is an older build, the summary queries may differ from the current codebase.
   - **Action:** Confirm the deployed API version and that PR #281 (or equivalent) is live.

### Checklist for verification

- [ ] Run `scripts/verify-job-completion-state.ts` and confirm job row has `status`, `completed_at`, `contractor_marked_complete_at`, `poster_marked_complete_at`.
- [ ] Verify `job_poster_user_id` and `contractor_user_id` match the users viewing the dashboards.
- [ ] Capture `/api/web/v4/contractor/dashboard/summary` and `/api/web/v4/job-poster/dashboard/summary` responses in Network tab.
- [ ] Confirm `fullyCompletedJobs` is present and non-empty in the response when the job is completed.

---

## Summary

| Layer | Status |
|-------|--------|
| **Summary query filters** | Correct — COMPLETED jobs are included |
| **Dashboard UI conditions** | Correct — cards render when `fullyCompletedJobs.length > 0` |
| **Caching** | Correct — `cache: "no-store"` used |
| **Suspected** | DB state or user ID mismatch |

**Next step:** Run the DB verification script and capture the actual API responses to pinpoint the failing link.
