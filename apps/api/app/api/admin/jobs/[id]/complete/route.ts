import { NextResponse } from "next/server";
import { handleApiError } from "@/src/lib/errorHandler";
import { badRequest, fail, ok } from "@/src/lib/api/respond";
import { assertJobTransition } from "../../../../../../src/jobs/jobTransitions";
import { releaseJobFunds } from "../../../../../../src/payouts/releaseJobFunds";
import { z } from "zod";
import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { auditLogs } from "../../../../../../db/schema/auditLog";
import { jobs } from "../../../../../../db/schema/job";
import { jobAssignments } from "../../../../../../db/schema/jobAssignment";
import { routers } from "../../../../../../db/schema/router";
import { readJsonBody } from "@/src/lib/api/readJsonBody";
import { enforceTier, requireAdminIdentityWithTier } from "../../../_lib/adminTier";

function getIdFromUrl(req: Request): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  // .../jobs/:id/complete
  return parts[parts.length - 2] ?? "";
}

export async function POST(req: Request) {
  const identity = await requireAdminIdentityWithTier(req);
  if (identity instanceof NextResponse) return identity;
  const forbidden = enforceTier(identity, "ADMIN_SUPER");
  if (forbidden) return forbidden;

  try {
    const jobId = getIdFromUrl(req);
    const url = new URL(req.url);
    const dryRun = String(url.searchParams.get("dryRun") ?? "").toLowerCase() === "true";

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
      const jobRows = await tx
        .select({
          id: jobs.id,
          status: jobs.status,
          isMock: jobs.isMock,
          routerUserId: jobs.claimedByUserId,
          routerEarningsCents: jobs.routerEarningsCents,
          brokerFeeCents: jobs.brokerFeeCents,
          contractorPayoutCents: jobs.contractorPayoutCents,
          amountCents: jobs.amountCents,
          paymentStatus: jobs.paymentStatus,
          payoutStatus: jobs.payoutStatus,
          fundedAt: jobs.fundedAt,
          releasedAt: jobs.releasedAt,
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
      try {
        assertJobTransition(job.status, "COMPLETED_APPROVED");
      } catch (e) {
        return { kind: "invalid_transition" as const, message: e instanceof Error ? e.message : "invalid_transition" };
      }

      const assignmentRows = await tx
        .select({ id: jobAssignments.id, status: jobAssignments.status })
        .from(jobAssignments)
        .where(eq(jobAssignments.jobId, jobId))
        .limit(1);
      const assignment = assignmentRows[0] ?? null;
      if (!assignment) return { kind: "no_assignment" as const };

      if (dryRun) {
        return {
          kind: "dry_run" as const,
          preview: {
            action: "FORCE_APPROVE",
            willMutate: false,
            willRelease: true,
            escrowAmountCents: Number(job.amountCents ?? 0),
            payoutLegs: [
              { role: "CONTRACTOR", amountCents: Number(job.contractorPayoutCents ?? 0) },
              { role: "ROUTER", amountCents: Number(job.routerEarningsCents ?? 0) },
              { role: "PLATFORM_FEE", amountCents: Number(job.brokerFeeCents ?? 0) },
            ],
            current: {
              status: String(job.status ?? ""),
              paymentStatus: String(job.paymentStatus ?? ""),
              payoutStatus: String(job.payoutStatus ?? ""),
              fundedAt: job.fundedAt ? (job.fundedAt as Date).toISOString() : null,
              releasedAt: job.releasedAt ? (job.releasedAt as Date).toISOString() : null,
            },
            notes: ["Dry run does not mutate DB or trigger Stripe/release engine."],
          },
        };
      }

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

      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorUserId: identity.userId,
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

    if (result.kind === "dry_run") return ok({ preview: (result as any).preview });
    if (result.kind === "not_found") return fail(404, "not_found");
    if (result.kind === "mock_job") return fail(409, "mock_job_cannot_complete");
    if (result.kind === "no_router") return fail(409, "job_has_no_router");
    if (result.kind === "no_assignment") return fail(409, "job_not_assigned");
    if (result.kind === "materials_pending") return fail(409, "materials_request_pending");
    if (result.kind === "invalid_transition") return fail(409, (result as any).message ?? "invalid_transition");

    // Release funds (best-effort; completion approval is authoritative even if payout fails).
    try {
      await releaseJobFunds({ jobId: String((result as any).job?.id ?? jobId), triggeredByUserId: identity.userId });
    } catch {
      // Failure is reflected via TransferRecord + Job.payoutStatus.
    }

    return ok({ job: result.job });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/jobs/:id/complete", {
      route: "/api/admin/jobs/[id]/complete",
      userId: identity.userId,
    });
  }
}

