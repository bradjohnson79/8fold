# Audit: User Type Provisioning & Role Gating

**Date:** 2026-02-11  
**Scope:** Router, Contractor, Job Poster dashboards in unified app (apps/web)  
**Mode:** Audit + report only (no refactors, no business logic changes)

---

## 1️⃣ Role Storage Model

### Where roles are defined

| Source | Location | Details |
|--------|----------|---------|
| **UserRole enum** | `apps/api/db/schema/enums.ts` | `userRoleEnum("UserRole", ["USER","ADMIN","CUSTOMER","CONTRACTOR","ROUTER","JOB_POSTER"])` |
| **User.role** | `apps/api/db/schema/user.ts` | `role: userRoleEnum("role").notNull().default("USER")` |
| **routers** | `apps/api/db/schema/router.ts` | Table `routers` with `userId` as PK; no role column |
| **contractor_accounts** | `apps/api/db/schema/contractorAccount.ts` | Table `contractor_accounts` with `userId` as PK; no role column |
| **JobPosterProfile** | `apps/api/db/schema/jobPosterProfile.ts` | Table `JobPosterProfile`; no `job_posters` Drizzle schema in apps/web |

### Role storage summary

- **Primary:** `User.role` in `"User"` table (Postgres enum `UserRole`)
- **Inferred:** Role is **not** inferred from existence of `routers`/`contractor_accounts` alone. Both are used:
  - `User.role` = canonical role (ROUTER, CONTRACTOR, JOB_POSTER, etc.)
  - `routers` row = router provisioning (required for router tools)
  - `contractor_accounts` row = contractor provisioning (required for contractor tools)
  - `JobPosterProfile` = job poster profile (used for onboarding; `job_posters` table exists in DB, backfilled by script)

### Schema snippets

**User (apps/api/db/schema/user.ts):**
```ts
role: userRoleEnum("role").notNull().default("USER"),
```

**routers (apps/api/db/schema/router.ts):**
```ts
export const routers = dbSchema.table("routers", {
  userId: text("userId").primaryKey(),
  termsAccepted: boolean("termsAccepted").notNull().default(false),
  profileComplete: boolean("profileComplete").notNull().default(false),
  homeRegionCode: text("homeRegionCode").notNull(),
  // ...
});
```

**contractor_accounts (apps/api/db/schema/contractorAccount.ts):**
```ts
export const contractorAccounts = dbSchema.table("contractor_accounts", {
  userId: text("userId").primaryKey(),
  wizardCompleted: boolean("wizardCompleted").notNull().default(false),
  // ...
});
```

**JobPosterProfile (apps/api/db/schema/jobPosterProfile.ts):**
```ts
export const jobPosterProfiles = dbSchema.table("JobPosterProfile", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),
  // ...
});
```

---

## 2️⃣ Router Provisioning Flow

### Where router row is created

| Location | Method | When |
|----------|--------|------|
| `apps/api/app/api/admin/routers/[userId]/approve/route.ts` | `db.insert(routers).values(...).onConflictDoUpdate(...)` | Admin approves user as router |
| `apps/api/scripts/backfillUnifiedUsers.ts` | Raw SQL `insert into "routers"` | Backfill script for users with `User.role = ROUTER` |
| `apps/api/scripts/seed-audit-users.ts` | `db.insert(routers).values(...)` | Seed script |
| `apps/api/scripts/seed-router-dashboard-e2e-drizzle.ts` | `db.insert(routers)` | E2E seed |
| `apps/api/scripts/seed-e2e-bc-langley-drizzle.ts` | `db.insert(routers)` | E2E seed |

### Signup flow (Rome)

- **POST /api/auth/request** (`apps/web/src/server/auth/loginCode.ts`): Upserts `User` with `role = "ROUTER"` (hardcoded for new users; conflict only updates `email`).
- **POST /api/auth/verify** (`apps/web/src/app/api/auth/verify/route.ts`): In dev, overwrites `User.role` with selected role (router/contractor/job-poster).
- **No router row is created** during signup. Router provisioning is **not** part of the auth flow.

### Conditions for router provisioning

1. **Admin path:** Admin calls `POST /api/admin/routers/[userId]/approve` with `homeRegionCode`. Runs in transaction: insert/upsert `routers`, update `User.role` to ROUTER.
2. **Backfill path:** Script reads `User` with `role = ROUTER`, inserts `routers` if missing.
3. **Seed path:** Scripts insert `routers` for test users.

### What happens if router row is missing

- **Layout** (`apps/web/src/app/app/router/(app)/layout.tsx`): Queries `routers`; if no row, `termsAccepted`/`profileComplete` are false → redirects to `/app/router`.
- **Page** (`apps/web/src/app/app/router/page.tsx`): If `!routerRow`, renders "Router not provisioned" message.
- **Terms accept** (`router.terms.accept`): Throws 403 "Router not provisioned" if no `routers` row.
- **Profile update** (`router.profile.update`): Throws 404 "Router not provisioned" if no `routers` row.
- **requireRouter** (apps/api): Returns 403 "Router not provisioned" if no `routers` row or status !== ACTIVE.

### Transaction / idempotency

- **Admin approve:** Uses `db.transaction()`; insert + update User + audit log are atomic.
- **Backfill:** No transaction; can fail silently if insert errors (script logs).
- **Idempotency:** Admin route uses `onConflictDoUpdate`; backfill checks `routerUserId` before insert.

---

## 3️⃣ Router Dashboard Gating

### /app/router page and layout

| File | Check | Behavior when router row missing |
|------|-------|-----------------------------------|
| `apps/web/src/app/app/router/(app)/layout.tsx` | Session + `routers` (termsAccepted, profileComplete) | `routerRow` null → termsAccepted=false → redirect to `/app/router` |
| `apps/web/src/app/app/router/page.tsx` | Session + `routers` | `routerRow` null → renders "Router not provisioned" |
| `apps/web/src/app/app/router/profile/page.tsx` | Session + `routers.termsAccepted` | `routerRow` null → termsAccepted=false → redirect to `/app/router` |

### What is checked

- **Session:** `sid` cookie → `getSessionById(sid)`.
- **Router provisioning:** Existence of `routers` row for `session.userId`.
- **Role:** Layout does **not** check `session.role === "ROUTER"`. App hub (`/app/page.tsx`) redirects by role, so users normally reach `/app/router` only when role is ROUTER.

### 403 in router support inbox

- **GET /api/app/router/support/inbox** (and `/api/app/router_port/inbox`): Dispatches `router.support.inbox.list`.
- Handler uses `requireAdminOrSeniorRouter`, which requires either admin **or** a `routers` row with `isSeniorRouter = true`.
- Regular routers (non-senior) get 403. This is intentional: inbox is admin/senior-router only.

---

## 4️⃣ Dual Source of Truth

### Findings

| Check | Location | Source |
|-------|----------|--------|
| `user.role` | Session, requireRouter, requireJobPoster, requireContractor | `User.role` (and session cache) |
| `routers` row | requireRouter, router layout, router.terms.accept, router.profile | `routers` table |
| `contractor_accounts` row | requireContractorReady, contractor profile | `contractor_accounts` table |
| `JobPosterProfile` | requireJobPosterReady | `JobPosterProfile` table |

### Dual-source role logic

- **Role:** Stored in `User.role` and cached in `sessions.role`. Session role is derived from User at login.
- **Provisioning:** Separate tables (`routers`, `contractor_accounts`, `JobPosterProfile`/`job_posters`) indicate "provisioned" for that role.
- **Enforcement:** Both are used:
  - `requireRouter`: `user.role === "ROUTER"` **and** `routers` row exists and is ACTIVE.
  - `requireContractor`: `user.role === "CONTRACTOR"` only (no `contractor_accounts` check in rbac.ts).
  - `requireContractorReady`: `requireContractor` **and** `contractor_accounts.wizardCompleted`.
  - `requireJobPoster`: `user.role` in USER/CUSTOMER/JOB_POSTER.
  - `requireJobPosterReady`: `requireJobPoster` **and** terms (auditLog) **and** JobPosterProfile complete.

---

## 5️⃣ Role Isolation

### Router endpoints

| Endpoint / handler | Enforcement | 403 when |
|--------------------|-------------|----------|
| `router.terms.accept` | requireSession + routers row | No routers row |
| `router.profile.get` | requireSession | Returns router: null if no row |
| `router.profile.update` | requireSession + routers row | No routers row → 404 |
| `router.support.inbox.list` | requireAdminOrSeniorRouter | Not admin and not senior router |
| `router.jobs.routable` | requireSession (optional) | N/A (returns empty if unauthenticated) |

### Contractor endpoints

| Endpoint | Enforcement | 403 when |
|----------|-------------|----------|
| `apps/web/.../contractor/profile` | requireSession + role CONTRACTOR/ADMIN | role not CONTRACTOR/ADMIN |

### Job poster endpoints

| Endpoint | Enforcement | 403 when |
|----------|-------------|----------|
| `apps/web/.../job-poster/profile` | requireSession + role JOB_POSTER/ADMIN | role not JOB_POSTER/ADMIN |

### Frontend-only checks

- **Job poster layout:** `isJobPosterRole(session.role)` → redirect `/forbidden`.
- **Contractor layout:** `isContractorRole(session.role)` → redirect `/forbidden`.
- **App hub:** Redirects by `session.role` to role-specific dashboard.
- **Router layout:** Does **not** check `session.role`; only session + `routers` row. Relies on app hub for role-based routing.

### Instances of `if (!router)`, `if (!contractor)`, 403

- `apps/web/src/server/commands/routerSupportHandlers.ts:72-80`: `if (!row)` → 403 "Router not provisioned".
- `apps/web/src/server/commands/routerProfileHandlers.ts:128-137`: `if (!routerRow)` → 404 "Router not provisioned".
- `apps/api/src/auth/rbac.ts:138-139`: `if (!router || router.status !== "ACTIVE")` → 403 "Router not provisioned".
- `apps/api/src/auth/rbac.ts:126-128`: `if (profile.status !== "ACTIVE")` → 403 "Router not active".
- `apps/api/src/auth/onboardingGuards.ts:115-117`: `if (!router || !router.termsAccepted || !router.profileComplete)` → 403.
- `apps/api/src/auth/onboardingGuards.ts:144-146`: `if (!acct || !acct.wizardCompleted)` → 403.

---

## 6️⃣ Final Structured Report

### A) Provisioning Model

- **User.role:** Canonical role (ROUTER, CONTRACTOR, JOB_POSTER, etc.), set at signup (dev) or by admin.
- **Router:** `routers` row required for router tools. Created by **auto-provisioning** (first access to `/app/router`), admin approve, or backfill/seed scripts.
- **Contractor:** `contractor_accounts` row created on first profile GET (`on conflict do nothing`). Provisioning is automatic.
- **Job poster:** `JobPosterProfile` created on first profile GET/POST. `job_posters` table exists but is backfilled by script; JobPosterProfile is the main profile surface.

### B) Router Provisioning Flow

1. User signs up with role "router" → `User.role` = ROUTER (dev only).
2. User visits `/app/router` → router layout runs first.
3. **Auto-provisioning:** If `session.role === "ROUTER"` and no `routers` row exists, layout creates one (idempotent, `on conflict do nothing`).
4. User proceeds to terms → profile → dashboard. No longer stuck on "Router not provisioned."
5. Router row is also created by: admin approve, backfill script, or seed scripts.

### C) Role Enforcement Model

| Layer | Where | What |
|-------|-------|------|
| Session | `requireSession`, `getSessionById` | sid cookie → sessions table |
| Role | `requireRouter`, `requireJobPoster`, `requireContractor` | User.role + role-specific tables |
| Onboarding | `requireRouterReady`, `requireJobPosterReady`, `requireContractorReady` | Terms + profile / wizard |
| Layouts | Job poster, contractor | `session.role` |
| Layouts | Router | Session + `session.role` (ROUTER/ADMIN) + `routers` |

### D) Broken or Missing Provisioning Paths

1. ~~**Router self-signup:**~~ **FIXED (2026-02-11):** Router auto-provisioning added. See Appendix below.
2. **requestLoginCode role:** `loginCode.ts` inserts new users with `role = "ROUTER"`. Verify overwrites in dev, but production has no role in verify body, so new users may remain ROUTER by default.
3. **Job poster:** Uses `JobPosterProfile`; `job_posters` table is populated only by backfill. Job poster flows use JobPosterProfile, so this is consistent but there are two job-poster-related tables.

### E) Risk Assessment

| Area | Level | Notes |
|------|-------|-------|
| Router self-signup | **Fixed** | Auto-provisioning on first `/app/router` access. |
| Contractor provisioning | **Safe** | Auto-provisioned on first profile access. |
| Job poster provisioning | **Safe** | JobPosterProfile created on first profile access. |
| Dual source (User.role + tables) | **Minor risk** | Role and provisioning can diverge if backfill/scripts are wrong. |
| Router layout role check | **Minor risk** | Layout checks `session.role`; redirects non-router to `/forbidden`. |
| 403 in router support inbox | **Intentional** | Senior-router-only; not a bug. |

---

## Appendix: Router Auto-Provisioning (Added 2026-02-11)

### Behavior

When a user with `session.role === "ROUTER"` first accesses any `/app/router/*` route, the router layout (`apps/web/src/app/app/router/layout.tsx`) performs **idempotent auto-provisioning**:

1. Query `routers` for `session.userId`.
2. If no row exists, insert one with safe defaults.
3. Use `on conflict ("userId") do nothing` so existing rows are never overwritten.
4. Log `[ROUTER_AUTO_PROVISION] created routers row for userId=...` once per provision.

### Location

- **File:** `apps/web/src/app/app/router/layout.tsx`
- **When:** First server load of any `/app/router/*` route (layout runs before page).
- **Matches:** Contractor (profile GET) and job poster (profile GET/POST) auto-provisioning pattern.

### Defaults Used

| Column | Value | Rationale |
|--------|-------|-----------|
| `userId` | `session.userId` | PK |
| `homeCountry` | `User.country` or `"US"` | From User table |
| `homeRegionCode` | `"BC"` (CA) or `"TX"` (US) | Matches backfill `defaultRegionCodeForCountry` |
| `termsAccepted` | `false` | User must accept via terms flow |
| `profileComplete` | `false` | User must complete profile |
| `status` | `"ACTIVE"` | Required by `requireRouter` |
| `createdByAdmin` | `false` | Self-provisioned |
| `isActive` | `true` | |
| `isMock` | `false` | |
| `isTest` | `false` | |
| `isSeniorRouter` | `false` | Support inbox remains 403 for standard routers |
| `dailyRouteLimit` | `10` | |
| `routesCompleted` | `0` | |
| `routesFailed` | `0` | |
| `createdAt` | `now` | |

### Idempotency

- `on conflict ("userId") do nothing` ensures no duplicate rows.
- If row exists, insert is skipped; no update, no error.
- Admin approval and backfill flows unchanged.

### Admin / Senior-Router Endpoints

- `router.support.inbox.list` and related handlers use `requireAdminOrSeniorRouter`.
- Standard routers (`isSeniorRouter = false`) continue to receive 403 for support inbox.
