import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { jobs } from "../../../../../../db/schema/job";
import { requireJobPosterReady } from "../../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../../src/http/errors";
import { z } from "zod";

const BodySchema = z.object({
  jobId: z.string().trim().min(10),
  response: z.enum(["COMPLETED", "IN_PROGRESS", "ISSUE"])
});

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

    const jobRows = await db
      .select({
        id: jobs.id,
        jobPosterUserId: jobs.jobPosterUserId,
        routerId: jobs.claimedByUserId, // Prisma `routerId` is mapped to DB column `claimedByUserId`
      })
      .from(jobs)
      .where(eq(jobs.id, body.data.jobId))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (job.jobPosterUserId !== u.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const sentRows = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "JOB_POSTER_SOFT_CHECKIN_EVENT"),
          eq(auditLogs.entityType, "Job"),
          eq(auditLogs.entityId, job.id),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    const sent = sentRows[0] ?? null;
    if (!sent) return NextResponse.json({ error: "No active check-in for this job." }, { status: 409 });

    const respondedRows = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "JOB_POSTER_CHECKIN_RESPONSE"),
          eq(auditLogs.entityType, "Job"),
          eq(auditLogs.entityId, job.id),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    const responded = respondedRows[0] ?? null;
    if (responded) return NextResponse.json({ error: "Check-in already responded." }, { status: 409 });

    await db.insert(auditLogs).values({
      id: randomUUID(),
      actorUserId: u.userId,
      action: "JOB_POSTER_CHECKIN_RESPONSE",
      entityType: "Job",
      entityId: job.id,
      metadata: { response: body.data.response } as any,
    });

    if (body.data.response === "ISSUE") {
      await db.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: u.userId,
        action: "JOB_SOFT_REVIEW_FLAG_CREATED",
        entityType: "Job",
        entityId: job.id,
        metadata: {
          kind: "ECD_CHECKIN_ISSUE",
          routerUserId: job.routerId ?? null,
        } as any,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message, code, context } = toHttpError(err);
    return NextResponse.json({ ok: false, error: message, code, context }, { status });
  }
}

