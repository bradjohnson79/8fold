import { and, eq, gt, inArray, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import { db } from "../../db/drizzle";
import { jobAssignments } from "../../db/schema/jobAssignment";
import { jobs } from "../../db/schema/job";
import { monitoringEvents } from "../../db/schema/monitoringEvent";

type MonitoringEventType = "JOB_APPROACHING_24H" | "JOB_OVERDUE_UNROUTED" | "JOB_ROUTED" | "JOB_COMPLETED";

export const MS_PER_HOUR = 60 * 60 * 1000;
export const HOURS_24_MS = 24 * MS_PER_HOUR;

function msFromHours(n: number): number {
  return n * MS_PER_HOUR;
}

export type JobOverdueInput = {
  routingDueAt: Date | null;
  postedAt: Date;
};

export function getJobOverdueAt(job: JobOverdueInput): Date {
  if (job.routingDueAt) return job.routingDueAt;
  return new Date(job.postedAt.getTime() + HOURS_24_MS);
}

export function isJobOverdue(job: JobOverdueInput, now: Date): boolean {
  return now.getTime() > getJobOverdueAt(job).getTime();
}

export function getPostedAtCutoffForOverdue(now: Date): Date {
  return new Date(now.getTime() - HOURS_24_MS);
}

type OverdueColumns = {
  routingDueAt: any;
  postedAt: any;
};

export function jobOverdueWhere(cols: OverdueColumns, now: Date) {
  const postedAt24h = getPostedAtCutoffForOverdue(now);
  return or(lt(cols.routingDueAt, now), and(isNull(cols.routingDueAt), lte(cols.postedAt, postedAt24h)));
}

export function jobNotOverdueWhere(cols: OverdueColumns, now: Date) {
  const postedAt24h = getPostedAtCutoffForOverdue(now);
  return or(gt(cols.routingDueAt, now), and(isNull(cols.routingDueAt), gt(cols.postedAt, postedAt24h)));
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
  const postedAt20h = new Date(nowMs - msFromHours(20));

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
      .select({ id: jobs.id, routingDueAt: jobs.routing_due_at, postedAt: jobs.posted_at })
      .from(jobs)
      .where(
        and(
          eq(jobs.is_mock, false),
          eq(jobs.routing_status, "UNROUTED"),
          // Avoid routing alerts once work has started (or is already assigned).
          inArray(jobs.status, ["PUBLISHED", "OPEN_FOR_ROUTING"] as any),
          lte(jobs.posted_at, postedAt20h),
          jobNotOverdueWhere({ routingDueAt: jobs.routing_due_at, postedAt: jobs.posted_at }, now),
        ),
      );
    const approachingFiltered = approaching.filter((j) => !isJobOverdue({ routingDueAt: j.routingDueAt, postedAt: j.postedAt }, now));
    if (approachingFiltered.length) {
      const inserted = await tx
        .insert(monitoringEvents)
        .values(
          approachingFiltered.map((j) => ({
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
      .select({ id: jobs.id, routingDueAt: jobs.routing_due_at, postedAt: jobs.posted_at })
      .from(jobs)
      .where(
        and(
          eq(jobs.is_mock, false),
          eq(jobs.routing_status, "UNROUTED"),
          // Avoid routing alerts once work has started (or is already assigned).
          inArray(jobs.status, ["PUBLISHED", "OPEN_FOR_ROUTING"] as any),
          jobOverdueWhere({ routingDueAt: jobs.routing_due_at, postedAt: jobs.posted_at }, now),
        ),
      );
    const overdueFiltered = overdue.filter((j) => isJobOverdue({ routingDueAt: j.routingDueAt, postedAt: j.postedAt }, now));
    if (overdueFiltered.length) {
      const inserted = await tx
        .insert(monitoringEvents)
        .values(
          overdueFiltered.map((j) => ({
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
        routingStatus: jobs.routing_status,
        routerUserId: jobs.claimed_by_user_id,
        adminRoutedById: jobs.admin_routed_by_id,
      })
      .from(jobs)
      .where(and(eq(jobs.is_mock, false), isNotNull(jobs.first_routed_at)));
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
        jobPosterUserId: jobs.job_poster_user_id,
        assignmentCompletedAt: jobAssignments.completedAt,
      })
      .from(jobs)
      .leftJoin(jobAssignments, eq(jobAssignments.jobId, jobs.id))
      .where(
        and(
          eq(jobs.is_mock, false),
          or(eq(jobs.status, "COMPLETED_APPROVED"), isNotNull(jobs.customer_approved_at), isNotNull(jobAssignments.completedAt)),
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

