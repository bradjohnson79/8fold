import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { pmRequests } from "@/db/schema/pmRequest";
import { loadPmRouteContext } from "@/src/pm/routeHelpers";
import { createPaymentIntent } from "@/src/payments/stripe";
import { assertStripeMinimumAmount, normalizeStripeCurrency } from "@/src/stripe/validation";
import { toHttpError } from "@/src/http/errors";
import { logEvent } from "@/src/server/observability/log";
import { stripe } from "@/src/stripe/stripe";
import { buildPmPiIdempotencyKey, buildPmPiMetadata } from "@/src/pm/integrity";

export async function POST(req: Request) {
  let traceId = req.headers.get("x-request-id") ?? undefined;
  try {
    const result = await loadPmRouteContext(req, "JOB_POSTER");
    if (!result.ok) return result.response;

    const { ctx } = result;
    traceId = ctx.traceId;
    let body: { pmRequestId: string };
    try {
      const raw = await req.json();
      if (typeof raw?.pmRequestId !== "string") throw new Error("Invalid input");
      body = { pmRequestId: raw.pmRequestId };
    } catch {
      return NextResponse.json({ error: "Invalid input", traceId: ctx.traceId }, { status: 400 });
    }

    const pm = await db
      .select({
        id: pmRequests.id,
        status: pmRequests.status,
        jobId: pmRequests.jobId,
        contractorId: pmRequests.contractorId,
        jobPosterUserId: pmRequests.jobPosterUserId,
        approvedTotal: pmRequests.approvedTotal,
        currency: pmRequests.currency,
        stripePaymentIntentId: pmRequests.stripePaymentIntentId,
      })
      .from(pmRequests)
      .where(
        and(
          eq(pmRequests.id, body.pmRequestId),
          eq(pmRequests.jobId, ctx.jobId),
          eq(pmRequests.jobPosterUserId, ctx.job.jobPosterUserId)
        )
      )
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!pm) return NextResponse.json({ error: "Not found", traceId: ctx.traceId }, { status: 404 });
    if (!pm.stripePaymentIntentId && pm.status !== "APPROVED") {
      return NextResponse.json(
        { error: "Payment intent can only be created when request is APPROVED", traceId: ctx.traceId },
        { status: 400 }
      );
    }

    const approvedTotal = Number(pm.approvedTotal ?? 0);
    const amountCents = Math.round(approvedTotal * 100);
    const currency = normalizeStripeCurrency(pm.currency ?? "USD");
    assertStripeMinimumAmount(amountCents, currency);

    if (pm.stripePaymentIntentId) {
      if (stripe) {
        const existing = await stripe.paymentIntents.retrieve(pm.stripePaymentIntentId);
        if (existing?.client_secret) {
          logEvent({
            level: "info",
            event: "pm.create_payment_intent_idempotent",
            route: "/api/web/job/[jobId]/pm/create-payment-intent",
            method: "POST",
            userId: ctx.user.userId,
            context: { pmRequestId: body.pmRequestId, traceId: ctx.traceId },
          });
          return NextResponse.json({
            clientSecret: existing.client_secret,
            paymentIntentId: existing.id,
            traceId: ctx.traceId,
          });
        }
      }
    }

    const idempotencyKey = buildPmPiIdempotencyKey(body.pmRequestId);
    const pi = await createPaymentIntent(amountCents, {
      currency,
      idempotencyKey,
      metadata: buildPmPiMetadata({
        pmRequestId: body.pmRequestId,
        jobId: pm.jobId,
        posterId: pm.jobPosterUserId,
        contractorId: pm.contractorId,
      }),
    });

    await db
      .update(pmRequests)
      .set({
        stripePaymentIntentId: pi.paymentIntentId,
        status: "PAYMENT_PENDING",
        updatedAt: new Date(),
      })
      .where(eq(pmRequests.id, body.pmRequestId));

    logEvent({
      level: "info",
      event: "pm.create_payment_intent",
      route: "/api/web/job/[jobId]/pm/create-payment-intent",
      method: "POST",
      userId: ctx.user.userId,
      context: { pmRequestId: body.pmRequestId, paymentIntentId: pi.paymentIntentId, traceId: ctx.traceId },
    });

    return NextResponse.json({
      clientSecret: pi.clientSecret,
      paymentIntentId: pi.paymentIntentId,
      traceId: ctx.traceId,
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    logEvent({
      level: "error",
      event: "pm.create_payment_intent_error",
      route: "/api/web/job/[jobId]/pm/create-payment-intent",
      method: "POST",
      status,
      context: { error: message },
    });
    return NextResponse.json({ error: message, traceId }, { status });
  }
}
