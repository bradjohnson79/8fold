import { NextResponse } from "next/server";
import { and, desc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { auditLogs } from "../../../../../db/schema/auditLog";
import { jobs } from "../../../../../db/schema/job";
import { requireJobPosterReady } from "../../../../../src/auth/onboardingGuards";
import { toHttpError } from "../../../../../src/http/errors";

const HOURS_48 = 48 * 60 * 60 * 1000;

export async function GET(req: Request) {
  try {
    const ready = await requireJobPosterReady(req);
    if (ready instanceof Response) return ready;
    const u = ready;
    const now = new Date();
    const cutoff = new Date(now.getTime() - HOURS_48);

    // Candidates where a check-in would be relevant.
    const jobRows = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        region: jobs.region,
        status: jobs.status,
        estimatedCompletionDate: jobs.estimatedCompletionDate,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.jobPosterUserId, u.userId),
          isNotNull(jobs.estimatedCompletionDate),
          lt(jobs.estimatedCompletionDate, cutoff),
          isNull(jobs.estimateUpdatedAt),
          inArray(jobs.status, ["ASSIGNED", "IN_PROGRESS"]),
        ),
      )
      .orderBy(desc(jobs.publishedAt))
      .limit(25);

    const out: Array<{
      job: { id: string; title: string; region: string; status: string };
      estimatedCompletionDate: string;
      checkInSentAt: string;
    }> = [];

    for (const j of jobRows) {
      if (!j.estimatedCompletionDate) continue;

      const sentRows = await db
        .select({ createdAt: auditLogs.createdAt })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.action, "JOB_POSTER_SOFT_CHECKIN_EVENT"),
            eq(auditLogs.entityType, "Job"),
            eq(auditLogs.entityId, j.id),
          ),
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(1);
      const sent = sentRows[0] ?? null;
      if (!sent) continue; // only show once the system has triggered the check-in

      const respondedRows = await db
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.action, "JOB_POSTER_CHECKIN_RESPONSE"),
            eq(auditLogs.entityType, "Job"),
            eq(auditLogs.entityId, j.id),
          ),
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(1);
      const responded = respondedRows[0] ?? null;
      if (responded) continue;

      out.push({
        job: { id: j.id, title: j.title, region: j.region, status: j.status },
        estimatedCompletionDate: j.estimatedCompletionDate.toISOString().slice(0, 10),
        checkInSentAt: sent.createdAt.toISOString()
      });
    }

    return NextResponse.json({ ok: true, items: out });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

