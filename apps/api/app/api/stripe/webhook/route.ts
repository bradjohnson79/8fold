import { NextResponse } from "next/server";
import { stripe } from "../../../../src/payments/stripe";
import Stripe from "stripe";
import { logEvent } from "@/src/server/observability/log";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobs } from "../../../../db/schema/job";
import { jobPayments } from "../../../../db/schema/jobPayment";
import { contractorAccounts } from "../../../../db/schema/contractorAccount";
import { jobPosterProfiles } from "../../../../db/schema/jobPosterProfile";
import { routerProfiles } from "../../../../db/schema/routerProfile";
import { stripeWebhookEvents } from "../../../../db/schema/stripeWebhookEvent";
import { escrows } from "../../../../db/schema/escrow";
import { fundEscrowIdempotentInTx } from "../../../../src/server/financial/idempotency";

function requireStripe() {
  if (!stripe) {
    throw Object.assign(new Error("Stripe not configured"), { status: 500 });
  }
  return stripe;
}

export async function POST(req: Request) {
  const s = requireStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET not configured" },
      { status: 500 }
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const body = Buffer.from(await req.arrayBuffer());

  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid signature" },
      { status: 400 }
    );
  }

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      // Ensure row exists (idempotency record).
      await tx
        .insert(stripeWebhookEvents)
        .values({
          id: event.id,
          type: event.type,
          objectId:
            typeof (event.data.object as { id?: unknown })?.id === "string"
              ? String((event.data.object as { id: string }).id)
              : null,
          processedAt: null,
        })
        .onConflictDoNothing();

      // Acquire processing lock by atomically setting processedAt.
      const lock = await tx
        .update(stripeWebhookEvents)
        .set({ processedAt: now })
        .where(and(eq(stripeWebhookEvents.id, event.id), isNull(stripeWebhookEvents.processedAt)))
        .returning({ id: stripeWebhookEvents.id });

      if (!lock[0]?.id) {
        // Already processed (or being processed) by another worker.
        return;
      }

      if (event.type === "payment_intent.succeeded") {
        const pi = event.data.object as Stripe.PaymentIntent;
        const paymentIntentId = String(pi.id ?? "");

        const updatedPayments = await tx
          .update(jobPayments)
          .set({
            stripePaymentIntentStatus: pi.status,
            stripeChargeId:
              typeof pi.latest_charge === "string"
                ? pi.latest_charge
                : (pi.latest_charge as any)?.id ?? null,
            status: "CAPTURED",
            escrowLockedAt: now,
            paymentCapturedAt: now,
            updatedAt: now, // Prisma @updatedAt parity
          })
          .where(eq(jobPayments.stripePaymentIntentId, paymentIntentId))
          .returning({ jobId: jobPayments.jobId });

        const jobId = updatedPayments[0]?.jobId ?? null;
        if (jobId) {
          await tx
            .update(jobs)
            .set({
              escrowLockedAt: now,
              paymentCapturedAt: now,
              // After funding, the job becomes routable.
              status: "OPEN_FOR_ROUTING",
              postedAt: now,
            })
            .where(eq(jobs.id, jobId));
        }

        // Bank-ledger safe: if an Escrow row exists for this payment intent, fund it idempotently.
        // (No-op if escrow not yet wired for this flow.)
        const escrowRows = await tx
          .select({ id: escrows.id, kind: escrows.kind })
          .from(escrows)
          .where(eq(escrows.stripePaymentIntentId, paymentIntentId))
          .limit(1);
        const escrow = escrowRows[0] ?? null;
        if (escrow?.id && escrow?.kind) {
          await fundEscrowIdempotentInTx(tx as any, {
            escrowId: String(escrow.id),
            stripeRef: paymentIntentId,
            kind: String(escrow.kind) as any,
          });
        }
      } else if (event.type === "payment_intent.payment_failed") {
        const pi = event.data.object as Stripe.PaymentIntent;
        const paymentIntentId = String(pi.id ?? "");

        await tx
          .update(jobPayments)
          .set({
            stripePaymentIntentStatus: pi.status,
            status: "FAILED",
            updatedAt: now,
          })
          .where(eq(jobPayments.stripePaymentIntentId, paymentIntentId));
      } else if (event.type === "charge.refunded") {
        const ch = event.data.object as Stripe.Charge;
        const paymentIntentId =
          typeof ch.payment_intent === "string" ? ch.payment_intent : (ch.payment_intent as any)?.id ?? null;

        if (paymentIntentId) {
          const refundAmountCents = typeof ch.amount_refunded === "number" ? ch.amount_refunded : null;

          const updated = await tx
            .update(jobPayments)
            .set({
              stripeChargeId: ch.id,
              status: "REFUNDED",
              refundedAt: now,
              paymentReleasedAt: now,
              refundAmountCents: refundAmountCents ?? null,
              updatedAt: now,
            })
            .where(eq(jobPayments.stripePaymentIntentId, paymentIntentId))
            .returning({ jobId: jobPayments.jobId });

          const jobId = updated[0]?.jobId ?? null;
          if (jobId) {
            await tx.update(jobs).set({ paymentReleasedAt: now }).where(eq(jobs.id, jobId));
          }
        }
      } else if (event.type === "account.updated") {
        const acct = event.data.object as Stripe.Account;
        const acctId = String(acct.id ?? "");
        const active = Boolean((acct as any)?.payouts_enabled) && Boolean((acct as any)?.details_submitted);
        const nextStatus = active ? "ACTIVE" : "PENDING";

        if (acctId) {
          await Promise.all([
            tx
              .update(routerProfiles)
              .set({ payoutMethod: "STRIPE", payoutStatus: nextStatus, updatedAt: now })
              .where(eq(routerProfiles.stripeAccountId, acctId)),
            tx
              .update(jobPosterProfiles)
              .set({ payoutMethod: "STRIPE", payoutStatus: nextStatus, updatedAt: now })
              .where(eq(jobPosterProfiles.stripeAccountId, acctId)),
            tx
              .update(contractorAccounts)
              .set({ payoutMethod: "STRIPE", payoutStatus: nextStatus })
              .where(eq(contractorAccounts.stripeAccountId, acctId)),
          ]);
        }
      }
    });
  } catch (err) {
    // Don’t mark as processed if we failed to update DB deterministically.
    logEvent({
      level: "error",
      event: "stripe.webhook_error",
      route: "/api/stripe/webhook",
      method: "POST",
      status: 500,
      code: "STRIPE_WEBHOOK_ERROR",
      context: { type: event?.type, id: event?.id },
    });
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

