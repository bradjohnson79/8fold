import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../../../../db/drizzle";
import { jobs } from "../../../../../../../db/schema/job";
import { requireJobPosterReady } from "../../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../../src/http/errors";
import { createJobPaymentIntent } from "../../../../../../../src/payments/jobPayments";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const idIndex = parts.indexOf("jobs") + 1;
  return parts[idIndex] ?? "";
}

export async function POST(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;
    const id = getIdFromUrl(req);

    const jobRows = await db
      .select({
        id: jobs.id,
        jobPosterUserId: jobs.jobPosterUserId,
        escrowLockedAt: jobs.escrowLockedAt,
      })
      .from(jobs)
      .where(and(eq(jobs.id, id), eq(jobs.archived, false)))
      .limit(1);
    const job = jobRows[0] ?? null;

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.jobPosterUserId !== user.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (job.escrowLockedAt) {
      return NextResponse.json({ error: "Job already funded" }, { status: 409 });
    }

    const paymentIntent = await createJobPaymentIntent(job.id);

    return NextResponse.json({
      clientSecret: paymentIntent.clientSecret,
      paymentIntentId: paymentIntent.paymentIntentId,
      totalCents: paymentIntent.amountCents
    });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
