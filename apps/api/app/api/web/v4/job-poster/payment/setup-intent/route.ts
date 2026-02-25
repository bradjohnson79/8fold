import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { createJobPosterSetupIntent } from "@/src/services/v4/jobPosterPaymentService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function POST(req: Request) {
  let requestId: string | undefined;
  try {
    const role = await requireV4Role(req, "JOB_POSTER");
    if (role instanceof Response) return role;
    requestId = role.requestId;
    const payload = await createJobPosterSetupIntent(role.userId);
    return NextResponse.json(payload);
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_SETUP_INTENT_CREATE_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
