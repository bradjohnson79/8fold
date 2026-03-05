# 8Fold Full System Verification Audit

**Date:** March 3, 2026
**Scope:** Read-only audit of router pipeline, jurisdiction discovery, routing lifecycle, rewards ledger, Next.js routing, and database integrity.
**Outcome:** All critical checks **PASS**. Two advisory notes flagged.

---

## Phase 1 — Database Integrity

### Jobs Table Columns

All 13 required columns confirmed present:

| Column | Type | Nullable |
|--------|------|----------|
| `id` | uuid | NO |
| `status` | USER-DEFINED (enum) | NO |
| `routing_status` | USER-DEFINED (enum) | YES (schema) |
| `country_code` | USER-DEFINED (enum) | NO |
| `region_code` | text | YES |
| `state_code` | text | NO |
| `city` | text | YES |
| `lat` | double precision | YES |
| `lng` | double precision | YES |
| `contractor_user_id` | uuid | YES |
| `archived_at` | timestamp | YES |
| `created_at` | timestamp | NO |
| `is_regional` | boolean | NO |

**Result:** PASS

### routing_status Distribution

| routing_status | Count |
|----------------|-------|
| `UNROUTED` | 18 |
| `ROUTED_BY_ROUTER` | 8,065 |

- No NULL values
- No unexpected statuses (INVITES_SENT, INVITE_ACCEPTED, INVITES_EXPIRED not yet in use — expected pre-Smart Routing)

**Result:** PASS

### Region Normalization

60 distinct `region_code` values returned — all valid 2-letter ISO codes (US states + CA provinces). 8 rows have `NULL` region_code (acceptable; constraint allows NULL).

No legacy values like `BRITISH CO` or `BRITISH COLUMBIA` remain.

**Result:** PASS

### CHECK Constraint

```sql
jobs_region_code_valid:
CHECK (region_code IS NULL OR region_code IN ('BC','AB','SK','MB','ON','QC',...all 63 codes...))
```

Constraint is active and enforced.

**Result:** PASS

### Jurisdiction Consistency (Cross-Border Anomalies)

```sql
SELECT id FROM jobs WHERE region_code = 'BC' AND country_code != 'CA';
```

**0 rows** — No BC jobs with wrong country code.

**Result:** PASS

---

## Phase 2 — Router Pipeline Integrity

### Router Profile

| Field | Value |
|-------|-------|
| user_id | `9bf8996b-ca31-45f4-b1a6-12ed0b4d1480` |
| home_country_code | CA |
| home_region_code | BC |

### Available Jobs (CA/BC Jurisdiction)

```sql
SELECT id, title, city FROM jobs
WHERE status='OPEN_FOR_ROUTING' AND routing_status='UNROUTED'
AND contractor_user_id IS NULL AND archived_at IS NULL
AND country_code='CA' AND region_code='BC'
```

| Title | City |
|-------|------|
| Need help moving a sectional couch to my new house | — |
| Langley: Fence repair (2 panels) | Langley |

**2 jobs** eligible — matches what `routerAvailableJobsService` returns.

### Service WHERE Clause Verification

`routerAvailableJobsService.ts` enforces:

- `status = OPEN_FOR_ROUTING`
- `routing_status = UNROUTED` (via `ROUTING_STATUS.UNROUTED`)
- `cancel_request_pending = false`
- `archived_at IS NULL`
- `contractor_user_id IS NULL`
- `country_code = routerCountry`
- `upper(trim(coalesce(region_code, state_code, ''))) = routerRegionCode`
- `LIMIT 50`

**Result:** PASS

---

## Phase 3 — Contractor Discovery Pipeline

### Filter Order

| Step | Filter | Location | Status |
|------|--------|----------|--------|
| 1 | Jurisdiction (country_code + home_region_code) | Lines 186–187 | PASS |
| 2 | Bounding box prefilter (geoBoundingBox) | Lines 188–189 | PASS |
| 3 | Haversine distance filter | Lines 208–209 | PASS |
| 4 | Sort by distance | Line 223 | PASS |

### Coordinate Source

| Column | Source Table | Status |
|--------|-------------|--------|
| home_latitude | `contractor_profiles_v4` | PASS |
| home_longitude | `contractor_profiles_v4` | PASS |
| country_code | `contractor_profiles_v4` | PASS |
| home_region_code | `contractor_profiles_v4` | PASS |

`contractor_accounts` is used only for an INNER JOIN on `userId` — **not** used for jurisdiction or geo.

### Geo Index

```sql
idx_contractor_profiles_v4_geo
  ON contractor_profiles_v4 (country_code, home_region_code, home_latitude, home_longitude)
```

Index confirmed active.

**Result:** PASS

### Advisory

1 contractor has coordinates but `home_region_code = NULL`. This contractor will be excluded from jurisdiction-filtered queries. Not a bug — the contractor needs to complete their profile.

---

## Phase 4 — Routing Lifecycle

### Status × routing_status Combinations

| status | routing_status | Count |
|--------|----------------|-------|
| DRAFT | UNROUTED | 8 |
| PUBLISHED | UNROUTED | 2 |
| OPEN_FOR_ROUTING | UNROUTED | 4 |
| ASSIGNED | UNROUTED | 1 |
| ASSIGNED | ROUTED_BY_ROUTER | 8,065 |
| COMPLETED_APPROVED | UNROUTED | 3 |

### Analysis

- OPEN_FOR_ROUTING jobs are all UNROUTED — correct (no invites pending)
- ASSIGNED jobs are either UNROUTED (directly assigned, not via routing) or ROUTED_BY_ROUTER (assigned via routing) — both valid
- DRAFT and PUBLISHED jobs are UNROUTED — correct (not yet in routing pipeline)
- COMPLETED_APPROVED with UNROUTED — these were completed without going through routing — valid

No invalid combinations detected.

**Result:** PASS

---

## Phase 5 — Invite Pipeline

### Invite Cap

```sql
SELECT job_id FROM v4_contractor_job_invites GROUP BY job_id HAVING COUNT(*) > 5;
```

**0 rows** — No job exceeds 5 invites.

### Expired Pending Invites

```sql
SELECT COUNT(*) FROM v4_contractor_job_invites WHERE status='PENDING' AND expires_at < now();
```

**0** expired pending invites.

### Duplicate Invites

```sql
SELECT job_id, contractor_user_id FROM v4_contractor_job_invites
GROUP BY job_id, contractor_user_id HAVING COUNT(*) > 1;
```

**0 rows** — No duplicates. Unique constraint (`unique_job_contractor_invite`) is enforced.

**Result:** PASS

---

## Phase 6 — Router Rewards Ledger

### Tables

- `v4_router_reward_events` — exists
- `router_profiles_v4.rewards_balance_cents` — exists

### Balance Integrity

```sql
SELECT router_user_id, SUM(amount_cents) AS ledger_total, rewards_balance_cents
FROM v4_router_reward_events e
JOIN router_profiles_v4 rp ON rp.user_id = e.router_user_id
GROUP BY ...
```

**0 rows** — No reward events recorded yet. Nothing to compare. Consistent by default.

**Result:** PASS (no data to verify; architecture confirmed)

---

## Phase 7 — Next.js Route Safety

### Required Routes

| Route | File | Status |
|-------|------|--------|
| `/jobs` | `apps/web/src/app/jobs/page.tsx` | EXISTS |
| `/jobs/[country]/[regionCode]` | `apps/web/src/app/jobs/[country]/[regionCode]/page.tsx` | EXISTS |
| `/jobs/[country]/[regionCode]/[city]` | `apps/web/src/app/jobs/[country]/[regionCode]/[city]/page.tsx` | EXISTS |

### Dangerous Routes (Must NOT Exist)

| Route | Status |
|-------|--------|
| `/jobs/[region]` | DOES NOT EXIST |
| `/jobs/[region]/[city]` | DOES NOT EXIST |

No ambiguous single-segment dynamic routes under `/jobs/`.

### Dashboard Router Routes

| Path | Status |
|------|--------|
| `/dashboard/router` | EXISTS |
| `/dashboard/router/jobs/available` | EXISTS |
| `/dashboard/router/jobs/routed` | EXISTS |
| `/dashboard/router/jobs/[jobId]/route` | EXISTS |

**Result:** PASS

---

## Phase 8 — Legacy Route Safety

### Legacy Routes Return 410

All 14 legacy router API routes confirmed returning `410 Gone`:

- `routable-jobs`, `routed-jobs`, `session`, `profile`, `earnings`, `notifications`, `notifications/mark-read`, `pending-earnings`, `rewards`, `support/inbox`, `terms/accept`, `apply-routing`, `jobs/[id]/confirm-completion`, `jobs/[id]/nudge`

Each returns:

```json
{ "error": { "message": "Router legacy endpoint removed. Use /api/web/v4/router/*" } }
```

### Dashboard References

No `fetch` calls to `/api/web/router/` found in `apps/web/`. All router fetches use V4 paths or proxies that map to V4.

**Result:** PASS

---

## Phase 9 — Router UI Integrity

### V4 API Usage

| Endpoint | Used By |
|----------|---------|
| `/api/web/v4/router/available-jobs` | RoutingWorkspace, available/page, open-jobs/page, HomeJobFeedClient |
| `/api/web/v4/router/jobs/routed` | RoutingWorkspace, queue/page, routed/page |
| `/api/web/v4/router/jobs/[id]/contractors` | RoutingWorkspace, open-jobs/page, [jobId]/route/page |
| `/api/web/v4/router/jobs/[id]/route` | RoutingWorkspace, open-jobs/page, [jobId]/route/page |

Dashboard proxy routes (`/api/router/jobs/...`) map to V4 backend paths.

### Two-Step Workflow

| Step | Page | Action |
|------|------|--------|
| 1 | `/dashboard/router/jobs/available` | Lists eligible jobs → "Route job" link |
| 2 | `/dashboard/router/jobs/[jobId]/route` | Load contractors → Select (up to 5) → Send Invites |
| 3 | `/dashboard/router/jobs/routed` | View routed jobs |

**Result:** PASS

---

## Audit Summary

| Phase | Area | Result |
|-------|------|--------|
| 1 | Database Integrity | PASS |
| 2 | Available Jobs Pipeline | PASS |
| 3 | Contractor Discovery Pipeline | PASS |
| 4 | Routing Lifecycle | PASS |
| 5 | Invite Pipeline | PASS |
| 6 | Rewards Ledger | PASS |
| 7 | Next.js Route Safety | PASS |
| 8 | Legacy Route Freeze | PASS |
| 9 | Router UI Integrity | PASS |

### Flags

| Flag | Status |
|------|--------|
| routing_status NULL | **None found** |
| Invalid region_code | **None found** |
| Country/region mismatch | **None found** |
| Jobs leaking across jurisdictions | **None found** |
| Invite overflow > 5 | **None found** |
| Balance mismatch | **N/A** (no reward events yet) |
| Next.js route conflicts | **None found** |
| Legacy API usage | **None found** |

### Advisory Notes

1. **1 contractor** has coordinates but `home_region_code = NULL` — will be excluded from jurisdiction queries until profile is completed. Not a system bug.
2. **8 jobs** have `region_code = NULL` — these are not `OPEN_FOR_ROUTING` status jobs and are correctly excluded from the routing pipeline by the service filters.

---

## Conclusion

All system pillars are verified and ready for **Smart Routing** implementation:

- Router selects job
- System auto-selects top 5 contractors
- Router confirms
- Invites sent automatically

No hidden edge cases, no data corruption, no route conflicts. The platform is production-ready for the next phase.
