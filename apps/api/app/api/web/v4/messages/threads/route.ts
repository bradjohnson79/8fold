import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { listThreadsForJobPoster } from "@/src/services/v4/v4MessageService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function GET(req: Request) {
  let requestId: string | undefined;
  try {
    const role = await requireV4Role(req, "JOB_POSTER");
    if (role instanceof Response) return role;
    requestId = role.requestId;
    const url = new URL(req.url);
    const roleParam = url.searchParams.get("role");
    if (roleParam !== "job_poster") {
      return NextResponse.json({ error: "role=job_poster required" }, { status: 400 });
    }
    const threads = await listThreadsForJobPoster(role.userId);
    return NextResponse.json({ threads });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_MESSAGES_THREADS_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
