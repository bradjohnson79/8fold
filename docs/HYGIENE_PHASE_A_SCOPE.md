# Hygiene Phase A — Runtime-Critical Surface Area

## Tier 1 (Must Work)

| Endpoint | Repo Function(s) | Tables Touched |
|----------|------------------|----------------|
| `/api/public/jobs/recent` | `listNewestJobs`, `countEligiblePublicJobs` | `jobs`, `jobPhotos` |
| Homepage jobs feed | Same as above (uses `/api/public/jobs/recent`) | `jobs`, `jobPhotos` |
| Router: routable jobs | Inline in route | `jobs`, `jobPayments`, `routers`, `users`, `jobDispatches` |
| Contractor: assigned jobs list | Inline in `/api/web/contractor/appointment` | `jobs`, `jobAssignments`, `contractors`, `users` |
| Admin: job detail | Inline in route | `jobs`, `jobAssignments`, `contractors` |

## Tier 2 (Nice to Have)

| Endpoint / Feature | Repo Function(s) | Tables Touched |
|--------------------|------------------|----------------|
| Job photo fetches | Inline in recent + jobs/[id] | `jobPhotos` |
| Router profile load | `requireRouterReady` + profile route | `routers`, `users`, `RouterProfile` |
| Stripe fields (if referenced) | `jobPayments.status` in routable-jobs | `JobPayment` |

## Endpoint → Table Mapping (Tier 1/2)

| Table | Used By |
|-------|---------|
| `jobs` | recent, routable-jobs, routed-jobs, admin/jobs/[id], contractor/appointment, jobs/[id] |
| `jobPhotos` / `job_photos` | recent, jobs/[id] |
| `jobPayments` | routable-jobs |
| `routers` | routable-jobs, routed-jobs |
| `users` | routable-jobs, contractor/appointment |
| `jobDispatches` | routable-jobs, routed-jobs |
| `jobAssignments` | admin/jobs/[id], contractor/appointment |
| `contractors` | admin/jobs/[id], contractor/appointment |
| `RouterProfile` | router profile (Tier 2) |
| `JobPayment` | routable-jobs |

## Out of Scope (Phase B)

- admin_router_contexts, clerk_webhook_events, internal_account_flags
- job_draft, JobFlag, JobHold, JobPosterCredit, job_posters
- LedgerEntry, MaterialsEscrow, MaterialsPayment, MaterialsReceiptFile, MaterialsReceiptSubmission
- monitoring_events, notification_deliveries, RepeatContractorRequest
- RouterReward, routing_hubs, StripeWebhookEvent, TransferRecord
- ContractorPayout.materialsRequestId, Contractor.stripeAccountId, Contractor.stripePayoutsEnabled
- JobHold.sourceDisputeCaseId, LedgerEntry.*, MaterialsEscrow.*, RouterProfile.address/city/stateProvince/postalCode/country
- All User nullable mismatches (Tier 2 only if router profile)
- directories (directory_engine)
