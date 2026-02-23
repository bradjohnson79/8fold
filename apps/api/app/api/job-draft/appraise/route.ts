import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobDraft } from "@/db/schema/jobDraft";
import { requireJobPoster } from "@/src/auth/rbac";
import { appraiseJobTotalWithAi } from "@/src/pricing/jobPricingAppraisal";

function roundToNearestFive(n: number): number {
  return Math.round(n / 5) * 5;
}

export async function POST(req: Request) {
  try {
    const user = await requireJobPoster(req);
    const rows = await db
      .select()
      .from(jobDraft)
      .where(and(eq(jobDraft.user_id, user.userId), eq(jobDraft.status, "ACTIVE")))
      .limit(1);
    const draft = rows[0] ?? null;
    if (!draft) {
      return NextResponse.json({ success: false, message: "Draft not found." }, { status: 404 });
    }

    const data =
      draft.data && typeof draft.data === "object" && !Array.isArray(draft.data)
        ? (draft.data as Record<string, any>)
        : {};
    const details =
      data.details && typeof data.details === "object" && !Array.isArray(data.details)
        ? (data.details as Record<string, any>)
        : null;
    if (!details) {
      return NextResponse.json({ success: false, message: "Missing details." }, { status: 400 });
    }

    const category = String(details.category ?? details.tradeCategory ?? "").trim();
    const description = String(details.description ?? details.scope ?? "").trim();
    const region = String(details.region ?? details.stateCode ?? "").trim();
    const isRegional = Boolean(details.isRegional);
    if (!category || !description || !region || typeof details.isRegional !== "boolean") {
      return NextResponse.json(
        {
          success: false,
          message: "details.category, details.description, details.region, details.isRegional are required.",
        },
        { status: 400 }
      );
    }

    const countryCode = String(details.countryCode ?? "US").toUpperCase() === "CA" ? "CA" : "US";
    const currentTotalDollars = Math.max(0, Number(data?.pricing?.selectedPriceCents ?? 0) / 100);
    const appraisal = await appraiseJobTotalWithAi({
      title: String(details.title ?? "Job").slice(0, 140),
      tradeCategory: category,
      city: String(details.city ?? ""),
      stateProvince: region,
      country: countryCode,
      currency: countryCode === "CA" ? "CAD" : "USD",
      jobType: isRegional ? "regional" : "urban",
      estimatedDurationHours: null,
      description,
      propertyType: "unknown",
      currentTotalDollars,
    });

    let min = roundToNearestFive(Number(appraisal.output.priceRange.low ?? 0));
    let median = roundToNearestFive(Number(appraisal.output.suggestedTotal ?? min + 5));
    let max = roundToNearestFive(Number(appraisal.output.priceRange.high ?? median + 5));
    if (min >= median) median = min + 5;
    if (median >= max) max = median + 5;

    const appraisalInputHash = [category, description, region, countryCode, String(isRegional)].join("|");
    const nextData = {
      ...data,
      appraisal: {
        min,
        median,
        max,
        step: 5,
        blurb: String(appraisal.output.reasoning ?? "").slice(0, 100),
        model: appraisal.model,
      },
      appraisalInputHash,
    };

    await db
      .update(jobDraft)
      .set({ data: nextData, updated_at: new Date() })
      .where(and(eq(jobDraft.id, draft.id), eq(jobDraft.user_id, user.userId)));

    return NextResponse.json({ success: true, appraisal: nextData.appraisal });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Appraisal failed." },
      { status }
    );
  }
}
