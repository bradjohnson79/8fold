# Router Available Jobs Runtime Trace Audit

**Purpose:** Fact-only runtime trace to determine why deployed `/api/web/v4/router/available-jobs` returns 0 jobs while direct DB audits show eligible jobs exist.

**Constraint:** Diagnostic only. No business logic changes. All trace gated by `ENABLE_ROUTER_TRACE=true`.

---

## What Was Added

### Route Handler (`apps/api/app/api/web/v4/router/available-jobs/route.ts`)

When `ENABLE_ROUTER_TRACE=true`:

- Request received timestamp
- Code path marker: `TRACE_SOURCE`
- Auth passed yes/no
- Authenticated user id, role (when auth passes)
- Response jobs count, first job id, response shape
- Caught error message (when error occurs)

### Service (`apps/api/src/services/v4/routerAvailableJobsService.ts`)

When `ENABLE_ROUTER_TRACE=true` and trace opts passed from route:

- **Code path marker:** `TRACE_SERVICE_SOURCE`
- **Phase 4 — Auth/profile consistency:**
  - User exists in users table
  - User role
  - `router_profiles_v4` row count for user
  - Warning if multiple rows
  - `home_country_code`, `home_region_code` for each profile

- **Step A — Router profile resolution:**
  - Router user id passed
  - Profile found yes/no
  - `homeCountryCode`, `homeRegionCode` (raw)
  - Resolved `routerCountry`, `routerRegionCode`
  - Early exit if invalid region

- **Step B — Filter stage counts:**

  | Stage | Filter | Log key |
  |-------|--------|---------|
  | 1 | Jurisdiction only (country_code, region_match, archived_at IS NULL) | `filter_stage_1_jurisdiction_only` |
  | 2 | + status = OPEN_FOR_ROUTING | `filter_stage_2_plus_status_OPEN_FOR_ROUTING` |
  | 3 | + routing_status = UNROUTED | `filter_stage_3_plus_routing_status_UNROUTED` |
  | 4 | + contractor_user_id IS NULL | `filter_stage_4_plus_contractor_user_id_NULL` |
  | 5 | + cancel_request_pending = false | `filter_stage_5_plus_cancel_request_pending_false` |

- **Step C — Sample rows:** Up to 5 rows with id, title, status, routing_status, country_code, region_code, state_code, city, cancel_request_pending
- **Final result count**
- **Service caught error** (when error occurs)

---

## Deployment + Verification Instructions

1. **Deploy API** with the trace changes.

2. **Set environment variable** in deployed API (Vercel):

   ```bash
   ENABLE_ROUTER_TRACE=true
   ```

3. **Log in** as the router on deployed web.

4. **Visit** `/dashboard/router/jobs/available`.

5. **Capture** the API logs from Vercel for the request to `/api/web/v4/router/available-jobs`.

---

## How to Interpret Log Output

After capturing logs, fill in this report:

| Field | Value (from logs) |
|-------|-------------------|
| **authenticated_router_user_id** | `authenticated_user_id=...` |
| **router_profile_found** | `step_a router_profile_found=yes/no` |
| **home_country_code** | `step_a homeCountryCode=...` |
| **home_region_code** | `step_a homeRegionCode=...` |
| **resolved_routerCountry** | `step_a resolved routerCountry=...` |
| **resolved_routerRegionCode** | `step_a resolved routerRegionCode=...` |
| **filter_stage_1_count** | `filter_stage_1_jurisdiction_only count=...` |
| **filter_stage_2_count** | `filter_stage_2_plus_status_OPEN_FOR_ROUTING count=...` |
| **filter_stage_3_count** | `filter_stage_3_plus_routing_status_UNROUTED count=...` |
| **filter_stage_4_count** | `filter_stage_4_plus_contractor_user_id_NULL count=...` |
| **filter_stage_5_count** | `filter_stage_5_plus_cancel_request_pending_false count=...` |
| **final_result_count** | `step_c final_result_count=...` |
| **response_jobs_count** | `response_jobs_count=...` |
| **code_path_route** | `code_path=...` |
| **code_path_service** | `service_source=...` |

---

## Root Cause Conclusion (fill after log capture)

- **If stage 1 count = 0:** No jobs in router jurisdiction. Check DB vs deployed env.
- **If stage 1 > 0 but stage 2 = 0:** Status mismatch (jobs not OPEN_FOR_ROUTING).
- **If stage 2 > 0 but stage 3 = 0:** routing_status mismatch (not UNROUTED).
- **If stage 3 > 0 but stage 4 = 0:** contractor_user_id assigned.
- **If stage 4 > 0 but stage 5 = 0:** cancel_request_pending = true.
- **If stage 5 > 0 but response = 0:** Check expireStaleInvitesAndResetJobs or post-query logic.
- **If profile_found = no:** Router has no router_profiles_v4 row; service returns [] early.
- **If profile home_region_code invalid:** Early exit (empty or not 2 chars).

---

## Safety

- All diagnostics gated by `ENABLE_ROUTER_TRACE=true`
- Server-side only
- No secrets logged
- No raw DATABASE_URL logged
- No business logic or query filter changes
