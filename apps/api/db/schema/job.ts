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

// Production-aligned: table "jobs", all columns snake_case.
// Matches 0054 normalization. No camelCase.
export const jobs = dbSchema.table(
  "jobs",
  {
    id: text("id").primaryKey(),
    status: jobStatusEnum("status").notNull().default("PUBLISHED"),
    archived: boolean("archived").notNull().default(false),

    title: text("title").notNull(),
    scope: text("scope").notNull(),
    region: text("region").notNull(),

    country: countryCodeEnum("country").notNull().default("US"),
    country_code: countryCodeEnum("country_code").notNull().default("US"),
    state_code: text("state_code").notNull().default(""),
    currency: currencyCodeEnum("currency").notNull().default("USD"),
    region_code: text("region_code"),
    region_name: text("region_name"),
    city: text("city"),
    postal_code: text("postal_code"),
    address_full: text("address_full"),

    ai_appraisal_status: aiAppraisalStatusEnum("ai_appraisal_status").notNull().default("PENDING"),
    ai_appraised_at: timestamp("ai_appraised_at", { mode: "date" }),
    ai_suggested_total: integer("ai_suggested_total"),
    ai_price_range_low: integer("ai_price_range_low"),
    ai_price_range_high: integer("ai_price_range_high"),
    ai_confidence: text("ai_confidence"),
    ai_reasoning: text("ai_reasoning"),
    pricing_intel: jsonb("pricing_intel"),
    pricing_intel_generated_at: timestamp("pricing_intel_generated_at", { mode: "date" }),
    pricing_intel_model: text("pricing_intel_model"),
    superseded_by_job_id: text("superseded_by_job_id"),

    is_mock: boolean("is_mock").notNull().default(false),
    mock_seed_batch: text("mock_seed_batch"),
    public_status: publicJobStatusEnum("public_status").notNull().default("OPEN"),
    job_source: jobSourceEnum("job_source").notNull().default("REAL"),

    repeat_contractor_discount_cents: integer("repeat_contractor_discount_cents").notNull().default(0),

    service_type: text("service_type").notNull().default("handyman"),
    trade_category: tradeCategoryEnum("trade_category").notNull().default("HANDYMAN"),
    time_window: text("time_window"),

    router_earnings_cents: integer("router_earnings_cents").notNull().default(0),
    broker_fee_cents: integer("broker_fee_cents").notNull().default(0),
    contractor_payout_cents: integer("contractor_payout_cents").notNull().default(0),

    labor_total_cents: integer("labor_total_cents").notNull().default(0),
    materials_total_cents: integer("materials_total_cents").notNull().default(0),
    transaction_fee_cents: integer("transaction_fee_cents").notNull().default(0),

    payment_status: paymentStatusEnum("payment_status").notNull().default("UNPAID"),
    payout_status: jobPayoutStatusEnum("payout_status").notNull().default("NOT_READY"),
    amount_cents: integer("amount_cents").notNull().default(0),
    payment_currency: text("payment_currency").notNull().default("cad"),
    stripe_payment_intent_id: text("stripe_payment_intent_id"),
    stripe_charge_id: text("stripe_charge_id"),
    stripe_customer_id: text("stripe_customer_id"),
    stripe_payment_method_id: text("stripe_payment_method_id"),

    accepted_at: timestamp("accepted_at", { mode: "date" }),
    authorization_expires_at: timestamp("authorization_expires_at", { mode: "date" }),
    funds_secured_at: timestamp("funds_secured_at", { mode: "date" }),
    completion_deadline_at: timestamp("completion_deadline_at", { mode: "date" }),
    funded_at: timestamp("funded_at", { mode: "date" }),
    released_at: timestamp("released_at", { mode: "date" }),
    refunded_at: timestamp("refunded_at", { mode: "date" }),
    contractor_transfer_id: text("contractor_transfer_id"),
    router_transfer_id: text("router_transfer_id"),

    escrow_locked_at: timestamp("escrow_locked_at", { mode: "date" }),
    payment_captured_at: timestamp("payment_captured_at", { mode: "date" }),
    payment_released_at: timestamp("payment_released_at", { mode: "date" }),

    price_median_cents: integer("price_median_cents"),
    price_adjustment_cents: integer("price_adjustment_cents"),
    pricing_version: text("pricing_version").notNull().default("v1-median-delta"),

    junk_hauling_items: jsonb("junk_hauling_items"),
    availability: jsonb("availability"),

    job_type: jobTypeEnum("job_type").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),

    created_at: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    published_at: timestamp("published_at", { mode: "date" }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),

    job_poster_user_id: text("job_poster_user_id"),

    contacted_at: timestamp("contacted_at", { mode: "date" }),
    guarantee_eligible_at: timestamp("guarantee_eligible_at", { mode: "date" }),

    claimed_at: timestamp("claimed_at", { mode: "date" }),
    claimed_by_user_id: text("claimed_by_user_id"),

    admin_routed_by_id: text("admin_routed_by_id"),
    contractor_user_id: text("contractor_user_id"),

    posted_at: timestamp("posted_at", { mode: "date" }).notNull().defaultNow(),
    routing_due_at: timestamp("routing_due_at", { mode: "date" }),
    first_routed_at: timestamp("first_routed_at", { mode: "date" }),
    routing_status: routingStatusEnum("routing_status").notNull().default("UNROUTED"),
    failsafe_routing: boolean("failsafe_routing").notNull().default(false),
    routed_at: timestamp("routed_at", { mode: "date" }),

    contractor_completed_at: timestamp("contractor_completed_at", { mode: "date" }),
    contractor_completion_summary: text("contractor_completion_summary"),

    customer_approved_at: timestamp("customer_approved_at", { mode: "date" }),
    customer_rejected_at: timestamp("customer_rejected_at", { mode: "date" }),
    customer_reject_reason: customerRejectReasonEnum("customer_reject_reason"),
    customer_reject_notes: text("customer_reject_notes"),
    customer_feedback: text("customer_feedback"),
    customer_completion_summary: text("customer_completion_summary"),

    router_approved_at: timestamp("router_approved_at", { mode: "date" }),
    router_approval_notes: text("router_approval_notes"),

    completion_flagged_at: timestamp("completion_flagged_at", { mode: "date" }),
    completion_flag_reason: text("completion_flag_reason"),

    contractor_action_token_hash: text("contractor_action_token_hash"),
    customer_action_token_hash: text("customer_action_token_hash"),

    estimated_completion_date: timestamp("estimated_completion_date", { mode: "date" }),
    estimate_set_at: timestamp("estimate_set_at", { mode: "date" }),
    estimate_updated_at: timestamp("estimate_updated_at", { mode: "date" }),
    estimate_update_reason: ecdUpdateReasonEnum("estimate_update_reason"),
    estimate_update_other_text: text("estimate_update_other_text"),
  },
  (t) => ({
    archivedIdx: index("jobs_archived_idx").on(t.archived),
    statusIdx: index("idx_jobs_status").on(t.status),
    routingStatusIdx: index("idx_jobs_routing_status").on(t.routing_status),
    payoutStatusIdx: index("idx_jobs_payout_status").on(t.payout_status),
    createdAtIndex: index("idx_jobs_created_at").on(t.created_at),
  })
);
