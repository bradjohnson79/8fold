# Release Smoke Check

Run this checklist before shipping to production.

## Homepage

- [ ] Open `/` and confirm hero renders correctly:
  - [ ] Video renders when enabled and asset/path is valid.
  - [ ] Fallback gradient renders when video is disabled/missing/reduced-motion.
- [ ] Confirm "Newest jobs" section loads:
  - [ ] Jobs list appears when eligible jobs exist.
  - [ ] Empty state appears cleanly (no crash) when no eligible jobs exist.
- [ ] Confirm Region -> City selector behavior:
  - [ ] Select a region with known jobs and verify city list populates.
  - [ ] If no jobs exist for a region, city list/empty state is expected and non-breaking.

## Auth

- [ ] Open `/login` and verify form loads and can proceed.
- [ ] Open `/sign-up` (or `/signup`) and verify form loads and can proceed.
- [ ] Open `/onboarding/role` and verify:
  - [ ] No unhandled fetch error in console (including offline/throttled simulation).
  - [ ] Existing role redirect behavior still works for `ROUTER`, `CONTRACTOR`, `JOB_POSTER`.

## App Shell / Support Badge

- [ ] Open any authenticated app route under `/app` and verify support badge behavior:
  - [ ] Badge loads quietly when authenticated.
  - [ ] No repeated 401/timeout spam in console/network.
- [ ] Open non-app marketing routes (for example `/`, `/how-to-earn`) and verify:
  - [ ] No support badge polling against `/api/app/support/tickets?take=1`.

## Public API Smoke

- [ ] `GET /api/public/jobs/recent?limit=9` returns `200`.
- [ ] `GET /api/public/locations/cities-with-jobs?country=US&regionCode=CA` returns `200`.
  - [ ] Response may be empty if no eligible jobs exist; this is valid.

## Recommended Route Links

- Homepage: `/`
- Login: `/login`
- Signup: `/sign-up` (or `/signup`)
- Onboarding role: `/onboarding/role`
- App shell sample: `/app`
- Public recent jobs API: `/api/public/jobs/recent?limit=9`
- Public cities API sample: `/api/public/locations/cities-with-jobs?country=US&regionCode=CA`
