# Onboarding Failure Deep Audit Report

**Goal:** Identify the exact root cause of `POST /api/app/onboarding/role` returning 500 in production.

**Status:** Audit only — no structural fixes implemented. Temporary error logging added for Phase 2.

---

## PHASE 1 — Exact Handler

### Request Flow

1. **Client:** `roleClient.tsx` → `fetch("/api/app/onboarding/role", { method: "POST", body: JSON.stringify({ role }) })`
2. **Web proxy:** `apps/web/src/app/api/app/onboarding/role/route.ts` → proxies to `API_ORIGIN + /api/onboarding/role` with Bearer token
3. **API handler:** `apps/api/app/api/onboarding/role/route.ts` — **this is where the 500 occurs**

### Full Handler Contents

```typescript
// apps/api/app/api/onboarding/role/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { users } from "@/db/schema/user";
import { AuthErrorCodes } from "@/src/auth/errors/authErrorCodes";
import { authErrorResponse, getOrCreateRequestId, withRequestIdHeader } from "@/src/auth/errors/authErrorResponse";
import { requireAuth } from "@/src/auth/requireAuth";

const BodySchema = z.object({
  role: z.enum(["JOB_POSTER", "CONTRACTOR", "ROUTER"]),
});

export async function POST(req: Request) {
  const requestId = getOrCreateRequestId(req);
  const authed = await requireAuth(req);
  if (authed instanceof Response) return authed;

  if (authed.internalUser) {
    return authErrorResponse(req, { status: 409, code: AuthErrorCodes.ROLE_IMMUTABLE, ... });
  }

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch { ... }

  const body = BodySchema.safeParse(parsed);
  if (!body.success) { ... }

  try {
    await db.insert(users).values({
      clerkUserId: authed.clerkUserId,
      role: body.data.role as any,
      status: "ACTIVE" as any,
    } as any);
  } catch (err) {
    console.error("ONBOARDING_ROLE_ERROR:", err);
    throw err;
  }

  const resp = NextResponse.json({ ok: true, data: { role: body.data.role }, requestId }, { status: 201 });
  return withRequestIdHeader(resp, requestId);
}
```

### Identified Details

| Item | Value |
|------|-------|
| **Session helper** | `requireAuth(req)` — Bearer token + Clerk JWT verification; returns `clerkUserId` and `internalUser` (DB row or null) |
| **DB table** | `"User"` (PascalCase; Drizzle: `dbSchema.table("User", ...)`) |
| **Schema** | From `DATABASE_URL ?schema=` — default `public`; migrations use `8fold_test` |
| **Columns written** | `clerkUserId`, `role`, `status` (only these; others use schema defaults) |
| **Role enum** | `UserRole`: `ADMIN`, `CONTRACTOR`, `ROUTER`, `JOB_POSTER` |
| **Status enum** | `UserStatus`: `ACTIVE`, `SUSPENDED`, `ARCHIVED`, `PENDING` |
| **Accepted body values** | `role`: `"JOB_POSTER"` \| `"CONTRACTOR"` \| `"ROUTER"` (zod) |

### Exact Failing Line

```typescript
await db.insert(users).values({
  clerkUserId: authed.clerkUserId,
  role: body.data.role as any,
  status: "ACTIVE" as any,
} as any);
```

---

## PHASE 2 — Temporary Error Logging (Added)

A `try/catch` wrapper was added around the insert:

```typescript
try {
  await db.insert(users).values({ ... });
} catch (err) {
  console.error("ONBOARDING_ROLE_ERROR:", err);
  throw err;
}
```

**Next step:** Deploy and reproduce the 500. Inspect Vercel logs for `ONBOARDING_ROLE_ERROR:` and the raw Postgres/runtime error message.

---

## PHASE 3 — DB State Inspection Queries

**Important:** The table name is `"User"` (PascalCase), not `users`. Schema may be `public` or `8fold_test` depending on `DATABASE_URL`.

Run these in production DB (adjust schema if needed):

```sql
-- 1. Column list (use correct schema)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'   -- or '8fold_test'
  AND table_name = 'User'
ORDER BY ordinal_position;

-- 2. Distinct role values
SELECT DISTINCT role FROM "User";

-- 3. Sample rows (use schema-qualified name if not in search_path)
SELECT * FROM "User" LIMIT 5;
```

**Confirm:**
- Does `role` column exist?
- Is it `role` (not `user_role` or snake_case)?
- Is it enum type `UserRole`?
- Any nulls in `role`?
- Any legacy values outside `JOB_POSTER`, `CONTRACTOR`, `ROUTER`, `ADMIN`?

---

## PHASE 4 — Enum Verification

```sql
-- Allowed UserRole values
SELECT unnest(enum_range(NULL::"UserRole"));

-- Allowed UserStatus values
SELECT unnest(enum_range(NULL::"UserStatus"));
```

If schema is not `public`, qualify: `unnest(enum_range(NULL::"8fold_test"."UserRole"))`.

---

## PHASE 5 — User Creation Flow

| When | Where | Code path |
|------|-------|-----------|
| **Onboarding role submit** | API | `POST /api/onboarding/role` → `requireAuth` → `db.insert(users).values({ clerkUserId, role, status })` |
| **First login** | No | Users are not created on first login |
| **Sync-user** | Web | `POST /api/app/sync-user` calls `/api/onboarding/role` only when `identity.role` is JOB_POSTER/CONTRACTOR/ROUTER (from Clerk metadata). New users have `USER_ROLE_NOT_ASSIGNED`, so sync-user does not create users. |
| **Enrichment** | No | `/api/me` only reads; no insert |

**Conclusion:** The **only** path that creates a `User` row for new Clerk signups is the onboarding role handler. No pre-creation elsewhere.

---

## PHASE 6 — Conflict Hypotheses

Based on code and schema (not yet confirmed by logs):

| Hypothesis | Likelihood | Notes |
|-----------|------------|-------|
| **Unique constraint (clerkUserId)** | Medium | If user already exists from a prior partial run or race, insert would fail with duplicate key |
| **Null constraint** | Low | `clerkUserId`, `role`, `status` are provided; others have defaults |
| **Enum cast error** | Medium | `role`/`status` values must match Postgres enum exactly. Drizzle uses `UserRole`/`UserStatus`; body sends `JOB_POSTER`/`CONTRACTOR`/`ROUTER` and `ACTIVE` — all valid |
| **Table/schema mismatch** | Medium | Drizzle uses `"User"`; schema from `?schema=` (default `public`). Migrations use `8fold_test`. Mismatch could cause "relation does not exist" |
| **Transaction failure** | Low | Single insert; no explicit transaction |
| **Column does not exist** | Medium | If production schema was migrated differently, a required column might be missing |
| **CHECK constraint** | Low | `user_role_not_admin` forbids `ADMIN`; we never send `ADMIN` |

---

## Output Format (To Be Filled After Log Capture)

### Root cause classification

*Pending: capture `ONBOARDING_ROLE_ERROR` from Vercel logs*

- [ ] Schema mismatch
- [ ] Enum mismatch
- [ ] Missing row
- [ ] Duplicate row
- [ ] Transaction issue
- [ ] Other: ___________

### Exact failing line of code

```typescript
await db.insert(users).values({
  clerkUserId: authed.clerkUserId,
  role: body.data.role as any,
  status: "ACTIVE" as any,
} as any);
```

### Recommended minimal correction

*To be determined after root cause is known. Do not refactor yet.*

---

## Important Error Patterns

If the 500 log contains any of these, the fix is schema alignment, not logic:

- `column "X" does not exist`
- `invalid input value "X" for enum "UserRole"`
- `null value in column "X" violates not-null constraint`
- `duplicate key value violates unique constraint "User_clerkUserId_key"`
- `relation "User" does not exist` (schema/table name mismatch)

---

## Files Touched

- `apps/api/app/api/onboarding/role/route.ts` — added `ONBOARDING_ROLE_ERROR` try/catch (Phase 2)
