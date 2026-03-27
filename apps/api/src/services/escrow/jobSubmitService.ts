import { randomUUID } from "crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { currencyCodeEnum, jobStatusEnum, routingStatusEnum, tradeCategoryEnum } from "@/db/schema/enums";
import { jobs } from "@/db/schema/job";
import { jobPayments } from "@/db/schema/jobPayment";
import { jobPhotos } from "@/db/schema/jobPhoto";
import { v4JobUploads } from "@/db/schema/v4JobUpload";
import { stripe } from "@/src/payments/stripe";
import { isStripePaymentIntentPaid } from "@/src/payments/paymentState";
import { writeChargeLedger } from "@/src/services/escrow/ledger";
import { createJobMinimalInsert } from "@/src/services/v4/jobPosterJobInsertMinimal";
import { TRADE_CATEGORIES_CANONICAL } from "@/src/validation/v4/constants";

type LooseRecord = Record<string, unknown>;
type UploadInput = { uploadId: string; url: string };
type LedgerCurrency = "CAD" | "USD";

type SubmitResult = {
  jobId: string;
  created: boolean;
};

const JOB_STATUS_OPEN_FOR_ROUTING = jobStatusEnum.enumValues.includes("OPEN_FOR_ROUTING")
  ? "OPEN_FOR_ROUTING"
  : jobStatusEnum.enumValues[0];
const ROUTING_STATUS_UNROUTED = routingStatusEnum.enumValues.includes("UNROUTED")
  ? "UNROUTED"
  : routingStatusEnum.enumValues[0];
const CURRENCY_CAD = currencyCodeEnum.enumValues.includes("CAD") ? "CAD" : currencyCodeEnum.enumValues[0];
const CURRENCY_USD = currencyCodeEnum.enumValues.includes("USD") ? "USD" : currencyCodeEnum.enumValues[0];

function asObject(v: unknown): LooseRecord {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as LooseRecord) : {};
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

function toSubmitCurrency(value: unknown): LedgerCurrency {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();
  const candidate = normalized === CURRENCY_CAD ? CURRENCY_CAD : normalized === CURRENCY_USD ? CURRENCY_USD : null;
  if (candidate) return candidate;
  throw Object.assign(new Error(`Unsupported Stripe currency: ${normalized || "(empty)"}`), {
    status: 409,
    code: "UNSUPPORTED_CURRENCY",
  });
}

async function writePostInsertLedger(input: {
  jobId: string;
  totalAmountCents: number;
  currency: LedgerCurrency;
  paymentIntentId: string;
}) {
  try {
    await writeChargeLedger(db as any, {
      jobId: input.jobId,
      totalAmountCents: input.totalAmountCents,
      currency: input.currency,
      paymentIntentId: input.paymentIntentId,
    });
  } catch (err) {
    const ledgerErr = err as any;
    console.error("[JOB_SUBMIT_LEDGER_POST_INSERT_FAILED]", {
      jobId: input.jobId,
      paymentIntentId: input.paymentIntentId,
      code: ledgerErr?.code,
      constraint: ledgerErr?.constraint,
      column: ledgerErr?.column,
      status: "CAPTURED",
      message: ledgerErr?.message,
    });
  }
}

export async function submitJobFromPayload(userId: string, payload: unknown): Promise<SubmitResult> {
  const body = asObject(payload);
  const details = asObject(body.details);
  const payment = asObject(body.payment);

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
  const isCapturedCharge = isStripePaymentIntentPaid(pi.status);
  if (!isCapturedCharge) {
    throw Object.assign(new Error("Payment not completed. Complete Stripe confirmation first."), { status: 409 });
  }

  const title = String(details.title ?? "").trim();
  const scope = String(details.description ?? "").trim();
  const tradeCategory = String(details.tradeCategory ?? "")
    .trim()
    .toUpperCase();
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

  const stripeAmountCents =
    Number.isInteger(pi.amount_received) && Number(pi.amount_received) > 0
      ? Number(pi.amount_received)
      : Number.isInteger(pi.amount)
        ? Number(pi.amount)
        : 0;
  if (!Number.isInteger(stripeAmountCents) || stripeAmountCents <= 0) {
    throw Object.assign(new Error("Invalid Stripe amount."), { status: 409 });
  }

  const currency = toSubmitCurrency(pi.currency);
  const region = String(details.stateCode ?? details.region ?? "")
    .trim()
    .toLowerCase();
  const countryCode = String(details.countryCode ?? details.country ?? "US").trim().toUpperCase();
  const stateCode = String(details.stateCode ?? details.region ?? "").trim();

  // Location snapshot fields
  const city = String(details.city ?? "").trim() || null;
  const postalCode = String(details.postalCode ?? "").trim() || null;
  const addressFull = String(details.address ?? "").trim() || null;
  const lat = typeof details.lat === "number" && Number.isFinite(details.lat) ? details.lat : null;
  const lng = typeof details.lon === "number" && Number.isFinite(details.lon) ? details.lon : null;

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

  try {
    await db.transaction(async (tx) => {
      try {
        await createJobMinimalInsert(tx, {
          jobId,
          userId,
          title,
          scope,
          tradeCategory,
          status: JOB_STATUS_OPEN_FOR_ROUTING,
          routingStatus: ROUTING_STATUS_UNROUTED,
          currency,
          amountCents: stripeAmountCents,
          totalAmountCents: stripeAmountCents,
          stripePaymentIntentId: paymentIntentId,
          stripePaymentIntentStatus: String(pi.status ?? ""),
          createdAt: now,
          updatedAt: now,
          region: region || "unspecified",
          countryCode: countryCode || "US",
          stateCode: stateCode || undefined,
          city,
          postalCode,
          addressFull,
          lat,
          lng,
        });
      } catch (err) {
        const dbErr = err as any;
        console.error("[JOB_SUBMIT_INSERT_FAILED]", {
          paymentIntentId,
          jobId,
          code: dbErr?.code,
          constraint: dbErr?.constraint,
          column: dbErr?.column,
          status: JOB_STATUS_OPEN_FOR_ROUTING,
          message: dbErr?.message,
          detail: dbErr?.detail,
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
            amountCents: stripeAmountCents,
            status: "CAPTURED",
            escrowLockedAt: now,
            paymentCapturedAt: now,
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
          amountCents: stripeAmountCents,
          status: "CAPTURED",
          escrowLockedAt: now,
          paymentCapturedAt: now,
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
    });
  } catch (err) {
    const dbErr = err as any;
    const pgCode = String(dbErr?.details?.code ?? dbErr?.code ?? "");
    if (pgCode === "23505") {
      console.warn("[JOB_CREATE_IDEMPOTENT_HIT]", { paymentIntentId });
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

  await writePostInsertLedger({
    jobId,
    totalAmountCents: stripeAmountCents,
    currency,
    paymentIntentId,
  });

  try {
    await stripe.paymentIntents.update(paymentIntentId, {
      metadata: {
        ...(pi.metadata ?? {}),
        type: "job_escrow",
        scope: "job-v4",
        jobId,
        userId,
        jobPosterUserId: userId,
      },
    });
  } catch {
    // Best-effort metadata sync; submit remains successful for idempotent retries.
  }

  return { jobId, created: true };
}
