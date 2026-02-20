import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import crypto from "node:crypto";
import { requireJobPosterReady } from "../../../../../../../src/auth/onboardingGuards";
import { db } from "../../../../../../../db/drizzle";
import { jobs } from "../../../../../../../db/schema/job";
import { jobPosterRouteErrorFromUnknown, jobPosterRouteErrorResponse } from "../../../../../../../src/http/jobPosterRouteErrors";
import {
  appraiseJobTotalWithAi,
  JobPricingAppraisalError,
  type JobPricingAppraisalInput,
} from "../../../../../../../src/pricing/jobPricingAppraisal";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("drafts");
  return idx >= 0 ? (parts[idx + 1] ?? "") : "";
}

export async function POST(req: Request) {
  const route = "POST /api/web/job-poster/drafts/:id/start-appraisal";
  let userId: string | null = null;
  let jobId: string | null = null;
  try {
    // eslint-disable-next-line no-console
    console.log("🔥 AI ROUTE HIT");
    // eslint-disable-next-line no-console
    console.log("🧠 AI Model: gpt-5-nano");
    // eslint-disable-next-line no-console
    console.log("🔑 OPEN_AI_API_KEY present:", !!process.env.OPEN_AI_API_KEY);

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

    if (!process.env.OPEN_AI_API_KEY) {
      const traceId = crypto.randomUUID();
      // eslint-disable-next-line no-console
      console.error("❌ AI APPRAISAL CONFIG MISSING", { traceId, route, jobId: full.id, userId });
      return NextResponse.json(
        {
          error: "AI appraisal unavailable.",
          code: "AI_CONFIG_MISSING",
          requiresSupportTicket: true,
          traceId,
        },
        { status: 500 },
      );
    }

    const currency = full.country === "CA" ? "CAD" : "USD";
    const items = Array.isArray(full.junkHaulingItems) ? (full.junkHaulingItems as any[]) : [];

    const aiInput: JobPricingAppraisalInput = {
      title: String(full.title ?? "").trim(),
      tradeCategory: String(full.tradeCategory ?? "").trim(),
      city: String(full.city ?? "").trim() || "Unknown",
      stateProvince,
      country: full.country === "CA" ? "CA" : "US",
      currency: full.country === "CA" ? "CAD" : "USD",
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
      propertyType: "unknown" as const,
      currentTotalDollars: 0,
    };

    const appraisalTraceId = crypto.randomUUID();
    const appraisalModel = "gpt-5-nano" as const;

    let aiResponse: Awaited<ReturnType<typeof appraiseJobTotalWithAi>> | null = null;
    try {
      aiResponse = await appraiseJobTotalWithAi(aiInput);
    } catch (err) {
      if (err instanceof JobPricingAppraisalError) {
        // eslint-disable-next-line no-console
        console.error(`❌ ${err.code}`, {
          traceId: err.traceId,
          route,
          jobId: full.id,
          userId,
          error: err.message,
          raw: err.raw,
        });
        return NextResponse.json(
          {
            error: "AI appraisal unavailable.",
            code: err.code,
            requiresSupportTicket: true,
            traceId: err.traceId,
          },
          { status: err.status },
        );
      }

      const traceId = crypto.randomUUID();
      // eslint-disable-next-line no-console
      console.error("❌ AI_RUNTIME_ERROR", {
        traceId,
        route,
        jobId: full.id,
        userId,
        error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
      });
      return NextResponse.json(
        {
          error: "AI appraisal unavailable.",
          code: "AI_RUNTIME_ERROR",
          requiresSupportTicket: true,
          traceId,
        },
        { status: 500 },
      );
    }

    const out = aiResponse?.output ?? null;
    const suggestedTotal = Number(out?.suggestedTotal);
    const low = Number(out?.priceRange?.low);
    const high = Number(out?.priceRange?.high);
    const confidenceScore = Number(out?.confidence);
    const reasoning = String(out?.reasoning ?? "").trim();

    const invalid =
      !out ||
      !Number.isFinite(suggestedTotal) ||
      !Number.isFinite(low) ||
      !Number.isFinite(high) ||
      !Number.isFinite(confidenceScore) ||
      confidenceScore < 0 ||
      confidenceScore > 1;

    if (invalid) {
      const traceId = crypto.randomUUID();
      // eslint-disable-next-line no-console
      console.error("❌ AI INVALID RESPONSE", {
        traceId,
        route,
        jobId: full.id,
        userId,
        rawResponse: aiResponse?.raw ?? null,
      });
      return NextResponse.json(
        {
          error: "AI appraisal unavailable.",
          code: "AI_INVALID_RESPONSE",
          requiresSupportTicket: true,
          traceId,
        },
        { status: 500 },
      );
    }

    const confidence = confidenceScore >= 0.75 ? "high" : confidenceScore >= 0.4 ? "medium" : "low";
    const validated = true;
    if (!aiResponse || !validated) {
      throw new Error("Refusing to persist pricing without validated AI result");
    }

    const now = new Date();
    await db
      .update(jobs)
      .set({
        aiAppraisalStatus: "COMPLETED",
        aiAppraisedAt: now,
        aiSuggestedTotal: Math.round(suggestedTotal),
        aiPriceRangeLow: Math.round(low),
        aiPriceRangeHigh: Math.round(high),
        aiConfidence: confidence as any,
        aiReasoning: reasoning,
        priceMedianCents: Math.round(suggestedTotal) * 100,
        pricingIntel: {
          appraisalTraceId,
          appraisalModel,
          appraisedAt: now.toISOString(),
        } as any,
        pricingIntelGeneratedAt: now,
        pricingIntelModel: appraisalModel,
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
          appraisalTraceId,
          appraisalModel,
          appraisedAt: now.toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (err) {
    return jobPosterRouteErrorFromUnknown({ route, err, userId, jobId });
  }
}

