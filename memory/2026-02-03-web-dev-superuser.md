## Web-dev superuser (frontend only)

Goal: allow a specific email (e.g. `bradjohnson79@gmail.com`) to access **all 3 role dashboards** on the **web-dev** frontend after OTP login, without changing backend roles, DB enums, or admin.

### How it works

- **Allowlist**: `WEB_SUPERUSER_EMAILS` (comma-separated, lowercase compare)
- **Signed cookie**: `eightfold_su` (httpOnly) signed via HMAC-SHA256 using `SUPERUSER_COOKIE_SECRET`
- **Cookie set**: in `apps/web/src/app/api/auth/verify/route.ts` after OTP verification succeeds, if the verified email is allowlisted.
- **Guards bypass**:
  - `apps/web/src/middleware.ts` allows requests to `/app/*` when a valid `eightfold_su` cookie is present (still requires `eightfold_session`).
  - `apps/web/src/lib/requireWebRole.ts` bypasses role checks for web-owned `/api/app/*` proxy routes when `eightfold_su` is present (still requires `eightfold_session`).
- **App landing redirect**: `apps/web/src/app/app/page.tsx` redirects superusers to `/app/switch` (otherwise `/app` would require a role cookie).
- **Logout**: clears `eightfold_session`, `eightfold_role`, and `eightfold_su`.

### UX

- Superusers see a **“Switch dashboard”** button in `DashboardShell` that links to `/app/switch`.
- `/app/switch` provides quick links to:
  - `/app/job-poster`
  - `/app/router`
  - `/app/contractor`

### Env (web)

In `apps/web/.env.local`:

- `WEB_SUPERUSER_EMAILS=bradjohnson79@gmail.com`
- `SUPERUSER_COOKIE_SECRET=dev-only-superuser-change-me`

