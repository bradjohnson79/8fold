import { NextResponse } from "next/server";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { contractors } from "../../../../../../db/schema/contractor";
import { jobAssignments } from "../../../../../../db/schema/jobAssignment";
import { jobs } from "../../../../../../db/schema/job";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../src/http/errors";

function getJobId(req: Request): string {
  const url = new URL(req.url);
  return url.searchParams.get("jobId")?.trim() ?? "";
}

export async function GET(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const u = ready;
    const jobId = getJobId(req);
    if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });

    const jobRows = await db
      .select({ id: jobs.id, status: jobs.status, jobPosterUserId: jobs.jobPosterUserId, tradeCategory: jobs.tradeCategory })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (job.jobPosterUserId !== u.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (job.status !== "DRAFT") return NextResponse.json({ error: "Job must be DRAFT" }, { status: 409 });

    const existingReqRes = await db.execute(sql`
      select id, status, "contractorId", "priorJobId", "requestedAt", "respondedAt"
      from "RepeatContractorRequest"
      where "jobId" = ${job.id}
      limit 1
    `);
    const existingReq = (existingReqRes.rows[0] ?? null) as any;

    // Find most recent completed job with same trade and a contractor assignment.
    const priorRows = await db
      .select({
        id: jobs.id,
        publishedAt: jobs.publishedAt,
        region: jobs.region,
        contractor_id: contractors.id,
        contractor_businessName: contractors.businessName,
        contractor_trade: contractors.trade,
        contractor_regionCode: contractors.regionCode,
      })
      .from(jobs)
      .innerJoin(jobAssignments, eq(jobAssignments.jobId, jobs.id))
      .innerJoin(contractors, eq(contractors.id, jobAssignments.contractorId))
      .where(
        and(
          eq(jobs.jobPosterUserId, u.userId),
          eq(jobs.tradeCategory, job.tradeCategory),
          eq(jobs.status, "COMPLETED_APPROVED"),
          isNotNull(jobAssignments.id),
        ),
      )
      .orderBy(desc(jobs.publishedAt), desc(jobs.id))
      .limit(1);
    const prior = priorRows[0] ?? null;

    if (!prior || !prior.contractor_id) {
      return NextResponse.json({ eligible: false, request: existingReq ?? null });
    }

    return NextResponse.json({
      eligible: true,
      tradeCategory: job.tradeCategory,
      priorJob: {
        id: prior.id,
        priorJobDate: prior.publishedAt.toISOString(),
        region: prior.region
      },
      contractor: {
        id: prior.contractor_id,
        businessName: prior.contractor_businessName,
        trade: prior.contractor_trade,
        regionCode: prior.contractor_regionCode
      },
      request: existingReq
        ? { ...existingReq, requestedAt: existingReq.requestedAt.toISOString(), respondedAt: existingReq.respondedAt?.toISOString() ?? null }
        : null
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

