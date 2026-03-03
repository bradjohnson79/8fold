import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoleCompletion } from "@/src/auth/requireRoleCompletion";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { listJobsForJobPoster } from "@/src/services/v4/jobPosterJobsService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

const logger = {
  error(message: string, meta: Record<string, unknown>) {
    console.error(message, meta);
  },
};

const FALLBACK_ERROR = "Partial failure, please retry";

const SubmitBodySchema = z.object({
  details: z.record(z.any()),
  availability: z.unknown(),
  images: z.array(z.record(z.any())).default([]),
  pricing: z.record(z.any()),
  payment: z.record(z.any()),
});

export async function GET(req: Request) {
  let requestId: string | undefined;
  let userId: string | undefined;
  try {
    const role = await requireV4Role(req, "JOB_POSTER");
    if (role instanceof Response) return role;
    requestId = role.requestId;
    userId = role.userId;
    const jobs = await listJobsForJobPoster(role.userId);
    return NextResponse.json({ jobs });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : 500;
    logger.error("job-poster jobs list error", {
      error: err instanceof Error ? err.message : String(err),
      userId,
      requestId,
      status,
    });

    if (status === 401 || status === 403) {
      const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_JOBS_LIST_FAILED");
      return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
    }

    return NextResponse.json(
      {
        jobs: [],
        error: FALLBACK_ERROR,
      },
      { status: 200 },
    );
  }
}

export async function POST(req: Request) {
  console.warn("[POST_JOB_HIT]", Date.now());
  try {
    const role = await requireV4Role(req, "JOB_POSTER");
    if (role instanceof Response) return role;
    const completionGuard = await requireRoleCompletion(role.userId, "JOB_POSTER");
    if (completionGuard) return completionGuard;

    const parsed = SubmitBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
    }

    const { submitJobFromPayload } = await import("@/src/services/escrow/jobSubmitService");
    const result = await submitJobFromPayload(role.userId, parsed.data);
    return NextResponse.json({ success: true, jobId: result.jobId, created: result.created });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? (err as any).status : 500;
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Failed to submit job." },
      { status },
    );
  }
}
