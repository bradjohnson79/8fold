import {
  index,
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
  jobPayoutStatusEnum,
  jobSourceEnum,
  jobStatusEnum,
  jobTypeEnum,
  paymentStatusEnum,
  publicJobStatusEnum,
  routingStatusEnum,
  tradeCategoryEnum,
} from "./enums";
import { dbSchema } from "./_dbSchema";

// Mirrors Prisma `Job` table (scalar columns only).
export const jobs = dbSchema.table(
  "Job",
  {
  id: text("id").primaryKey(),
  status: jobStatusEnum("status").notNull().default("PUBLISHED"),
  archived: boolean("archived").notNull().default(false),

  title: text("title").notNull(),
  scope: text("scope").notNull(),
  region: text("region").notNull(),

  country: countryCodeEnum("country").notNull().default("US"),
  countryCode: countryCodeEnum("countryCode").notNull().default("US"),
  stateCode: text("stateCode").notNull().default(""),
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
  mockSeedBatch: text("mockSeedBatch"),
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

  // Stripe-backed payment/payout state (authoritative).
  paymentStatus: paymentStatusEnum("paymentStatus").notNull().default("UNPAID"),
  payoutStatus: jobPayoutStatusEnum("payoutStatus").notNull().default("NOT_READY"),
  amountCents: integer("amountCents").notNull().default(0),
  // Stripe uses lowercase currency codes (e.g. "cad"). Keep Job.currency (CurrencyCode) separate.
  paymentCurrency: text("paymentCurrency").notNull().default("cad"),
  stripePaymentIntentId: text("stripePaymentIntentId"),
  stripeChargeId: text("stripeChargeId"),
  stripeCustomerId: text("stripeCustomerId"),
  stripePaymentMethodId: text("stripePaymentMethodId"),
  fundedAt: timestamp("fundedAt", { mode: "date" }),
  releasedAt: timestamp("releasedAt", { mode: "date" }),
  refundedAt: timestamp("refundedAt", { mode: "date" }),
  contractorTransferId: text("contractorTransferId"),
  routerTransferId: text("routerTransferId"),

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
  // Prisma `@updatedAt` (application-managed) — no DB default in some environments.
  // We keep a defaultNow so inserts work even when app doesn't explicitly set it.
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),

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
  customerCompletionSummary: text("customerCompletionSummary"),

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
  },
  (t) => ({
    archivedIdx: index("Job_archived_idx").on(t.archived),
  }),
);

