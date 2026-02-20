import { NextResponse } from "next/server";
import Stripe from "stripe";
import { and, eq, isNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logEvent } from "@/src/server/observability/log";
import { stripe } from "@/src/stripe/stripe";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { stripeWebhookEvents } from "@/db/schema/stripeWebhookEvent";
import { contractors } from "@/db/schema/contractor";
import { payoutMethods } from "@/db/schema/payoutMethod";
import { auditLogs } from "@/db/schema/auditLog";
import { jobPayments } from "@/db/schema/jobPayment";
import { escrows } from "@/db/schema/escrow";
import { calculatePayoutBreakdown } from "@8fold/shared";

/**
 * LOCAL DEV:
 * Run:
 *   stripe listen --forward-to localhost:3003/api/webhooks/stripe
 *
 * Then copy the printed `whsec\_...` value into:
 *   apps/api/.env.local
 *
 * STRIPE_WEBHOOK_SECRET=whsec\_...
 */

export const config = {
  api: { bodyParser: false },
};

const HANDLED_EVENTS = new Set<Stripe.Event.Type>([
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "account.updated",
  "payout.paid",
  "transfer.created",
]);

function isTestMode() {
  return process.env.STRIPE_MODE === "test" || String(process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}

function testLog(input: {
  eventType: string;
  jobId?: string | null;
  connectedAccountId?: string | null;
  transferId?: string | null;
}) {
  if (!isTestMode()) return;
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      source: "stripe.webhook",
      eventType: input.eventType,
      jobId: input.jobId ?? null,
      connectedAccountId: input.connectedAccountId ?? null,
      transferId: input.transferId ?? null,
    }),
  );
}

function requireJobEscrowMetadata(metadata: Stripe.MetadataParam | null | undefined): {
  jobId: string;
  jobPosterUserId: string;
} | null {
  const type = String(metadata?.type ?? "");
  const jobId = String(metadata?.jobId ?? "");
  const jobPosterUserId = String(metadata?.jobPosterUserId ?? metadata?.posterId ?? "");
  if (type !== "job_escrow" || !jobId || !jobPosterUserId) return null;
  return { jobId, jobPosterUserId };
}

export async function POST(req: Request) {
  if (!stripe) {
    return NextResponse.json(
      { ok: false, error: { code: "AUTH_STRIPE_CONFIG_MISSING", message: "STRIPE_SECRET_KEY not configured" } },
      { status: 500 },
    );
  }
  const s = stripe;

  const secretPrimary = String(process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  if (!secretPrimary) {
    return NextResponse.json(
      { ok: false, error: { code: "AUTH_STRIPE_CONFIG_MISSING", message: "STRIPE_WEBHOOK_SECRET not configured" } },
      { status: 500 },
    );
  }

  const secretConnect = String(process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? "").trim() || null;
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, error: "Missing stripe-signature header" }, { status: 400 });
  }

  // Must stay raw for Stripe signature verification.
  const rawBody = Buffer.from(await req.arrayBuffer());

  let event: Stripe.Event;
  try {
    if (secretConnect) {
      try {
        event = s.webhooks.constructEvent(rawBody, signature, secretConnect);
      } catch {
        event = s.webhooks.constructEvent(rawBody, signature, secretPrimary);
      }
    } else {
      event = s.webhooks.constructEvent(rawBody, signature, secretPrimary);
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 400 });
  }

  const now = new Date();
  let duplicateEvent = false;

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(stripeWebhookEvents)
        .values({
          id: event.id,
          type: event.type,
          objectId: typeof (event.data.object as any)?.id === "string" ? String((event.data.object as any).id) : null,
          processedAt: null,
        } as any)
        .onConflictDoNothing();

      const lock = await tx
        .update(stripeWebhookEvents)
        .set({ processedAt: now } as any)
        .where(and(eq(stripeWebhookEvents.id, event.id), isNull(stripeWebhookEvents.processedAt)))
        .returning({ id: stripeWebhookEvents.id });

      if (!lock[0]?.id) {
        duplicateEvent = true;
        return;
      }

      if (!HANDLED_EVENTS.has(event.type)) {
        testLog({ eventType: event.type });
        return;
      }

      switch (event.type) {
        case "payment_intent.succeeded": {
          const pi = event.data.object as Stripe.PaymentIntent;
          const meta = requireJobEscrowMetadata(pi.metadata);
          if (!meta) {
            logEvent({
              level: "warn",
              event: "stripe.webhook_missing_job_metadata",
              route: "/api/webhooks/stripe",
              method: "POST",
              status: 200,
              code: "STRIPE_METADATA_INVALID",
              context: { eventId: event.id, eventType: event.type, paymentIntentId: pi.id },
            });
            return;
          }

          testLog({ eventType: event.type, jobId: meta.jobId });

          const jobRows = await tx
            .select({
              id: jobs.id,
              status: jobs.status,
              jobPosterUserId: jobs.jobPosterUserId,
              paymentStatus: jobs.paymentStatus,
              amountCents: jobs.amountCents,
              laborTotalCents: jobs.laborTotalCents,
              materialsTotalCents: jobs.materialsTotalCents,
              paymentCurrency: jobs.paymentCurrency,
            })
            .from(jobs)
            .where(eq(jobs.id, meta.jobId))
            .limit(1);
          const job = jobRows[0] ?? null;
          if (!job || String(job.jobPosterUserId ?? "") !== meta.jobPosterUserId) return;

          const capturedRows = await tx
            .select({ id: jobPayments.id })
            .from(jobPayments)
            .where(and(eq(jobPayments.jobId, meta.jobId), eq(jobPayments.status, "CAPTURED" as any)))
            .limit(1);
          if (String(job.paymentStatus ?? "") === "FUNDED" || Boolean(capturedRows[0]?.id)) return;

          const expectedBreakdown = calculatePayoutBreakdown(
            Number(job.laborTotalCents ?? 0),
            Number(job.materialsTotalCents ?? 0),
          );
          const expectedAmountCents = Number(expectedBreakdown.totalJobPosterPaysCents ?? 0);
          const incomingAmountCents = Number(pi.amount ?? 0);
          if (!Number.isInteger(expectedAmountCents) || expectedAmountCents <= 0 || expectedAmountCents !== incomingAmountCents) {
            logEvent({
              level: "error",
              event: "stripe.webhook_payment_amount_mismatch",
              route: "/api/webhooks/stripe",
              method: "POST",
              status: 200,
              code: "STRIPE_PAYMENT_AMOUNT_MISMATCH",
              context: {
                eventId: event.id,
                jobId: meta.jobId,
                paymentIntentId: pi.id,
                expectedAmountCents,
                incomingAmountCents,
              },
            });
            return;
          }

          const paymentRows = await tx
            .select({ id: jobPayments.id })
            .from(jobPayments)
            .where(eq(jobPayments.jobId, meta.jobId))
            .limit(1);
          const payment = paymentRows[0] ?? null;

          if (!payment?.id) {
            await tx.insert(jobPayments).values({
              id: randomUUID(),
              jobId: meta.jobId,
              stripePaymentIntentId: String(pi.id ?? ""),
              stripePaymentIntentStatus: String(pi.status ?? ""),
              amountCents: Number(pi.amount ?? 0),
              status: "CAPTURED",
              escrowLockedAt: now,
              paymentCapturedAt: now,
              updatedAt: now,
            } as any);
          } else {
            await tx
              .update(jobPayments)
              .set({
                stripePaymentIntentId: String(pi.id ?? ""),
                stripePaymentIntentStatus: String(pi.status ?? ""),
                status: "CAPTURED" as any,
                escrowLockedAt: now,
                paymentCapturedAt: now,
                updatedAt: now,
              } as any)
              .where(eq(jobPayments.jobId, meta.jobId));
          }

          await tx
            .update(jobs)
            .set({
              paymentStatus: "FUNDED" as any,
              fundedAt: now,
              stripePaymentIntentId: String(pi.id ?? "") || null,
              stripeChargeId:
                typeof (pi as any)?.latest_charge === "string"
                  ? String((pi as any).latest_charge)
                  : (pi as any)?.latest_charge?.id ?? null,
              status: "OPEN_FOR_ROUTING" as any,
              escrowLockedAt: now,
              paymentCapturedAt: now,
            } as any)
            .where(eq(jobs.id, meta.jobId));

          const escrowRows = await tx
            .select({ id: escrows.id, status: escrows.status })
            .from(escrows)
            .where(and(eq(escrows.jobId, meta.jobId), eq(escrows.kind, "JOB_ESCROW" as any)))
            .limit(1);
          const escrow = escrowRows[0] ?? null;
          if (!escrow?.id) {
            await tx.insert(escrows).values({
              jobId: meta.jobId,
              kind: "JOB_ESCROW" as any,
              amountCents: expectedAmountCents,
              currency: String(job.paymentCurrency ?? "cad").toUpperCase() as any,
              status: "FUNDED" as any,
              stripePaymentIntentId: String(pi.id ?? ""),
              webhookProcessedAt: now,
              updatedAt: now,
            } as any);
          } else if (String(escrow.status ?? "") === "PENDING") {
            await tx
              .update(escrows)
              .set({
                status: "FUNDED" as any,
                stripePaymentIntentId: String(pi.id ?? ""),
                webhookProcessedAt: now,
                updatedAt: now,
              } as any)
              .where(eq(escrows.id, escrow.id));
          }

          await tx.insert(auditLogs).values({
            id: randomUUID(),
            actorUserId: meta.jobPosterUserId,
            action: "PAYMENT_COMPLETED",
            entityType: "Job",
            entityId: meta.jobId,
            metadata: {
              stripeWebhookEventId: event.id,
              stripePaymentIntentId: String(pi.id ?? ""),
              amountCents: Number(pi.amount ?? 0),
              laborTotalCents: Number(job.laborTotalCents ?? 0),
              materialsTotalCents: Number(job.materialsTotalCents ?? 0),
            } as any,
          });
          return;
        }
        case "payment_intent.payment_failed": {
          const pi = event.data.object as Stripe.PaymentIntent;
          const meta = requireJobEscrowMetadata(pi.metadata);
          if (!meta) return;

          testLog({ eventType: event.type, jobId: meta.jobId });

          await tx
            .update(jobPayments)
            .set({
              stripePaymentIntentStatus: String(pi.status ?? ""),
              status: "FAILED" as any,
              updatedAt: now,
            } as any)
            .where(eq(jobPayments.jobId, meta.jobId));

          await tx
            .update(jobs)
            .set({ paymentStatus: "FAILED" as any } as any)
            .where(eq(jobs.id, meta.jobId));
          return;
        }
        case "charge.refunded": {
          const charge = event.data.object as Stripe.Charge;
          const paymentIntentId =
            typeof (charge as any).payment_intent === "string"
              ? String((charge as any).payment_intent)
              : (charge as any)?.payment_intent?.id ?? null;
          if (!paymentIntentId) return;

          testLog({ eventType: event.type });

          await tx
            .update(jobs)
            .set({ paymentStatus: "REFUNDED" as any, refundedAt: now } as any)
            .where(eq(jobs.stripePaymentIntentId, paymentIntentId));
          return;
        }
        case "transfer.created": {
          const transfer = event.data.object as Stripe.Transfer;
          const transferId = String(transfer.id ?? "").trim() || null;
          const jobId = typeof transfer.metadata?.jobId === "string" ? String(transfer.metadata.jobId) : null;

          testLog({
            eventType: event.type,
            jobId,
            connectedAccountId:
              typeof transfer.destination === "string" ? transfer.destination : transfer.destination?.id ?? null,
            transferId,
          });

          if (!transferId || !jobId) return;

          await tx
            .update(escrows)
            .set({ webhookProcessedAt: now, updatedAt: now } as any)
            .where(and(eq(escrows.jobId, jobId), eq(escrows.kind, "JOB_ESCROW" as any)));

          const paymentRows = await tx
            .select({ id: jobPayments.id })
            .from(jobPayments)
            .where(eq(jobPayments.jobId, jobId))
            .limit(1);

          if (paymentRows[0]?.id) {
            await tx
              .update(jobPayments)
              .set({ updatedAt: now } as any)
              .where(eq(jobPayments.id, paymentRows[0].id));

            await tx.insert(auditLogs).values({
              id: randomUUID(),
              actorUserId: "system:stripe",
              action: "STRIPE_TRANSFER_CREATED",
              entityType: "JobPayment",
              entityId: paymentRows[0].id,
              metadata: {
                stripeWebhookEventId: event.id,
                transferId,
                jobId,
                destination:
                  typeof transfer.destination === "string" ? transfer.destination : transfer.destination?.id ?? null,
                amountCents: Number(transfer.amount ?? 0),
                currency: String(transfer.currency ?? "").toUpperCase(),
              } as any,
            });
          }
          return;
        }
        case "payout.paid": {
          const payout = event.data.object as Stripe.Payout;
          const accountId = typeof event.account === "string" ? event.account : null;
          testLog({ eventType: event.type, connectedAccountId: accountId });

          const contractorRows = accountId
            ? await tx
                .select({ id: contractors.id })
                .from(contractors)
                .where(eq(contractors.stripeAccountId, accountId))
                .limit(1)
            : [];

          const routerRows = accountId
            ? await tx
                .select({ userId: payoutMethods.userId })
                .from(payoutMethods)
                .where(
                  and(
                    eq(payoutMethods.provider, "STRIPE" as any),
                    sql`${payoutMethods.details} ->> 'stripeAccountId' = ${accountId}`,
                  ),
                )
                .limit(10)
            : [];

          await tx.insert(auditLogs).values({
            id: randomUUID(),
            actorUserId: "system:stripe",
            action: "STRIPE_PAYOUT_PAID",
            entityType: "Payout",
            entityId: String(payout.id ?? event.id),
            metadata: {
              stripeWebhookEventId: event.id,
              accountId,
              contractorId: contractorRows[0]?.id ?? null,
              routerUserIds: routerRows.map((r) => String(r.userId)),
              amountCents: Number(payout.amount ?? 0),
              currency: String(payout.currency ?? "").toUpperCase(),
              arrivalDate:
                typeof payout.arrival_date === "number" ? new Date(payout.arrival_date * 1000).toISOString() : null,
            } as any,
          });
          return;
        }
        case "account.updated": {
          const account = event.data.object as Stripe.Account;
          const accountId = String(account.id ?? "").trim();
          if (!accountId) return;
          const onboardingComplete = Boolean(account.charges_enabled) && Boolean(account.payouts_enabled);

          testLog({ eventType: event.type, connectedAccountId: accountId });

          if (onboardingComplete) {
            await Promise.all([
              tx
                .update(contractors)
                .set({ stripePayoutsEnabled: true } as any)
                .where(eq(contractors.stripeAccountId, accountId)),
              tx
                .update(payoutMethods)
                .set({
                  details: sql`jsonb_set(${payoutMethods.details}, '{stripePayoutsEnabled}', to_jsonb(${true}), true)`,
                  updatedAt: now,
                } as any)
                .where(
                  and(
                    eq(payoutMethods.provider, "STRIPE" as any),
                    sql`${payoutMethods.details} ->> 'stripeAccountId' = ${accountId}`,
                  ),
                ),
            ]);
          }
          return;
        }
      }
    });
  } catch (err) {
    const ref = `stripe_wh_${randomUUID()}`;
    logEvent({
      level: "error",
      event: "stripe.webhook_error",
      route: "/api/webhooks/stripe",
      method: "POST",
      status: 500,
      code: "STRIPE_WEBHOOK_ERROR",
      context: {
        ref,
        type: event?.type,
        id: event?.id,
        message: err instanceof Error ? err.message : "unknown",
      },
    });
    return NextResponse.json({ ok: false, error: "Internal server error", ref }, { status: 500 });
  }

  if (duplicateEvent) return NextResponse.json({ ok: true, duplicate: true });
  return NextResponse.json({ ok: true });
}

