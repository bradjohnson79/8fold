# Phase 9 — Advanced Error Hardening

Structured API error handling, correlation IDs, and production-safe logging.

## STEP 1 — Universal API Wrapper

**File:** `apps/api/src/server/withApiHandler.ts`

- Generates `requestId` (uuid) per request
- Wraps route handlers in try/catch
- Logs structured errors via `logApiError`
- Returns safe error envelope
- Adds `x-request-id` header to all responses

**Usage:**

```ts
import { withApiHandler } from "@/server/withApiHandler";
import { ok } from "@/lib/api/respond";

export const GET = withApiHandler(async (req, ctx) => {
  const data = await fetchSomeData();
  return ok(data, { requestId: ctx.requestId });
});
```

## STEP 2 — Standardized Response Shape

**File:** `apps/api/src/lib/api/respond.ts`

**Success:**
```json
{ "ok": true, "data": {...}, "requestId": "uuid" }
```

**Failure:**
```json
{ "ok": false, "error": { "code": "string", "message": "string" }, "requestId": "uuid" }
```

## STEP 3 — DB Error Classification

**File:** `apps/api/src/lib/errors/mapErrorCode.ts`

| Postgres Code | API Code |
|---------------|----------|
| 23505 (unique_violation) | conflict_error |
| 23503 (foreign_key_violation) | invalid_reference |
| 22P02, 22P05 (invalid_text_representation, invalid_parameter_value) | invalid_state_transition |
| 02000, P0002 (no_data_found, no_data) | not_found |
| default | internal_error |

## STEP 4 — Frontend Fetch Client

**File:** `apps/web/src/lib/fetchClient.ts`

- Expects structured envelope
- Logs `requestId` on failure
- Throws with message to prevent silent 500 UI failures

**Usage:**

```ts
import { fetchClient } from "@/lib/fetchClient";

const data = await fetchClient<MyType>("/api/app/job-poster/jobs");
```
