## PRISMA FROZEN — Schema Snapshot (2026-02-12)

Timestamp: `2026-02-12T21:22:15.122Z`

### Runtime

- Node: `v22.18.0`

### Prisma CLI

```
Prisma schema loaded from prisma/schema.prisma
prisma                  : 6.19.2
@prisma/client          : 6.19.2
Computed binaryTarget   : darwin-arm64
Operating System        : darwin
Architecture            : arm64
Node.js                 : v22.18.0
TypeScript              : 5.9.3
Query Engine (Node-API) : libquery-engine c2990dca591cba766e3b7ef5d9e8a84796e47ab7 (at node_modules/.pnpm/@prisma+engines@6.19.2/node_modules/@prisma/engines/libquery_engine-darwin-arm64.dylib.node)
PSL                     : @prisma/prisma-schema-wasm 7.1.1-3.c2990dca591cba766e3b7ef5d9e8a84796e47ab7
Schema Engine           : schema-engine-cli c2990dca591cba766e3b7ef5d9e8a84796e47ab7 (at node_modules/.pnpm/@prisma+engines@6.19.2/node_modules/@prisma/engines/schema-engine-darwin-arm64)
Default Engines Hash    : c2990dca591cba766e3b7ef5d9e8a84796e47ab7
Studio                  : 0.511.0
```

### Migrations folder listing

```
prisma/migrations/20260201032849_init/
prisma/migrations/20260201040000_ledger_immutable/
prisma/migrations/20260201233000_admin_users/
prisma/migrations/20260201234500_admin_invites/
prisma/migrations/20260202005500_job_completion_approvals_payouts/
prisma/migrations/20260202013000_job_type_and_distance_enforcement/
prisma/migrations/20260202022000_city_centroid_fallback_nullable_coords/
prisma/migrations/20260202030500_mobile_auth_sessions/
prisma/migrations/20260202034500_router_contractor_dispatch/
prisma/migrations/20260202042000_contractor_next_business_day_payout/
prisma/migrations/20260202204322_init/
prisma/migrations/20260202235634_materials_escrow/
prisma/migrations/20260203000826_materials_item_category/
prisma/migrations/20260203023409_router_routing_flow_v1/
prisma/migrations/20260203052756_admin_ai_email_campaigns_v1/
prisma/migrations/20260203053122_admin_ai_email_campaigns_v1_fix/
prisma/migrations/20260203113736_email_identity_keys_lock_v1x/
prisma/migrations/20260203113913_ai_agent_pipeline_v1_3/
prisma/migrations/20260203164918_admin_ai_email_campaigns_v1_hardening/
prisma/migrations/20260203190000_region_email_logs_v1_3/
prisma/migrations/20260203193000_job_ecd_v1/
prisma/migrations/20260204050504_init/
prisma/migrations/20260204050603_init/
prisma/migrations/20260204060939_pricing_job_posting_system/
prisma/migrations/20260204070000_stripe_payment_state_v1/
prisma/migrations/20260204071000_stripe_payment_state_v1/
prisma/migrations/20260204080000_job_guarantee_state_v1/
prisma/migrations/20260204090000_admin_router_backend_v1/
prisma/migrations/20260204215846_unified_users_v1/
prisma/migrations/20260204221127_monitoring_events_v1/
prisma/migrations/20260204224415_location_aware_mock_jobs_v1/
prisma/migrations/20260205021607_system_settings_v1/
prisma/migrations/20260205044923_support_tickets_v1/
prisma/migrations/20260205045859_dispute_cases_v1/
prisma/migrations/20260205051252_support_attachments_v1/
prisma/migrations/20260205054421_dispute_enforcement_actions/
prisma/migrations/20260205055022_support_attachment_sha256/
prisma/migrations/20260205055103_dispute_deadline_alerts/
prisma/migrations/20260205055259_dispute_alerts_apply/
prisma/migrations/20260205080327_add_job_source/
prisma/migrations/20260205230041_repeat_contractor_requests/
prisma/migrations/20260206182227_phase1_preserve_payments_allow_job_delete/
prisma/migrations/20260208140717_admin_role_projection_option_b/
prisma/migrations/20260208141746_distance_routing_guardrails_v1/
prisma/migrations/20260209000000_job_archive/
prisma/migrations/20260209002000_admin_role_onboarding_and_role_flags/
prisma/migrations/20260209003000_role_payout_fields/
prisma/migrations/20260209130000_contractor_profile_v1/
prisma/migrations/20260210220000_job_poster_availability/
prisma/migrations/20260210233000_router_terms_profile_gating/
prisma/migrations/20260211120000_job_draft_defaults_permissive/
prisma/migrations/20260211130000_contractor_accounts_wizard_fields/
```

### prisma/schema.prisma (verbatim)

```prisma
/// ⚠️ PRISMA FROZEN — DO NOT MODIFY.
/// Prisma is now legacy and will be removed after Drizzle migration.
/// Any schema changes must happen at Postgres + Drizzle level only.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  USER
  ADMIN
  CUSTOMER
  CONTRACTOR
  ROUTER
  JOB_POSTER
}

enum UserStatus {
  ACTIVE
  SUSPENDED
  PENDING
}

enum RouterOnboardingStatus {
  INCOMPLETE
  SUBMITTED
  AI_APPROVED
  ACTIVE
}

enum ContractorStatus {
  PENDING
  APPROVED
  REJECTED
}

enum ContractorAccountStatus {
  PENDING
  ACTIVE
  DENIED_INSUFFICIENT_EXPERIENCE
}

enum ContractorAddressMode {
  SEARCH
  MANUAL
}

enum ContractorTrade {
  JUNK_REMOVAL
  YARDWORK_GROUNDSKEEPING
  CARPENTRY
  DRYWALL
  ROOFING
  PLUMBING
  ELECTRICAL
  WELDING
}

// AUTHORITATIVE v1 (LOCKED) — do not rename values.
enum TradeCategory {
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
}

enum ContractorPayoutStatus {
  PENDING
  PAID
  FAILED
}

enum ContractorLedgerBucket {
  PENDING
  PAID
}

enum ContractorLedgerEntryType {
  CONTRACTOR_EARNING
  CONTRACTOR_PAYOUT
}

enum JobDraftStatus {
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
}

enum JobType {
  urban
  regional
}

enum JobStatus {
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
}

enum PublicJobStatus {
  OPEN
  IN_PROGRESS
}

enum JobSource {
  MOCK
  REAL
}

enum OnboardingRole {
  JOB_POSTER
  ROUTER
  CONTRACTOR
}

enum RepeatContractorRequestStatus {
  REQUESTED
  ACCEPTED
  DECLINED
  CANCELLED
  EXPIRED
}

enum RoutingStatus {
  UNROUTED
  ROUTED_BY_ROUTER
  ROUTED_BY_ADMIN
}

enum MonitoringEventType {
  JOB_APPROACHING_24H
  JOB_OVERDUE_UNROUTED
  JOB_ROUTED
  JOB_COMPLETED
}

enum MonitoringActorRole {
  ADMIN
  ROUTER
  CONTRACTOR
  JOB_POSTER
}

enum SupportTicketType {
  HELP
  DISPUTE
}

enum SupportTicketStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  CLOSED
}

enum SupportTicketCategory {
  PRICING
  JOB_POSTING
  ROUTING
  CONTRACTOR
  PAYOUTS
  OTHER
}

enum SupportTicketPriority {
  LOW
  NORMAL
  HIGH
}

enum SupportRoleContext {
  JOB_POSTER
  ROUTER
  CONTRACTOR
}

enum DisputeAgainstRole {
  JOB_POSTER
  CONTRACTOR
}

enum DisputeReason {
  PRICING
  WORK_QUALITY
  NO_SHOW
  PAYMENT
  OTHER
}

enum DisputeStatus {
  SUBMITTED
  UNDER_REVIEW
  NEEDS_INFO
  DECIDED
  CLOSED
}

enum DisputeDecision {
  FAVOR_POSTER
  FAVOR_JOB_POSTER
  FAVOR_CONTRACTOR
  PARTIAL
  NO_ACTION
}

enum DisputeEnforcementActionType {
  RELEASE_ESCROW_FULL
  WITHHOLD_FUNDS
  RELEASE_ESCROW_PARTIAL
  FLAG_ACCOUNT_INTERNAL
}

enum DisputeEnforcementActionStatus {
  PENDING
  EXECUTED
  FAILED
  CANCELLED
}

enum InternalAccountFlagType {
  DISPUTE_RISK
  FRAUD_REVIEW
  MANUAL_REVIEW
}

enum DisputeAlertType {
  DEADLINE_BREACHED
}

enum EcdUpdateReason {
  AWAITING_PARTS_MATERIALS
  SCOPE_EXPANDED
  SCHEDULING_DELAY
  OTHER
}

enum JobAssignmentStatus {
  ASSIGNED
  COMPLETED
  CANCELLED
}

enum JobDispatchStatus {
  PENDING
  ACCEPTED
  DECLINED
  EXPIRED
}

enum LedgerDirection {
  CREDIT
  DEBIT
}

enum LedgerBucket {
  PENDING
  AVAILABLE
  PAID
  HELD
}

enum CustomerRejectReason {
  QUALITY_ISSUE
  INCOMPLETE_WORK
  DAMAGE
  NO_SHOW
  OTHER
}

enum JobHoldReason {
  DISPUTE
  QUALITY_ISSUE
  FRAUD_REVIEW
  MANUAL_REVIEW
}

enum JobHoldStatus {
  ACTIVE
  RELEASED
}

enum JobPhotoKind {
  CUSTOMER_SCOPE
  CONTRACTOR_COMPLETION
}

enum JobPhotoActor {
  CUSTOMER
  CONTRACTOR
}

enum CountryCode {
  CA
  US
}

enum CurrencyCode {
  CAD
  USD
}

enum PayoutProvider {
  STRIPE
  PAYPAL
  WISE
}

enum RolePayoutMethod {
  STRIPE
  PAYPAL
}

enum RolePayoutStatus {
  UNSET
  PENDING
  ACTIVE
}

enum PayoutStatus {
  PENDING
  PAID
  FAILED
}

enum LedgerEntryType {
  ROUTER_EARNING
  BROKER_FEE
  PAYOUT
  ADJUSTMENT
}

enum MaterialsRequestStatus {
  SUBMITTED
  APPROVED
  DECLINED
}

enum MaterialsEscrowStatus {
  HELD
  RELEASED
}

enum MaterialsEscrowLedgerEntryType {
  DEPOSIT
  RELEASE
}

enum PayoutRequestStatus {
  REQUESTED
  REJECTED
  PAID
  CANCELLED
}

// ---------------------------
// AI Email Campaigns (ADMIN)
// V1 locked scope:
// - Phase 1 only (Job Poster outreach)
// - Weeks 1 & 2 regions only (seeded; do not add weeks 3-4 in code)
// ---------------------------

enum CampaignWeek {
  WEEK_1
  WEEK_2
}

enum CampaignPhase {
  PHASE_1_JOB_POSTER
}

enum ContactStatus {
  NEW
  DRAFTED
  APPROVED
  SENT
  SKIPPED
}

enum SendQueueStatus {
  QUEUED
  SENT
  FAILED
  BLOCKED
}

enum SendBlockedReason {
  REGION_PAUSED
  IDENTITY_PAUSED
  DAILY_LIMIT_EXCEEDED
  INTERVAL_LIMIT_EXCEEDED
}

// Exactly 6 identities (LOCKED). No dynamic creation in v1.x.
enum EmailIdentityKey {
  HELLO
  OUTREACH
  LOCAL
  CONNECT
  SUPPORT
  PARTNERSHIPS
}

enum EmailLabel {
  JOB_POSTER_OUTREACH
  CONTRACTOR_OUTREACH
  ROUTER_OUTREACH
}

enum AgentPlatform {
  CRAIGSLIST
  KIJIJI
  NEXTDOOR
}

enum AgentIntent {
  JOB_POSTER
  CONTRACTOR
}

enum AgentScheduleGeneratedBy {
  GPT_5_1_MINI
  ADMIN
}

enum AgentSchedulePlanStatus {
  DRAFT
  APPROVED
  ACTIVE
  ARCHIVED
}

enum AgentScheduledRunStatus {
  SCHEDULED
  RUNNING
  COMPLETE
  SKIPPED
  WAITING_FOR_ADMIN
}

model User {
  id         String     @id @default(cuid())
  authUserId String?    @unique
  email      String?    @unique
  phone      String?
  name       String?
  role       UserRole   @default(USER)
  status     UserStatus @default(ACTIVE)
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @default(now()) @updatedAt

  country CountryCode @default(US)

  jobClaims                     Job[]                        @relation("JobClaimedByUser")
  jobsPosted                    Job[]                        @relation("JobPostedByUser")
  adminRoutedJobs               Job[]                        @relation("JobAdminRoutedByUser")
  adminRouterContexts           AdminRouterContext[]
  materialsRequestsAsJobPoster  MaterialsRequest[]           @relation("MaterialsRequestJobPosterUser")
  materialsRequestsAsRouter     MaterialsRequest[]           @relation("MaterialsRequestRouterUser")
  materialsRequestsApproved     MaterialsRequest[]           @relation("MaterialsRequestApprovedByUser")
  materialsRequestsDeclined     MaterialsRequest[]           @relation("MaterialsRequestDeclinedByUser")
  materialsEscrowLedgerAuthored MaterialsEscrowLedgerEntry[] @relation("MaterialsEscrowLedgerActor")
  payoutRequests                PayoutRequest[]
  ledgerEntries                 LedgerEntry[]
  auditLogsAuthored             AuditLog[]                   @relation("AuditLogActor")
  jobDraftsCreated              JobDraft[]                   @relation("JobDraftCreatedByAdmin")
  jobDraftsCreatedAsPoster      JobDraft[]                   @relation("JobDraftCreatedByJobPoster")
  assignmentsMade               JobAssignment[]              @relation("JobAssignmentAssignedByAdmin")

  payoutMethods PayoutMethod[]
  payouts       Payout[]

  jobHoldsApplied  JobHold[] @relation("JobHoldAppliedByUser")
  jobHoldsReleased JobHold[] @relation("JobHoldReleasedByUser")

  routerProfile    RouterProfile?
  jobPosterProfile JobPosterProfile?
  authTokens       AuthToken[]
  sessions         Session[]

  jobDispatches JobDispatch[]

  // Unified user role extensions (v1)
  jobPoster         JobPoster?
  router            Router?
  contractorAccount ContractorAccount?
  roleOnboarding    RoleOnboardingState[]

  // Jobs where this user is the selected contractor (unified user link, optional v1)
  contractorJobs Job[] @relation("JobContractorUser")

  monitoringEventsAuthored MonitoringEvent[] @relation("MonitoringEventActorUser")

  supportTicketsCreated      SupportTicket[]     @relation("SupportTicketCreatedBy")
  supportTicketsAssigned     SupportTicket[]     @relation("SupportTicketAssignedTo")
  supportMessagesAuthored    SupportMessage[]    @relation("SupportMessageAuthor")
  supportAttachmentsUploaded SupportAttachment[]

  disputeCasesFiled   DisputeCase[] @relation("DisputeFiledByUser")
  disputeCasesAgainst DisputeCase[] @relation("DisputeAgainstUser")

  disputeEnforcementActionsRequested DisputeEnforcementAction[] @relation("DisputeEnforcementRequestedByUser")
  disputeEnforcementActionsExecuted  DisputeEnforcementAction[] @relation("DisputeEnforcementExecutedByUser")

  internalAccountFlags         InternalAccountFlag[] @relation("InternalAccountFlagForUser")
  internalAccountFlagsCreated  InternalAccountFlag[] @relation("InternalAccountFlagCreatedByUser")
  internalAccountFlagsResolved InternalAccountFlag[] @relation("InternalAccountFlagResolvedByUser")

  @@index([role])
  @@index([status])
}

model SupportTicket {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  type     SupportTicketType
  status   SupportTicketStatus   @default(OPEN)
  category SupportTicketCategory
  priority SupportTicketPriority @default(NORMAL)

  createdById String
  createdBy   User   @relation("SupportTicketCreatedBy", fields: [createdById], references: [id])

  assignedToId String?
  assignedTo   User?   @relation("SupportTicketAssignedTo", fields: [assignedToId], references: [id])

  roleContext SupportRoleContext
  subject     String

  messages    SupportMessage[]
  disputeCase DisputeCase?
  attachments SupportAttachment[]

  @@index([status, priority, createdAt])
  @@index([createdById, createdAt])
  @@index([assignedToId, updatedAt])
  @@map("support_tickets")
}

model DisputeCase {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  ticketId String        @unique
  ticket   SupportTicket @relation(fields: [ticketId], references: [id])

  jobId String
  job   Job    @relation(fields: [jobId], references: [id])

  filedByUserId String
  filedByUser   User   @relation("DisputeFiledByUser", fields: [filedByUserId], references: [id])

  againstUserId String
  againstUser   User   @relation("DisputeAgainstUser", fields: [againstUserId], references: [id])

  againstRole   DisputeAgainstRole
  disputeReason DisputeReason
  description   String

  status   DisputeStatus    @default(SUBMITTED)
  decision DisputeDecision?

  decisionSummary String?
  decisionAt      DateTime?

  // Auto-calculated on creation: createdAt + 15 business days (Mon–Fri).
  deadlineAt DateTime

  enforcementActions DisputeEnforcementAction[]
  accountFlags       InternalAccountFlag[]
  jobHolds           JobHold[]
  alerts             DisputeAlert[]

  @@index([status, deadlineAt])
  @@index([jobId])
  @@index([filedByUserId, createdAt])
  @@map("dispute_cases")
}

model DisputeAlert {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())

  disputeCaseId String
  disputeCase   DisputeCase @relation(fields: [disputeCaseId], references: [id])

  type DisputeAlertType

  // Null until an admin marks it as handled in future UI.
  handledAt DateTime?

  @@unique([disputeCaseId, type])
  @@index([type, createdAt])
  @@index([handledAt])
  @@map("dispute_alerts")
}

model DisputeEnforcementAction {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  disputeCaseId String
  disputeCase   DisputeCase @relation(fields: [disputeCaseId], references: [id])

  type   DisputeEnforcementActionType
  status DisputeEnforcementActionStatus @default(PENDING)

  payload Json?

  requestedByUserId String
  requestedByUser   User   @relation("DisputeEnforcementRequestedByUser", fields: [requestedByUserId], references: [id])

  executedByUserId String?
  executedByUser   User?   @relation("DisputeEnforcementExecutedByUser", fields: [executedByUserId], references: [id])

  executedAt DateTime?
  error      String?

  @@index([disputeCaseId, status, createdAt])
  @@map("dispute_enforcement_actions")
}

model InternalAccountFlag {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  userId String
  user   User   @relation("InternalAccountFlagForUser", fields: [userId], references: [id])

  type   InternalAccountFlagType
  status String                  @default("ACTIVE") // ACTIVE | RESOLVED (string for flexibility)

  reason String

  disputeCaseId String?
  disputeCase   DisputeCase? @relation(fields: [disputeCaseId], references: [id])

  createdByUserId String
  createdByUser   User   @relation("InternalAccountFlagCreatedByUser", fields: [createdByUserId], references: [id])

  resolvedAt       DateTime?
  resolvedByUserId String?
  resolvedByUser   User?     @relation("InternalAccountFlagResolvedByUser", fields: [resolvedByUserId], references: [id])

  @@unique([userId, type, disputeCaseId])
  @@index([userId, status, createdAt])
  @@index([type, status, createdAt])
  @@map("internal_account_flags")
}

model SupportMessage {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())

  ticketId String
  ticket   SupportTicket @relation(fields: [ticketId], references: [id])

  authorId String
  author   User   @relation("SupportMessageAuthor", fields: [authorId], references: [id])

  message String

  @@index([ticketId, createdAt])
  @@index([authorId, createdAt])
  @@map("support_messages")
}

model SupportAttachment {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())

  ticketId String
  ticket   SupportTicket @relation(fields: [ticketId], references: [id])

  uploadedById String
  uploadedBy   User   @relation(fields: [uploadedById], references: [id])

  originalName String
  mimeType     String
  sizeBytes    Int

  // Backend storage key (local filesystem in v1 dev; object storage in prod later).
  storageKey String  @unique
  // Content hash for immutability/audit (sha256 hex).
  sha256     String?

  @@index([ticketId, createdAt])
  @@index([uploadedById, createdAt])
  @@map("support_attachments")
}

model JobPoster {
  userId String @id
  user   User   @relation(fields: [userId], references: [id])

  createdByAdmin Boolean @default(false)
  isActive       Boolean @default(true)
  isMock         Boolean @default(false)
  isTest         Boolean @default(false)

  defaultRegion   String?
  totalJobsPosted Int       @default(0)
  lastJobPostedAt DateTime?

  createdAt DateTime @default(now())

  @@index([userId])
  @@map("job_posters")
}

enum RouterStatus {
  ACTIVE
  SUSPENDED
}

model Router {
  userId String @id
  user   User   @relation(fields: [userId], references: [id])

  createdByAdmin Boolean @default(false)
  isActive       Boolean @default(true)
  isMock         Boolean @default(false)
  isTest         Boolean @default(false)

  // Access gating (v1): required for router job routing tools.
  termsAccepted   Boolean @default(false)
  profileComplete Boolean @default(false)

  homeCountry    CountryCode @default(US)
  homeRegionCode String
  homeCity       String?

  isSeniorRouter  Boolean @default(false)
  dailyRouteLimit Int     @default(10)

  routesCompleted Int    @default(0)
  routesFailed    Int    @default(0)
  rating          Float?

  status RouterStatus @default(ACTIVE)

  createdAt DateTime @default(now())

  @@index([homeRegionCode])
  @@map("routers")
}

model ContractorAccount {
  userId String @id
  user   User   @relation(fields: [userId], references: [id])

  createdByAdmin Boolean @default(false)
  isActive       Boolean @default(true)
  isMock         Boolean @default(false)
  isTest         Boolean @default(false)

  // Profile wizard / eligibility (v1)
  status          ContractorAccountStatus @default(PENDING)
  wizardCompleted Boolean                @default(false)

  firstName      String?
  lastName       String?
  businessName   String?
  businessNumber String?

  addressMode              ContractorAddressMode @default(SEARCH)
  addressSearchDisplayName String?
  address1                 String?
  address2                 String?
  apt                      String?
  postalCode               String?

  tradeCategory   TradeCategory
  serviceRadiusKm Int           @default(25)

  country    CountryCode @default(US)
  regionCode String
  city       String?

  tradeStartYear  Int?
  tradeStartMonth Int?

  isApproved    Boolean @default(false)
  jobsCompleted Int     @default(0)
  rating        Float?

  // Role payout settings (contractor)
  payoutMethod RolePayoutMethod?
  payoutStatus RolePayoutStatus @default(UNSET)
  stripeAccountId String? @unique
  paypalEmail  String?

  createdAt DateTime @default(now())

  @@index([regionCode])
  @@map("contractor_accounts")
}

model RoutingHub {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  createdAt DateTime @default(now())

  country    CountryCode
  regionCode String
  hubCity    String
  lat        Float
  lng        Float

  isAdminOnly Boolean @default(true)

  contexts AdminRouterContext[]

  @@unique([country, regionCode, hubCity])
  @@index([country, regionCode])
  @@map("routing_hubs")
}

model AdminRouterContext {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  createdAt DateTime @default(now())

  adminId String
  admin   User   @relation(fields: [adminId], references: [id])

  country    CountryCode
  regionCode String

  routingHubId String     @db.Uuid
  routingHub   RoutingHub @relation(fields: [routingHubId], references: [id])

  activatedAt   DateTime  @default(now())
  deactivatedAt DateTime?

  @@index([adminId, deactivatedAt])
  @@index([country, regionCode, deactivatedAt])
  @@map("admin_router_contexts")
}

model RoleOnboardingState {
  id String @id @default(cuid())

  userId String
  user   User   @relation(fields: [userId], references: [id])

  role OnboardingRole

  roleTermsAccepted   Boolean   @default(false)
  roleTermsAcceptedAt DateTime?

  wizardCompleted   Boolean   @default(false)
  wizardCompletedAt DateTime?

  createdByAdmin Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, role])
  @@index([role, wizardCompleted])
  @@map("role_onboarding_states")
}

model AuthToken {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())

  userId String
  user   User   @relation(fields: [userId], references: [id])

  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?

  @@index([userId, expiresAt])
}

model Session {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())

  userId String
  user   User   @relation(fields: [userId], references: [id])

  sessionTokenHash String    @unique
  expiresAt        DateTime
  revokedAt        DateTime?

  @@index([userId, expiresAt])
}

model RouterProfile {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  userId String @unique
  user   User   @relation(fields: [userId], references: [id])

  name   String?
  state  String?
  lat    Float?
  lng    Float?
  status RouterOnboardingStatus @default(INCOMPLETE)

  // Private router profile fields (v1)
  addressPrivate String?

  // Stripe Connect (router payouts)
  stripeAccountId String? @unique

  // Role payout settings (router)
  payoutMethod RolePayoutMethod?
  payoutStatus RolePayoutStatus @default(UNSET)
  paypalEmail  String?

  // Notifications (v1): used for router approval reminders.
  // Email is default-on; SMS is opt-in and requires phone.
  notifyViaEmail Boolean @default(true)
  notifyViaSms   Boolean @default(false)
  phone          String?
}

model JobPosterProfile {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  userId String @unique
  user   User   @relation(fields: [userId], references: [id])

  name               String
  email              String
  phone              String?
  address            String?
  city               String
  stateProvince      String
  country            CountryCode @default(US)
  lat                Float?
  lng                Float?
  defaultJobLocation String?

  // Role payout settings (job poster)
  payoutMethod RolePayoutMethod?
  payoutStatus RolePayoutStatus @default(UNSET)
  stripeAccountId String? @unique
  paypalEmail  String?

  @@index([userId])
}

model Contractor {
  id     String           @id @default(cuid())
  status ContractorStatus @default(PENDING)

  businessName    String
  contactName     String?
  yearsExperience Int     @default(3)
  phone           String?
  email           String?

  // Stripe Connect (contractor payouts)
  stripeAccountId String? @unique

  country    CountryCode     @default(US)
  regionCode String
  trade      ContractorTrade

  // v1 controlled categories (multi-select). This is the canonical eligibility list.
  tradeCategories TradeCategory[]

  // Admin-gated: only contractors explicitly enabled may receive AUTOMOTIVE jobs.
  automotiveEnabled Boolean @default(false)

  // Coordinates required for distance-based routing enforcement.
  // If missing, assignment will be blocked server-side.
  lat Float?
  lng Float?

  /**
   * v1 tagging (simple + flexible):
   * - categories: e.g. ["plumbing", "electrical"]
   * - regions: e.g. ["austin-tx", "round-rock-tx"]
   */
  categories String[]
  regions    String[]

  createdAt  DateTime  @default(now())
  approvedAt DateTime?

  jobAssignments JobAssignment[]
  jobDispatches  JobDispatch[]

  materialsRequests MaterialsRequest[]

  repeatContractorRequests RepeatContractorRequest[]

  ledgerEntries ContractorLedgerEntry[]
  payouts       ContractorPayout[]
}

model ContractorLedgerEntry {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())

  contractorId String
  contractor   Contractor @relation(fields: [contractorId], references: [id])

  jobId String?
  job   Job?    @relation(fields: [jobId], references: [id])

  type        ContractorLedgerEntryType
  bucket      ContractorLedgerBucket
  amountCents Int
  memo        String?

  @@index([contractorId, createdAt])
  @@index([jobId])
}

model ContractorPayout {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())

  contractorId String
  contractor   Contractor @relation(fields: [contractorId], references: [id])

  jobId String @unique
  job   Job    @relation(fields: [jobId], references: [id])

  amountCents       Int
  scheduledFor      DateTime
  status            ContractorPayoutStatus @default(PENDING)
  paidAt            DateTime?
  externalReference String?
  failureReason     String?

  @@index([status, scheduledFor])
  @@index([contractorId, scheduledFor])
}

model JobDraft {
  id     String         @id @default(cuid())
  status JobDraftStatus @default(DRAFT)

  title                 String
  scope                 String
  region                String
  serviceType           String
  tradeCategory         TradeCategory?
  timeWindow            String?
  routerEarningsCents   Int
  brokerFeeCents        Int
  contractorPayoutCents Int            @default(0)

  // Canonical Escrow Tracking (v1.x)
  laborTotalCents     Int @default(0)
  materialsTotalCents Int @default(0)
  transactionFeeCents Int @default(0)

  // Customer must choose job type (no defaults).
  jobType JobType
  // Job location coordinates (required for distance-based assignment).
  // Optional input: if missing, server resolves city centroid coords from region (city-state) via Mapbox.
  lat     Float?
  lng     Float?

  notesInternal String?

  // Price locking (surgical improvement)
  priceLockedAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  createdByAdminUserId String?
  createdByAdmin       User?   @relation("JobDraftCreatedByAdmin", fields: [createdByAdminUserId], references: [id])

  // Job poster can create drafts (nullable for admin-created drafts)
  createdByJobPosterUserId String?
  createdByJobPoster       User?   @relation("JobDraftCreatedByJobPoster", fields: [createdByJobPosterUserId], references: [id])

  publishedJobId String? @unique
  publishedJob   Job?    @relation(fields: [publishedJobId], references: [id])
}

model Job {
  id     String    @id @default(cuid())
  status JobStatus @default(PUBLISHED)
  archived Boolean @default(false)

  title      String
  scope      String
  region     String
  country    CountryCode @default(US)
  regionCode String?
  // Human-friendly location fields for public discovery (best-effort, non-authoritative).
  regionName String?
  city       String?
  postalCode String?

  // Cold-start mock jobs (never routable/payable/monitored)
  isMock        Boolean         @default(false)
  publicStatus  PublicJobStatus @default(OPEN)
  jobSource     JobSource       @default(REAL) // Explicit labeling for future-safe removal

  // Repeat Contractor incentive (v1): router fee discount applied only if repeat contractor accepts.
  repeatContractorDiscountCents Int @default(0)
  serviceType   String
  tradeCategory TradeCategory   @default(HANDYMAN)
  timeWindow    String?

  routerEarningsCents   Int
  brokerFeeCents        Int
  contractorPayoutCents Int @default(0)

  // Canonical Escrow Tracking (v1.x)
  laborTotalCents     Int @default(0)
  materialsTotalCents Int @default(0)
  transactionFeeCents Int @default(0)

  // Stripe payment/escrow state (authoritative in DB; Stripe mirrors intent)
  escrowLockedAt    DateTime?
  paymentCapturedAt DateTime?
  paymentReleasedAt DateTime?

  // Pricing audit trail
  priceMedianCents     Int?
  priceAdjustmentCents Int?
  pricingVersion       String @default("v1-median-delta")

  // Special trade data (e.g., junk hauling items)
  junkHaulingItems Json?

  jobType JobType
  // Optional input: if missing, server resolves city centroid coords from region (city-state) via Mapbox.
  lat     Float?
  lng     Float?

  createdAt   DateTime @default(now())
  publishedAt DateTime @default(now())

  // Job Poster (authenticated web user) - optional for legacy jobs.
  jobPosterUserId String?
  jobPosterUser   User?   @relation("JobPostedByUser", fields: [jobPosterUserId], references: [id])

  // Contact & guarantee (7-day poster guarantee)
  // Any contact permanently voids refund eligibility.
  contactedAt         DateTime?
  guaranteeEligibleAt DateTime?

  // Router assignment
  claimedAt DateTime?
  routerId  String?   @map("claimedByUserId")
  router    User?     @relation("JobClaimedByUser", fields: [routerId], references: [id])

  // Admin routing attribution (failsafe routing)
  adminRoutedById String?
  adminRoutedBy   User?   @relation("JobAdminRoutedByUser", fields: [adminRoutedById], references: [id])

  // Contractor as a unified user (optional in v1; inventory contractor remains canonical for dispatch/assignment)
  contractorUserId String?
  contractorUser   User?   @relation("JobContractorUser", fields: [contractorUserId], references: [id])

  postedAt        DateTime      @default(now())
  routingDueAt    DateTime?
  firstRoutedAt   DateTime?
  routingStatus   RoutingStatus @default(UNROUTED)
  failsafeRouting Boolean       @default(false)

  routedAt DateTime?

  // Completion & approvals (3-gate, deterministic)
  contractorCompletedAt       DateTime?
  contractorCompletionSummary String?

  customerApprovedAt   DateTime?
  customerRejectedAt   DateTime?
  customerRejectReason CustomerRejectReason?
  customerRejectNotes  String?
  customerFeedback     String?

  routerApprovedAt    DateTime?
  routerApprovalNotes String?

  completionFlaggedAt  DateTime?
  completionFlagReason String?

  // Token-gated actions (v1, since customers/contractors are not authenticated users)
  contractorActionTokenHash String?
  customerActionTokenHash   String?

  // Estimated Completion Date (ECD) — good-faith estimate (not a deadline).
  // Date-only semantics: stored as a timestamp (UTC) but UI enforces YYYY-MM-DD.
  estimatedCompletionDate DateTime?
  estimateSetAt           DateTime?
  estimateUpdatedAt       DateTime?
  estimateUpdateReason    EcdUpdateReason?
  estimateUpdateOtherText String?

  jobDraft   JobDraft?
  assignment JobAssignment?
  dispatches JobDispatch[]

  ledgerEntries LedgerEntry[]
  photos        JobPhoto[]
  holds         JobHold[]

  materialsRequests MaterialsRequest[]

  contractorLedgerEntries ContractorLedgerEntry[]
  contractorPayout        ContractorPayout?
  payment                 JobPayment?

  monitoringEvents MonitoringEvent[]

  disputeCases DisputeCase[]

  repeatContractorRequest RepeatContractorRequest?

  @@index([status, publishedAt])
  @@index([region, serviceType])
  @@index([routingStatus, routingDueAt])
  @@index([country, regionCode, routingStatus])
  @@index([postedAt])
  @@index([adminRoutedById])
  @@index([contractorUserId])
  @@index([isMock, publicStatus])
  @@index([jobSource, publicStatus])
  @@index([jobSource, city, regionCode])
}

model RepeatContractorRequest {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  jobId String @unique
  job   Job    @relation(fields: [jobId], references: [id])

  contractorId String
  contractor   Contractor @relation(fields: [contractorId], references: [id])

  tradeCategory TradeCategory
  status        RepeatContractorRequestStatus @default(REQUESTED)

  requestedAt DateTime @default(now())
  respondedAt DateTime?

  // For audit/UI context
  priorJobId String?

  @@index([contractorId, status, requestedAt])
  @@index([jobId])
}

model MonitoringEvent {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  createdAt DateTime @default(now())

  type MonitoringEventType

  jobId String
  job   Job    @relation(fields: [jobId], references: [id])

  role   MonitoringActorRole
  userId String?
  user   User?               @relation("MonitoringEventActorUser", fields: [userId], references: [id])

  handledAt DateTime?

  @@unique([jobId, type])
  @@index([type])
  @@index([jobId])
  @@index([createdAt])
  @@map("monitoring_events")
}

model JobPayment {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  jobId String @unique
  job   Job    @relation(fields: [jobId], references: [id])

  stripePaymentIntentId     String  @unique
  stripePaymentIntentStatus String  @default("requires_payment_method")
  stripeChargeId            String?
  amountCents               Int
  status                    String  @default("PENDING") // PENDING, CAPTURED, FAILED, REFUNDED

  escrowLockedAt    DateTime?
  paymentCapturedAt DateTime?
  paymentReleasedAt DateTime?
  refundedAt        DateTime?
  // Refund issuance timestamp (UI/ops state; refund API out of scope)
  refundIssuedAt    DateTime?
  refundAmountCents Int?

  @@index([status, createdAt])
  @@index([stripePaymentIntentId])
}

// Stripe webhook idempotency (processed event IDs)
model StripeWebhookEvent {
  id        String   @id // Stripe Event ID (evt_*)
  createdAt DateTime @default(now())

  type     String
  objectId String?

  processedAt DateTime?

  @@index([type, createdAt])
  @@index([objectId])
}

model MaterialsRequest {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  status MaterialsRequestStatus @default(SUBMITTED)

  // Gate: only ASSIGNED / IN_PROGRESS jobs can have requests.
  jobId String
  job   Job    @relation(fields: [jobId], references: [id])

  // Contractor is the actual worker (linked by assignment).
  contractorId String
  contractor   Contractor @relation(fields: [contractorId], references: [id])

  // Job Poster approval authority.
  jobPosterUserId String
  jobPosterUser   User   @relation("MaterialsRequestJobPosterUser", fields: [jobPosterUserId], references: [id])

  // Router has read-only visibility; derived from Job.claimedByUserId at creation time.
  routerUserId String?
  routerUser   User?   @relation("MaterialsRequestRouterUser", fields: [routerUserId], references: [id])

  submittedAt DateTime  @default(now())
  approvedAt  DateTime?
  declinedAt  DateTime?

  approvedByUserId String?
  approvedByUser   User?   @relation("MaterialsRequestApprovedByUser", fields: [approvedByUserId], references: [id])

  declinedByUserId String?
  declinedByUser   User?   @relation("MaterialsRequestDeclinedByUser", fields: [declinedByUserId], references: [id])

  currency         CurrencyCode @default(USD)
  totalAmountCents Int

  escrow MaterialsEscrow?
  items  MaterialsItem[]

  @@index([jobId, status, createdAt])
  @@index([contractorId, status, createdAt])
  @@index([jobPosterUserId, status, createdAt])
}

model MaterialsItem {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())

  requestId String
  request   MaterialsRequest @relation(fields: [requestId], references: [id])

  name           String
  category       String
  quantity       Int
  unitPriceCents Int
  priceUrl       String

  @@index([requestId, createdAt])
}

model MaterialsEscrow {
  id        String                @id @default(cuid())
  createdAt DateTime              @default(now())
  status    MaterialsEscrowStatus @default(HELD)

  requestId String           @unique
  request   MaterialsRequest @relation(fields: [requestId], references: [id])

  currency    CurrencyCode @default(USD)
  amountCents Int

  releaseDueAt DateTime
  releasedAt   DateTime?

  ledgerEntries MaterialsEscrowLedgerEntry[]

  @@index([status, releaseDueAt])
}

model MaterialsEscrowLedgerEntry {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())

  escrowId String
  escrow   MaterialsEscrow @relation(fields: [escrowId], references: [id])

  type        MaterialsEscrowLedgerEntryType
  amountCents Int
  currency    CurrencyCode                   @default(USD)

  memo String?

  actorUserId String?
  actorUser   User?   @relation("MaterialsEscrowLedgerActor", fields: [actorUserId], references: [id])

  @@index([escrowId, createdAt])
}

model JobDispatch {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  status      JobDispatchStatus @default(PENDING)
  expiresAt   DateTime
  respondedAt DateTime?

  // Token-gated contractor decision (contractors are not authenticated users in v1)
  tokenHash String @unique

  jobId String
  job   Job    @relation(fields: [jobId], references: [id])

  contractorId String
  contractor   Contractor @relation(fields: [contractorId], references: [id])

  routerUserId String
  routerUser   User   @relation(fields: [routerUserId], references: [id])

  @@index([jobId, status, createdAt])
  @@index([contractorId, status, createdAt])
  @@index([routerUserId, status, createdAt])
}

model JobPhoto {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())

  jobId String
  job   Job    @relation(fields: [jobId], references: [id])

  kind  JobPhotoKind
  actor JobPhotoActor

  // Storage is out of scope for v1; store references only.
  url        String?
  storageKey String?
  metadata   Json?

  @@index([jobId, createdAt])
}

model JobHold {
  id        String        @id @default(cuid())
  createdAt DateTime      @default(now())
  status    JobHoldStatus @default(ACTIVE)

  jobId String
  job   Job    @relation(fields: [jobId], references: [id])

  reason JobHoldReason
  notes  String?

  // Optional traceability: ties holds created for dispute enforcement back to a DisputeCase.
  sourceDisputeCaseId String?
  sourceDisputeCase   DisputeCase? @relation(fields: [sourceDisputeCaseId], references: [id])

  // If funds have already been credited, holds can move money to HELD bucket.
  amountCents Int?
  currency    CurrencyCode?

  appliedAt  DateTime  @default(now())
  releasedAt DateTime?

  appliedByUserId String?
  appliedByUser   User?   @relation("JobHoldAppliedByUser", fields: [appliedByUserId], references: [id])

  appliedByAdminUserId String?    @db.Uuid
  appliedByAdminUser   AdminUser? @relation("JobHoldAppliedByAdminUser", fields: [appliedByAdminUserId], references: [id])

  releasedByUserId String?
  releasedByUser   User?   @relation("JobHoldReleasedByUser", fields: [releasedByUserId], references: [id])

  releasedByAdminUserId String?    @db.Uuid
  releasedByAdminUser   AdminUser? @relation("JobHoldReleasedByAdminUser", fields: [releasedByAdminUserId], references: [id])

  @@index([jobId, status, createdAt])
}

model PayoutMethod {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  userId String
  user   User   @relation(fields: [userId], references: [id])

  currency CurrencyCode
  provider PayoutProvider
  isActive Boolean        @default(true)

  // Provider-specific config (no secrets stored here; identifiers only)
  details Json

  @@index([userId, currency, isActive])
}

model JobAssignment {
  id     String              @id @default(cuid())
  status JobAssignmentStatus @default(ASSIGNED)

  jobId String @unique
  job   Job    @relation(fields: [jobId], references: [id])

  contractorId String
  contractor   Contractor @relation(fields: [contractorId], references: [id])

  assignedByAdminUserId String
  assignedByAdmin       User   @relation("JobAssignmentAssignedByAdmin", fields: [assignedByAdminUserId], references: [id])

  createdAt   DateTime  @default(now())
  completedAt DateTime?
}

model CampaignRegion {
  id String @id @default(cuid())

  country      CountryCode
  regionCode   String
  regionName   String
  campaignWeek CampaignWeek
  phase        CampaignPhase

  active Boolean @default(true)
  paused Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  contacts        OutreachContact[]
  regionEmailLogs RegionEmailLog[]

  @@unique([country, regionCode, campaignWeek, phase])
  @@map("campaign_regions")
}

model EmailIdentity {
  id String @id @default(cuid())

  // Hard constraint: only these 6 keys are used across the system.
  // Other rows (if any) must be inactive/paused and are ignored by all v1.x logic.
  key EmailIdentityKey? @unique

  address     String @unique
  displayName String

  // Hard cap (Google Workspace per-inbox daily guidance is ~900).
  dailyLimit Int @default(900)

  // Per 3-hour window cap (admin-configurable).
  intervalLimit Int @default(120)

  // 0.1 -> 1.0 (warm up slowly, human-like). Effective limits are multiplied by this factor.
  warmupFactor Float @default(1.0)

  active Boolean @default(true)
  paused Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  suggestedDrafts EmailDraft[]     @relation("EmailDraftSuggestedIdentity")
  sendQueue       SendQueue[]
  counters        SendCounter[]
  regionEmailLogs RegionEmailLog[]

  @@map("email_identities")
}

model OutreachContact {
  id String @id @default(cuid())

  name  String?
  email String

  jobType        String?
  sourcePlatform String
  sourceUrl      String

  regionId String
  region   CampaignRegion @relation(fields: [regionId], references: [id])

  phase  CampaignPhase
  status ContactStatus @default(NEW)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  drafts EmailDraft[]

  @@unique([email, phase])
  @@index([regionId, status, createdAt])
  @@map("contacts")
}

model EmailDraft {
  id String @id @default(cuid())

  contactId String
  contact   OutreachContact @relation(fields: [contactId], references: [id])

  subject String
  body    String

  // Operational labeling for downstream audit (region logs) and filtering.
  emailLabel EmailLabel @default(JOB_POSTER_OUTREACH)

  generatedBy   String  @default("gpt-5.1-mini")
  // Hardening: when OPEN_AI_API_KEY is missing we generate a placeholder.
  // Approval requires explicit admin confirmation.
  isPlaceholder Boolean @default(false)

  suggestedIdentityId String?
  suggestedIdentity   EmailIdentity? @relation("EmailDraftSuggestedIdentity", fields: [suggestedIdentityId], references: [id])

  approved              Boolean    @default(false)
  approvedByAdminUserId String?    @db.Uuid
  approvedByAdminUser   AdminUser? @relation(fields: [approvedByAdminUserId], references: [id])
  approvedAt            DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  sendQueue SendQueue[]

  @@index([approved, createdAt])
  @@map("email_drafts")
}

model RegionEmailLog {
  id String @id @default(cuid())

  regionId String
  region   CampaignRegion @relation(fields: [regionId], references: [id])

  // Snapshot fields (immutable): required for operational audits even if region config changes later.
  country    CountryCode
  regionCode String
  regionName String

  emailIdentityId String
  emailIdentity   EmailIdentity @relation(fields: [emailIdentityId], references: [id])

  // Denormalized for easy ops filtering + "one of the 6 inboxes" visibility.
  emailIdentityAddress String

  emailLabel EmailLabel
  quantity   Int        @default(1)
  sentAt     DateTime

  @@index([regionId, sentAt])
  @@index([emailIdentityId, sentAt])
  @@index([emailLabel, sentAt])
  @@map("region_email_logs")
}

model SendQueue {
  id String @id @default(cuid())

  emailDraftId String
  emailDraft   EmailDraft @relation(fields: [emailDraftId], references: [id])

  emailIdentityId String
  emailIdentity   EmailIdentity @relation(fields: [emailIdentityId], references: [id])

  scheduledFor DateTime
  sentAt       DateTime?

  status        SendQueueStatus    @default(QUEUED)
  blockedReason SendBlockedReason?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([emailDraftId])
  @@index([status, scheduledFor])
  @@index([emailIdentityId, status, scheduledFor])
  @@map("send_queue")
}

model SendCounter {
  id String @id @default(cuid())

  emailIdentityId String
  emailIdentity   EmailIdentity @relation(fields: [emailIdentityId], references: [id])

  // Date (UTC midnight); one row per identity/day.
  date DateTime

  sentToday      Int       @default(0)
  sentLast3Hours Int       @default(0)
  lastSentAt     DateTime?

  updatedAt DateTime @updatedAt

  @@unique([emailIdentityId, date])
  @@index([date])
  @@map("send_counters")
}

model AgentMissionTemplate {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  platform AgentPlatform
  country  CountryCode
  intent   AgentIntent

  name            String
  categoryPaths   String[]
  keywordFilters  String[]
  excludeKeywords String[]

  maxResults             Int
  defaultTimeWindowHours Int
  requiresHumanSession   Boolean @default(false)
  enabled                Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  scheduledRuns    AgentScheduledRun[]
  discoveryBatches DiscoveryBatch[]

  @@map("agent_mission_templates")
}

model AgentSchedulePlan {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  startDate DateTime
  endDate   DateTime

  generatedBy AgentScheduleGeneratedBy
  status      AgentSchedulePlanStatus  @default(DRAFT)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  runs AgentScheduledRun[]

  @@index([status, startDate, endDate])
  @@map("agent_schedule_plans")
}

model AgentScheduledRun {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  schedulePlanId String            @db.Uuid
  schedulePlan   AgentSchedulePlan @relation(fields: [schedulePlanId], references: [id])

  runAt DateTime

  templateId String               @db.Uuid
  template   AgentMissionTemplate @relation(fields: [templateId], references: [id])

  regionLabel          String
  requiresHumanSession Boolean @default(false)

  status AgentScheduledRunStatus @default(SCHEDULED)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  discoveryBatches DiscoveryBatch[]

  @@index([status, runAt])
  @@index([schedulePlanId, runAt])
  @@map("agent_scheduled_runs")
}

model DiscoveryBatch {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  scheduledRunId String            @db.Uuid
  scheduledRun   AgentScheduledRun @relation(fields: [scheduledRunId], references: [id])

  templateId String               @db.Uuid
  template   AgentMissionTemplate @relation(fields: [templateId], references: [id])

  createdAt DateTime @default(now())
  expiresAt DateTime

  items DiscoveryItem[]

  @@index([expiresAt])
  @@map("discovery_batches")
}

model DiscoveryItem {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  batchId String         @db.Uuid
  batch   DiscoveryBatch @relation(fields: [batchId], references: [id])

  title              String
  descriptionSnippet String
  locationText       String

  contactEmail   String?
  sourceUrl      String
  relevanceScore Float   @default(0)
  promoted       Boolean @default(false)

  createdAt DateTime @default(now())

  @@index([batchId, promoted, createdAt])
  @@map("discovery_items")
}

/**
 * LedgerEntry is append-only (no updates/deletes in app logic).
 * Wallet buckets are computed by summing credits/debits per bucket.
 */
model LedgerEntry {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())

  userId String
  user   User   @relation(fields: [userId], references: [id])

  jobId String?
  job   Job?    @relation(fields: [jobId], references: [id])

  type        LedgerEntryType
  direction   LedgerDirection
  bucket      LedgerBucket
  amountCents Int

  memo String?

  @@index([userId, createdAt])
  @@index([jobId])
}

model PayoutRequest {
  id        String              @id @default(cuid())
  createdAt DateTime            @default(now())
  status    PayoutRequestStatus @default(REQUESTED)

  userId String
  user   User   @relation(fields: [userId], references: [id])

  amountCents Int

  payoutId String? @unique
  payout   Payout? @relation("PayoutRequestToPayout", fields: [payoutId], references: [id])

  @@index([userId, status, createdAt])
}

model Payout {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())

  userId String?
  user   User?   @relation(fields: [userId], references: [id])

  status       PayoutStatus    @default(PENDING)
  currency     CurrencyCode?
  provider     PayoutProvider?
  amountCents  Int?
  scheduledFor DateTime?

  paidAt            DateTime?
  externalReference String?
  notesInternal     String?
  failureReason     String?

  request PayoutRequest? @relation("PayoutRequestToPayout")
}

model AuditLog {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())

  actorUserId String?
  actor       User?   @relation("AuditLogActor", fields: [actorUserId], references: [id])

  actorAdminUserId String?    @db.Uuid
  actorAdminUser   AdminUser? @relation("AuditLogActorAdminUser", fields: [actorAdminUserId], references: [id])

  action     String
  entityType String
  entityId   String
  metadata   Json?

  @@index([entityType, entityId, createdAt])
}

// Minimal key/value store for global system settings (admin-controlled; additive).
model SystemSetting {
  key       String   @id
  value     Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("system_settings")
}

model AdminUser {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email        String   @unique
  passwordHash String
  role         String   @default("ADMIN")
  createdAt    DateTime @default(now())

  auditLogsAuthored AuditLog[] @relation("AuditLogActorAdminUser")
  jobHoldsApplied   JobHold[]  @relation("JobHoldAppliedByAdminUser")
  jobHoldsReleased  JobHold[]  @relation("JobHoldReleasedByAdminUser")

  emailDraftsApproved EmailDraft[]
}

model AdminInvite {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email     String
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([email, expiresAt])
}
```
