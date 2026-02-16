# 8Fold Certainty Audit — Phase 1–6 Findings

**Date:** 2026-02-15  
**Mode:** Read-only investigation. Output only.

---

## Phase 1 — Role Reality Check

### 1.1 Where `/api/me` is implemented in apps/api

**Exact file path:** `apps/api/app/api/me/route.ts`

**Code that returns `role`:**

```ts
// apps/api/app/api/me/route.ts
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    return NextResponse.json({ user });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
```

The `user` object comes from `requireUser(req)` in `apps/api/src/auth/rbac.ts`:

```ts
// optionalUser() returns:
return { userId: user.id, role: user.role as any };

// Where user comes from:
const userRows = await db
  .select({ id: users.id, role: users.role, status: users.status, suspendedUntil: users.suspendedUntil })
  .from(users)
  .where(eq(users.id, session.userId))
  .limit(1);
const user = userRows[0] ?? null;
// ...
return { userId: user.id, role: user.role as any };
```

**Conclusion:** `role` comes directly from `users.role` in the DB.

---

### 1.2 Database schema — `users` table role values

**Schema file:** `apps/api/db/schema/user.ts`

```ts
role: userRoleEnum("role").notNull().default("USER"),
```

**Enum definition:** `apps/api/db/schema/enums.ts`

```ts
export const userRoleEnum = pgEnum("UserRole", [
  "USER",
  "ADMIN",
  "CUSTOMER",
  "CONTRACTOR",
  "ROUTER",
  "JOB_POSTER",
]);
```

**Valid role values:** USER, ADMIN, CUSTOMER, CONTRACTOR, ROUTER, JOB_POSTER

**USER and CUSTOMER:** Both are valid enum values. Default is `USER`.

---

### 1.3 requireJobPosterAccount (apps/web) — allowed roles

**File:** `apps/web/src/server/auth/requireJobPosterAccount.ts` (lines 16–19)

```ts
const role = String(session.role ?? "").trim().toUpperCase();
if (role !== "JOB_POSTER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
  return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
}
```

**Allowed roles (explicit):** `JOB_POSTER`, `ADMIN`, `SUPER_ADMIN`

**Rejected roles:** USER, CUSTOMER, CONTRACTOR, ROUTER, and any other value

**Note:** `SUPER_ADMIN` is not in the DB enum. It may be a legacy or admin-app role. DB users will have one of the six enum values.

---

### 1.4 Role comparison — allowed roles

| Layer | Guard | Allowed roles |
|-------|-------|---------------|
| **apps/api** | `requireJobPoster` (rbac.ts) | USER, CUSTOMER, JOB_POSTER |
| **apps/api** | `requireJobPosterReady` (onboardingGuards) | Uses `requireJobPoster` → same |
| **apps/web** | `requireJobPosterAccount` | JOB_POSTER, ADMIN, SUPER_ADMIN |

**Mismatch:** Web rejects USER and CUSTOMER; API accepts them as job posters.

---

### Hard yes/no answer

**Are legacy job posters (USER/CUSTOMER) blocked by web but allowed by API?**

**Yes.**

---

## Phase 2 — Onboarding Gate Certainty

### 2.1 requireJobPosterAccount — profileComplete logic

**File:** `apps/web/src/server/auth/requireJobPosterAccount.ts` (lines 30–44)

```ts
const profResp = await apiFetch({ path: "/api/web/job-poster/profile", method: "GET", sessionToken: token, request: req });
const profJson = (await profResp.json().catch(() => null)) as any;
const p = profJson?.profile ?? null;
const profileComplete = Boolean(
  p &&
    String(p.address ?? "").trim() &&
    String(p.city ?? "").trim() &&
    String(p.stateProvince ?? "").trim() &&
    String(p.country ?? "").trim(),
);
```

**Required fields:** `address`, `city`, `stateProvince`, `country` — all must be non-empty strings.

---

### 2.2 apps/api requireJobPosterReady — profile completeness

**File:** `apps/api/src/auth/onboardingGuards.ts` (lines 63–86)

```ts
const profileRows = await db
  .select({
    address: jobPosterProfiles.address,
    city: jobPosterProfiles.city,
    stateProvince: jobPosterProfiles.stateProvince,
    country: jobPosterProfiles.country,
  })
  .from(jobPosterProfiles)
  .where(eq(jobPosterProfiles.userId, user.userId))
  .limit(1);
const profile = profileRows[0] ?? null;
const profileComplete = Boolean(
  profile &&
    (profile.address ?? "").trim() &&
    (profile.city ?? "").trim() &&
    (profile.stateProvince ?? "").trim() &&
    String(profile.country ?? "").trim()
);
```

**Required fields:** `address`, `city`, `stateProvince`, `country` — all must be non-empty.

---

### 2.3 Comparison

| Field | Web | API |
|-------|-----|-----|
| address | Required (non-empty) | Required (non-empty) |
| city | Required (non-empty) | Required (non-empty) |
| stateProvince | Required (non-empty) | Required (non-empty) |
| country | Required (non-empty) | Required (non-empty) |

**Conclusion:** Web and API use the same fields and logic. Both require `address`, `city`, `stateProvince`, and `country` to be non-empty.

---

### 2.4 Is web stricter than API?

**No.** Both use the same profile completeness checks.

---

## Phase 3 — TOS Certainty

### 3.1 job-poster-tos — how acceptedCurrent is computed

**File:** `apps/api/app/api/web/job-poster-tos/route.ts` (lines 10, 41–44)

```ts
const TOS_VERSION = "1.0";

// ... in GET handler:
const meta = (latest?.metadata ?? null) as any;
const acceptedVersion = typeof meta?.version === "string" ? meta.version : null;
const acceptedAt = typeof meta?.acceptedAt === "string" ? meta.acceptedAt : null;
const acceptedCurrent = acceptedVersion === TOS_VERSION;
```

**Required version:** `"1.0"` (matches `TOS_VERSION`)

**Logic:** `acceptedCurrent` is true only when `metadata.version === "1.0"`.

---

### 3.2 auditLogs schema — TOS acceptance storage

**File:** `apps/api/db/schema/auditLog.ts`

```ts
export const auditLogs = dbSchema.table("AuditLog", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  actorUserId: text("actorUserId"),
  actorAdminUserId: uuid("actorAdminUserId"),
  action: text("action").notNull(),
  entityType: text("entityType").notNull(),
  entityId: text("entityId").notNull(),
  metadata: jsonb("metadata"),
});
```

**TOS acceptance:** Rows with `action = "JOB_POSTER_TOS_ACCEPTED"`, `entityType = "User"`, `entityId = userId`, `actorUserId = userId`.

**metadata structure:** POST handler stores:

```ts
metadata: {
  agreementType: "JOB_POSTER_TOS",
  version: TOS_VERSION,  // "1.0"
  acceptedAt: new Date().toISOString(),
  ip: getRequestIp(req),
}
```

So `metadata.version` is the version used for `acceptedCurrent`.

---

### 3.3 Can accepted be true while acceptedCurrent is false?

**Yes.**

| Scenario | accepted | acceptedCurrent |
|----------|----------|-----------------|
| No audit log row | false | false |
| User accepted old version (e.g. "0.9") | true | false |
| User accepted "1.0" | true | true |

**Example:** User accepted an older TOS before "1.0". `latest` exists → `accepted = true`, but `metadata.version !== "1.0"` → `acceptedCurrent = false`.

**Response shape:**

```ts
return NextResponse.json({
  ok: true,
  agreementType: "JOB_POSTER_TOS",
  currentVersion: TOS_VERSION,
  accepted: Boolean(latest),      // true if any row exists
  acceptedCurrent,               // true only if version === "1.0"
  acceptedVersion,
  acceptedAt: ...
});
```

So the banner can show “accepted” while `acceptedCurrent` is false if the user accepted an older version.

---

### 3.4 Could the banner say accepted while acceptedCurrent is false?

**Yes.** If the UI uses `accepted` instead of `acceptedCurrent`, or if the user accepted an older TOS version.

---

## Phase 4 — Placeholder Route Certainty

### 4.1 Placeholder routes

| Web route | Calls apps/api? | Placeholder? |
|-----------|-----------------|-------------|
| `job-poster/checkins` | No | Yes |
| `job-poster/materials/pending` | No | Yes |
| `job-poster/contractor-responses` | No | Yes |
| `support/tickets` | No | Yes |

### 4.2 Per-route behavior

| Route | Guard used | 403 possible before placeholder? |
|-------|------------|----------------------------------|
| `job-poster/checkins` | `requireJobPosterAccount` | Yes — 403 if role/onboarding fails |
| `job-poster/materials/pending` | `requireJobPosterAccount` | Yes — 403 if role/onboarding fails |
| `job-poster/contractor-responses` | `requireJobPosterAccount` | Yes — 403 if role/onboarding fails |
| `support/tickets` | `requireSession` | Yes — 401 if no session (not 403) |

**403 before placeholder:** `requireJobPosterAccount` runs first and can return 403 for role or onboarding. The placeholder data is only returned if the guard passes.

---

### 4.3 Are 403s happening before hitting API entirely?

**Yes.** For checkins, materials/pending, and contractor-responses, 403s come from `requireJobPosterAccount` in apps/web. They never reach apps/api.

---

## Phase 5 — Session Certainty

### 5.1 requireSession — sid extraction

**File:** `apps/web/src/server/auth/requireSession.ts`

```ts
export function getSidFromRequest(req: Request): string | null {
  const cookies = parseCookieHeader(req.headers.get("cookie"));
  const sidRaw = cookies[SESSION_COOKIE_NAME] ?? "";
  let sid = "";
  try {
    sid = sidRaw ? decodeURIComponent(sidRaw) : "";
  } catch (err) {
    console.error("[AUTH_SID_INVALID_COOKIE]", err);
    sid = "";
  }
  return sid || null;
}
```

**Source:** Only `req.headers.get("cookie")` — no Authorization or x-session-token.

---

### 5.2 getSessionTokenFromRequest (apps/api) — priority order

**File:** `apps/api/src/auth/rbac.ts` (lines 49–71)

```ts
function getSessionTokenFromRequest(req: Request): string | null {
  // 1. Authorization Bearer
  const authz = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (authz && authz.toLowerCase().startsWith("bearer ")) {
    const token = authz.slice(7).trim();
    return token.length > 0 ? token : null;
  }
  // 2. x-session-token
  const header = req.headers.get("x-session-token");
  if (header && header.trim().length > 0) return header.trim();

  // 3. Cookie (cookie header)
  const cookieHeader = req.headers.get("cookie");
  const cookies = parseCookieHeader(cookieHeader);
  const sidRaw = cookies["sid"] ?? "";
  if (!sidRaw) return null;
  try {
    const sid = decodeURIComponent(sidRaw);
    return sid && sid.trim().length > 0 ? sid.trim() : null;
  } catch {
    return null;
  }
}
```

**Priority:** 1) Authorization Bearer, 2) x-session-token, 3) cookie.

**Cookie fallback:** Yes; cookie is used when neither header is present.

---

### 5.3 apiFetch — what it sends

**File:** `apps/web/src/server/api/apiClient.ts`

```ts
const mergedHeaders: Record<string, string> = {
  ...(reqInit.headers ?? {}),
  ...authHeadersFromSessionToken(reqInit.sessionToken),
};
if (forwardedCookie && !("cookie" in mergedHeaders) && !("Cookie" in mergedHeaders)) {
  mergedHeaders.cookie = forwardedCookie;
}
```

**authHeadersFromSessionToken:**

```ts
return {
  authorization: `Bearer ${token}`,
  "x-session-token": token,
};
```

**When `sessionToken` and `request: req` are provided:**

| Header | Value |
|--------|-------|
| Authorization | Bearer &lt;token&gt; |
| x-session-token | &lt;token&gt; |
| cookie | From req.cookie (if present) |

**Conclusion:** Session is sent via Authorization and x-session-token. Cookie is also forwarded when `request: req` is passed. Session forwarding is correct.

---

### 5.4 Is any 403 caused by session not being forwarded?

**No.** Session is forwarded via Authorization and x-session-token. Cookie is also forwarded when `request: req` is passed. 403s are likely from role or onboarding checks, not from missing session.

---

## Phase 6 — Single Most Important Certainty

### 6.1 Instrumentation code for requireJobPosterAccount

Add this to `apps/web/src/server/auth/requireJobPosterAccount.ts`:

```ts
// After line 16 (after role assignment), add:
console.warn("[REQUIRE_JOB_POSTER_ACCOUNT]",
  { role, userId: session.userId, step: "role_check" });

// After line 18 (inside the role check, before return):
if (role !== "JOB_POSTER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
  console.warn("[REQUIRE_JOB_POSTER_ACCOUNT] REJECTED role", { role, userId: session.userId });
  return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
}

// After line 28 (after tosJson), add:
console.warn("[REQUIRE_JOB_POSTER_ACCOUNT]",
  { acceptedCurrent, tosRespOk: tosResp.ok, userId: session.userId, step: "tos_check" });

// After line 31 (after profile fetch), add:
console.warn("[REQUIRE_JOB_POSTER_ACCOUNT]",
  {
    profileComplete,
    hasProfile: !!p,
    address: !!p?.address?.trim?.(),
    city: !!p?.city?.trim?.(),
    stateProvince: !!p?.stateProvince?.trim?.(),
    country: !!p?.country?.trim?.(),
    userId: session.userId,
    step: "profile_check",
  });

// After line 42 (inside onboarding check, before return):
if (!acceptedCurrent || !profileComplete) {
  console.warn("[REQUIRE_JOB_POSTER_ACCOUNT] REJECTED onboarding", {
    role,
    acceptedCurrent,
    profileComplete,
    userId: session.userId,
  });
  return NextResponse.json({ ok: false, error: "Onboarding incomplete" }, { status: 403 });
}
```

**Or simpler:** add at the top of the function, after session is obtained:

```ts
console.warn("[REQUIRE_JOB_POSTER_ACCOUNT] entry", {
  role: String(session.role ?? "").trim().toUpperCase(),
  userId: session.userId,
});
```

And before each 403 return:

```ts
console.warn("[REQUIRE_JOB_POSTER_ACCOUNT] 403", { reason: "role" | "onboarding", ... });
```

---

### 6.2 Simulate request

```bash
# With sid cookie (replace SID_VALUE with actual session token from browser):
curl -v -H "Cookie: sid=SID_VALUE" http://localhost:3006/api/app/job-poster/jobs

# Or with session token in Authorization:
curl -v -H "Authorization: Bearer SID_VALUE" http://localhost:3006/api/app/job-poster/jobs
```

---

### 6.3 How to capture logs

1. Start apps/web: `pnpm dev` (or equivalent) in the web app.
2. Add the instrumentation above.
3. Trigger a request (browser or curl).
4. Check the terminal where apps/web is running for `[REQUIRE_JOB_POSTER_ACCOUNT]` logs.

---

### 6.4 Interpreting failure

| Logged value | Likely cause |
|--------------|--------------|
| `role` = "USER" or "CUSTOMER" | Role mismatch (legacy job poster) |
| `acceptedCurrent` = false | TOS version mismatch |
| `profileComplete` = false | Profile missing or incomplete |

---

## Summary — Quick Reference

| Question | Answer |
|----------|--------|
| Legacy job posters (USER/CUSTOMER) blocked by web but allowed by API? | **Yes** |
| Is web stricter than API on profile? | **No** |
| Could banner say accepted while acceptedCurrent is false? | **Yes** |
| Are 403s happening before hitting API? | **Yes** (for checkins, materials, contractor-responses) |
| Is any 403 caused by session not being forwarded? | **No** |
