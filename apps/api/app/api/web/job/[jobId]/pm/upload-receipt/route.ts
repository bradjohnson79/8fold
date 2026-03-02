import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { pmRequests } from "@/db/schema/pmRequest";
import { pmReceipts } from "@/db/schema/pmReceipt";
import { loadPmRouteContext } from "@/src/pm/routeHelpers";
import { toHttpError } from "@/src/http/errors";
import { logEvent } from "@/src/server/observability/log";
import { stripe } from "@/src/stripe/stripe";
import { reconcileStripeFeeForPaymentIntent } from "@/src/services/v4/stripeFeeReconciliationService";

const BodySchema = z.object({
  pmRequestId: z.string().uuid(),
  fileBase64: z.string().min(1).max(10_000_000),
  extractedTotal: z.number().min(0).optional(),
});

export async function POST(req: Request) {
  try {
    const result = await loadPmRouteContext(req, "CONTRACTOR");
    if (!result.ok) return result.response;

    const { ctx } = result;
    let body: z.infer<typeof BodySchema>;
    try {
      body = BodySchema.parse(await req.json());
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const pm = await db
      .select({
        id: pmRequests.id,
        status: pmRequests.status,
        jobId: pmRequests.jobId,
        contractorId: pmRequests.contractorId,
        stripePaymentIntentId: pmRequests.stripePaymentIntentId,
      })
      .from(pmRequests)
      .where(
        and(
          eq(pmRequests.id, body.pmRequestId),
          eq(pmRequests.jobId, ctx.jobId),
          eq(pmRequests.contractorId, ctx.contractorId!)
        )
      )
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!pm) return NextResponse.json({ error: "Not found", traceId: ctx.traceId }, { status: 404 });
    if (pm.status !== "FUNDED" && pm.status !== "RECEIPTS_SUBMITTED" && pm.status !== "PAYMENT_PENDING") {
      return NextResponse.json({ error: "Receipts can only be uploaded after payment hold/charge.", traceId: ctx.traceId }, { status: 400 });
    }

    let reconcilePaymentIntentId: string | null = null;
    if (pm.status === "PAYMENT_PENDING") {
      const piId = String(pm.stripePaymentIntentId ?? "").trim();
      if (!piId || !stripe) {
        return NextResponse.json({ error: "Payment hold is required before receipts upload.", traceId: ctx.traceId }, { status: 409 });
      }
      const pi = await stripe.paymentIntents.retrieve(piId);
      if (pi.status === "requires_capture") {
        const captured = await stripe.paymentIntents.capture(piId, undefined, {
          idempotencyKey: `pm-receipt-capture:${body.pmRequestId}`,
        });
        reconcilePaymentIntentId = captured.id;
      } else if (pi.status !== "succeeded") {
        return NextResponse.json({ error: "Payment hold is not capturable.", traceId: ctx.traceId }, { status: 409 });
      } else {
        reconcilePaymentIntentId = pi.id;
      }
      await db
        .update(pmRequests)
        .set({
          status: "FUNDED",
          updatedAt: new Date(),
        })
        .where(eq(pmRequests.id, pm.id));
    }

    if (reconcilePaymentIntentId && stripe) {
      try {
        const pi = await stripe.paymentIntents.retrieve(reconcilePaymentIntentId);
        const reconciled = await reconcileStripeFeeForPaymentIntent({
          pi,
          stripeClient: stripe,
          source: "capture_route_pm_upload",
        });
        if (!reconciled.ok) {
          console.warn("[pm/upload-receipt] fee reconciliation skipped", {
            paymentIntentId: reconcilePaymentIntentId,
            code: reconciled.code,
            reason: reconciled.reason,
            jobId: reconciled.jobId ?? null,
          });
        }
      } catch (reconcileErr) {
        console.warn("[pm/upload-receipt] fee reconciliation failed", {
          paymentIntentId: reconcilePaymentIntentId,
          message: reconcileErr instanceof Error ? reconcileErr.message : String(reconcileErr),
        });
      }
    }

    const receiptId = randomUUID();
    await db.insert(pmReceipts).values({
      id: receiptId,
      pmRequestId: body.pmRequestId,
      fileBase64: body.fileBase64,
      extractedTotal: body.extractedTotal != null ? String(body.extractedTotal) : null,
      verified: false,
    });

    await db
      .update(pmRequests)
      .set({
        status: "RECEIPTS_SUBMITTED",
        updatedAt: new Date(),
      })
      .where(eq(pmRequests.id, body.pmRequestId));

    logEvent({
      level: "info",
      event: "pm.upload_receipt",
      route: "/api/web/job/[jobId]/pm/upload-receipt",
      method: "POST",
      userId: ctx.user.userId,
      context: { pmRequestId: body.pmRequestId, receiptId, traceId: ctx.traceId },
    });

    return NextResponse.json({ receiptId, status: "RECEIPTS_SUBMITTED", traceId: ctx.traceId });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
