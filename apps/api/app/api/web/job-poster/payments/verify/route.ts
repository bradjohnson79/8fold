import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { stripe } from "../../../../../../src/stripe/stripe";
import { logEvent } from "../../../../../../src/server/observability/log";
import { finalizeJobFundingFromPaymentIntent } from "../../../../../../src/payments/finalizeJobFundingFromPaymentIntent";

function failVerification(traceId: string, status = 400) {
  return NextResponse.json(
    {
      error: "PAYMENT_VERIFICATION_FAILED",
      code: "PAYMENT_VERIFICATION_FAILED",
      requiresSupportTicket: true,
      traceId,
    },
    { status },
  );
}

export async function POST(req: Request) {
  const route = "POST /api/web/job-poster/payments/verify";
  let userId: string | null = null;
  let jobId: string | null = null;
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    userId = ready.userId;

    const body = (await req.json().catch(() => null)) as { paymentIntentId?: string } | null;
    const paymentIntentId = String(body?.paymentIntentId ?? "").trim();
    if (!paymentIntentId) {
      return failVerification(randomUUID(), 400);
    }
    if (!stripe) {
      return failVerification(randomUUID(), 500);
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
        event: "stripe.payment_verification_failed",
        route,
        method: "POST",
        status: 400,
        code: finalized.code,
        context: {
          traceId: finalized.traceId,
          userId,
          jobId: finalized.jobId,
          paymentIntentId,
          reason: finalized.reason,
        },
      });
      return failVerification(finalized.traceId, 400);
    }

    if (finalized.idempotent) {
      logEvent({
        level: "info",
        event: "stripe.payment_verification_idempotent_hit",
        route,
        method: "POST",
        status: 200,
        code: "IDEMPOTENT_HIT",
        context: { userId, jobId: finalized.jobId, paymentIntentId },
      });
    }
    return NextResponse.json({
      ok: true,
      verified: true,
      idempotent: finalized.idempotent,
      jobId: finalized.jobId,
      paymentIntentId: finalized.paymentIntentId,
      paidAt: finalized.paidAt,
    });
  } catch (err) {
    const traceId = randomUUID();
    logEvent({
      level: "error",
      event: "stripe.payment_verification_exception",
      route,
      method: "POST",
      status: 500,
      code: "PAYMENT_VERIFICATION_FAILED",
      context: {
        traceId,
        userId,
        jobId,
        message: err instanceof Error ? err.message : "unknown",
      },
    });
    return failVerification(traceId, 500);
  }
}
