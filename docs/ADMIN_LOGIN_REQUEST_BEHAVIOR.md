# Admin Login — Request Execution + Redirect Behavior

## PHASE 1 — Form Submission

**Location:** `apps/admin/src/app/(auth)/login/LoginClient.tsx`

| Item | Value |
|------|-------|
| Method | **fetch()** (not `<form method="POST">`) |
| Route | `POST /api/admin/login` |
| Body | `JSON.stringify({ email, password })` |
| Credentials | `include` |
| On success | `window.location.href = next` (next = "/" default) |
| On error | `setError("Invalid email or password")` or `setError("Login failed")` |

Form uses `onSubmit` → `submit(e)` → `e.preventDefault()` → fetch → then redirect.

---

## PHASE 2 — Login Route Response

**Location:** `apps/admin/src/app/api/admin/login/route.ts`

| Item | Value |
|------|-------|
| Response type | **NextResponse.json()** (200, JSON body) |
| Redirect? | No — route returns JSON only |
| Cookie | `res.cookies.set(admin_session, token, {...})` on same response |
| Pattern | JSON + cookie on same response ✓ |

Route does NOT return redirect. Frontend performs redirect after fetch completes.

---

## PHASE 3 — Redirect Sequencing

**Current flow:**
1. User clicks Sign in
2. fetch POST /api/admin/login
3. Response received (200, Set-Cookie in headers, JSON body)
4. Browser stores cookie (synchronous when response received)
5. `window.location.href = "/"` — full page navigation
6. New request to / — cookie should be sent

**Potential issue:** Some browsers may not have fully committed the cookie to storage before the synchronous `window.location.href` runs. A short delay before redirect allows the cookie to be stored.

**Fix applied:** `await new Promise((r) => setTimeout(r, 100))` before `window.location.href`.

---

## PHASE 4 — Debug Log

`[ADMIN_LOGIN_ROUTE_HIT]` added at top of POST handler.

If this log does NOT appear in Vercel logs when clicking login:
- Form is not calling the API route
- Or request is going elsewhere (wrong URL, CORS, etc.)

---

## Summary

| Question | Answer |
|----------|--------|
| Is login POST being sent? | Yes — fetch() from LoginClient |
| What status returned? | 200 (JSON) |
| Is cookie set on that response? | Yes — res.cookies.set() |
| Is redirect before cookie? | Possibly — added 100ms delay |
| Route returns redirect? | No — returns JSON |
