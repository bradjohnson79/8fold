# Onboarding Wizard Server-Side Enforcement — Implementation Summary

## Overview

Server-side enforcement for onboarding (Terms → Profile → Dashboard) has been implemented across Job Poster, Router, and Contractor roles. All role APIs now require onboarding completion before allowing dashboard access or role-specific actions.

---

## PART 1 — Authoritative Fields Used

| Role | Terms | Profile |
|------|-------|---------|
| **Job Poster** | `auditLogs` (JOB_POSTER_TOS_ACCEPTED, version 1.0) | `jobPosterProfiles` (address, city, stateProvince, country) |
| **Router** | `routers.termsAccepted` (boolean) | `routers.profileComplete` (boolean) |
| **Contractor** | Waiver included in wizard | `contractor_accounts.wizardCompleted` (boolean) |

No new DB columns or timestamps were added.

---

## PART 2 — Central Role Guard Utilities

**File:** `apps/api/src/auth/onboardingGuards.ts`

| Guard | Purpose |
|-------|---------|
| `requireJobPosterReady(req)` | Validates Job Poster identity + TOS (auditLogs) + profile (jobPosterProfiles) |
| `requireRouterReady(req)` | Validates Router identity + termsAccepted + profileComplete |
| `requireContractorReady(req)` | Validates Contractor identity + wizardCompleted |

**Return behavior:**
- Success: returns `ApiAuthedUser`
- Failure: returns `NextResponse.json({ ok: false, error: "Onboarding incomplete" }, { status: 403 })`
- Auth failure: returns 401 via `toHttpError`

**Does not throw.**

---

## PART 3 — Job Poster Enforcement

`requireJobPosterReady()` applied to:

- `create-draft`
- `drafts/save`
- `drafts/[id]` (GET, DELETE)
- `drafts/[id]/wizard-step`
- `drafts/[id]/start-appraisal`
- `jobs/route` (dashboard jobs list)
- `jobs/[id]/create-payment-intent`
- `jobs/[id]/payment-status`
- `jobs/[id]/retry-payment`
- `jobs/[id]/resume-pricing`
- `jobs/[id]/appraise-price`
- `jobs/[id]/confirm-payment` (via web/jobs)
- `jobs/[id]/payment-intent`
- `parts-materials/[id]/payment-intent`
- `materials-requests/[id]/create-payment-intent`
- `materials-requests/[id]/confirm-payment`
- `repeat-contractor/*`
- `materials/pending`
- `conversations`, `conversations/[id]/messages`
- `notifications`, `notifications/mark-read`
- `checkins`, `checkins/respond`
- `contractor-responses`
- `share-contact`
- `continue/[token]`

**Excluded (onboarding completion):**
- `job-poster-tos` (GET, POST)
- `job-poster/profile` (GET, POST, PATCH)

---

## PART 4 — Contractor Enforcement

`requireContractorReady()` applied to:

- `dispatches/[id]/respond`
- `offers`
- `conversations`, `conversations/[id]/messages`
- `notifications`, `notifications/mark-read`
- `appointment`
- `estimated-completion`
- `repeat-requests`, `repeat-requests/[id]/respond`

**Excluded:**
- `contractor-waiver` (GET, POST)
- `contractor/profile` (GET, POST)

---

## PART 5 — Router Enforcement

`requireRouterReady()` applied to:

- `routable-jobs`
- `routed-jobs`
- `apply-routing`
- `jobs/[id]/contractors/eligible`
- `jobs/[id]/contractors/dispatch`
- `jobs/[id]/router-hold`
- `jobs/[id]/router-approve`
- `jobs/[id]/route-confirm`
- `jobs/[id]/claim`
- `jobs/active`
- `router/jobs/[id]/nudge`
- `router/notifications`, `router/notifications/mark-read`
- `router/earnings`, `router/pending-earnings`

**Excluded:**
- `router/terms/accept`
- `router/profile`

---

## PART 6 — Dashboard Protection

All dashboard data routes now use the appropriate `require*Ready` guard before returning data:

- **Job Poster:** `jobs/route`, `notifications`, `conversations`, `checkins`, `contractor-responses`, etc.
- **Contractor:** `offers`, `conversations`, `notifications`, `appointment`, `estimated-completion`
- **Router:** `routable-jobs`, `routed-jobs`, `notifications`, `earnings`, `pending-earnings`

Incomplete onboarding returns 403 JSON; client redirects to wizard.

---

## PART 7 — Wizard Bypass Prevention

- Direct calls to `/dashboard`-backing APIs return 403 when onboarding is incomplete.
- Client layout redirects handle UX; enforcement is server-side.
- No client-only gating; all role APIs are protected.

---

## PART 8 — Admin Role Separation

- Admin routes unchanged.
- `requireAdmin` and admin-specific logic remain separate.
- Onboarding guards apply only to Job Poster, Router, and Contractor web routes.

---

## Example Endpoint (Enforcement Pattern)

```typescript
// apps/api/app/api/web/job-poster/drafts/save/route.ts
export async function POST(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;
    // ... rest of handler
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
```

---

## Stripe Routes — No Modifications

Stripe flows were not refactored. Only the auth guard was updated:

- `requireJobPoster` → `requireJobPosterReady` on payment-intent and payment-status routes.
- Stripe API calls, webhooks, and payment logic are unchanged.

---

## Typecheck

```bash
cd apps/api && pnpm typecheck
# Exit code: 0
```

---

## Files Changed

| Category | Files |
|----------|-------|
| **New** | `apps/api/src/auth/onboardingGuards.ts` |
| **Job Poster** | 30+ route files under `apps/api/app/api/web/job-poster/`, `jobs/`, `parts-materials/`, `materials-requests/` |
| **Contractor** | 11 route files under `apps/api/app/api/web/contractor/` |
| **Router** | 15+ route files under `apps/api/app/api/web/router/`, `apps/api/app/api/jobs/` |
