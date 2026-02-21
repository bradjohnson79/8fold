import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { db } from "../../../../../../db/drizzle";
import { jobDraftV2 } from "../../../../../../db/schema/jobDraftV2";
import { jobs } from "../../../../../../db/schema/job";
import { jobPayments } from "../../../../../../db/schema/jobPayment";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { calculatePayoutBreakdown } from "@8fold/shared";
import { paymentReady } from "@8fold/shared";
import { createPaymentIntent } from "../../../../../../src/payments/stripe";
import { getBaseUrl } from "../../../../../../src/lib/getBaseUrl";
import { jobPosterRouteErrorFromUnknown, jobPosterRouteErrorResponse } from "../../../../../../src/http/jobPosterRouteErrors";
import { logEvent } from "../../../../../../src/server/observability/log";

const route = "POST /api/web/job-poster/drafts-v2/create-payment-intent";

export async function POST(req: Request) {
  const traceId = randomUUID();
  let userId: string | null = null;
  let draftId: string | null = null;
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;
    userId = user.userId;

    const body = (await req.json().catch(() => null)) as {
      draftId?: string;
      expectedVersion?: number;
    } | null;

    const id = String(body?.draftId ?? "").trim();
    const expectedVersion = typeof body?.expectedVersion === "number" ? body.expectedVersion : undefined;

    draftId = id || null;

    if (!id) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "VALIDATION_ERROR",
        status: 400,
        err: new Error("Missing draftId"),
        userId,
        jobId: draftId,
        extraJson: { success: false, code: "MISSING_DRAFT_ID", traceId },
      });
    }

    const draftRows = await db
      .select()
      .from(jobDraftV2)
      .where(and(eq(jobDraftV2.id, id), eq(jobDraftV2.userId, user.userId)))
      .limit(1);
    const draft = draftRows[0] ?? null;

    if (!draft) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "INTERNAL_ERROR",
        status: 404,
        err: new Error("Draft not found"),
        userId,
        jobId: id,
        extraJson: { success: false, code: "DRAFT_NOT_FOUND", traceId },
      });
    }

    const data = (draft.data ?? {}) as Record<string, unknown>;
    const pricing = (data.pricing ?? {}) as Record<string, unknown>;
    if (pricing.appraisalStatus !== "ready") {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "VALIDATION_ERROR",
        status: 400,
        err: new Error("Pricing appraisal not ready"),
        userId,
        jobId: id,
        extraJson: { success: false, code: "APPRAISAL_NOT_READY", traceId },
      });
    }

    if (!paymentReady(data as any)) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "VALIDATION_ERROR",
        status: 400,
        err: new Error("Payment not ready"),
        userId,
        jobId: id,
        extraJson: { success: false, code: "PAYMENT_NOT_READY", traceId },
      });
    }

    const stripeMode = String(process.env.STRIPE_MODE ?? "test").trim().toLowerCase();
    const stripeWebhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
    if (!stripeWebhookSecret || stripeMode !== "test") {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "VALIDATION_ERROR",
        status: 400,
        err: new Error("Stripe webhook not configured"),
        userId,
        jobId: id,
        extraJson: { code: "STRIPE_WEBHOOK_NOT_CONFIGURED", traceId },
      });
    }

    if (draft.paymentIntentId) {
      const { stripe } = await import("../../../../../../src/payments/stripe");
      if (stripe) {
        const pi = await stripe.paymentIntents.retrieve(draft.paymentIntentId);
        if (pi.client_secret) {
          return NextResponse.json({
            success: true,
            clientSecret: pi.client_secret,
            returnUrl: `${getBaseUrl()}/app/job-poster/payment/return-v2`,
            amount: pi.amount,
            currency: draft.countryCode === "CA" ? "cad" : "usd",
            traceId,
          });
        }
      }
    }

    const laborCents = Number((pricing.selectedPriceCents as number) ?? 0);
    if (!Number.isInteger(laborCents) || laborCents <= 0) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "VALIDATION_ERROR",
        status: 400,
        err: new Error("Invalid labor amount"),
        userId,
        jobId: id,
        extraJson: { success: false, code: "INVALID_LABOR_AMOUNT", traceId },
      });
    }

    const materialsCents = 0;
    const breakdown = calculatePayoutBreakdown(laborCents, materialsCents);
    const amountCents = breakdown.totalJobPosterPaysCents;
    const stripeCurrency = draft.countryCode === "CA" ? "cad" : "usd";

    const details = (data.details ?? {}) as Record<string, unknown>;
    const jobId = randomUUID();
    const now = new Date();

    await db.insert(jobs).values({
      id: jobId,
      status: "DRAFT" as any,
      archived: false,
      title: String(details.title ?? "Job").trim().slice(0, 255),
      scope: String(details.scope ?? "").trim().slice(0, 5000),
      region: `${draft.stateCode}-${draft.countryCode}`.toLowerCase(),
      country: draft.countryCode as any,
      countryCode: draft.countryCode as any,
      stateCode: draft.stateCode,
      currency: draft.countryCode === "CA" ? "CAD" : "USD",
      jobPosterUserId: user.userId,
      jobType: (details.jobType ?? "urban") as any,
      tradeCategory: (details.tradeCategory ?? "HANDYMAN") as any,
      serviceType: "handyman",
      laborTotalCents: laborCents,
      materialsTotalCents: materialsCents,
      transactionFeeCents: breakdown.transactionFeeCents,
      contractorPayoutCents: breakdown.contractorPayoutCents,
      routerEarningsCents: breakdown.routerEarningsCents,
      brokerFeeCents: breakdown.platformFeeCents,
      amountCents,
      paymentCurrency: stripeCurrency,
      junkHaulingItems: details.items ?? [],
      availability: data.availability ?? null,
      lat: details.geo && typeof (details.geo as any).lat === "number" ? (details.geo as any).lat : null,
      lng: details.geo && typeof (details.geo as any).lng === "number" ? (details.geo as any).lng : null,
      city: (details.geo as any)?.city ?? (details.address as string) ?? null,
      publishedAt: now,
      postedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const idempotencyKey = `draftV2:${id}:pi`;
    let pi: Awaited<ReturnType<typeof createPaymentIntent>>;
    try {
      pi = await createPaymentIntent(amountCents, {
        currency: stripeCurrency as "cad" | "usd",
        idempotencyKey,
        captureMethod: "automatic",
        confirmationMethod: "automatic",
        description: `8Fold Job Escrow – ${jobId}`,
        metadata: {
          type: "job_escrow",
          jobId,
          jobPosterUserId: user.userId,
          userId: user.userId,
          environment: String(process.env.NODE_ENV ?? "development"),
        },
      });
    } catch (err) {
      logEvent({
        level: "error",
        event: "job_draft_v2.create_payment_intent.stripe_failed",
        route,
        context: { traceId, draftId: id, userId, message: err instanceof Error ? err.message : "unknown" },
      });
      return jobPosterRouteErrorResponse({
        route,
        errorType: "INTERNAL_ERROR",
        status: 500,
        err: new Error("Stripe payment creation failed"),
        userId,
        jobId: draftId,
        extraJson: { success: false, code: "STRIPE_FAILED", requiresSupportTicket: true, traceId },
      });
    }

    await db.insert(jobPayments).values({
      id: randomUUID(),
      jobId,
      stripePaymentIntentId: pi.paymentIntentId,
      stripePaymentIntentStatus: pi.status,
      amountCents,
      status: "PENDING",
      updatedAt: now,
    });

    await db.insert(auditLogs).values({
      id: randomUUID(),
      actorUserId: user.userId,
      action: "PAYMENT_INTENT_CREATED",
      entityType: "Job",
      entityId: jobId,
      metadata: {
        stripePaymentIntentId: pi.paymentIntentId,
        draftId: id,
        selectedPriceCents: laborCents,
        totalCents: amountCents,
      },
    });

    const versionBefore = draft.version;
    const updateResult = await db
      .update(jobDraftV2)
      .set({
        jobId,
        paymentIntentId: pi.paymentIntentId,
        paymentIntentCreatedAt: now,
        updatedAt: now,
        version: draft.version + 1,
      })
      .where(and(eq(jobDraftV2.id, id), eq(jobDraftV2.version, expectedVersion ?? draft.version)))
      .returning();

    if (updateResult.length === 0) {
      if (draft.paymentIntentId) {
        const { stripe } = await import("../../../../../../src/payments/stripe");
        if (stripe) {
          const existingPi = await stripe.paymentIntents.retrieve(draft.paymentIntentId);
          if (existingPi.client_secret) {
            return NextResponse.json({
              success: true,
              clientSecret: existingPi.client_secret,
              returnUrl: `${getBaseUrl()}/app/job-poster/payment/return-v2`,
              amount: amountCents,
              currency: stripeCurrency,
              traceId,
            });
          }
        }
      }
    }

    logEvent({
      level: "info",
      event: "job_draft_v2.create_payment_intent",
      route,
      context: {
        traceId,
        draftId: id,
        userId,
        jobId,
        versionBefore,
        versionAfter: draft.version + 1,
      },
    });

    return NextResponse.json({
      success: true,
      clientSecret: pi.clientSecret,
      returnUrl: `${getBaseUrl()}/app/job-poster/payment/return-v2`,
      amount: amountCents,
      currency: stripeCurrency,
      traceId,
    });
  } catch (err) {
    logEvent({
      level: "error",
      event: "job_draft_v2.create_payment_intent.failed",
      route,
      context: { traceId, userId, draftId, message: err instanceof Error ? err.message : "unknown" },
    });
    return jobPosterRouteErrorFromUnknown({
      route,
      err,
      userId,
      jobId: draftId,
      extraJson: { success: false, requiresSupportTicket: true, traceId },
    });
  }
}
