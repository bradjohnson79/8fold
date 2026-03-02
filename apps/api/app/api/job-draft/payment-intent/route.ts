import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobDraft } from "@/db/schema/jobDraft";
import { requireJobPoster } from "@/src/auth/rbac";
import { createPaymentIntent, stripe } from "@/src/payments/stripe";
import { appendLedgerEntry } from "@/src/services/v4/financialLedgerService";
import { computeModelAPricing } from "@/src/services/v4/modelAPricingService";
import { getFeeConfig } from "@/src/services/v4/paymentFeeConfigService";

type DraftData = Record<string, any>;
export const runtime = "nodejs";

function isAcceptableStatus(status: string): boolean {
  return (
    status === "requires_payment_method" ||
    status === "requires_confirmation" ||
    status === "requires_action" ||
    status === "processing" ||
    status === "succeeded" ||
    status === "requires_capture"
  );
}

const CA_PROVINCE_ALIASES: Record<string, string> = {
  AB: "AB",
  ALBERTA: "AB",
  BC: "BC",
  "BRITISH COLUMBIA": "BC",
  MB: "MB",
  MANITOBA: "MB",
  NB: "NB",
  "NEW BRUNSWICK": "NB",
  NL: "NL",
  "NEWFOUNDLAND AND LABRADOR": "NL",
  NS: "NS",
  "NOVA SCOTIA": "NS",
  NT: "NT",
  "NORTHWEST TERRITORIES": "NT",
  NU: "NU",
  NUNAVUT: "NU",
  ON: "ON",
  ONTARIO: "ON",
  PE: "PE",
  "PRINCE EDWARD ISLAND": "PE",
  QC: "QC",
  QUEBEC: "QC",
  SK: "SK",
  SASKATCHEWAN: "SK",
  YT: "YT",
  YUKON: "YT",
};

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

function normalizeProvince(countryCode: "US" | "CA", region: string): string {
  const upper = String(region ?? "").trim().toUpperCase();
  if (countryCode !== "CA") return upper;
  return CA_PROVINCE_ALIASES[upper] ?? upper;
}

async function appendModelALedgerEntries(input: {
  jobId: string;
  paymentIntentId: string;
  baseSplitCents: number;
  taxCents: number;
  estimatedProcessingFeeCents: number;
  totalCents: number;
  currency: "USD" | "CAD";
}) {
  const baseDedupe = `est:${input.jobId}:${input.paymentIntentId}`;
  // Transition-safe: keep JOB_SUBTOTAL for legacy readers while standardizing on JOB_SUBTOTAL_EST.
  await appendLedgerEntry({
    jobId: input.jobId,
    type: "JOB_SUBTOTAL_EST",
    amountCents: input.baseSplitCents,
    currency: input.currency,
    stripeRef: input.paymentIntentId,
    dedupeKey: `${baseDedupe}:JOB_SUBTOTAL_EST`,
  });
  await appendLedgerEntry({
    jobId: input.jobId,
    type: "JOB_SUBTOTAL",
    amountCents: input.baseSplitCents,
    currency: input.currency,
    stripeRef: input.paymentIntentId,
    dedupeKey: `${baseDedupe}:JOB_SUBTOTAL`,
  });
  await appendLedgerEntry({
    jobId: input.jobId,
    type: "TAX_COLLECTED_EST",
    amountCents: input.taxCents,
    currency: input.currency,
    stripeRef: input.paymentIntentId,
    dedupeKey: `${baseDedupe}:TAX_COLLECTED_EST`,
  });
  await appendLedgerEntry({
    jobId: input.jobId,
    type: "PROCESSING_FEE_EST",
    amountCents: input.estimatedProcessingFeeCents,
    currency: input.currency,
    stripeRef: input.paymentIntentId,
    dedupeKey: `${baseDedupe}:PROCESSING_FEE_EST`,
  });
  await appendLedgerEntry({
    jobId: input.jobId,
    type: "TOTAL_CHARGED_EST",
    amountCents: input.totalCents,
    currency: input.currency,
    stripeRef: input.paymentIntentId,
    dedupeKey: `${baseDedupe}:TOTAL_CHARGED_EST`,
  });
}

export async function POST(req: Request) {
  try {
    // eslint-disable-next-line no-console
    console.log("Stripe Key Exists:", !!process.env.STRIPE_SECRET_KEY);
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
    const regionCodeRaw = String(details.stateCode ?? details.region ?? "").trim();
    const regionCode = normalizeProvince(countryCode, regionCodeRaw);
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

    const feeConfig = await getFeeConfig("card");
    const computed = await computeModelAPricing({
      appraisalSubtotalCents: appraisalPriceCents,
      isRegional,
      country: countryCode,
      province: regionCode,
      percentBps: feeConfig.percentBps,
      fixedCents: feeConfig.fixedCents,
    });

    const subtotalCents = computed.baseSplitCents;
    const taxCents = computed.taxCents;
    const estimatedProcessingFeeCents = computed.estimatedProcessingFeeCents;
    const totalCents = computed.totalChargeCents;
    const paymentCurrency = computed.paymentCurrency;

    console.log("TEMP_STRIPE_DEBUG_TOTALS", {
      baseSplitCents: subtotalCents,
      subtotalCents,
      taxCents,
      estimatedProcessingFeeCents,
      totalCents,
      currency: paymentCurrency,
      province: computed.province,
      country: computed.country,
      taxRateBps: computed.taxRateBps,
      feePercentBps: feeConfig.percentBps,
      feeFixedCents: feeConfig.fixedCents,
    });
    if (computed.country === "CA" && computed.taxRateBps > 0 && taxCents === 0) {
      console.warn("TEMP_STRIPE_DEBUG_TAX_WARNING", {
        country: computed.country,
        province: computed.province,
        taxRateBps: computed.taxRateBps,
      });
    }

    const paymentData = asObject(data.payment);
    const modelAJobId = String(paymentData.modelAJobId ?? paymentData.provisionalJobId ?? "").trim() || randomUUID();
    const existingPiId = String(paymentData.paymentIntentId ?? "").trim();

    const responseBase = {
      appraisalPriceCents,
      regionalFeeCents: computed.regionalFeeCents,
      baseSplitCents: subtotalCents,
      subtotalCents,
      taxRateBps: computed.taxRateBps,
      taxCents,
      estimatedProcessingFeeCents,
      totalCents,
      contractorPayoutCents: computed.contractorPayoutCents,
      routerFeeCents: computed.routerFeeCents,
      platformFeeCents: computed.platformFeeCents,
      currency: computed.currency,
    };

    if (existingPiId && stripe) {
      try {
        const pi = await stripe.paymentIntents.retrieve(existingPiId);
        const status = String(pi.status ?? "").toLowerCase();
        const piCurrency = String(pi.currency ?? "").toLowerCase();
        const amountMatches = pi.amount === totalCents;
        const currencyMatches = piCurrency === paymentCurrency;
        const statusAcceptable = isAcceptableStatus(status);
        console.log("TEMP_STRIPE_DEBUG_EXISTING_PI", {
          id: pi.id,
          amount: pi.amount,
          expectedAmount: totalCents,
          currency: piCurrency,
          expectedCurrency: paymentCurrency,
          status,
          statusAcceptable,
          amountMatches,
          currencyMatches,
        });

        if (amountMatches && currencyMatches && statusAcceptable && pi.client_secret) {
          const nextData = {
            ...data,
            pricing: {
              ...(asObject(data.pricing)),
              appraisalPriceCents,
              selectedPriceCents: appraisalPriceCents,
              isRegional,
              regionalFeeCents: computed.regionalFeeCents,
              taxRateBps: computed.taxRateBps,
              taxCents,
              estimatedProcessingFeeCents,
              baseSplitCents: subtotalCents,
              subtotalCents,
              totalCents,
              contractorPayoutCents: computed.contractorPayoutCents,
              routerFeeCents: computed.routerFeeCents,
              platformFeeCents: computed.platformFeeCents,
              countryCode: computed.country,
              regionCode: computed.province,
            },
            payment: {
              ...paymentData,
              modelAJobId,
              paymentIntentId: pi.id,
              paymentStatus: pi.status,
            },
          };
          await db
            .update(jobDraft)
            .set({ data: nextData, updatedAt: new Date(), step: "PAYMENT" })
            .where(and(eq(jobDraft.id, draft.id), eq(jobDraft.userId, user.userId)));

          await appendModelALedgerEntries({
            jobId: modelAJobId,
            paymentIntentId: pi.id,
            baseSplitCents: subtotalCents,
            taxCents,
            estimatedProcessingFeeCents,
            totalCents,
            currency: computed.currency,
          });

          return NextResponse.json({
            success: true,
            clientSecret: pi.client_secret,
            paymentIntentId: pi.id,
            paymentStatus: pi.status,
            ...responseBase,
            traceId: randomUUID(),
          });
        }
        console.log("TEMP_STRIPE_DEBUG_REUSE_SKIPPED", {
          existingPiId,
          amountMatches,
          currencyMatches,
          statusAcceptable,
          hasClientSecret: Boolean(pi.client_secret),
        });
      } catch (existingPiErr) {
        console.warn("[job-draft/payment-intent] existing intent lookup failed; creating a fresh intent", {
          existingPiId,
          message: existingPiErr instanceof Error ? existingPiErr.message : String(existingPiErr),
          code: (existingPiErr as any)?.code,
        });
      }
    }

    const stripeIntentParams = {
      amount: totalCents,
      currency: paymentCurrency,
      captureMethod: "manual" as const,
      paymentMethodTypes: ["card"] as const,
    };
    if (stripeIntentParams.amount !== totalCents) {
      throw Object.assign(new Error("Stripe amount mismatch with backend totalCents"), { status: 500 });
    }

    const result = await createPaymentIntent(stripeIntentParams.amount, {
      currency: stripeIntentParams.currency,
      captureMethod: stripeIntentParams.captureMethod,
      requestExtendedAuthorization: true,
      paymentMethodTypes: [...stripeIntentParams.paymentMethodTypes],
      automaticPaymentMethodsEnabled: false,
      idempotencyKey: `job-draft-v4:${draft.id}:${paymentCurrency}:${totalCents}`,
      metadata: {
        scope: "job-draft-v4",
        draftId: String(draft.id),
        userId: user.userId,
        jobPosterId: user.userId,
        modelAJobId,
        country: computed.country,
        province: computed.province ?? "",
        taxRateBps: String(computed.taxRateBps),
        splitBaseCents: String(subtotalCents),
        estimatedProcessingFeeCents: String(estimatedProcessingFeeCents),
      },
      description: "8Fold Job Poster Charge",
    });
    if (String(result.currency ?? "").toLowerCase() !== paymentCurrency) {
      throw Object.assign(new Error("Stripe currency mismatch with backend payment currency"), { status: 409 });
    }

    const nextData = {
      ...data,
      pricing: {
        ...(asObject(data.pricing)),
        appraisalPriceCents,
        selectedPriceCents: appraisalPriceCents,
        isRegional,
        regionalFeeCents: computed.regionalFeeCents,
        taxRateBps: computed.taxRateBps,
        taxCents,
        estimatedProcessingFeeCents,
        baseSplitCents: subtotalCents,
        subtotalCents,
        totalCents,
        contractorPayoutCents: computed.contractorPayoutCents,
        routerFeeCents: computed.routerFeeCents,
        platformFeeCents: computed.platformFeeCents,
        countryCode: computed.country,
        regionCode: computed.province,
      },
      payment: {
        ...paymentData,
        modelAJobId,
        paymentIntentId: result.paymentIntentId,
        paymentStatus: result.status,
      },
    };
    await db
      .update(jobDraft)
      .set({ data: nextData, updatedAt: new Date(), step: "PAYMENT" })
      .where(and(eq(jobDraft.id, draft.id), eq(jobDraft.userId, user.userId)));

    await appendModelALedgerEntries({
      jobId: modelAJobId,
      paymentIntentId: result.paymentIntentId,
      baseSplitCents: subtotalCents,
      taxCents,
      estimatedProcessingFeeCents,
      totalCents,
      currency: computed.currency,
    });

    return NextResponse.json({
      success: true,
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
      paymentStatus: result.status,
      ...responseBase,
      traceId: randomUUID(),
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    const rawMessage = err instanceof Error ? err.message : "Failed to create payment intent.";
    console.error("[job-draft/payment-intent] failed", {
      status,
      message: rawMessage,
      code: (err as any)?.code,
      envKeyPresent: !!process.env.STRIPE_SECRET_KEY,
      stack: err instanceof Error ? err.stack : undefined,
    });
    const message = status >= 500 ? "Unable to confirm total right now. Please try again." : rawMessage;
    return NextResponse.json({ success: false, message }, { status });
  }
}
