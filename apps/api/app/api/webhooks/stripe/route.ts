import { NextResponse } from "next/server";
import Stripe from "stripe";
import { logEvent } from "@/src/server/observability/log";
import { and, eq, isNull, sql } from "drizzle-orm";
import { stripe } from "@/src/stripe/stripe";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { stripeWebhookEvents } from "@/db/schema/stripeWebhookEvent";
import { contractors } from "@/db/schema/contractor";
import { routerProfiles } from "@/db/schema/routerProfile";
import { partsMaterialRequests } from "@/db/schema/partsMaterialRequest";

function requireStripe() {
  if (!stripe) {
    throw Object.assign(new Error("Stripe not configured"), { status: 500 });
  }
  return stripe;
}

function requireWebhookSecret(): string {
  const s = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s) throw Object.assign(new Error("STRIPE_WEBHOOK_SECRET not configured"), { status: 500 });
  return s;
}

export async function POST(req: Request) {
  const s = requireStripe();
  const secretPrimary = requireWebhookSecret();
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
        const t = String((pi.metadata as any)?.type ?? "");
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

        if (t !== "job_escrow") return;

        const jobId = String((pi.metadata as any)?.jobId ?? "");
        const posterId = String((pi.metadata as any)?.posterId ?? "");
        if (!jobId || !posterId) return;

        const jobRows = await tx
          .select({
            id: jobs.id,
            jobPosterUserId: jobs.jobPosterUserId,
            paymentStatus: jobs.paymentStatus,
            amountCents: jobs.amountCents,
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
      } else if (event.type === "payment_intent.payment_failed" || event.type === "payment_intent.canceled") {
        const pi = event.data.object as Stripe.PaymentIntent;
        const t = String((pi.metadata as any)?.type ?? "");
        if (t === "pm_escrow") {
          const pmId = String((pi.metadata as any)?.pmId ?? "");
          if (!pmId) return;
          await tx
            .update(partsMaterialRequests)
            .set({ paymentStatus: "FAILED" as any, updatedAt: now } as any)
            .where(eq(partsMaterialRequests.id, pmId as any));
          return;
        }
        if (t !== "job_escrow") return;
        const jobId = String((pi.metadata as any)?.jobId ?? "");
        if (!jobId) return;

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
          tx.update(routerProfiles).set({ stripePayoutsEnabled: enabled } as any).where(eq(routerProfiles.stripeAccountId, acctId)),
        ]);
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

