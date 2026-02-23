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

async function safeLoadExistingRepeatRequest(jobId: string): Promise<any | null> {
  try {
    const res = await db.execute(sql`
      select id, status, "contractorId", "priorJobId", "requestedAt", "respondedAt"
      from "RepeatContractorRequest"
      where "jobId" = ${jobId}
      limit 1
    `);
    return (res.rows[0] ?? null) as any;
  } catch (err: any) {
    // Some dev DB snapshots predate RepeatContractorRequest. Treat as "no request" instead of 500.
    const code = typeof err?.code === "string" ? err.code : "";
    const msg = typeof err?.message === "string" ? err.message : "";
    if (code === "42P01" || msg.includes("RepeatContractorRequest")) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn("[repeat-contractor/eligible] RepeatContractorRequest unavailable; treating as no request");
      }
      return null;
    }
    throw err;
  }
}

async function safeFindPriorCompletedJob(opts: {
  userId: string;
  tradeCategory: any;
}): Promise<
  | null
  | {
      id: string;
      publishedAt: Date;
      region: string;
      contractor_id: string;
      contractor_businessName: string | null;
      contractor_trade: string | null;
      contractor_regionCode: string | null;
    }
> {
  try {
    const rows = await db
      .select({
        id: jobs.id,
        publishedAt: jobs.published_at,
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
          eq(jobs.job_poster_user_id, opts.userId),
          eq(jobs.trade_category, opts.tradeCategory),
          eq(jobs.status, "COMPLETED_APPROVED"),
          isNotNull(jobAssignments.id),
        ),
      )
      .orderBy(desc(jobs.published_at), desc(jobs.id))
      .limit(1);
    return rows[0] ?? null;
  } catch (err: any) {
    // Schema drift in some local DBs: if supporting tables/columns are missing, treat as not eligible.
    const code = typeof err?.code === "string" ? err.code : "";
    const msg = typeof err?.message === "string" ? err.message : "";
    if (code === "42P01" || code === "42703" || msg.includes("JobAssignment") || msg.includes("Contractor")) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn("[repeat-contractor/eligible] eligibility query unavailable; treating as ineligible", { code });
      }
      return null;
    }
    throw err;
  }
}

export async function GET(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const u = ready;
    const jobId = getJobId(req);
    if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });

    const jobRows = await db
      .select({ id: jobs.id, status: jobs.status, jobPosterUserId: jobs.job_poster_user_id, tradeCategory: jobs.trade_category })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (job.jobPosterUserId !== u.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (job.status !== "DRAFT") return NextResponse.json({ error: "Job must be DRAFT" }, { status: 409 });

    const existingReq = await safeLoadExistingRepeatRequest(job.id);

    // Find most recent completed job with same trade and a contractor assignment.
    const prior = await safeFindPriorCompletedJob({ userId: u.userId, tradeCategory: job.tradeCategory });

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

