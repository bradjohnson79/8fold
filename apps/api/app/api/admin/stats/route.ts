import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { contractors } from "../../../../db/schema/contractor";
import { jobDrafts } from "../../../../db/schema/jobDraft";
import { jobs } from "../../../../db/schema/job";
import { payoutRequests } from "../../../../db/schema/payoutRequest";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {

    async function count(q: any): Promise<number> {
      const res = await q;
      return Number((res[0] as any)?.c ?? 0);
    }

    const [
      contractorsTotal,
      contractorsApproved,
      jobDraftsTotal,
      jobsTotal,
      jobsPublished,
      jobsAssigned,
      jobsInProgress,
      jobsContractorCompleted,
      jobsCustomerApproved,
      jobsCustomerRejected,
      jobsFlagged,
      jobsCompletedApproved,
      payoutRequestsRequested,
    ] = await Promise.all([
      count(db.select({ c: sql<number>`count(*)` }).from(contractors)),
      count(db.select({ c: sql<number>`count(*)` }).from(contractors).where(eq(contractors.status, "APPROVED"))),
      count(db.select({ c: sql<number>`count(*)` }).from(jobDrafts)),
      count(db.select({ c: sql<number>`count(*)` }).from(jobs).where(eq(jobs.isMock, false))),
      count(db.select({ c: sql<number>`count(*)` }).from(jobs).where(and(eq(jobs.isMock, false), eq(jobs.status, "PUBLISHED")))),
      count(db.select({ c: sql<number>`count(*)` }).from(jobs).where(and(eq(jobs.isMock, false), eq(jobs.status, "ASSIGNED")))),
      count(db.select({ c: sql<number>`count(*)` }).from(jobs).where(and(eq(jobs.isMock, false), eq(jobs.status, "IN_PROGRESS")))),
      count(db.select({ c: sql<number>`count(*)` }).from(jobs).where(and(eq(jobs.isMock, false), eq(jobs.status, "CONTRACTOR_COMPLETED")))),
      count(db.select({ c: sql<number>`count(*)` }).from(jobs).where(and(eq(jobs.isMock, false), eq(jobs.status, "CUSTOMER_APPROVED")))),
      count(db.select({ c: sql<number>`count(*)` }).from(jobs).where(and(eq(jobs.isMock, false), eq(jobs.status, "CUSTOMER_REJECTED")))),
      count(db.select({ c: sql<number>`count(*)` }).from(jobs).where(and(eq(jobs.isMock, false), eq(jobs.status, "COMPLETION_FLAGGED")))),
      count(db.select({ c: sql<number>`count(*)` }).from(jobs).where(and(eq(jobs.isMock, false), eq(jobs.status, "COMPLETED_APPROVED")))),
      count(db.select({ c: sql<number>`count(*)` }).from(payoutRequests).where(eq(payoutRequests.status, "REQUESTED"))),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        contractors: { total: contractorsTotal, approved: contractorsApproved },
        jobDrafts: { total: jobDraftsTotal },
        jobs: {
          total: jobsTotal,
          assigned: jobsAssigned,
          published: jobsPublished,
          inProgress: jobsInProgress,
          contractorCompleted: jobsContractorCompleted,
          customerApproved: jobsCustomerApproved,
          customerRejected: jobsCustomerRejected,
          flagged: jobsFlagged,
          completedApproved: jobsCompletedApproved
        },
        payoutRequests: { requested: payoutRequestsRequested }
      },
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/stats");
  }
}

