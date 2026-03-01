import { NextResponse } from "next/server";
import { requireV4Role } from "@/src/auth/requireV4Role";
import { acceptAppointmentForJobPoster } from "@/src/services/v4/jobPosterJobsService";
import { internal, toV4ErrorResponse, type V4Error } from "@/src/services/v4/v4Errors";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  let requestId: string | undefined;
  try {
    const role = await requireV4Role(req, "JOB_POSTER");
    if (role instanceof Response) return role;
    requestId = role.requestId;

    const { jobId } = await params;
    if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

    const result = await acceptAppointmentForJobPoster(jobId, role.userId);
    return NextResponse.json(result);
  } catch (err) {
    const wrapped = err instanceof Error && "status" in err ? (err as V4Error) : internal("V4_ACCEPT_APPOINTMENT_FAILED");
    return NextResponse.json(toV4ErrorResponse(wrapped, requestId), { status: wrapped.status });
  }
}
