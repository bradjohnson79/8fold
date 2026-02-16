import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { badRequest, fail, ok } from "@/src/lib/api/respond";
import { assertJobTransition } from "../../../../../../src/jobs/jobTransitions";
import { getOrCreatePlatformUserId } from "../../../../../../src/system/platformUser";
import { z } from "zod";
import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { jobs } from "../../../../../../db/schema/job";
import { jobAssignments } from "../../../../../../db/schema/jobAssignment";
import { ledgerEntries } from "../../../../../../db/schema/ledgerEntry";
import { routers } from "../../../../../../db/schema/router";
import { readJsonBody } from "@/src/lib/api/readJsonBody";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../jobs/:id/complete
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const jobId = getIdFromUrl(req);

    const BodySchema = z.object({
      override: z.literal(true),
      reason: z.string().min(3).max(500)
    });
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const body = BodySchema.safeParse(j.json);
    if (!body.success) {
      return badRequest("override_required");
    }

    const result = await db.transaction(async (tx: any) => {
      const platformUserId = await getOrCreatePlatformUserId(tx as any);

      const jobRows = await tx
        .select({
          id: jobs.id,
          status: jobs.status,
          isMock: jobs.isMock,
          routerUserId: jobs.claimedByUserId,
          routerEarningsCents: jobs.routerEarningsCents,
          brokerFeeCents: jobs.brokerFeeCents,
        })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);
      const job = jobRows[0] ?? null;
      if (!job) return { kind: "not_found" as const };
      if (job.isMock) return { kind: "mock_job" as const };
      if (!job.routerUserId) return { kind: "no_router" as const };

      const materialsCountRes = await tx.execute(
        sql`select count(*)::int as c from "MaterialsRequest" where "jobId" = ${jobId} and "status" = ${"SUBMITTED"}`,
      );
      const pendingMaterials = Number((materialsCountRes.rows[0] as any)?.c ?? 0);
      if (pendingMaterials > 0) return { kind: "materials_pending" as const };

      // Admin is not a shortcut: this endpoint is an explicit OVERRIDE only.
      // Require the job to already be CUSTOMER_APPROVED; then admin can override the final router approval.
      assertJobTransition(job.status, "COMPLETED_APPROVED");

      const assignmentRows = await tx
        .select({ id: jobAssignments.id, status: jobAssignments.status })
        .from(jobAssignments)
        .where(eq(jobAssignments.jobId, jobId))
        .limit(1);
      const assignment = assignmentRows[0] ?? null;
      if (!assignment) return { kind: "no_assignment" as const };

      const now = new Date();
      await tx
        .update(jobAssignments)
        .set({ status: "COMPLETED", completedAt: now } as any)
        .where(eq(jobAssignments.id, assignment.id));

      const updatedJobRows = await tx
        .update(jobs)
        .set({
          status: "COMPLETED_APPROVED",
          routerApprovedAt: now,
          routerApprovalNotes: `ADMIN_OVERRIDE: ${body.data.reason}`,
        } as any)
        .where(eq(jobs.id, jobId))
        .returning();
      const updatedJob = updatedJobRows[0] as any;

      // Router earning becomes AVAILABLE after completion is approved (override).
      await tx.insert(ledgerEntries).values({
        id: crypto.randomUUID(),
        userId: job.routerUserId,
        jobId,
        type: "ROUTER_EARNING",
        direction: "CREDIT",
        bucket: "AVAILABLE",
        amountCents: job.routerEarningsCents,
        memo: "Router earning (completion approved via admin override)",
      } as any);

      // Broker fee recorded in platform ledger (internal accounting).
      await tx.insert(ledgerEntries).values({
        id: crypto.randomUUID(),
        userId: platformUserId,
        jobId,
        type: "BROKER_FEE",
        direction: "CREDIT",
        bucket: "AVAILABLE",
        amountCents: job.brokerFeeCents,
        memo: "Broker fee (completion approved via admin override)",
      } as any);

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: auth.userId,
        action: "JOB_ADMIN_OVERRIDE_COMPLETE_APPROVED",
        entityType: "Job",
        entityId: jobId,
        metadata: {
          toStatus: updatedJob.status,
          routerEarningsCents: job.routerEarningsCents,
          brokerFeeCents: job.brokerFeeCents,
          overrideReason: body.data.reason,
        } as any,
      });

      // Senior router progress (system-driven only).
      await tx
        .update(routers)
        .set({ routesCompleted: sql`${routers.routesCompleted} + 1` } as any)
        .where(and(eq(routers.userId, job.routerUserId), eq(routers.status, "ACTIVE")));

      return { kind: "ok" as const, job: updatedJob };
    });

    if (result.kind === "not_found") return fail(404, "not_found");
    if (result.kind === "mock_job") return fail(409, "mock_job_cannot_complete");
    if (result.kind === "no_router") return fail(409, "job_has_no_router");
    if (result.kind === "no_assignment") return fail(409, "job_not_assigned");
    if (result.kind === "materials_pending") return fail(409, "materials_request_pending");

    return ok({ job: result.job });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/jobs/:id/complete", { route: "/api/admin/jobs/[id]/complete", userId: auth.userId });
  }
}

