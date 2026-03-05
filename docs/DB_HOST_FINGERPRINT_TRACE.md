# DB Host Fingerprint Trace

**Purpose:** Prove whether deployed API and local use the same database host/schema, and explain why local shows 5 eligible jobs while deployed returns 0.

**Constraint:** Diagnostic only. No business logic changes. All trace gated by `ENABLE_ROUTER_TRACE=true`.

---

## What Was Added

### Route (`apps/api/app/api/web/v4/router/available-jobs/route.ts`)

When `ENABLE_ROUTER_TRACE=true`:

- Request timestamp
- Code path marker
- `NODE_ENV`
- `VERCEL_ENV`
- **Sanitized DB fingerprint** (hostname, db name, schema) — no credentials, no full URL

### Service (`apps/api/src/services/v4/routerAvailableJobsService.ts`)

When trace enabled:

- **DB fingerprint query:**
  - `current_database`
  - `inet_server_addr` (server_addr)
  - `inet_server_port` (server_port)
  - `current_schema`

- **Counts:**
  - `jobs_count` — total rows in `jobs`
  - `router_profiles_count` — total rows in `router_profiles_v4`
  - `ca_bc_open_jobs` — CA/BC eligible jobs (full filter)

- **Router profile rows** for authenticated user (user_id, home_country_code, home_region_code)

- **Filter-stage counts** (unchanged):
  - jurisdiction only
  - + status OPEN_FOR_ROUTING
  - + routing_status UNROUTED
  - + contractor_user_id NULL
  - + cancel_request_pending false

---

## Deployment Instructions

1. Deploy API
2. Set `ENABLE_ROUTER_TRACE=true` in API production env (Vercel)
3. Log in as router and visit `/dashboard/router/jobs/available`
4. Capture Vercel logs for `/api/web/v4/router/available-jobs`

---

## Report Template (fill after log capture)

### Safe DB host fingerprint (from env)

| Field   | Local (.env.local) | Deployed (from logs) |
|---------|--------------------|----------------------|
| host    |                    |                      |
| db      |                    |                      |
| schema  |                    |                      |

### Runtime DB fingerprint (from DB query)

| Field            | Local | Deployed |
|------------------|-------|----------|
| current_database |       |          |
| server_addr      |       |          |
| server_port      |       |          |
| current_schema   |       |          |

### Counts

| Metric                | Local | Deployed |
|-----------------------|-------|----------|
| jobs_count            |       |          |
| router_profiles_count |       |          |
| ca_bc_open_jobs       |       |          |

### Router profile rows for authed user

| user_id | home_country_code | home_region_code |
|---------|-------------------|------------------|
|         |                   |                  |

### Filter-stage counts (deployed)

| Stage | Count |
|-------|-------|
| 1 jurisdiction_only | |
| 2 +status | |
| 3 +routing_status | |
| 4 +contractor_null | |
| 5 +cancel_pending | |

---

## Conclusion

- **Same DB as local?** Compare host, db, schema. If different → env drift.
- **Same data as local?** Compare jobs_count, ca_bc_open_jobs. If different → different DB or branch.
- **Router profile exists?** If router_profiles_v4_row_count=0 for user → profile missing, early exit.
- **Filter collapse?** If stage 5 > 0 but response=0 → post-query or expireStaleInvitesAndResetJobs.
