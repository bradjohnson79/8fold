# Contractor Invite Diagnosis — Job 52d7114d-0daf-48eb-95e4-4efaa81ff6ba

## 1️⃣ v4_contractor_job_invites for this job

**Query:** `SELECT * FROM v4_contractor_job_invites WHERE job_id = '52d7114d-0daf-48eb-95e4-4efaa81ff6ba'`

| Rows | contractor_user_id | status | expires_at |
|------|-------------------|--------|------------|
| 1 | 82cc31cc-650b-42e8-b9af-f1ffd91899f5 | PENDING | 2026-03-08T08:21:32.621Z |

**Conclusion:** There is exactly one invite row. It is PENDING (not expired). The contractor `82cc31cc-650b-42e8-b9af-f1ffd91899f5` has a valid invite.

---

## 2️⃣ Contractor account ID

Run this to find your contractor user ID:

```sql
SELECT id, email FROM users WHERE email = 'your_contractor_email';
```

Compare that `id` to `82cc31cc-650b-42e8-b9af-f1ffd91899f5`. If they match, the invite belongs to you. If not, the UI may be showing another contractor's invite (query bug).

---

## 3️⃣ Contractor invites API response

**Endpoint:** `GET /api/web/v4/contractor/invites`

The invites page calls this endpoint. The API uses `listPendingInvites(contractorUserId)` which filters by:
- `contractor_user_id = contractorUserId`
- `status = PENDING`
- `expires_at > now()`

**To capture:** Open DevTools → Network → reload `/dashboard/contractor/invites` → find the request → copy the JSON response.

---

## 4️⃣ Job status (current)

**Query:** `SELECT status, routing_status, claimed_by_user_id FROM jobs WHERE id = '52d7114d-0daf-48eb-95e4-4efaa81ff6ba'`

| status | routing_status | claimed_by_user_id |
|--------|----------------|--------------------|
| OPEN_FOR_ROUTING | INVITES_SENT | d6e3f65d-659d-4eaa-8465-f63e3bb45961 |

**Conclusion:** The job is **not** UNROUTED. It is INVITES_SENT with a router claimed. Admin may have shown stale data, or the job was re-routed after you looked.

---

## 5️⃣ Expired invites

**Query:** `SELECT contractor_user_id, status, expires_at FROM v4_contractor_job_invites WHERE job_id = '52d7114d-0daf-48eb-95e4-4efaa81ff6ba'`

| contractor_user_id | status | expires_at |
|--------------------|--------|------------|
| 82cc31cc-650b-42e8-b9af-f1ffd91899f5 | PENDING | 2026-03-08T08:21:32.621Z |

**Conclusion:** No expired invites. The single invite is PENDING and expires tomorrow.

---

## 6️⃣ API powering the invites page

**Answer:** `GET /api/web/v4/contractor/invites`

The contractor invites page (`/dashboard/contractor/invites`) calls this endpoint via `apiFetch("/api/web/v4/contractor/invites", getToken)`.

---

## 7️⃣ Same browser / multiple roles?

You need to confirm: Are you testing contractor in the same browser session as admin/router? Cookie overlap can make the backend think you're a different user.

---

## Root cause identified

The contractor **accept** flow in `contractorInviteService.ts` requires:

```ts
if (String(job.status ?? "").toUpperCase() !== "INVITED") {
  throw conflict("V4_JOB_NOT_ASSIGNABLE", "Job is no longer available for assignment");
}
```

And later:

```ts
.where(and(eq(jobs.id, inviteAfterLock.jobId), eq(jobs.status, "INVITED" as any)))
```

But the **V4 router stage2** flow (`routerStage2ContractorSelectionService`) does **not** set `status` to `INVITED`. It only sets `routing_status = INVITES_SENT` and leaves `status = OPEN_FOR_ROUTING`.

So:
- Invite exists and is PENDING
- Job has status OPEN_FOR_ROUTING (not INVITED)
- Accept fails with `V4_JOB_NOT_ASSIGNABLE` → "Job is no longer available for assignment"

The legacy `routerRouteJobService` sets `status: "INVITED"`, but the V4 stage2 flow does not. The `INVITED` value may also not exist in the `JobStatus` enum (it is not in the Drizzle schema).

---

## Recommended fix

**Option A (preferred):** Update the contractor accept flow to treat `OPEN_FOR_ROUTING` with `routing_status = INVITES_SENT` as assignable, in addition to `INVITED`:

- Change the status check from `!== "INVITED"` to allow `OPEN_FOR_ROUTING` when `routing_status === "INVITES_SENT"`.
- Update the `WHERE` clause on the job update to allow `OPEN_FOR_ROUTING` in that case.

**Option B:** Add `INVITED` to the `JobStatus` enum and set `status: "INVITED"` in the stage2 route flow. This requires a migration and schema change.
