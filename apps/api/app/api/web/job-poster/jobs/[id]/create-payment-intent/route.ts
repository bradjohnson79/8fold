import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { requireJobPosterReady } from "../../../../../../../src/auth/onboardingGuards";
import { calculatePayoutBreakdown, PriceAdjustmentSchema } from "@8fold/shared";
import { cancelPaymentIntent, createPaymentIntent } from "../../../../../../../src/payments/stripe";
import { rateLimit } from "../../../../../../../src/middleware/rateLimit";
import { jobPosterRouteErrorFromUnknown, jobPosterRouteErrorResponse } from "../../../../../../../src/http/jobPosterRouteErrors";
import { db } from "../../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../../db/schema/auditLog";
import { jobs } from "../../../../../../../db/schema/job";
import { jobPayments } from "../../../../../../../db/schema/jobPayment";
import { z } from "zod";

function idempotencyKeyForJobPayment(jobId: string, amountCents: number) {
  return `job_${jobId}_amount_${amountCents}`;
}

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idIndex = parts.indexOf("jobs") + 1;
  return parts[idIndex] ?? "";
}

const DayBlocksSchema = z
  .object({
    morning: z.boolean().optional(),
    afternoon: z.boolean().optional(),
    evening: z.boolean().optional(),
  })
  .strict();

const AvailabilitySchema = z
  .object({
    monday: DayBlocksSchema.optional(),
    tuesday: DayBlocksSchema.optional(),
    wednesday: DayBlocksSchema.optional(),
    thursday: DayBlocksSchema.optional(),
    friday: DayBlocksSchema.optional(),
    saturday: DayBlocksSchema.optional(),
    sunday: DayBlocksSchema.optional(),
  })
  .strict();

export async function POST(req: Request) {
  const route = "POST /api/web/job-poster/jobs/:id/create-payment-intent";
  let userId: string | null = null;
  let jobId: string | null = null;
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;
    userId = user.userId;
    const id = getIdFromUrl(req);
    jobId = id || null;
    const rl = rateLimit({
      key: `job_posting:create_payment_intent:${user.userId}`,
      limit: 5,
      windowMs: 60 * 60 * 1000
    });
    if (!rl.ok) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "INTERNAL_ERROR",
        status: 429,
        err: new Error("Rate limited"),
        userId,
        jobId,
        extraJson: { retryAfterSeconds: rl.retryAfterSeconds },
      });
    }

    const jobRows = await db
      .select({
        id: jobs.id,
        status: jobs.status,
        jobPosterUserId: jobs.jobPosterUserId,
        escrowLockedAt: jobs.escrowLockedAt,
        laborTotalCents: jobs.laborTotalCents,
        materialsTotalCents: jobs.materialsTotalCents,
        transactionFeeCents: jobs.transactionFeeCents,
        tradeCategory: jobs.tradeCategory,
        priceMedianCents: jobs.priceMedianCents,
        country: jobs.country,
      })
      .from(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.archived, false)))
      .limit(1);
    const job = jobRows[0] ?? null;

    if (!job) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "INTERNAL_ERROR",
        status: 404,
        err: new Error("Job not found"),
        userId,
        jobId,
      });
    }

    if (job.jobPosterUserId !== user.userId) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "AUTH_ERROR",
        status: 401,
        err: new Error("Forbidden"),
        userId,
        jobId: job.id,
      });
    }

    // Escrow lock: money fields immutable after capture.
    if (job.escrowLockedAt) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "VALIDATION_ERROR",
        status: 409,
        err: new Error("Payment already captured"),
        userId,
        jobId: job.id,
      });
    }

    if (String(job.status) !== "DRAFT") {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "VALIDATION_ERROR",
        status: 400,
        err: new Error("Job must be DRAFT before creating payment intent"),
        userId,
        jobId: job.id,
      });
    }

    const body = await req.json();
    const parsed = PriceAdjustmentSchema.safeParse(body);

    if (!parsed.success) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "VALIDATION_ERROR",
        status: 400,
        err: new Error("PriceAdjustmentSchema validation failed"),
        userId,
        jobId: job.id,
      });
    }

    const { selectedPriceCents } = parsed.data;
    const availabilityRaw = (body as any)?.availability;
    const availabilityParsed =
      availabilityRaw == null ? { ok: true as const, value: null as any } : AvailabilitySchema.safeParse(availabilityRaw);
    if ("success" in availabilityParsed && availabilityParsed.success === false) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "VALIDATION_ERROR",
        status: 400,
        err: new Error("Invalid availability payload"),
        userId,
        jobId: job.id,
      });
    }

    const availabilityValue =
      availabilityRaw == null
        ? null
        : (() => {
            const a = (availabilityParsed as any).data as any;
            const out: any = {};
            const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
            for (const d of days) {
              const day = a?.[d];
              const morning = Boolean(day?.morning);
              const afternoon = Boolean(day?.afternoon);
              const evening = Boolean(day?.evening);
              if (morning || afternoon || evening) out[d] = { morning, afternoon, evening };
            }
            return Object.keys(out).length ? out : null;
          })();
    const stepCents = 5 * 100;
    if (selectedPriceCents % stepCents !== 0) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "VALIDATION_ERROR",
        status: 400,
        err: new Error("Price step invalid"),
        userId,
        jobId: job.id,
        extraJson: { code: "INVALID_PRICE_INCREMENT" },
      });
    }

    // Pricing/appraisal fields are not present in the current Prisma schema.
    // Keep payment intent creation non-blocking; validate only basic invariants.
    const suggested = Math.max(0, Math.round((job.priceMedianCents ?? job.laborTotalCents ?? 0) / 100));

    // Update job totals BEFORE creating PaymentIntent (Stripe mirrors our canonical intent).
    const breakdown = calculatePayoutBreakdown(selectedPriceCents, job.materialsTotalCents);
    const amountCents = breakdown.totalJobPosterPaysCents;
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "INTERNAL_ERROR",
        status: 400,
        err: new Error("Invalid payment amount"),
        userId,
        jobId: job.id,
      });
    }

    await db
      .update(jobs)
      .set({
        laborTotalCents: selectedPriceCents,
        priceAdjustmentCents: selectedPriceCents - suggested * 100,
        transactionFeeCents: breakdown.transactionFeeCents,
        contractorPayoutCents: breakdown.contractorPayoutCents,
        routerEarningsCents: breakdown.routerEarningsCents,
        brokerFeeCents: breakdown.platformFeeCents,
        amountCents,
        paymentCurrency: (job as any)?.country === "CA" ? "cad" : "usd",
        repeatContractorDiscountCents: 0,
        availability: availabilityValue,
      })
      .where(eq(jobs.id, job.id));

    // Create or reuse a Stripe PaymentIntent for a job (idempotent by (jobId, amountCents)).
    // Preserves existing behavior:
    // - cancel prior pending intent if amount changes
    // - upsert JobPayment row with PENDING state
    const existingPayments = await db
      .select({
        id: jobPayments.id,
        stripePaymentIntentId: jobPayments.stripePaymentIntentId,
        status: jobPayments.status,
        amountCents: jobPayments.amountCents,
      })
      .from(jobPayments)
      .where(eq(jobPayments.jobId, job.id))
      .limit(1);
    const existing = existingPayments[0] ?? null;

    if (existing && String(existing.status) === "PENDING" && Number(existing.amountCents ?? 0) !== amountCents) {
      try {
        await cancelPaymentIntent(String(existing.stripePaymentIntentId ?? ""));
      } catch {
        // best effort (keep behavior identical)
      }
      await db.delete(jobPayments).where(eq(jobPayments.jobId, job.id));
    }

    const idempotencyKey = idempotencyKeyForJobPayment(job.id, amountCents);
    // Stripe currency is per-country; keep it consistent with the job.
    const stripeCurrency = (job as any)?.country === "CA" ? "cad" : "usd";
    const pi = await createPaymentIntent(amountCents, {
      currency: stripeCurrency,
      idempotencyKey,
      metadata: {
        type: "job_escrow",
        jobId: job.id,
        posterId: user.userId,
        jobPosterUserId: user.userId,
      },
    });

    if (existingPayments.length === 0) {
      await db.insert(jobPayments).values({
        id: randomUUID(),
        jobId: job.id,
        stripePaymentIntentId: pi.paymentIntentId,
        stripePaymentIntentStatus: pi.status,
        amountCents,
        status: "PENDING",
        updatedAt: new Date(),
      });
    } else {
      await db
        .update(jobPayments)
        .set({
          stripePaymentIntentId: pi.paymentIntentId,
          stripePaymentIntentStatus: pi.status,
          amountCents,
          status: "PENDING",
          updatedAt: new Date(),
        })
        .where(eq(jobPayments.jobId, job.id));
    }

    // Audit logging (PAYMENT_INTENT_CREATED)
    await db.insert(auditLogs).values({
      id: randomUUID(),
      actorUserId: user.userId,
      action: "PAYMENT_INTENT_CREATED",
      entityType: "Job",
      entityId: job.id,
      metadata: {
        stripePaymentIntentId: pi.paymentIntentId,
        selectedPriceCents,
        priceAdjustmentCents: selectedPriceCents - suggested * 100,
        totalCents: amountCents,
      },
    });

    return NextResponse.json({
      clientSecret: pi.clientSecret,
      paymentIntentId: pi.paymentIntentId,
      totalCents: amountCents,
    });
  } catch (err) {
    return jobPosterRouteErrorFromUnknown({ route, err, userId, jobId });
  }
}
