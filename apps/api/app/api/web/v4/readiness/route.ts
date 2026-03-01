import { NextResponse } from "next/server";
import { requireAuth } from "@/src/auth/requireAuth";
import { getV4Readiness } from "@/src/services/v4/readinessService";
import { forbidden, internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function GET(req: Request) {
  const path = new URL(req.url).pathname;
  console.info("[RUNTIME_PROBE]", {
    path,
    method: req.method,
    timestamp: Date.now(),
  });
  let requestId: string | undefined;
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;
    requestId = authed.requestId;
    if (!authed.internalUser) throw forbidden("V4_USER_NOT_FOUND", "Authenticated user not found");
    return NextResponse.json(await getV4Readiness(authed.internalUser.id), { status: 200 });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_READINESS_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
