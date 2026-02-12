## POSTGRES ENUM SNAPSHOT (8fold_test) — 2026-02-12

Timestamp: `2026-02-12T21:22:42.967Z`

### Query

```sql
SELECT typname, enumlabel
FROM pg_enum
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
JOIN pg_namespace n ON n.oid = pg_type.typnamespace
WHERE n.nspname = '8fold_test'
ORDER BY typname, enumsortorder;
```

### Output (ordered)

```json
[
  {
    "typname": "AddressVerificationStatus",
    "enumlabel": "PENDING"
  },
  {
    "typname": "AddressVerificationStatus",
    "enumlabel": "VERIFIED"
  },
  {
    "typname": "AddressVerificationStatus",
    "enumlabel": "ADDRESS_MISMATCH"
  },
  {
    "typname": "AgentIntent",
    "enumlabel": "JOB_POSTER"
  },
  {
    "typname": "AgentIntent",
    "enumlabel": "CONTRACTOR"
  },
  {
    "typname": "AgentPlatform",
    "enumlabel": "CRAIGSLIST"
  },
  {
    "typname": "AgentPlatform",
    "enumlabel": "KIJIJI"
  },
  {
    "typname": "AgentPlatform",
    "enumlabel": "NEXTDOOR"
  },
  {
    "typname": "AgentScheduleGeneratedBy",
    "enumlabel": "GPT_5_1_MINI"
  },
  {
    "typname": "AgentScheduleGeneratedBy",
    "enumlabel": "ADMIN"
  },
  {
    "typname": "AgentSchedulePlanStatus",
    "enumlabel": "DRAFT"
  },
  {
    "typname": "AgentSchedulePlanStatus",
    "enumlabel": "APPROVED"
  },
  {
    "typname": "AgentSchedulePlanStatus",
    "enumlabel": "ACTIVE"
  },
  {
    "typname": "AgentSchedulePlanStatus",
    "enumlabel": "ARCHIVED"
  },
  {
    "typname": "AgentScheduledRunStatus",
    "enumlabel": "SCHEDULED"
  },
  {
    "typname": "AgentScheduledRunStatus",
    "enumlabel": "RUNNING"
  },
  {
    "typname": "AgentScheduledRunStatus",
    "enumlabel": "COMPLETE"
  },
  {
    "typname": "AgentScheduledRunStatus",
    "enumlabel": "SKIPPED"
  },
  {
    "typname": "AgentScheduledRunStatus",
    "enumlabel": "WAITING_FOR_ADMIN"
  },
  {
    "typname": "AiAppraisalStatus",
    "enumlabel": "PENDING"
  },
  {
    "typname": "AiAppraisalStatus",
    "enumlabel": "COMPLETED"
  },
  {
    "typname": "AiAppraisalStatus",
    "enumlabel": "FAILED"
  },
  {
    "typname": "AiAppraisalStatus",
    "enumlabel": "APPLIED"
  },
  {
    "typname": "AiAppraisalStatus",
    "enumlabel": "SUPERSEDED"
  },
  {
    "typname": "BulkAiJobStatus",
    "enumlabel": "PENDING"
  },
  {
    "typname": "BulkAiJobStatus",
    "enumlabel": "RUNNING"
  },
  {
    "typname": "BulkAiJobStatus",
    "enumlabel": "COMPLETED"
  },
  {
    "typname": "BulkAiJobStatus",
    "enumlabel": "FAILED"
  },
  {
    "typname": "BulkAiJobStatus",
    "enumlabel": "CANCELLED"
  },
  {
    "typname": "CampaignPhase",
    "enumlabel": "PHASE_1_JOB_POSTER"
  },
  {
    "typname": "CampaignWeek",
    "enumlabel": "WEEK_1"
  },
  {
    "typname": "CampaignWeek",
    "enumlabel": "WEEK_2"
  },
  {
    "typname": "ContactStatus",
    "enumlabel": "NEW"
  },
  {
    "typname": "ContactStatus",
    "enumlabel": "DRAFTED"
  },
  {
    "typname": "ContactStatus",
    "enumlabel": "APPROVED"
  },
  {
    "typname": "ContactStatus",
    "enumlabel": "SENT"
  },
  {
    "typname": "ContactStatus",
    "enumlabel": "SKIPPED"
  },
  {
    "typname": "ContractorLedgerBucket",
    "enumlabel": "PENDING"
  },
  {
    "typname": "ContractorLedgerBucket",
    "enumlabel": "PAID"
  },
  {
    "typname": "ContractorLedgerEntryType",
    "enumlabel": "CONTRACTOR_EARNING"
  },
  {
    "typname": "ContractorLedgerEntryType",
    "enumlabel": "CONTRACTOR_PAYOUT"
  },
  {
    "typname": "ContractorOnboardingStatus",
    "enumlabel": "INCOMPLETE"
  },
  {
    "typname": "ContractorOnboardingStatus",
    "enumlabel": "ON_HOLD"
  },
  {
    "typname": "ContractorOnboardingStatus",
    "enumlabel": "ACTIVE"
  },
  {
    "typname": "ContractorPayoutStatus",
    "enumlabel": "PENDING"
  },
  {
    "typname": "ContractorPayoutStatus",
    "enumlabel": "PAID"
  },
  {
    "typname": "ContractorPayoutStatus",
    "enumlabel": "FAILED"
  },
  {
    "typname": "ContractorStatus",
    "enumlabel": "PENDING"
  },
  {
    "typname": "ContractorStatus",
    "enumlabel": "APPROVED"
  },
  {
    "typname": "ContractorStatus",
    "enumlabel": "REJECTED"
  },
  {
    "typname": "ContractorTrade",
    "enumlabel": "JUNK_REMOVAL"
  },
  {
    "typname": "ContractorTrade",
    "enumlabel": "YARDWORK_GROUNDSKEEPING"
  },
  {
    "typname": "ContractorTrade",
    "enumlabel": "CARPENTRY"
  },
  {
    "typname": "ContractorTrade",
    "enumlabel": "DRYWALL"
  },
  {
    "typname": "ContractorTrade",
    "enumlabel": "ROOFING"
  },
  {
    "typname": "ContractorTrade",
    "enumlabel": "PLUMBING"
  },
  {
    "typname": "ContractorTrade",
    "enumlabel": "ELECTRICAL"
  },
  {
    "typname": "ContractorTrade",
    "enumlabel": "WELDING"
  },
  {
    "typname": "ContractorWizardStep",
    "enumlabel": "WAIVER"
  },
  {
    "typname": "ContractorWizardStep",
    "enumlabel": "PROFILE"
  },
  {
    "typname": "ContractorWizardStep",
    "enumlabel": "ADDRESS_VERIFICATION"
  },
  {
    "typname": "ContractorWizardStep",
    "enumlabel": "TRADE_EXPERIENCE"
  },
  {
    "typname": "ContractorWizardStep",
    "enumlabel": "PAYOUT_SETUP"
  },
  {
    "typname": "ContractorWizardStep",
    "enumlabel": "STATUS_RESOLUTION"
  },
  {
    "typname": "CountryCode",
    "enumlabel": "CA"
  },
  {
    "typname": "CountryCode",
    "enumlabel": "US"
  },
  {
    "typname": "CurrencyCode",
    "enumlabel": "CAD"
  },
  {
    "typname": "CurrencyCode",
    "enumlabel": "USD"
  },
  {
    "typname": "CustomerRejectReason",
    "enumlabel": "QUALITY_ISSUE"
  },
  {
    "typname": "CustomerRejectReason",
    "enumlabel": "INCOMPLETE_WORK"
  },
  {
    "typname": "CustomerRejectReason",
    "enumlabel": "DAMAGE"
  },
  {
    "typname": "CustomerRejectReason",
    "enumlabel": "NO_SHOW"
  },
  {
    "typname": "CustomerRejectReason",
    "enumlabel": "OTHER"
  },
  {
    "typname": "DisputeAgainstRole",
    "enumlabel": "JOB_POSTER"
  },
  {
    "typname": "DisputeAgainstRole",
    "enumlabel": "CONTRACTOR"
  },
  {
    "typname": "DisputeAlertType",
    "enumlabel": "DEADLINE_BREACHED"
  },
  {
    "typname": "DisputeDecision",
    "enumlabel": "FAVOR_POSTER"
  },
  {
    "typname": "DisputeDecision",
    "enumlabel": "FAVOR_CONTRACTOR"
  },
  {
    "typname": "DisputeDecision",
    "enumlabel": "PARTIAL"
  },
  {
    "typname": "DisputeDecision",
    "enumlabel": "NO_ACTION"
  },
  {
    "typname": "DisputeDecision",
    "enumlabel": "FAVOR_JOB_POSTER"
  },
  {
    "typname": "DisputeEnforcementActionStatus",
    "enumlabel": "PENDING"
  },
  {
    "typname": "DisputeEnforcementActionStatus",
    "enumlabel": "EXECUTED"
  },
  {
    "typname": "DisputeEnforcementActionStatus",
    "enumlabel": "FAILED"
  },
  {
    "typname": "DisputeEnforcementActionStatus",
    "enumlabel": "CANCELLED"
  },
  {
    "typname": "DisputeEnforcementActionType",
    "enumlabel": "RELEASE_ESCROW_FULL"
  },
  {
    "typname": "DisputeEnforcementActionType",
    "enumlabel": "WITHHOLD_FUNDS"
  },
  {
    "typname": "DisputeEnforcementActionType",
    "enumlabel": "RELEASE_ESCROW_PARTIAL"
  },
  {
    "typname": "DisputeEnforcementActionType",
    "enumlabel": "FLAG_ACCOUNT_INTERNAL"
  },
  {
    "typname": "DisputeReason",
    "enumlabel": "PRICING"
  },
  {
    "typname": "DisputeReason",
    "enumlabel": "WORK_QUALITY"
  },
  {
    "typname": "DisputeReason",
    "enumlabel": "NO_SHOW"
  },
  {
    "typname": "DisputeReason",
    "enumlabel": "PAYMENT"
  },
  {
    "typname": "DisputeReason",
    "enumlabel": "OTHER"
  },
  {
    "typname": "DisputeStatus",
    "enumlabel": "SUBMITTED"
  },
  {
    "typname": "DisputeStatus",
    "enumlabel": "UNDER_REVIEW"
  },
  {
    "typname": "DisputeStatus",
    "enumlabel": "NEEDS_INFO"
  },
  {
    "typname": "DisputeStatus",
    "enumlabel": "DECIDED"
  },
  {
    "typname": "DisputeStatus",
    "enumlabel": "CLOSED"
  },
  {
    "typname": "EcdUpdateReason",
    "enumlabel": "AWAITING_PARTS_MATERIALS"
  },
  {
    "typname": "EcdUpdateReason",
    "enumlabel": "SCOPE_EXPANDED"
  },
  {
    "typname": "EcdUpdateReason",
    "enumlabel": "SCHEDULING_DELAY"
  },
  {
    "typname": "EcdUpdateReason",
    "enumlabel": "OTHER"
  },
  {
    "typname": "EmailIdentityKey",
    "enumlabel": "HELLO"
  },
  {
    "typname": "EmailIdentityKey",
    "enumlabel": "OUTREACH"
  },
  {
    "typname": "EmailIdentityKey",
    "enumlabel": "LOCAL"
  },
  {
    "typname": "EmailIdentityKey",
    "enumlabel": "CONNECT"
  },
  {
    "typname": "EmailIdentityKey",
    "enumlabel": "SUPPORT"
  },
  {
    "typname": "EmailIdentityKey",
    "enumlabel": "PARTNERSHIPS"
  },
  {
    "typname": "EmailLabel",
    "enumlabel": "JOB_POSTER_OUTREACH"
  },
  {
    "typname": "EmailLabel",
    "enumlabel": "CONTRACTOR_OUTREACH"
  },
  {
    "typname": "EmailLabel",
    "enumlabel": "ROUTER_OUTREACH"
  },
  {
    "typname": "InternalAccountFlagType",
    "enumlabel": "DISPUTE_RISK"
  },
  {
    "typname": "InternalAccountFlagType",
    "enumlabel": "FRAUD_REVIEW"
  },
  {
    "typname": "InternalAccountFlagType",
    "enumlabel": "MANUAL_REVIEW"
  },
  {
    "typname": "JobAssignmentStatus",
    "enumlabel": "ASSIGNED"
  },
  {
    "typname": "JobAssignmentStatus",
    "enumlabel": "COMPLETED"
  },
  {
    "typname": "JobAssignmentStatus",
    "enumlabel": "CANCELLED"
  },
  {
    "typname": "JobDispatchStatus",
    "enumlabel": "PENDING"
  },
  {
    "typname": "JobDispatchStatus",
    "enumlabel": "ACCEPTED"
  },
  {
    "typname": "JobDispatchStatus",
    "enumlabel": "DECLINED"
  },
  {
    "typname": "JobDispatchStatus",
    "enumlabel": "EXPIRED"
  },
  {
    "typname": "JobDraftStatus",
    "enumlabel": "DRAFT"
  },
  {
    "typname": "JobDraftStatus",
    "enumlabel": "IN_REVIEW"
  },
  {
    "typname": "JobDraftStatus",
    "enumlabel": "NEEDS_CLARIFICATION"
  },
  {
    "typname": "JobDraftStatus",
    "enumlabel": "REJECTED"
  },
  {
    "typname": "JobDraftStatus",
    "enumlabel": "APPROVED"
  },
  {
    "typname": "JobDraftStatus",
    "enumlabel": "APPRAISING"
  },
  {
    "typname": "JobDraftStatus",
    "enumlabel": "PRICED"
  },
  {
    "typname": "JobDraftStatus",
    "enumlabel": "PAYMENT_PENDING"
  },
  {
    "typname": "JobDraftStatus",
    "enumlabel": "PAYMENT_FAILED"
  },
  {
    "typname": "JobDraftStatus",
    "enumlabel": "CANCELLED"
  },
  {
    "typname": "JobHoldReason",
    "enumlabel": "DISPUTE"
  },
  {
    "typname": "JobHoldReason",
    "enumlabel": "QUALITY_ISSUE"
  },
  {
    "typname": "JobHoldReason",
    "enumlabel": "FRAUD_REVIEW"
  },
  {
    "typname": "JobHoldReason",
    "enumlabel": "MANUAL_REVIEW"
  },
  {
    "typname": "JobHoldStatus",
    "enumlabel": "ACTIVE"
  },
  {
    "typname": "JobHoldStatus",
    "enumlabel": "RELEASED"
  },
  {
    "typname": "JobPhotoActor",
    "enumlabel": "CUSTOMER"
  },
  {
    "typname": "JobPhotoActor",
    "enumlabel": "CONTRACTOR"
  },
  {
    "typname": "JobPhotoKind",
    "enumlabel": "CUSTOMER_SCOPE"
  },
  {
    "typname": "JobPhotoKind",
    "enumlabel": "CONTRACTOR_COMPLETION"
  },
  {
    "typname": "JobSource",
    "enumlabel": "MOCK"
  },
  {
    "typname": "JobSource",
    "enumlabel": "REAL"
  },
  {
    "typname": "JobSource",
    "enumlabel": "AI_REGENERATED"
  },
  {
    "typname": "JobStatus",
    "enumlabel": "DRAFT"
  },
  {
    "typname": "JobStatus",
    "enumlabel": "PUBLISHED"
  },
  {
    "typname": "JobStatus",
    "enumlabel": "ASSIGNED"
  },
  {
    "typname": "JobStatus",
    "enumlabel": "IN_PROGRESS"
  },
  {
    "typname": "JobStatus",
    "enumlabel": "CONTRACTOR_COMPLETED"
  },
  {
    "typname": "JobStatus",
    "enumlabel": "CUSTOMER_APPROVED"
  },
  {
    "typname": "JobStatus",
    "enumlabel": "CUSTOMER_REJECTED"
  },
  {
    "typname": "JobStatus",
    "enumlabel": "COMPLETION_FLAGGED"
  },
  {
    "typname": "JobStatus",
    "enumlabel": "COMPLETED_APPROVED"
  },
  {
    "typname": "JobStatus",
    "enumlabel": "OPEN_FOR_ROUTING"
  },
  {
    "typname": "JobType",
    "enumlabel": "urban"
  },
  {
    "typname": "JobType",
    "enumlabel": "regional"
  },
  {
    "typname": "LedgerBucket",
    "enumlabel": "PENDING"
  },
  {
    "typname": "LedgerBucket",
    "enumlabel": "AVAILABLE"
  },
  {
    "typname": "LedgerBucket",
    "enumlabel": "PAID"
  },
  {
    "typname": "LedgerBucket",
    "enumlabel": "HELD"
  },
  {
    "typname": "LedgerDirection",
    "enumlabel": "CREDIT"
  },
  {
    "typname": "LedgerDirection",
    "enumlabel": "DEBIT"
  },
  {
    "typname": "LedgerEntryType",
    "enumlabel": "ROUTER_EARNING"
  },
  {
    "typname": "LedgerEntryType",
    "enumlabel": "BROKER_FEE"
  },
  {
    "typname": "LedgerEntryType",
    "enumlabel": "PAYOUT"
  },
  {
    "typname": "LedgerEntryType",
    "enumlabel": "ADJUSTMENT"
  },
  {
    "typname": "MaterialsEscrowLedgerEntryType",
    "enumlabel": "DEPOSIT"
  },
  {
    "typname": "MaterialsEscrowLedgerEntryType",
    "enumlabel": "RELEASE"
  },
  {
    "typname": "MaterialsEscrowLedgerEntryType",
    "enumlabel": "POSTER_CREDIT"
  },
  {
    "typname": "MaterialsEscrowLedgerEntryType",
    "enumlabel": "POSTER_REFUND"
  },
  {
    "typname": "MaterialsEscrowStatus",
    "enumlabel": "HELD"
  },
  {
    "typname": "MaterialsEscrowStatus",
    "enumlabel": "RELEASED"
  },
  {
    "typname": "MaterialsPaymentStatus",
    "enumlabel": "PENDING"
  },
  {
    "typname": "MaterialsPaymentStatus",
    "enumlabel": "CAPTURED"
  },
  {
    "typname": "MaterialsPaymentStatus",
    "enumlabel": "FAILED"
  },
  {
    "typname": "MaterialsPaymentStatus",
    "enumlabel": "REFUNDED"
  },
  {
    "typname": "MaterialsReceiptStatus",
    "enumlabel": "DRAFT"
  },
  {
    "typname": "MaterialsReceiptStatus",
    "enumlabel": "SUBMITTED"
  },
  {
    "typname": "MaterialsRequestStatus",
    "enumlabel": "SUBMITTED"
  },
  {
    "typname": "MaterialsRequestStatus",
    "enumlabel": "APPROVED"
  },
  {
    "typname": "MaterialsRequestStatus",
    "enumlabel": "DECLINED"
  },
  {
    "typname": "MaterialsRequestStatus",
    "enumlabel": "ESCROWED"
  },
  {
    "typname": "MaterialsRequestStatus",
    "enumlabel": "RECEIPTS_SUBMITTED"
  },
  {
    "typname": "MaterialsRequestStatus",
    "enumlabel": "REIMBURSED"
  },
  {
    "typname": "MonitoringActorRole",
    "enumlabel": "ADMIN"
  },
  {
    "typname": "MonitoringActorRole",
    "enumlabel": "ROUTER"
  },
  {
    "typname": "MonitoringActorRole",
    "enumlabel": "CONTRACTOR"
  },
  {
    "typname": "MonitoringActorRole",
    "enumlabel": "JOB_POSTER"
  },
  {
    "typname": "MonitoringEventType",
    "enumlabel": "JOB_APPROACHING_24H"
  },
  {
    "typname": "MonitoringEventType",
    "enumlabel": "JOB_OVERDUE_UNROUTED"
  },
  {
    "typname": "MonitoringEventType",
    "enumlabel": "JOB_ROUTED"
  },
  {
    "typname": "MonitoringEventType",
    "enumlabel": "JOB_COMPLETED"
  },
  {
    "typname": "OnboardingRole",
    "enumlabel": "JOB_POSTER"
  },
  {
    "typname": "OnboardingRole",
    "enumlabel": "ROUTER"
  },
  {
    "typname": "OnboardingRole",
    "enumlabel": "CONTRACTOR"
  },
  {
    "typname": "PayoutProvider",
    "enumlabel": "STRIPE"
  },
  {
    "typname": "PayoutProvider",
    "enumlabel": "PAYPAL"
  },
  {
    "typname": "PayoutProvider",
    "enumlabel": "WISE"
  },
  {
    "typname": "PayoutRequestStatus",
    "enumlabel": "REQUESTED"
  },
  {
    "typname": "PayoutRequestStatus",
    "enumlabel": "REJECTED"
  },
  {
    "typname": "PayoutRequestStatus",
    "enumlabel": "PAID"
  },
  {
    "typname": "PayoutRequestStatus",
    "enumlabel": "CANCELLED"
  },
  {
    "typname": "PayoutStatus",
    "enumlabel": "PENDING"
  },
  {
    "typname": "PayoutStatus",
    "enumlabel": "PAID"
  },
  {
    "typname": "PayoutStatus",
    "enumlabel": "FAILED"
  },
  {
    "typname": "PublicJobStatus",
    "enumlabel": "OPEN"
  },
  {
    "typname": "PublicJobStatus",
    "enumlabel": "IN_PROGRESS"
  },
  {
    "typname": "RepeatContractorRequestStatus",
    "enumlabel": "REQUESTED"
  },
  {
    "typname": "RepeatContractorRequestStatus",
    "enumlabel": "ACCEPTED"
  },
  {
    "typname": "RepeatContractorRequestStatus",
    "enumlabel": "DECLINED"
  },
  {
    "typname": "RepeatContractorRequestStatus",
    "enumlabel": "CANCELLED"
  },
  {
    "typname": "RepeatContractorRequestStatus",
    "enumlabel": "EXPIRED"
  },
  {
    "typname": "RolePayoutMethod",
    "enumlabel": "STRIPE"
  },
  {
    "typname": "RolePayoutMethod",
    "enumlabel": "PAYPAL"
  },
  {
    "typname": "RolePayoutStatus",
    "enumlabel": "UNSET"
  },
  {
    "typname": "RolePayoutStatus",
    "enumlabel": "PENDING"
  },
  {
    "typname": "RolePayoutStatus",
    "enumlabel": "ACTIVE"
  },
  {
    "typname": "RoleProjectionStatus",
    "enumlabel": "ADMIN_PROJECTED"
  },
  {
    "typname": "RouterOnboardingStatus",
    "enumlabel": "INCOMPLETE"
  },
  {
    "typname": "RouterOnboardingStatus",
    "enumlabel": "SUBMITTED"
  },
  {
    "typname": "RouterOnboardingStatus",
    "enumlabel": "AI_APPROVED"
  },
  {
    "typname": "RouterOnboardingStatus",
    "enumlabel": "ACTIVE"
  },
  {
    "typname": "RouterStatus",
    "enumlabel": "ACTIVE"
  },
  {
    "typname": "RouterStatus",
    "enumlabel": "SUSPENDED"
  },
  {
    "typname": "RoutingStatus",
    "enumlabel": "UNROUTED"
  },
  {
    "typname": "RoutingStatus",
    "enumlabel": "ROUTED_BY_ROUTER"
  },
  {
    "typname": "RoutingStatus",
    "enumlabel": "ROUTED_BY_ADMIN"
  },
  {
    "typname": "SendBlockedReason",
    "enumlabel": "REGION_PAUSED"
  },
  {
    "typname": "SendBlockedReason",
    "enumlabel": "IDENTITY_PAUSED"
  },
  {
    "typname": "SendBlockedReason",
    "enumlabel": "DAILY_LIMIT_EXCEEDED"
  },
  {
    "typname": "SendBlockedReason",
    "enumlabel": "INTERVAL_LIMIT_EXCEEDED"
  },
  {
    "typname": "SendQueueStatus",
    "enumlabel": "QUEUED"
  },
  {
    "typname": "SendQueueStatus",
    "enumlabel": "SENT"
  },
  {
    "typname": "SendQueueStatus",
    "enumlabel": "FAILED"
  },
  {
    "typname": "SendQueueStatus",
    "enumlabel": "BLOCKED"
  },
  {
    "typname": "SupportRoleContext",
    "enumlabel": "JOB_POSTER"
  },
  {
    "typname": "SupportRoleContext",
    "enumlabel": "ROUTER"
  },
  {
    "typname": "SupportRoleContext",
    "enumlabel": "CONTRACTOR"
  },
  {
    "typname": "SupportTicketCategory",
    "enumlabel": "PRICING"
  },
  {
    "typname": "SupportTicketCategory",
    "enumlabel": "JOB_POSTING"
  },
  {
    "typname": "SupportTicketCategory",
    "enumlabel": "ROUTING"
  },
  {
    "typname": "SupportTicketCategory",
    "enumlabel": "CONTRACTOR"
  },
  {
    "typname": "SupportTicketCategory",
    "enumlabel": "PAYOUTS"
  },
  {
    "typname": "SupportTicketCategory",
    "enumlabel": "OTHER"
  },
  {
    "typname": "SupportTicketPriority",
    "enumlabel": "LOW"
  },
  {
    "typname": "SupportTicketPriority",
    "enumlabel": "NORMAL"
  },
  {
    "typname": "SupportTicketPriority",
    "enumlabel": "HIGH"
  },
  {
    "typname": "SupportTicketStatus",
    "enumlabel": "OPEN"
  },
  {
    "typname": "SupportTicketStatus",
    "enumlabel": "IN_PROGRESS"
  },
  {
    "typname": "SupportTicketStatus",
    "enumlabel": "RESOLVED"
  },
  {
    "typname": "SupportTicketStatus",
    "enumlabel": "CLOSED"
  },
  {
    "typname": "SupportTicketType",
    "enumlabel": "HELP"
  },
  {
    "typname": "SupportTicketType",
    "enumlabel": "DISPUTE"
  },
  {
    "typname": "TradeCategory",
    "enumlabel": "PLUMBING"
  },
  {
    "typname": "TradeCategory",
    "enumlabel": "ELECTRICAL"
  },
  {
    "typname": "TradeCategory",
    "enumlabel": "HVAC"
  },
  {
    "typname": "TradeCategory",
    "enumlabel": "APPLIANCE"
  },
  {
    "typname": "TradeCategory",
    "enumlabel": "HANDYMAN"
  },
  {
    "typname": "TradeCategory",
    "enumlabel": "PAINTING"
  },
  {
    "typname": "TradeCategory",
    "enumlabel": "CARPENTRY"
  },
  {
    "typname": "TradeCategory",
    "enumlabel": "DRYWALL"
  },
  {
    "typname": "TradeCategory",
    "enumlabel": "ROOFING"
  },
  {
    "typname": "TradeCategory",
    "enumlabel": "JANITORIAL_CLEANING"
  },
  {
    "typname": "TradeCategory",
    "enumlabel": "LANDSCAPING"
  },
  {
    "typname": "TradeCategory",
    "enumlabel": "FENCING"
  },
  {
    "typname": "TradeCategory",
    "enumlabel": "SNOW_REMOVAL"
  },
  {
    "typname": "TradeCategory",
    "enumlabel": "JUNK_REMOVAL"
  },
  {
    "typname": "TradeCategory",
    "enumlabel": "MOVING"
  },
  {
    "typname": "TradeCategory",
    "enumlabel": "AUTOMOTIVE"
  },
  {
    "typname": "TradeCategory",
    "enumlabel": "FURNITURE_ASSEMBLY"
  },
  {
    "typname": "UserRole",
    "enumlabel": "USER"
  },
  {
    "typname": "UserRole",
    "enumlabel": "ADMIN"
  },
  {
    "typname": "UserRole",
    "enumlabel": "CUSTOMER"
  },
  {
    "typname": "UserRole",
    "enumlabel": "CONTRACTOR"
  },
  {
    "typname": "UserRole",
    "enumlabel": "ROUTER"
  },
  {
    "typname": "UserRole",
    "enumlabel": "JOB_POSTER"
  },
  {
    "typname": "UserStatus",
    "enumlabel": "ACTIVE"
  },
  {
    "typname": "UserStatus",
    "enumlabel": "SUSPENDED"
  },
  {
    "typname": "UserStatus",
    "enumlabel": "PENDING"
  }
]
```
