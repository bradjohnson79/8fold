import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../src/http/errors";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { jobs } from "../../../../../../db/schema/job";
import { repeatContractorRequests } from "../../../../../../db/schema/repeatContractorRequest";

const BodySchema = z.object({ jobId: z.string().trim().min(10) });

export async function POST(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const u = ready;
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = BodySchema.safeParse(raw);
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const jobId = body.data.jobId;
    const jobRows = await db
      .select({ id: jobs.id, jobPosterUserId: jobs.job_poster_user_id })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (job.jobPosterUserId !== u.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const now = new Date();
    const updatedRows = await db
      .update(repeatContractorRequests)
      .set({ status: "CANCELLED", respondedAt: now, updatedAt: now })
      .where(and(eq(repeatContractorRequests.jobId, jobId), eq(repeatContractorRequests.status, "REQUESTED")))
      .returning({ id: repeatContractorRequests.id });
    const cancelled = updatedRows.length;

    if (cancelled > 0) {
      await db.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: u.userId,
        action: "REPEAT_CONTRACTOR_REQUEST_CANCELLED",
        entityType: "Job",
        entityId: jobId,
        metadata: { reason: "poster_cancelled" },
      });
    }

    return NextResponse.json({ ok: true, cancelled });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

