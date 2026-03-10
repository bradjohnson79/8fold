# Job Cancellation Flow — Smoke Test

Run these tests against a staging or mock job before deploying to production.

---

## Prerequisites

- A Job Poster account with at least one published, unrouted job
- Admin credentials with a role that can access the Admin Dashboard
- Stripe test mode active (or use a live mode job with a real PI for full-cycle tests)

---

## Test 1: Poster Cancel Before Payment

**Scenario**: Job Poster cancels a job that was never paid (no Stripe PI).

**Steps**:
1. Create and publish a job as Job Poster (status: `OPEN_FOR_ROUTING`, payment: `UNPAID`)
2. POST `api/web/v4/job-poster/jobs/{jobId}/cancel-request` with a reason
3. Verify `job.cancel_request_pending = true` in DB
4. Verify a `job_cancel_requests` row exists with `status = pending`
5. Verify a `v4_support_tickets` row exists with `category = PAYMENT_ISSUE`, `status = OPEN`
6. Check Admin Dashboard — job should show orange "Cancellation Requested" badge
7. Open job detail — Cancellation Request card should show with "Approve Cancellation" active

**Expected Admin Flow**:
- Click "Approve Cancellation" → job `status = CANCELLED`, ticket `status = RESOLVED`
- "Issue Refund" button should remain disabled (no payment)

**Pass Criteria**:
- `jobs.status = CANCELLED`
- `job_cancel_requests.status = approved`
- `v4_support_tickets.status = RESOLVED`
- `jobs.cancel_request_pending = false`

---

## Test 2: Poster Cancel After Payment (Full Cycle)

**Scenario**: Job Poster cancels a job that has been paid (FUNDS_SECURED), triggering a full refund.

**Steps**:
1. Create, publish, and complete payment for a job (status: `OPEN_FOR_ROUTING`, payment: `FUNDS_SECURED`)
2. POST `api/web/v4/job-poster/jobs/{jobId}/cancel-request` with a reason
3. Verify cancel request row created, `cancel_request_pending = true`
4. Verify support ticket created

**Admin Approve**:
5. POST `api/admin/v4/jobs/{jobId}/approve-cancellation`
6. Verify `jobs.status = CANCELLED`, `job_cancel_requests.status = approved`

**Admin Refund**:
7. POST `api/admin/v4/jobs/{jobId}/refund`
8. Verify Stripe refund in Stripe dashboard
9. Verify `jobs.payment_status = REFUNDED`, `escrows.status = REFUNDED`
10. Verify `job_cancel_requests.status = refunded`
11. Verify `v4_support_tickets.status = RESOLVED`

**Pass Criteria**:
- Stripe refund exists
- All DB fields updated correctly
- `REFUND_ISSUED` domain event emitted → notification sent to job poster and admins

---

## Test 3: Poster Cancel Twice (Duplicate Request Guard)

**Scenario**: Job Poster attempts to submit a second cancellation request while one is already pending.

**Steps**:
1. Submit first cancel request (as Test 1 above)
2. Immediately POST another cancel request for the same job
3. Expect HTTP 409 with code `V4_CANCEL_REQUEST_PENDING`

**Pass Criteria**:
- Second request rejected with 409
- Only one `job_cancel_requests` row exists with `status = pending`

---

## Test 4: Refund Attempt Twice (Double-Refund Guard)

**Scenario**: Admin attempts to issue a refund after one has already been issued.

**Steps**:
1. Complete full refund cycle (Test 2)
2. Attempt POST `api/admin/v4/jobs/{jobId}/refund` again
3. Expect HTTP 409 with code `ADMIN_V4_ALREADY_REFUNDED` or `ADMIN_V4_CANCEL_REQUEST_ALREADY_REFUNDED`

**Pass Criteria**:
- Second refund attempt rejected with 409
- No second Stripe refund created
- DB not modified

---

## Test 5: Admin Approve Without Refund

**Scenario**: Admin approves the cancellation but does not issue a refund (e.g. job was never paid).

**Steps**:
1. Create unpaid job, submit cancel request
2. POST `api/admin/v4/jobs/{jobId}/approve-cancellation`
3. Verify job cancelled, ticket resolved
4. Do NOT call the refund endpoint
5. Reload Admin Job Detail — card should show `status = APPROVED`, "Issue Refund" should be disabled (no funds)

**Pass Criteria**:
- `jobs.status = CANCELLED`
- `job_cancel_requests.status = approved`
- "Issue Refund" button disabled (payment_status is not FUNDS_SECURED)

---

## Test 6: Admin Refund Without Approve (Guard Test)

**Scenario**: Admin skips the approve step and attempts to refund a job with a PENDING cancel request.

**Steps**:
1. Create paid job, submit cancel request (status: `pending`)
2. POST `api/admin/v4/jobs/{jobId}/refund` directly (skip approve step)
3. Expect HTTP 409 with code `ADMIN_V4_NO_APPROVED_CANCEL_REQUEST`

**Pass Criteria**:
- Refund rejected with 409
- No Stripe refund created
- DB unchanged

---

---

## Type B Tests — Assigned Job Cancellation

Prerequisites for Type B tests:
- A job in `ASSIGNED`, `JOB_STARTED`, or `IN_PROGRESS` status with a payment intent
- A contractor assigned to the job
- Admin credentials

---

## Test B1: Poster Cancels Outside 8h Window → 100% Refund

**Scenario**: Job Poster cancels an assigned job where appointment is >8h away (or no appointment set).

**Steps**:
1. Have an `ASSIGNED` job with `appointment_at = NULL` or more than 8 hours in the future
2. POST `api/web/v4/job-poster/jobs/{jobId}/cancel-assigned` with reason
3. Verify `jobs.status = ASSIGNED_CANCEL_PENDING`, `cancel_request_pending = true`
4. Verify `job_cancel_requests` row with `requested_by_role = JOB_POSTER`, `within_penalty_window = false`
5. Verify `v4_support_tickets` row created with `category = PAYMENT_ISSUE`, `status = OPEN`

**Admin Flow**:
6. POST `api/admin/v4/jobs/{jobId}/cancel-assigned` → `jobs.status = CANCELLED`
7. POST `api/admin/v4/jobs/{jobId}/partial-refund` with body `{ confirmText: "REFUND" }`

**Pass Criteria**:
- Stripe: full refund for 100% of `amount_cents`
- `escrows.status = REFUNDED`
- `jobs.payment_status = REFUNDED`
- `job_cancel_requests.refund_processed_at IS NOT NULL`
- `v4_support_tickets.status = RESOLVED`
- `v4_financial_ledger` row: `type = JOB_CANCELLATION_REFUND`, `dedupe_key = cancel_refund_{jobId}_{cancelRequestId}`
- No payout, no suspension

---

## Test B2: Poster Cancels Inside 8h Window → 75% Refund + 25% Contractor Payout

**Scenario**: Job Poster cancels with appointment within 8 hours.

**Steps**:
1. Set `jobs.appointment_at = NOW() + 4 hours`
2. POST `api/web/v4/job-poster/jobs/{jobId}/cancel-assigned` with reason
3. Verify `job_cancel_requests.within_penalty_window = true`

**Admin Flow**:
4. POST `api/admin/v4/jobs/{jobId}/cancel-assigned`
5. POST `api/admin/v4/jobs/{jobId}/partial-refund` with `{ confirmText: "REFUND" }`
   - Verify Stripe refund = 75% of `amount_cents` (use `splitByPercent(amountCents, 75)`)
   - `escrows.status = PARTIALLY_REFUNDED`
   - Support ticket still `OPEN`
6. POST `api/admin/v4/jobs/{jobId}/contractor-payout` with `{ confirmText: "PAYOUT" }`
   - Verify Stripe transfer = 25% of `amount_cents`
   - `job_cancel_requests.payout_processed_at IS NOT NULL`
   - Support ticket now `RESOLVED`

**Pass Criteria**:
- `v4_financial_ledger`: two rows — `JOB_CANCELLATION_REFUND` + `JOB_CANCELLATION_CONTRACTOR_PAYOUT`
- Both `refund_processed_at` and `payout_processed_at` are set on the cancel request
- `JOB_ASSIGNED_CANCELLATION_RESOLVED` domain event emitted with `resolutionType = PARTIAL_REFUND_WITH_CONTRACTOR_PAYOUT`
- System message in job thread with dedupeMarker `cancel_resolution_{jobId}_poster_in_window`

---

## Test B3: Contractor Cancels Outside 8h Window → 100% Refund, No Suspension

**Scenario**: Contractor cancels with appointment >8h away (or null).

**Steps**:
1. Call contractor cancel endpoint (or modify existing `cancelAssignedJob` call) for a job with no imminent appointment
2. Verify `jobs.status = ASSIGNED_CANCEL_PENDING`, `job_cancel_requests.requested_by_role = CONTRACTOR`
3. Verify `within_penalty_window = false`

**Admin Flow**:
4. POST `api/admin/v4/jobs/{jobId}/cancel-assigned`
5. POST `api/admin/v4/jobs/{jobId}/partial-refund` with `{ confirmText: "REFUND" }`

**Pass Criteria**:
- 100% Stripe refund
- `escrows.status = REFUNDED`
- Support ticket `RESOLVED`
- Attempting `suspend-contractor` returns `409 ADMIN_V4_SUSPENSION_NOT_APPLICABLE`

---

## Test B4: Contractor Cancels Inside 8h Window → 100% Refund + 7-Day Suspension

**Scenario**: Contractor cancels with appointment within 8 hours.

**Steps**:
1. Set `jobs.appointment_at = NOW() + 3 hours`
2. Call contractor cancel for the job
3. Verify `job_cancel_requests.within_penalty_window = true`, `requested_by_role = CONTRACTOR`

**Admin Flow**:
4. POST `api/admin/v4/jobs/{jobId}/cancel-assigned`
5. POST `api/admin/v4/jobs/{jobId}/partial-refund` with `{ confirmText: "REFUND" }` — full refund, ticket still OPEN
6. POST `api/admin/v4/jobs/{jobId}/suspend-contractor` with `{ confirmText: "SUSPEND" }`

**Pass Criteria**:
- 100% Stripe refund to poster
- `v4_contractor_suspensions` row: `contractor_user_id = {contractorId}`, `suspended_until = now + 7d`
- Suspended contractor excluded from routing queries immediately (query them via `routerEligibleContractorsService` — they should not appear)
- `job_cancel_requests.suspension_processed_at IS NOT NULL`
- Support ticket `RESOLVED` after both actions
- `JOB_ASSIGNED_CANCELLATION_RESOLVED` event with `resolutionType = FULL_REFUND_WITH_CONTRACTOR_SUSPENSION`, `suspensionApplied = true`
- System message in thread with dedupeMarker `cancel_resolution_{jobId}_contractor_in_window`

---

## Test B5: Null Appointment At — Treated as Outside Window

**Scenario**: Job has no appointment set; cancellation defaults to "outside penalty window" by policy — no errors, 100% refund.

**Steps**:
1. Ensure `jobs.appointment_at = NULL`
2. Cancel (poster or contractor)
3. Verify `within_penalty_window = false` in `job_cancel_requests`
4. Admin issues full refund

**Pass Criteria**:
- No 400 or 422 errors about missing appointment
- `within_penalty_window = false`
- Full refund issued, no payout, no suspension offered in admin UI

---

## Test B6: Missing Stripe Account on Contractor Payout

**Scenario**: Admin tries to issue contractor payout but contractor has no Stripe account.

**Steps**:
1. Complete a poster-in-window cancellation up to the "Cancel Job" step
2. Remove or null the contractor's `stripeAccountId`
3. POST `api/admin/v4/jobs/{jobId}/contractor-payout` with `{ confirmText: "PAYOUT" }`

**Pass Criteria**:
- HTTP 409 with code `ADMIN_V4_CONTRACTOR_NO_STRIPE_ACCOUNT` or `ADMIN_V4_CONTRACTOR_NOT_PAYOUT_READY`
- No `v4_financial_ledger` row created
- `job_cancel_requests.payout_processed_at` remains `NULL`
- Support ticket remains `OPEN`
- Admin can re-attempt payout after contractor adds Stripe account

---

## Test B7: Double-Click Admin Resolution (Idempotency Guard)

**Scenario**: Admin clicks refund or payout twice simultaneously (race condition simulation).

**Steps**:
1. Complete poster-in-window cancel, reach resolution stage
2. Send two simultaneous POST requests to `partial-refund` with `{ confirmText: "REFUND" }`

**Pass Criteria**:
- Only one Stripe refund created (Stripe idempotencyKey deduplicates)
- Only one `v4_financial_ledger` row (unique constraint on `dedupe_key`)
- Second request returns `409 ADMIN_V4_REFUND_ALREADY_PROCESSED`
- `refund_processed_at` set only once
- System message appears only once in the thread (dedupeMarker prevents duplicate)

**Same test applies for contractor-payout (PAYOUT) and suspend-contractor (SUSPEND).**

---

## Notification Checks (All Tests)

After each relevant action, verify in the `v4_notifications` table:

| Action | Expected notification | Recipient |
|--------|-----------------------|-----------|
| Cancel request submitted (unassigned) | `JOB_CANCELLATION_REQUESTED` | Admin(s), Job Poster |
| Cancel approved (unassigned) | `JOB_CANCELLATION_APPROVED` | Job Poster |
| Refund issued (unassigned) | `REFUND_ISSUED` | Job Poster, Admin(s) |
| Assigned cancel requested (Type B) | `JOB_CANCELLATION_REQUESTED` | Admin(s), Job Poster |
| Assigned cancel resolved (Type B) | `JOB_ASSIGNED_CANCELLATION_RESOLVED` | Job Poster, Contractor (if applicable), Admin(s) |

---

## DB Quick Checks

```sql
-- Verify cancel request (including Type B fields)
SELECT id, job_id, status, requested_by_role, within_penalty_window,
       support_ticket_id, refund_processed_at, payout_processed_at,
       suspension_processed_at, resolved_at
FROM job_cancel_requests
WHERE job_id = '{jobId}';

-- Verify support ticket
SELECT id, status, category, subject
FROM v4_support_tickets
WHERE job_id = '{jobId}' AND category = 'PAYMENT_ISSUE';

-- Verify financial ledger (Type B)
SELECT type, amount_cents, dedupe_key, stripe_ref, created_at
FROM v4_financial_ledger
WHERE job_id = '{jobId}'
ORDER BY created_at;

-- Verify contractor suspension
SELECT contractor_user_id, suspended_until, reason
FROM v4_contractor_suspensions
WHERE contractor_user_id = '{contractorUserId}';

-- Verify audit log
SELECT action, metadata
FROM "AuditLog"
WHERE entity_id = '{jobId}'
ORDER BY created_at DESC;

-- Verify escrow status
SELECT id, status FROM "Escrow" WHERE "jobId" = '{jobId}';

-- Verify routing exclusion for suspended contractor
SELECT cp.user_id, s.suspended_until
FROM contractor_profiles_v4 cp
LEFT JOIN v4_contractor_suspensions s ON s.contractor_user_id = cp.user_id
WHERE cp.user_id = '{contractorUserId}';
```
