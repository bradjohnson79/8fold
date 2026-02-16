# Contractor Dashboard (E2E) — 2026-02-05

## Goal
Implement a **Contractor Dashboard** consistent with the canonical contractor role:
- Contractors **opt in** to work by accepting routed offers or repeat requests (not assigned).
- Must **book within 5 business days** at acceptance.
- Contact info unlocks **only after** booking details are submitted.
- Payment is held in escrow; **contractor releases payment only after Job Poster approval**.
- Contractor features are gated behind a **mandatory, versioned contractor waiver**.

## Gate 0 — Contractor Waiver (Mandatory)
- Full-screen, non-skippable waiver gate required before accessing any contractor features.
- Versioned waiver content (current: **v1.1**) explicitly covers:
  - 5 business day booking requirement
  - no-shows/failure-to-book consequences
  - quality-of-work dispute handling
  - payment holds during disputes
  - repeated violations → warnings / limitations / suspension
- Acceptance is stored with: `contractorId`, `waiverVersion`, `acceptedAt`, and optional metadata (IP/UA where available).

## Dashboard capabilities shipped
- **Pending Jobs**: unified offers view (routed dispatches + repeat requests), with restrictions:
  - No Job Poster contact info visible pre-accept
  - No pricing negotiation/edit surface
- **Accept Job flow**:
  - Requires **Booking Date** within next **5 business days**
  - Requires **Time Window** (Morning/Afternoon/Evening)
  - On submit: booking details are recorded, Job Poster contact info becomes visible, job moves to Active
- **Active Jobs**:
  - Shows booking info + contact info (post-accept)
  - Status actions: “In Progress”, “Completed”
  - Booking deadline countdown displayed
- **Completed / Awaiting Payment**:
  - Appears only after Job Poster approval
  - Contractor must click **Release Payment**
  - No partial release; no pre-approval release
  - Release schedules payout for the next business day
- **Notifications**:
  - Dismissible, refreshable notifications for key lifecycle events (routed, accepted, booking confirmed, payment released, payout pending, support ticket created)
- **Profile & Compliance**:
  - Editable profile fields (business name/email/phone/regions/payment placeholder)
  - Read-only compliance fields (contractor id/trades/waiver/account standing)
- **Contact Support**:
  - Persistent “Contact Support” button opens ticket form prefilled with Contractor context
  - Optional related job reference supported

## E2E verification (completed)
Verified end-to-end in browser:
1) Contractor login ✅
2) Waiver accepted ✅
3) Routed job offer visible ✅
4) Accept job with booking date + time window ✅
5) Job Poster contact info unlocks only after booking submission ✅
6) Job completion + Job Poster approval simulated ✅
7) Contractor “Release Payment” clicked after approval ✅
8) Support ticket submitted from Contractor dashboard ✅

Observed notifications after release:
- “Payment released … payout will be scheduled for the next business day.”
- “Payout pending … scheduled for YYYY-MM-DD.”
- “Support ticket created …”

## Notes / guardrails
- Contractors cannot message/contact Job Posters before acceptance/booking submission.
- Contractors cannot release payment before approval.
- All disputes/escalations flow through Support.

