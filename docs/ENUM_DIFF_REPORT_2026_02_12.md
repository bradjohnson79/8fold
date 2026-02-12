## ENUM DIFF REPORT — 2026-02-12

Generated: `2026-02-12T21:25:52.973Z`

Compared sources:

- Postgres snapshot: `docs/POSTGRES_ENUM_SNAPSHOT_2026_02_12.md`
- Prisma schema (frozen): `prisma/schema.prisma`
- Drizzle enums: `apps/api/db/schema/enums.ts`

### AddressVerificationStatus — MISMATCH

- Postgres values:

```
PENDING
VERIFIED
ADDRESS_MISMATCH
```

- Prisma values:

```
(not present)
```

- Drizzle values:

```
(not present)
```

**Prisma vs Postgres mismatches**

- Missing in Prisma: `PENDING`, `VERIFIED`, `ADDRESS_MISMATCH`

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `PENDING`, `VERIFIED`, `ADDRESS_MISMATCH`

### AgentIntent — MISMATCH

- Postgres values:

```
JOB_POSTER
CONTRACTOR
```

- Prisma values:

```
JOB_POSTER
CONTRACTOR
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `JOB_POSTER`, `CONTRACTOR`

### AgentPlatform — MISMATCH

- Postgres values:

```
CRAIGSLIST
KIJIJI
NEXTDOOR
```

- Prisma values:

```
CRAIGSLIST
KIJIJI
NEXTDOOR
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `CRAIGSLIST`, `KIJIJI`, `NEXTDOOR`

### AgentScheduledRunStatus — MISMATCH

- Postgres values:

```
SCHEDULED
RUNNING
COMPLETE
SKIPPED
WAITING_FOR_ADMIN
```

- Prisma values:

```
SCHEDULED
RUNNING
COMPLETE
SKIPPED
WAITING_FOR_ADMIN
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `SCHEDULED`, `RUNNING`, `COMPLETE`, `SKIPPED`, `WAITING_FOR_ADMIN`

### AgentScheduleGeneratedBy — MISMATCH

- Postgres values:

```
GPT_5_1_MINI
ADMIN
```

- Prisma values:

```
GPT_5_1_MINI
ADMIN
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `GPT_5_1_MINI`, `ADMIN`

### AgentSchedulePlanStatus — MISMATCH

- Postgres values:

```
DRAFT
APPROVED
ACTIVE
ARCHIVED
```

- Prisma values:

```
DRAFT
APPROVED
ACTIVE
ARCHIVED
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `DRAFT`, `APPROVED`, `ACTIVE`, `ARCHIVED`

### AiAppraisalStatus — MISMATCH

- Postgres values:

```
PENDING
COMPLETED
FAILED
APPLIED
SUPERSEDED
```

- Prisma values:

```
(not present)
```

- Drizzle values:

```
PENDING
COMPLETED
FAILED
APPLIED
SUPERSEDED
```

**Prisma vs Postgres mismatches**

- Missing in Prisma: `PENDING`, `COMPLETED`, `FAILED`, `APPLIED`, `SUPERSEDED`

### BulkAiJobStatus — MISMATCH

- Postgres values:

```
PENDING
RUNNING
COMPLETED
FAILED
CANCELLED
```

- Prisma values:

```
(not present)
```

- Drizzle values:

```
(not present)
```

**Prisma vs Postgres mismatches**

- Missing in Prisma: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`

### CampaignPhase — MISMATCH

- Postgres values:

```
PHASE_1_JOB_POSTER
```

- Prisma values:

```
PHASE_1_JOB_POSTER
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `PHASE_1_JOB_POSTER`

### CampaignWeek — MISMATCH

- Postgres values:

```
WEEK_1
WEEK_2
```

- Prisma values:

```
WEEK_1
WEEK_2
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `WEEK_1`, `WEEK_2`

### ContactStatus — MISMATCH

- Postgres values:

```
NEW
DRAFTED
APPROVED
SENT
SKIPPED
```

- Prisma values:

```
NEW
DRAFTED
APPROVED
SENT
SKIPPED
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `NEW`, `DRAFTED`, `APPROVED`, `SENT`, `SKIPPED`

### ContractorAccountStatus — NO_POSTGRES_ENUM

- Postgres values:

```
(not present)
```

- Prisma values:

```
PENDING
ACTIVE
DENIED_INSUFFICIENT_EXPERIENCE
```

- Drizzle values:

```
(not present)
```

### ContractorAddressMode — NO_POSTGRES_ENUM

- Postgres values:

```
(not present)
```

- Prisma values:

```
SEARCH
MANUAL
```

- Drizzle values:

```
(not present)
```

### ContractorLedgerBucket — ALIGNED

- Postgres values:

```
PENDING
PAID
```

- Prisma values:

```
PENDING
PAID
```

- Drizzle values:

```
PENDING
PAID
```

### ContractorLedgerEntryType — ALIGNED

- Postgres values:

```
CONTRACTOR_EARNING
CONTRACTOR_PAYOUT
```

- Prisma values:

```
CONTRACTOR_EARNING
CONTRACTOR_PAYOUT
```

- Drizzle values:

```
CONTRACTOR_EARNING
CONTRACTOR_PAYOUT
```

### ContractorOnboardingStatus — MISMATCH

- Postgres values:

```
INCOMPLETE
ON_HOLD
ACTIVE
```

- Prisma values:

```
(not present)
```

- Drizzle values:

```
(not present)
```

**Prisma vs Postgres mismatches**

- Missing in Prisma: `INCOMPLETE`, `ON_HOLD`, `ACTIVE`

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `INCOMPLETE`, `ON_HOLD`, `ACTIVE`

### ContractorPayoutStatus — ALIGNED

- Postgres values:

```
PENDING
PAID
FAILED
```

- Prisma values:

```
PENDING
PAID
FAILED
```

- Drizzle values:

```
PENDING
PAID
FAILED
```

### ContractorStatus — MISMATCH

- Postgres values:

```
PENDING
APPROVED
REJECTED
```

- Prisma values:

```
PENDING
APPROVED
REJECTED
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `PENDING`, `APPROVED`, `REJECTED`

### ContractorTrade — MISMATCH

- Postgres values:

```
JUNK_REMOVAL
YARDWORK_GROUNDSKEEPING
CARPENTRY
DRYWALL
ROOFING
PLUMBING
ELECTRICAL
WELDING
```

- Prisma values:

```
JUNK_REMOVAL
YARDWORK_GROUNDSKEEPING
CARPENTRY
DRYWALL
ROOFING
PLUMBING
ELECTRICAL
WELDING
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `JUNK_REMOVAL`, `YARDWORK_GROUNDSKEEPING`, `CARPENTRY`, `DRYWALL`, `ROOFING`, `PLUMBING`, `ELECTRICAL`, `WELDING`

### ContractorWizardStep — MISMATCH

- Postgres values:

```
WAIVER
PROFILE
ADDRESS_VERIFICATION
TRADE_EXPERIENCE
PAYOUT_SETUP
STATUS_RESOLUTION
```

- Prisma values:

```
(not present)
```

- Drizzle values:

```
(not present)
```

**Prisma vs Postgres mismatches**

- Missing in Prisma: `WAIVER`, `PROFILE`, `ADDRESS_VERIFICATION`, `TRADE_EXPERIENCE`, `PAYOUT_SETUP`, `STATUS_RESOLUTION`

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `WAIVER`, `PROFILE`, `ADDRESS_VERIFICATION`, `TRADE_EXPERIENCE`, `PAYOUT_SETUP`, `STATUS_RESOLUTION`

### CountryCode — ALIGNED

- Postgres values:

```
CA
US
```

- Prisma values:

```
CA
US
```

- Drizzle values:

```
CA
US
```

### CurrencyCode — ALIGNED

- Postgres values:

```
CAD
USD
```

- Prisma values:

```
CAD
USD
```

- Drizzle values:

```
CAD
USD
```

### CustomerRejectReason — ALIGNED

- Postgres values:

```
QUALITY_ISSUE
INCOMPLETE_WORK
DAMAGE
NO_SHOW
OTHER
```

- Prisma values:

```
QUALITY_ISSUE
INCOMPLETE_WORK
DAMAGE
NO_SHOW
OTHER
```

- Drizzle values:

```
QUALITY_ISSUE
INCOMPLETE_WORK
DAMAGE
NO_SHOW
OTHER
```

### DisputeAgainstRole — ALIGNED

- Postgres values:

```
JOB_POSTER
CONTRACTOR
```

- Prisma values:

```
JOB_POSTER
CONTRACTOR
```

- Drizzle values:

```
JOB_POSTER
CONTRACTOR
```

### DisputeAlertType — ALIGNED

- Postgres values:

```
DEADLINE_BREACHED
```

- Prisma values:

```
DEADLINE_BREACHED
```

- Drizzle values:

```
DEADLINE_BREACHED
```

### DisputeDecision — ALIGNED

- Postgres values:

```
FAVOR_POSTER
FAVOR_CONTRACTOR
PARTIAL
NO_ACTION
FAVOR_JOB_POSTER
```

- Prisma values:

```
FAVOR_POSTER
FAVOR_JOB_POSTER
FAVOR_CONTRACTOR
PARTIAL
NO_ACTION
```

- Drizzle values:

```
FAVOR_POSTER
FAVOR_CONTRACTOR
PARTIAL
NO_ACTION
FAVOR_JOB_POSTER
```

### DisputeEnforcementActionStatus — ALIGNED

- Postgres values:

```
PENDING
EXECUTED
FAILED
CANCELLED
```

- Prisma values:

```
PENDING
EXECUTED
FAILED
CANCELLED
```

- Drizzle values:

```
PENDING
EXECUTED
FAILED
CANCELLED
```

### DisputeEnforcementActionType — ALIGNED

- Postgres values:

```
RELEASE_ESCROW_FULL
WITHHOLD_FUNDS
RELEASE_ESCROW_PARTIAL
FLAG_ACCOUNT_INTERNAL
```

- Prisma values:

```
RELEASE_ESCROW_FULL
WITHHOLD_FUNDS
RELEASE_ESCROW_PARTIAL
FLAG_ACCOUNT_INTERNAL
```

- Drizzle values:

```
RELEASE_ESCROW_FULL
WITHHOLD_FUNDS
RELEASE_ESCROW_PARTIAL
FLAG_ACCOUNT_INTERNAL
```

### DisputeReason — ALIGNED

- Postgres values:

```
PRICING
WORK_QUALITY
NO_SHOW
PAYMENT
OTHER
```

- Prisma values:

```
PRICING
WORK_QUALITY
NO_SHOW
PAYMENT
OTHER
```

- Drizzle values:

```
PRICING
WORK_QUALITY
NO_SHOW
PAYMENT
OTHER
```

### DisputeStatus — ALIGNED

- Postgres values:

```
SUBMITTED
UNDER_REVIEW
NEEDS_INFO
DECIDED
CLOSED
```

- Prisma values:

```
SUBMITTED
UNDER_REVIEW
NEEDS_INFO
DECIDED
CLOSED
```

- Drizzle values:

```
SUBMITTED
UNDER_REVIEW
NEEDS_INFO
DECIDED
CLOSED
```

### EcdUpdateReason — ALIGNED

- Postgres values:

```
AWAITING_PARTS_MATERIALS
SCOPE_EXPANDED
SCHEDULING_DELAY
OTHER
```

- Prisma values:

```
AWAITING_PARTS_MATERIALS
SCOPE_EXPANDED
SCHEDULING_DELAY
OTHER
```

- Drizzle values:

```
AWAITING_PARTS_MATERIALS
SCOPE_EXPANDED
SCHEDULING_DELAY
OTHER
```

### EmailIdentityKey — MISMATCH

- Postgres values:

```
HELLO
OUTREACH
LOCAL
CONNECT
SUPPORT
PARTNERSHIPS
```

- Prisma values:

```
HELLO
OUTREACH
LOCAL
CONNECT
SUPPORT
PARTNERSHIPS
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `HELLO`, `OUTREACH`, `LOCAL`, `CONNECT`, `SUPPORT`, `PARTNERSHIPS`

### EmailLabel — MISMATCH

- Postgres values:

```
JOB_POSTER_OUTREACH
CONTRACTOR_OUTREACH
ROUTER_OUTREACH
```

- Prisma values:

```
JOB_POSTER_OUTREACH
CONTRACTOR_OUTREACH
ROUTER_OUTREACH
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `JOB_POSTER_OUTREACH`, `CONTRACTOR_OUTREACH`, `ROUTER_OUTREACH`

### InternalAccountFlagType — ALIGNED

- Postgres values:

```
DISPUTE_RISK
FRAUD_REVIEW
MANUAL_REVIEW
```

- Prisma values:

```
DISPUTE_RISK
FRAUD_REVIEW
MANUAL_REVIEW
```

- Drizzle values:

```
DISPUTE_RISK
FRAUD_REVIEW
MANUAL_REVIEW
```

### JobAssignmentStatus — MISMATCH

- Postgres values:

```
ASSIGNED
COMPLETED
CANCELLED
```

- Prisma values:

```
ASSIGNED
COMPLETED
CANCELLED
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `ASSIGNED`, `COMPLETED`, `CANCELLED`

### JobDispatchStatus — MISMATCH

- Postgres values:

```
PENDING
ACCEPTED
DECLINED
EXPIRED
```

- Prisma values:

```
PENDING
ACCEPTED
DECLINED
EXPIRED
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `PENDING`, `ACCEPTED`, `DECLINED`, `EXPIRED`

### JobDraftStatus — ALIGNED

- Postgres values:

```
DRAFT
IN_REVIEW
NEEDS_CLARIFICATION
REJECTED
APPROVED
APPRAISING
PRICED
PAYMENT_PENDING
PAYMENT_FAILED
CANCELLED
```

- Prisma values:

```
DRAFT
APPRAISING
PRICED
PAYMENT_PENDING
PAYMENT_FAILED
CANCELLED
IN_REVIEW
NEEDS_CLARIFICATION
REJECTED
APPROVED
```

- Drizzle values:

```
DRAFT
APPRAISING
PRICED
PAYMENT_PENDING
PAYMENT_FAILED
CANCELLED
IN_REVIEW
NEEDS_CLARIFICATION
REJECTED
APPROVED
```

### JobHoldReason — ALIGNED

- Postgres values:

```
DISPUTE
QUALITY_ISSUE
FRAUD_REVIEW
MANUAL_REVIEW
```

- Prisma values:

```
DISPUTE
QUALITY_ISSUE
FRAUD_REVIEW
MANUAL_REVIEW
```

- Drizzle values:

```
DISPUTE
QUALITY_ISSUE
FRAUD_REVIEW
MANUAL_REVIEW
```

### JobHoldStatus — ALIGNED

- Postgres values:

```
ACTIVE
RELEASED
```

- Prisma values:

```
ACTIVE
RELEASED
```

- Drizzle values:

```
ACTIVE
RELEASED
```

### JobPhotoActor — MISMATCH

- Postgres values:

```
CUSTOMER
CONTRACTOR
```

- Prisma values:

```
CUSTOMER
CONTRACTOR
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `CUSTOMER`, `CONTRACTOR`

### JobPhotoKind — MISMATCH

- Postgres values:

```
CUSTOMER_SCOPE
CONTRACTOR_COMPLETION
```

- Prisma values:

```
CUSTOMER_SCOPE
CONTRACTOR_COMPLETION
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `CUSTOMER_SCOPE`, `CONTRACTOR_COMPLETION`

### JobSource — MISMATCH

- Postgres values:

```
MOCK
REAL
AI_REGENERATED
```

- Prisma values:

```
MOCK
REAL
```

- Drizzle values:

```
MOCK
REAL
```

**Prisma vs Postgres mismatches**

- Missing in Prisma: `AI_REGENERATED`

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `AI_REGENERATED`

### JobStatus — ALIGNED

- Postgres values:

```
DRAFT
PUBLISHED
ASSIGNED
IN_PROGRESS
CONTRACTOR_COMPLETED
CUSTOMER_APPROVED
CUSTOMER_REJECTED
COMPLETION_FLAGGED
COMPLETED_APPROVED
OPEN_FOR_ROUTING
```

- Prisma values:

```
ASSIGNED
IN_PROGRESS
CONTRACTOR_COMPLETED
CUSTOMER_APPROVED
CUSTOMER_REJECTED
COMPLETION_FLAGGED
COMPLETED_APPROVED
DRAFT
PUBLISHED
OPEN_FOR_ROUTING
```

- Drizzle values:

```
ASSIGNED
IN_PROGRESS
CONTRACTOR_COMPLETED
CUSTOMER_APPROVED
CUSTOMER_REJECTED
COMPLETION_FLAGGED
COMPLETED_APPROVED
DRAFT
PUBLISHED
OPEN_FOR_ROUTING
```

### JobType — ALIGNED

- Postgres values:

```
urban
regional
```

- Prisma values:

```
urban
regional
```

- Drizzle values:

```
urban
regional
```

### LedgerBucket — MISMATCH

- Postgres values:

```
PENDING
AVAILABLE
PAID
HELD
```

- Prisma values:

```
PENDING
AVAILABLE
PAID
HELD
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `PENDING`, `AVAILABLE`, `PAID`, `HELD`

### LedgerDirection — MISMATCH

- Postgres values:

```
CREDIT
DEBIT
```

- Prisma values:

```
CREDIT
DEBIT
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `CREDIT`, `DEBIT`

### LedgerEntryType — MISMATCH

- Postgres values:

```
ROUTER_EARNING
BROKER_FEE
PAYOUT
ADJUSTMENT
```

- Prisma values:

```
ROUTER_EARNING
BROKER_FEE
PAYOUT
ADJUSTMENT
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `ROUTER_EARNING`, `BROKER_FEE`, `PAYOUT`, `ADJUSTMENT`

### MaterialsEscrowLedgerEntryType — MISMATCH

- Postgres values:

```
DEPOSIT
RELEASE
POSTER_CREDIT
POSTER_REFUND
```

- Prisma values:

```
DEPOSIT
RELEASE
```

- Drizzle values:

```
DEPOSIT
RELEASE
POSTER_CREDIT
POSTER_REFUND
```

**Prisma vs Postgres mismatches**

- Missing in Prisma: `POSTER_CREDIT`, `POSTER_REFUND`

### MaterialsEscrowStatus — ALIGNED

- Postgres values:

```
HELD
RELEASED
```

- Prisma values:

```
HELD
RELEASED
```

- Drizzle values:

```
HELD
RELEASED
```

### MaterialsPaymentStatus — MISMATCH

- Postgres values:

```
PENDING
CAPTURED
FAILED
REFUNDED
```

- Prisma values:

```
(not present)
```

- Drizzle values:

```
PENDING
CAPTURED
FAILED
REFUNDED
```

**Prisma vs Postgres mismatches**

- Missing in Prisma: `PENDING`, `CAPTURED`, `FAILED`, `REFUNDED`

### MaterialsReceiptStatus — MISMATCH

- Postgres values:

```
DRAFT
SUBMITTED
```

- Prisma values:

```
(not present)
```

- Drizzle values:

```
DRAFT
SUBMITTED
```

**Prisma vs Postgres mismatches**

- Missing in Prisma: `DRAFT`, `SUBMITTED`

### MaterialsRequestStatus — MISMATCH

- Postgres values:

```
SUBMITTED
APPROVED
DECLINED
ESCROWED
RECEIPTS_SUBMITTED
REIMBURSED
```

- Prisma values:

```
SUBMITTED
APPROVED
DECLINED
```

- Drizzle values:

```
SUBMITTED
APPROVED
DECLINED
ESCROWED
RECEIPTS_SUBMITTED
REIMBURSED
```

**Prisma vs Postgres mismatches**

- Missing in Prisma: `ESCROWED`, `RECEIPTS_SUBMITTED`, `REIMBURSED`

### MonitoringActorRole — ALIGNED

- Postgres values:

```
ADMIN
ROUTER
CONTRACTOR
JOB_POSTER
```

- Prisma values:

```
ADMIN
ROUTER
CONTRACTOR
JOB_POSTER
```

- Drizzle values:

```
ADMIN
ROUTER
CONTRACTOR
JOB_POSTER
```

### MonitoringEventType — ALIGNED

- Postgres values:

```
JOB_APPROACHING_24H
JOB_OVERDUE_UNROUTED
JOB_ROUTED
JOB_COMPLETED
```

- Prisma values:

```
JOB_APPROACHING_24H
JOB_OVERDUE_UNROUTED
JOB_ROUTED
JOB_COMPLETED
```

- Drizzle values:

```
JOB_APPROACHING_24H
JOB_OVERDUE_UNROUTED
JOB_ROUTED
JOB_COMPLETED
```

### OnboardingRole — MISMATCH

- Postgres values:

```
JOB_POSTER
ROUTER
CONTRACTOR
```

- Prisma values:

```
JOB_POSTER
ROUTER
CONTRACTOR
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `JOB_POSTER`, `ROUTER`, `CONTRACTOR`

### PayoutProvider — ALIGNED

- Postgres values:

```
STRIPE
PAYPAL
WISE
```

- Prisma values:

```
STRIPE
PAYPAL
WISE
```

- Drizzle values:

```
STRIPE
PAYPAL
WISE
```

### PayoutRequestStatus — ALIGNED

- Postgres values:

```
REQUESTED
REJECTED
PAID
CANCELLED
```

- Prisma values:

```
REQUESTED
REJECTED
PAID
CANCELLED
```

- Drizzle values:

```
REQUESTED
REJECTED
PAID
CANCELLED
```

### PayoutStatus — ALIGNED

- Postgres values:

```
PENDING
PAID
FAILED
```

- Prisma values:

```
PENDING
PAID
FAILED
```

- Drizzle values:

```
PENDING
PAID
FAILED
```

### PublicJobStatus — ALIGNED

- Postgres values:

```
OPEN
IN_PROGRESS
```

- Prisma values:

```
OPEN
IN_PROGRESS
```

- Drizzle values:

```
OPEN
IN_PROGRESS
```

### RepeatContractorRequestStatus — MISMATCH

- Postgres values:

```
REQUESTED
ACCEPTED
DECLINED
CANCELLED
EXPIRED
```

- Prisma values:

```
REQUESTED
ACCEPTED
DECLINED
CANCELLED
EXPIRED
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `REQUESTED`, `ACCEPTED`, `DECLINED`, `CANCELLED`, `EXPIRED`

### RolePayoutMethod — ALIGNED

- Postgres values:

```
STRIPE
PAYPAL
```

- Prisma values:

```
STRIPE
PAYPAL
```

- Drizzle values:

```
STRIPE
PAYPAL
```

### RolePayoutStatus — ALIGNED

- Postgres values:

```
UNSET
PENDING
ACTIVE
```

- Prisma values:

```
UNSET
PENDING
ACTIVE
```

- Drizzle values:

```
UNSET
PENDING
ACTIVE
```

### RoleProjectionStatus — MISMATCH

- Postgres values:

```
ADMIN_PROJECTED
```

- Prisma values:

```
(not present)
```

- Drizzle values:

```
(not present)
```

**Prisma vs Postgres mismatches**

- Missing in Prisma: `ADMIN_PROJECTED`

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `ADMIN_PROJECTED`

### RouterOnboardingStatus — MISMATCH

- Postgres values:

```
INCOMPLETE
SUBMITTED
AI_APPROVED
ACTIVE
```

- Prisma values:

```
INCOMPLETE
SUBMITTED
AI_APPROVED
ACTIVE
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `INCOMPLETE`, `SUBMITTED`, `AI_APPROVED`, `ACTIVE`

### RouterStatus — ALIGNED

- Postgres values:

```
ACTIVE
SUSPENDED
```

- Prisma values:

```
ACTIVE
SUSPENDED
```

- Drizzle values:

```
ACTIVE
SUSPENDED
```

### RoutingStatus — ALIGNED

- Postgres values:

```
UNROUTED
ROUTED_BY_ROUTER
ROUTED_BY_ADMIN
```

- Prisma values:

```
UNROUTED
ROUTED_BY_ROUTER
ROUTED_BY_ADMIN
```

- Drizzle values:

```
UNROUTED
ROUTED_BY_ROUTER
ROUTED_BY_ADMIN
```

### SendBlockedReason — MISMATCH

- Postgres values:

```
REGION_PAUSED
IDENTITY_PAUSED
DAILY_LIMIT_EXCEEDED
INTERVAL_LIMIT_EXCEEDED
```

- Prisma values:

```
REGION_PAUSED
IDENTITY_PAUSED
DAILY_LIMIT_EXCEEDED
INTERVAL_LIMIT_EXCEEDED
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `REGION_PAUSED`, `IDENTITY_PAUSED`, `DAILY_LIMIT_EXCEEDED`, `INTERVAL_LIMIT_EXCEEDED`

### SendQueueStatus — MISMATCH

- Postgres values:

```
QUEUED
SENT
FAILED
BLOCKED
```

- Prisma values:

```
QUEUED
SENT
FAILED
BLOCKED
```

- Drizzle values:

```
(not present)
```

**Drizzle vs Postgres mismatches**

- Missing in Drizzle: `QUEUED`, `SENT`, `FAILED`, `BLOCKED`

### SupportRoleContext — ALIGNED

- Postgres values:

```
JOB_POSTER
ROUTER
CONTRACTOR
```

- Prisma values:

```
JOB_POSTER
ROUTER
CONTRACTOR
```

- Drizzle values:

```
JOB_POSTER
ROUTER
CONTRACTOR
```

### SupportTicketCategory — ALIGNED

- Postgres values:

```
PRICING
JOB_POSTING
ROUTING
CONTRACTOR
PAYOUTS
OTHER
```

- Prisma values:

```
PRICING
JOB_POSTING
ROUTING
CONTRACTOR
PAYOUTS
OTHER
```

- Drizzle values:

```
PRICING
JOB_POSTING
ROUTING
CONTRACTOR
PAYOUTS
OTHER
```

### SupportTicketPriority — ALIGNED

- Postgres values:

```
LOW
NORMAL
HIGH
```

- Prisma values:

```
LOW
NORMAL
HIGH
```

- Drizzle values:

```
LOW
NORMAL
HIGH
```

### SupportTicketStatus — ALIGNED

- Postgres values:

```
OPEN
IN_PROGRESS
RESOLVED
CLOSED
```

- Prisma values:

```
OPEN
IN_PROGRESS
RESOLVED
CLOSED
```

- Drizzle values:

```
OPEN
IN_PROGRESS
RESOLVED
CLOSED
```

### SupportTicketType — ALIGNED

- Postgres values:

```
HELP
DISPUTE
```

- Prisma values:

```
HELP
DISPUTE
```

- Drizzle values:

```
HELP
DISPUTE
```

### TradeCategory — MISMATCH

- Postgres values:

```
PLUMBING
ELECTRICAL
HVAC
APPLIANCE
HANDYMAN
PAINTING
CARPENTRY
DRYWALL
ROOFING
JANITORIAL_CLEANING
LANDSCAPING
FENCING
SNOW_REMOVAL
JUNK_REMOVAL
MOVING
AUTOMOTIVE
FURNITURE_ASSEMBLY
```

- Prisma values:

```
PLUMBING
ELECTRICAL
HVAC
APPLIANCE
HANDYMAN
PAINTING
CARPENTRY
DRYWALL
ROOFING
JANITORIAL_CLEANING
LANDSCAPING
FENCING
SNOW_REMOVAL
JUNK_REMOVAL
MOVING
AUTOMOTIVE
```

- Drizzle values:

```
PLUMBING
ELECTRICAL
HVAC
APPLIANCE
HANDYMAN
PAINTING
CARPENTRY
DRYWALL
ROOFING
JANITORIAL_CLEANING
LANDSCAPING
FENCING
SNOW_REMOVAL
JUNK_REMOVAL
MOVING
AUTOMOTIVE
FURNITURE_ASSEMBLY
```

**Prisma vs Postgres mismatches**

- Missing in Prisma: `FURNITURE_ASSEMBLY`

### UserRole — ALIGNED

- Postgres values:

```
USER
ADMIN
CUSTOMER
CONTRACTOR
ROUTER
JOB_POSTER
```

- Prisma values:

```
USER
ADMIN
CUSTOMER
CONTRACTOR
ROUTER
JOB_POSTER
```

- Drizzle values:

```
USER
ADMIN
CUSTOMER
CONTRACTOR
ROUTER
JOB_POSTER
```

### UserStatus — ALIGNED

- Postgres values:

```
ACTIVE
SUSPENDED
PENDING
```

- Prisma values:

```
ACTIVE
SUSPENDED
PENDING
```

- Drizzle values:

```
ACTIVE
SUSPENDED
PENDING
```
