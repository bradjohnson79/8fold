import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireJobPosterReady } from "../../../../../../../src/auth/onboardingGuards";
import { db } from "../../../../../../../db/drizzle";
import { jobs } from "../../../../../../../db/schema/job";
import { jobPosterRouteErrorFromUnknown, jobPosterRouteErrorResponse } from "../../../../../../../src/http/jobPosterRouteErrors";
import { appraiseJobTotalWithAi } from "../../../../../../../src/pricing/jobPricingAppraisal";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("drafts");
  return idx >= 0 ? (parts[idx + 1] ?? "") : "";
}

function baselineTotalDollarsForTrade(tradeCategory: string): number {
  const t = String(tradeCategory || "").toUpperCase();
  if (t.includes("JUNK")) return 350;
  if (t.includes("PLUMB")) return 275;
  if (t.includes("DRYWALL")) return 450;
  if (t.includes("JANITOR") || t.includes("CLEAN")) return 200;
  if (t.includes("PAINT")) return 425;
  if (t.includes("ELECT")) return 300;
  if (t.includes("LAND")) return 375;
  if (t.includes("ROOF")) return 650;
  if (t.includes("MOV")) return 500;
  if (t.includes("FURNITURE")) return 250;
  return 300;
}

export async function POST(req: Request) {
  const route = "POST /api/web/job-poster/drafts/:id/start-appraisal";
  let userId: string | null = null;
  let jobId: string | null = null;
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;
    userId = user.userId;
    const id = getIdFromUrl(req);
    jobId = id || null;
    if (!id) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "VALIDATION_ERROR",
        status: 400,
        err: new Error("Missing job id"),
        userId,
        jobId,
      });
    }

    const rows = await db
      .select({ id: jobs.id, status: jobs.status, jobPosterUserId: jobs.jobPosterUserId })
      .from(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.archived, false)))
      .limit(1);
    const job = rows[0] ?? null;
    if (!job || job.jobPosterUserId !== user.userId) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "INTERNAL_ERROR",
        status: 404,
        err: new Error("Job not found or not owned by user"),
        userId,
        jobId,
      });
    }
    if (String(job.status) !== "DRAFT") {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "VALIDATION_ERROR",
        status: 409,
        err: new Error("Job is not in DRAFT status"),
        userId,
        jobId,
      });
    }

    const fullRows = await db
      .select({
        id: jobs.id,
        status: jobs.status,
        archived: jobs.archived,
        jobPosterUserId: jobs.jobPosterUserId,
        title: jobs.title,
        scope: jobs.scope,
        tradeCategory: jobs.tradeCategory,
        jobType: jobs.jobType,
        country: jobs.country,
        city: jobs.city,
        regionCode: jobs.regionCode,
        junkHaulingItems: jobs.junkHaulingItems,
      })
      .from(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.archived, false)))
      .limit(1);
    const full = fullRows[0] ?? null;
    if (!full || full.jobPosterUserId !== user.userId) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "INTERNAL_ERROR",
        status: 404,
        err: new Error("Job not found or not owned by user"),
        userId,
        jobId,
      });
    }

    const stateProvince = String(full.regionCode ?? "").trim().toUpperCase();
    if (!stateProvince) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "VALIDATION_ERROR",
        status: 400,
        err: new Error("Missing state/province on draft"),
        userId,
        jobId,
      });
    }

    const baseline = baselineTotalDollarsForTrade(String(full.tradeCategory ?? ""));
    const currency = full.country === "CA" ? "CAD" : "USD";
    const items = Array.isArray(full.junkHaulingItems) ? (full.junkHaulingItems as any[]) : [];

    let suggestedTotal = baseline;
    let low = Math.max(50, Math.round(baseline * 0.8));
    let high = Math.max(low + 25, Math.round(baseline * 1.25));
    let confidence: "low" | "medium" | "high" = "low";
    let reasoning = "Baseline appraisal (AI unavailable).";

    try {
      const ai = await appraiseJobTotalWithAi({
        title: String(full.title ?? "").trim(),
        tradeCategory: String(full.tradeCategory ?? "").trim(),
        city: String(full.city ?? "").trim() || "Unknown",
        stateProvince,
        country: full.country === "CA" ? "CA" : "US",
        currency,
        jobType: full.jobType === "regional" ? "regional" : "urban",
        estimatedDurationHours: null,
        description: String(full.scope ?? "").trim(),
        items: items
          .map((it) => ({
            category: String(it?.category ?? "").trim(),
            description: String(it?.description ?? it?.item ?? "").trim(),
            quantity: Number(it?.quantity),
            ...(String(it?.notes ?? "").trim() ? { notes: String(it?.notes ?? "").trim() } : {}),
          }))
          .filter((it) => it.category && it.description && Number.isFinite(it.quantity) && it.quantity >= 1),
        propertyType: "unknown",
        currentTotalDollars: baseline,
      });

      const out = ai?.output ?? null;
      if (out) {
        suggestedTotal = Math.max(0, Math.round(out.suggestedTotal));
        low = Math.max(0, Math.round(out.priceRange.low));
        high = Math.max(low + 1, Math.round(out.priceRange.high));
        confidence = (out.confidence as any) === "high" ? "high" : (out.confidence as any) === "medium" ? "medium" : "low";
        reasoning = String(out.reasoning ?? "").trim() || reasoning;
      }
    } catch (e) {
      // Fall back to baseline (do not block posting flow).
      reasoning = "Baseline appraisal (AI unavailable).";
    }

    const now = new Date();
    await db
      .update(jobs)
      .set({
        aiAppraisalStatus: "COMPLETED",
        aiAppraisedAt: now,
        aiSuggestedTotal: suggestedTotal,
        aiPriceRangeLow: low,
        aiPriceRangeHigh: high,
        aiConfidence: confidence,
        aiReasoning: reasoning,
        priceMedianCents: suggestedTotal * 100,
      } as any)
      .where(and(eq(jobs.id, id), eq(jobs.archived, false), eq(jobs.jobPosterUserId, user.userId)));

    return NextResponse.json(
      {
        ok: true,
        job: {
          id: full.id,
          aiSuggestedTotal: suggestedTotal,
          aiPriceRange: { low, high },
          aiConfidence: confidence,
          aiReasoning: reasoning,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    return jobPosterRouteErrorFromUnknown({ route, err, userId, jobId });
  }
}

