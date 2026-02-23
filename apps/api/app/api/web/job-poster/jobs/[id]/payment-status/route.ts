import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../../db/drizzle";
import { jobs } from "../../../../../../../db/schema/job";
import { requireJobPosterReady } from "../../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../../src/http/errors";
import { getPaymentStatus } from "../../../../../../../src/payments/jobPayments";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idIndex = parts.indexOf("jobs") + 1;
  return parts[idIndex] ?? "";
}

export async function GET(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;
    const id = getIdFromUrl(req);

    const jobRows = await db
      .select({
        id: jobs.id,
        jobPosterUserId: jobs.job_poster_user_id,
        escrowLockedAt: jobs.escrow_locked_at,
        status: jobs.status,
      })
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if (job.jobPosterUserId !== user.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const paymentStatus = await getPaymentStatus(job.id);
    return NextResponse.json({ job, paymentStatus });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

