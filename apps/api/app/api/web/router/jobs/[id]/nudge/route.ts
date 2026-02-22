import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../../db/schema/auditLog";
import { jobAssignments } from "../../../../../../../db/schema/jobAssignment";
import { jobs } from "../../../../../../../db/schema/job";
import { requireRouterReady } from "../../../../../../../src/auth/requireRouterReady";
import { toHttpError } from "../../../../../../../src/http/errors";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../web/router/jobs/:id/nudge
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request) {
  try {
    const authed = await requireRouterReady(req);
    if (authed instanceof Response) return authed;
    const router = authed;
    const id = getIdFromUrl(req);
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const jobRows = await db
      .select({
        id: jobs.id,
        routerId: jobs.claimed_by_user_id, // Prisma `routerId` is mapped to DB column `claimedByUserId`
        jobPosterUserId: jobs.job_poster_user_id,
        contractorId: jobAssignments.contractorId,
      })
      .from(jobs)
      .leftJoin(jobAssignments, eq(jobAssignments.jobId, jobs.id))
      .where(eq(jobs.id, id))
      .limit(1);
    const job = jobRows[0] ?? null;
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (job.routerId !== router.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const now = new Date();
    const lastRows = await db
      .select({ createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "ECD_ROUTER_NUDGE_SENT"),
          eq(auditLogs.entityType, "Job"),
          eq(auditLogs.entityId, id),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    const last = lastRows[0] ?? null;
    if (last && now.getTime() - last.createdAt.getTime() < 48 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "Nudge is rate-limited (max once per job per 48 hours)." }, { status: 409 });
    }

    await db.insert(auditLogs).values({
      id: randomUUID(),
      actorUserId: router.userId,
      action: "ECD_ROUTER_NUDGE_SENT",
      entityType: "Job",
      entityId: id,
      metadata: {
        at: now.toISOString(),
        contractorId: job.contractorId ?? null,
        jobPosterUserId: job.jobPosterUserId ?? null,
        note: "Hi — just a quick check-in from 8Fold. Please post a brief update on the job status when you can.",
      } as any,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message, code, context } = toHttpError(err);
    return NextResponse.json({ ok: false, error: message, code, context }, { status });
  }
}

