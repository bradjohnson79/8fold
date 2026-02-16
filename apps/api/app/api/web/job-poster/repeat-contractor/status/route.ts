import { NextResponse } from "next/server";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../src/http/errors";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { jobs, repeatContractorRequests } from "../../../../../../db/schema";

export async function GET(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const u = ready;
    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId")?.trim() ?? "";
    if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });

    const job =
      (
        await db
          .select({
            id: jobs.id,
            jobPosterUserId: jobs.jobPosterUserId,
            repeatContractorDiscountCents: jobs.repeatContractorDiscountCents,
          })
          .from(jobs)
          .where(eq(jobs.id, jobId))
          .limit(1)
      )[0] ?? null;
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (job.jobPosterUserId !== u.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const reqRow =
      (
        await db
          .select({
            id: repeatContractorRequests.id,
            status: repeatContractorRequests.status,
            contractorId: repeatContractorRequests.contractorId,
            requestedAt: repeatContractorRequests.requestedAt,
            respondedAt: repeatContractorRequests.respondedAt,
            priorJobId: repeatContractorRequests.priorJobId,
          })
          .from(repeatContractorRequests)
          .where(eq(repeatContractorRequests.jobId, jobId))
          .limit(1)
      )[0] ?? null;

    return NextResponse.json({
      request: reqRow
        ? {
            ...reqRow,
            requestedAt: (reqRow.requestedAt as any)?.toISOString?.() ?? String(reqRow.requestedAt),
            respondedAt: (reqRow.respondedAt as any)?.toISOString?.() ?? null
          }
        : null,
      repeatContractorDiscountCents: job.repeatContractorDiscountCents ?? 0
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

