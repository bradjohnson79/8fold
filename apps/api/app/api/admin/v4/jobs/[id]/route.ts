import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/drizzle";
import { auditLogs, jobs, jobStatusEnum } from "@/db/schema";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { getAdminJobDetail } from "@/src/services/adminV4/jobsReadService";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const { id } = await ctx.params;
    const data = await getAdminJobDetail(id);
    if (!data) return err(404, "ADMIN_V4_JOB_NOT_FOUND", "Job not found");
    return ok({ ...data, statusOptions: jobStatusEnum.enumValues });
  } catch (error) {
    console.error("[ADMIN_V4_JOB_DETAIL_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_JOB_DETAIL_FAILED", "Failed to load job detail");
  }
}

const UpdateStatusSchema = z.object({
  status: z
    .string()
    .trim()
    .min(1)
    .transform((v) => v.toUpperCase()),
  note: z.string().trim().max(500).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const bodyRaw = await req.json().catch(() => null);
    const body = UpdateStatusSchema.safeParse(bodyRaw);
    if (!body.success) {
      return err(400, "ADMIN_V4_INVALID_STATUS_UPDATE", "Invalid status update payload");
    }

    const allowedStatuses = new Set(jobStatusEnum.enumValues);
    const nextStatus = body.data.status;
    const note = body.data.note || null;
    if (!allowedStatuses.has(nextStatus as any)) {
      return err(400, "ADMIN_V4_INVALID_JOB_STATUS", `Unsupported job status: ${nextStatus}`);
    }

    const { id } = await ctx.params;
    const now = new Date();

    const updateResult = await db.transaction(async (tx) => {
      const currentRows = await tx
        .select({
          id: jobs.id,
          status: jobs.status,
          customerApprovedAt: jobs.customer_approved_at,
          customerRejectedAt: jobs.customer_rejected_at,
          contractorCompletedAt: jobs.contractor_completed_at,
          completionFlaggedAt: jobs.completion_flagged_at,
          routerApprovedAt: jobs.router_approved_at,
        })
        .from(jobs)
        .where(eq(jobs.id, id))
        .limit(1);

      const current = currentRows[0] ?? null;
      if (!current) return { kind: "not_found" as const };

      const previousStatus = String(current.status ?? "");
      if (previousStatus === nextStatus) {
        return { kind: "noop" as const, previousStatus, nextStatus };
      }

      const setValues: Record<string, unknown> = {
        status: nextStatus,
        updated_at: now,
      };

      if (nextStatus === "CONTRACTOR_COMPLETED" && !current.contractorCompletedAt) {
        setValues.contractor_completed_at = now;
      }
      if (nextStatus === "CUSTOMER_APPROVED" && !current.customerApprovedAt) {
        setValues.customer_approved_at = now;
      }
      if (nextStatus === "CUSTOMER_REJECTED" && !current.customerRejectedAt) {
        setValues.customer_rejected_at = now;
      }
      if (nextStatus === "COMPLETION_FLAGGED" && !current.completionFlaggedAt) {
        setValues.completion_flagged_at = now;
      }
      if (nextStatus === "COMPLETED_APPROVED" && !current.routerApprovedAt) {
        setValues.router_approved_at = now;
      }

      await tx
        .update(jobs)
        .set(setValues as any)
        .where(eq(jobs.id, id));

      // Status mutation must not fail if audit schema drifts in production.
      try {
        await tx.insert(auditLogs).values({
          id: randomUUID(),
          actorUserId: authed.adminId,
          action: "ADMIN_V4_JOB_STATUS_SET",
          entityType: "Job",
          entityId: id,
          metadata: {
            fromStatus: previousStatus,
            toStatus: nextStatus,
            note,
            adminEmail: authed.email,
            adminRole: authed.role,
            adminId: authed.adminId,
          } as any,
        });
      } catch (auditErr) {
        console.error("[ADMIN_V4_JOB_STATUS_AUDIT_WRITE_ERROR]", {
          jobId: id,
          fromStatus: previousStatus,
          toStatus: nextStatus,
          message: auditErr instanceof Error ? auditErr.message : String(auditErr),
        });
      }

      return { kind: "updated" as const, previousStatus, nextStatus };
    });

    if (updateResult.kind === "not_found") {
      return err(404, "ADMIN_V4_JOB_NOT_FOUND", "Job not found");
    }

    const refreshed = await getAdminJobDetail(id);
    if (!refreshed) {
      return err(404, "ADMIN_V4_JOB_NOT_FOUND", "Job not found after status update");
    }

    return ok({
      ...refreshed,
      statusOptions: jobStatusEnum.enumValues,
      mutation: updateResult,
    });
  } catch (error) {
    console.error("[ADMIN_V4_JOB_STATUS_UPDATE_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_JOB_STATUS_UPDATE_FAILED", "Failed to update job status");
  }
}
