import { and, eq, gt, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import { db } from "../../db/drizzle";
import { jobAssignments } from "../../db/schema/jobAssignment";
import { jobs } from "../../db/schema/job";
import { monitoringEvents } from "../../db/schema/monitoringEvent";

type MonitoringEventType = "JOB_APPROACHING_24H" | "JOB_OVERDUE_UNROUTED" | "JOB_ROUTED" | "JOB_COMPLETED";

function hours(n: number): number {
  return n * 60 * 60 * 1000;
}

/**
 * Evaluate job timestamps and append-only emit monitoring events.
 * Idempotent: never emits duplicates for the same (jobId + type).
 * Does not mutate Job rows.
 */
export async function runMonitoringEvaluation(): Promise<{
  emitted: Record<MonitoringEventType, number>;
}> {
  const now = new Date();
  const nowMs = now.getTime();
  const postedAt20h = new Date(nowMs - hours(20));
  const postedAt24h = new Date(nowMs - hours(24));

  const emitted: Record<MonitoringEventType, number> = {
    JOB_APPROACHING_24H: 0,
    JOB_OVERDUE_UNROUTED: 0,
    JOB_ROUTED: 0,
    JOB_COMPLETED: 0
  };

  await db.transaction(async (tx) => {
    // 1) JOB_APPROACHING_24H
    // - UNROUTED
    // - now >= postedAt + 20h
    // - now < routingDueAt (if routingDueAt null, assume postedAt + 24h)
    const approaching = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.isMock, false),
          eq(jobs.routingStatus, "UNROUTED"),
          lte(jobs.postedAt, postedAt20h),
          or(
            gt(jobs.routingDueAt, now),
            and(isNull(jobs.routingDueAt), gt(jobs.postedAt, postedAt24h)),
          ),
        ),
      );
    if (approaching.length) {
      const inserted = await tx
        .insert(monitoringEvents)
        .values(
          approaching.map((j) => ({
            type: "JOB_APPROACHING_24H",
            jobId: j.id,
            role: "ADMIN",
            userId: null,
          })) as any,
        )
        .onConflictDoNothing({ target: [monitoringEvents.jobId, monitoringEvents.type] })
        .returning({ id: monitoringEvents.id });
      emitted.JOB_APPROACHING_24H += inserted.length;
    }

    // 2) JOB_OVERDUE_UNROUTED
    // - UNROUTED
    // - now > routingDueAt (if routingDueAt null, assume postedAt+24h)
    const overdue = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.isMock, false),
          eq(jobs.routingStatus, "UNROUTED"),
          or(lt(jobs.routingDueAt, now), and(isNull(jobs.routingDueAt), lte(jobs.postedAt, postedAt24h))),
        ),
      );
    if (overdue.length) {
      const inserted = await tx
        .insert(monitoringEvents)
        .values(
          overdue.map((j) => ({
            type: "JOB_OVERDUE_UNROUTED",
            jobId: j.id,
            role: "ADMIN",
            userId: null,
          })) as any,
        )
        .onConflictDoNothing({ target: [monitoringEvents.jobId, monitoringEvents.type] })
        .returning({ id: monitoringEvents.id });
      emitted.JOB_OVERDUE_UNROUTED += inserted.length;
    }

    // 3) JOB_ROUTED
    // - firstRoutedAt is not null
    const routed = await tx
      .select({
        id: jobs.id,
        routingStatus: jobs.routingStatus,
        routerUserId: jobs.claimedByUserId,
        adminRoutedById: jobs.adminRoutedById,
      })
      .from(jobs)
      .where(and(eq(jobs.isMock, false), isNotNull(jobs.firstRoutedAt)));
    if (routed.length) {
      const inserted = await tx
        .insert(monitoringEvents)
        .values(
          routed.map((j) => {
            const role =
              j.routingStatus === "ROUTED_BY_ADMIN"
                ? ("ADMIN" as const)
                : j.routingStatus === "ROUTED_BY_ROUTER"
                  ? ("ROUTER" as const)
                  : ("ADMIN" as const);
            const userId = role === "ADMIN" ? j.adminRoutedById ?? null : role === "ROUTER" ? j.routerUserId ?? null : null;
            return {
              type: "JOB_ROUTED" as const,
              jobId: j.id,
              role,
              userId,
            };
          }) as any,
        )
        .onConflictDoNothing({ target: [monitoringEvents.jobId, monitoringEvents.type] })
        .returning({ id: monitoringEvents.id });
      emitted.JOB_ROUTED += inserted.length;
    }

    // 4) JOB_COMPLETED
    // Prompt references Job.completedAt, but v1 stores completion via:
    // - status COMPLETED_APPROVED, or
    // - customerApprovedAt, or
    // - JobAssignment.completedAt
    const completed = await tx
      .select({
        id: jobs.id,
        jobPosterUserId: jobs.jobPosterUserId,
        assignmentCompletedAt: jobAssignments.completedAt,
      })
      .from(jobs)
      .leftJoin(jobAssignments, eq(jobAssignments.jobId, jobs.id))
      .where(
        and(
          eq(jobs.isMock, false),
          or(eq(jobs.status, "COMPLETED_APPROVED"), isNotNull(jobs.customerApprovedAt), isNotNull(jobAssignments.completedAt)),
        ),
      );
    if (completed.length) {
      const inserted = await tx
        .insert(monitoringEvents)
        .values(
          completed.map((j) => ({
            type: "JOB_COMPLETED",
            jobId: j.id,
            role: j.jobPosterUserId ? "JOB_POSTER" : "ADMIN",
            userId: j.jobPosterUserId ?? null,
          })) as any,
        )
        .onConflictDoNothing({ target: [monitoringEvents.jobId, monitoringEvents.type] })
        .returning({ id: monitoringEvents.id });
      emitted.JOB_COMPLETED += inserted.length;
    }
  });

  return { emitted };
}

