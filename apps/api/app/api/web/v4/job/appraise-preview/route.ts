import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { requireRole } from "@/src/auth/requireRole";
import { V4JobAppraiseBodySchema } from "@/src/services/v4/jobAppraisalService";
import { badRequest, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export const runtime = "nodejs";

function roundToNearestFive(n: number): number {
  return Math.round(n / 5) * 5;
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
    let median = 200;
    if (input.tradeCategory === "PLUMBING") median += 50;
    if (input.tradeCategory === "ELECTRICAL") median += 40;
    if (input.isRegionalRequested) median += 20;

    const low = Math.max(50, roundToNearestFive(median * 0.85));
    const finalMedian = roundToNearestFive(median);
    const high = Math.max(finalMedian + 5, roundToNearestFive(median * 1.15));
    const rationale = [
      `Province ${input.provinceState} baseline applied for ${input.tradeCategory}.`,
      input.isRegionalRequested
        ? "Regional preference increases travel overhead."
        : "Urban preference keeps travel overhead lower.",
    ]
      .join(" ")
      .slice(0, 100);

    return NextResponse.json({
      low,
      median: finalMedian,
      high,
      confidence: "MEDIUM",
      rationale,
      appraisalToken: randomUUID(),
      modelUsed: "gpt-5-nano",
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
      rationale: "Fallback appraisal applied.",
      appraisalToken: randomUUID(),
      modelUsed: "fallback",
      usedFallback: true,
    });
  }
}
