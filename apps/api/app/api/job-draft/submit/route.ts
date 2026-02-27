import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobDraft } from "@/db/schema/jobDraft";
import { jobs } from "@/db/schema/job";
import { jobPhotos } from "@/db/schema/jobPhoto";
import { v4JobUploads } from "@/db/schema/v4JobUpload";
import { requireJobPoster } from "@/src/auth/rbac";
import { addBusinessDaysUTC } from "@/src/finance/businessDays";
import { stripe } from "@/src/payments/stripe";
import { TRADE_CATEGORIES_CANONICAL } from "@/src/validation/v4/constants";
import { resolve as resolveTax } from "@/src/services/v4/taxResolver";

type DraftData = Record<string, any>;

type UploadInput = { uploadId: string; url: string };

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

function parseImages(value: unknown): UploadInput[] {
  if (!Array.isArray(value)) return [];
  const out: UploadInput[] = [];
  for (const item of value) {
    const obj = asObject(item);
    const uploadId = String(obj.uploadId ?? "").trim();
    const url = String(obj.url ?? "").trim();
    if (!uploadId) continue;
    out.push({ uploadId, url });
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const user = await requireJobPoster(req);
    const draftRows = await db
      .select()
      .from(jobDraft)
      .where(and(eq(jobDraft.userId, user.userId), eq(jobDraft.status, "ACTIVE")))
      .limit(1);
    const draft = draftRows[0] ?? null;
    if (!draft) return NextResponse.json({ success: false, message: "Draft not found." }, { status: 404 });

    const data = asObject(draft.data);
    const details = asObject(data.details);
    const payment = asObject(data.payment);
    const pricing = asObject(data.pricing);

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
    const scope = String(details.description ?? "").trim();
    const tradeCategory = String(details.tradeCategory ?? "").trim().toUpperCase();
    const countryCode = String(details.countryCode ?? "US").trim().toUpperCase() === "CA" ? "CA" : "US";
    const stateCode = String(details.stateCode ?? details.region ?? "").trim().toUpperCase();
    const region = stateCode.toLowerCase();
    const city = String(details.city ?? "").trim();
    const postalCode = String(details.postalCode ?? "").trim();
    const address = String(details.address ?? "").trim();
    const lat = Number(details.lat);
    const lon = Number(details.lon);
    const isRegional = Boolean(pricing.isRegional ?? details.isRegional);

    const appraisalPriceCents = Number(pricing.appraisalPriceCents ?? pricing.selectedPriceCents ?? 0);
    const regionalFeeCents = isRegional ? 2000 : 0;
    const baseSubtotalCents = appraisalPriceCents + regionalFeeCents;
    const tax = countryCode === "CA"
      ? await resolveTax({ amountCents: baseSubtotalCents, amountKind: "NET", country: "CA", province: stateCode, mode: "EXCLUSIVE" })
      : { taxCents: 0, grossCents: baseSubtotalCents, netCents: baseSubtotalCents, rate: 0, mode: "EXCLUSIVE" as const };
    const taxCents = Math.max(0, Number(tax.taxCents ?? 0));
    const totalCents = baseSubtotalCents + taxCents;

    if (!tradeCategory || !TRADE_CATEGORIES_CANONICAL.includes(tradeCategory as any)) {
      return NextResponse.json({ success: false, message: "Trade category is required." }, { status: 400 });
    }
    if (!title || !scope) {
      return NextResponse.json({ success: false, message: "Title and description are required." }, { status: 400 });
    }
    if (!address || !city || !postalCode || !stateCode || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json(
        { success: false, message: "Address, city, postal code, region, country, and coordinates are required." },
        { status: 400 },
      );
    }
    if (!hasAvailabilitySelection(data.availability)) {
      return NextResponse.json({ success: false, message: "At least one availability selection is required." }, { status: 400 });
    }
    if (!Number.isInteger(appraisalPriceCents) || appraisalPriceCents <= 0 || !Number.isInteger(totalCents) || totalCents <= 0) {
      return NextResponse.json({ success: false, message: "Invalid appraisal or total price." }, { status: 400 });
    }
    if (pi.amount !== totalCents) {
      return NextResponse.json({ success: false, message: "Stripe amount does not match the computed total." }, { status: 409 });
    }
    if (String(pi.currency ?? "").toLowerCase() !== (countryCode === "CA" ? "cad" : "usd")) {
      return NextResponse.json({ success: false, message: "Stripe currency does not match country pricing." }, { status: 409 });
    }

    const images = parseImages(data.images);
    const uploadIds = images.map((i) => i.uploadId);

    const now = new Date();
    const authorizationExpiresAt = addBusinessDaysUTC(now, countryCode as "US" | "CA", 5);
    const jobId = randomUUID();

    await db.transaction(async (tx) => {
      await tx.insert(jobs).values({
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
        city,
        postal_code: postalCode,
        address_full: address,
        lat,
        lng: lon,
        currency: (countryCode === "CA" ? "CAD" : "USD") as any,
        payment_currency: countryCode === "CA" ? "cad" : "usd",
        amount_cents: totalCents,
        labor_total_cents: appraisalPriceCents,
        materials_total_cents: 0,
        transaction_fee_cents: taxCents,
        price_adjustment_cents: regionalFeeCents,
        stripe_payment_intent_id: paymentIntentId,
        payment_status: "AUTHORIZED" as any,
        escrow_locked_at: now,
        authorization_expires_at: authorizationExpiresAt,
        job_poster_user_id: user.userId,
        job_type: (isRegional ? "regional" : "urban") as any,
        trade_category: tradeCategory as any,
        service_type: "handyman",
        availability: data.availability,
        posted_at: now,
        published_at: now,
        created_at: now,
        updated_at: now,
        price_median_cents: appraisalPriceCents,
      });

      if (uploadIds.length > 0) {
        const uploadRows = await tx
          .select({ id: v4JobUploads.id, url: v4JobUploads.url })
          .from(v4JobUploads)
          .where(and(inArray(v4JobUploads.id, uploadIds), eq(v4JobUploads.userId, user.userId), isNull(v4JobUploads.usedAt)));

        if (uploadRows.length !== uploadIds.length) {
          throw Object.assign(new Error("Unknown or unowned uploadIds."), { status: 400 });
        }

        for (const upload of uploadRows) {
          await tx.insert(jobPhotos).values({
            id: randomUUID(),
            jobId,
            kind: "CUSTOMER_SCOPE",
            actor: "CUSTOMER",
            url: upload.url,
          });
        }

        await tx
          .update(v4JobUploads)
          .set({ usedAt: now })
          .where(and(inArray(v4JobUploads.id, uploadIds), eq(v4JobUploads.userId, user.userId)));
      }

      await tx
        .update(jobDraft)
        .set({ status: "ARCHIVED", step: "CONFIRMED", updatedAt: now })
        .where(and(eq(jobDraft.id, draft.id), eq(jobDraft.userId, user.userId)));
    });

    return NextResponse.json({ success: true, jobId });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Failed to submit draft." },
      { status }
    );
  }
}
