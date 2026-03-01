import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { listThreadsForContractor, listThreadsForJobPoster } from "@/src/services/v4/v4MessageService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function GET(req: Request) {
  let requestId: string | undefined;
  try {
    const url = new URL(req.url);
    const roleParam = url.searchParams.get("role");

    if (roleParam === "job_poster") {
      const role = await requireV4Role(req, "JOB_POSTER");
      if (role instanceof Response) return role;
      requestId = role.requestId;
      const threads = await listThreadsForJobPoster(role.userId);
      return NextResponse.json({ threads });
    }

    if (roleParam === "contractor") {
      const role = await requireV4Role(req, "CONTRACTOR");
      if (role instanceof Response) return role;
      requestId = role.requestId;
      const threads = await listThreadsForContractor(role.userId);
      return NextResponse.json({ threads });
    }

    return NextResponse.json({ error: "role=job_poster|contractor required" }, { status: 400 });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_MESSAGES_THREADS_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
