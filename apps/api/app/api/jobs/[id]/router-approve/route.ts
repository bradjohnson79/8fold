import { NextResponse } from "next/server";
import { requireRouter } from "../../../../../src/auth/rbac";
import { toHttpError } from "../../../../../src/http/errors";
import { assertJobTransition } from "../../../../../src/jobs/jobTransitions";
import { getOrCreatePlatformUserId } from "../../../../../src/system/platformUser";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../../../db/drizzle";
import { auditLogs, jobAssignments, jobs, ledgerEntries, materialsRequests, routers } from "../../../../../db/schema";
import { randomUUID } from "crypto";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../jobs/:id/router-approve
  return parts[parts.length - 2] ?? "";
}

const BodySchema = z.object({
  notes: z.string().max(2000).optional()
});

export async function POST(req: Request) {
  try {
    const user = await requireRouter(req);
    const id = getIdFromUrl(req);
    const body = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!body.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const platformUserId = await getOrCreatePlatformUserId();

    const result = await db.transaction(async (tx) => {
      const job =
        (
          await tx
            .select({
              id: jobs.id,
              status: jobs.status,
              isMock: jobs.isMock,
              routerId: jobs.routerId,
              routerEarningsCents: jobs.routerEarningsCents,
              brokerFeeCents: jobs.brokerFeeCents,
            })
            .from(jobs)
            .where(eq(jobs.id, id))
            .limit(1)
        )[0] ?? null;
      if (!job) return { kind: "not_found" as const };
      if (job.isMock) return { kind: "mock_job" as const };
      if (job.routerId !== user.userId) return { kind: "forbidden" as const };

      const pendingMaterials =
        (
          await tx
            .select({ c: sql<number>`count(${materialsRequests.id})` })
            .from(materialsRequests)
            .where(and(eq(materialsRequests.jobId, id), eq(materialsRequests.status, "SUBMITTED" as any)))
        )[0]?.c ?? 0;
      if (pendingMaterials > 0) return { kind: "materials_pending" as const };

      // Locked: router is final gate; only CUSTOMER_APPROVED can reach COMPLETED_APPROVED.
      assertJobTransition(job.status, "COMPLETED_APPROVED");

      const assignment =
        (
          await tx
            .select({ id: jobAssignments.id, status: jobAssignments.status })
            .from(jobAssignments)
            .where(eq(jobAssignments.jobId, id))
            .limit(1)
        )[0] ?? null;
      if (!assignment) return { kind: "no_assignment" as const };

      await tx
        .update(jobAssignments)
        .set({ status: "COMPLETED", completedAt: new Date() })
        .where(eq(jobAssignments.id, assignment.id));

      await tx
        .update(jobs)
        .set({
          status: "COMPLETED_APPROVED" as any,
          routerApprovedAt: new Date(),
          routerApprovalNotes: body.data.notes?.trim() || null,
        })
        .where(eq(jobs.id, id));

      const updated =
        (
          await tx
            .select()
            .from(jobs)
            .where(eq(jobs.id, id))
            .limit(1)
        )[0] ?? null;
      if (!updated) throw Object.assign(new Error("Job not found after update"), { status: 404 });

      // Credit earnings only when completion is fully approved (customer + router).
      await tx.insert(ledgerEntries).values({
        id: randomUUID(),
        userId: user.userId,
        jobId: id,
        type: "ROUTER_EARNING",
        direction: "CREDIT",
        bucket: "AVAILABLE",
        amountCents: job.routerEarningsCents ?? 0,
        memo: "Router earning (COMPLETED_APPROVED)",
      });

      await tx.insert(ledgerEntries).values({
        id: randomUUID(),
        userId: platformUserId,
        jobId: id,
        type: "BROKER_FEE",
        direction: "CREDIT",
        bucket: "AVAILABLE",
        amountCents: job.brokerFeeCents ?? 0,
        memo: "Broker fee (COMPLETED_APPROVED)",
      });

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorUserId: user.userId,
        action: "JOB_ROUTER_APPROVED",
        entityType: "Job",
        entityId: id,
        metadata: {
          toStatus: updated.status,
          routerEarningsCents: job.routerEarningsCents,
          brokerFeeCents: job.brokerFeeCents,
        } as any,
      });

      // Senior router progress (system-driven only).
      await tx
        .update(routers)
        .set({ routesCompleted: sql`${routers.routesCompleted} + 1` })
        .where(and(eq(routers.userId, user.userId), eq(routers.status, "ACTIVE" as any)));

      return { kind: "ok" as const, job: updated };
    });

    if (result.kind === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.kind === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (result.kind === "mock_job") return NextResponse.json({ error: "Mock jobs cannot be completed" }, { status: 409 });
    if (result.kind === "no_assignment") return NextResponse.json({ error: "Job is not assigned" }, { status: 409 });
    if (result.kind === "materials_pending") {
      return NextResponse.json(
        { error: "Cannot complete job while a materials request is pending decision." },
        { status: 409 }
      );
    }
    return NextResponse.json({ job: result.job });
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
}

