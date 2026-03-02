import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { posterMarkComplete } from "@/src/services/v4/jobExecutionService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let requestId: string | undefined;
  try {
    const role = await requireV4Role(req, "JOB_POSTER");
    if (role instanceof Response) return role;
    requestId = role.requestId;
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const result = await posterMarkComplete({ jobPosterUserId: role.userId, jobId: id });
    return NextResponse.json({
      ok: true,
      idempotent: result.idempotent,
      finalized: result.finalized,
    });
  } catch (err) {
    const wrapped =
      err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_MARK_COMPLETE_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
