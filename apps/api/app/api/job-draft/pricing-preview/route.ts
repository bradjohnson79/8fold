import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobDraft } from "@/db/schema/jobDraft";
import { requireJobPoster } from "@/src/auth/rbac";
import { computeEscrowPricing } from "@/src/services/escrow/pricing";

type DraftData = Record<string, any>;

function asObject(v: unknown): DraftData {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as DraftData) : {};
}

export async function POST(req: Request) {
  try {
    const user = await requireJobPoster(req);
    const body = (await req.json().catch(() => null)) as {
      appraisalSubtotalCents?: number;
      selectedPrice?: number;
      isRegional?: boolean;
      country?: string;
      province?: string;
    } | null;

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
    const pricing = asObject(data.pricing);

    const appraisalSubtotalCents = Number(
      body?.appraisalSubtotalCents ?? body?.selectedPrice ?? pricing.appraisalPriceCents ?? pricing.selectedPriceCents,
    );
    if (!Number.isInteger(appraisalSubtotalCents) || appraisalSubtotalCents <= 0) {
      return NextResponse.json(
        { success: false, message: "appraisalSubtotalCents must be a positive integer (cents)." },
        { status: 400 },
      );
    }

    const isRegional =
      typeof body?.isRegional === "boolean" ? body.isRegional : Boolean(pricing.isRegional ?? details.isRegional);
    const country = String(body?.country ?? details.countryCode ?? "US").trim().toUpperCase() === "CA" ? "CA" : "US";
    const province = String(body?.province ?? details.stateCode ?? details.region ?? "").trim().toUpperCase();

    const computed = await computeEscrowPricing({
      appraisalSubtotalCents,
      isRegional,
      country,
      province,
    });

    const nextData = {
      ...data,
      pricing: {
        ...pricing,
        appraisalPriceCents: computed.appraisalSubtotalCents,
        selectedPriceCents: computed.appraisalSubtotalCents,
        isRegional,
        regionalFeeCents: computed.regionalFeeCents,
        taxRateBps: computed.taxRateBps,
        taxCents: computed.taxAmountCents,
        subtotalCents: computed.splitBaseCents,
        totalCents: computed.totalAmountCents,
        countryCode: computed.country,
        province: computed.province,
        regionCode: computed.province,
      },
    };

    await db
      .update(jobDraft)
      .set({ data: nextData, updatedAt: new Date() })
      .where(and(eq(jobDraft.id, draft.id), eq(jobDraft.userId, user.userId)));

    return NextResponse.json({
      success: true,
      appraisalSubtotalCents: computed.appraisalSubtotalCents,
      regionalFeeCents: computed.regionalFeeCents,
      splitBaseCents: computed.splitBaseCents,
      taxRateBps: computed.taxRateBps,
      taxCents: computed.taxAmountCents,
      totalCents: computed.totalAmountCents,
      country: computed.country,
      province: computed.province,
      currency: computed.currency,
      paymentCurrency: computed.paymentCurrency,
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Failed to compute pricing preview." },
      { status },
    );
  }
}
