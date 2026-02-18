# Router Onboarding Hard Gate (apps/web)

Date: 2026-02-17

Goal: Deterministic Router onboarding (Terms -> Profile -> Pending -> Dashboard) with no hybrid UI and no router-only fetches until ACTIVE.

## Files changed

- `apps/web/src/lib/useMeSession.ts` (new)
- `apps/web/src/lib/routerOnboarding.ts` (new)
- `apps/web/src/server/auth/loadServerMe.ts` (new)
- `apps/web/src/components/roleShells/useSupportInboxBadge.ts`
- `apps/web/src/components/roleShells/RouterDashboardShell.tsx`
- `apps/web/src/app/app/router/page.tsx`
- `apps/web/src/app/app/router/(app)/layout.tsx`
- `apps/web/src/app/app/router/terms/page.tsx` (new)
- `apps/web/src/app/app/router/pending/page.tsx` (new)
- `apps/web/src/app/app/router/profile/page.tsx`
- `apps/web/src/app/app/router/profile/RouterProfileClient.tsx`
- `apps/web/src/app/app/router/RouterTermsClient.tsx`

## Source of truth (single)

- Uses `/api/app/me` payload as the single source of truth.
- Canonical derivation is in `deriveRouterOnboarding()`:
  - prefers `router.onboardingState` if present
  - otherwise infers from `missingFields`
  - otherwise uses `routerReady` or `router.active/provisioned` as fallback

## Where fetches were blocked (no 403 spam)

1. Router sidebar badge polling (major 403 spam source)
   - `useSupportInboxBadge("router")` used to poll `/api/app/router/support/inbox?take=1` every 30s
   - Now supports `{ enabled }` and Router shell passes `enabled: routerReady`

2. Router tool routes hard-gated on the server
   - `apps/web/src/app/app/router/(app)/layout.tsx` redirects to the correct onboarding step unless state is `ACTIVE`.

3. Router root hard-gated on the server
   - `apps/web/src/app/app/router/page.tsx` redirects to the correct onboarding step unless state is `ACTIVE`.

## UX (screenshot description)

When Router is not `ACTIVE`:

- User is redirected into the wizard step:
  - `TERMS_REQUIRED` -> `/app/router/terms`
  - `PROFILE_REQUIRED` -> `/app/router/profile`
  - `PENDING` -> `/app/router/pending`

Router dashboard/tools render only when `ACTIVE`.

## Auto-advance

- `/app/router/pending` polls via the existing `/api/app/me` retry button and auto-redirects when state flips to `ACTIVE`.

