#!/usr/bin/env tsx
/**
 * PHASE 5 — Drizzle Schema Validation (Phase A Guard)
 *
 * Connects to production (or DATABASE_URL) and compares:
 * - information_schema.columns for public.jobs
 * - Expected columns from apps/api/db/schema/job.ts
 * - pg_enum values for jobs-related enums (no silent enum changes in prod)
 *
 * Fails on: missing columns, extra columns, type mismatch, enum label change.
 *
 * Usage: DOTENV_CONFIG_PATH=.env.local pnpm exec tsx scripts/validate_jobs_schema.ts
 */

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
import { Client } from "pg";

// Phase A: expected enum values (from db/schema/enums.ts). No one may add/change in prod without updating here.
const EXPECTED_ENUMS: Record<string, string[]> = {
  JobStatus: [
    "DRAFT", "PUBLISHED", "ASSIGNED", "IN_PROGRESS", "CONTRACTOR_COMPLETED", "CUSTOMER_APPROVED",
    "CUSTOMER_REJECTED", "COMPLETION_FLAGGED", "COMPLETED_APPROVED", "OPEN_FOR_ROUTING", "COMPLETED", "DISPUTED",
  ],
  PublicJobStatus: ["OPEN", "IN_PROGRESS"],
  PaymentStatus: ["UNPAID", "REQUIRES_ACTION", "FUNDED", "FAILED", "REFUNDED", "AUTHORIZED", "FUNDS_SECURED", "EXPIRED_UNFUNDED"],
  JobPayoutStatus: ["NOT_READY", "READY", "RELEASED", "FAILED"],
  RoutingStatus: ["UNROUTED", "ROUTED_BY_ROUTER", "ROUTED_BY_ADMIN"],
};

const EXPECTED_COLUMNS: Array<{ name: string; dataType: string; udtName?: string }> = [
  { name: "id", dataType: "text", udtName: "text" },
  { name: "status", dataType: "USER-DEFINED", udtName: "JobStatus" },
  { name: "archived", dataType: "boolean", udtName: "bool" },
  { name: "title", dataType: "text", udtName: "text" },
  { name: "scope", dataType: "text", udtName: "text" },
  { name: "region", dataType: "text", udtName: "text" },
  { name: "country", dataType: "USER-DEFINED", udtName: "CountryCode" },
  { name: "country_code", dataType: "USER-DEFINED", udtName: "CountryCode" },
  { name: "state_code", dataType: "text", udtName: "text" },
  { name: "currency", dataType: "USER-DEFINED", udtName: "CurrencyCode" },
  { name: "region_code", dataType: "text", udtName: "text" },
  { name: "region_name", dataType: "text", udtName: "text" },
  { name: "city", dataType: "text", udtName: "text" },
  { name: "postal_code", dataType: "text", udtName: "text" },
  { name: "address_full", dataType: "text", udtName: "text" },
  { name: "ai_appraisal_status", dataType: "USER-DEFINED", udtName: "AiAppraisalStatus" },
  { name: "ai_appraised_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "ai_suggested_total", dataType: "integer", udtName: "int4" },
  { name: "ai_price_range_low", dataType: "integer", udtName: "int4" },
  { name: "ai_price_range_high", dataType: "integer", udtName: "int4" },
  { name: "ai_confidence", dataType: "text", udtName: "text" },
  { name: "ai_reasoning", dataType: "text", udtName: "text" },
  { name: "pricing_intel", dataType: "jsonb", udtName: "jsonb" },
  { name: "pricing_intel_generated_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "pricing_intel_model", dataType: "text", udtName: "text" },
  { name: "superseded_by_job_id", dataType: "text", udtName: "text" },
  { name: "is_mock", dataType: "boolean", udtName: "bool" },
  { name: "mock_seed_batch", dataType: "text", udtName: "text" },
  { name: "public_status", dataType: "USER-DEFINED", udtName: "PublicJobStatus" },
  { name: "job_source", dataType: "USER-DEFINED", udtName: "JobSource" },
  { name: "repeat_contractor_discount_cents", dataType: "integer", udtName: "int4" },
  { name: "service_type", dataType: "text", udtName: "text" },
  { name: "trade_category", dataType: "USER-DEFINED", udtName: "TradeCategory" },
  { name: "time_window", dataType: "text", udtName: "text" },
  { name: "router_earnings_cents", dataType: "integer", udtName: "int4" },
  { name: "broker_fee_cents", dataType: "integer", udtName: "int4" },
  { name: "contractor_payout_cents", dataType: "integer", udtName: "int4" },
  { name: "labor_total_cents", dataType: "integer", udtName: "int4" },
  { name: "materials_total_cents", dataType: "integer", udtName: "int4" },
  { name: "transaction_fee_cents", dataType: "integer", udtName: "int4" },
  { name: "payment_status", dataType: "USER-DEFINED", udtName: "PaymentStatus" },
  { name: "payout_status", dataType: "USER-DEFINED", udtName: "JobPayoutStatus" },
  { name: "amount_cents", dataType: "integer", udtName: "int4" },
  { name: "payment_currency", dataType: "text", udtName: "text" },
  { name: "stripe_payment_intent_id", dataType: "text", udtName: "text" },
  { name: "stripe_charge_id", dataType: "text", udtName: "text" },
  { name: "stripe_customer_id", dataType: "text", udtName: "text" },
  { name: "stripe_payment_method_id", dataType: "text", udtName: "text" },
  { name: "accepted_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "authorization_expires_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "funds_secured_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "completion_deadline_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "funded_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "released_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "refunded_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "contractor_transfer_id", dataType: "text", udtName: "text" },
  { name: "router_transfer_id", dataType: "text", udtName: "text" },
  { name: "escrow_locked_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "payment_captured_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "payment_released_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "price_median_cents", dataType: "integer", udtName: "int4" },
  { name: "price_adjustment_cents", dataType: "integer", udtName: "int4" },
  { name: "pricing_version", dataType: "text", udtName: "text" },
  { name: "junk_hauling_items", dataType: "jsonb", udtName: "jsonb" },
  { name: "availability", dataType: "jsonb", udtName: "jsonb" },
  { name: "job_type", dataType: "USER-DEFINED", udtName: "JobType" },
  { name: "lat", dataType: "double precision", udtName: "float8" },
  { name: "lng", dataType: "double precision", udtName: "float8" },
  { name: "created_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "published_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "updated_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "job_poster_user_id", dataType: "text", udtName: "text" },
  { name: "contacted_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "guarantee_eligible_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "claimed_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "claimed_by_user_id", dataType: "text", udtName: "text" },
  { name: "admin_routed_by_id", dataType: "text", udtName: "text" },
  { name: "contractor_user_id", dataType: "text", udtName: "text" },
  { name: "posted_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "routing_due_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "first_routed_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "routing_status", dataType: "USER-DEFINED", udtName: "RoutingStatus" },
  { name: "failsafe_routing", dataType: "boolean", udtName: "bool" },
  { name: "routed_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "contractor_completed_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "contractor_completion_summary", dataType: "text", udtName: "text" },
  { name: "customer_approved_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "customer_rejected_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "customer_reject_reason", dataType: "USER-DEFINED", udtName: "CustomerRejectReason" },
  { name: "customer_reject_notes", dataType: "text", udtName: "text" },
  { name: "customer_feedback", dataType: "text", udtName: "text" },
  { name: "customer_completion_summary", dataType: "text", udtName: "text" },
  { name: "router_approved_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "router_approval_notes", dataType: "text", udtName: "text" },
  { name: "completion_flagged_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "completion_flag_reason", dataType: "text", udtName: "text" },
  { name: "contractor_action_token_hash", dataType: "text", udtName: "text" },
  { name: "customer_action_token_hash", dataType: "text", udtName: "text" },
  { name: "estimated_completion_date", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "estimate_set_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "estimate_updated_at", dataType: "timestamp with time zone", udtName: "timestamptz" },
  { name: "estimate_update_reason", dataType: "USER-DEFINED", udtName: "EcdUpdateReason" },
  { name: "estimate_update_other_text", dataType: "text", udtName: "text" },
];

type DbColumn = { column_name: string; data_type: string; udt_name: string };

function typesCompatible(expected: string, actual: string): boolean {
  if (expected === actual) return true;
  const tsVariants = ["timestamp with time zone", "timestamp without time zone", "timestamptz", "timestamp"];
  if (tsVariants.includes(expected) && tsVariants.includes(actual)) return true;
  return false;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  const res = await client.query<DbColumn>(`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jobs'
    ORDER BY ordinal_position
  `);

  // Validate enum labels (Phase A guard: no silent enum changes in prod)
  type EnumRow = { typname: string; enumlabel: string; enumsortorder: number };
  const enumRes = await client.query<EnumRow>(`
    SELECT t.typname, e.enumlabel, e.enumsortorder
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public' AND t.typname = ANY($1::text[])
    ORDER BY t.typname, e.enumsortorder
  `, [Object.keys(EXPECTED_ENUMS)]);

  await client.end();

  const dbColumns = new Map(res.rows.map((r) => [r.column_name, r]));
  const expectedNames = new Set(EXPECTED_COLUMNS.map((e) => e.name));

  const missing: string[] = [];
  const extra: string[] = [];
  const mismatches: Array<{ column: string; expected: string; actual: string }> = [];

  for (const exp of EXPECTED_COLUMNS) {
    const dbCol = dbColumns.get(exp.name);
    if (!dbCol) {
      missing.push(exp.name);
      continue;
    }
    const expUdt = exp.udtName ?? exp.dataType;

    if (exp.dataType === "USER-DEFINED") {
      if (dbCol.data_type !== "USER-DEFINED" || dbCol.udt_name !== expUdt) {
        mismatches.push({
          column: exp.name,
          expected: `enum ${expUdt}`,
          actual: `${dbCol.data_type} (${dbCol.udt_name})`,
        });
      }
    } else if (!typesCompatible(exp.dataType, dbCol.data_type)) {
      mismatches.push({
        column: exp.name,
        expected: `${exp.dataType} (${exp.udtName ?? ""})`,
        actual: `${dbCol.data_type} (${dbCol.udt_name})`,
      });
    }
  }

  for (const name of dbColumns.keys()) {
    if (!expectedNames.has(name)) {
      extra.push(name);
    }
  }

  // Enum label validation
  const dbEnumLabels = new Map<string, string[]>();
  for (const row of enumRes.rows) {
    const arr = dbEnumLabels.get(row.typname) ?? [];
    arr.push(row.enumlabel);
    dbEnumLabels.set(row.typname, arr);
  }
  const enumMismatches: string[] = [];
  for (const [name, expected] of Object.entries(EXPECTED_ENUMS)) {
    const actual = dbEnumLabels.get(name) ?? [];
    const expSet = new Set(expected);
    const actSet = new Set(actual);
    if (actual.length !== expected.length || expected.some((v) => !actSet.has(v)) || actual.some((v) => !expSet.has(v))) {
      enumMismatches.push(`Enum ${name}: expected [${expected.join(", ")}], got [${actual.join(", ")}]`);
    }
  }

  if (missing.length > 0) {
    console.error("Missing columns in public.jobs:", missing.join(", "));
  }
  if (extra.length > 0) {
    console.error("Extra columns in public.jobs (not in Drizzle schema):", extra.join(", "));
  }
  if (mismatches.length > 0) {
    for (const m of mismatches) {
      console.error(`Column ${m.column}: expected ${m.expected}, got ${m.actual}`);
    }
  }
  if (enumMismatches.length > 0) {
    for (const msg of enumMismatches) {
      console.error(msg);
    }
  }

  if (missing.length > 0 || extra.length > 0 || mismatches.length > 0 || enumMismatches.length > 0) {
    process.exit(1);
  }

  console.log("public.jobs schema matches Drizzle schema.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
