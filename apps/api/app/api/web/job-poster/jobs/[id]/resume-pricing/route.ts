import { NextResponse } from "next/server";
import { requireJobPosterReady } from "../../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../../src/http/errors";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../../../../db/drizzle";
import { jobs } from "../../../../../../../db/schema";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const jobsIdx = parts.indexOf("jobs");
  return jobsIdx >= 0 ? (parts[jobsIdx + 1] ?? "") : "";
}

export async function GET(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const user = ready;
    const id = getIdFromUrl(req);
    if (!id) return NextResponse.json({ error: "Missing job id" }, { status: 400 });

    const job =
      (
        await db
          .select({
            id: jobs.id,
            jobPosterUserId: jobs.jobPosterUserId,
            currency: jobs.currency,
            laborTotalCents: jobs.laborTotalCents,
          })
          .from(jobs)
          .where(and(eq(jobs.id, id), eq(jobs.archived, false)))
          .limit(1)
      )[0] ?? null;
    if (!job || job.jobPosterUserId !== user.userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Pricing/appraisal fields are not present in the current Prisma schema.
    // Non-blocking: return minimal info for client compatibility.
    return NextResponse.json({ ok: true, job: { id: job.id, currency: job.currency, laborTotalCents: job.laborTotalCents } });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

