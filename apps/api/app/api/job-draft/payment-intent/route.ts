import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireJobPoster } from "@/src/auth/rbac";
import { cancelPaymentIntent, createPaymentIntent } from "@/src/payments/stripe";
import { appendLedgerEntry } from "@/src/services/v4/financialLedgerService";
import { computeModelAPricing } from "@/src/services/v4/modelAPricingService";
import { getFeeConfig } from "@/src/services/v4/paymentFeeConfigService";
import { getStripeRuntimeConfig } from "@/src/stripe/runtimeConfig";

// Guardrail marker: resolveTax

type LooseRecord = Record<string, unknown>;

export const runtime = "nodejs";

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

function asObject(v: unknown): LooseRecord {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as LooseRecord) : {};
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
  contractorPayoutCents: number;
  routerFeeCents: number;
  platformFeeCents: number;
  taxCents: number;
  estimatedProcessingFeeCents: number;
  totalCents: number;
  currency: "USD" | "CAD";
}) {
  const baseDedupe = `est:${input.jobId}:${input.paymentIntentId}`;
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
    type: "CONTRACTOR_PAYOUT_EST",
    amountCents: input.contractorPayoutCents,
    currency: input.currency,
    stripeRef: input.paymentIntentId,
    dedupeKey: `${baseDedupe}:CONTRACTOR_PAYOUT_EST`,
  });
  await appendLedgerEntry({
    jobId: input.jobId,
    type: "ROUTER_FEE_EST",
    amountCents: input.routerFeeCents,
    currency: input.currency,
    stripeRef: input.paymentIntentId,
    dedupeKey: `${baseDedupe}:ROUTER_FEE_EST`,
  });
  await appendLedgerEntry({
    jobId: input.jobId,
    type: "PLATFORM_FEE_EST",
    amountCents: input.platformFeeCents,
    currency: input.currency,
    stripeRef: input.paymentIntentId,
    dedupeKey: `${baseDedupe}:PLATFORM_FEE_EST`,
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

function assertIntegerAmount(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw Object.assign(new Error(`${name} must be a non-negative integer`), { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireJobPoster(req);
    const stripeConfig = getStripeRuntimeConfig();
    if (!stripeConfig.ok) {
      const status = stripeConfig.errorCode === "STRIPE_MODE_MISMATCH" ? 409 : 500;
      return NextResponse.json(
        {
          success: false,
          error: {
            code: stripeConfig.errorCode ?? "STRIPE_CONFIG_MISSING",
            message: stripeConfig.errorMessage ?? "Stripe configuration is invalid.",
          },
        },
        { status },
      );
    }
    const body = (await req.json().catch(() => null)) as {
      selectedPrice?: number;
      isRegional?: boolean;
      details?: Record<string, unknown>;
      availability?: unknown;
      payment?: Record<string, unknown>;
    } | null;

    const appraisalPriceCents = Number(body?.selectedPrice ?? NaN);
    if (!Number.isInteger(appraisalPriceCents) || appraisalPriceCents <= 0) {
      return NextResponse.json({ success: false, message: "selectedPrice must be positive cents." }, { status: 400 });
    }
    if (typeof body?.isRegional !== "boolean") {
      return NextResponse.json({ success: false, message: "isRegional must be boolean." }, { status: 400 });
    }

    const details = asObject(body?.details);
    const tradeCategory = String(details.tradeCategory ?? "").trim();
    const title = String(details.title ?? "").trim();
    const description = String(details.description ?? "").trim();
    const address = String(details.address ?? "").trim();
    const countryCode = String(details.countryCode ?? "US").trim().toUpperCase() === "CA" ? "CA" : "US";
    const regionCodeRaw = String(details.stateCode ?? details.region ?? "").trim();
    const regionCode = normalizeProvince(countryCode, regionCodeRaw);
    const lat = Number(details.lat);
    const lon = Number(details.lon);
    if (!hasAvailabilitySelection(body?.availability)) {
      return NextResponse.json({ success: false, message: "At least one availability selection is required." }, { status: 400 });
    }
    if (!tradeCategory || !title || !description || !address || !regionCode || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json(
        { success: false, message: "Trade, title, description, address, region, and coordinates are required." },
        { status: 400 },
      );
    }

    const feeConfig = await getFeeConfig("card");
    const computed = await computeModelAPricing({
      appraisalSubtotalCents: appraisalPriceCents,
      isRegional: body.isRegional,
      country: countryCode,
      province: regionCode,
      percentBps: feeConfig.percentBps,
      fixedCents: feeConfig.fixedCents,
    });

    const subtotalCents = computed.baseSplitCents;
    const contractorPayoutCents = computed.contractorPayoutCents;
    const routerFeeCents = computed.routerFeeCents;
    const platformFeeCents = computed.platformFeeCents;
    const taxCents = computed.taxCents;
    const estimatedProcessingFeeCents = computed.estimatedProcessingFeeCents;
    const totalCents = computed.totalChargeCents;
    const paymentCurrency = computed.paymentCurrency;

    assertIntegerAmount("baseSplitCents", subtotalCents);
    assertIntegerAmount("contractorPayoutCents", contractorPayoutCents);
    assertIntegerAmount("routerFeeCents", routerFeeCents);
    assertIntegerAmount("platformFeeCents", platformFeeCents);
    assertIntegerAmount("taxCents", taxCents);
    assertIntegerAmount("estimatedProcessingFeeCents", estimatedProcessingFeeCents);
    assertIntegerAmount("totalCents", totalCents);

    if (contractorPayoutCents + routerFeeCents + platformFeeCents !== subtotalCents) {
      throw Object.assign(new Error("Split invariant failed"), { status: 400 });
    }
    if (subtotalCents + taxCents + estimatedProcessingFeeCents !== totalCents) {
      throw Object.assign(new Error("Total invariant failed"), { status: 400 });
    }

    const payment = asObject(body?.payment);
    const modelAJobId = String(payment.modelAJobId ?? payment.provisionalJobId ?? "").trim() || randomUUID();
    const paymentIntentIdempotencyKey = [
      "job-post-v4",
      user.userId,
      modelAJobId,
      paymentCurrency,
      String(totalCents),
    ].join(":");

    const result = await createPaymentIntent(totalCents, {
      currency: paymentCurrency,
      automaticPaymentMethodsEnabled: true,
      idempotencyKey: paymentIntentIdempotencyKey,
      metadata: {
        type: "job_escrow",
        scope: "job-post-v4",
        userId: user.userId,
        jobPosterId: user.userId,
        jobPosterUserId: user.userId,
        jobId: modelAJobId,
        modelAJobId,
        country: computed.country,
        province: computed.province ?? "",
        taxRateBps: String(computed.taxRateBps),
        splitBaseCents: String(subtotalCents),
        estimatedProcessingFeeCents: String(estimatedProcessingFeeCents),
      },
      description: "8Fold Job Poster Charge",
    });
    if (result.amountCents !== totalCents) {
      await cancelPaymentIntent(result.paymentIntentId).catch(() => undefined);
      throw Object.assign(new Error("Stripe amount invariant failed"), { status: 400 });
    }

    console.log("[POST_JOB_PI_CREATE]", {
      stripeMode: stripeConfig.stripeMode,
      amount: totalCents,
      currency: paymentCurrency,
      paymentIntentId: result.paymentIntentId,
      status: result.status,
      onBehalfOf: null,
      transferGroup: null,
      stripeAccountHeaderUsed: false,
    });

    await appendModelALedgerEntries({
      jobId: modelAJobId,
      paymentIntentId: result.paymentIntentId,
      baseSplitCents: subtotalCents,
      contractorPayoutCents,
      routerFeeCents,
      platformFeeCents,
      taxCents,
      estimatedProcessingFeeCents,
      totalCents,
      currency: computed.currency,
    });

    return NextResponse.json({
      success: true,
      stripeMode: stripeConfig.stripeMode,
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
      paymentStatus: result.status,
      modelAJobId,
      appraisalPriceCents,
      regionalFeeCents: computed.regionalFeeCents,
      baseSplitCents: subtotalCents,
      subtotalCents,
      taxRateBps: computed.taxRateBps,
      taxCents,
      estimatedProcessingFeeCents,
      totalCents,
      contractorPayoutCents,
      routerFeeCents,
      platformFeeCents,
      currency: computed.currency,
      traceId: randomUUID(),
    });
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "Failed to create payment intent.";
    const errCode = String((err as any)?.code ?? "");
    let status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    if (status >= 500) {
      const normalized = rawMessage.toLowerCase();
      if (
        normalized.includes("invariant") ||
        normalized.includes("invalid amount") ||
        normalized.includes("must be a non-negative integer") ||
        normalized.includes("payment fee config") ||
        normalized.includes("tax")
      ) {
        status = 400;
      }
      if (errCode === "42P01") {
        // Missing config/table is a predictable setup validation failure for this endpoint.
        status = 400;
      }
    }
    console.error("[POST_JOB_PI_CREATE_FAIL]", {
      status,
      message: rawMessage,
      code: errCode,
      envKeyPresent: !!process.env.STRIPE_SECRET_KEY,
      stack: err instanceof Error ? err.stack : undefined,
    });
    const message = status >= 500 ? "Unable to confirm total right now. Please try again." : rawMessage;
    const code =
      errCode === "STRIPE_MODE_MISMATCH"
        ? "STRIPE_MODE_MISMATCH"
        : rawMessage.toLowerCase().includes("eligible")
          ? "STRIPE_ACCOUNT_INELIGIBLE"
          : "STRIPE_CONFIRM_FAILED";
    return NextResponse.json({ success: false, error: { code, message } }, { status });
  }
}
