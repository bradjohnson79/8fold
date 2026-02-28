import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { releaseCompletedJobForPoster } from "@/src/services/v4/jobPosterJobsService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let requestId: string | undefined;
  try {
    const role = await requireV4Role(req, "JOB_POSTER");
    if (role instanceof Response) return role;
    requestId = role.requestId;

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const result = await releaseCompletedJobForPoster(id, role.userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_RELEASE_JOB_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
