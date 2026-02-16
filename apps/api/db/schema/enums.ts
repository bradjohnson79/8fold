import { pgEnum } from "drizzle-orm/pg-core";

// NOTE: These enums mirror existing Postgres enum types created by Prisma.
// They are for typing / future reads only (no migrations in Phase 0.2).

export const userRoleEnum = pgEnum("UserRole", [
  "ADMIN",
  "CONTRACTOR",
  "ROUTER",
  "JOB_POSTER",
]);

export const userStatusEnum = pgEnum("UserStatus", ["ACTIVE", "SUSPENDED", "ARCHIVED", "PENDING"]);

// Contractor (inventory)
export const contractorStatusEnum = pgEnum("ContractorStatus", ["PENDING", "APPROVED", "REJECTED"]);
export const contractorTradeEnum = pgEnum("ContractorTrade", [
  "JUNK_REMOVAL",
  "YARDWORK_GROUNDSKEEPING",
  "CARPENTRY",
  "DRYWALL",
  "ROOFING",
  "PLUMBING",
  "ELECTRICAL",
  "WELDING",
]);

export const tradeCategoryEnum = pgEnum("TradeCategory", [
  "PLUMBING",
  "ELECTRICAL",
  "HVAC",
  "APPLIANCE",
  "HANDYMAN",
  "PAINTING",
  "CARPENTRY",
  "DRYWALL",
  "ROOFING",
  "JANITORIAL_CLEANING",
  "LANDSCAPING",
  "FENCING",
  "SNOW_REMOVAL",
  "JUNK_REMOVAL",
  "MOVING",
  "AUTOMOTIVE",
  "FURNITURE_ASSEMBLY",
]);

export const jobDraftStatusEnum = pgEnum("JobDraftStatus", [
  "DRAFT",
  "IN_REVIEW",
  "NEEDS_CLARIFICATION",
  "REJECTED",
  "APPROVED",
  "APPRAISING",
  "PRICED",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "CANCELLED",
]);

export const jobStatusEnum = pgEnum("JobStatus", [
  "DRAFT",
  "PUBLISHED",
  "ASSIGNED",
  "IN_PROGRESS",
  "CONTRACTOR_COMPLETED",
  "CUSTOMER_APPROVED",
  "CUSTOMER_REJECTED",
  "COMPLETION_FLAGGED",
  "COMPLETED_APPROVED",
  "OPEN_FOR_ROUTING",
  // NOTE: Added to Postgres via add-only ALTER TYPE on 2026-02-12.
  // Order must match Postgres enum sort order (added at end; no reordering allowed).
  "COMPLETED",
  // NOTE: Added to Postgres via add-only ALTER TYPE on 2026-02-14.
  "DISPUTED",
]);

export const publicJobStatusEnum = pgEnum("PublicJobStatus", ["OPEN", "IN_PROGRESS"]);

export const jobSourceEnum = pgEnum("JobSource", ["MOCK", "REAL", "AI_REGENERATED"]);

export const jobTypeEnum = pgEnum("JobType", ["urban", "regional"]);

export const routingStatusEnum = pgEnum("RoutingStatus", ["UNROUTED", "ROUTED_BY_ROUTER", "ROUTED_BY_ADMIN"]);

export const countryCodeEnum = pgEnum("CountryCode", ["CA", "US"]);

export const currencyCodeEnum = pgEnum("CurrencyCode", ["CAD", "USD"]);

// Stripe-backed payment + payout state (Job + PartsMaterialRequest)
export const paymentStatusEnum = pgEnum("PaymentStatus", [
  "UNPAID",
  "REQUIRES_ACTION",
  "FUNDED",
  "FAILED",
  "REFUNDED",
]);

// Avoid name collision with existing Postgres enum "PayoutStatus" (PENDING/PAID/FAILED).
export const jobPayoutStatusEnum = pgEnum("JobPayoutStatus", ["NOT_READY", "READY", "RELEASED", "FAILED"]);

export const partsMaterialReleaseStatusEnum = pgEnum("PartsMaterialReleaseStatus", [
  "NOT_READY",
  "READY",
  "RELEASED",
  "FAILED",
]);

// Ledger (wallet + bank-ledger hardening)
// NOTE: Postgres enum is authoritative. Values must be add-only in Postgres.
export const ledgerDirectionEnum = pgEnum("LedgerDirection", ["CREDIT", "DEBIT"]);
export const ledgerBucketEnum = pgEnum("LedgerBucket", ["PENDING", "AVAILABLE", "PAID", "HELD"]);
export const ledgerEntryTypeEnum = pgEnum("LedgerEntryType", [
  // Existing values
  "ROUTER_EARNING",
  "BROKER_FEE",
  "PAYOUT",
  "ADJUSTMENT",
  // Bank-ledger values (added in 0008)
  "ESCROW_FUND",
  "PNM_FUND",
  "ESCROW_RELEASE",
  "ESCROW_REFUND",
  "PLATFORM_FEE",
  "ROUTER_EARN",
  "CONTRACTOR_EARN",
]);

// Escrow + parts/materials (bank-ledger foundations; added in 0008)
export const escrowKindEnum = pgEnum("EscrowKind", ["JOB_ESCROW", "PARTS_MATERIALS"]);
export const escrowStatusEnum = pgEnum("EscrowStatus", ["PENDING", "FUNDED", "RELEASED", "REFUNDED", "FAILED"]);
export const partsMaterialStatusEnum = pgEnum("PartsMaterialStatus", [
  "REQUESTED",
  "APPROVED",
  "PAID",
  "REJECTED",
  "CANCELLED",
]);

export const routerStatusEnum = pgEnum("RouterStatus", ["ACTIVE", "SUSPENDED"]);

export const payoutProviderEnum = pgEnum("PayoutProvider", ["STRIPE", "PAYPAL", "WISE"]);
export const payoutRequestStatusEnum = pgEnum("PayoutRequestStatus", [
  "REQUESTED",
  "REJECTED",
  "PAID",
  "CANCELLED",
]);
export const payoutStatusEnum = pgEnum("PayoutStatus", ["PENDING", "PAID", "FAILED"]);

export const contractorPayoutStatusEnum = pgEnum("ContractorPayoutStatus", ["PENDING", "PAID", "FAILED"]);
export const contractorLedgerEntryTypeEnum = pgEnum("ContractorLedgerEntryType", [
  "CONTRACTOR_EARNING",
  "CONTRACTOR_PAYOUT",
]);
export const contractorLedgerBucketEnum = pgEnum("ContractorLedgerBucket", ["PENDING", "PAID"]);

export const materialsEscrowLedgerEntryTypeEnum = pgEnum("MaterialsEscrowLedgerEntryType", [
  "DEPOSIT",
  "RELEASE",
  "POSTER_CREDIT",
  "POSTER_REFUND",
]);

export const monitoringEventTypeEnum = pgEnum("MonitoringEventType", [
  "JOB_APPROACHING_24H",
  "JOB_OVERDUE_UNROUTED",
  "JOB_ROUTED",
  "JOB_COMPLETED",
]);
export const monitoringActorRoleEnum = pgEnum("MonitoringActorRole", [
  "ADMIN",
  "ROUTER",
  "CONTRACTOR",
  "JOB_POSTER",
]);

export const customerRejectReasonEnum = pgEnum("CustomerRejectReason", [
  "QUALITY_ISSUE",
  "INCOMPLETE_WORK",
  "DAMAGE",
  "NO_SHOW",
  "OTHER",
]);

export const ecdUpdateReasonEnum = pgEnum("EcdUpdateReason", [
  "AWAITING_PARTS_MATERIALS",
  "SCOPE_EXPANDED",
  "SCHEDULING_DELAY",
  "OTHER",
]);

export const aiAppraisalStatusEnum = pgEnum("AiAppraisalStatus", [
  "PENDING",
  "COMPLETED",
  "FAILED",
  "APPLIED",
  "SUPERSEDED",
]);

export const supportTicketTypeEnum = pgEnum("SupportTicketType", ["HELP", "DISPUTE"]);
export const supportTicketStatusEnum = pgEnum("SupportTicketStatus", ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]);
export const supportTicketCategoryEnum = pgEnum("SupportTicketCategory", [
  "PRICING",
  "JOB_POSTING",
  "ROUTING",
  "CONTRACTOR",
  "PAYOUTS",
  "OTHER",
]);
export const supportTicketPriorityEnum = pgEnum("SupportTicketPriority", ["LOW", "NORMAL", "HIGH"]);
export const supportRoleContextEnum = pgEnum("SupportRoleContext", ["JOB_POSTER", "ROUTER", "CONTRACTOR"]);

export const disputeStatusEnum = pgEnum("DisputeStatus", [
  "SUBMITTED",
  "UNDER_REVIEW",
  "NEEDS_INFO",
  "DECIDED",
  "CLOSED",
]);
export const disputeReasonEnum = pgEnum("DisputeReason", [
  "PRICING",
  "WORK_QUALITY",
  "NO_SHOW",
  "PAYMENT",
  "OTHER",
]);
export const disputeAgainstRoleEnum = pgEnum("DisputeAgainstRole", ["JOB_POSTER", "CONTRACTOR"]);
export const disputeDecisionEnum = pgEnum("DisputeDecision", [
  "FAVOR_POSTER",
  "FAVOR_CONTRACTOR",
  "PARTIAL",
  "NO_ACTION",
  "FAVOR_JOB_POSTER",
]);
export const disputeEnforcementActionTypeEnum = pgEnum("DisputeEnforcementActionType", [
  "RELEASE_ESCROW_FULL",
  "WITHHOLD_FUNDS",
  "RELEASE_ESCROW_PARTIAL",
  "FLAG_ACCOUNT_INTERNAL",
]);

export const disputeEnforcementActionStatusEnum = pgEnum("DisputeEnforcementActionStatus", [
  "PENDING",
  "EXECUTED",
  "FAILED",
  "CANCELLED",
]);

export const disputeAlertTypeEnum = pgEnum("DisputeAlertType", ["DEADLINE_BREACHED"]);

export const internalAccountFlagTypeEnum = pgEnum("InternalAccountFlagType", [
  "DISPUTE_RISK",
  "FRAUD_REVIEW",
  "MANUAL_REVIEW",
]);

export const jobHoldStatusEnum = pgEnum("JobHoldStatus", ["ACTIVE", "RELEASED"]);
export const jobHoldReasonEnum = pgEnum("JobHoldReason", [
  "DISPUTE",
  "QUALITY_ISSUE",
  "FRAUD_REVIEW",
  "MANUAL_REVIEW",
]);

export const materialsEscrowStatusEnum = pgEnum("MaterialsEscrowStatus", ["HELD", "RELEASED"]);
export const materialsPaymentStatusEnum = pgEnum("MaterialsPaymentStatus", [
  "PENDING",
  "CAPTURED",
  "FAILED",
  "REFUNDED",
]);
export const materialsReceiptStatusEnum = pgEnum("MaterialsReceiptStatus", ["DRAFT", "SUBMITTED"]);
export const materialsRequestStatusEnum = pgEnum("MaterialsRequestStatus", [
  "SUBMITTED",
  "APPROVED",
  "DECLINED",
  "ESCROWED",
  "RECEIPTS_SUBMITTED",
  "REIMBURSED",
]);

export const rolePayoutMethodEnum = pgEnum("RolePayoutMethod", ["STRIPE", "PAYPAL"]);
export const rolePayoutStatusEnum = pgEnum("RolePayoutStatus", ["UNSET", "PENDING", "ACTIVE"]);

// AI email (send queue / counters)
export const sendQueueStatusEnum = pgEnum("SendQueueStatus", ["QUEUED", "SENT", "FAILED", "BLOCKED"]);
export const sendBlockedReasonEnum = pgEnum("SendBlockedReason", [
  "REGION_PAUSED",
  "IDENTITY_PAUSED",
  "DAILY_LIMIT_EXCEEDED",
  "INTERVAL_LIMIT_EXCEEDED",
]);

