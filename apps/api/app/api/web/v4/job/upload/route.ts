import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { requireRole } from "@/src/auth/requireRole";
import { getV4Readiness } from "@/src/services/v4/readinessService";
import { uploadV4JobPhoto } from "@/src/services/v4/jobUploadService";
import { rateLimitOrThrow } from "@/src/services/v4/rateLimitService";
import { badRequest, forbidden, internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function POST(req: Request) {
  let requestId: string | undefined;
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;
    requestId = authed.requestId;
    const role = await requireRole(req, "JOB_POSTER");
    if (role instanceof Response) return role;

    const readiness = await getV4Readiness(role.internalUser.id);
    if (!readiness.jobPosterReady) {
      throw forbidden("V4_SETUP_REQUIRED", "Complete job poster setup before accessing the dashboard");
    }

    await rateLimitOrThrow({
      key: `v4:upload:${role.internalUser.id}`,
      windowSeconds: 600,
      max: 30,
    });

    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      throw badRequest("V4_UPLOAD_FILE_REQUIRED", "Missing file");
    }

    return NextResponse.json(await uploadV4JobPhoto(role.internalUser.id, file), { status: 200 });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_UPLOAD_FAILED");
    const retryAfter = Number((wrapped as any)?.details?.retryAfterSeconds ?? 0);
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), {
      status: wrapped.status,
      headers: retryAfter > 0 ? { "Retry-After": String(retryAfter) } : undefined,
    });
  }
}
