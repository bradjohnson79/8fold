import { NextResponse } from "next/server";
import { createV4Job, V4JobCreateBodySchema } from "@/src/services/v4/jobCreateService";
import { getV4Readiness } from "@/src/services/v4/readinessService";
import { getJobPosterPaymentStatus } from "@/src/services/v4/jobPosterPaymentService";
import { rateLimitOrThrow } from "@/src/services/v4/rateLimitService";
import { badRequest, forbidden, internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";
import { requireAuth } from "@/src/auth/requireAuth";
import { requireRole } from "@/src/auth/requireRole";

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

    const paymentStatus = await getJobPosterPaymentStatus(roleCheck.internalUser.id);
    if (!paymentStatus.connected) {
      throw forbidden(
        "V4_PAYMENT_REQUIRED",
        "Payment method required to activate job. Add a payment method in Payment Setup.",
      );
    }

    await rateLimitOrThrow({
      key: `v4:jobcreate:${roleCheck.internalUser.id}`,
      windowSeconds: 600,
      max: 6,
    });

    const idempotencyKey = String(req.headers.get("idempotency-key") ?? "").trim();
    if (!idempotencyKey) {
      throw badRequest("V4_IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required");
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = V4JobCreateBodySchema.safeParse(raw);
    if (!parsed.success) {
      throw badRequest(
        "V4_INVALID_REQUEST_BODY",
        "Invalid request body",
        { issues: parsed.error.errors.map((e) => ({ path: e.path.join("."), message: e.message })) },
      );
    }

    return NextResponse.json(await createV4Job(parsed.data, roleCheck.internalUser.id, idempotencyKey));
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_JOB_CREATE_FAILED");
    const retryAfter = Number((wrapped as any)?.details?.retryAfterSeconds ?? 0);
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), {
      status: wrapped.status,
      headers: retryAfter > 0 ? { "Retry-After": String(retryAfter) } : undefined,
    });
  }
}
