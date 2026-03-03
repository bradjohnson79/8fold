/**
 * Minimal Post-a-Job insert adapter.
 * Uses raw SQL only. No Drizzle .insert(jobs).
 * Ledger must run AFTER transaction commit.
 */

import { sql } from "drizzle-orm";
import { db } from "@/db/drizzle";

type ExecuteExecutor = { execute: typeof db.execute };

export type CreateJobMinimalParams = {
  jobId: string;
  userId: string;
  title: string;
  scope: string;
  tradeCategory: string;
  status: string;
  routingStatus: string;
  currency: "CAD" | "USD";
  amountCents: number;
  totalAmountCents: number;
  stripePaymentIntentId: string;
  stripePaymentIntentStatus: string;
  createdAt: Date;
  updatedAt: Date;
  region?: string | null;
  countryCode?: string | null;
  stateCode?: string | null;
};

let requiredColumnsPromise: Promise<string[]> | null = null;
let requiredColumnsLogged = false;

async function loadRequiredColumns(executor: ExecuteExecutor): Promise<string[]> {
  if (!requiredColumnsPromise) {
    requiredColumnsPromise = (async () => {
      const result = await executor.execute(sql`
        select column_name, is_nullable, column_default
        from information_schema.columns
        where table_schema = 'public' and table_name = 'jobs'
      `);

      const rows = Array.isArray(result)
        ? result
        : Array.isArray((result as any)?.rows)
          ? (result as any).rows
          : [];

      const required: string[] = rows
        .filter(
          (row: any) =>
            String(row?.is_nullable ?? "").toUpperCase() === "NO" && row?.column_default == null,
        )
        .map((row: any) => String(row?.column_name ?? ""))
        .filter(Boolean);

      return required;
    })();
  }

  return requiredColumnsPromise;
}

function normalizeCountryCode(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "CA") return "CA";
  if (normalized === "US") return "US";
  return "US";
}

/**
 * Creates a job using raw SQL insert. No Drizzle .insert(jobs).
 * Returns jobId. Ledger must be called after transaction commit.
 */
export async function createJobMinimalInsert(
  executor: ExecuteExecutor,
  params: CreateJobMinimalParams,
): Promise<string> {
  const requiredColumns = await loadRequiredColumns(executor);

  if (!requiredColumnsLogged) {
    requiredColumnsLogged = true;
    console.warn("[POST_JOB_REQUIRED_COLUMNS]", requiredColumns);
  }

  const requiredSet = new Set(requiredColumns);
  const region = String(params.region ?? params.stateCode ?? "").trim().toLowerCase() || "unspecified";
  const countryCode = normalizeCountryCode(params.countryCode);
  const stateCode = String(params.stateCode ?? params.region ?? "").trim().toUpperCase() || "";

  const insertValues: Record<string, unknown> = {
    id: params.jobId,
    job_poster_user_id: params.userId,
    title: params.title,
    scope: params.scope,
    trade_category: params.tradeCategory,
    status: params.status,
    routing_status: params.routingStatus,
    currency: params.currency,
    amount_cents: params.amountCents,
    total_amount_cents: params.totalAmountCents,
    stripe_payment_intent_id: params.stripePaymentIntentId,
    stripe_payment_intent_status: params.stripePaymentIntentStatus,
    created_at: params.createdAt,
    updated_at: params.updatedAt,
  };

  if (requiredSet.has("region")) {
    insertValues.region = region;
  }
  if (requiredSet.has("country")) {
    insertValues.country = countryCode;
  }
  if (requiredSet.has("country_code")) {
    insertValues.country_code = countryCode;
  }
  if (requiredSet.has("state_code")) {
    insertValues.state_code = stateCode || region.toUpperCase() || "";
  }

  const insertKeys = Object.keys(insertValues);
  const columnSql = sql.join(insertKeys.map((key) => sql.raw(`"${key}"`)), sql`, `);
  const valueSql = sql.join(insertKeys.map((key) => sql`${insertValues[key]}`), sql`, `);

  try {
    await executor.execute(sql`insert into "jobs" (${columnSql}) values (${valueSql})`);
  } catch (err) {
    const dbErr = err as any;
    const code = String(dbErr?.code ?? "");
    const constraint = dbErr?.constraint ?? null;
    const column = dbErr?.column ?? null;
    const detail = dbErr?.detail ?? null;

    console.error("[POST_JOB_DB_ERROR]", { code, constraint, column, detail });

    let status = 409;
    if (code === "23505") status = 409;
    else if (code === "23514" || code === "23502" || code.startsWith("22")) status = 400;
    else if (code === "23503") status = 409;

    throw Object.assign(new Error("Post job insert failed."), {
      status,
      code: "POST_JOB_DB_ERROR",
      details: { code, constraint, column, detail },
    });
  }

  return params.jobId;
}
