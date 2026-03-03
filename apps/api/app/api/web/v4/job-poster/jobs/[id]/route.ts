import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { getJobDetailForJobPoster } from "@/src/services/v4/jobPosterJobsService";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractDbError(err: unknown): { code?: string; detail?: string; hint?: string } {
  const obj = err as Record<string, unknown> | null;
  if (!obj) return {};
  const cause = (obj.cause ?? obj) as Record<string, unknown> | undefined;
  const src = cause ?? obj;
  return {
    code: typeof src?.code === "string" ? src.code : undefined,
    detail: typeof src?.detail === "string" ? src.detail : undefined,
    hint: typeof src?.hint === "string" ? src.hint : undefined,
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let requestId: string | undefined;
  let userId: string | undefined;
  let role: string | undefined;

  try {
    const auth = await requireV4Role(req, "JOB_POSTER");
    if (auth instanceof Response) return auth;
    requestId = auth.requestId;
    userId = auth.userId;
    role = "JOB_POSTER";

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "JOB_ID_REQUIRED" }, { status: 400 });
    }
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "JOB_ID_INVALID" }, { status: 400 });
    }

    const job = await getJobDetailForJobPoster(id, userId);
    if (!job) {
      return NextResponse.json({ error: "JOB_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(job);
  } catch (err) {
    const dbErr = extractDbError(err);
    console.error("JOB_POSTER_JOB_DETAIL_ERROR", {
      jobId: (await params).id,
      userId,
      role,
      requestId,
      stack: err instanceof Error ? err.stack : undefined,
      ...dbErr,
    });
    return NextResponse.json(
      { error: "JOB_DETAIL_FAILED" },
      { status: 500 },
    );
  }
}
