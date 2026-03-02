import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRoleCompletion } from "@/src/auth/requireRoleCompletion";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { listJobsForJobPoster } from "@/src/services/v4/jobPosterJobsService";
import { submitJobFromPayload } from "@/src/services/escrow/jobSubmitService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

const SubmitBodySchema = z.object({
  details: z.record(z.any()),
  availability: z.unknown(),
  images: z.array(z.record(z.any())).default([]),
  pricing: z.record(z.any()),
  payment: z.record(z.any()),
});

export async function GET(req: Request) {
  let requestId: string | undefined;
  try {
    const role = await requireV4Role(req, "JOB_POSTER");
    if (role instanceof Response) return role;
    requestId = role.requestId;
    const jobs = await listJobsForJobPoster(role.userId);
    return NextResponse.json({ jobs });
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_JOBS_LIST_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}

export async function POST(req: Request) {
  try {
    const role = await requireV4Role(req, "JOB_POSTER");
    if (role instanceof Response) return role;
    const completionGuard = await requireRoleCompletion(role.userId, "JOB_POSTER");
    if (completionGuard) return completionGuard;

    const parsed = SubmitBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
    }

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
