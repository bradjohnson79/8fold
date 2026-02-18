import { NextResponse } from "next/server";
import { requireSupportRequester } from "../../../../../../../src/auth/rbac";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../../db/drizzle";
import { jobs } from "../../../../../../../db/schema/job";

function getJobIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idx = parts.indexOf("jobs") + 1;
  return parts[idx] ?? "";
}

function isSupportRequesterRole(role: string): boolean {
  return role === "JOB_POSTER" || role === "ROUTER" || role === "CONTRACTOR";
}

function ok<T>(data: T) {
  return NextResponse.json({ ok: true, data }, { status: 200 });
}
function fail(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: Request) {
  try {
    const user = await requireSupportRequester(req);
    const role = String(user.role);
    if (!isSupportRequesterRole(role)) {
      return fail(403, "Forbidden");
    }

    const jobId = getJobIdFromUrl(req);
    const jobRows = await db
      .select({
        id: jobs.id,
        isMock: jobs.isMock,
        jobPosterUserId: jobs.jobPosterUserId,
        routerId: jobs.claimedByUserId,
        contractorUserId: jobs.contractorUserId,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job) return fail(404, "Not found");
    if (job.isMock) return fail(400, "Mock jobs have no dispute participants");

    const involved =
      job.jobPosterUserId === user.userId || job.routerId === user.userId || job.contractorUserId === user.userId;
    if (!involved) return fail(403, "Forbidden");

    return ok({
      participants: {
        jobPosterUserId: job.jobPosterUserId,
        contractorUserId: job.contractorUserId,
        routerId: job.routerId
      },
    });
  } catch (err) {
    const status = typeof (err as any)?.status === "number" ? Number((err as any).status) : 500;
    const message = err instanceof Error ? err.message : "Failed";
    return fail(status, message);
  }
}

