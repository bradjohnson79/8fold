import { NextResponse } from "next/server";
import { requireJobPosterReady } from "../../../../../../../src/auth/onboardingGuards";
import { jobPosterRouteErrorFromUnknown, jobPosterRouteErrorResponse } from "../../../../../../../src/http/jobPosterRouteErrors";
import { getDraftById } from "../../../../../../../src/server/repos/jobDraftRepo.drizzle";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idIndex = parts.indexOf("jobs") + 1;
  return parts[idIndex] ?? "";
}

export async function GET(req: Request) {
  const route = "GET /api/web/job-poster/jobs/:id/appraise-price";
  let userId: string | null = null;
  let jobId: string | null = null;
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;
    userId = user.userId;
    const id = getIdFromUrl(req);
    jobId = id || null;

    const draft = await getDraftById(id);

    if (!draft) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "INTERNAL_ERROR",
        status: 404,
        err: new Error("Draft not found"),
        userId,
        jobId,
      });
    }

    if (draft.createdByJobPosterUserId !== user.userId) {
      return jobPosterRouteErrorResponse({
        route,
        errorType: "AUTH_ERROR",
        status: 401,
        err: new Error("Forbidden"),
        userId,
        jobId,
      });
    }

    // If still appraising, return status
    if (String(draft.status) === "APPRAISING") {
      return NextResponse.json({
        status: "appraising",
        priceMedianCents: null,
        allowedDeltaCents: null,
      });
    }

    // If priced, return pricing
    if (String(draft.status) === "PRICED") {
      return NextResponse.json({
        status: "priced",
        priceMedianCents: draft.laborTotalCents,
        allowedDeltaCents: 0,
        reasoning: null
      });
    }

    // Other statuses
    return NextResponse.json({
      status: draft.status.toLowerCase(),
      priceMedianCents: null,
      allowedDeltaCents: null,
    });
  } catch (err) {
    return jobPosterRouteErrorFromUnknown({ route, err, userId, jobId });
  }
}
