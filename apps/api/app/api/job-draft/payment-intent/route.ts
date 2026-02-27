import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobDraft } from "@/db/schema/jobDraft";
import { requireJobPoster } from "@/src/auth/rbac";
import { createPaymentIntent, stripe } from "@/src/payments/stripe";
import { resolve as resolveTax } from "@/src/services/v4/taxResolver";

type DraftData = Record<string, any>;
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

    const regionalFeeCents = isRegional ? 2000 : 0;
    const baseSubtotalCents = appraisalPriceCents + regionalFeeCents;
    const tax = countryCode === "CA"
      ? await resolveTax({ amountCents: baseSubtotalCents, amountKind: "NET", country: "CA", province: regionCode, mode: "EXCLUSIVE" })
      : { taxCents: 0, grossCents: baseSubtotalCents, netCents: baseSubtotalCents, rate: 0, mode: "EXCLUSIVE" as const };
    const taxCents = Math.max(0, Number(tax.taxCents ?? 0));
    const totalCents = baseSubtotalCents + taxCents;

    const existingPiId = String(data?.payment?.paymentIntentId ?? "").trim();

    if (existingPiId && stripe) {
      try {
        const pi = await stripe.paymentIntents.retrieve(existingPiId);
        if (pi.amount !== totalCents && (pi.status === "requires_payment_method" || pi.status === "requires_confirmation")) {
          await stripe.paymentIntents.update(pi.id, {
            amount: totalCents,
            payment_method_options: {
              card: { request_extended_authorization: "if_available" },
            },
          });
        }
        if (
          pi.status === "requires_payment_method" ||
          pi.status === "requires_confirmation" ||
          pi.status === "requires_capture"
        ) {
          const refreshed = await stripe.paymentIntents.retrieve(pi.id);
          const nextData = {
            ...data,
            pricing: {
              ...(asObject(data.pricing)),
              appraisalPriceCents,
              selectedPriceCents: appraisalPriceCents,
              isRegional,
              regionalFeeCents,
              taxCents,
              subtotalCents: baseSubtotalCents,
              totalCents,
              countryCode,
              regionCode,
            },
            payment: { ...(asObject(data.payment)), paymentIntentId: refreshed.id },
          };
          await db
            .update(jobDraft)
            .set({ data: nextData, updatedAt: new Date(), step: "PAYMENT" })
            .where(and(eq(jobDraft.id, draft.id), eq(jobDraft.userId, user.userId)));
          return NextResponse.json({
            success: true,
            clientSecret: refreshed.client_secret,
            paymentIntentId: refreshed.id,
            appraisalPriceCents,
            regionalFeeCents,
            taxCents,
            totalCents,
            currency: countryCode === "CA" ? "CAD" : "USD",
          });
        }
      } catch (existingPiErr) {
        console.warn("[job-draft/payment-intent] existing intent lookup failed; creating a fresh intent", {
          existingPiId,
          message: existingPiErr instanceof Error ? existingPiErr.message : String(existingPiErr),
          code: (existingPiErr as any)?.code,
        });
      }
    }

    const result = await createPaymentIntent(totalCents, {
      currency: countryCode === "CA" ? "cad" : "usd",
      captureMethod: "manual",
      requestExtendedAuthorization: true,
      idempotencyKey: `job-draft-v4:${draft.id}:${totalCents}:${appraisalPriceCents}:${regionalFeeCents}`,
      metadata: {
        scope: "job-draft-v4",
        draftId: String(draft.id),
        userId: user.userId,
      },
      description: "8Fold Job Escrow Hold",
    });

    const nextData = {
      ...data,
      pricing: {
        ...(asObject(data.pricing)),
        appraisalPriceCents,
        selectedPriceCents: appraisalPriceCents,
        isRegional,
        regionalFeeCents,
        taxCents,
        subtotalCents: baseSubtotalCents,
        totalCents,
        countryCode,
        regionCode,
      },
      payment: { ...(asObject(data.payment)), paymentIntentId: result.paymentIntentId },
    };
    await db
      .update(jobDraft)
      .set({ data: nextData, updatedAt: new Date(), step: "PAYMENT" })
      .where(and(eq(jobDraft.id, draft.id), eq(jobDraft.userId, user.userId)));

    return NextResponse.json({
      success: true,
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
      appraisalPriceCents,
      regionalFeeCents,
      taxCents,
      totalCents,
      currency: countryCode === "CA" ? "CAD" : "USD",
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
    return NextResponse.json(
      { success: false, message },
      { status }
    );
  }
}
