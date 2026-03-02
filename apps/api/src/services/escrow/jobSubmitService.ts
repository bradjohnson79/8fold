import { randomUUID } from "crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  countryCodeEnum,
  currencyCodeEnum,
  jobStatusEnum,
  jobTypeEnum,
  paymentStatusEnum,
  routingStatusEnum,
  tradeCategoryEnum,
} from "@/db/schema/enums";
import { jobs } from "@/db/schema/job";
import { jobPayments } from "@/db/schema/jobPayment";
import { jobPhotos } from "@/db/schema/jobPhoto";
import { v4JobUploads } from "@/db/schema/v4JobUpload";
import { stripe } from "@/src/payments/stripe";
import { writeAuthHoldLedger, writeChargeLedger } from "@/src/services/escrow/ledger";
import { getFeeConfig } from "@/src/services/v4/paymentFeeConfigService";
import { computeModelAPricing } from "@/src/services/v4/modelAPricingService";
import { TRADE_CATEGORIES_CANONICAL } from "@/src/validation/v4/constants";

type LooseRecord = Record<string, unknown>;
type UploadInput = { uploadId: string; url: string };

type SubmitResult = {
  jobId: string;
  created: boolean;
};

type SchemaGuardResult = {
  columns: Set<string>;
  requiredNoDefaultColumns: Set<string>;
};

const REQUIRED_JOB_SUBMIT_COLUMNS = [
  "total_amount_cents",
  "amount_cents",
  "currency",
  "job_poster_user_id",
  "status",
  "routing_status",
  "stripe_payment_intent_id",
] as const;

const REQUIRED_NON_NULL_OR_DEFAULT_COLUMNS = ["total_amount_cents", "amount_cents", "currency", "status", "routing_status"] as const;

const REQUIRED_INSERT_COLUMNS = ["id", "title", "scope", "region", "status", "routing_status", "job_poster_user_id"] as const;

const COUNTRY_CA = countryCodeEnum.enumValues.includes("CA") ? "CA" : countryCodeEnum.enumValues[0];
const COUNTRY_US = countryCodeEnum.enumValues.includes("US") ? "US" : countryCodeEnum.enumValues[0];
const CURRENCY_CAD = currencyCodeEnum.enumValues.includes("CAD") ? "CAD" : currencyCodeEnum.enumValues[0];
const CURRENCY_USD = currencyCodeEnum.enumValues.includes("USD") ? "USD" : currencyCodeEnum.enumValues[0];
const JOB_STATUS_OPEN_FOR_ROUTING = jobStatusEnum.enumValues.includes("OPEN_FOR_ROUTING")
  ? "OPEN_FOR_ROUTING"
  : jobStatusEnum.enumValues[0];
const ROUTING_STATUS_UNROUTED = routingStatusEnum.enumValues.includes("UNROUTED")
  ? "UNROUTED"
  : routingStatusEnum.enumValues[0];
const PAYMENT_STATUS_AUTHORIZED = paymentStatusEnum.enumValues.includes("AUTHORIZED")
  ? "AUTHORIZED"
  : paymentStatusEnum.enumValues[0];
const PAYMENT_STATUS_FUNDS_SECURED = paymentStatusEnum.enumValues.includes("FUNDS_SECURED")
  ? "FUNDS_SECURED"
  : PAYMENT_STATUS_AUTHORIZED;
const JOB_TYPE_REGIONAL = jobTypeEnum.enumValues.includes("regional") ? "regional" : jobTypeEnum.enumValues[0];
const JOB_TYPE_URBAN = jobTypeEnum.enumValues.includes("urban") ? "urban" : jobTypeEnum.enumValues[0];
const TRADE_CATEGORY_FALLBACK = tradeCategoryEnum.enumValues.includes("HANDYMAN") ? "HANDYMAN" : tradeCategoryEnum.enumValues[0];
const SERVICE_TYPE_HANDYMAN = "handyman";

let jobsSubmitSchemaGuardResult: SchemaGuardResult | null = null;

function asObject(v: unknown): LooseRecord {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as LooseRecord) : {};
}

function hasAvailabilitySelection(v: unknown): boolean {
  const root = asObject(v);
  for (const day of Object.values(root)) {
    const blocks = asObject(day);
    if (blocks.morning === true || blocks.afternoon === true || blocks.evening === true) return true;
  }
  return false;
}

function parseImages(value: unknown): UploadInput[] {
  if (!Array.isArray(value)) return [];
  const out: UploadInput[] = [];
  for (const item of value) {
    const obj = asObject(item);
    const uploadId = String(obj.uploadId ?? "").trim();
    const url = String(obj.url ?? "").trim();
    if (!uploadId) continue;
    out.push({ uploadId, url });
  }
  return out;
}

function toIntegerOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function buildSchemaSafeInsertPayload(jobInsertValues: Record<string, unknown>, schemaColumns: Set<string>): {
  filteredInsert: Record<string, unknown>;
  droppedColumns: string[];
} {
  const filteredInsert = Object.fromEntries(
    Object.entries(jobInsertValues).filter(([column]) => schemaColumns.has(column)),
  ) as Record<string, unknown>;
  const droppedColumns = Object.keys(jobInsertValues).filter((column) => !schemaColumns.has(column));
  return { filteredInsert, droppedColumns };
}

async function assertJobSubmitSchemaGuard(): Promise<SchemaGuardResult> {
  if (jobsSubmitSchemaGuardResult) return jobsSubmitSchemaGuardResult;

  const result = (await db.execute(
    sql`select column_name, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'jobs'`,
  )) as any;
  const rows = Array.isArray(result) ? result : Array.isArray(result?.rows) ? result.rows : [];
  const present = new Set<string>(rows.map((r: any) => String(r?.column_name ?? "")));
  const byName = new Map<string, { isNullable: boolean; columnDefault: unknown }>(
    rows.map((r: any) => [
      String(r?.column_name ?? ""),
      {
        isNullable: String(r?.is_nullable ?? "").toUpperCase() === "YES",
        columnDefault: r?.column_default ?? null,
      },
    ]),
  );
  const missing = REQUIRED_JOB_SUBMIT_COLUMNS.filter((columnName) => !present.has(columnName));
  const invalidRequiredColumns = REQUIRED_NON_NULL_OR_DEFAULT_COLUMNS.filter((columnName) => {
    const meta = byName.get(columnName);
    if (!meta) return false;
    return !meta.isNullable && meta.columnDefault == null;
  });
  const requiredNoDefaultColumns = new Set<string>(
    rows
      .filter((row: any) => String(row?.is_nullable ?? "").toUpperCase() === "NO" && row?.column_default == null)
      .map((row: any) => String(row?.column_name ?? "")),
  );

  if (missing.length > 0 || invalidRequiredColumns.length > 0) {
    console.error("[JOB_SUBMIT_SCHEMA_DRIFT]", {
      table: "jobs",
      missingColumns: missing,
      invalidRequiredColumns,
      requiredColumns: REQUIRED_JOB_SUBMIT_COLUMNS,
    });
    throw Object.assign(new Error("Jobs schema drift detected. Missing required submit columns."), {
      status: 500,
      code: "JOBS_SCHEMA_DRIFT",
      details: { missingColumns: missing, invalidRequiredColumns },
    });
  }

  jobsSubmitSchemaGuardResult = { columns: present, requiredNoDefaultColumns };
  return jobsSubmitSchemaGuardResult;
}

export async function submitJobFromPayload(userId: string, payload: unknown): Promise<SubmitResult> {
  const body = asObject(payload);
  const details = asObject(body.details);
  const pricing = asObject(body.pricing);
  const payment = asObject(body.payment);
  const availability = body.availability;

  const paymentIntentId = String(payment.paymentIntentId ?? "").trim();
  if (!paymentIntentId || !stripe) {
    throw Object.assign(new Error("Completed payment is required before submit."), { status: 409 });
  }

  const existingJobRows = await db
    .select({ id: jobs.id, jobPosterUserId: jobs.job_poster_user_id })
    .from(jobs)
    .where(eq(jobs.stripe_payment_intent_id, paymentIntentId))
    .limit(1);
  const existingJob = existingJobRows[0] ?? null;
  if (existingJob?.id) {
    if (existingJob.jobPosterUserId !== userId) {
      throw Object.assign(new Error("Payment intent already mapped to a different user."), { status: 409 });
    }
    return { jobId: existingJob.id, created: false };
  }

  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  const piStatus = String(pi.status ?? "").toLowerCase();
  const isAuthorizedHold = piStatus === "requires_capture";
  const isCapturedCharge = piStatus === "succeeded";
  if (!isAuthorizedHold && !isCapturedCharge) {
    throw Object.assign(new Error("Payment not completed. Complete Stripe confirmation first."), { status: 409 });
  }

  const title = String(details.title ?? "").trim();
  const scope = String(details.description ?? "").trim();
  const tradeCategory = String(details.tradeCategory ?? "").trim().toUpperCase();
  const countryCode = String(details.countryCode ?? "US").trim().toUpperCase() === COUNTRY_CA ? COUNTRY_CA : COUNTRY_US;
  const stateCode = String((pi.metadata as Record<string, string> | null | undefined)?.province ?? details.stateCode ?? details.region ?? "")
    .trim()
    .toUpperCase();
  const region = stateCode.toLowerCase();
  const city = String(details.city ?? "").trim();
  const postalCode = String(details.postalCode ?? "").trim();
  const address = String(details.address ?? "").trim();
  const lat = Number(details.lat);
  const lon = Number(details.lon);
  const isRegional = Boolean(pricing.isRegional ?? details.isRegional);

  const appraisalSubtotalCents = Number(pricing.appraisalPriceCents ?? pricing.selectedPriceCents ?? 0);
  const feeConfig = await getFeeConfig("card");
  const pricingResult = await computeModelAPricing({
    appraisalSubtotalCents,
    isRegional,
    country: countryCode,
    province: stateCode,
    percentBps: feeConfig.percentBps,
    fixedCents: feeConfig.fixedCents,
  });

  if (
    !tradeCategory ||
    !TRADE_CATEGORIES_CANONICAL.includes(tradeCategory as any) ||
    !tradeCategoryEnum.enumValues.includes(tradeCategory as any)
  ) {
    throw Object.assign(new Error("Trade category is required."), { status: 400 });
  }
  if (!title || !scope) {
    throw Object.assign(new Error("Title and description are required."), { status: 400 });
  }
  if (!address || !city || !postalCode || !stateCode || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw Object.assign(
      new Error("Address, city, postal code, region, country, and coordinates are required."),
      { status: 400 },
    );
  }
  if (!hasAvailabilitySelection(availability)) {
    throw Object.assign(new Error("At least one availability selection is required."), { status: 400 });
  }
  if (
    !Number.isInteger(pricingResult.appraisalSubtotalCents) ||
    pricingResult.appraisalSubtotalCents <= 0 ||
    !Number.isInteger(pricingResult.totalChargeCents) ||
    pricingResult.totalChargeCents <= 0
  ) {
    throw Object.assign(new Error("Invalid appraisal or total price."), { status: 400 });
  }
  const piMetadata = (pi.metadata ?? {}) as Record<string, string | undefined>;
  const metadataSplitBaseCents = toIntegerOrNull(piMetadata.splitBaseCents);
  const metadataTaxCents = toIntegerOrNull(piMetadata.taxCents);
  const metadataTaxRateBps = toIntegerOrNull(piMetadata.taxRateBps);
  const metadataProcessingFeeCents = toIntegerOrNull(piMetadata.estimatedProcessingFeeCents);

  const resolvedSplitBaseCents = metadataSplitBaseCents ?? pricingResult.baseSplitCents;
  const resolvedTaxCents =
    metadataTaxCents ??
    (metadataTaxRateBps != null ? Math.round((resolvedSplitBaseCents * metadataTaxRateBps) / 10000) : pricingResult.taxCents);
  const resolvedProcessingFeeCents = metadataProcessingFeeCents ?? pricingResult.estimatedProcessingFeeCents;
  const resolvedTotalCents = resolvedSplitBaseCents + resolvedTaxCents + resolvedProcessingFeeCents;

  const stripeAmountCents =
    Number.isInteger(pi.amount_received) && Number(pi.amount_received) > 0
      ? Number(pi.amount_received)
      : Number.isInteger(pi.amount)
        ? Number(pi.amount)
        : 0;
  if (stripeAmountCents !== resolvedTotalCents) {
    throw Object.assign(new Error("Stripe amount does not match canonical total."), {
      status: 409,
      code: "TOTAL_MISMATCH",
      details: {
        expectedTotalCents: resolvedTotalCents,
        stripeAmountCents,
        diffCents: stripeAmountCents - resolvedTotalCents,
      },
    });
  }
  if (String(pi.currency ?? "").toLowerCase() !== pricingResult.paymentCurrency) {
    throw Object.assign(new Error("Stripe currency does not match country pricing."), { status: 409 });
  }

  const schemaGuard = await assertJobSubmitSchemaGuard();

  const images = parseImages(body.images);
  const uploadIds = images.map((i) => i.uploadId);

  const now = new Date();
  const requestedJobId = String(payment.modelAJobId ?? payment.provisionalJobId ?? "").trim();
  let jobId = requestedJobId || randomUUID();
  const stripeChargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null;
  if (requestedJobId) {
    const existingByIdRows = await db
      .select({
        id: jobs.id,
        jobPosterUserId: jobs.job_poster_user_id,
        stripePaymentIntentId: jobs.stripe_payment_intent_id,
      })
      .from(jobs)
      .where(eq(jobs.id, requestedJobId))
      .limit(1);
    const existingById = existingByIdRows[0] ?? null;
    if (existingById?.id) {
      if (existingById.stripePaymentIntentId === paymentIntentId) {
        if (existingById.jobPosterUserId !== userId) {
          throw Object.assign(new Error("Payment intent already mapped to a different user."), { status: 409 });
        }
        return { jobId: existingById.id, created: false };
      }
      // Retry-safe: avoid duplicate PK if a provisional ID was re-used across attempts.
      jobId = randomUUID();
    }
  }

  const jobInsertValues: Record<string, unknown> = {
    id: jobId,
    status: JOB_STATUS_OPEN_FOR_ROUTING,
    archived: false,
    title,
    scope,
    region,
    country: countryCode,
    country_code: countryCode,
    state_code: stateCode,
    city,
    postal_code: postalCode,
    address_full: address,
    currency: pricingResult.currency === CURRENCY_CAD ? CURRENCY_CAD : CURRENCY_USD,
    payment_currency: pricingResult.paymentCurrency,
    service_type: SERVICE_TYPE_HANDYMAN,
    trade_category: tradeCategory || TRADE_CATEGORY_FALLBACK,
    lat,
    lng: lon,
    routing_status: ROUTING_STATUS_UNROUTED,
    job_poster_user_id: userId,
    stripe_payment_intent_id: paymentIntentId,
    stripe_payment_intent_status: String(pi.status ?? ""),
    payment_status: isCapturedCharge ? PAYMENT_STATUS_FUNDS_SECURED : PAYMENT_STATUS_AUTHORIZED,
    amount_cents: resolvedTotalCents,
    total_amount_cents: resolvedTotalCents,
    tax_amount_cents: resolvedTaxCents,
    transaction_fee_cents: resolvedProcessingFeeCents,
    job_type: isRegional ? JOB_TYPE_REGIONAL : JOB_TYPE_URBAN,
    region_code: stateCode,
    region_name: stateCode,
    province: stateCode,
    is_regional: isRegional,
    availability: availability as any,
    appraisal_subtotal_cents: pricingResult.appraisalSubtotalCents,
    regional_fee_cents: pricingResult.regionalFeeCents,
    tax_rate_bps: pricingResult.taxRateBps,
    labor_total_cents: pricingResult.legacy.laborTotalCents,
    price_adjustment_cents: pricingResult.legacy.priceAdjustmentCents,
    price_median_cents: pricingResult.appraisalSubtotalCents,
    contractor_payout_cents: pricingResult.contractorPayoutCents,
    router_earnings_cents: pricingResult.routerFeeCents,
    broker_fee_cents: pricingResult.platformFeeCents,
    posted_at: now,
    published_at: now,
    created_at: now,
    updated_at: now,
    ...(stripeChargeId ? { stripe_charge_id: stripeChargeId } : {}),
  };
  const { filteredInsert, droppedColumns } = buildSchemaSafeInsertPayload(jobInsertValues, schemaGuard.columns);
  if (droppedColumns.length > 0) {
    console.warn("[JOB_SUBMIT_DROPPED_COLUMNS]", { jobId, paymentIntentId, droppedColumns });
  }
  const missingRequiredBySchema = Array.from(schemaGuard.requiredNoDefaultColumns).filter(
    (column) => !Object.prototype.hasOwnProperty.call(filteredInsert, column),
  );
  const missingRequiredForSubmit = REQUIRED_INSERT_COLUMNS.filter(
    (column) => !Object.prototype.hasOwnProperty.call(filteredInsert, column),
  );
  if (missingRequiredBySchema.length > 0 || missingRequiredForSubmit.length > 0) {
    throw Object.assign(new Error("Schema-safe submit insert excluded required columns."), {
      status: 500,
      code: "JOBS_SCHEMA_DRIFT",
      details: {
        missingRequiredBySchema,
        missingRequiredForSubmit,
        droppedColumns,
      },
    });
  }

  try {
    await db.transaction(async (tx) => {
      try {
        await tx.insert(jobs).values(filteredInsert as any);
      } catch (err) {
        const dbErr = err as any;
        console.error("[JOB_SUBMIT_INSERT_FAILED]", {
          paymentIntentId,
          jobId,
          code: dbErr?.code,
          message: dbErr?.message,
          detail: dbErr?.detail,
          constraint: dbErr?.constraint,
          table: dbErr?.table,
          column: dbErr?.column,
          stack: String(dbErr?.stack ?? "").split("\n")[0],
        });
        throw err;
      }

      const existingPaymentRows = await tx
        .select({ id: jobPayments.id })
        .from(jobPayments)
        .where(eq(jobPayments.jobId, jobId))
        .limit(1);
      const existingPayment = existingPaymentRows[0] ?? null;

      if (existingPayment?.id) {
        await tx
          .update(jobPayments)
          .set({
            stripePaymentIntentId: paymentIntentId,
            stripePaymentIntentStatus: String(pi.status ?? ""),
            stripeChargeId,
            amountCents: resolvedTotalCents,
            status: isCapturedCharge ? "CAPTURED" : "PENDING",
            escrowLockedAt: isCapturedCharge ? now : null,
            paymentCapturedAt: isCapturedCharge ? now : null,
            updatedAt: now,
          } as any)
          .where(eq(jobPayments.id, existingPayment.id));
      } else {
        await tx.insert(jobPayments).values({
          id: randomUUID(),
          jobId,
          stripePaymentIntentId: paymentIntentId,
          stripePaymentIntentStatus: String(pi.status ?? ""),
          stripeChargeId,
          amountCents: resolvedTotalCents,
          status: isCapturedCharge ? "CAPTURED" : "PENDING",
          escrowLockedAt: isCapturedCharge ? now : null,
          paymentCapturedAt: isCapturedCharge ? now : null,
          createdAt: now,
          updatedAt: now,
        } as any);
      }

      if (uploadIds.length > 0) {
        const uploadRows = await tx
          .select({ id: v4JobUploads.id, url: v4JobUploads.url })
          .from(v4JobUploads)
          .where(and(inArray(v4JobUploads.id, uploadIds), eq(v4JobUploads.userId, userId), isNull(v4JobUploads.usedAt)));

        if (uploadRows.length !== uploadIds.length) {
          throw Object.assign(new Error("Unknown or unowned uploadIds."), { status: 400 });
        }

        for (const upload of uploadRows) {
          await tx.insert(jobPhotos).values({
            id: randomUUID(),
            jobId,
            kind: "CUSTOMER_SCOPE",
            actor: "CUSTOMER",
            url: upload.url,
          });
        }

        await tx
          .update(v4JobUploads)
          .set({ usedAt: now })
          .where(and(inArray(v4JobUploads.id, uploadIds), eq(v4JobUploads.userId, userId)));
      }

      if (isCapturedCharge) {
        await writeChargeLedger(tx as any, {
          jobId,
          totalAmountCents: resolvedTotalCents,
          currency: pricingResult.currency,
          paymentIntentId,
        });
      } else {
        await writeAuthHoldLedger(tx as any, {
          jobId,
          totalAmountCents: resolvedTotalCents,
          currency: pricingResult.currency,
          paymentIntentId,
        });
      }
    });
  } catch (err) {
    const dbErr = err as any;
    if (String(dbErr?.code ?? "") === "23505") {
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
    }
    throw err;
  }

  try {
    await stripe.paymentIntents.update(paymentIntentId, {
      metadata: {
        ...(pi.metadata ?? {}),
        type: "job_escrow",
        scope: "job-v4",
        jobId,
        userId,
        jobPosterUserId: userId,
        country: countryCode,
        province: stateCode,
        splitBaseCents: String(resolvedSplitBaseCents),
        taxCents: String(resolvedTaxCents),
        estimatedProcessingFeeCents: String(resolvedProcessingFeeCents),
      },
    });
  } catch {
    // Best-effort metadata sync; submit remains successful for idempotent retries.
  }

  return { jobId, created: true };
}
