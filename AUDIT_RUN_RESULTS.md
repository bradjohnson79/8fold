## Dashboard Audit Runner Results

- Base: `http://localhost:3003`
- Generated: `2026-02-11T23:38:27.959Z`
- Total checks: **15**
- Failures: **0**

- **[job-poster] profile**: `GET http://localhost:3003/api/web/job-poster/profile` → **200** PASS
- **[job-poster] my-jobs**: `GET http://localhost:3003/api/web/job-poster/jobs` → **200** PASS
- **[job-poster] pending-materials**: `GET http://localhost:3003/api/web/job-poster/materials/pending` → **200** PASS
- **[job-poster] conversations**: `GET http://localhost:3003/api/web/job-poster/conversations` → **200** PASS
- **[job-poster] support-badge**: `GET http://localhost:3003/api/web/support/tickets?take=1` → **200** PASS
- **[router] profile**: `GET http://localhost:3003/api/web/router/profile` → **200** PASS
- **[router] routable-jobs**: `GET http://localhost:3003/api/web/router/routable-jobs` → **200** PASS
- **[router] routing-queue**: `GET http://localhost:3003/api/web/router/routed-jobs` → **200** PASS
- **[router] support-inbox**: `GET http://localhost:3003/api/web/router/support/inbox` → **200** PASS
- **[contractor] profile**: `GET http://localhost:3003/api/web/contractor/profile` → **200** PASS
- **[contractor] offers**: `GET http://localhost:3003/api/web/contractor/offers` → **200** PASS
- **[contractor] appointment**: `GET http://localhost:3003/api/web/contractor/appointment` → **200** PASS
- **[contractor] conversations**: `GET http://localhost:3003/api/web/contractor/conversations` → **200** PASS
- **[public] public-recent**: `GET http://localhost:3003/api/public/jobs/recent?limit=5` → **200** PASS
- **[public] public-by-location**: `GET http://localhost:3003/api/public/jobs/by-location?country=CA&regionCode=BC&city=Langley` → **200** PASS