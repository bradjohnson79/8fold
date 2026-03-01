import { NextResponse } from "next/server";
import { requireContractorV4 } from "@/src/auth/requireContractorV4";
import { requireRoleCompletion } from "@/src/auth/requireRoleCompletion";
import { bookAppointment } from "@/src/services/v4/contractorJobService";
import { badRequest, internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  let requestId: string | undefined;
  try {
    const ctx = await requireContractorV4(req);
    if (ctx instanceof Response) return ctx;
    requestId = ctx.requestId;
    const completionGuard = await requireRoleCompletion(ctx.internalUser.id, "CONTRACTOR");
    if (completionGuard) return completionGuard;
    const { jobId } = await params;
    if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as { appointmentAt?: string };
    const appointmentAt = String(body?.appointmentAt ?? "").trim();
    if (!appointmentAt) throw badRequest("V4_INVALID_APPOINTMENT", "appointmentAt is required");

    const result = await bookAppointment(ctx.internalUser.id, jobId, appointmentAt);
    return NextResponse.json(result);
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_BOOK_APPOINTMENT_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
