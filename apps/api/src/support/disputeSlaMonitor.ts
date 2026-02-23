import crypto from "node:crypto";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { getResolvedSchema } from "@/server/db/schemaLock";
import { auditLogs } from "../../db/schema/auditLog";
import { disputeAlerts } from "../../db/schema/disputeAlert";
import { disputeCases } from "../../db/schema/disputeCase";
import { jobs } from "../../db/schema/job";
import { supportTickets } from "../../db/schema/supportTicket";

/**
 * Dispute SLA monitor:
 * - Finds disputes past deadlineAt and not yet decided/closed.
 * - Creates an idempotent DisputeAlert(DEADLINE_BREACHED).
 * - Escalates the linked SupportTicket priority to HIGH (admin inbox signal).
 * - Writes an AuditLog entry once per dispute breach.
 */
export async function runDisputeSlaBreachMonitor(opts?: { take?: number }) {
  const now = new Date();
  const take = Math.min(500, Math.max(1, opts?.take ?? 200));
  const schema = getResolvedSchema();
  const disputeAlertsT = sql.raw(`"${schema}"."dispute_alerts"`);

  const overdue = await db
    .select({
      id: disputeCases.id,
      ticketId: disputeCases.ticketId,
      jobId: disputeCases.jobId,
      deadlineAt: disputeCases.deadlineAt,
    })
    .from(disputeCases)
    .innerJoin(jobs, eq(jobs.id, disputeCases.jobId))
    .where(
      and(
        inArray(disputeCases.status, ["SUBMITTED", "UNDER_REVIEW", "NEEDS_INFO"] as any),
        lt(disputeCases.deadlineAt, now),
        eq(jobs.is_mock, false),
        sql`not exists (
          select 1 from ${disputeAlertsT} da
          where da."disputeCaseId" = ${disputeCases.id}
            and da."type" = ${"DEADLINE_BREACHED"}::"DisputeAlertType"
        )`,
      ),
    )
    .orderBy(sql`${disputeCases.deadlineAt} asc`, sql`${disputeCases.id} asc`)
    .limit(take);

  let created = 0;

  for (const d of overdue) {
    await db.transaction(async (tx) => {
      // Double-check inside tx for idempotency under concurrency.
      const inserted = await tx
        .insert(disputeAlerts)
        .values({
          id: crypto.randomUUID(),
          disputeCaseId: d.id,
          type: "DEADLINE_BREACHED",
        } as any)
        .onConflictDoNothing({ target: [disputeAlerts.disputeCaseId, disputeAlerts.type] })
        .returning({ id: disputeAlerts.id });
      if (inserted.length === 0) return;

      await tx
        .update(supportTickets)
        .set({ priority: "HIGH", updatedAt: now } as any)
        .where(eq(supportTickets.id, d.ticketId));

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: null,
        action: "DISPUTE_DEADLINE_BREACHED",
        entityType: "DisputeCase",
        entityId: d.id,
        metadata: { ticketId: d.ticketId, jobId: d.jobId, deadlineAt: d.deadlineAt.toISOString() } as any,
      });
    });
    created += 1;
  }

  return { scanned: overdue.length, alertsCreated: created };
}

