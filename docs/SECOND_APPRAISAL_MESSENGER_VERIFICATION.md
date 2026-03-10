# 2nd Appraisal Messenger Notifications — Verification Report

**Date:** 2026-03-09  
**Scope:** Ensure every 2nd appraisal outcome posts a system message in the Messenger thread.

---

## Step 1 — Messenger Insert Utility ✅

**Function:** `appendSystemMessage(threadId, body)`  
**Location:** `apps/api/src/services/v4/v4MessageService.ts` (lines 299–333)

- Inserts into `v4_messages` with `senderRole: "SYSTEM"`
- Uses existing `threadId` — does not create a new thread
- Both Job Poster and Contractor see the message (thread participants)

---

## Step 2 — Appraisal Lifecycle Functions

| Event | Function | Messenger Message | Status |
|-------|----------|-------------------|--------|
| **Contractor submits** | `createAdjustmentRequest()` | "Contractor submitted a 2nd appraisal request. Requested total price: $X. Awaiting review from 8Fold support." | ✅ Aligned |
| **Admin sends to poster** | `generateConsentLink()` | "8Fold has reviewed a 2nd appraisal request for this job. The Job Poster has been notified to review the revised price." | ✅ Present |
| **Poster accepts** | `acceptAdjustment()` | "The Job Poster accepted the revised appraisal request. Processing additional payment." | ✅ Aligned |
| **Payment successful** | `confirmAdjustmentPayment()` | "Additional payment received. The job price has been updated to $X." | ✅ Aligned |
| **Poster declines** | `declineAdjustment()` | "The Job Poster declined the revised appraisal request. The job will continue under the original agreed price." | ✅ Present |
| **Admin rejects** | `rejectByAdmin()` | "8Fold has declined the 2nd appraisal request. The job will continue under the original agreed price." | ✅ Present |
| **Token expires** | `getAdjustmentForPoster()` | "The 2nd appraisal request expired. The job will continue under the original agreed price." | ✅ Added |

---

## Step 3 — Thread Targeting ✅

All messages use `adj.threadId` or `threadId` — the existing job Messenger thread. No new threads are created.

---

## Step 4 — Both Users See Message ✅

System messages use `appendSystemMessage(threadId, body)`. The thread has `jobPosterUserId` and `contractorUserId` as participants. System messages are visible to all thread participants.

---

## Step 5 — Duplicate Prevention ✅

- **Token expiry:** Guard `!wasAlreadyExpired` ensures the expiry message is only inserted once (when transitioning from non-EXPIRED to EXPIRED).
- **Other outcomes:** Each function runs once per user action; no duplicate risk.

---

## Step 6 — Changes Made

1. **createAdjustmentRequest** — Message updated to: "Contractor submitted a 2nd appraisal request. Requested total price: $X. Awaiting review from 8Fold support."

2. **acceptAdjustment** — Message simplified to: "The Job Poster accepted the revised appraisal request. Processing additional payment."

3. **confirmAdjustmentPayment** — Message simplified to: "Additional payment received. The job price has been updated to $X."

4. **getAdjustmentForPoster (token expiry)** — Added Messenger message when token expires, with duplicate guard. Also unlocks the job (sets status to ASSIGNED) so it can continue under the original price.

---

## Example Messenger Thread Timeline

```
Contractor submitted a 2nd appraisal request. Requested total price: $1250.00. Awaiting review from 8Fold support.

8Fold has reviewed a 2nd appraisal request for this job. The Job Poster has been notified to review the revised price.

The Job Poster accepted the revised appraisal request. Processing additional payment.

Additional payment received. The job price has been updated to $1250.00.
```

**Decline path:**
```
The Job Poster declined the revised appraisal request. The job will continue under the original agreed price.
```

**Expiry path:**
```
The 2nd appraisal request expired. The job will continue under the original agreed price.
```
