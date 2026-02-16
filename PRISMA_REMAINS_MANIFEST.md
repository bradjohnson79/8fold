## Prisma remains manifest

Authoritative inventory of remaining Prisma references (runtime + tooling) as of this manifest creation.

| File path | App (api \| admin \| web \| tooling) | Type | Risk | Notes (what it does) |
|---|---|---|---|---|
| `apps/api/app/api/router/profile/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation). |
| `apps/api/app/api/payout-methods/route.ts` | api | WRITE (money) | HIGH | API route handler; contains Prisma usage for payout-method related state (money-adjacent). |
| `apps/api/app/api/web/job-poster/continue/[token]/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for continue/resume flow. |
| `apps/api/app/api/web/job-poster/jobs/[id]/resume-pricing/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for pricing resume flow. |
| `apps/api/app/api/web/job-poster/share-contact/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation). |
| `apps/api/app/api/jobs/[id]/contractor-start/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for job lifecycle start. |
| `apps/api/app/api/admin/jobs/[id]/archive/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for admin job archive. |
| `apps/api/app/api/web/contractor/profile/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for contractor profile. |
| `apps/api/app/api/web/router/apply-routing/route.ts` | api | WRITE (non-money) | HIGH | API route handler; contains Prisma usage (transaction/mutation) for routing actions. |
| `apps/api/app/api/admin/jobs/[id]/assign/route.ts` | api | WRITE (non-money) | HIGH | API route handler; contains Prisma usage (transaction/mutation) for admin assignment. |
| `apps/api/app/api/admin/router/jobs/[jobId]/route/route.ts` | api | WRITE (non-money) | HIGH | API route handler; contains Prisma usage (transaction/mutation) for admin routing action. |
| `apps/api/app/api/jobs/feed/route.ts` | api | READ | LOW | API route handler; contains Prisma usage (read) for jobs feed. |
| `apps/api/app/api/web/materials-requests/[id]/reimburse/release/route.ts` | api | WRITE (money) | HIGH | API route handler; contains Prisma usage (transaction/mutation) for reimburse/release flow. |
| `apps/api/app/api/web/materials-requests/route.ts` | api | WRITE (money) | HIGH | API route handler; contains Prisma usage (mutation) for materials requests flow. |
| `apps/api/app/api/web/materials-requests/[id]/approve/route.ts` | api | WRITE (money) | HIGH | API route handler; contains Prisma usage (mutation) for materials approval flow. |
| `apps/api/app/api/jobs/[id]/router-approve/route.ts` | api | WRITE (money) | HIGH | API route handler; contains Prisma usage (mutation) for router approval (money-adjacent). |
| `apps/api/app/api/admin/jobs/[id]/complete/route.ts` | api | WRITE (money) | HIGH | API route handler; contains Prisma usage (transaction/mutation) for admin completion (money-adjacent). |
| `apps/api/app/api/contractor/dispatch/respond/route.ts` | api | WRITE (non-money) | HIGH | API route handler; contains Prisma usage (transaction/mutation) for dispatch response. |
| `apps/api/app/api/web/materials-requests/[id]/receipts/upload/route.ts` | api | WRITE (money) | HIGH | API route handler; contains Prisma usage (mutation) for receipts upload (money-adjacent). |
| `apps/api/app/api/admin/job-drafts/[id]/publish/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for draft publishing. |
| `apps/api/app/api/web/job-poster-tos/route.ts` | api | WRITE (non-money) | LOW | API route handler; contains Prisma usage (mutation) for ToS acceptance/audit. |
| `apps/api/app/api/web/job-poster/jobs/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for job-poster jobs listing. |
| `apps/api/app/api/web/materials-requests/[id]/receipts/submit/route.ts` | api | WRITE (money) | HIGH | API route handler; contains Prisma usage (transaction/mutation) for receipts submission. |
| `apps/api/app/api/web/materials-requests/[id]/create-payment-intent/route.ts` | api | WRITE (money) | HIGH | API route handler; contains Prisma usage (mutation) for payment intent creation. |
| `apps/api/app/api/web/materials-requests/[id]/confirm-payment/route.ts` | api | WRITE (money) | HIGH | API route handler; contains Prisma usage (transaction/mutation) for payment confirmation. |
| `apps/api/app/api/web/job-poster/jobs/create-draft/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for draft creation. |
| `apps/api/app/api/jobs/[id]/contractors/eligible/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for eligibility computation. |
| `apps/api/app/api/web/contractor-waiver/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for waiver acceptance. |
| `apps/api/app/api/web/contractor/estimated-completion/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for estimated completion updates. |
| `apps/api/app/api/web/contractor/appointment/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for appointment scheduling. |
| `apps/api/app/api/web/contractor/repeat-requests/[id]/respond/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for repeat request response. |
| `apps/api/app/api/web/contractor/repeat-requests/route.ts` | api | READ | LOW | API route handler; contains Prisma usage (read) for repeat requests list. |
| `apps/api/app/api/web/job-poster/materials/pending/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for pending materials state. |
| `apps/api/app/api/web/job-poster/repeat-contractor/status/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for repeat-contractor status. |
| `apps/api/app/api/web/job-poster/repeat-contractor/request/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for repeat-contractor request. |
| `apps/api/app/api/web/job-poster/repeat-contractor/eligible/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for repeat-contractor eligibility. |
| `apps/api/app/api/admin/support/disputes/sla-monitor/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for dispute SLA monitoring. |
| `apps/api/app/api/web/support/tickets/[id]/attachments/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for support attachments. |
| `apps/api/app/api/web/support/attachments/[id]/route.ts` | api | READ | LOW | API route handler; contains Prisma usage (read) for attachment retrieval. |
| `apps/api/app/api/web/support/tickets/[id]/dispute/route.ts` | api | WRITE (non-money) | HIGH | API route handler; contains Prisma usage (mutation) for dispute creation/escalation (money-adjacent). |
| `apps/api/app/api/web/support/tickets/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (read/write) for support tickets. |
| `apps/api/app/api/web/support/tickets/[id]/messages/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for support messages. |
| `apps/api/app/api/web/support/tickets/[id]/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for support ticket detail. |
| `apps/api/app/api/admin/support/disputes/[id]/decision/route.ts` | api | WRITE (money) | HIGH | API route handler; contains Prisma usage (mutation) for dispute decision (money impact). |
| `apps/api/app/api/admin/support/disputes/[id]/enforcement/execute/route.ts` | api | WRITE (money) | HIGH | API route handler; contains Prisma usage (transaction/mutation) for dispute enforcement (money impact). |
| `apps/api/app/api/admin/support/tickets/[id]/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for admin ticket detail. |
| `apps/api/app/api/admin/support/tickets/[id]/assign-to-me/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for ticket assignment. |
| `apps/api/app/api/admin/support/tickets/[id]/assign/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for ticket assignment. |
| `apps/api/app/api/admin/support/tickets/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for admin tickets list. |
| `apps/api/app/api/admin/support/disputes/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for disputes list. |
| `apps/api/app/api/web/support/jobs/[jobId]/participants/route.ts` | api | READ | LOW | API route handler; contains Prisma usage (read) for job participants. |
| `apps/api/app/api/web/support/my-jobs/route.ts` | api | READ | LOW | API route handler; contains Prisma usage (read) for “my jobs” support view. |
| `apps/api/app/api/web/support/disputes/route.ts` | api | WRITE (non-money) | HIGH | API route handler; contains Prisma usage (read/write) for disputes (money-adjacent). |
| `apps/api/app/api/admin/support/disputes/[id]/status/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for dispute status changes. |
| `apps/api/app/api/admin/support/disputes/[id]/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for dispute detail. |
| `apps/api/app/api/admin/support/tickets/[id]/messages/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for admin/support messages. |
| `apps/api/app/api/admin/stats/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read/aggregate) for admin stats. |
| `apps/api/app/api/admin/router/jobs/overdue/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for overdue routing handling. |
| `apps/api/app/api/admin/monitoring/approaching-sla/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for SLA monitoring. |
| `apps/api/app/api/admin/monitoring/overdue-jobs/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for overdue jobs monitoring. |
| `apps/api/app/api/admin/contractors/[id]/suspend/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for suspending contractor. |
| `apps/api/app/api/admin/contractors/[id]/approve/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for approving contractor. |
| `apps/api/app/api/admin/routers/[userId]/set-daily-limit/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for router limit settings. |
| `apps/api/app/api/admin/routers/[userId]/promote-senior/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for router promotion. |
| `apps/api/app/api/admin/routers/[userId]/suspend/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for suspending router. |
| `apps/api/app/api/admin/routers/[userId]/approve/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for approving router. |
| `apps/api/app/api/admin/users/contractors/route.ts` | api | READ | LOW | API route handler; contains Prisma usage (read) for contractor users list. |
| `apps/api/app/api/admin/users/routers/route.ts` | api | READ | LOW | API route handler; contains Prisma usage (read) for router users list. |
| `apps/api/app/api/admin/users/job-posters/route.ts` | api | READ | LOW | API route handler; contains Prisma usage (read) for job-poster users list. |
| `apps/api/app/api/admin/users/route.ts` | api | READ | LOW | API route handler; contains Prisma usage (read) for users list. |
| `apps/api/app/api/admin/routing-activity/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for routing activity. |
| `apps/api/app/api/auth/logout/route.ts` | api | WRITE (non-money) | LOW | API route handler; contains Prisma usage (mutation) for logout/session revocation. |
| `apps/api/app/api/web/router-incentives/route.ts` | api | READ | HIGH | API route handler; contains Prisma usage (read) for incentives/earnings (money). |
| `apps/api/app/api/jobs/[id]/contractors/dispatch/route.ts` | api | WRITE (non-money) | HIGH | API route handler; contains Prisma usage (transaction/mutation) for dispatch. |
| `apps/api/app/api/jobs/[id]/customer-review/route.ts` | api | WRITE (non-money) | HIGH | API route handler; contains Prisma usage (transaction/mutation) for customer review. |
| `apps/api/app/api/jobs/[id]/route-confirm/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for route confirmation. |
| `apps/api/app/api/jobs/[id]/router-hold/route.ts` | api | WRITE (money) | HIGH | API route handler; contains Prisma usage (transaction/mutation) for router hold (money impact). |
| `apps/api/app/api/web/job-poster/checkins/respond/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for job-poster check-in response. |
| `apps/api/app/api/web/router/jobs/[id]/nudge/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for router nudge. |
| `apps/api/app/api/jobs/active/route.ts` | api | READ | LOW | API route handler; contains Prisma usage (read) for active jobs. |
| `apps/api/app/api/admin/router-context/current/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for router context. |
| `apps/api/app/api/admin/router-context/exit/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for exiting router context. |
| `apps/api/app/api/admin/router-context/enter/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (transaction/mutation) for entering router context. |
| `apps/api/app/api/web/job-poster/jobs/[id]/retry-payment/route.ts` | api | WRITE (money) | HIGH | API route handler; contains Prisma usage (mutation) for retrying payment. |
| `apps/api/app/api/web/job-poster/jobs/[id]/payment-status/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for payment status. |
| `apps/api/app/api/web/job-poster/profile/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for job-poster profile updates. |
| `apps/api/app/api/admin/job-drafts/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for job drafts list. |
| `apps/api/app/api/admin/job-drafts/[id]/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for job draft detail. |
| `apps/api/app/api/web/job-poster/checkins/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for check-ins. |
| `apps/api/app/api/web/job-poster/contractor-responses/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for contractor responses. |
| `apps/api/app/api/admin/contractors/[id]/reject/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for rejecting contractor. |
| `apps/api/app/api/admin/job-drafts/[id]/submit/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for submitting job draft. |
| `apps/api/app/api/admin/job-drafts/[id]/needs-clarification/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for needs-clarification. |
| `apps/api/app/api/admin/job-drafts/[id]/reject/route.ts` | api | WRITE (non-money) | MEDIUM | API route handler; contains Prisma usage (mutation) for draft rejection. |
| `apps/api/app/api/admin/jobs/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for admin jobs list. |
| `apps/api/app/api/admin/payout-requests/route.ts` | api | READ | HIGH | API route handler; contains Prisma usage (read) for payout requests (money). |
| `apps/api/app/api/admin/payout-requests/[id]/mark-paid/route.ts` | api | WRITE (money) | HIGH | API route handler; contains Prisma usage (transaction/mutation) for marking payouts paid. |
| `apps/api/app/api/admin/audit-logs/route.ts` | api | READ | LOW | API route handler; contains Prisma usage (read) for audit logs. |
| `apps/api/app/api/admin/contractors/[id]/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for contractor detail. |
| `apps/api/app/api/payout-requests/route.ts` | api | READ | HIGH | API route handler; contains Prisma usage (read) for payout requests (money). |
| `apps/api/app/api/wallet/summary/route.ts` | api | READ | HIGH | API route handler; contains Prisma usage (read/aggregate) for wallet summary (money). |
| `apps/api/app/api/jobs/[id]/claim/route.ts` | api | WRITE (non-money) | HIGH | API route handler; contains Prisma usage (transaction/mutation) for job claim. |
| `apps/api/app/api/admin/contractors/route.ts` | api | READ | MEDIUM | API route handler; contains Prisma usage (read) for contractors list. |
| `apps/api/app/api/web/contractor-incentives/route.ts` | api | READ | HIGH | API route handler; contains Prisma usage (read) for incentives/earnings (money). |
| `apps/api/app/api/web/materials-requests/[id]/decline/route.ts` | api | WRITE (money) | HIGH | API route handler; contains Prisma usage (transaction/mutation) for declining materials request. |
| `apps/api/app/api/jobs/[id]/contractor-complete/route.ts` | api | WRITE (non-money) | HIGH | API route handler; contains Prisma usage (transaction/mutation) for contractor completion. |
| `apps/api/src/db/prisma.ts` | api | WRAPPER / UTILITY | HIGH | Prisma client wrapper/singleton; exports configured `PrismaClient` for runtime DB access. |
| `apps/api/src/payments/jobPayments.ts` | api | WRITE (money) | HIGH | Payment service; contains Prisma usage for job payment state (money). |
| `apps/api/src/payments/materialsPayments.ts` | api | WRITE (money) | HIGH | Payment service; contains Prisma usage for materials payments (money). |
| `apps/api/src/wallet/totals.ts` | api | WRITE (money) | HIGH | Wallet totals/ledger math; contains Prisma usage (aggregations) for money totals. |
| `apps/api/src/finance/contractorPayouts.ts` | api | WRITE (money) | HIGH | Payouts logic; contains Prisma usage affecting payout flows (money). |
| `apps/api/src/support/disputeEnforcement.ts` | api | WRITE (money) | HIGH | Dispute enforcement logic; contains Prisma usage for enforcement side effects (money). |
| `apps/api/src/support/disputeSlaMonitor.ts` | api | WRITE (money) | HIGH | Dispute SLA monitor; contains Prisma usage (reads + possible enforcement triggers) (money-adjacent). |
| `apps/api/src/auth/mobileAuth.ts` | api | WRITE (non-money) | HIGH | Mobile auth; contains Prisma usage for sessions/tokens/user records. |
| `apps/api/src/auth/rbac.ts` | api | READ | MEDIUM | RBAC/auth utilities; contains Prisma usage for access control lookups. |
| `apps/api/src/services/routerJobService.ts` | api | WRITE (non-money) | HIGH | Router job service; contains Prisma usage (transactions) for routing/lifecycle mutations. |
| `apps/api/src/services/monitoringService.ts` | api | WRITE (non-money) | MEDIUM | Monitoring service; contains Prisma usage (writes/reads) for monitoring events. |
| `apps/api/src/services/mockJobRefreshService.ts` | api | WRAPPER / UTILITY | MEDIUM | Mock job refresh utilities; contains Prisma usage for mock-job related actions. |
| `apps/api/src/jobs/mockJobGuards.ts` | api | WRITE (non-money) | MEDIUM | Mock job guardrails; contains Prisma usage for mock-job state. |
| `apps/api/src/jobs/mockJobRemoval.ts` | api | WRITE (non-money) | MEDIUM | Mock job removal; contains Prisma usage for deletion/cleanup. |
| `apps/api/src/audit/jobPostingAudit.ts` | api | WRITE (non-money) | MEDIUM | Audit helper; contains Prisma usage for audit log writes. |
| `apps/api/src/http/jobPosterRouteErrors.ts` | api | WRAPPER / UTILITY | LOW | Error helper; imports Prisma error classes/types. |
| `apps/api/src/pricing/pricingIntel.ts` | api | WRAPPER / UTILITY | LOW | Pricing helper; imports Prisma enums/types. |
| `apps/api/src/pricing/aiAppraisal.ts` | api | WRAPPER / UTILITY | LOW | AI appraisal; imports Prisma enums/types. |
| `apps/api/src/pricing/tradeDeltas.ts` | api | WRAPPER / UTILITY | LOW | Trade deltas helper; imports Prisma enums/types. |
| `apps/api/src/pricing/validation.ts` | api | WRAPPER / UTILITY | LOW | Pricing validation; imports Prisma enums/types. |
| `apps/api/src/jobs/jobSourceEnforcement.ts` | api | WRAPPER / UTILITY | LOW | Job source enforcement; imports Prisma enums/types. |
| `apps/api/src/services/contractorIdentity.ts` | api | WRAPPER / UTILITY | LOW | Contractor identity utilities; imports Prisma enums/types. |
| `apps/api/src/system/platformUser.ts` | api | WRAPPER / UTILITY | MEDIUM | Platform user utilities; contains Prisma usage for system user record access. |
| `apps/api/src/finance/businessDays.ts` | api | WRAPPER / UTILITY | LOW | Business days helper; imports Prisma enums/types. |
| `apps/api/src/testUtils/testDb.ts` | api | WRAPPER / UTILITY | LOW | Test DB helper; imports `PrismaClient`. |
| `apps/api/src/testUtils/seed.ts` | api | WRITE (non-money) | LOW | Seed helper; contains Prisma usage for test/dev seeds. |
| `apps/api/src/__tests__/rbac.test.ts` | api | WRAPPER / UTILITY | LOW | Tests; reference Prisma usage/types. |
| `apps/api/src/__tests__/oneActiveJobRule.test.ts` | api | WRAPPER / UTILITY | LOW | Tests; reference Prisma usage/types. |
| `apps/api/src/__tests__/ledgerImmutability.test.ts` | api | WRAPPER / UTILITY | LOW | Tests; reference Prisma usage/types. |
| `apps/admin/app/api/admin/jobs/mock-regenerate-failed/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for mock regeneration. |
| `apps/admin/app/api/admin/job-appraisals/[id]/complete/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for appraisal completion. |
| `apps/admin/app/api/admin/job-appraisals/pending/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read) for pending appraisals. |
| `apps/admin/app/api/admin/my/roles/[role]/complete/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for role onboarding completion. |
| `apps/admin/app/api/admin/my/roles/[role]/accept-terms/route.ts` | admin | WRITE (non-money) | LOW | Admin app route handler; contains Prisma usage (mutation) for terms acceptance. |
| `apps/admin/app/api/admin/my/roles/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read) for role state. |
| `apps/admin/app/api/admin/jobs/[id]/assign/route.ts` | admin | WRITE (non-money) | HIGH | Admin app route handler; contains Prisma usage (transaction/mutation) for job assignment. |
| `apps/admin/app/api/admin/jobs/[id]/apply-ai-price/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for applying AI price. |
| `apps/admin/app/api/admin/ai-agent-pipeline/plans/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for pipeline plans. |
| `apps/admin/app/api/admin/bulk-ai-jobs/[id]/status/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read) for bulk AI job status. |
| `apps/admin/app/api/admin/job-drafts/[id]/publish/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for publishing draft. |
| `apps/admin/app/api/admin/jobs/[id]/assign-me-as-router/route.ts` | admin | WRITE (non-money) | HIGH | Admin app route handler; contains Prisma usage (transaction/mutation) for self-assignment. |
| `apps/admin/app/api/admin/materials/route.ts` | admin | READ | HIGH | Admin app route handler; contains Prisma usage (read) for materials/escrow state (money). |
| `apps/admin/app/api/admin/jobs/[id]/ai-appraisal/route.ts` | admin | READ | MEDIUM | Admin app route handler; contains Prisma usage (read) for AI appraisal view. |
| `apps/admin/app/api/admin/jobs/status/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read) for job status summaries. |
| `apps/admin/app/api/admin/bulk-ai-jobs/[id]/cancel/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for bulk AI cancel. |
| `apps/admin/app/api/admin/jobs/bulk-delete-mocks/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (transaction/mutation) for bulk deleting mocks. |
| `apps/admin/app/api/admin/support/disputes/[disputeId]/route.ts` | admin | READ | HIGH | Admin app route handler; contains Prisma usage (read) for dispute detail (money-adjacent). |
| `apps/admin/app/api/admin/support/attachments/[attachmentId]/download/route.ts` | admin | READ | MEDIUM | Admin app route handler; contains Prisma usage (read) for attachment download. |
| `apps/admin/app/api/admin/support/disputes/[disputeId]/decision/route.ts` | admin | WRITE (money) | HIGH | Admin app route handler; contains Prisma usage (transaction/mutation) for dispute decision (money). |
| `apps/admin/app/api/admin/support/disputes/[disputeId]/status/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for dispute status updates. |
| `apps/admin/app/api/admin/support/tickets/[ticketId]/reply/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for ticket reply. |
| `apps/admin/app/api/admin/support/tickets/[ticketId]/status/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for ticket status update. |
| `apps/admin/app/api/admin/support/tickets/[ticketId]/assign-to-me/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for ticket assignment. |
| `apps/admin/app/api/admin/support/tickets/[ticketId]/route.ts` | admin | READ | MEDIUM | Admin app route handler; contains Prisma usage (read) for ticket detail. |
| `apps/admin/app/api/admin/support/inbox/route.ts` | admin | READ | MEDIUM | Admin app route handler; contains Prisma usage (read) for support inbox listing. |
| `apps/admin/app/api/admin/stats/route.ts` | admin | READ | MEDIUM | Admin app route handler; contains Prisma usage (read/aggregate) for admin stats. |
| `apps/admin/app/api/admin/settings/mock-refresh/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for mock refresh settings. |
| `apps/admin/app/api/admin/users/job-posters/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read) for job-poster users list. |
| `apps/admin/app/api/admin/users/routers/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read) for router users list. |
| `apps/admin/app/api/admin/users/contractors/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read) for contractor users list. |
| `apps/admin/app/api/admin/routing-activity/route.ts` | admin | READ | MEDIUM | Admin app route handler; contains Prisma usage (read) for routing activity. |
| `apps/admin/app/api/admin/ai-email-campaigns/send-queue/run/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (transaction/mutation) for send-queue run. |
| `apps/admin/app/api/admin/ai-email-campaigns/regions/[id]/logs/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read) for region logs. |
| `apps/admin/app/api/admin/ai-email-campaigns/drafts/generate/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for generating drafts. |
| `apps/admin/app/api/admin/ai-email-campaigns/identities/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read) for identities list. |
| `apps/admin/app/api/admin/ai-email-campaigns/seed/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for seeding campaign data. |
| `apps/admin/app/api/admin/ai-email-campaigns/regions/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read) for regions list. |
| `apps/admin/app/api/admin/auth/secret-signup/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for secret signup. |
| `apps/admin/app/api/admin/ai-agent-pipeline/batches/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read) for batches list. |
| `apps/admin/app/api/admin/ai-agent-pipeline/logs/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read) for pipeline logs. |
| `apps/admin/app/api/admin/ai-agent-pipeline/promote/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for promote actions. |
| `apps/admin/app/api/admin/ai-agent-pipeline/batches/[id]/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read) for batch detail. |
| `apps/admin/app/api/admin/ai-agent-pipeline/runs/[id]/skip/route.ts` | admin | WRITE (non-money) | LOW | Admin app route handler; contains Prisma usage (mutation) for skipping runs. |
| `apps/admin/app/api/admin/ai-agent-pipeline/runs/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read) for runs list. |
| `apps/admin/app/api/admin/ai-agent-pipeline/plans/[id]/approve/route.ts` | admin | WRITE (non-money) | LOW | Admin app route handler; contains Prisma usage (mutation) for approving plans. |
| `apps/admin/app/api/admin/ai-agent-pipeline/plans/[id]/activate/route.ts` | admin | WRITE (non-money) | LOW | Admin app route handler; contains Prisma usage (mutation) for activating plans. |
| `apps/admin/app/api/admin/ai-agent-pipeline/templates/[id]/route.ts` | admin | WRITE (non-money) | LOW | Admin app route handler; contains Prisma usage (mutation) for updating templates. |
| `apps/admin/app/api/admin/ai-email-campaigns/send-queue/enqueue/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for enqueueing send-queue. |
| `apps/admin/app/api/admin/ai-agent-pipeline/templates/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read) for templates list. |
| `apps/admin/app/api/admin/ai-email-campaigns/capacity-snapshot/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read/aggregate) for capacity snapshot. |
| `apps/admin/app/api/admin/auth/reset-password/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for password reset. |
| `apps/admin/app/api/admin/ai-email-campaigns/monitor/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read/aggregate) for monitoring. |
| `apps/admin/app/api/admin/ai-email-campaigns/send-queue/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read) for send-queue listing. |
| `apps/admin/app/api/admin/ai-email-campaigns/drafts/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read) for drafts list. |
| `apps/admin/app/api/admin/ai-email-campaigns/drafts/[id]/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (read/write) for draft detail. |
| `apps/admin/app/api/admin/ai-email-campaigns/drafts/[id]/reject/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for rejecting drafts. |
| `apps/admin/app/api/admin/ai-email-campaigns/drafts/[id]/approve/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for approving drafts. |
| `apps/admin/app/api/admin/ai-email-campaigns/drafts/[id]/regenerate/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for regenerating drafts. |
| `apps/admin/app/api/admin/ai-email-campaigns/contacts/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read) for contacts list. |
| `apps/admin/app/api/admin/ai-email-campaigns/regions/[id]/pause/route.ts` | admin | WRITE (non-money) | LOW | Admin app route handler; contains Prisma usage (mutation) for pausing a region. |
| `apps/admin/app/api/admin/contractors/route.ts` | admin | READ | MEDIUM | Admin app route handler; contains Prisma usage (read) for contractors list. |
| `apps/admin/app/api/admin/jobs/[id]/holds/route.ts` | admin | WRITE (money) | HIGH | Admin app route handler; contains Prisma usage (transaction/mutation) for job holds (money). |
| `apps/admin/app/api/admin/jobs/[id]/complete/route.ts` | admin | WRITE (money) | HIGH | Admin app route handler; contains Prisma usage (transaction/mutation) for job completion (money). |
| `apps/admin/app/api/admin/auth/signup/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for admin signup. |
| `apps/admin/app/api/admin/auth/invite-lookup/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read) for invite lookup. |
| `apps/admin/app/api/admin/auth/invite/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for creating invites. |
| `apps/admin/app/api/admin/audit-logs/route.ts` | admin | READ | LOW | Admin app route handler; contains Prisma usage (read) for audit logs. |
| `apps/admin/app/api/admin/payout-requests/[id]/mark-paid/route.ts` | admin | WRITE (money) | HIGH | Admin app route handler; contains Prisma usage (transaction/mutation) for payout mark-paid (money). |
| `apps/admin/app/api/admin/job-drafts/[id]/submit/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for submitting drafts. |
| `apps/admin/app/api/admin/job-drafts/[id]/needs-clarification/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for needs-clarification. |
| `apps/admin/app/api/admin/job-drafts/[id]/reject/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for rejecting drafts. |
| `apps/admin/app/api/admin/job-drafts/[id]/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (read/write) for draft detail. |
| `apps/admin/app/api/admin/job-drafts/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (read/write) for drafts list. |
| `apps/admin/app/api/admin/contractors/[id]/reject/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for rejecting contractor. |
| `apps/admin/app/api/admin/contractors/[id]/approve/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for approving contractor. |
| `apps/admin/app/api/admin/contractors/[id]/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (read/write) for contractor detail. |
| `apps/admin/app/api/login/route.ts` | admin | WRITE (non-money) | MEDIUM | Admin app route handler; contains Prisma usage (mutation) for login/session creation. |
| `apps/admin/src/server/prisma.ts` | admin | WRAPPER / UTILITY | HIGH | Prisma client wrapper/singleton; exports configured `PrismaClient` for admin runtime DB access. |
| `apps/admin/src/server/wallet/totals.ts` | admin | READ | HIGH | Wallet totals/ledger math; contains Prisma usage for money totals. |
| `apps/admin/src/server/adminSession.ts` | admin | WRAPPER / UTILITY | MEDIUM | Admin session utilities; contains Prisma usage for session/user lookup. |
| `apps/admin/src/server/system/platformUser.ts` | admin | WRAPPER / UTILITY | MEDIUM | Platform user utilities; contains Prisma usage for system user record access. |
| `apps/admin/src/server/bulkAiJobRunner.ts` | admin | WRITE (non-money) | MEDIUM | Bulk AI job runner; contains Prisma usage for job/batch processing. |
| `apps/admin/src/server/aiEmail/stateMachine.ts` | admin | WRAPPER / UTILITY | LOW | AI email state machine; imports Prisma enums/types. |
| `apps/admin/src/server/aiEmail/rateLimit.ts` | admin | WRAPPER / UTILITY | MEDIUM | AI email rate limit helper; contains Prisma usage for counters/locks. |
| `prisma/schema.prisma` | tooling | TOOLING | MEDIUM | Prisma schema definition file. |
| `prisma/migrations/migration_lock.toml` | tooling | TOOLING | LOW | Prisma migrations lock file. |
| `prisma/migrations/**/migration.sql` | tooling | TOOLING | LOW | Prisma migration SQL files. |
| `package.json` | tooling | TOOLING | MEDIUM | Root scripts include `prisma` commands (`db:generate`, `db:migrate`, `db:studio`); deps include `@prisma/client` + `prisma`. |
| `pnpm-lock.yaml` | tooling | TOOLING | LOW | Lockfile includes Prisma packages. |
| `apps/api/package.json` | tooling | TOOLING | MEDIUM | API app deps include `@prisma/client`. |
| `apps/admin/package.json` | tooling | TOOLING | MEDIUM | Admin app deps include `@prisma/client`. |
