# API Health & DB Diagnostics

Reference for DB initialization, health endpoints, and deployment verification.

---

## A) DB Initialization

### 1. Where is DB created?

| File | Role |
|------|------|
| `apps/api/src/server/db/drizzle.ts` | **Canonical** – creates `pg.Pool` and `drizzle()` client |
| `apps/api/db/drizzle.ts` | Re-exports from canonical (back-compat) |
| `apps/api/src/adminBus/db.ts` | Re-exports from canonical |

### 2. Driver and client type

- **Driver:** `pg` (node-postgres), **not** `@neondatabase/serverless`
- **Client:** `pg.Pool` + `drizzle-orm/node-postgres`
- **Connection:** Standard Postgres over SSL (Neon pooler URL with `sslmode=require`)

### 3. Singleton vs per-request

- **Global singleton** – `pool` and `db` are created once at module load
- First import of any route that uses `db` triggers:
  1. `ensureProductionSchema()`
  2. Pool creation
  3. `runSchemaGuardOnce()` (async schema verification)

---

## B) Health Endpoints

### `/healthz` (root)

- **Path:** `app/healthz/route.ts`
- **DB:** No – returns immediately
- **Admin/auth:** No
- **adminBus:** No

### `/api/system/health`

- **Path:** `app/api/system/health/route.ts`
- **DB:** Yes – `SELECT 1`
- **Admin/auth:** No
- **adminBus:** No
- **Timing logs:** `[HEALTHZ_TIMING]` (start, before DB, after DB)

### `/api/health`

- **Path:** `app/api/health/route.ts`
- **DB:** Yes – `SELECT 1`
- **Admin/auth:** No
- **adminBus:** No

### `/api/health/noop`

- **Path:** `app/api/health/noop/route.ts`
- **DB:** No – returns immediately
- **Use:** If noop is fast but `/api/system/health` hangs → DB query hang. If noop also hangs → app boot/runtime hang.

### `/api/admin/v4/diag/health`

- **Path:** `app/api/admin/v4/diag/health/route.ts`
- **DB:** Yes – via `getDbIdentity()`, `getCoreTableCounts()`
- **Admin/auth:** Yes – `requireAdmin(req)`
- **adminBus:** Yes – uses adminBus repos

---

## C) Runtime Hang Diagnostics

### Log markers

| Log | When |
|-----|------|
| `[DB_MODULE_LOAD]` | When `drizzle.ts` is first imported (before pool creation) |
| `[NOOP_HANDLER_START]` | When `/api/health/noop` handler runs (no db import) |
| `[HEALTHZ_HANDLER_START]` | When `/api/system/health` handler runs |
| `[HEALTHZ_TIMING]` | Per-step timing in `/api/system/health` |

### Expected logs per endpoint

| Endpoint | Log |
|----------|-----|
| `/healthz` | `[HEALTHZ_ROOT_HANDLER_START]` |
| `/api/health/noop` | `[NOOP_HANDLER_START]` |
| `/api/system/health` | `[HEALTHZ_HANDLER_START]` + `[HEALTHZ_TIMING]` |

### Interpretation

- Hang before `[DB_MODULE_LOAD]` → something else loading first
- Hang after `[DB_MODULE_LOAD]` but before handler → pool creation or `runSchemaGuardOnce()` hanging
- `[NOOP_HANDLER_START]` / `[HEALTHZ_ROOT_HANDLER_START]` never appear → app boot/runtime hang or wrong project/domain
- `[NOOP_HANDLER_START]` appears quickly, `/api/system/health` hangs after "before DB" → DB query hang

### If noop is not logging at all

1. **Verify api.8fold.app** is mapped to the correct Vercel project (not apps/web)
2. **Verify root directory** is `apps/api`
3. **Middleware** – `/healthz` and `/api/health/noop` now bypass middleware (return `NextResponse.next()` before `logBootConfigOnce`)

### If noop logs but DB health hangs

1. **Set `POOL_MAX=1`** – reduces connection contention in serverless
2. **Ensure pooled connection string** – Neon URL should use `-pooler` hostname (e.g. `ep-xxx-pooler.xxx.neon.tech`)
3. **Or migrate to `@neondatabase/serverless`** – driver optimized for serverless/edge

---

## D) Connection / Pool Settings

### Runtime diagnostics

On first DB module load, logs include:

- `DB_RUNTIME_HOST::` – parsed hostname (no credentials)
- `DATABASE_URL_VALIDATION::` – JSON with:
  - `databaseUrlPresent`
  - `sslMode`, `sslEnabled`
  - `poolSettings`: `connectionTimeoutMillis`, `idleTimeoutMillis`, `statement_timeout`

### Pool config (in `drizzle.ts`)

- `connectionTimeoutMillis: 10000` (10s)
- `idleTimeoutMillis: 30000` (30s)
- `statement_timeout: 30s` (via `options: "-c statement_timeout=30000"`)

---

## E) Vercel Deployment Checks

### 11. Which project serves api.8fold.app?

- **Expected:** `apps/api` (Next.js API)
- **Verify:** Vercel Dashboard → Project Settings → Root Directory = `apps/api` (or project is configured for the API app)
- **Confirm:** Not pointed at `apps/web` – web app has different routes and no `/api/system/health`

### 12. API region vs Neon region

- **Neon:** Check project region in Neon dashboard (e.g. `us-west-2`)
- **Vercel:** Project Settings → Functions → Region
- **Recommendation:** Align API region with Neon (e.g. both `us-west-2`) to reduce cold-start and connection latency
