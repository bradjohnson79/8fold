import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { stripe } from "@/src/stripe/stripe";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { partsMaterialRequests } from "@/db/schema/partsMaterialRequest";
import { requireJobPosterReady } from "@/src/auth/onboardingGuards";
import { toHttpError } from "@/src/http/errors";
import { assertStripeMinimumAmount, normalizeStripeCurrency } from "@/src/stripe/validation";
import { isJobActive } from "@/src/utils/jobActive";
import { logEvent } from "@/src/server/observability/log";

function requireStripe() {
  if (!stripe) throw Object.assign(new Error("Stripe not configured"), { status: 500 });
  return stripe;
}

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const poster = ready;
    const pmId = getIdFromUrl(req);
    if (!pmId) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

    const rows = await db
      .select({
        id: partsMaterialRequests.id,
        jobId: partsMaterialRequests.jobId,
        amountCents: partsMaterialRequests.amountCents,
        currency: partsMaterialRequests.currency,
        paymentStatus: partsMaterialRequests.paymentStatus,
        stripePaymentIntentId: partsMaterialRequests.stripePaymentIntentId,
        jobPosterUserId: jobs.jobPosterUserId,
        jobStatus: jobs.status,
        jobPaymentStatus: jobs.paymentStatus,
      })
      .from(partsMaterialRequests)
      .innerJoin(jobs, eq(jobs.id, partsMaterialRequests.jobId))
      .where(eq(partsMaterialRequests.id, pmId as any))
      .limit(1);
    const pm = rows[0] ?? null;
    if (!pm) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (pm.jobPosterUserId !== poster.userId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    if (!isJobActive({ paymentStatus: pm.jobPaymentStatus, status: pm.jobStatus })) {
      return NextResponse.json(
        { ok: false, error: "Job is not active. Parts & Materials unavailable." },
        { status: 400 },
      );
    }

    const ps = String(pm.paymentStatus ?? "UNPAID");
    if (ps !== "UNPAID" && ps !== "FAILED") {
      return NextResponse.json({ ok: false, error: "Payment is not eligible for intent creation" }, { status: 409 });
    }

    const amountCents = Number(pm.amountCents ?? 0);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid amount" }, { status: 400 });
    }

    const s = requireStripe();
    const currency = normalizeStripeCurrency(pm.currency);
    assertStripeMinimumAmount(amountCents, currency);

    // If we already created an intent, reuse it.
    if (pm.stripePaymentIntentId) {
      const existing = await s.paymentIntents.retrieve(String(pm.stripePaymentIntentId));
      if (existing?.client_secret) {
        return NextResponse.json({ ok: true, clientSecret: existing.client_secret });
      }
    }

    const pi = await s.paymentIntents.create({
      amount: amountCents,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        type: "pm_escrow",
        pmId: String(pm.id),
        jobId: String(pm.jobId),
        posterId: poster.userId,
      },
    });
    if (!pi.client_secret) throw Object.assign(new Error("Stripe PaymentIntent missing client_secret"), { status: 500 });

    await db
      .update(partsMaterialRequests)
      .set({
        stripePaymentIntentId: pi.id,
        paymentStatus: "REQUIRES_ACTION" as any,
      } as any)
      .where(eq(partsMaterialRequests.id, pm.id as any));

    return NextResponse.json({ ok: true, clientSecret: pi.client_secret });
  } catch (err) {
    const { status } = toHttpError(err);
    logEvent({
      level: "error",
      event: "parts_materials.payment_intent_error",
      route: "/api/web/parts-materials/[id]/payment-intent",
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

