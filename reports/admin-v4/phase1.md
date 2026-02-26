# Phase 1 - Admin V4 Auth Bootstrap (Option B Cookie Auth)

Date: 2026-02-26
Branch: v4-admin

## Implemented

Auth routes under `/api/admin/v4/auth/*`:
- `POST /api/admin/v4/auth/bootstrap`
- `POST /api/admin/v4/auth/login`
- `POST /api/admin/v4/auth/logout`
- `GET /api/admin/v4/auth/me`
- `POST /api/admin/v4/auth/password`

Core auth files:
- `apps/api/src/auth/adminV4Session.ts`
- `apps/api/src/auth/requireAdminV4.ts`
- `apps/api/src/lib/api/adminV4Response.ts`

Schema/migration foundation:
- `apps/api/db/schema/v4AdminUser.ts`
- `apps/api/db/schema/v4AdminBootstrapToken.ts`
- `apps/api/db/schema/v4AdminInviteToken.ts`
- `drizzle/0091_v4_admin_auth_foundation.sql`

## Cookie + Session Contract

- Cookie name: `admin_session`
- Cookie flags: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production
- Session storage: `admin_sessions` (reused)
- Session validation join:
  - `admin_sessions.adminUserId` -> `v4_admin_users.auth_subject_id`

## Security Notes

Implemented:
- Token hashing: bootstrap/invite tokens are SHA-256 compared by hash.
- Bootstrap/login rate limiting: `rateLimitOrThrow(...)` on IP and identity keys.
- Attempt logging: structured `console.info`/`console.error` events for success/failure/rate-limit.
- One-time bootstrap logic: first-admin determination now counts only ADMIN-role rows.

## Envelope Examples

401 unauthorized (example):
```json
{ "ok": false, "error": { "code": "ADMIN_V4_UNAUTHORIZED", "message": "Missing admin session" } }
```

403 forbidden (example):
```json
{ "ok": false, "error": { "code": "ADMIN_V4_FORBIDDEN", "message": "Admin role required" } }
```

200 success (example):
```json
{ "ok": true, "data": { "admin": { "id": "...", "email": "...", "role": "ADMIN" }, "expiresAt": "..." } }
```

## Freeze Confirmation

No Admin V4 route imports legacy guard/session modules:
- Verified by `node scripts/admin-v4-static-scan.mjs` (pass).

## Stop Gate

Phase 1 deliverable complete.
