import { NextResponse } from "next/server";
import Stripe from "stripe";
import { logEvent } from "@/src/server/observability/log";
import { and, eq, isNull, sql } from "drizzle-orm";
import { stripe } from "@/src/stripe/stripe";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { stripeWebhookEvents } from "@/db/schema/stripeWebhookEvent";
import { contractors } from "@/db/schema/contractor";
import { payoutMethods } from "@/db/schema/payoutMethod";
import { partsMaterialRequests } from "@/db/schema/partsMaterialRequest";
import { auditLogs } from "@/db/schema/auditLog";
import { jobPayments } from "@/db/schema/jobPayment";
import { transferRecords } from "@/db/schema/transferRecord";
import {
  isAllowedTransferRecordStatusTransition,
  nextStatusForTransferLifecycleEvent,
  type TransferRecordStatus,
} from "@/src/payouts/transferStatusTransitions";
import { randomUUID } from "crypto";

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

// Pages-router only, but harmless here; keeps the intent explicit.
export const config = {
  api: { bodyParser: false },
};

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

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ ok: false, error: "Missing stripe-signature header" }, { status: 400 });

  const body = Buffer.from(await req.arrayBuffer());

  let event: Stripe.Event;
  try {
    // If a separate Connect webhook secret is configured, try it first.
    if (secretConnect) {
      try {
        event = s.webhooks.constructEvent(body, sig, secretConnect);
      } catch {
        event = s.webhooks.constructEvent(body, sig, secretPrimary);
      }
    } else {
      event = s.webhooks.constructEvent(body, sig, secretPrimary);
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 400 });
  }

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      // Idempotency record.
      await tx
        .insert(stripeWebhookEvents)
        .values({
          id: event.id,
          type: event.type,
          objectId: typeof (event.data.object as any)?.id === "string" ? String((event.data.object as any).id) : null,
          processedAt: null,
        } as any)
        .onConflictDoNothing();

      // Acquire lock by setting processedAt once.
      const lock = await tx
        .update(stripeWebhookEvents)
        .set({ processedAt: now } as any)
        .where(and(eq(stripeWebhookEvents.id, event.id), isNull(stripeWebhookEvents.processedAt)))
        .returning({ id: stripeWebhookEvents.id });

      if (!lock[0]?.id) return; // already processed

      if (event.type === "payment_intent.succeeded") {
        const pi = event.data.object as Stripe.PaymentIntent;
        const meta = (pi.metadata as any) ?? {};
        const t = String(meta?.type ?? "");
        if (t === "pm_escrow") {
          const pmId = String((pi.metadata as any)?.pmId ?? "");
          const jobId = String((pi.metadata as any)?.jobId ?? "");
          const posterId = String((pi.metadata as any)?.posterId ?? "");
          if (!pmId || !jobId || !posterId) return;

          // Lock P&M row for safe idempotency inside this event.
          await tx.execute(sql`select "id" from "8fold_test"."PartsMaterialRequest" where "id" = ${pmId}::uuid for update`);

          const pmRows = await tx
            .select({
              id: partsMaterialRequests.id,
              jobId: partsMaterialRequests.jobId,
              paymentStatus: partsMaterialRequests.paymentStatus,
              stripePaymentIntentId: partsMaterialRequests.stripePaymentIntentId,
              jobPosterUserId: jobs.jobPosterUserId,
            })
            .from(partsMaterialRequests)
            .innerJoin(jobs, eq(jobs.id, partsMaterialRequests.jobId))
            .where(eq(partsMaterialRequests.id, pmId as any))
            .limit(1);
          const pm = pmRows[0] ?? null;
          if (!pm) return;
          if (String(pm.jobId) !== jobId) return;
          if (String(pm.jobPosterUserId ?? "") !== posterId) return;
          if (String(pm.paymentStatus) === "FUNDED") return;

          await tx
            .update(partsMaterialRequests)
            .set({
              paymentStatus: "FUNDED" as any,
              fundedAt: now,
              stripePaymentIntentId: String(pi.id ?? "") || pm.stripePaymentIntentId || null,
              updatedAt: now,
            } as any)
            .where(eq(partsMaterialRequests.id, pm.id as any));
          return;
        }

        const jobId = String(meta?.jobId ?? "");
        const posterId = String(meta?.posterId ?? meta?.jobPosterUserId ?? "");
        const isJobEscrow = t === "job_escrow" || (t === "" && Boolean(jobId));
        if (!isJobEscrow) return;
        if (!jobId || !posterId) return;

        const jobRows = await tx
          .select({
            id: jobs.id,
            jobPosterUserId: jobs.jobPosterUserId,
            paymentStatus: jobs.paymentStatus,
            amountCents: jobs.amountCents,
            laborTotalCents: jobs.laborTotalCents,
            materialsTotalCents: jobs.materialsTotalCents,
          })
          .from(jobs)
          .where(eq(jobs.id, jobId))
          .limit(1);
        const job = jobRows[0] ?? null;
        if (!job) return;
        if (String(job.jobPosterUserId ?? "") !== posterId) return;

        if (String(job.paymentStatus) === "FUNDED") return; // idempotent

        // Optional: amount mismatch check (job is authoritative).
        if (Number(job.amountCents ?? 0) > 0 && Number(job.amountCents ?? 0) !== Number(pi.amount ?? 0)) {
          await tx
            .update(jobs)
            .set({ paymentStatus: "FAILED" as any } as any)
            .where(eq(jobs.id, jobId));
          return;
        }

        // Keep jobPayments in sync for diagnostic endpoints and refunds.
        await tx
          .update(jobPayments)
          .set({
            stripePaymentIntentStatus: String(pi.status ?? ""),
            status: "CAPTURED" as any,
            updatedAt: now,
          } as any)
          .where(eq(jobPayments.jobId, jobId));

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
            // Routable only after funding.
            status: "OPEN_FOR_ROUTING" as any,
            escrowLockedAt: now,
            paymentCapturedAt: now,
          } as any)
          .where(eq(jobs.id, jobId));

        await tx.insert(auditLogs).values({
          id: randomUUID(),
          actorUserId: posterId,
          action: "PAYMENT_COMPLETED",
          entityType: "Job",
          entityId: jobId,
          metadata: {
            stripeWebhookEventId: event.id,
            stripePaymentIntentId: String(pi.id ?? ""),
            amountCents: Number(pi.amount ?? 0),
            laborTotalCents: Number(job.laborTotalCents ?? 0),
            materialsTotalCents: Number(job.materialsTotalCents ?? 0),
          } as any,
        });
      } else if (event.type === "payment_intent.payment_failed" || event.type === "payment_intent.canceled") {
        const pi = event.data.object as Stripe.PaymentIntent;
        const meta = (pi.metadata as any) ?? {};
        const t = String(meta?.type ?? "");
        if (t === "pm_escrow") {
          const pmId = String((pi.metadata as any)?.pmId ?? "");
          if (!pmId) return;
          await tx
            .update(partsMaterialRequests)
            .set({ paymentStatus: "FAILED" as any, updatedAt: now } as any)
            .where(eq(partsMaterialRequests.id, pmId as any));
          return;
        }
        const jobId = String(meta?.jobId ?? "");
        const isJobEscrow = t === "job_escrow" || (t === "" && Boolean(jobId));
        if (!isJobEscrow) return;
        if (!jobId) return;

        await tx
          .update(jobPayments)
          .set({
            stripePaymentIntentStatus: String(pi.status ?? ""),
            status: "FAILED" as any,
            updatedAt: now,
          } as any)
          .where(eq(jobPayments.jobId, jobId));

        await tx
          .update(jobs)
          .set({ paymentStatus: "FAILED" as any } as any)
          .where(eq(jobs.id, jobId));
      } else if (event.type === "charge.refunded") {
        const ch = event.data.object as Stripe.Charge;
        const paymentIntentId =
          typeof (ch as any).payment_intent === "string" ? String((ch as any).payment_intent) : (ch as any)?.payment_intent?.id ?? null;
        if (!paymentIntentId) return;

        await tx
          .update(jobs)
          .set({ paymentStatus: "REFUNDED" as any, refundedAt: now } as any)
          .where(eq(jobs.stripePaymentIntentId, paymentIntentId));
      } else if (event.type === "account.updated") {
        const acct = event.data.object as Stripe.Account;
        const acctId = String(acct.id ?? "");
        if (!acctId) return;

        const enabled = Boolean((acct as any)?.payouts_enabled);

        await Promise.all([
          tx.update(contractors).set({ stripePayoutsEnabled: enabled } as any).where(eq(contractors.stripeAccountId, acctId)),
          tx
            .update(payoutMethods)
            .set({
              details: sql`jsonb_set(${payoutMethods.details}, '{stripePayoutsEnabled}', to_jsonb(${enabled}), true)`,
              updatedAt: now,
            } as any)
            .where(
              and(
                eq(payoutMethods.provider, "STRIPE" as any),
                sql`${payoutMethods.details} ->> 'stripeAccountId' = ${acctId}`,
              ),
            ),
        ]);
      } else if (
        String(event.type) === "transfer.created" ||
        String(event.type) === "transfer.failed" ||
        String(event.type) === "transfer.updated" ||
        String(event.type) === "transfer.reversed"
      ) {
        const eventType = String(event.type);
        const tr = event.data.object as any;
        const transferId = String(tr?.id ?? "").trim();
        if (!transferId) {
          logEvent({
            level: "warn",
            event: "stripe.transfer_webhook_missing_id",
            route: "/api/webhooks/stripe",
            method: "POST",
            status: 200,
            code: "STRIPE_TRANSFER_ID_MISSING",
            context: { type: eventType, stripeEventId: event.id },
          });
          return;
        }

        const metaJobId = typeof tr?.metadata?.jobId === "string" ? String(tr.metadata.jobId) : null;
        const createdIso =
          typeof tr?.created === "number" && Number.isFinite(tr.created) ? new Date(Number(tr.created) * 1000).toISOString() : null;
        const amountCents = typeof tr?.amount === "number" ? Number(tr.amount) : null;
        const currency = typeof tr?.currency === "string" ? String(tr.currency) : null;
        const destination =
          typeof tr?.destination === "string" ? String(tr.destination) : typeof tr?.destination?.id === "string" ? String(tr.destination.id) : null;

        const nextStatus =
          eventType === "transfer.updated"
            ? Boolean(tr?.reversed) || Number(tr?.amount_reversed ?? 0) > 0
              ? "REVERSED"
              : "SENT"
            : nextStatusForTransferLifecycleEvent(eventType as any);
        const reason =
          nextStatus === "SENT"
            ? null
            : String(tr?.failure_message ?? tr?.failure_reason ?? tr?.failure_code ?? `stripe_${nextStatus.toLowerCase()}`).slice(0, 500);

        // Never create new rows here (no payout logic). We only reconcile lifecycle state for existing legs.
        const existing = await tx
          .select({ id: transferRecords.id, jobId: transferRecords.jobId, status: transferRecords.status })
          .from(transferRecords)
          .where(and(eq(transferRecords.method, "STRIPE" as any), eq(transferRecords.stripeTransferId, transferId)))
          .limit(2);

        if (existing.length > 1) {
          logEvent({
            level: "error",
            event: "stripe.transfer_webhook_non_unique",
            route: "/api/webhooks/stripe",
            method: "POST",
            status: 200,
            code: "TRANSFER_RECORD_NON_UNIQUE",
            context: { type: eventType, stripeEventId: event.id, transferId, existingCount: existing.length },
          });
          return;
        }

        const row = existing[0] ?? null;
        if (!row?.id) {
          logEvent({
            level: "warn",
            event: "stripe.transfer_webhook_orphan",
            route: "/api/webhooks/stripe",
            method: "POST",
            status: 200,
            code: "TRANSFER_RECORD_NOT_FOUND",
            context: { type: eventType, stripeEventId: event.id, transferId, metadataJobId: metaJobId, amountCents, currency, destination, createdAt: createdIso },
          });
          return;
        }

        const fromStatus = String(row.status ?? "").toUpperCase() as TransferRecordStatus;
        const toStatus = nextStatus;

        if (!isAllowedTransferRecordStatusTransition(fromStatus, toStatus)) {
          logEvent({
            level: "error",
            event: "stripe.transfer_webhook_illegal_transition",
            route: "/api/webhooks/stripe",
            method: "POST",
            status: 200,
            code: "TRANSFER_STATUS_TRANSITION_ILLEGAL",
            context: {
              stripeEventId: event.id,
              type: eventType,
              jobId: String(row.jobId ?? ""),
              transferId,
              fromStatus,
              toStatus,
            },
          });
          return;
        }

        // Idempotent: already in desired state.
        if (fromStatus === toStatus) return;

        // If Stripe says REVERSED but we missed the SENT transition, do a safe two-step.
        if (fromStatus === "PENDING" && toStatus === "REVERSED") {
          const step1 = await tx
            .update(transferRecords)
            .set({ status: "SENT" as any, failureReason: null, releasedAt: sql`coalesce(${transferRecords.releasedAt}, ${now})` } as any)
            .where(and(eq(transferRecords.id, row.id), eq(transferRecords.status, "PENDING" as any)))
            .returning({ id: transferRecords.id });
          if (!step1[0]?.id) {
            logEvent({
              level: "warn",
              event: "stripe.transfer_webhook_race_no_update",
              route: "/api/webhooks/stripe",
              method: "POST",
              status: 200,
              code: "TRANSFER_RECORD_RACE",
              context: { stripeEventId: event.id, type: eventType, jobId: String(row.jobId ?? ""), transferId, fromStatus, toStatus },
            });
            return;
          }
          const step2 = await tx
            .update(transferRecords)
            .set({ status: "REVERSED" as any, failureReason: reason } as any)
            .where(and(eq(transferRecords.id, row.id), eq(transferRecords.status, "SENT" as any)))
            .returning({ id: transferRecords.id });
          if (!step2[0]?.id) {
            logEvent({
              level: "warn",
              event: "stripe.transfer_webhook_race_no_update",
              route: "/api/webhooks/stripe",
              method: "POST",
              status: 200,
              code: "TRANSFER_RECORD_RACE",
              context: { stripeEventId: event.id, type: eventType, jobId: String(row.jobId ?? ""), transferId, fromStatus: "SENT", toStatus },
            });
          }
          return;
        }

        const updated =
          toStatus === "SENT"
            ? await tx
                .update(transferRecords)
                .set({ status: "SENT" as any, failureReason: null, releasedAt: sql`coalesce(${transferRecords.releasedAt}, ${now})` } as any)
                .where(and(eq(transferRecords.id, row.id), eq(transferRecords.status, fromStatus as any)))
                .returning({ id: transferRecords.id })
            : await tx
                .update(transferRecords)
                .set({ status: toStatus as any, failureReason: reason } as any)
                .where(and(eq(transferRecords.id, row.id), eq(transferRecords.status, fromStatus as any)))
                .returning({ id: transferRecords.id });

        if (!updated[0]?.id) {
          logEvent({
            level: "warn",
            event: "stripe.transfer_webhook_race_no_update",
            route: "/api/webhooks/stripe",
            method: "POST",
            status: 200,
            code: "TRANSFER_RECORD_RACE",
            context: { stripeEventId: event.id, type: eventType, jobId: String(row.jobId ?? ""), transferId, fromStatus, toStatus },
          });
        }
      }
    });
  } catch (err) {
    logEvent({
      level: "error",
      event: "stripe.webhook_error",
      route: "/api/webhooks/stripe",
      method: "POST",
      status: 500,
      code: "STRIPE_WEBHOOK_ERROR",
      context: { type: event?.type, id: event?.id },
    });
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

