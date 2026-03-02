# Notification Mapping Parity (Before -> After)

This table documents parity between legacy direct-notification call sites and the new domain-event mapper flow.

| Legacy Call Site | Legacy Notification Type(s) | New Domain Event | Mapper Notification Type(s) |
|---|---|---|---|
| `src/services/v4/routerRouteJobService.ts` | `NEW_JOB_INVITE` | `ROUTER_JOB_ROUTED` | `NEW_JOB_INVITE` |
| `src/services/v4/inviteExpirationService.ts` | `INVITE_EXPIRED`, `ROUTING_WINDOW_EXPIRED` | `CONTRACTOR_INVITE_EXPIRED` | `INVITE_EXPIRED`, `ROUTING_WINDOW_EXPIRED` |
| `src/services/v4/contractorInviteService.ts` accept | `JOB_ASSIGNED`, `CONTRACTOR_ACCEPTED` | `CONTRACTOR_ACCEPTED_INVITE` | `JOB_ASSIGNED`, `CONTRACTOR_ACCEPTED` |
| `src/services/v4/contractorInviteService.ts` reject | `JOB_REJECTED` | `CONTRACTOR_REJECTED_INVITE` | `JOB_REJECTED` |
| `src/services/v4/contractorJobService.ts` complete | `CONTRACTOR_COMPLETED_JOB` | `CONTRACTOR_COMPLETED` | `CONTRACTOR_COMPLETED_JOB` |
| `src/services/v4/contractorJobService.ts` book appointment | `APPOINTMENT_BOOKED` | `APPOINTMENT_BOOKED` | `APPOINTMENT_BOOKED` |
| `src/services/v4/contractorJobService.ts` reschedule | `RESCHEDULE_REQUEST` | `RESCHEDULE_REQUESTED` | `RESCHEDULE_REQUEST` |
| `src/services/v4/contractorJobService.ts` cancellation | `CONTRACTOR_CANCELLED` | `CONTRACTOR_CANCELLED` | `CONTRACTOR_CANCELLED` |
| `src/services/v4/jobPosterJobsService.ts` accept assigned contractor | `POSTER_ACCEPTED` | `POSTER_ACCEPTED_CONTRACTOR` | `POSTER_ACCEPTED` |
| `src/services/v4/jobPosterJobsService.ts` accept appointment | `RESCHEDULE_ACCEPTED` | `APPOINTMENT_ACCEPTED` | `RESCHEDULE_ACCEPTED` |
| `src/services/v4/v4MessageService.ts` | `NEW_MESSAGE` | `NEW_MESSAGE` | `NEW_MESSAGE` |
| `src/payments/finalizeJobFundingFromPaymentIntent.ts` | `PAYMENT_RECEIVED` (poster + admins) | `PAYMENT_CAPTURED` | `PAYMENT_RECEIVED` (poster + admins) |
| `src/services/refundJobFunds.ts` | `JOB_REFUNDED` (poster + admins) | `REFUND_ISSUED` | `JOB_REFUNDED` (poster + admins) |
| `src/payouts/releaseJobFunds.ts` | `FUNDS_RELEASED` | `FUNDS_RELEASED` | `FUNDS_RELEASED` |

Notes:
- Route-level callers are intentionally deferred in this pass (see `docs/routeNotificationAudit.md`).
- Mapper is non-fatal: notification errors are logged and do not fail business transitions.

