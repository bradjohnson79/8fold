import { NextResponse } from "next/server";
import { requireSupportRequester } from "../../../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../../../src/http/errors";
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

export async function GET(req: Request) {
  try {
    const user = await requireSupportRequester(req);
    const role = String(user.role);
    if (!isSupportRequesterRole(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (job.isMock) return NextResponse.json({ error: "Mock jobs have no dispute participants" }, { status: 400 });

    const involved =
      job.jobPosterUserId === user.userId || job.routerId === user.userId || job.contractorUserId === user.userId;
    if (!involved) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    return NextResponse.json({
      participants: {
        jobPosterUserId: job.jobPosterUserId,
        contractorUserId: job.contractorUserId,
        routerId: job.routerId
      }
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

