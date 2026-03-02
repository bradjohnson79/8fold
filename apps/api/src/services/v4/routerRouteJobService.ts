import { randomUUID } from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { auditLogs } from "@/db/schema/auditLog";
import { jobs } from "@/db/schema/job";
import { v4ContractorJobInvites } from "@/db/schema/v4ContractorJobInvite";
import { emitDomainEvent } from "@/src/events/domainEventDispatcher";
import { getV4EligibleContractors } from "@/src/services/v4/routerEligibleContractorsService";

export type RouteJobResult =
  | {
      kind: "ok";
      created: Array<{ inviteId: string; contractorId: string; status: "PENDING"; statusLabel: "INVITED" }>;
      routingStatusLabel: "ROUTING_IN_PROGRESS";
    }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "job_archived" }
  | { kind: "job_not_available" }
  | { kind: "cross_jurisdiction_blocked" }
  | { kind: "missing_job_coords" }
  | { kind: "too_many" }
  | { kind: "contractor_not_eligible" };

export async function routeV4Job(
  routerUserId: string,
  jobId: string,
  contractorIds: string[],
): Promise<RouteJobResult> {
  const desired = Array.from(new Set(contractorIds)).slice(0, 5);
  if (desired.length < 1 || desired.length > 5) return { kind: "too_many" };

  const eligibility = await getV4EligibleContractors(routerUserId, jobId);
  if (eligibility.kind !== "ok") {
    if (eligibility.kind === "forbidden") return { kind: "forbidden" };
    if (eligibility.kind === "not_found") return { kind: "not_found" };
    if (eligibility.kind === "cross_jurisdiction_blocked") return { kind: "cross_jurisdiction_blocked" };
    if (eligibility.kind === "missing_job_coords") return { kind: "missing_job_coords" };
    return { kind: "job_not_available" };
  }
  const eligibleById = new Set(eligibility.contractors.map((c) => c.contractorId));
  if (desired.some((id) => !eligibleById.has(id))) return { kind: "contractor_not_eligible" };

  return db.transaction(async (tx) => {
    const existingInvites = await tx
      .select({ contractorUserId: v4ContractorJobInvites.contractorUserId })
      .from(v4ContractorJobInvites)
      .where(and(eq(v4ContractorJobInvites.jobId, jobId), inArray(v4ContractorJobInvites.contractorUserId, desired as any)));
    if (existingInvites.length > 0) return { kind: "contractor_not_eligible" };

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const lockRows = await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (lockRows.length === 0) return { kind: "not_found" };
    await tx.execute(sql`select id from jobs where id = ${jobId} for update`);

    const updated = await tx
      .update(jobs)
      .set({
        status: "INVITED" as any,
        claimed_by_user_id: routerUserId,
        claimed_at: now,
        routed_at: now,
        routing_started_at: now,
        routing_expires_at: expiresAt,
        routing_status: "ROUTED_BY_ROUTER" as any,
        first_routed_at: sql`coalesce(${jobs.first_routed_at}, ${now})`,
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.status, "OPEN_FOR_ROUTING"), eq(jobs.routing_status, "UNROUTED"), sql`${jobs.claimed_by_user_id} is null`))
      .returning({ id: jobs.id });
    if (updated.length !== 1) return { kind: "job_not_available" };

    const created: Array<{ inviteId: string; contractorId: string; status: "PENDING"; statusLabel: "INVITED" }> = [];
    for (const contractorId of desired) {
      const inviteId = randomUUID();
      await tx.insert(v4ContractorJobInvites).values({
        id: inviteId,
        jobId,
        contractorUserId: contractorId,
        routeId: routerUserId,
        status: "PENDING",
        createdAt: now,
        expiresAt,
      });

      await emitDomainEvent(
        {
          type: "ROUTER_JOB_ROUTED",
          payload: {
            jobId,
            contractorId,
            createdAt: now,
            dedupeKey: `new_job_invite:${jobId}:${contractorId}`,
          },
        },
        { tx },
      );

      created.push({ inviteId, contractorId, status: "PENDING", statusLabel: "INVITED" });
    }

    await tx.insert(auditLogs).values({
      id: randomUUID(),
      createdAt: now,
      actorUserId: routerUserId,
      action: "JOB_ROUTING_APPLIED",
      entityType: "Job",
      entityId: jobId,
      metadata: { contractorIds: desired, createdInviteIds: created.map((c) => c.inviteId) } as any,
    });

    return { kind: "ok", created, routingStatusLabel: "ROUTING_IN_PROGRESS" };
  });
}
