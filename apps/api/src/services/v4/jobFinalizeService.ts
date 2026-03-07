/**
 * Deterministic Post-a-Job finalize service.
 * Raw SQL insert only. No Drizzle .insert(jobs).
 * Ledger decoupled (failure must not break job creation).
 */

import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { tradeCategoryEnum } from "@/db/schema/enums";
import { stripe } from "@/src/payments/stripe";
import { writeAuthHoldLedger, writeChargeLedger } from "@/src/services/escrow/ledger";
import { TRADE_CATEGORIES_CANONICAL } from "@/src/validation/v4/constants";
import { deriveCountryFromRegion } from "@/src/jobs/jurisdictionGuard";
import { normalizeRegionToCode } from "@/src/services/v4/geocodeService";

export type FinalizeResult = { jobId: string; created: boolean };

type LooseRecord = Record<string, unknown>;

function asObject(v: unknown): LooseRecord {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as LooseRecord) : {};
}

function toLedgerCurrency(value: unknown): "CAD" | "USD" {
  const n = String(value ?? "").trim().toUpperCase();
  if (n === "CAD") return "CAD";
  if (n === "USD") return "USD";
  return "USD";
}

export async function finalizeJob(userId: string, payload: unknown): Promise<FinalizeResult> {
  const body = asObject(payload);
  const details = asObject(body.details);
  const payment = asObject(body.payment);

  const paymentIntentId = String(payment.paymentIntentId ?? body.paymentIntentId ?? "").trim();
  if (!paymentIntentId || !stripe) {
    throw Object.assign(new Error("Completed payment is required before finalize."), { status: 409 });
  }

  // A. Stripe validation
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  const piStatus = String(pi.status ?? "").toLowerCase();
  const isValidStatus = piStatus === "requires_capture" || piStatus === "succeeded";
  if (!isValidStatus) {
    throw Object.assign(new Error("Payment not completed. Complete Stripe confirmation first."), { status: 409 });
  }

  const stripeAmountCents =
    Number.isInteger(pi.amount_received) && Number(pi.amount_received) > 0
      ? Number(pi.amount_received)
      : Number.isInteger(pi.amount)
        ? Number(pi.amount)
        : 0;
  if (!Number.isInteger(stripeAmountCents) || stripeAmountCents <= 0) {
    throw Object.assign(new Error("Invalid Stripe amount."), { status: 409 });
  }

  const currencyRaw = String(pi.currency ?? "").toUpperCase();
  if (currencyRaw !== "CAD" && currencyRaw !== "USD") {
    throw Object.assign(new Error(`Unsupported Stripe currency: ${currencyRaw || "(empty)"}`), { status: 409 });
  }
  const currency = toLedgerCurrency(pi.currency);

  // B. Idempotency check
  const existingRows = await db
    .select({ id: jobs.id, jobPosterUserId: jobs.job_poster_user_id })
    .from(jobs)
    .where(eq(jobs.stripe_payment_intent_id, paymentIntentId))
    .limit(1);
  const existing = existingRows[0] ?? null;
  if (existing?.id) {
    if (existing.jobPosterUserId !== userId) {
      throw Object.assign(new Error("Payment intent already mapped to a different user."), { status: 409 });
    }
    return { jobId: existing.id, created: false };
  }

  // Extract details
  const title = String(details.title ?? "").trim();
  const scope = String(details.description ?? details.scope ?? "").trim();
  const tradeCategory = String(details.tradeCategory ?? "")
    .trim()
    .toUpperCase();
  if (
    !tradeCategory ||
    !TRADE_CATEGORIES_CANONICAL.includes(tradeCategory as (typeof TRADE_CATEGORIES_CANONICAL)[number]) ||
    !tradeCategoryEnum.enumValues.includes(tradeCategory as (typeof tradeCategoryEnum.enumValues)[number])
  ) {
    throw Object.assign(new Error("Trade category is required."), { status: 400 });
  }
  if (!title || !scope) {
    throw Object.assign(new Error("Title and description are required."), { status: 400 });
  }

  const rawStateCode = String(details.stateCode ?? details.region ?? details.province ?? "").trim().toUpperCase();
  const stateCode = normalizeRegionToCode(rawStateCode);
  const region = stateCode ? stateCode.toLowerCase() : "unspecified";
  const resolvedCountryCode = deriveCountryFromRegion(stateCode) ?? (currencyRaw === "CAD" ? "CA" : "US");
  const isRegional = Boolean(details.isRegional ?? details.isRegionalRequested);
  const jobType = isRegional ? "regional" : "urban";

  const jobId = randomUUID();

  // C. Minimal raw SQL insert (16 columns, NO Drizzle .insert)
  try {
  await db.execute(
    sql`
    INSERT INTO jobs (
      id,
      job_poster_user_id,
      title,
      scope,
      trade_category,
      status,
      routing_status,
      job_type,
      currency,
      amount_cents,
      total_amount_cents,
      stripe_payment_intent_id,
      stripe_payment_intent_status,
      region,
      country,
      country_code,
      state_code,
      region_code,
      cancel_request_pending,
      created_at,
      updated_at
    ) VALUES (
      ${jobId},
      ${userId},
      ${title},
      ${scope},
      ${tradeCategory},
      'OPEN_FOR_ROUTING',
      'UNROUTED',
      ${jobType},
      ${currencyRaw},
      ${stripeAmountCents},
      ${stripeAmountCents},
      ${paymentIntentId},
      ${String(pi.status ?? "")},
      ${region},
      ${resolvedCountryCode},
      ${resolvedCountryCode},
      ${stateCode},
      ${stateCode || null},
      false,
      NOW(),
      NOW()
    )
  `,
  );
  } catch (err: any) {
    if (err?.code === "23505") {
      const raceRows = await db
        .select({ id: jobs.id, jobPosterUserId: jobs.job_poster_user_id })
        .from(jobs)
        .where(eq(jobs.stripe_payment_intent_id, paymentIntentId))
        .limit(1);
      const raceExisting = raceRows[0] ?? null;
      if (raceExisting?.id) {
        if (raceExisting.jobPosterUserId !== userId) {
          throw Object.assign(new Error("Payment intent already mapped to a different user."), { status: 409 });
        }
        return { jobId: raceExisting.id, created: false };
      }
    }
    throw err;
  }

  // D. Ledger (post-insert only, failure must not break job creation)
  try {
    if (piStatus === "succeeded") {
      await writeChargeLedger(db as any, {
        jobId,
        totalAmountCents: stripeAmountCents,
        currency,
        paymentIntentId,
      });
    } else {
      await writeAuthHoldLedger(db as any, {
        jobId,
        totalAmountCents: stripeAmountCents,
        currency,
        paymentIntentId,
      });
    }
  } catch (err) {
    console.warn("[POST_JOB_LEDGER_FAIL]", err);
  }

  return { jobId, created: true };
}
