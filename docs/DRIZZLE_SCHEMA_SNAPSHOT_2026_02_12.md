## DRIZZLE SCHEMA SNAPSHOT — 2026-02-12

Timestamp: `2026-02-12T21:22:53.441Z`

### Versions

- drizzle-orm (apps/api): `^0.45.1`
- drizzle-kit (root): `^0.31.9`

### DB connection config (verbatim)

File: `apps/api/db/drizzle.ts`

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

// Phase 0.1: Drizzle setup only.
// - Reads DATABASE_URL from env
// - Exports a db instance
// - Does not reference Prisma
// - Not used anywhere yet

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required for Drizzle (apps/api/db/drizzle.ts)");
}

// Prisma uses `?schema=...` in DATABASE_URL to set the Postgres schema (search_path).
// node-postgres ignores that param, so we set `search_path` after connect when present.
let searchPathSchema: string | null = null;
try {
  const u = new URL(connectionString);
  const s = u.searchParams.get("schema");
  searchPathSchema = s ? String(s).trim() : null;
} catch {
  // ignore (non-URL connection strings)
}

const { Pool } = pg;
const pool = new Pool({ connectionString });

if (searchPathSchema && /^[a-zA-Z0-9_]+$/.test(searchPathSchema)) {
  pool.on("connect", (client) => {
    // Neon pooled connections reject startup `options`, so we SET after connect.
    void client.query(`set search_path to "${searchPathSchema}"`);
  });
}

export const db = drizzle(pool);
```

### Schema sources (verbatim)

Files included:

```
apps/api/db/schema/_dbSchema.ts
apps/api/db/schema/adminRouterContext.ts
apps/api/db/schema/auditLog.ts
apps/api/db/schema/contractor.ts
apps/api/db/schema/contractorAccount.ts
apps/api/db/schema/contractorLedgerEntry.ts
apps/api/db/schema/contractorPayout.ts
apps/api/db/schema/conversation.ts
apps/api/db/schema/disputeAlert.ts
apps/api/db/schema/disputeCase.ts
apps/api/db/schema/disputeEnforcementAction.ts
apps/api/db/schema/enums.ts
apps/api/db/schema/index.ts
apps/api/db/schema/internalAccountFlag.ts
apps/api/db/schema/job.ts
apps/api/db/schema/jobAssignment.ts
apps/api/db/schema/jobDispatch.ts
apps/api/db/schema/jobDraft.ts
apps/api/db/schema/jobHold.ts
apps/api/db/schema/jobPayment.ts
apps/api/db/schema/jobPhoto.ts
apps/api/db/schema/jobPosterCredit.ts
apps/api/db/schema/jobPosterProfile.ts
apps/api/db/schema/ledgerEntry.ts
apps/api/db/schema/materialsEscrow.ts
apps/api/db/schema/materialsEscrowLedgerEntry.ts
apps/api/db/schema/materialsItem.ts
apps/api/db/schema/materialsPayment.ts
apps/api/db/schema/materialsReceiptFile.ts
apps/api/db/schema/materialsReceiptSubmission.ts
apps/api/db/schema/materialsRequest.ts
apps/api/db/schema/message.ts
apps/api/db/schema/monitoringEvent.ts
apps/api/db/schema/notificationDelivery.ts
apps/api/db/schema/payout.ts
apps/api/db/schema/payoutMethod.ts
apps/api/db/schema/payoutRequest.ts
apps/api/db/schema/repeatContractorRequest.ts
apps/api/db/schema/router.ts
apps/api/db/schema/routerProfile.ts
apps/api/db/schema/routingHub.ts
apps/api/db/schema/stripeWebhookEvent.ts
apps/api/db/schema/supportAttachment.ts
apps/api/db/schema/supportMessage.ts
apps/api/db/schema/supportTicket.ts
apps/api/db/schema/user.ts
```

#### apps/api/db/schema/_dbSchema.ts

```ts
import { pgSchema } from "drizzle-orm/pg-core";

// Prisma uses `?schema=...` in DATABASE_URL to set the Postgres schema.
// Drizzle schemas should point at the same schema to mirror existing tables.
function getSchemaName(): string {
  const url = process.env.DATABASE_URL ?? "";
  try {
    const u = new URL(url);
    const s = u.searchParams.get("schema");
    return s && /^[a-zA-Z0-9_]+$/.test(s) ? s : "public";
  } catch {
    return "public";
  }
}

export const DB_SCHEMA = getSchemaName();
export const dbSchema = pgSchema(DB_SCHEMA);
```

#### apps/api/db/schema/adminRouterContext.ts

```ts
import { text, timestamp } from "drizzle-orm/pg-core";
import { countryCodeEnum } from "./enums";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `AdminRouterContext` (table: admin_router_contexts) with only fields
// required by non-money routes (e.g., logout deactivation).
export const adminRouterContexts = dbSchema.table("admin_router_contexts", {
  id: text("id").primaryKey(),

  adminId: text("adminId").notNull(),

  country: countryCodeEnum("country").notNull(),
  regionCode: text("regionCode").notNull(),

  routingHubId: text("routingHubId").notNull(),

  activatedAt: timestamp("activatedAt", { mode: "date" }).notNull().defaultNow(),
  deactivatedAt: timestamp("deactivatedAt", { mode: "date" }),
});
```

#### apps/api/db/schema/auditLog.ts

```ts
import { jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `AuditLog` table (minimal fields for reads).
export const auditLogs = dbSchema.table("AuditLog", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  actorUserId: text("actorUserId"),
  action: text("action").notNull(),
  entityType: text("entityType").notNull(),
  entityId: text("entityId").notNull(),
  metadata: jsonb("metadata"),
});
```

#### apps/api/db/schema/contractor.ts

```ts
import { boolean, doublePrecision, integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { countryCodeEnum, tradeCategoryEnum } from "./enums";

// Mirrors Prisma `Contractor` table (route-scoped minimal fields for reads).
export const contractors = dbSchema.table("Contractor", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("PENDING"),

  businessName: text("businessName").notNull(),
  contactName: text("contactName"),
  yearsExperience: integer("yearsExperience").notNull().default(3),
  phone: text("phone"),
  email: text("email"),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  approvedAt: timestamp("approvedAt", { mode: "date" }),

  country: countryCodeEnum("country").notNull().default("US"),
  regionCode: text("regionCode").notNull(),

  trade: text("trade").notNull(),
  categories: text("categories").array(),

  // v1 controlled categories (multi-select). Canonical eligibility list.
  // NOTE: In Postgres this is backed by Prisma enum type `"TradeCategory"[]`.
  tradeCategories: tradeCategoryEnum("tradeCategories").array(),

  automotiveEnabled: boolean("automotiveEnabled").notNull().default(false),

  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),

  regions: text("regions").array(),
});
```

#### apps/api/db/schema/contractorAccount.ts

```ts
import { boolean, doublePrecision, integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { countryCodeEnum } from "./enums";

// Mirrors Prisma `ContractorAccount` model (table: contractor_accounts).
// This table is the authenticated contractor profile surface.
export const contractorAccounts = dbSchema.table("contractor_accounts", {
  userId: text("userId").primaryKey(),

  createdByAdmin: boolean("createdByAdmin").notNull().default(false),
  isActive: boolean("isActive").notNull().default(true),
  isMock: boolean("isMock").notNull().default(false),
  isTest: boolean("isTest").notNull().default(false),

  // Wizard / eligibility (columns may be added via migrations; keep nullable/default-safe).
  status: text("status"),
  wizardCompleted: boolean("wizardCompleted").notNull().default(false),

  firstName: text("firstName"),
  lastName: text("lastName"),
  businessName: text("businessName"),
  businessNumber: text("businessNumber"),

  addressMode: text("addressMode"),
  addressSearchDisplayName: text("addressSearchDisplayName"),
  address1: text("address1"),
  address2: text("address2"),
  apt: text("apt"),
  postalCode: text("postalCode"),

  tradeCategory: text("tradeCategory").notNull(),
  serviceRadiusKm: integer("serviceRadiusKm").notNull().default(25),

  country: countryCodeEnum("country").notNull().default("US"),
  regionCode: text("regionCode").notNull(),
  city: text("city"),

  tradeStartYear: integer("tradeStartYear"),
  tradeStartMonth: integer("tradeStartMonth"),

  payoutMethod: text("payoutMethod"),
  payoutStatus: text("payoutStatus"),
  stripeAccountId: text("stripeAccountId"),
  paypalEmail: text("paypalEmail"),

  isApproved: boolean("isApproved").notNull().default(false),
  jobsCompleted: integer("jobsCompleted").notNull().default(0),
  rating: doublePrecision("rating"),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});
```

#### apps/api/db/schema/contractorLedgerEntry.ts

```ts
import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { contractorLedgerBucketEnum, contractorLedgerEntryTypeEnum } from "./enums";

export const contractorLedgerEntries = dbSchema.table("ContractorLedgerEntry", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  contractorId: text("contractorId").notNull(),
  jobId: text("jobId"),

  type: contractorLedgerEntryTypeEnum("type").notNull(),
  bucket: contractorLedgerBucketEnum("bucket").notNull(),
  amountCents: integer("amountCents").notNull(),
  memo: text("memo"),
});
```

#### apps/api/db/schema/contractorPayout.ts

```ts
import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { contractorPayoutStatusEnum } from "./enums";

export const contractorPayouts = dbSchema.table("ContractorPayout", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  contractorId: text("contractorId").notNull(),
  jobId: text("jobId"),
  materialsRequestId: text("materialsRequestId"),

  amountCents: integer("amountCents").notNull(),
  scheduledFor: timestamp("scheduledFor", { mode: "date" }).notNull(),

  status: contractorPayoutStatusEnum("status").notNull().default("PENDING"),
  paidAt: timestamp("paidAt", { mode: "date" }),
  externalReference: text("externalReference"),
  failureReason: text("failureReason"),
});
```

#### apps/api/db/schema/conversation.ts

```ts
import { index, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Messaging: job-bound conversation between one contractor + one job poster.
export const conversations = dbSchema.table(
  "conversations",
  {
    id: text("id").primaryKey(),

    jobId: text("jobId").notNull(),
    contractorUserId: text("contractorUserId").notNull(),
    jobPosterUserId: text("jobPosterUserId").notNull(),

    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    jobIdIdx: index("conversations_jobId_idx").on(t.jobId),
    participantsIdx: index("conversations_participants_idx").on(t.contractorUserId, t.jobPosterUserId),
    uniq: uniqueIndex("conversations_job_participants_uniq").on(t.jobId, t.contractorUserId, t.jobPosterUserId),
  }),
);
```

#### apps/api/db/schema/disputeAlert.ts

```ts
import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { disputeAlertTypeEnum } from "./enums";

export const disputeAlerts = dbSchema.table("dispute_alerts", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  disputeCaseId: text("disputeCaseId").notNull(),
  type: disputeAlertTypeEnum("type").notNull(),
  handledAt: timestamp("handledAt", { mode: "date" }),
});
```

#### apps/api/db/schema/disputeCase.ts

```ts
import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import {
  disputeAgainstRoleEnum,
  disputeDecisionEnum,
  disputeReasonEnum,
  disputeStatusEnum,
} from "./enums";

// Mirrors Prisma `DisputeCase` table (support disputes).
export const disputeCases = dbSchema.table("dispute_cases", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  // application-managed updatedAt (no DB default)
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),

  ticketId: text("ticketId").notNull(),

  jobId: text("jobId").notNull(),
  filedByUserId: text("filedByUserId").notNull(),
  againstUserId: text("againstUserId").notNull(),

  againstRole: disputeAgainstRoleEnum("againstRole").notNull(),
  disputeReason: disputeReasonEnum("disputeReason").notNull(),
  description: text("description").notNull(),

  status: disputeStatusEnum("status").notNull().default("SUBMITTED"),
  decision: disputeDecisionEnum("decision"),
  decisionSummary: text("decisionSummary"),
  decisionAt: timestamp("decisionAt", { mode: "date" }),

  deadlineAt: timestamp("deadlineAt", { mode: "date" }).notNull(),
});
```

#### apps/api/db/schema/disputeEnforcementAction.ts

```ts
import { jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { disputeEnforcementActionStatusEnum, disputeEnforcementActionTypeEnum } from "./enums";

export const disputeEnforcementActions = dbSchema.table("dispute_enforcement_actions", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  // application-managed updatedAt (no DB default)
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),

  disputeCaseId: text("disputeCaseId").notNull(),
  type: disputeEnforcementActionTypeEnum("type").notNull(),
  status: disputeEnforcementActionStatusEnum("status").notNull().default("PENDING"),
  payload: jsonb("payload"),

  requestedByUserId: text("requestedByUserId").notNull(),
  executedByUserId: text("executedByUserId"),
  executedAt: timestamp("executedAt", { mode: "date" }),
  error: text("error"),
});
```

#### apps/api/db/schema/enums.ts

```ts
import { pgEnum } from "drizzle-orm/pg-core";

// NOTE: These enums mirror existing Postgres enum types created by Prisma.
// They are for typing / future reads only (no migrations in Phase 0.2).

export const userRoleEnum = pgEnum("UserRole", [
  "USER",
  "ADMIN",
  "CUSTOMER",
  "CONTRACTOR",
  "ROUTER",
  "JOB_POSTER",
]);

export const userStatusEnum = pgEnum("UserStatus", ["ACTIVE", "SUSPENDED", "PENDING"]);

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
  "APPRAISING",
  "PRICED",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "CANCELLED",
  "IN_REVIEW",
  "NEEDS_CLARIFICATION",
  "REJECTED",
  "APPROVED",
]);

export const jobStatusEnum = pgEnum("JobStatus", [
  "ASSIGNED",
  "IN_PROGRESS",
  "CONTRACTOR_COMPLETED",
  "CUSTOMER_APPROVED",
  "CUSTOMER_REJECTED",
  "COMPLETION_FLAGGED",
  "COMPLETED_APPROVED",
  "DRAFT",
  "PUBLISHED",
  "OPEN_FOR_ROUTING",
]);

export const publicJobStatusEnum = pgEnum("PublicJobStatus", ["OPEN", "IN_PROGRESS"]);

export const jobSourceEnum = pgEnum("JobSource", ["MOCK", "REAL"]);

export const jobTypeEnum = pgEnum("JobType", ["urban", "regional"]);

export const routingStatusEnum = pgEnum("RoutingStatus", ["UNROUTED", "ROUTED_BY_ROUTER", "ROUTED_BY_ADMIN"]);

export const countryCodeEnum = pgEnum("CountryCode", ["CA", "US"]);

export const currencyCodeEnum = pgEnum("CurrencyCode", ["CAD", "USD"]);

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
```

#### apps/api/db/schema/index.ts

```ts
export * from "./enums";
export * from "./_dbSchema";
export * from "./user";
export * from "./job";
export * from "./jobDraft";
export * from "./jobPhoto";
export * from "./router";
export * from "./jobPayment";
export * from "./auditLog";
export * from "./jobAssignment";
export * from "./contractor";
export * from "./ledgerEntry";
export * from "./payoutMethod";
export * from "./payoutRequest";
export * from "./payout";
export * from "./contractorPayout";
export * from "./contractorLedgerEntry";
export * from "./materialsEscrowLedgerEntry";
export * from "./materialsEscrow";
export * from "./materialsRequest";
export * from "./materialsPayment";
export * from "./materialsReceiptSubmission";
export * from "./materialsReceiptFile";
export * from "./materialsItem";
export * from "./jobPosterCredit";
export * from "./stripeWebhookEvent";
export * from "./routerProfile";
export * from "./supportTicket";
export * from "./supportMessage";
export * from "./supportAttachment";
export * from "./disputeCase";
export * from "./disputeAlert";
export * from "./disputeEnforcementAction";
export * from "./internalAccountFlag";
export * from "./jobHold";
export * from "./jobDispatch";
export * from "./contractorAccount";
export * from "./jobPosterProfile";
export * from "./adminRouterContext";
export * from "./conversation";
export * from "./message";
export * from "./notificationDelivery";
export * from "./monitoringEvent";
export * from "./routingHub";
```

#### apps/api/db/schema/internalAccountFlag.ts

```ts
import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { internalAccountFlagTypeEnum } from "./enums";

export const internalAccountFlags = dbSchema.table("internal_account_flags", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  // application-managed updatedAt (no DB default)
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),

  userId: text("userId").notNull(),
  type: internalAccountFlagTypeEnum("type").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  reason: text("reason").notNull(),

  disputeCaseId: text("disputeCaseId"),
  createdByUserId: text("createdByUserId").notNull(),

  resolvedAt: timestamp("resolvedAt", { mode: "date" }),
  resolvedByUserId: text("resolvedByUserId"),
});
```

#### apps/api/db/schema/job.ts

```ts
import {
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  jsonb,
} from "drizzle-orm/pg-core";
import {
  countryCodeEnum,
  currencyCodeEnum,
  customerRejectReasonEnum,
  ecdUpdateReasonEnum,
  aiAppraisalStatusEnum,
  jobSourceEnum,
  jobStatusEnum,
  jobTypeEnum,
  publicJobStatusEnum,
  routingStatusEnum,
  tradeCategoryEnum,
} from "./enums";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `Job` table (scalar columns only).
export const jobs = dbSchema.table("Job", {
  id: text("id").primaryKey(),
  status: jobStatusEnum("status").notNull().default("PUBLISHED"),
  archived: boolean("archived").notNull().default(false),

  title: text("title").notNull(),
  scope: text("scope").notNull(),
  region: text("region").notNull(),

  country: countryCodeEnum("country").notNull().default("US"),
  currency: currencyCodeEnum("currency").notNull().default("USD"),
  regionCode: text("regionCode"),
  regionName: text("regionName"),
  city: text("city"),
  postalCode: text("postalCode"),
  addressFull: text("addressFull"),

  // AI pricing appraisal (advisory only).
  aiAppraisalStatus: aiAppraisalStatusEnum("aiAppraisalStatus").notNull().default("PENDING"),
  aiAppraisedAt: timestamp("aiAppraisedAt", { mode: "date" }),
  aiSuggestedTotal: integer("aiSuggestedTotal"),
  aiPriceRangeLow: integer("aiPriceRangeLow"),
  aiPriceRangeHigh: integer("aiPriceRangeHigh"),
  aiConfidence: text("aiConfidence"),
  aiReasoning: text("aiReasoning"),
  pricingIntel: jsonb("pricingIntel"),
  pricingIntelGeneratedAt: timestamp("pricingIntelGeneratedAt", { mode: "date" }),
  pricingIntelModel: text("pricingIntelModel"),
  supersededByJobId: text("supersededByJobId"),

  isMock: boolean("isMock").notNull().default(false),
  publicStatus: publicJobStatusEnum("publicStatus").notNull().default("OPEN"),
  jobSource: jobSourceEnum("jobSource").notNull().default("REAL"),

  repeatContractorDiscountCents: integer("repeatContractorDiscountCents").notNull().default(0),

  serviceType: text("serviceType").notNull().default("handyman"),
  tradeCategory: tradeCategoryEnum("tradeCategory").notNull().default("HANDYMAN"),
  timeWindow: text("timeWindow"),

  routerEarningsCents: integer("routerEarningsCents").notNull().default(0),
  brokerFeeCents: integer("brokerFeeCents").notNull().default(0),
  contractorPayoutCents: integer("contractorPayoutCents").notNull().default(0),

  laborTotalCents: integer("laborTotalCents").notNull().default(0),
  materialsTotalCents: integer("materialsTotalCents").notNull().default(0),
  transactionFeeCents: integer("transactionFeeCents").notNull().default(0),

  escrowLockedAt: timestamp("escrowLockedAt", { mode: "date" }),
  paymentCapturedAt: timestamp("paymentCapturedAt", { mode: "date" }),
  paymentReleasedAt: timestamp("paymentReleasedAt", { mode: "date" }),

  priceMedianCents: integer("priceMedianCents"),
  priceAdjustmentCents: integer("priceAdjustmentCents"),
  pricingVersion: text("pricingVersion").notNull().default("v1-median-delta"),

  junkHaulingItems: jsonb("junkHaulingItems"),

  // Optional (v1): Job Poster availability (informational only).
  availability: jsonb("availability"),

  jobType: jobTypeEnum("jobType").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  publishedAt: timestamp("publishedAt", { mode: "date" }).notNull().defaultNow(),

  jobPosterUserId: text("jobPosterUserId"),

  contactedAt: timestamp("contactedAt", { mode: "date" }),
  guaranteeEligibleAt: timestamp("guaranteeEligibleAt", { mode: "date" }),

  claimedAt: timestamp("claimedAt", { mode: "date" }),
  claimedByUserId: text("claimedByUserId"),

  adminRoutedById: text("adminRoutedById"),

  contractorUserId: text("contractorUserId"),

  postedAt: timestamp("postedAt", { mode: "date" }).notNull().defaultNow(),
  routingDueAt: timestamp("routingDueAt", { mode: "date" }),
  firstRoutedAt: timestamp("firstRoutedAt", { mode: "date" }),
  routingStatus: routingStatusEnum("routingStatus").notNull().default("UNROUTED"),
  failsafeRouting: boolean("failsafeRouting").notNull().default(false),
  routedAt: timestamp("routedAt", { mode: "date" }),

  contractorCompletedAt: timestamp("contractorCompletedAt", { mode: "date" }),
  contractorCompletionSummary: text("contractorCompletionSummary"),

  customerApprovedAt: timestamp("customerApprovedAt", { mode: "date" }),
  customerRejectedAt: timestamp("customerRejectedAt", { mode: "date" }),
  customerRejectReason: customerRejectReasonEnum("customerRejectReason"),
  customerRejectNotes: text("customerRejectNotes"),
  customerFeedback: text("customerFeedback"),

  routerApprovedAt: timestamp("routerApprovedAt", { mode: "date" }),
  routerApprovalNotes: text("routerApprovalNotes"),

  completionFlaggedAt: timestamp("completionFlaggedAt", { mode: "date" }),
  completionFlagReason: text("completionFlagReason"),

  contractorActionTokenHash: text("contractorActionTokenHash"),
  customerActionTokenHash: text("customerActionTokenHash"),

  estimatedCompletionDate: timestamp("estimatedCompletionDate", { mode: "date" }),
  estimateSetAt: timestamp("estimateSetAt", { mode: "date" }),
  estimateUpdatedAt: timestamp("estimateUpdatedAt", { mode: "date" }),
  estimateUpdateReason: ecdUpdateReasonEnum("estimateUpdateReason"),
  estimateUpdateOtherText: text("estimateUpdateOtherText"),
});
```

#### apps/api/db/schema/jobAssignment.ts

```ts
import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `JobAssignment` table (minimal fields for reads).
export const jobAssignments = dbSchema.table("JobAssignment", {
  id: text("id").primaryKey(),
  jobId: text("jobId").notNull(),
  contractorId: text("contractorId").notNull(),
  status: text("status").notNull(),
  assignedByAdminUserId: text("assignedByAdminUserId").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  completedAt: timestamp("completedAt", { mode: "date" }),
});
```

#### apps/api/db/schema/jobDispatch.ts

```ts
import { index, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `JobDispatch` table (minimal fields for routing flows).
export const jobDispatches = dbSchema.table(
  "JobDispatch",
  {
    id: text("id").primaryKey(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),

    status: text("status").notNull(),
    expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
    respondedAt: timestamp("respondedAt", { mode: "date" }),

    tokenHash: text("tokenHash").notNull(),

    jobId: text("jobId").notNull(),
    contractorId: text("contractorId").notNull(),
    routerUserId: text("routerUserId").notNull(),
  },
  (t) => ({
    tokenHashUniq: uniqueIndex("JobDispatch_tokenHash_key").on(t.tokenHash),
    jobStatusCreatedIdx: index("JobDispatch_jobId_status_createdAt_idx").on(t.jobId, t.status, t.createdAt),
    contractorStatusCreatedIdx: index("JobDispatch_contractorId_status_createdAt_idx").on(t.contractorId, t.status, t.createdAt),
    routerStatusCreatedIdx: index("JobDispatch_routerUserId_status_createdAt_idx").on(t.routerUserId, t.status, t.createdAt),
  }),
);
```

#### apps/api/db/schema/jobDraft.ts

```ts
import { text, integer, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { jobDraftStatusEnum, jobTypeEnum, tradeCategoryEnum } from "./enums";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `JobDraft` table.
export const jobDrafts = dbSchema.table("JobDraft", {
  id: text("id").primaryKey(),
  status: jobDraftStatusEnum("status").notNull().default("DRAFT"),

  title: text("title").notNull(),
  scope: text("scope").notNull(),
  region: text("region").notNull(),
  serviceType: text("serviceType").notNull(),
  tradeCategory: tradeCategoryEnum("tradeCategory"),
  timeWindow: text("timeWindow"),

  routerEarningsCents: integer("routerEarningsCents").notNull(),
  brokerFeeCents: integer("brokerFeeCents").notNull(),
  contractorPayoutCents: integer("contractorPayoutCents").notNull().default(0),

  laborTotalCents: integer("laborTotalCents").notNull().default(0),
  materialsTotalCents: integer("materialsTotalCents").notNull().default(0),
  transactionFeeCents: integer("transactionFeeCents").notNull().default(0),

  jobType: jobTypeEnum("jobType").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),

  notesInternal: text("notesInternal"),
  priceLockedAt: timestamp("priceLockedAt", { mode: "date" }),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  // Prisma `@updatedAt` (application-managed) — no DB default in our schema.
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),

  createdByAdminUserId: text("createdByAdminUserId"),
  createdByJobPosterUserId: text("createdByJobPosterUserId"),

  publishedJobId: text("publishedJobId").unique(),
});
```

#### apps/api/db/schema/jobHold.ts

```ts
import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { currencyCodeEnum, jobHoldReasonEnum, jobHoldStatusEnum } from "./enums";

export const jobHolds = dbSchema.table("JobHold", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  status: jobHoldStatusEnum("status").notNull().default("ACTIVE"),
  jobId: text("jobId").notNull(),
  reason: jobHoldReasonEnum("reason").notNull(),

  notes: text("notes"),
  amountCents: integer("amountCents"),
  currency: currencyCodeEnum("currency"),

  appliedAt: timestamp("appliedAt", { mode: "date" }).notNull().defaultNow(),
  releasedAt: timestamp("releasedAt", { mode: "date" }),

  appliedByUserId: text("appliedByUserId"),
  appliedByAdminUserId: text("appliedByAdminUserId"), // uuid in DB (stored as text here)
  releasedByUserId: text("releasedByUserId"),
  releasedByAdminUserId: text("releasedByAdminUserId"), // uuid

  sourceDisputeCaseId: text("sourceDisputeCaseId"),
});
```

#### apps/api/db/schema/jobPayment.ts

```ts
import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `JobPayment` table (read-only mirror; used for Drizzle reads).
export const jobPayments = dbSchema.table("JobPayment", {
  id: text("id").primaryKey(),

  jobId: text("jobId"),

  stripePaymentIntentId: text("stripePaymentIntentId").notNull(),
  stripePaymentIntentStatus: text("stripePaymentIntentStatus").notNull(),
  stripeChargeId: text("stripeChargeId"),

  amountCents: integer("amountCents").notNull(),
  status: text("status").notNull().default("PENDING"), // PENDING, CAPTURED, FAILED, REFUNDED

  escrowLockedAt: timestamp("escrowLockedAt", { mode: "date" }),
  paymentCapturedAt: timestamp("paymentCapturedAt", { mode: "date" }),
  paymentReleasedAt: timestamp("paymentReleasedAt", { mode: "date" }),
  refundedAt: timestamp("refundedAt", { mode: "date" }),
  refundAmountCents: integer("refundAmountCents"),
  refundIssuedAt: timestamp("refundIssuedAt", { mode: "date" }),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  // application-managed updatedAt (no DB default)
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),
});
```

#### apps/api/db/schema/jobPhoto.ts

```ts
import { jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `JobPhoto` table (minimal fields for public reads).
export const jobPhotos = dbSchema.table("JobPhoto", {
  id: text("id").primaryKey(),
  jobId: text("jobId").notNull(),
  kind: text("kind").notNull(),
  actor: text("actor"),
  url: text("url"),
  storageKey: text("storageKey"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});
```

#### apps/api/db/schema/jobPosterCredit.ts

```ts
import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const jobPosterCredits = dbSchema.table("JobPosterCredit", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  userId: text("userId").notNull(),
  escrowId: text("escrowId"),
  amountCents: integer("amountCents").notNull(),
  memo: text("memo"),
});
```

#### apps/api/db/schema/jobPosterProfile.ts

```ts
import { doublePrecision, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { countryCodeEnum, rolePayoutMethodEnum, rolePayoutStatusEnum } from "./enums";

// Mirrors Prisma `JobPosterProfile` table (minimal fields for Stripe `account.updated` payout updates).
export const jobPosterProfiles = dbSchema.table("JobPosterProfile", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),

  userId: text("userId").notNull().unique(),

  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  address: text("address"),
  city: text("city").notNull(),
  stateProvince: text("stateProvince").notNull(),
  country: countryCodeEnum("country").notNull().default("US"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  defaultJobLocation: text("defaultJobLocation"),

  payoutMethod: rolePayoutMethodEnum("payoutMethod"),
  payoutStatus: rolePayoutStatusEnum("payoutStatus").notNull().default("UNSET"),
  stripeAccountId: text("stripeAccountId"),
  paypalEmail: text("paypalEmail"),
});
```

#### apps/api/db/schema/ledgerEntry.ts

```ts
import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `LedgerEntry` table (minimal fields for wallet/earnings reads).
export const ledgerEntries = dbSchema.table("LedgerEntry", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  userId: text("userId").notNull(),
  jobId: text("jobId"),

  type: text("type").notNull(),
  direction: text("direction").notNull(), // CREDIT | DEBIT
  bucket: text("bucket").notNull(), // PENDING | AVAILABLE | PAID | HELD
  amountCents: integer("amountCents").notNull(),

  memo: text("memo"),
});
```

#### apps/api/db/schema/materialsEscrow.ts

```ts
import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { currencyCodeEnum, materialsEscrowStatusEnum } from "./enums";

export const materialsEscrows = dbSchema.table("MaterialsEscrow", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  status: materialsEscrowStatusEnum("status").notNull().default("HELD"),
  requestId: text("requestId").notNull(),

  currency: currencyCodeEnum("currency").notNull().default("USD"),
  amountCents: integer("amountCents").notNull(),

  releaseDueAt: timestamp("releaseDueAt", { mode: "date" }),
  releasedAt: timestamp("releasedAt", { mode: "date" }),

  overageCents: integer("overageCents").notNull().default(0),
  posterCreditCents: integer("posterCreditCents").notNull().default(0),
  posterRefundCents: integer("posterRefundCents").notNull().default(0),
  receiptTotalCents: integer("receiptTotalCents").notNull().default(0),
  reimbursedAmountCents: integer("reimbursedAmountCents").notNull().default(0),
  remainderCents: integer("remainderCents").notNull().default(0),
});
```

#### apps/api/db/schema/materialsEscrowLedgerEntry.ts

```ts
import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { currencyCodeEnum, materialsEscrowLedgerEntryTypeEnum } from "./enums";

export const materialsEscrowLedgerEntries = dbSchema.table("MaterialsEscrowLedgerEntry", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  escrowId: text("escrowId").notNull(),
  type: materialsEscrowLedgerEntryTypeEnum("type").notNull(),
  amountCents: integer("amountCents").notNull(),
  currency: currencyCodeEnum("currency").notNull().default("USD"),

  memo: text("memo"),
  actorUserId: text("actorUserId"),
});
```

#### apps/api/db/schema/materialsItem.ts

```ts
import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const materialsItems = dbSchema.table("MaterialsItem", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  requestId: text("requestId").notNull(),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceCents: integer("unitPriceCents").notNull(),
  priceUrl: text("priceUrl"),
  category: text("category").notNull(),
});
```

#### apps/api/db/schema/materialsPayment.ts

```ts
import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { materialsPaymentStatusEnum } from "./enums";

export const materialsPayments = dbSchema.table("MaterialsPayment", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  // application-managed updatedAt (no DB default)
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),

  requestId: text("requestId").notNull(),

  stripePaymentIntentId: text("stripePaymentIntentId").notNull(),
  stripePaymentIntentStatus: text("stripePaymentIntentStatus").notNull().default("requires_payment_method"),
  stripeChargeId: text("stripeChargeId"),

  status: materialsPaymentStatusEnum("status").notNull().default("PENDING"),
  amountCents: integer("amountCents").notNull(),

  capturedAt: timestamp("capturedAt", { mode: "date" }),
  refundAmountCents: integer("refundAmountCents"),
  refundedAt: timestamp("refundedAt", { mode: "date" }),
  stripeRefundId: text("stripeRefundId"),
});
```

#### apps/api/db/schema/materialsReceiptFile.ts

```ts
import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

export const materialsReceiptFiles = dbSchema.table("MaterialsReceiptFile", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  submissionId: text("submissionId").notNull(),
  originalName: text("originalName").notNull(),
  mimeType: text("mimeType").notNull(),
  sizeBytes: integer("sizeBytes").notNull(),
  storageKey: text("storageKey").notNull(),
  sha256: text("sha256"),
});
```

#### apps/api/db/schema/materialsReceiptSubmission.ts

```ts
import { integer, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { currencyCodeEnum, materialsReceiptStatusEnum } from "./enums";

export const materialsReceiptSubmissions = dbSchema.table("MaterialsReceiptSubmission", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  // application-managed updatedAt (no DB default)
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),

  status: materialsReceiptStatusEnum("status").notNull().default("DRAFT"),
  requestId: text("requestId").notNull(),

  currency: currencyCodeEnum("currency").notNull().default("USD"),
  receiptSubtotalCents: integer("receiptSubtotalCents").notNull().default(0),
  receiptTaxCents: integer("receiptTaxCents").notNull().default(0),
  receiptTotalCents: integer("receiptTotalCents").notNull().default(0),

  merchantName: text("merchantName"),
  purchaseDate: timestamp("purchaseDate", { mode: "date" }),

  extractionModel: text("extractionModel"),
  extractionRaw: jsonb("extractionRaw"),

  submittedAt: timestamp("submittedAt", { mode: "date" }),
});
```

#### apps/api/db/schema/materialsRequest.ts

```ts
import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { currencyCodeEnum, materialsRequestStatusEnum } from "./enums";

export const materialsRequests = dbSchema.table("MaterialsRequest", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  // application-managed updatedAt (no DB default)
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),

  status: materialsRequestStatusEnum("status").notNull().default("SUBMITTED"),

  jobId: text("jobId").notNull(),
  contractorId: text("contractorId").notNull(),
  jobPosterUserId: text("jobPosterUserId").notNull(),
  routerUserId: text("routerUserId"),

  submittedAt: timestamp("submittedAt", { mode: "date" }).notNull().defaultNow(),
  approvedAt: timestamp("approvedAt", { mode: "date" }),
  declinedAt: timestamp("declinedAt", { mode: "date" }),
  approvedByUserId: text("approvedByUserId"),
  declinedByUserId: text("declinedByUserId"),

  currency: currencyCodeEnum("currency").notNull().default("USD"),
  totalAmountCents: integer("totalAmountCents").notNull(),
});
```

#### apps/api/db/schema/message.ts

```ts
import { index, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Messaging: plain-text messages within a conversation.
export const messages = dbSchema.table(
  "messages",
  {
    id: text("id").primaryKey(),

    conversationId: text("conversationId").notNull(),

    senderUserId: text("senderUserId").notNull(),
    // CONTRACTOR | JOB_POSTER | SYSTEM
    senderRole: text("senderRole").notNull(),

    body: text("body").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    convoCreatedIdx: index("messages_conversation_created_idx").on(t.conversationId, t.createdAt),
  }),
);
```

#### apps/api/db/schema/monitoringEvent.ts

```ts
import { text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { monitoringActorRoleEnum, monitoringEventTypeEnum } from "./enums";

// Postgres table name is snake_case: monitoring_events
export const monitoringEvents = dbSchema.table("monitoring_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  type: monitoringEventTypeEnum("type").notNull(),
  jobId: text("jobId").notNull(),
  role: monitoringActorRoleEnum("role").notNull(),
  userId: text("userId"),
  handledAt: timestamp("handledAt", { mode: "date" }),
});
```

#### apps/api/db/schema/notificationDelivery.ts

```ts
import { index, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Notifications: one-way system/admin → user deliveries (one row per recipient).
export const notificationDeliveries = dbSchema.table(
  "notification_deliveries",
  {
    id: text("id").primaryKey(),

    userId: text("userId").notNull(),

    title: text("title").notNull(),
    body: text("body"),

    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    readAt: timestamp("readAt", { mode: "date" }),

    createdByAdminUserId: text("createdByAdminUserId"),
    jobId: text("jobId"),
  },
  (t) => ({
    userCreatedIdx: index("notification_deliveries_user_created_idx").on(t.userId, t.createdAt),
    userReadIdx: index("notification_deliveries_user_read_idx").on(t.userId, t.readAt),
  }),
);
```

#### apps/api/db/schema/payout.ts

```ts
import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { currencyCodeEnum, payoutProviderEnum, payoutStatusEnum } from "./enums";

export const payouts = dbSchema.table("Payout", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  paidAt: timestamp("paidAt", { mode: "date" }),
  externalReference: text("externalReference"),
  notesInternal: text("notesInternal"),

  userId: text("userId"),
  status: payoutStatusEnum("status").notNull().default("PENDING"),

  currency: currencyCodeEnum("currency"),
  provider: payoutProviderEnum("provider"),
  amountCents: integer("amountCents"),

  scheduledFor: timestamp("scheduledFor", { mode: "date" }),
  failureReason: text("failureReason"),
});
```

#### apps/api/db/schema/payoutMethod.ts

```ts
import { boolean, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { currencyCodeEnum, payoutProviderEnum } from "./enums";

export const payoutMethods = dbSchema.table("PayoutMethod", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),

  userId: text("userId").notNull(),

  currency: currencyCodeEnum("currency").notNull(),
  provider: payoutProviderEnum("provider").notNull(),

  isActive: boolean("isActive").notNull().default(true),
  details: jsonb("details").notNull(),
});
```

#### apps/api/db/schema/payoutRequest.ts

```ts
import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { payoutRequestStatusEnum } from "./enums";

export const payoutRequests = dbSchema.table("PayoutRequest", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  status: payoutRequestStatusEnum("status").notNull().default("REQUESTED"),
  userId: text("userId").notNull(),
  amountCents: integer("amountCents").notNull(),
  payoutId: text("payoutId"),
});
```

#### apps/api/db/schema/repeatContractorRequest.ts

```ts
import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { tradeCategoryEnum } from "./enums";

// Mirrors Prisma `RepeatContractorRequest` table (used across repeat-contractor + payment flows).
export const repeatContractorRequests = dbSchema.table("RepeatContractorRequest", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),

  jobId: text("jobId").notNull(),
  contractorId: text("contractorId").notNull(),
  tradeCategory: tradeCategoryEnum("tradeCategory").notNull(),
  status: text("status").notNull(), // REQUESTED, ACCEPTED, DECLINED, EXPIRED, CANCELLED
  requestedAt: timestamp("requestedAt", { mode: "date" }).notNull().defaultNow(),
  respondedAt: timestamp("respondedAt", { mode: "date" }),
  priorJobId: text("priorJobId"),
});
```

#### apps/api/db/schema/router.ts

```ts
import { boolean, doublePrecision, integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { countryCodeEnum, routerStatusEnum } from "./enums";

// Mirrors Prisma `Router` table (mapped to "routers") with minimal fields for reads.
export const routers = dbSchema.table("routers", {
  userId: text("userId").primaryKey(),

  createdByAdmin: boolean("createdByAdmin").notNull().default(false),
  isActive: boolean("isActive").notNull().default(true),
  isMock: boolean("isMock").notNull().default(false),
  isTest: boolean("isTest").notNull().default(false),

  // Access gating (v1): required for router job routing tools.
  termsAccepted: boolean("termsAccepted").notNull().default(false),
  profileComplete: boolean("profileComplete").notNull().default(false),

  homeCountry: countryCodeEnum("homeCountry").notNull().default("US"),
  homeRegionCode: text("homeRegionCode").notNull(),
  homeCity: text("homeCity"),

  isSeniorRouter: boolean("isSeniorRouter").notNull().default(false),
  dailyRouteLimit: integer("dailyRouteLimit").notNull().default(10),

  routesCompleted: integer("routesCompleted").notNull().default(0),
  routesFailed: integer("routesFailed").notNull().default(0),
  rating: doublePrecision("rating"),

  status: routerStatusEnum("status").notNull().default("ACTIVE"),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});
```

#### apps/api/db/schema/routerProfile.ts

```ts
import { boolean, doublePrecision, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `RouterProfile` table (minimal fields for router dashboard reads).
export const routerProfiles = dbSchema.table("RouterProfile", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),

  name: text("name"),
  state: text("state"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  status: text("status"),

  addressPrivate: text("addressPrivate"),

  stripeAccountId: text("stripeAccountId"),
  payoutMethod: text("payoutMethod"),
  payoutStatus: text("payoutStatus"),
  paypalEmail: text("paypalEmail"),

  notifyViaEmail: boolean("notifyViaEmail"),
  notifyViaSms: boolean("notifyViaSms"),
  phone: text("phone"),

  createdAt: timestamp("createdAt", { mode: "date" }),
  updatedAt: timestamp("updatedAt", { mode: "date" }),
});
```

#### apps/api/db/schema/routingHub.ts

```ts
import { boolean, doublePrecision, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import { countryCodeEnum } from "./enums";

export const routingHubs = dbSchema.table("routing_hubs", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  country: countryCodeEnum("country").notNull(),
  regionCode: text("regionCode").notNull(),
  hubCity: text("hubCity").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  isAdminOnly: boolean("isAdminOnly").notNull().default(true),
});

import { boolean, doublePrecision, text, timestamp } from "drizzle-orm/pg-core";
import { countryCodeEnum } from "./enums";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `RoutingHub` (table: routing_hubs) with only fields required by
// admin router-context enter/exit routes.
export const routingHubs = dbSchema.table("routing_hubs", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  country: countryCodeEnum("country").notNull(),
  regionCode: text("regionCode").notNull(),
  hubCity: text("hubCity").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),

  isAdminOnly: boolean("isAdminOnly").notNull().default(true),
});
```

#### apps/api/db/schema/stripeWebhookEvent.ts

```ts
import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `StripeWebhookEvent` table (read/write; used for idempotency).
export const stripeWebhookEvents = dbSchema.table("StripeWebhookEvent", {
  id: text("id").primaryKey(), // Stripe Event ID (evt_*)
  type: text("type").notNull(),
  objectId: text("objectId"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  processedAt: timestamp("processedAt", { mode: "date" }),
});
```

#### apps/api/db/schema/supportAttachment.ts

```ts
import { integer, text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `SupportAttachment` table (minimal fields for support reads).
export const supportAttachments = dbSchema.table("support_attachments", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  ticketId: text("ticketId").notNull(),
  uploadedById: text("uploadedById").notNull(),

  originalName: text("originalName").notNull(),
  mimeType: text("mimeType").notNull(),
  sizeBytes: integer("sizeBytes").notNull(),
  storageKey: text("storageKey").notNull(),
  sha256: text("sha256"),
});
```

#### apps/api/db/schema/supportMessage.ts

```ts
import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `SupportMessage` table (minimal fields for router notifications).
export const supportMessages = dbSchema.table("support_messages", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),

  ticketId: text("ticketId").notNull(),
  authorId: text("authorId").notNull(),
  message: text("message").notNull(),
});
```

#### apps/api/db/schema/supportTicket.ts

```ts
import { text, timestamp } from "drizzle-orm/pg-core";
import { dbSchema } from "./_dbSchema";
import {
  supportRoleContextEnum,
  supportTicketCategoryEnum,
  supportTicketPriorityEnum,
  supportTicketStatusEnum,
  supportTicketTypeEnum,
} from "./enums";

// Mirrors Prisma `SupportTicket` table (minimal fields for router notifications).
export const supportTickets = dbSchema.table("support_tickets", {
  id: text("id").primaryKey(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),

  type: supportTicketTypeEnum("type").notNull(),
  status: supportTicketStatusEnum("status").notNull().default("OPEN"),
  category: supportTicketCategoryEnum("category").notNull(),
  priority: supportTicketPriorityEnum("priority").notNull().default("NORMAL"),

  createdById: text("createdById").notNull(),
  assignedToId: text("assignedToId"),

  roleContext: supportRoleContextEnum("roleContext").notNull(),
  subject: text("subject").notNull(),
});
```

#### apps/api/db/schema/user.ts

```ts
import { text, timestamp } from "drizzle-orm/pg-core";
import { countryCodeEnum, userRoleEnum, userStatusEnum } from "./enums";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `User` table (only fields referenced by jobs/drafts).
export const users = dbSchema.table("User", {
  id: text("id").primaryKey(),

  authUserId: text("authUserId").unique(),
  email: text("email").unique(),
  phone: text("phone"),
  name: text("name"),

  role: userRoleEnum("role").notNull().default("USER"),
  status: userStatusEnum("status").notNull().default("ACTIVE"),

  // Account lifecycle (soft controls; never hard-delete financial data)
  accountStatus: text("accountStatus").notNull().default("ACTIVE"),
  suspendedUntil: timestamp("suspendedUntil", { mode: "date" }),
  archivedAt: timestamp("archivedAt", { mode: "date" }),
  deletionReason: text("deletionReason"),

  country: countryCodeEnum("country").notNull().default("US"),

  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});
```
