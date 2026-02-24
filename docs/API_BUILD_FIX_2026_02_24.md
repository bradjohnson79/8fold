# API Turbo Build Fix — 2026-02-24

## Full Original Error Block

```
@8fold/api:build: Failed to compile.
@8fold/api:build: 
@8fold/api:build: ./src/server/withApiHandler.ts:78:45
@8fold/api:build: Type error: Object literal may only specify known properties, and 'message' does not exist in type 'Omit<ResponseInit, "status">'.
@8fold/api:build: 
@8fold/api:build:  76 |       const message = safeErrorMessage(err, status);
@8fold/api:build:  77 | 
@8fold/api:build: > 78 |       const failResp = fail(status, code, { message });
@8fold/api:build:     |                                             ^
@8fold/api:build:  79 |       return await addRequestId(failResp);
@8fold/api:build:  80 |     }
@8fold/api:build: Next.js build worker exited with code: 1 and signal: null
@8fold/api:build:  ELIFECYCLE  Command failed with exit code 1.
```

**Secondary failure (after TS fix):**
```
Error: Stripe key/mode mismatch (mode=test, sk=LIVE, pk=TEST)
> Build error occurred
[Error: Failed to collect page data for /api/admin/contractors/[id]/stripe/onboard]
```

---

## Root Cause Classification

| # | Type | Description |
|---|------|--------------|
| 1 | **A) TypeScript type error** | `fail()` in `respond.ts` did not accept `{ message }` in third param; type was `Omit<ResponseInit, "status">` only |
| 2 | **C) Stripe module load error** | `assertStripeKeysMatchMode` runs at stripe module load; during "Collecting page data" it throws if env keys mismatch (local: mode=test, sk=LIVE) |

---

## Exact Fixes Applied

### Fix 1 — [apps/api/src/lib/api/respond.ts](apps/api/src/lib/api/respond.ts)

Extended `fail()` signature to accept optional `message`:

```ts
export function fail(
  status: number,
  code: string,
  init?: Omit<ResponseInit, "status"> & { message?: string }
): NextResponse {
  const headers = init?.headers;
  const message =
    init?.message ??
    (status === 401 ? "Unauthorized" : ...);
  // ...
}
```

### Fix 2 — [apps/api/src/stripe/stripe.ts](apps/api/src/stripe/stripe.ts)

Defer Stripe key validation during Next.js build phase:

```ts
// Defer validation during Next.js build (Collecting page data) — env may differ from runtime
if (process.env.NEXT_PHASE !== "phase-production-build") {
  assertStripeKeysMatchMode({ ... });
}
```

---

## Confirmation

- [x] Local build passes: `pnpm exec turbo run build`
- [x] API build passes: `pnpm exec turbo run build --filter=@8fold/api`
- [ ] Push to branch
- [ ] Vercel API build succeeds
- [ ] `curl https://api.8fold.app/health`
- [ ] Job Post v3 flow works against production API
