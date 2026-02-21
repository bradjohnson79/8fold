import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { stripe } from "../../../../../../src/stripe/stripe";
import { db } from "../../../../../../db/drizzle";
import { jobDraftV2 } from "../../../../../../db/schema/jobDraftV2";
import { finalizeJobFundingFromPaymentIntent } from "../../../../../../src/payments/finalizeJobFundingFromPaymentIntent";
import { jobPosterRouteErrorFromUnknown } from "../../../../../../src/http/jobPosterRouteErrors";
import { logEvent } from "../../../../../../src/server/observability/log";

const route = "POST /api/web/job-poster/drafts-v2/verify-payment";

export async function POST(req: Request) {
  const traceId = randomUUID();
  let userId: string | null = null;
  let jobId: string | null = null;
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;
    userId = user.userId;

    const body = (await req.json().catch(() => null)) as { paymentIntentId?: string } | null;
    const paymentIntentId = String(body?.paymentIntentId ?? "").trim();

    if (!paymentIntentId) {
      return NextResponse.json(
        { success: false, code: "MISSING_PAYMENT_INTENT_ID", traceId },
        { status: 400 }
      );
    }

    if (!stripe) {
      return NextResponse.json(
        { success: false, code: "STRIPE_NOT_CONFIGURED", requiresSupportTicket: true, traceId },
        { status: 500 }
      );
    }

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    jobId = String(pi.metadata?.jobId ?? "").trim() || null;

    const finalized = await finalizeJobFundingFromPaymentIntent(pi, {
      route,
      source: "verify_route",
      authenticatedUserId: userId ?? undefined,
    });

    if (!finalized.ok) {
      logEvent({
        level: "error",
        event: "job_draft_v2.verify_payment.finalize_failed",
        route,
        traceId,
        context: { userId, jobId: finalized.jobId, reason: finalized.reason },
      });
      return NextResponse.json(
        {
          success: false,
          code: finalized.code,
          requiresSupportTicket: true,
          traceId: finalized.traceId,
        },
        { status: 400 }
      );
    }

    const draftRows = await db
      .select()
      .from(jobDraftV2)
      .where(eq(jobDraftV2.jobId, finalized.jobId))
      .limit(1);
    const draft = draftRows[0] ?? null;

    if (draft && draft.currentStep !== "CONFIRMED") {
      await db
        .update(jobDraftV2)
        .set({
          currentStep: "CONFIRMED",
          updatedAt: new Date(),
        })
        .where(eq(jobDraftV2.id, draft.id));
    }

    logEvent({
      level: "info",
      event: "job_draft_v2.verify_payment",
      route,
      traceId,
      context: { userId, jobId: finalized.jobId, idempotent: finalized.idempotent },
    });

    return NextResponse.json({
      success: true,
      jobId: finalized.jobId,
      funded: true,
      idempotent: finalized.idempotent,
      traceId,
    });
  } catch (err) {
    logEvent({
      level: "error",
      event: "job_draft_v2.verify_payment.failed",
      route,
      traceId,
      context: { userId, jobId, message: err instanceof Error ? err.message : "unknown" },
    });
    return jobPosterRouteErrorFromUnknown({
      route,
      err,
      userId,
      jobId,
      extraJson: { success: false, requiresSupportTicket: true, traceId },
    });
  }
}
