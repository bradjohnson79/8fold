import { NextResponse } from "next/server";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../src/http/errors";
import { createMaterialsPaymentIntent } from "../../../../../../src/payments/materialsPayments";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { materialsRequests } from "../../../../../../db/schema/materialsRequest";
import { jobs } from "../../../../../../db/schema/job";
import { isJobActive } from "../../../../../../src/utils/jobActive";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../materials-requests/:id/create-payment-intent
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const u = ready;
    const requestId = getIdFromUrl(req);

    const mrRows = await db
      .select({
        id: materialsRequests.id,
        jobId: materialsRequests.jobId,
        jobPosterUserId: materialsRequests.jobPosterUserId,
        jobStatus: jobs.status,
        jobPaymentStatus: jobs.paymentStatus,
      })
      .from(materialsRequests)
      .innerJoin(jobs, eq(jobs.id, materialsRequests.jobId))
      .where(eq(materialsRequests.id, requestId))
      .limit(1);
    const mr = mrRows[0] ?? null;
    if (!mr) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (mr.jobPosterUserId !== u.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (!isJobActive({ paymentStatus: mr.jobPaymentStatus, status: mr.jobStatus })) {
      return NextResponse.json(
        { ok: false, error: "Job is not active. Parts & Materials unavailable." },
        { status: 400 },
      );
    }

    const paymentIntent = await createMaterialsPaymentIntent(requestId);
    return NextResponse.json(paymentIntent);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

