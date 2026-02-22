# Admin Login Failure Deep Audit Report

## PHASE 1 — Login Handler Inspection

### Location
- **API (authoritative):** `apps/api/app/api/admin/login/route.ts`
- **Admin proxy:** `apps/admin/src/app/api/admin/login/route.ts` — forwards to API with `x-admin-proxy: true`

### API Login Flow
1. `ensureAdminSessionsTable()` — creates table if missing
2. Parse body: `{ email, password }` via zod
3. Query `AdminUser` by email (case-insensitive)
4. Reject if `!admin?.id || !admin.passwordHash`
5. `bcrypt.compare(password, admin.passwordHash)` — **bcryptjs**, no explicit rounds (hash contains rounds)
6. Create session in `admin_sessions`, return token
7. If `x-admin-proxy: true`: include `sessionToken` + `expiresAt` in JSON body (proxy sets cookie)
8. Else: set `Set-Cookie` on response

### Checks
- **No status check** — AdminUser schema has no `status` column
- **No role check** — Any role (ADMIN, SUPER_ADMIN) can log in
- **No lockout** — No rate limiting or lockout logic

---

## PHASE 2 — Production AdminUser Row

| Field        | Value                                      |
|-------------|---------------------------------------------|
| id          | 65d9db78-24ea-493d-9a64-aa930962d21a       |
| email       | bradjohnson79@gmail.com                     |
| role        | SUPER_ADMIN                                 |
| passwordHash | NOT NULL, `$2a$10$...` (bcrypt)             |
| createdAt   | 2026-02-02                                  |

**Result:** Row exists, `passwordHash` is valid bcrypt.

---

## PHASE 3 — Hash Compatibility

- **Library:** bcryptjs (login, signup, reset script)
- **Rounds:** 10 (from signup, ensure-admin-user, reset-admin-password)
- **Stored hash:** `$2a$10$...` — bcrypt, 10 rounds ✓
- **Test:** `bcrypt.compare("TempAdmin-8Fold-2026", hash)` → **true**

**Result:** Password hash is compatible. No mismatch.

---

## PHASE 4 — Backend Verification

- **API direct:** `POST api.8fold.app/api/admin/login` → 200, `{ ok: true, data: { admin } }`
- **Admin proxy:** `POST admin.8fold.app/api/admin/login` → 200, `Set-Cookie: admin_session=...`

**Result:** Backend accepts credentials and returns session.

---

## PHASE 5 — Root Cause Summary

| Check              | Result |
|--------------------|--------|
| AdminUser exists   | ✓      |
| passwordHash valid | ✓      |
| bcrypt.compare ok  | ✓      |
| API returns 200    | ✓      |
| Proxy returns Set-Cookie | ✓  |

**Conclusion:** Backend is functioning. Failure is likely:

1. **Client:** Browser not storing/sending cookie (privacy settings, extensions)
2. **Typo:** Wrong password (e.g. extra space, wrong year)
3. **Redirect loop:** Cookie set but not sent on next request (domain/path/SameSite)

---

## Diagnostic Logs Added

Temporary `[ADMIN_LOGIN]` logs in API route:
- `parse_fail` — body parse failed
- `no_admin` — no AdminUser row for email
- `compare_fail` — bcrypt.compare returned false
- `compare_ok` — password matched
- `session_created` — session row inserted
- `success` — response about to return
- `catch` — unhandled error

Search Vercel logs (8fold-api) for `[ADMIN_LOGIN]` to trace real login attempts.

---

## Recommended Next Steps

1. **Try login** — Use exact password: `TempAdmin-8Fold-2026` (no spaces)
2. **Check Vercel logs** — If `compare_fail` appears, password is wrong. If `success` appears, backend succeeded; issue is cookie/redirect.
3. **Browser:** Try incognito, different browser, or disable extensions that block cookies.
4. **Reset password** (if needed): `ADMIN_EMAIL=bradjohnson79@gmail.com ADMIN_PASSWORD='NewPass123!' pnpm exec tsx apps/api/scripts/reset-admin-password.ts`
