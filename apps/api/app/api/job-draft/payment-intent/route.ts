import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobDraft } from "@/db/schema/jobDraft";
import { requireJobPoster } from "@/src/auth/rbac";
import { createPaymentIntent, stripe } from "@/src/payments/stripe";
import { computeEscrowPricing } from "@/src/services/escrow/pricing";

type DraftData = Record<string, any>;

function isPreConfirmStatus(status: string): boolean {
  return status === "requires_payment_method" || status === "requires_confirmation" || status === "requires_action";
}

function isAcceptableStatus(status: string): boolean {
  return (
    status === "requires_payment_method" ||
    status === "requires_confirmation" ||
    status === "requires_action" ||
    status === "processing" ||
    status === "succeeded"
  );
}

function asObject(v: unknown): DraftData {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as DraftData) : {};
}

function hasAvailabilitySelection(v: unknown): boolean {
  const root = asObject(v);
  for (const day of Object.values(root)) {
    const blocks = asObject(day);
    if (blocks.morning === true || blocks.afternoon === true || blocks.evening === true) return true;
  }
  return false;
}

export async function POST(req: Request) {
  try {
    const user = await requireJobPoster(req);
    const body = (await req.json().catch(() => null)) as {
      selectedPrice?: number;
      isRegional?: boolean;
    } | null;

    const appraisalPriceCents = Number(body?.selectedPrice ?? NaN);
    if (!Number.isInteger(appraisalPriceCents) || appraisalPriceCents <= 0) {
      return NextResponse.json({ success: false, message: "selectedPrice must be positive cents." }, { status: 400 });
    }
    if (typeof body?.isRegional !== "boolean") {
      return NextResponse.json({ success: false, message: "isRegional must be boolean." }, { status: 400 });
    }
    const isRegional = body.isRegional;

    const rows = await db
      .select()
      .from(jobDraft)
      .where(and(eq(jobDraft.userId, user.userId), eq(jobDraft.status, "ACTIVE")))
      .limit(1);
    const draft = rows[0] ?? null;
    if (!draft) {
      return NextResponse.json({ success: false, message: "Draft not found." }, { status: 404 });
    }

    const data = asObject(draft.data);
    const details = asObject(data.details);
    const availability = data.availability;

    const tradeCategory = String(details.tradeCategory ?? "").trim();
    const title = String(details.title ?? "").trim();
    const description = String(details.description ?? "").trim();
    const address = String(details.address ?? "").trim();
    const countryCode = String(details.countryCode ?? "US").trim().toUpperCase() === "CA" ? "CA" : "US";
    const regionCode = String(details.stateCode ?? details.region ?? "").trim().toUpperCase();
    const lat = Number(details.lat);
    const lon = Number(details.lon);

    if (!tradeCategory || !title || !description || !address || !regionCode || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json(
        { success: false, message: "Trade, title, description, address, region, and coordinates are required." },
        { status: 400 },
      );
    }
    if (!hasAvailabilitySelection(availability)) {
      return NextResponse.json({ success: false, message: "At least one availability selection is required." }, { status: 400 });
    }

    const computed = await computeEscrowPricing({
      appraisalSubtotalCents: appraisalPriceCents,
      isRegional,
      country: countryCode,
      province: regionCode,
    });
    const taxCents = computed.taxAmountCents;
    const totalCents = computed.totalAmountCents;

    const existingPiId = String(data?.payment?.paymentIntentId ?? "").trim();

    if (existingPiId && stripe) {
      const pi = await stripe.paymentIntents.retrieve(existingPiId);
      const nextCurrency = computed.paymentCurrency;
      const status = String(pi.status ?? "").toLowerCase();
      const currencyMismatch = String(pi.currency ?? "").toLowerCase() !== nextCurrency;
      const amountMismatch = pi.amount !== totalCents;
      const mismatched = currencyMismatch || amountMismatch;

      if (mismatched && isPreConfirmStatus(status)) {
        await stripe.paymentIntents.update(pi.id, {
          amount: totalCents,
          metadata: {
            ...(pi.metadata ?? {}),
            scope: "job-draft-v4",
            draftId: String(draft.id),
            userId: user.userId,
            jobPosterId: user.userId,
            country: computed.country,
            province: computed.province ?? "",
            taxRateBps: String(computed.taxRateBps),
            splitBaseCents: String(computed.splitBaseCents),
          },
        });
      }

      const refreshed = await stripe.paymentIntents.retrieve(pi.id);
      const refreshedStatus = String(refreshed.status ?? "").toLowerCase();
      const refreshedMismatched =
        String(refreshed.currency ?? "").toLowerCase() !== nextCurrency || refreshed.amount !== totalCents;

      if (!refreshedMismatched && isAcceptableStatus(refreshedStatus)) {
        const nextData = {
          ...data,
          pricing: {
            ...(asObject(data.pricing)),
            appraisalPriceCents,
            selectedPriceCents: appraisalPriceCents,
            isRegional,
            regionalFeeCents: computed.regionalFeeCents,
            taxRateBps: computed.taxRateBps,
            taxCents: computed.taxAmountCents,
            subtotalCents: computed.splitBaseCents,
            totalCents: computed.totalAmountCents,
            countryCode: computed.country,
            regionCode: computed.province,
          },
          payment: {
            ...(asObject(data.payment)),
            paymentIntentId: refreshed.id,
            paymentStatus: refreshed.status,
          },
        };
        await db
          .update(jobDraft)
          .set({ data: nextData, updatedAt: new Date(), step: "PAYMENT" })
          .where(and(eq(jobDraft.id, draft.id), eq(jobDraft.userId, user.userId)));
        return NextResponse.json({
          success: true,
          clientSecret: refreshed.client_secret,
          paymentIntentId: refreshed.id,
          paymentStatus: refreshed.status,
          appraisalPriceCents,
          regionalFeeCents: computed.regionalFeeCents,
          taxRateBps: computed.taxRateBps,
          taxCents: computed.taxAmountCents,
          totalCents: computed.totalAmountCents,
          currency: computed.currency,
        });
      }
    }

    const result = await createPaymentIntent(totalCents, {
      currency: computed.paymentCurrency,
      idempotencyKey: `job-draft-v4:${draft.id}:${computed.paymentCurrency}:${totalCents}`,
      metadata: {
        scope: "job-draft-v4",
        draftId: String(draft.id),
        userId: user.userId,
        jobPosterId: user.userId,
        country: computed.country,
        province: computed.province ?? "",
        taxRateBps: String(computed.taxRateBps),
        splitBaseCents: String(computed.splitBaseCents),
      },
      description: "8Fold Job Poster Charge",
    });

    const nextData = {
      ...data,
      pricing: {
        ...(asObject(data.pricing)),
        appraisalPriceCents,
        selectedPriceCents: appraisalPriceCents,
        isRegional,
        regionalFeeCents: computed.regionalFeeCents,
        taxRateBps: computed.taxRateBps,
        taxCents: computed.taxAmountCents,
        subtotalCents: computed.splitBaseCents,
        totalCents: computed.totalAmountCents,
        countryCode: computed.country,
        regionCode: computed.province,
      },
      payment: {
        ...(asObject(data.payment)),
        paymentIntentId: result.paymentIntentId,
        paymentStatus: result.status,
      },
    };
    await db
      .update(jobDraft)
      .set({ data: nextData, updatedAt: new Date(), step: "PAYMENT" })
      .where(and(eq(jobDraft.id, draft.id), eq(jobDraft.userId, user.userId)));

    return NextResponse.json({
      success: true,
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
      paymentStatus: result.status,
      appraisalPriceCents,
      regionalFeeCents: computed.regionalFeeCents,
      taxRateBps: computed.taxRateBps,
      taxCents: computed.taxAmountCents,
      totalCents: computed.totalAmountCents,
      currency: computed.currency,
      traceId: randomUUID(),
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    const rawMessage = err instanceof Error ? err.message : "Failed to create payment intent.";
    console.error("[job-draft/payment-intent] failed", {
      status,
      message: rawMessage,
      code: (err as any)?.code,
    });
    const message = status >= 500 ? "Unable to confirm total right now. Please try again." : rawMessage;
    return NextResponse.json(
      { success: false, message },
      { status }
    );
  }
}
