import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobs } from "@/db/schema/job";
import { requireJobPosterReady } from "@/src/auth/onboardingGuards";
import { toHttpError } from "@/src/http/errors";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 2] ?? "";
}

export async function GET(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const poster = ready;
    const jobId = getIdFromUrl(req);
    if (!jobId) return NextResponse.json({ ok: false, error: "Invalid job id" }, { status: 400 });

    const rows = await db
      .select({
        id: jobs.id,
        archived: jobs.archived,
        jobPosterUserId: jobs.job_poster_user_id,
        status: jobs.status,
        paymentStatus: jobs.payment_status,
        payoutStatus: jobs.payout_status,
        fundedAt: jobs.funded_at,
        releasedAt: jobs.released_at,
      })
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.archived, false)))
      .limit(1);
    const job = rows[0] ?? null;
    if (!job) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (job.jobPosterUserId !== poster.userId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    return NextResponse.json({
      ok: true,
      job: {
        id: job.id,
        status: job.status,
        paymentStatus: job.paymentStatus,
        payoutStatus: job.payoutStatus,
        fundedAt: job.fundedAt,
        releasedAt: job.releasedAt,
      },
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

