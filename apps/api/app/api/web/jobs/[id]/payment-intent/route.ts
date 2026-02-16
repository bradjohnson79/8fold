import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { stripe } from "@/src/stripe/stripe";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { requireJobPosterReady } from "@/src/auth/onboardingGuards";
import { toHttpError } from "@/src/http/errors";
import { assertStripeMinimumAmount, normalizeStripeCurrency } from "@/src/stripe/validation";
import { logEvent } from "@/src/server/observability/log";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("jobs") + 1;
  return parts[idx] ?? "";
}

function requireStripe() {
  if (!stripe) {
    throw Object.assign(new Error("Stripe not configured"), { status: 500 });
  }
  return stripe;
}

export async function POST(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const poster = ready;
    const jobId = getIdFromUrl(req);
    if (!jobId) return NextResponse.json({ ok: false, error: "Invalid job id" }, { status: 400 });

    const jobRows = await db
      .select({
        id: jobs.id,
        archived: jobs.archived,
        jobPosterUserId: jobs.jobPosterUserId,
        paymentStatus: jobs.paymentStatus,
        amountCents: jobs.amountCents,
        paymentCurrency: jobs.paymentCurrency,
        stripePaymentIntentId: jobs.stripePaymentIntentId,
      })
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.archived, false)))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (job.jobPosterUserId !== poster.userId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const ps = String(job.paymentStatus ?? "UNPAID");
    if (ps !== "UNPAID" && ps !== "FAILED") {
      return NextResponse.json({ ok: false, error: "Payment is not eligible for intent creation" }, { status: 409 });
    }
    const amountCents = Number(job.amountCents ?? 0);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid amount" }, { status: 400 });
    }

    const s = requireStripe();
    const currency = normalizeStripeCurrency(job.paymentCurrency);
    assertStripeMinimumAmount(amountCents, currency);

    // If we already created an intent and we're still awaiting action, reuse it.
    if (job.stripePaymentIntentId) {
      const existing = await s.paymentIntents.retrieve(String(job.stripePaymentIntentId));
      if (existing?.client_secret) {
        return NextResponse.json({ ok: true, clientSecret: existing.client_secret });
      }
    }

    const pi = await s.paymentIntents.create({
      amount: amountCents,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        type: "job_escrow",
        jobId,
        posterId: poster.userId,
      },
    });

    if (!pi.client_secret) {
      throw Object.assign(new Error("Stripe PaymentIntent missing client_secret"), { status: 500 });
    }

    const now = new Date();
    await db
      .update(jobs)
      .set({
        stripePaymentIntentId: pi.id,
        paymentStatus: "REQUIRES_ACTION" as any,
        amountCents,
        fundedAt: null,
        releasedAt: null,
      } as any)
      .where(eq(jobs.id, jobId));

    return NextResponse.json({ ok: true, clientSecret: pi.client_secret });
  } catch (err) {
    const { status } = toHttpError(err);
    logEvent({
      level: "error",
      event: "job.payment_intent_error",
      route: "/api/web/jobs/[id]/payment-intent",
      method: "POST",
      status,
      code: "PAYMENT_INTENT_FAILED",
    });
    return NextResponse.json(
      { ok: false, error: status === 400 || status === 401 || status === 403 || status === 409 ? (err as any)?.message ?? "Request failed" : "Payment intent failed" },
      { status: status >= 400 && status < 500 ? status : 500 },
    );
  }
}

