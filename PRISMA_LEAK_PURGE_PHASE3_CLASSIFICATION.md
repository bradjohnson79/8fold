## Prisma Leak Purge — Phase 3 Classification (from `pnpm prisma:boundary`)

Status: **99 files remaining** (after migrating `apps/api/app/api/admin/contractors/[id]/{approve,reject,suspend}`).

This classification is based on **write-surface risk**:
- **Bucket A**: safe, local, non-money admin/support/content writes (migrate first)
- **Bucket B**: money-adjacent (fees/cents/payouts/materials/stripe/escrow) (migrate carefully)
- **Bucket C**: complex multi-table job lifecycle operations (migrate last)

### Bucket A — safe admin/support/content writes

#### Admin app (`apps/admin`) API routes + server utilities (convert to Drizzle or proxy to core API)
- `apps/admin/app/api/admin/ai-agent-pipeline/plans/[id]/activate/route.ts`
- `apps/admin/app/api/admin/ai-agent-pipeline/plans/[id]/approve/route.ts`
- `apps/admin/app/api/admin/ai-agent-pipeline/plans/route.ts`
- `apps/admin/app/api/admin/ai-agent-pipeline/promote/route.ts`
- `apps/admin/app/api/admin/ai-agent-pipeline/runs/[id]/skip/route.ts`
- `apps/admin/app/api/admin/ai-agent-pipeline/templates/[id]/route.ts`
- `apps/admin/app/api/admin/ai-email-campaigns/contacts/route.ts`
- `apps/admin/app/api/admin/ai-email-campaigns/drafts/[id]/approve/route.ts`
- `apps/admin/app/api/admin/ai-email-campaigns/drafts/[id]/regenerate/route.ts`
- `apps/admin/app/api/admin/ai-email-campaigns/drafts/[id]/reject/route.ts`
- `apps/admin/app/api/admin/ai-email-campaigns/drafts/[id]/route.ts`
- `apps/admin/app/api/admin/ai-email-campaigns/drafts/generate/route.ts`
- `apps/admin/app/api/admin/ai-email-campaigns/regions/[id]/pause/route.ts`
- `apps/admin/app/api/admin/ai-email-campaigns/seed/route.ts`
- `apps/admin/app/api/admin/ai-email-campaigns/send-queue/enqueue/route.ts`
- `apps/admin/app/api/admin/ai-email-campaigns/send-queue/run/route.ts`
- `apps/admin/app/api/admin/auth/invite/route.ts`
- `apps/admin/app/api/admin/auth/reset-password/route.ts`
- `apps/admin/app/api/admin/auth/secret-signup/route.ts`
- `apps/admin/app/api/admin/auth/signup/route.ts`
- `apps/admin/app/api/admin/bulk-ai-jobs/[id]/cancel/route.ts`
- `apps/admin/app/api/admin/contractors/[id]/approve/route.ts`
- `apps/admin/app/api/admin/contractors/[id]/reject/route.ts`
- `apps/admin/app/api/admin/contractors/[id]/route.ts`
- `apps/admin/app/api/admin/contractors/route.ts`
- `apps/admin/app/api/admin/job-appraisals/[id]/complete/route.ts`
- `apps/admin/app/api/admin/job-drafts/[id]/needs-clarification/route.ts`
- `apps/admin/app/api/admin/job-drafts/[id]/reject/route.ts`
- `apps/admin/app/api/admin/job-drafts/[id]/route.ts`
- `apps/admin/app/api/admin/job-drafts/[id]/submit/route.ts`
- `apps/admin/app/api/admin/job-drafts/route.ts`
- `apps/admin/app/api/admin/jobs/bulk-delete-mocks/route.ts`
- `apps/admin/app/api/admin/jobs/mock-regenerate-failed/route.ts`
- `apps/admin/app/api/admin/my/roles/[role]/accept-terms/route.ts`
- `apps/admin/app/api/admin/my/roles/[role]/complete/route.ts`
- `apps/admin/app/api/admin/settings/mock-refresh/route.ts`
- `apps/admin/app/api/admin/support/disputes/[disputeId]/decision/route.ts`
- `apps/admin/app/api/admin/support/disputes/[disputeId]/status/route.ts`
- `apps/admin/app/api/admin/support/tickets/[ticketId]/assign-to-me/route.ts`
- `apps/admin/app/api/admin/support/tickets/[ticketId]/reply/route.ts`
- `apps/admin/app/api/admin/support/tickets/[ticketId]/status/route.ts`
- `apps/admin/src/server/bulkAiJobRunner.ts`
- `apps/admin/src/server/system/platformUser.ts`

#### Core API admin routes (`apps/api/app/api/admin`) — moderation / role-gating / support triage
- `apps/api/app/api/admin/contractors/[id]/route.ts`
- `apps/api/app/api/admin/contractors/route.ts`
- `apps/api/app/api/admin/routers/[userId]/approve/route.ts`
- `apps/api/app/api/admin/routers/[userId]/promote-senior/route.ts`
- `apps/api/app/api/admin/routers/[userId]/set-daily-limit/route.ts`
- `apps/api/app/api/admin/routers/[userId]/suspend/route.ts`
- `apps/api/app/api/admin/support/disputes/[id]/decision/route.ts`
- `apps/api/app/api/admin/support/disputes/[id]/status/route.ts`
- `apps/api/app/api/admin/support/tickets/[id]/assign-to-me/route.ts`
- `apps/api/app/api/admin/support/tickets/[id]/assign/route.ts`
- `apps/api/app/api/admin/support/tickets/[id]/messages/route.ts`

#### Web support routes (`apps/api/app/api/web/support`) — support messaging/attachments/disputes
- `apps/api/app/api/web/support/disputes/route.ts`
- `apps/api/app/api/web/support/tickets/[id]/attachments/route.ts`
- `apps/api/app/api/web/support/tickets/[id]/messages/route.ts`
- `apps/api/app/api/web/support/tickets/route.ts`

#### Mock/seed scripts and non-money services (dev tooling)
- `apps/api/scripts/runMockJobRefresh.ts`
- `apps/api/scripts/seedMockJobs.ts`
- `apps/api/src/audit/jobPostingAudit.ts`
- `apps/api/src/jobs/mockJobGuards.ts`
- `apps/api/src/jobs/mockJobRemoval.ts`
- `apps/api/src/services/mockJobRefreshService.ts`
- `apps/api/src/services/monitoringService.ts`
- `apps/api/src/services/routerJobService.ts`
- `apps/api/src/support/disputeEnforcement.ts`
- `apps/api/src/support/disputeSlaMonitor.ts`

### Bucket B — money-adjacent (migrate carefully)
- `apps/admin/app/api/admin/payout-requests/[id]/mark-paid/route.ts`
- `apps/api/app/api/admin/payout-requests/[id]/mark-paid/route.ts`
- `apps/api/app/api/payout-methods/route.ts`
- `apps/api/app/api/payout-requests/route.ts`
- `apps/api/app/api/web/materials-requests/[id]/decline/route.ts`
- `apps/api/app/api/web/materials-requests/[id]/receipts/submit/route.ts`
- `apps/api/app/api/web/materials-requests/[id]/receipts/upload/route.ts`
- `apps/api/app/api/web/materials-requests/[id]/reimburse/release/route.ts`
- `apps/api/app/api/web/materials-requests/route.ts`
- `apps/api/src/finance/contractorPayouts.ts`
- `apps/api/src/payments/materialsPayments.ts`

### Bucket C — complex multi-table transactional job flows (migrate last)
- `apps/admin/app/api/admin/job-drafts/[id]/publish/route.ts`
- `apps/admin/app/api/admin/jobs/[id]/apply-ai-price/route.ts`
- `apps/admin/app/api/admin/jobs/[id]/assign-me-as-router/route.ts`
- `apps/admin/app/api/admin/jobs/[id]/assign/route.ts`
- `apps/admin/app/api/admin/jobs/[id]/complete/route.ts`
- `apps/admin/app/api/admin/jobs/[id]/holds/route.ts`
- `apps/api/app/api/admin/job-drafts/[id]/needs-clarification/route.ts`
- `apps/api/app/api/admin/job-drafts/[id]/publish/route.ts`
- `apps/api/app/api/admin/job-drafts/[id]/reject/route.ts`
- `apps/api/app/api/admin/job-drafts/[id]/route.ts`
- `apps/api/app/api/admin/job-drafts/[id]/submit/route.ts`
- `apps/api/app/api/admin/job-drafts/route.ts`
- `apps/api/app/api/admin/jobs/[id]/assign/route.ts`
- `apps/api/app/api/admin/jobs/[id]/complete/route.ts`
- `apps/api/app/api/admin/router/jobs/[jobId]/route/route.ts`
- `apps/api/app/api/admin/router/jobs/overdue/route.ts`
- `apps/api/app/api/jobs/[id]/contractors/dispatch/route.ts`
- `apps/api/app/api/jobs/[id]/customer-review/route.ts`
- `apps/api/app/api/jobs/[id]/router-approve/route.ts`
- `apps/api/app/api/jobs/[id]/router-hold/route.ts`

