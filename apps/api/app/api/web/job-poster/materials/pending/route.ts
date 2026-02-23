import { NextResponse } from "next/server";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../src/http/errors";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { jobs } from "../../../../../../db/schema/job";
import { materialsRequests } from "../../../../../../db/schema/materialsRequest";

export async function GET(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const u = ready;

    const rows = await db
      .select({
        id: materialsRequests.id,
        createdAt: materialsRequests.createdAt,
        submittedAt: materialsRequests.submittedAt,
        status: materialsRequests.status,
        currency: materialsRequests.currency,
        totalAmountCents: materialsRequests.totalAmountCents,
        jobId: materialsRequests.jobId,
        job: { id: jobs.id, title: jobs.title, status: jobs.status, paymentStatus: jobs.payment_status },
      })
      .from(materialsRequests)
      .innerJoin(jobs, eq(jobs.id, materialsRequests.jobId))
      .where(and(eq(materialsRequests.jobPosterUserId, u.userId), eq(materialsRequests.status, "SUBMITTED" as any)))
      .orderBy(desc(materialsRequests.createdAt), desc(materialsRequests.id))
      .limit(50);

    return NextResponse.json({
      requests: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        submittedAt: r.submittedAt?.toISOString() ?? null
      }))
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

