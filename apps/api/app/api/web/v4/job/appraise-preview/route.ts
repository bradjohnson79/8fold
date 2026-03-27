import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { requireRole } from "@/src/auth/requireRole";
import { V4JobAppraiseBodySchema } from "@/src/services/v4/jobAppraisalService";
import { badRequest, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";
import { appraiseJobPrice } from "@/src/pricing/aiAppraisal";
import { computeAppraisalConfidence, deriveDynamicPriceRange } from "@/src/pricing/appraisalConfidence";

export const runtime = "nodejs";

function roundToNearestFive(n: number): number {
  return Math.round(n / 5) * 5;
}

function staticFallbackAppraisal(input: { tradeCategory: string; provinceState: string; isRegionalRequested: boolean }) {
  let median = 200;
  if (input.tradeCategory === "PLUMBING") median += 50;
  if (input.tradeCategory === "ELECTRICAL") median += 40;
  if (input.isRegionalRequested) median += 20;

  const finalMedian = roundToNearestFive(median);
  const rationale = [
    `Province ${input.provinceState} baseline applied for ${input.tradeCategory}.`,
    input.isRegionalRequested
      ? "Regional preference increases travel overhead."
      : "Urban preference keeps travel overhead lower.",
  ]
    .join(" ")
    .slice(0, 100);

  return { median: finalMedian, rationale };
}

export async function POST(req: Request) {
  let requestId: string | undefined;
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;
    requestId = authed.requestId;

    const roleCheck = await requireRole(req, "JOB_POSTER");
    if (roleCheck instanceof Response) return roleCheck;

    const raw = await req.json().catch(() => ({}));
    const parsed = V4JobAppraiseBodySchema.safeParse(raw);
    if (!parsed.success) {
      throw badRequest(
        "V4_INVALID_REQUEST_BODY",
        "Invalid request body",
        { issues: parsed.error.errors.map((e) => ({ path: e.path.join("."), message: e.message })) },
      );
    }

    const input = parsed.data;

    if (process.env.OPEN_AI_API_KEY) {
      try {
        const aiResult = await appraiseJobPrice({
          tradeCategory: input.tradeCategory as any,
          jobType: input.isRegionalRequested ? "regional" : "urban",
          city: input.provinceState,
          province: input.provinceState,
          scope: input.description,
          title: input.title,
        });
        const medianDollars = roundToNearestFive(Math.round(aiResult.priceMedianCents / 100));
        const range = deriveDynamicPriceRange({
          title: input.title,
          description: input.description,
          tradeCategory: input.tradeCategory,
          median: medianDollars,
          isRegionalRequested: input.isRegionalRequested,
        });
        const confidence = computeAppraisalConfidence({
          title: input.title,
          description: input.description,
          tradeCategory: input.tradeCategory,
          median: medianDollars,
          low: range.low,
          high: range.high,
        });
        return NextResponse.json({
          low: range.low,
          median: medianDollars,
          high: range.high,
          confidence: confidence.confidenceLabel,
          confidenceScore: confidence.confidenceScore,
          rationale: aiResult.reasoning.slice(0, 100),
          confidenceExplanation:
            "Confidence is based on job clarity, category familiarity, and pricing consistency.",
          appraisalToken: randomUUID(),
          modelUsed: "gpt-5-nano",
          usedFallback: false,
        });
      } catch (aiErr) {
        console.warn("[AI_APPRAISAL_FALLBACK]", aiErr instanceof Error ? aiErr.message : String(aiErr));
      }
    }

    const fallback = staticFallbackAppraisal(input);
    const range = deriveDynamicPriceRange({
      title: input.title,
      description: input.description,
      tradeCategory: input.tradeCategory,
      median: fallback.median,
      isRegionalRequested: input.isRegionalRequested,
    });
    const confidence = computeAppraisalConfidence({
      title: input.title,
      description: input.description,
      tradeCategory: input.tradeCategory,
      median: fallback.median,
      low: range.low,
      high: range.high,
    });
    return NextResponse.json({
      low: range.low,
      median: fallback.median,
      high: range.high,
      rationale: fallback.rationale,
      confidence: confidence.confidenceLabel,
      confidenceScore: confidence.confidenceScore,
      confidenceExplanation:
        "Confidence is based on job clarity, category familiarity, and pricing consistency.",
      appraisalToken: randomUUID(),
      modelUsed: "static",
      usedFallback: true,
    });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : null;
    if (wrapped && (wrapped.status === 400 || wrapped.status === 401 || wrapped.status === 403 || wrapped.status === 429)) {
      return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
    }

    console.error("[web/v4/job/appraise-preview] unexpected failure; returning fallback appraisal", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({
      low: 100,
      median: 200,
      high: 300,
      confidence: "LOW",
      confidenceScore: 0.2,
      rationale: "Fallback appraisal applied.",
      confidenceExplanation:
        "Confidence is based on job clarity, category familiarity, and pricing consistency.",
      appraisalToken: randomUUID(),
      modelUsed: "fallback",
      usedFallback: true,
    });
  }
}
