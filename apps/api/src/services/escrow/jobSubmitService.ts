import { randomUUID } from "crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/drizzle";
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
  const countryCode = String(details.countryCode ?? "US").trim().toUpperCase() === "CA" ? "CA" : "US";
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

  if (!tradeCategory || !TRADE_CATEGORIES_CANONICAL.includes(tradeCategory as any)) {
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
  if (pi.amount !== pricingResult.totalChargeCents) {
    throw Object.assign(new Error("Stripe amount does not match the computed total."), { status: 409 });
  }
  if (String(pi.currency ?? "").toLowerCase() !== pricingResult.paymentCurrency) {
    throw Object.assign(new Error("Stripe currency does not match country pricing."), { status: 409 });
  }

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
        await tx.insert(jobs).values({
          id: jobId,
          status: "OPEN_FOR_ROUTING" as any,
          archived: false,
          title,
          scope,
          region,
          country: countryCode as any,
          country_code: countryCode as any,
          state_code: stateCode,
          region_code: stateCode,
          city,
          postal_code: postalCode,
          address_full: address,
          lat,
          lng: lon,
          province: stateCode,
          is_regional: isRegional,
          currency: pricingResult.currency as any,
          payment_currency: pricingResult.paymentCurrency,
          appraisal_subtotal_cents: pricingResult.appraisalSubtotalCents,
          regional_fee_cents: pricingResult.regionalFeeCents,
          tax_rate_bps: pricingResult.taxRateBps,
          tax_amount_cents: pricingResult.taxCents,
          total_amount_cents: pricingResult.totalChargeCents,
          amount_cents: pricingResult.totalChargeCents,
          labor_total_cents: pricingResult.legacy.laborTotalCents,
          materials_total_cents: 0,
          transaction_fee_cents: pricingResult.estimatedProcessingFeeCents,
          price_adjustment_cents: pricingResult.legacy.priceAdjustmentCents,
          stripe_payment_intent_id: paymentIntentId,
          stripe_payment_intent_status: String(pi.status ?? ""),
          stripe_charge_id: stripeChargeId,
          payment_status: isCapturedCharge ? ("FUNDS_SECURED" as any) : ("AUTHORIZED" as any),
          stripe_authorized_at: now,
          stripe_paid_at: isCapturedCharge ? now : null,
          escrow_locked_at: isCapturedCharge ? now : null,
          funds_secured_at: isCapturedCharge ? now : null,
          funded_at: isCapturedCharge ? now : null,
          payment_captured_at: isCapturedCharge ? now : null,
          job_poster_user_id: userId,
          job_type: (isRegional ? "regional" : "urban") as any,
          trade_category: tradeCategory as any,
          service_type: "handyman",
          availability: availability as any,
          posted_at: now,
          published_at: now,
          created_at: now,
          updated_at: now,
          price_median_cents: pricingResult.appraisalSubtotalCents,
          contractor_payout_cents: pricingResult.contractorPayoutCents,
          router_earnings_cents: pricingResult.routerFeeCents,
          broker_fee_cents: pricingResult.platformFeeCents,
          routing_status: "UNROUTED" as any,
        });
      } catch (err) {
        const dbErr = err as any;
        console.error("JOB_INSERT_FAILED", {
          jobId,
          paymentIntentId,
          code: dbErr?.code,
          detail: dbErr?.detail,
          constraint: dbErr?.constraint,
          table: dbErr?.table,
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
            amountCents: pricingResult.totalChargeCents,
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
          amountCents: pricingResult.totalChargeCents,
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
          totalAmountCents: pricingResult.totalChargeCents,
          currency: pricingResult.currency,
          paymentIntentId,
        });
      } else {
        await writeAuthHoldLedger(tx as any, {
          jobId,
          totalAmountCents: pricingResult.totalChargeCents,
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
        splitBaseCents: String(pricingResult.baseSplitCents),
        taxCents: String(pricingResult.taxCents),
        estimatedProcessingFeeCents: String(pricingResult.estimatedProcessingFeeCents),
      },
    });
  } catch {
    // Best-effort metadata sync; submit remains successful for idempotent retries.
  }

  return { jobId, created: true };
}
