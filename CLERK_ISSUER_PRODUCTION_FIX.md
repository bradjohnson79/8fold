# CLERK_ISSUER Production Fix — Deployment Guide

**Root cause:** Backend `/api/me` returns 401 because JWT issuer mismatch. The token's `iss` claim does not match `CLERK_ISSUER` in `apps/api`.

---

## 1. Exact Code Path That Returns 401 in /api/me

```
apps/api/app/api/me/route.ts
  GET() → requireAuth(req)
    ↓
apps/api/src/auth/requireAuth.ts
  requireAuth(req):
    1. token = getBearerToken(req)  → if !token → 401 (AUTH_MISSING_TOKEN)
    2. verifyToken(token, { issuer: expectedIssuer, audience, ... })
       → on throw → 401 (AUTH_INVALID_ISSUER | AUTH_INVALID_AUDIENCE | AUTH_INVALID_TOKEN)
    3. issuer = normalizeIssuer(verified.iss)
       if issuer !== expectedIssuer → 401 (AUTH_INVALID_ISSUER)
```

When `requireAuth` returns a `Response` (401), `/api/me` returns it directly: `if (authed instanceof Response) return authed`.

---

## 2. Issuer Verification Details

| Item | Implementation |
|------|----------------|
| **Where** | `apps/api/src/auth/requireAuth.ts` lines 56–57, 86, 127, 147 |
| **CLERK_ISSUER** | `process.env.CLERK_ISSUER` → `normalizeIssuer(expectedIssuerRaw)` |
| **Token iss** | `verified.iss` from Clerk's `verifyToken()` → `normalizeIssuer(issuer)` |
| **Comparison** | `issuer !== expectedIssuer` (both normalized) |
| **Trailing slash** | **Does not matter.** `normalizeIssuer()` strips trailing slashes: `stripTrailingSlash(String(v).trim()).toLowerCase()` |
| **Case** | **Does not matter.** Both are lowercased. |

---

## 3. Diagnostic Log (Added)

When a 401 is returned for token verification or issuer mismatch, a safe diagnostic log is emitted:

```
[AUTH_401_DIAGNOSTIC] {
  path: "verify_throw" | "issuer_mismatch",
  requestId: "...",
  token_iss: "<from JWT payload, not the token>",
  token_aud: "<from JWT payload>",
  configured_CLERK_ISSUER: "<env value after normalize>",
  configured_CLERK_AUDIENCE: ["..."] | "(empty)",
  verified_iss_after_normalize: "<only for issuer_mismatch path>"
}
```

**No secrets are logged.** Only decoded `iss` and `aud` claims from the JWT payload.

---

## 4. Production Environment Variables (Vercel)

### apps/api (8fold-api project)

Set these in **Vercel Dashboard → Project → Settings → Environment Variables** for **Production** (and Preview if you use it):

| Variable | Required | Value | Notes |
|----------|----------|-------|-------|
| `CLERK_ISSUER` | **Yes** | `https://<your-clerk-frontend-api>` | Must match JWT `iss` exactly. For default Clerk: `https://<instance>.clerk.accounts.dev`. For custom domain: `https://clerk.yourdomain.com`. No trailing slash. |
| `CLERK_JWT_KEY` | One of these | PEM public key from Clerk Dashboard | JWT Templates → Default → Signing key (public) |
| `CLERK_SECRET_KEY` | One of these | `sk_live_...` from Clerk Dashboard | API Keys |
| `CLERK_AUDIENCE` | No | Leave empty or comma-separated list | Only if you use custom JWT audience |
| `CLERK_AUTHORIZED_PARTIES` | Optional | `https://8fold.app,https://admin.8fold.app` | Your app origins if using azp validation |

### How to get CLERK_ISSUER

1. **Clerk Dashboard** → Your application → **API Keys** or **JWT Templates**
2. **Default Clerk domain:** `https://<frontend-api>.clerk.accounts.dev` (e.g. `https://happy-animal-12.clerk.accounts.dev`)
3. **Custom domain:** `https://clerk.8fold.app` (or whatever you configured)
4. Decode a JWT at [jwt.io](https://jwt.io) and read the `iss` claim, or check Vercel logs for `[AUTH_401_DIAGNOSTIC]` → `token_iss` and set `CLERK_ISSUER` to that value.

---

## 5. Where to Set Env Vars (Separate API Deployment)

If `apps/api` is deployed as a **separate Vercel project** (e.g. `8fold-api`):

- **Vercel Dashboard** → Select `8fold-api` project → **Settings** → **Environment Variables**
- Add/update `CLERK_ISSUER`, `CLERK_JWT_KEY` (or `CLERK_SECRET_KEY`), and optionally `CLERK_AUDIENCE`, `CLERK_AUTHORIZED_PARTIES`
- Ensure **Production** and **Preview** are both configured if you use preview deployments

---

## 6. Redeploy Steps

1. **Set env vars** in Vercel (see above).
2. **Deploy:**
   - **Option A:** Push to `main` → Vercel auto-deploys.
   - **Option B:** Vercel Dashboard → Deployments → ⋮ on latest → **Redeploy** (use existing env vars).
3. **Wait** for deployment to finish (Ready).
4. **Verify** using the checklist below.

---

## 7. Hard Verification Checklist

After setting vars and redeploying:

| Check | Expected |
|-------|----------|
| `GET /api/me` with valid Bearer token (logged-in user) | **200** with `ok: true`, `data: { id, role, ... }` |
| `GET /api/me` without token | **401** |
| Visit `/app` while logged in | **No** "Session still loading"; redirect to role dashboard |
| Network tab for `/api/me` | **No 401** when logged in |

### Quick test

```bash
# Get a token from browser (DevTools → Application → Cookies, or use Clerk's getToken in console)
TOKEN="eyJ..."

curl -H "Authorization: Bearer $TOKEN" https://api.8fold.app/api/me
# Expect: 200 with JSON body
```

---

## 8. Optional Robustness (Already Applied)

- **Token wait:** 2000ms in production (`apps/web/src/server/auth/meSession.ts`) — kept to reduce getToken timing issues.
- **Issuer fix is required.** Do not rely on timing changes to mask issuer mismatch.

---

## 9. Code Diff (Exact Change)

```diff
--- a/apps/api/src/auth/requireAuth.ts
+++ b/apps/api/src/auth/requireAuth.ts
@@ -34,6 +34,45 @@ function normalizeIssuer(v: string): string {
   return stripTrailingSlash(String(v ?? "").trim()).toLowerCase();
 }
 
+/**
+ * Decode JWT payload (claims only) without verification. Safe for diagnostic logging.
+ */
+function decodeJwtClaimsUnsafe(token: string): { iss?: string; aud?: string | string[] } | null {
+  try {
+    const parts = token.split(".");
+    if (parts.length !== 3) return null;
+    const payload = parts[1];
+    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
+    const json = Buffer.from(base64, "base64").toString("utf8");
+    const parsed = JSON.parse(json) as Record<string, unknown>;
+    return {
+      iss: typeof parsed.iss === "string" ? parsed.iss : undefined,
+      aud: parsed.aud as string | string[] | undefined,
+    };
+  } catch {
+    return null;
+  }
+}
+
+function logAuth401Diagnostic(opts: { token: string; expectedIssuer: string; expectedAudience: string[]; requestId: string; path: "verify_throw" | "issuer_mismatch"; verifiedIssuer?: string }): void {
+  const claims = decodeJwtClaimsUnsafe(opts.token);
+  console.warn("[AUTH_401_DIAGNOSTIC]", {
+    path: opts.path,
+    requestId: opts.requestId,
+    token_iss: claims?.iss ?? "(decode failed)",
+    token_aud: claims?.aud ?? "(decode failed)",
+    configured_CLERK_ISSUER: opts.expectedIssuer,
+    configured_CLERK_AUDIENCE: opts.expectedAudience.length ? opts.expectedAudience : "(empty)",
+    ...(opts.verifiedIssuer !== undefined && { verified_iss_after_normalize: opts.verifiedIssuer }),
+  });
+}
+
 export async function requireAuth(req: Request): Promise<RequireAuthOk | Response> {
   ...
   } catch (err) {
     ...
+    logAuth401Diagnostic({
+      token,
+      expectedIssuer,
+      expectedAudience: audience,
+      requestId,
+      path: "verify_throw",
+    });
     logAuthFailure(req, { ... });
     return authErrorResponse(req, { status: 401, ... });
   }
   ...
   if (issuer !== expectedIssuer) {
+    logAuth401Diagnostic({
+      token,
+      expectedIssuer,
+      expectedAudience: audience,
+      requestId,
+      path: "issuer_mismatch",
+      verifiedIssuer: issuer,
+    });
     logAuthFailure(req, { ... });
     return authErrorResponse(req, { status: 401, ... });
   }
```
