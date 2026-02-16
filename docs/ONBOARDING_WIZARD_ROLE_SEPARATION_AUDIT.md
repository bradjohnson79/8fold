# Onboarding Wizard & Role Separation Audit

**Read-only audit. No code changes. No refactors.**

---

## Timestamp Requirement (termsAcceptedAt / profileCompletedAt)

| Role | termsAcceptedAt | profileCompletedAt |
|------|-----------------|--------------------|
| **JOB_POSTER** | No. TOS in `auditLogs` (JOB_POSTER_TOS_ACCEPTED) with metadata `acceptedAt`. | No. Profile completeness inferred from `jobPosterProfiles` fields. |
| **ROUTER** | No. Uses `routers.termsAccepted` (boolean). | No. Uses `routers.profileComplete` (boolean). |
| **CONTRACTOR** | No. Waiver in `auditLogs` (CONTRACTOR_WAIVER_ACCEPTED). | No. Uses `contractor_accounts.wizardCompleted` (boolean). |

**Conclusion:** No role uses `termsAcceptedAt` or `profileCompletedAt` timestamp columns. All use booleans or audit log metadata.

---

## PART 1 — Terms Acceptance Enforcement Audit

### JOB_POSTER

| Check | Result | Details |
|-------|--------|---------|
| **A) Database** | | |
| termsAcceptedAt field? | **NO** | No `termsAcceptedAt` in User or JobPosterProfile. TOS stored in `auditLogs` via action `JOB_POSTER_TOS_ACCEPTED` (metadata includes version, acceptedAt). |
| Required before dashboard? | **CLIENT-ONLY** | `JobPosterTosGate` (client component) blocks dashboard render if `acceptedCurrent` is false. Layout fetches `/api/web/job-poster-tos` and passes to gate. |
| Checked server-side? | **NO** | No API endpoint checks TOS before job poster actions. |
| **B) Flow** | | |
| Redirect to terms after signup? | **CLIENT-ONLY** | Layout wraps in `JobPosterTosGate`; gate shows modal if not accepted. |
| Manual navigate to /dashboard before terms? | **PARTIAL** | Layout loads; gate blocks children. If API called directly (e.g. `POST /api/web/job-poster/jobs/create-draft`), **no TOS check**. |
| API blocks if terms null? | **NO** | `create-draft`, `drafts/save`, and other job poster endpoints do **not** check TOS. |

**File references:** `apps/web/src/app/app/job-poster/JobPosterTosGate.tsx`, `apps/web/src/app/app/job-poster/layout.tsx`, `apps/api/app/api/web/job-poster-tos/route.ts`, `apps/api/app/api/web/job-poster/jobs/create-draft/route.ts`

**Bypass risk:** **HIGH** — Job poster can call `create-draft`, `drafts/save`, and other APIs without accepting TOS.

---

### ROUTER

| Check | Result | Details |
|-------|--------|---------|
| **A) Database** | | |
| termsAcceptedAt field? | **NO** | Uses `termsAccepted` (boolean) on `routers` table, not timestamp. |
| Required before dashboard? | **YES** | API routes return 403 or `blocked: true` if `!termsAccepted`. |
| Checked server-side? | **YES** | API routes check `routerRow.termsAccepted`. |
| **B) Flow** | | |
| Redirect to terms after signup? | **YES** | `RouterTermsClient` shown on `/app/router` if not accepted; `(app)/layout` redirects if `!termsAccepted`. |
| Manual navigate to /dashboard before terms? | **NO** | Layout redirects to `/app/router` if `!termsAccepted`. API returns 403/blocked. |
| API blocks if terms null? | **YES** | `routable-jobs`, `routed-jobs`, `apply-routing`, `contractors/eligible` all check `termsAccepted` and return `missing: ["TERMS"]` or 403. |

**File references:** `apps/api/app/api/web/router/routable-jobs/route.ts`, `apps/api/app/api/web/router/routed-jobs/route.ts`, `apps/api/app/api/web/router/apply-routing/route.ts`, `apps/api/app/api/jobs/[id]/contractors/eligible/route.ts`, `apps/web/src/app/app/router/(app)/layout.tsx`, `apps/api/db/schema/router.ts`

**Bypass risk:** **LOW** — Server-side enforcement on all routing endpoints.

---

### CONTRACTOR

| Check | Result | Details |
|-------|--------|---------|
| **A) Database** | | |
| termsAcceptedAt field? | **N/A** | Contractors use waiver acceptance (separate flow). Contractor waiver uses `auditLogs` (CONTRACTOR_WAIVER_ACCEPTED). No `termsAcceptedAt` on contractor_accounts. |
| Required before dashboard? | **CLIENT-ONLY** | `ContractorWaiverGate` wraps dashboard; `(app)/layout` redirects if `!wizardCompleted` or `denied`. |
| Checked server-side? | **NO** | No API checks contractor waiver or terms before contractor actions. |
| **B) Flow** | | |
| Redirect to terms/waiver? | **CLIENT-ONLY** | Layout fetches waiver + profile; redirects to `/app/contractor/profile` if `!wizardCompleted`. |
| Manual navigate to /dashboard before terms? | **CLIENT-ONLY** | Layout redirects. API does **not** check. |
| API blocks if terms null? | **NO** | `dispatches/[id]/respond`, `conversations`, `offers`, etc. do **not** check waiver or wizardCompleted. |

**File references:** `apps/web/src/app/app/contractor/(app)/layout.tsx`, `apps/api/app/api/web/contractor/dispatches/[id]/respond/route.ts`, `apps/api/app/api/web/contractor/profile/route.ts`

**Bypass risk:** **HIGH** — Contractor can call API directly with valid session; token-based dispatch respond has no wizard check at all.

---

## PART 2 — Profile Wizard Enforcement Audit

### JOB_POSTER

| Check | Result | Details |
|-------|--------|---------|
| **A) Database** | | |
| profileCompletedAt field? | **NO** | No `profileCompletedAt`. Profile completeness inferred from `profile.address`, `profile.city`, `profile.stateProvince`, `profile.country`. |
| Profile data stored before dashboard? | **CLIENT-ONLY** | Layout does not check profile. Dashboard accessible without profile. |
| **B) Required Fields** | | |
| Country, State, City? | **YES** | `create-draft` requires `profile.address`, `profile.city`, `profile.stateProvince`, `profile.country` (full address). |
| **C) Enforcement** | | |
| Dashboard access blocked if profile incomplete? | **NO** | Layout does not check profile. |
| Enforced server-side? | **PARTIAL** | Only `create-draft` checks profile. `drafts/save` does **not** check profile. |
| API endpoints blocked if profile incomplete? | **PARTIAL** | `create-draft` blocks; other endpoints (drafts/save, jobs list, etc.) do not. |
| Can user manually hit /dashboard and bypass wizard? | **YES** | Dashboard layout loads; no profile gate. |

**File references:** `apps/api/app/api/web/job-poster/jobs/create-draft/route.ts`, `apps/api/app/api/web/job-poster/drafts/save/route.ts`, `apps/api/db/schema/jobPosterProfile.ts`

**Bypass risk:** **MEDIUM** — Can create draft via drafts/save without full profile; create-draft requires profile.

---

### ROUTER

| Check | Result | Details |
|-------|--------|---------|
| **A) Database** | | |
| profileCompletedAt field? | **NO** | Uses `profileComplete` (boolean) on `routers` table. |
| Profile data stored? | **YES** | `routerProfiles` (name, addressPrivate, etc.); `routers` (homeCountry, homeRegionCode, homeCity). |
| **B) Required Fields** | | |
| Country, State, City? | **YES** | `profileComplete` requires `name` and `addressPrivate`; layout also checks `homeRegionCode`, `homeCountry`, `email`, `stateProvince`. |
| **C) Enforcement** | | |
| Dashboard access blocked if profile incomplete? | **YES** | Layout redirects to `/app/router/profile` if `!profileComplete`. |
| Enforced server-side? | **YES** | API routes check `profileComplete` and return `missing: ["PROFILE"]` or 403. |
| API endpoints blocked? | **YES** | `routable-jobs`, `routed-jobs`, `apply-routing`, `contractors/eligible` all check. |
| Can user manually hit /dashboard and bypass wizard? | **NO** | Layout redirects; API blocks. |

**File references:** `apps/api/app/api/web/router/profile/route.ts`, `apps/api/app/api/web/router/routable-jobs/route.ts`, `apps/web/src/app/app/router/(app)/layout.tsx`

**Bypass risk:** **LOW** — Server-side enforcement.

---

### CONTRACTOR

| Check | Result | Details |
|-------|--------|---------|
| **A) Database** | | |
| profileCompletedAt field? | **NO** | Uses `wizardCompleted` (boolean) on `contractor_accounts` table. |
| Profile data stored? | **YES** | `contractor_accounts` (tradeCategory, regionCode, country, city, etc.). |
| **B) Required Fields** | | |
| Country, State, City? | **YES** | `tradeCategory`, `regionCode`, `country`, `city` required for wizard. |
| **C) Enforcement** | | |
| Dashboard access blocked if profile incomplete? | **YES** | Layout redirects to `/app/contractor/profile` if `!wizardCompleted`. |
| Enforced server-side? | **NO** | No API checks `wizardCompleted` before contractor actions. |
| API endpoints blocked? | **NO** | `dispatches/[id]/respond`, `conversations`, `offers` do not check. |
| Can user manually hit /dashboard and bypass wizard? | **CLIENT-ONLY** | Layout redirects. API can be called directly. |

**File references:** `apps/api/db/schema/contractorAccount.ts`, `apps/api/app/api/web/contractor/profile/route.ts`, `apps/web/src/app/app/contractor/(app)/layout.tsx`

**Bypass risk:** **HIGH** — API does not check wizardCompleted.

---

## PART 3 — Router Gating Audit

| Check | Result | Details |
|-------|--------|---------|
| Can router route jobs before profile completion? | **NO** | `routable-jobs`, `apply-routing`, `contractors/eligible` all check `profileComplete` and return blocked if missing. |
| Can router route without accepting terms? | **NO** | Same routes check `termsAccepted`. |
| Routing query gated by status === ACTIVE? | **YES** | `requireRouter` checks `routers.status === ACTIVE` and `routerProfiles.status === ACTIVE`. |
| profileCompletedAt not null? | **YES** | `profileComplete` boolean checked; must be true. |
| Not suspended? | **YES** | `optionalUser` in rbac checks `users.status`; ARCHIVED/SUSPENDED return null. |
| Not archived? | **YES** | Same as above. |

**Missing enforcement:** None for router. Router gating is server-side and complete.

---

## PART 4 — Contractor Gating Audit

| Check | Result | Details |
|-------|--------|---------|
| Can contractor see routed jobs before profile completion? | **N/A** | Contractors receive dispatches (routed to them); they don't "see" a list. Dispatch response is token-based or session-based. |
| Can contractor act before admin approval? | **YES (by design)** | Token-based dispatch respond does not require contractor to be logged in or approved. Contractor can accept/decline via token. Admin approval (`contractors.status === APPROVED`) is required for routing eligibility (router selecting contractors), not for responding to a dispatch. |
| Stripe payout eligibility separate from onboarding? | **YES** | `stripePayoutsEnabled` is separate from `wizardCompleted`. |
| Contractors cannot access routed jobs without profile complete? | **NO** | Token-based respond has no wizard check. Session-based respond (`/api/web/contractor/dispatches/[id]/respond`) does not check wizardCompleted. |
| Contractors cannot bypass wizard? | **NO** | API does not enforce wizard. |

**Conclusion:** Contractor can respond to dispatch (token or session) without completing wizard. High risk.

---

## PART 5 — Admin Role Separation Audit

| Check | Result | Details |
|-------|--------|---------|
| Admin users in separate AdminUser table? | **YES** | `AdminUser` table; `apps/api/db/schema/adminUser.ts`. |
| Admin login only in apps/admin (3002)? | **YES** | `apps/admin/app/api/login/route.ts` uses AdminUser, password hash, cookie `admin_session`. |
| Admin cannot log in as Job Poster? | **YES** | Job Poster uses magic link + User table; different auth. |
| Admin cannot log in as Router? | **YES** | Same. |
| Admin cannot log in as Contractor? | **YES** | Same. |
| No shared role mixing? | **YES** | AdminUser is separate from User. Admin login is email/password. User (marketplace) login is magic link. |
| Admin profile completion optional? | **YES** | AdminUser has fullName, country, state, city; no wizard completion requirement. |
| Admin can manually create Job Posts, Routes, Contractors? | **YES** | Admin endpoints exist for these. |
| Admin does not appear in routing selection? | **YES** | Routing uses contractors (Contractor table) and routers (routers table). AdminUser is not in those. |

**File references:** `apps/api/db/schema/adminUser.ts`, `apps/admin/app/api/login/route.ts`, `apps/admin/src/server/adminSession.ts`, `drizzle/0006_user_role_no_admin.sql`

**Role mixing risk:** **LOW** — Admin is separate from frontend roles.

---

## PART 6 — Server-Side Enforcement Verification

| Role | termsAccepted/terms check | profileComplete/wizard check | API layer |
|------|---------------------------|-----------------------------|-----------|
| **JOB_POSTER** | **NO** | **PARTIAL** (create-draft only) | TOS enforcement is **client-only**. Profile check only on create-draft. |
| **ROUTER** | **YES** | **YES** | All routing endpoints check `termsAccepted` and `profileComplete`. |
| **CONTRACTOR** | **NO** | **NO** | No API checks waiver or wizardCompleted. |

**Guards:** `if (!termsAccepted) block` / `if (!profileComplete) block` exist only for **Router** in `apps/api/app/api/web/router/*` and `apps/api/app/api/jobs/[id]/contractors/eligible/route.ts`.

**Middleware:** Web middleware checks session + role cookie; does not check terms or profile completion.

**Enforcement client-only for Job Poster and Contractor:** **HIGH RISK**.

---

## PART 7 — Dashboard Bypass Test

**Scenario:** User registers, skips wizard, manually enters `/dashboard` (or `/app/job-poster`, `/app/router`, `/app/contractor`).

| Role | Would server allow? | Why |
|------|--------------------|-----|
| **JOB_POSTER** | **YES (risk)** | Layout fetches TOS and passes to client gate. If user calls API directly (e.g. POST create-draft with session token), server does not check TOS. Profile is only checked on create-draft; drafts/save is not. |
| **ROUTER** | **NO** | Layout redirects if !termsAccepted or !profileComplete. API returns 403/blocked. |
| **CONTRACTOR** | **YES (risk)** | Layout redirects if !wizardCompleted. But API (dispatches respond, conversations, etc.) does not check. User with valid session token can call API directly. |

---

## OUTPUT FORMAT — Summary by Role

### Job Poster

| Metric | Result |
|--------|--------|
| Terms Enforced Server-Side | **NO** |
| Profile Enforced Server-Side | **PARTIAL** (create-draft only) |
| Dashboard Bypass Possible | **YES** (API direct call) |
| Routing Access Properly Gated | N/A |
| **Risk Level** | **HIGH** |

### Router

| Metric | Result |
|--------|--------|
| Terms Enforced Server-Side | **YES** |
| Profile Enforced Server-Side | **YES** |
| Dashboard Bypass Possible | **NO** |
| Routing Access Properly Gated | **YES** |
| **Risk Level** | **LOW** |

### Contractor

| Metric | Result |
|--------|--------|
| Terms Enforced Server-Side | **NO** |
| Profile Enforced Server-Side | **NO** |
| Dashboard Bypass Possible | **YES** (API direct call) |
| Routing Access Properly Gated | **NO** (wizard not checked) |
| **Risk Level** | **HIGH** |

### Admin

| Metric | Result |
|--------|--------|
| Admin Separate From Frontend Roles | **YES** |
| Role Mixing Possible | **NO** |
| **Risk Level** | **LOW** |

---

## Overall Onboarding Integrity Score

**Needs Hardening**

- **Router:** Strong server-side enforcement. Terms and profile gated before routing.
- **Job Poster:** TOS enforcement is client-only; profile only enforced on create-draft. drafts/save and other endpoints do not check TOS or profile.
- **Contractor:** Wizard enforcement is client-only. API does not check wizardCompleted.

---

*Audit completed. No edits. No code suggestions.*
