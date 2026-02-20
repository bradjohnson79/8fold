import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { calculatePayoutBreakdown, PriceAdjustmentSchema } from "@8fold/shared";
import { z } from "zod";
import { logEvent } from "@/src/server/observability/log";
import { requireJobPosterReady } from "../../../../../../../src/auth/onboardingGuards";
import { createPaymentIntent } from "../../../../../../../src/payments/stripe";
import { rateLimit } from "../../../../../../../src/middleware/rateLimit";
import { jobPosterRouteErrorFromUnknown, jobPosterRouteErrorResponse } from "../../../../../../../src/http/jobPosterRouteErrors";
import { getBaseUrl } from "../../../../../../../src/lib/getBaseUrl";
import { db } from "../../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../../db/schema/auditLog";
import { jobs } from "../../../../../../../db/schema/job";
import { jobPayments } from "../../../../../../../db/schema/jobPayment";

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
    const stripeMode = String(process.env.STRIPE_MODE ?? "test").trim().toLowerCase();
    const stripeWebhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();

    if (!stripeWebhookSecret || stripeMode !== "test") {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "VALIDATION_ERROR",
        status: 400,
        err: new Error("Stripe webhook not configured"),
        userId,
        jobId,
        extraJson: { code: "STRIPE_WEBHOOK_NOT_CONFIGURED" },
      });
    }

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
        paymentStatus: jobs.paymentStatus,
        jobPosterUserId: jobs.jobPosterUserId,
        escrowLockedAt: jobs.escrowLockedAt,
        laborTotalCents: jobs.laborTotalCents,
        materialsTotalCents: jobs.materialsTotalCents,
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

    if (job.escrowLockedAt || String(job.paymentStatus) === "FUNDED") {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "VALIDATION_ERROR",
        status: 400,
        err: new Error("Job already funded"),
        userId,
        jobId: job.id,
        extraJson: { code: "JOB_ALREADY_FUNDED" },
      });
    }

    const allowedStatuses = new Set(["DRAFT", "READY_FOR_PAYMENT"]);
    if (!allowedStatuses.has(String(job.status))) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "VALIDATION_ERROR",
        status: 400,
        err: new Error("Job must be DRAFT or READY_FOR_PAYMENT before creating payment intent"),
        userId,
        jobId: job.id,
        extraJson: { code: "INVALID_JOB_STATUS" },
      });
    }

    const existingPayments = await db
      .select({
        id: jobPayments.id,
        stripePaymentIntentId: jobPayments.stripePaymentIntentId,
        status: jobPayments.status,
      })
      .from(jobPayments)
      .where(eq(jobPayments.jobId, job.id))
      .limit(1);
    const existing = existingPayments[0] ?? null;

    if (existing && String(existing.status) === "CAPTURED") {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "VALIDATION_ERROR",
        status: 400,
        err: new Error("Payment already captured for this job"),
        userId,
        jobId: job.id,
        extraJson: { code: "JOB_PAYMENT_ALREADY_CAPTURED" },
      });
    }
    if (existing && String(existing.status) === "PENDING") {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "VALIDATION_ERROR",
        status: 400,
        err: new Error("Payment intent already exists for this job"),
        userId,
        jobId: job.id,
        extraJson: { code: "JOB_PAYMENT_ALREADY_PENDING" },
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
    const laborCents = Number(job.laborTotalCents ?? 0);
    if (!Number.isInteger(laborCents) || laborCents <= 0) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "VALIDATION_ERROR",
        status: 400,
        err: new Error("Invalid labor amount configured for job"),
        userId,
        jobId: job.id,
        extraJson: { code: "INVALID_SERVER_LABOR_AMOUNT" },
      });
    }

    // Deterministic amounting: server-side only.
    const breakdown = calculatePayoutBreakdown(laborCents, job.materialsTotalCents);
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

    const idempotencyKey = idempotencyKeyForJobPayment(job.id, amountCents);
    const stripeCurrency = (job as any)?.country === "CA" ? "cad" : "usd";

    if (stripeMode === "test") {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          source: "payments.create_payment_intent",
          jobId: job.id,
          totalAmount: amountCents,
          breakdown,
          currency: stripeCurrency,
        }),
      );
    }

    let pi: Awaited<ReturnType<typeof createPaymentIntent>>;
    try {
      pi = await createPaymentIntent(amountCents, {
        currency: stripeCurrency,
        idempotencyKey,
        captureMethod: "automatic",
        confirmationMethod: "automatic",
        description: `8Fold Job Escrow – ${job.id}`,
        metadata: {
          type: "job_escrow",
          jobId: job.id,
          jobPosterUserId: user.userId,
          userId: user.userId,
          environment: String(process.env.NODE_ENV ?? "development"),
        },
      });
    } catch (err) {
      const ref = `stripe_pi_${randomUUID()}`;
      logEvent({
        level: "error",
        event: "stripe.payment_intent_create_failed",
        route,
        method: "POST",
        status: 500,
        code: "STRIPE_PAYMENT_INTENT_CREATE_FAILED",
        context: {
          ref,
          jobId: job.id,
          userId: user.userId,
          amountCents,
          currency: stripeCurrency,
          message: err instanceof Error ? err.message : "unknown",
        },
      });
      return jobPosterRouteErrorResponse({
        route,
        errorType: "INTERNAL_ERROR",
        status: 500,
        err: new Error(`Stripe payment creation failed (ref: ${ref})`),
        userId,
        jobId: job.id,
      });
    }

    await db.insert(jobPayments).values({
      id: randomUUID(),
      jobId: job.id,
      stripePaymentIntentId: pi.paymentIntentId,
      stripePaymentIntentStatus: pi.status,
      amountCents,
      status: "PENDING",
      updatedAt: new Date(),
    });

    await db.insert(auditLogs).values({
      id: randomUUID(),
      actorUserId: user.userId,
      action: "PAYMENT_INTENT_CREATED",
      entityType: "Job",
      entityId: job.id,
      metadata: {
        stripePaymentIntentId: pi.paymentIntentId,
        selectedPriceCents: laborCents,
        totalCents: amountCents,
      },
    });

    return NextResponse.json({
      clientSecret: pi.clientSecret,
      returnUrl: `${getBaseUrl()}/app/job-poster/payment/return`,
    });
  } catch (err) {
    const ref = `payment_intent_route_${randomUUID()}`;
    logEvent({
      level: "error",
      event: "job_poster.create_payment_intent.failed",
      route,
      method: "POST",
      status: 500,
      code: "CREATE_PAYMENT_INTENT_FAILED",
      context: {
        ref,
        userId,
        jobId,
        message: err instanceof Error ? err.message : "unknown",
      },
    });
    return jobPosterRouteErrorFromUnknown({ route, err: Object.assign(err as object, { ref }), userId, jobId });
  }
}
