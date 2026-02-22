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
import { finalizeJobFundingFromPaymentIntent } from "@/src/payments/finalizeJobFundingFromPaymentIntent";
import {
  finalizePmFundingFromPaymentIntent,
  requirePmEscrowMetadata,
} from "@/src/pm/finalizePmFunding";

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
          const pmMeta = requirePmEscrowMetadata(pi.metadata);
          if (pmMeta) {
            testLog({ eventType: event.type, jobId: pmMeta.jobId });
            const finalized = await finalizePmFundingFromPaymentIntent(pi, {
              route: "/api/webhooks/stripe",
              source: "webhook",
              webhookEventId: event.id,
              tx,
            });
            if (!finalized.ok) {
              logEvent({
                level: "error",
                event: "stripe.webhook_pm_finalize_failed",
                route: "/api/webhooks/stripe",
                method: "POST",
                status: 200,
                code: finalized.code,
                context: {
                  eventId: event.id,
                  paymentIntentId: pi.id,
                  pmRequestId: pmMeta.pmRequestId,
                  reason: finalized.reason,
                },
              });
            }
            return;
          }

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
          const finalized = await finalizeJobFundingFromPaymentIntent(pi, {
            route: "/api/webhooks/stripe",
            source: "webhook",
            webhookEventId: event.id,
            tx,
          });
          if (!finalized.ok) {
            logEvent({
              level: "error",
              event: "stripe.webhook_payment_finalize_failed",
              route: "/api/webhooks/stripe",
              method: "POST",
              status: 200,
              code: finalized.code,
              context: {
                eventId: event.id,
                paymentIntentId: pi.id,
                jobId: finalized.jobId,
                traceId: finalized.traceId,
                reason: finalized.reason,
              },
            });
          }
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
            .set({ payment_status: "FAILED" as any })
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
            .set({ payment_status: "REFUNDED" as any, refunded_at: now })
            .where(eq(jobs.stripe_payment_intent_id, paymentIntentId));
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

