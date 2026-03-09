# Router Contractors 409 Conflict — Full Diagnosis

**Endpoint:** `GET /api/web/v4/router/jobs/{jobId}/contractors`  
**Error:** HTTP 409 Conflict  
**Job ID (from error):** `52d7114d-0daf-48eb-95e4-4efaa81ff6ba`

---

## PART 1 — Route Handler

**File:** `apps/api/app/api/web/v4/router/jobs/[jobId]/contractors/route.ts`

**HTTP method:** GET

**Guards / early returns:**
- `requireV4Role(req, "ROUTER")` → 401/403 if not authenticated or wrong role
- `!jobId` → 400 Invalid job ID

**All 409 return conditions:**

| Line | Condition | Code | Message |
|------|-----------|------|---------|
| 30-34 | `result.kind === "job_not_available"` | V4_JOB_NOT_AVAILABLE | Job not available |
| 36-40 | `result.kind === "missing_job_coords"` | V4_MISSING_COORDS | Job location coordinates are missing |

**Service called:** `getStage2JobContractors(jobId)` from `routerStage2ContractorSelectionService.ts`

---

## PART 2 — Service Layer

**Function:** `getStage2JobContractors`  
**File:** `apps/api/src/services/v4/routerStage2ContractorSelectionService.ts`  
**Parameters:** `jobId: string` (no router_user_id)

**Guard conditions (lines 263-267):**

```ts
const job = await fetchJobSnapshot(jobId);
if (!job) return { kind: "not_found" };                                    // → 404
if (job.status !== "OPEN_FOR_ROUTING") return { kind: "job_not_available" }; // → 409
if (!Number.isFinite(job.lat) || !Number.isFinite(job.lng)) return { kind: "missing_job_coords" }; // → 409
```

**Note:** Contractor retrieval does **not** check `routing_status`. Only `status`, `lat`, and `lng` are validated.

---

## PART 3 — Job State Logic

**SQL used to retrieve job** (`fetchJobSnapshot`, lines 109-128):

```sql
SELECT id, title, city, region, state_code, country_code, region_code,
       trade_category, job_type, is_regional, status, lat, lng
FROM jobs
WHERE id = $jobId
LIMIT 1
```

**Required conditions for contractor retrieval:**

| Condition | Checked? | Failing → Result |
|-----------|----------|-----------------|
| `status = 'OPEN_FOR_ROUTING'` | ✅ Line 266 | job_not_available (409) |
| `lat` finite | ✅ Line 267 | missing_job_coords (409) |
| `lng` finite | ✅ Line 267 | missing_job_coords (409) |
| `routing_status = UNROUTED` | ❌ Not checked | N/A |
| `contractor_user_id IS NULL` | ❌ Not checked | N/A |
| `cancel_request_pending = false` | ❌ Not checked | N/A |
| `archived_at IS NULL` | ❌ Not checked | N/A |

**Important:** Available Jobs filters by `status`, `routing_status`, `contractor_user_id`, etc., but **does not filter by `lat`/`lng`**. Jobs with null coordinates can appear in Available Jobs but fail contractor retrieval with 409.

---

## PART 4 — Contractor Query Logic

**Tables:** `contractor_profiles_v4` INNER JOIN `contractor_accounts` (on userId)

**Eligibility conditions:**
- `country_code` = job.country_code
- `home_region_code` = job.region_code
- `home_latitude` BETWEEN bounds (geo bounding box)
- `home_longitude` BETWEEN bounds
- `trade_categories` contains job.trade_category
- `home_latitude` / `home_longitude` finite (post-filter)

**No explicit filters on:** `status`, `approved`, `wizardCompleted`, `stripeAccountId`

**Conditions that could return zero contractors:**
- No contractors in jurisdiction (country/region)
- No contractors within bounding box
- No contractors with matching trade category
- All contractors filtered out by haversine distance

**Important:** Zero contractors returns 200 with `contractors: []`, not 409. The 409 comes only from job state guards.

---

## PART 5 — Schema Verification

| Table | Field | Exists | Notes |
|-------|-------|--------|-------|
| contractor_profiles_v4 | home_latitude | ✅ | NOT NULL |
| contractor_profiles_v4 | home_longitude | ✅ | NOT NULL |
| contractor_profiles_v4 | home_region_code | ✅ | |
| contractor_profiles_v4 | country_code | ✅ | |
| contractor_profiles_v4 | trade_categories | ✅ | jsonb |
| contractor_accounts | (join only) | ✅ | No extra filters |
| jobs | lat | ✅ | Nullable |
| jobs | lng | ✅ | Nullable |

**Schema mismatch:** `jobs.lat` and `jobs.lng` are nullable. Contractor retrieval requires them to be finite.

---

## PART 6 — Runtime Conditions

Contractor query does **not** filter by:
- `isApproved`
- `wizardCompleted`
- `stripeAccountId`

The INNER JOIN on `contractor_accounts` only requires a row to exist. No extra eligibility checks.

---

## PART 7 — Return Payload Shape

**Service:** `Stage2ContractorCard`
```ts
{ contractorId, businessName, contactName, tradeCategory, yearsExperience, city, distanceKm, availabilityStatus }
```

**Frontend** (`/dashboard/router/jobs/[jobId]/route/page.tsx`):
```ts
type EligibleContractor = {
  contractorId, businessName, contactName, tradeCategory, yearsExperience, city, distanceKm, availabilityStatus
};
```

**Match:** ✅ Fields align.

---

## PART 8 — Final Diagnosis

### Root cause

The 409 is caused by one of:

1. **`job_not_available`** — `job.status !== 'OPEN_FOR_ROUTING'`
2. **`missing_job_coords`** — `job.lat` or `job.lng` is null, undefined, or not finite

### Most likely cause: `missing_job_coords`

- Available Jobs does **not** require `lat`/`lng`.
- Contractor retrieval **does** require finite `lat`/`lng` for geo filtering.
- Jobs with null coordinates can appear in Available Jobs but fail contractor retrieval with 409.

### Verify for job `52d7114d-0daf-48eb-95e4-4efaa81ff6ba`

```sql
SELECT id, title, status, routing_status, lat, lng, country_code, region_code
FROM jobs
WHERE id = '52d7114d-0daf-48eb-95e4-4efaa81ff6ba';
```

If `lat` or `lng` is NULL → 409 `missing_job_coords`.  
If `status` ≠ `OPEN_FOR_ROUTING` → 409 `job_not_available`.

### Exact code causing 409

**File:** `apps/api/src/services/v4/routerStage2ContractorSelectionService.ts`  
**Lines 266-267:**

```ts
if (job.status !== "OPEN_FOR_ROUTING") return { kind: "job_not_available" };
if (!Number.isFinite(job.lat) || !Number.isFinite(job.lng)) return { kind: "missing_job_coords" };
```

### Category

- **Job state** — either `status` or `lat`/`lng` is invalid for contractor retrieval.

### Recommended fix

**Option A — Align Available Jobs with contractor retrieval**

Add `lat`/`lng` to the Available Jobs filter so jobs without coordinates never appear:

```ts
// In routerAvailableJobsService.ts, add to the WHERE clause:
sql`${jobs.lat} IS NOT NULL AND ${jobs.lng} IS NOT NULL`,
sql`${jobs.lat} = ${jobs.lat}`, // finite check via application
```

Or filter in the service after the query by excluding rows where `lat`/`lng` are null/non-finite.

**Option B — Backfill coordinates**

Ensure jobs have valid `lat`/`lng` (e.g. geocode on publish or from address).

**Option C — Improve error handling**

Return a clearer error when coordinates are missing, e.g.:

```ts
if (!Number.isFinite(job.lat) || !Number.isFinite(job.lng)) {
  return { kind: "missing_job_coords" }; // Message: "Job location coordinates are missing"
}
```

---

## Summary

| Item | Value |
|------|-------|
| **Root cause** | Job state: `status !== OPEN_FOR_ROUTING` or invalid `lat`/`lng` |
| **File** | `apps/api/src/services/v4/routerStage2ContractorSelectionService.ts` |
| **Lines** | 266-267 |
| **Failing condition** | `job.status !== "OPEN_FOR_ROUTING"` OR `!Number.isFinite(job.lat) \|\| !Number.isFinite(job.lng)` |
| **Recommended fix** | Filter Available Jobs by valid `lat`/`lng`, or backfill coordinates for jobs |
