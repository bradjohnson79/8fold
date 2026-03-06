-- Router Available Jobs Full Forensic Diagnostic
-- Target router: user_id = '9bf8996b-ca31-45f4-b1a6-12ed0b4d1480', email = 'brad@aetherx.co'
-- Run in order. Use same DB as API (DATABASE_URL from apps/api/.env.local).
--
-- Run with psql: psql "$DATABASE_URL" -f scripts/router_available_jobs_forensic.sql
-- Or use TS runner: pnpm exec tsx scripts/run-router-available-jobs-forensic.ts

\echo ''
\echo '========== Section 0 — Database fingerprint =========='

SELECT
  current_database()                AS current_database,
  current_schema()                 AS current_schema,
  inet_server_addr()::text         AS server_addr,
  inet_server_port()               AS server_port,
  now()                            AS db_now;

SELECT
  (SELECT COUNT(*) FROM jobs)                AS jobs_count,
  (SELECT COUNT(*) FROM router_profiles_v4)  AS router_profiles_count,
  (SELECT COUNT(*) FROM "User")              AS users_count;

\echo ''
\echo '========== Section 1 — Confirm authenticated router identity target =========='

SELECT
  u.id,
  u.email,
  u.role,
  rp.user_id              AS router_profile_user_id,
  rp.contact_name,
  rp.phone,
  rp.home_country_code,
  rp.home_region_code,
  rp.home_region,
  rp.home_latitude,
  rp.home_longitude
FROM "User" u
LEFT JOIN router_profiles_v4 rp
  ON rp.user_id = u.id
WHERE u.id = '9bf8996b-ca31-45f4-b1a6-12ed0b4d1480'
   OR u.email = 'brad@aetherx.co';

\echo '-- Duplicate router profile rows (should be empty):'

SELECT
  user_id,
  COUNT(*) AS cnt
FROM router_profiles_v4
GROUP BY user_id
HAVING COUNT(*) > 1;

\echo ''
\echo '========== Section 2 — Router jurisdiction sanity =========='

SELECT
  user_id,
  home_country_code,
  home_region_code,
  UPPER(TRIM(COALESCE(home_country_code, ''))) AS normalized_country,
  UPPER(TRIM(COALESCE(home_region_code, '')))  AS normalized_region
FROM router_profiles_v4
WHERE user_id = '9bf8996b-ca31-45f4-b1a6-12ed0b4d1480';

\echo '-- Profile field null/blank check:'

SELECT
  user_id,
  home_country_code IS NULL                         AS home_country_is_null,
  home_region_code IS NULL                          AS home_region_is_null,
  LENGTH(TRIM(COALESCE(home_country_code, '')))     AS home_country_len,
  LENGTH(TRIM(COALESCE(home_region_code, '')))      AS home_region_len
FROM router_profiles_v4
WHERE user_id = '9bf8996b-ca31-45f4-b1a6-12ed0b4d1480';

\echo ''
\echo '========== Section 3 — Raw BC/CA job universe =========='

SELECT
  COUNT(*) AS ca_bc_jobs
FROM jobs
WHERE country_code = 'CA'
  AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC';

SELECT
  id,
  title,
  status,
  routing_status,
  country_code,
  region_code,
  state_code,
  city,
  contractor_user_id,
  cancel_request_pending,
  archived_at,
  created_at
FROM jobs
WHERE country_code = 'CA'
  AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
ORDER BY created_at DESC;

\echo ''
\echo '========== Section 4 — Exact stage-by-stage filter collapse =========='

\echo '-- Stage 1 — Jurisdiction only'

SELECT COUNT(*) AS stage_1_jurisdiction
FROM jobs
WHERE country_code = 'CA'
  AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC';

\echo '-- Stage 2 — + status = OPEN_FOR_ROUTING'

SELECT COUNT(*) AS stage_2_status
FROM jobs
WHERE country_code = 'CA'
  AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
  AND status = 'OPEN_FOR_ROUTING';

\echo '-- Stage 3 — + routing_status = UNROUTED'

SELECT COUNT(*) AS stage_3_routing_status
FROM jobs
WHERE country_code = 'CA'
  AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
  AND status = 'OPEN_FOR_ROUTING'
  AND routing_status = 'UNROUTED';

\echo '-- Stage 4 — + contractor_user_id IS NULL'

SELECT COUNT(*) AS stage_4_contractor_null
FROM jobs
WHERE country_code = 'CA'
  AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
  AND status = 'OPEN_FOR_ROUTING'
  AND routing_status = 'UNROUTED'
  AND contractor_user_id IS NULL;

\echo '-- Stage 5 — + COALESCE(cancel_request_pending,false) = false'

SELECT COUNT(*) AS stage_5_cancel_pending
FROM jobs
WHERE country_code = 'CA'
  AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
  AND status = 'OPEN_FOR_ROUTING'
  AND routing_status = 'UNROUTED'
  AND contractor_user_id IS NULL
  AND COALESCE(cancel_request_pending, false) = false;

\echo '-- Stage 6 — + archived_at IS NULL'

SELECT COUNT(*) AS stage_6_archived
FROM jobs
WHERE country_code = 'CA'
  AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
  AND status = 'OPEN_FOR_ROUTING'
  AND routing_status = 'UNROUTED'
  AND contractor_user_id IS NULL
  AND COALESCE(cancel_request_pending, false) = false
  AND archived_at IS NULL;

\echo ''
\echo '========== Section 5 — Show exact rows surviving each stage =========='

\echo '-- Surviving Stage 2'

SELECT
  id, title, status, routing_status, contractor_user_id,
  cancel_request_pending, archived_at, country_code, region_code, state_code
FROM jobs
WHERE country_code = 'CA'
  AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
  AND status = 'OPEN_FOR_ROUTING'
ORDER BY created_at DESC;

\echo '-- Surviving Stage 3'

SELECT
  id, title, status, routing_status, contractor_user_id,
  cancel_request_pending, archived_at, country_code, region_code, state_code
FROM jobs
WHERE country_code = 'CA'
  AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
  AND status = 'OPEN_FOR_ROUTING'
  AND routing_status = 'UNROUTED'
ORDER BY created_at DESC;

\echo '-- Surviving Final Stage'

SELECT
  id, title, status, routing_status, contractor_user_id,
  cancel_request_pending, archived_at, country_code, region_code, state_code
FROM jobs
WHERE country_code = 'CA'
  AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
  AND status = 'OPEN_FOR_ROUTING'
  AND routing_status = 'UNROUTED'
  AND contractor_user_id IS NULL
  AND COALESCE(cancel_request_pending, false) = false
  AND archived_at IS NULL
ORDER BY created_at DESC;

\echo ''
\echo '========== Section 6 — Hidden exclusion diagnostics =========='

\echo '-- A. Jobs excluded by routing_status'

SELECT
  routing_status,
  COUNT(*) AS cnt
FROM jobs
WHERE country_code = 'CA'
  AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
  AND status = 'OPEN_FOR_ROUTING'
GROUP BY routing_status
ORDER BY cnt DESC;

\echo '-- B. Jobs excluded by contractor assignment'

SELECT
  COUNT(*) AS assigned_jobs
FROM jobs
WHERE country_code = 'CA'
  AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
  AND status = 'OPEN_FOR_ROUTING'
  AND routing_status = 'UNROUTED'
  AND contractor_user_id IS NOT NULL;

SELECT
  id, title, contractor_user_id
FROM jobs
WHERE country_code = 'CA'
  AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
  AND status = 'OPEN_FOR_ROUTING'
  AND routing_status = 'UNROUTED'
  AND contractor_user_id IS NOT NULL;

\echo '-- C. Jobs excluded by cancel_request_pending'

SELECT
  cancel_request_pending,
  COUNT(*) AS cnt
FROM jobs
WHERE country_code = 'CA'
  AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
  AND status = 'OPEN_FOR_ROUTING'
  AND routing_status = 'UNROUTED'
GROUP BY cancel_request_pending
ORDER BY cnt DESC;

\echo '-- D. Jobs excluded by archived_at'

SELECT
  COUNT(*) AS archived_jobs
FROM jobs
WHERE country_code = 'CA'
  AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
  AND status = 'OPEN_FOR_ROUTING'
  AND routing_status = 'UNROUTED'
  AND contractor_user_id IS NULL
  AND COALESCE(cancel_request_pending, false) = false
  AND archived_at IS NOT NULL;

\echo ''
\echo '========== Section 7 — Specific expected jobs check =========='

SELECT
  id,
  title,
  status,
  routing_status,
  contractor_user_id,
  cancel_request_pending,
  archived_at,
  country_code,
  region_code,
  state_code,
  city,
  created_at
FROM jobs
WHERE title ILIKE 'DEMO:%'
   OR title ILIKE '%Langley%'
   OR title ILIKE '%sectional couch%'
ORDER BY created_at DESC;

\echo ''
\echo '========== Section 8 — Null / malformed field checks =========='

\echo '-- A. Null routing_status'

SELECT COUNT(*) AS null_routing_status
FROM jobs
WHERE routing_status IS NULL;

\echo '-- B. Null country/region on BC jobs'

SELECT
  COUNT(*) AS malformed_jurisdiction_rows
FROM jobs
WHERE country_code = 'CA'
  AND (
    region_code IS NULL
    AND state_code IS NULL
  );

\echo '-- C. Region normalization anomalies'

SELECT
  DISTINCT region_code,
  state_code
FROM jobs
WHERE country_code = 'CA'
ORDER BY region_code, state_code;

\echo ''
\echo '========== Section 9 — Exact service query (truth query) =========='

SELECT
  id,
  title,
  trade_category,
  city,
  country_code,
  region_code,
  state_code,
  status,
  routing_status,
  contractor_user_id,
  cancel_request_pending,
  archived_at,
  created_at
FROM jobs
WHERE
  status = 'OPEN_FOR_ROUTING'
  AND routing_status = 'UNROUTED'
  AND contractor_user_id IS NULL
  AND COALESCE(cancel_request_pending, false) = false
  AND archived_at IS NULL
  AND country_code = 'CA'
  AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC'
ORDER BY created_at DESC
LIMIT 50;

\echo ''
\echo '========== Section 10 — DB fingerprint for env mismatch check =========='

SELECT
  current_database() AS current_database,
  current_schema()   AS current_schema,
  inet_server_addr()::text AS server_addr,
  inet_server_port() AS server_port;

SELECT
  COUNT(*) AS expected_visible_jobs,
  MIN(created_at) AS oldest_visible_job,
  MAX(created_at) AS newest_visible_job
FROM jobs
WHERE
  status = 'OPEN_FOR_ROUTING'
  AND routing_status = 'UNROUTED'
  AND contractor_user_id IS NULL
  AND COALESCE(cancel_request_pending, false) = false
  AND archived_at IS NULL
  AND country_code = 'CA'
  AND UPPER(TRIM(COALESCE(region_code, state_code, ''))) = 'BC';
