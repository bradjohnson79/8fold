import { NextResponse } from "next/server";
import Stripe from "stripe";
import { and, eq, isNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logEvent } from "@/src/server/observability/log";
import { db } from "@/db/drizzle";

/** Minimal Stripe client for webhook verification only. Bypasses main stripe module
 * so webhooks always return JSON even when mode assertion fails at load time. */
function getWebhookStripe(): Stripe | null {
  const key = String(process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}
import { jobs } from "@/db/schema/job";
import { users } from "@/db/schema/user";
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

/** Events we process. Unknown types return 200 { ok: true, ignored: true }. */
const SUPPORTED_EVENTS = new Set<Stripe.Event.Type>([
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "transfer.created",
  "account.updated",
  "payout.paid",
  "checkout.session.completed",
]);

function json400(code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status: 400 });
}

function json500(code: string, message: string, ref?: string) {
  const body: { ok: false; error: { code: string; message: string }; ref?: string } = {
    ok: false,
    error: { code, message },
  };
  if (ref) body.ref = ref;
  return NextResponse.json(body, { status: 500 });
}

function webhookLog(type: string, meta?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify({
      source: "stripe_webhook",
      type,
      meta: meta ?? {},
      ts: new Date().toISOString(),
    }),
  );
}

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
  try {
    return await handleWebhook(req);
  } catch (err) {
    const ref = `stripe_wh_${randomUUID()}`;
    webhookLog("FAILED", { ref, code: "STRIPE_WEBHOOK_ERROR" });
    try {
      logEvent({
        level: "error",
        event: "STRIPE_WEBHOOK:uncaught",
        route: "/api/webhooks/stripe",
        method: "POST",
        status: 500,
        code: "STRIPE_WEBHOOK_ERROR",
        context: { ref, message: err instanceof Error ? err.message : "unknown" },
      });
    } catch {
      /* logEvent must not break response */
    }
    return json500("STRIPE_WEBHOOK_ERROR", "Internal server error", ref);
  }
}

async function handleWebhook(req: Request) {
  // Task 1: Environment hard guard — fail clearly if env incomplete
  const secretKey = String(process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!secretKey) {
    webhookLog("FAILED", { code: "STRIPE_SECRET_MISSING" });
    return json500("STRIPE_SECRET_MISSING", "Stripe secret key not configured");
  }
  const secretPrimary = String(process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  if (!secretPrimary) {
    webhookLog("FAILED", { code: "STRIPE_WEBHOOK_SECRET_MISSING" });
    return json500("STRIPE_WEBHOOK_SECRET_MISSING", "Webhook secret not configured");
  }

  const s = getWebhookStripe();
  if (!s) {
    webhookLog("FAILED", { code: "STRIPE_SECRET_MISSING" });
    return json500("STRIPE_SECRET_MISSING", "Stripe secret key not configured");
  }

  const secretConnect = String(process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? "").trim() || null;

  // Task 2: Signature validation hardening
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    webhookLog("FAILED", { code: "STRIPE_SIGNATURE_MISSING" });
    return json400("STRIPE_SIGNATURE_MISSING", "Missing stripe-signature header");
  }

  const rawBody = Buffer.from(await req.arrayBuffer());

  let event: Stripe.Event;
  try {
    if (secretConnect) {
      try {
        event = s.webhooks.constructEvent(rawBody, sig, secretConnect);
      } catch {
        event = s.webhooks.constructEvent(rawBody, sig, secretPrimary);
      }
    } else {
      event = s.webhooks.constructEvent(rawBody, sig, secretPrimary);
    }
  } catch {
    webhookLog("FAILED", { code: "STRIPE_SIGNATURE_INVALID" });
    return json400("STRIPE_SIGNATURE_INVALID", "Invalid signature");
  }

  webhookLog("VERIFIED", { eventId: event.id, eventType: event.type });

  const now = new Date();
  let duplicateEvent = false;
  let ignoredEvent = false;

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
        webhookLog("DUPLICATE", { eventId: event.id });
        return;
      }

      // Task 5: Event type whitelist — unknown types return 200 { ok: true, ignored: true }
      if (!SUPPORTED_EVENTS.has(event.type)) {
        ignoredEvent = true;
        webhookLog("PROCESSED", { eventId: event.id, eventType: event.type, ignored: true });
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
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.mode !== "setup") return;
          const userId = typeof session.metadata?.userId === "string" ? String(session.metadata.userId).trim() : null;
          if (!userId) return;

          const setupIntentId =
            typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent?.id ?? null;
          if (!setupIntentId) return;

          const s = getWebhookStripe();
          if (!s) return;
          const si = await s.setupIntents.retrieve(setupIntentId);
          const pmId = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id ?? null;
          if (!pmId || !si.customer) return;

          const customerId = typeof si.customer === "string" ? si.customer : si.customer.id;
          await s.customers.update(customerId, { invoice_settings: { default_payment_method: pmId } });

          await tx
            .update(users)
            .set({
              stripeDefaultPaymentMethodId: pmId,
              stripeStatus: "CONNECTED",
              stripeUpdatedAt: now,
              updatedAt: now,
            } as any)
            .where(eq(users.id, userId));
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
    webhookLog("FAILED", {
      ref,
      eventId: event?.id,
      eventType: event?.type,
      code: "STRIPE_WEBHOOK_ERROR",
    });
    try {
      logEvent({
        level: "error",
        event: "STRIPE_WEBHOOK:handler_error",
        route: "/api/webhooks/stripe",
        method: "POST",
        status: 500,
        code: "STRIPE_WEBHOOK_ERROR",
        context: {
          ref,
          eventId: event?.id,
          eventType: event?.type,
          message: err instanceof Error ? err.message : "unknown",
        },
      });
    } catch {
      /* logEvent must not break response */
    }
    return json500("STRIPE_WEBHOOK_ERROR", "Internal server error", ref);
  }

  if (duplicateEvent) return NextResponse.json({ ok: true, duplicate: true });
  if (ignoredEvent) return NextResponse.json({ ok: true, ignored: true });
  webhookLog("PROCESSED", { eventId: event.id, eventType: event.type });
  return NextResponse.json({ ok: true });
}

/**
 * LOCAL REPLAY TEST:
 *   stripe listen --forward-to localhost:3003/api/webhooks/stripe
 *   stripe trigger payment_intent.succeeded
 *
 * Expected outputs:
 *   Success        → 200 {"ok":true}
 *   Duplicate replay → 200 {"ok":true,"duplicate":true}
 *   Invalid signature → 400 {"ok":false,"error":{"code":"STRIPE_SIGNATURE_INVALID","message":"Invalid signature"}}
 *   Missing secret → 500 {"ok":false,"error":{"code":"STRIPE_WEBHOOK_SECRET_MISSING","message":"Webhook secret not configured"}}
 *   Missing stripe-signature header → 400 {"ok":false,"error":{"code":"STRIPE_SIGNATURE_MISSING","message":"Missing stripe-signature header"}}
 */

