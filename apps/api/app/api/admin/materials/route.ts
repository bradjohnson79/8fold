import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractors } from "@/db/schema/contractor";
import { jobs } from "@/db/schema/job";
import { materialsRequests } from "@/db/schema/materialsRequest";
import { users } from "@/db/schema/user";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const rows = await db
      .select({
        id: materialsRequests.id,
        createdAt: materialsRequests.createdAt,
        updatedAt: materialsRequests.updatedAt,
        status: materialsRequests.status,
        jobId: materialsRequests.jobId,
        contractorId: materialsRequests.contractorId,
        jobPosterUserId: materialsRequests.jobPosterUserId,
        routerUserId: materialsRequests.routerUserId,
        submittedAt: materialsRequests.submittedAt,
        approvedAt: materialsRequests.approvedAt,
        declinedAt: materialsRequests.declinedAt,
        approvedByUserId: materialsRequests.approvedByUserId,
        declinedByUserId: materialsRequests.declinedByUserId,
        currency: materialsRequests.currency,
        totalAmountCents: materialsRequests.totalAmountCents,
        job: {
          id: jobs.id,
          title: jobs.title,
        },
        jobPosterUser: {
          id: users.id,
          email: users.email,
        },
        contractor: {
          id: contractors.id,
          businessName: contractors.businessName,
        },
      })
      .from(materialsRequests)
      .leftJoin(jobs, eq(materialsRequests.jobId, jobs.id))
      .leftJoin(users, eq(materialsRequests.jobPosterUserId, users.id))
      .leftJoin(contractors, eq(materialsRequests.contractorId, contractors.id))
      .orderBy(desc(materialsRequests.createdAt))
      .limit(200);

    const requests = rows.map((r: any) => ({
      ...r,
      job: r.job?.id != null ? { id: r.job.id, title: r.job.title } : null,
      jobPosterUser: r.jobPosterUser?.id != null ? { id: r.jobPosterUser.id, email: r.jobPosterUser.email } : null,
      contractor: r.contractor?.id != null ? { id: r.contractor.id, businessName: r.contractor.businessName } : null,
      createdAt: (r.createdAt as Date)?.toISOString?.() ?? String(r.createdAt),
      updatedAt: (r.updatedAt as Date)?.toISOString?.() ?? String(r.updatedAt),
      submittedAt: (r.submittedAt as Date)?.toISOString?.() ?? String(r.submittedAt),
      approvedAt: r.approvedAt ? (r.approvedAt as Date)?.toISOString?.() : null,
      declinedAt: r.declinedAt ? (r.declinedAt as Date)?.toISOString?.() : null,
    }));

    return NextResponse.json({ ok: true, data: { requests } });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/materials", { route: "/api/admin/materials", userId: auth.userId });
  }
}
