import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobDraft } from "@/db/schema/jobDraft";
import { jobs } from "@/db/schema/job";
import { requireJobPoster } from "@/src/auth/rbac";
import { addBusinessDaysUTC } from "@/src/finance/businessDays";
import { stripe } from "@/src/payments/stripe";

export async function POST(req: Request) {
  try {
    const user = await requireJobPoster(req);
    const draftRows = await db
      .select()
      .from(jobDraft)
      .where(and(eq(jobDraft.user_id, user.userId), eq(jobDraft.status, "ACTIVE")))
      .limit(1);
    const draft = draftRows[0] ?? null;
    if (!draft) return NextResponse.json({ success: false, message: "Draft not found." }, { status: 404 });

    const data =
      draft.data && typeof draft.data === "object" && !Array.isArray(draft.data)
        ? (draft.data as Record<string, any>)
        : {};
    const details =
      data.details && typeof data.details === "object" && !Array.isArray(data.details)
        ? (data.details as Record<string, any>)
        : {};
    const payment =
      data.payment && typeof data.payment === "object" && !Array.isArray(data.payment)
        ? (data.payment as Record<string, any>)
        : {};
    const pricing =
      data.pricing && typeof data.pricing === "object" && !Array.isArray(data.pricing)
        ? (data.pricing as Record<string, any>)
        : {};

    const paymentIntentId = String(payment.paymentIntentId ?? "").trim();
    if (!paymentIntentId || !stripe) {
      return NextResponse.json({ success: false, message: "Payment hold is required before submit." }, { status: 409 });
    }

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== "requires_capture") {
      return NextResponse.json(
        { success: false, message: "Payment hold not secured. Complete payment confirmation first." },
        { status: 409 }
      );
    }

    const title = String(details.title ?? "").trim();
    const scope = String(details.description ?? details.scope ?? "").trim();
    const countryCode = String(details.countryCode ?? "US").toUpperCase() === "CA" ? "CA" : "US";
    const stateCode = String(details.stateCode ?? details.region ?? "").trim();
    const region = String(details.region ?? `${stateCode}-${countryCode}`).trim().toLowerCase() || `${stateCode}-${countryCode}`.toLowerCase();
    const selectedPriceCents = Number(pricing.selectedPriceCents ?? 0);
    const totalCents = Number(pricing.totalCents ?? pi.amount ?? 0);
    const isRegional = Boolean(pricing.isRegional ?? details.isRegional);
    const expectedTotalCents = selectedPriceCents + (isRegional ? 2000 : 0);

    if (
      !title ||
      !scope ||
      !stateCode ||
      !Number.isInteger(selectedPriceCents) ||
      !Number.isInteger(totalCents) ||
      selectedPriceCents <= 0 ||
      totalCents <= 0 ||
      totalCents !== expectedTotalCents
    ) {
      return NextResponse.json({ success: false, message: "Draft is missing required fields." }, { status: 400 });
    }

    const now = new Date();
    const authorizationExpiresAt = addBusinessDaysUTC(now, countryCode as "US" | "CA", 5);
    const jobId = randomUUID();
    await db.insert(jobs).values({
      id: jobId,
      status: "OPEN_FOR_ROUTING" as any,
      archived: false,
      title,
      scope,
      region,
      country: countryCode as any,
      country_code: countryCode as any,
      state_code: stateCode,
      region_code: stateCode,
      city: String(details.city ?? "") || null,
      address_full: String(details.address ?? "") || null,
      lat: typeof details.lat === "number" && Number.isFinite(details.lat) ? details.lat : null,
      lng: typeof details.lon === "number" && Number.isFinite(details.lon) ? details.lon : null,
      currency: (countryCode === "CA" ? "CAD" : "USD") as any,
      payment_currency: countryCode === "CA" ? "cad" : "usd",
      amount_cents: totalCents,
      labor_total_cents: Number.isInteger(selectedPriceCents) ? selectedPriceCents : totalCents,
      materials_total_cents: isRegional ? 2000 : 0,
      stripe_payment_intent_id: paymentIntentId,
      payment_status: "AUTHORIZED" as any,
      escrow_locked_at: now,
      authorization_expires_at: authorizationExpiresAt,
      job_poster_user_id: user.userId,
      job_type: (isRegional ? "regional" : "urban") as any,
      trade_category: String(details.category ?? details.tradeCategory ?? "HANDYMAN") as any,
      service_type: "handyman",
      availability: data.availability ?? null,
      posted_at: now,
      published_at: now,
      created_at: now,
      updated_at: now,
      price_median_cents: Number(data?.appraisal?.median ?? 0) * 100 || null,
    });

    await db
      .update(jobDraft)
      .set({ status: "ARCHIVED", step: "CONFIRMED", updated_at: now })
      .where(and(eq(jobDraft.id, draft.id), eq(jobDraft.user_id, user.userId)));

    return NextResponse.json({ success: true, jobId });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Failed to submit draft." },
      { status }
    );
  }
}
