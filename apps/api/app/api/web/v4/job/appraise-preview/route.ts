import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { requireRole } from "@/src/auth/requireRole";
import { computeV4JobAppraisal, V4JobAppraiseBodySchema } from "@/src/services/v4/jobAppraisalService";
import { getV4Readiness } from "@/src/services/v4/readinessService";
import { rateLimitOrThrow } from "@/src/services/v4/rateLimitService";
import { badRequest, forbidden, internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function POST(req: Request) {
  let requestId: string | undefined;
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;
    requestId = authed.requestId;

    const roleCheck = await requireRole(req, "JOB_POSTER");
    if (roleCheck instanceof Response) return roleCheck;

    const readiness = await getV4Readiness(roleCheck.internalUser.id);
    if (!readiness.jobPosterReady) {
      throw forbidden("V4_SETUP_REQUIRED", "Complete job poster setup before accessing the dashboard");
    }

    await rateLimitOrThrow({
      key: `v4:appraise:${roleCheck.internalUser.id}`,
      windowSeconds: 600,
      max: 20,
    });

    const raw = await req.json().catch(() => ({}));
    const parsed = V4JobAppraiseBodySchema.safeParse(raw);
    if (!parsed.success) {
      throw badRequest(
        "V4_INVALID_REQUEST_BODY",
        "Invalid request body",
        { issues: parsed.error.errors.map((e) => ({ path: e.path.join("."), message: e.message })) },
      );
    }

    return NextResponse.json(computeV4JobAppraisal(parsed.data, roleCheck.internalUser.id));
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_APPRAISAL_FAILED");
    const retryAfter = Number((wrapped as any)?.details?.retryAfterSeconds ?? 0);
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), {
      status: wrapped.status,
      headers: retryAfter > 0 ? { "Retry-After": String(retryAfter) } : undefined,
    });
  }
}
