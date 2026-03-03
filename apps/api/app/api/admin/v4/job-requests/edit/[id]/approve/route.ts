import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobs, jobEditRequests } from "@/db/schema";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const { id } = await ctx.params;
    const [reqRow] = await db
      .select()
      .from(jobEditRequests)
      .where(eq(jobEditRequests.id, id))
      .limit(1);
    if (!reqRow || reqRow.status !== "pending") {
      return err(404, "ADMIN_V4_EDIT_REQUEST_NOT_FOUND", "Edit request not found or already processed");
    }

    const [jobRow] = await db
      .select({ id: jobs.id, contractorUserId: jobs.contractor_user_id })
      .from(jobs)
      .where(eq(jobs.id, reqRow.jobId))
      .limit(1);
    if (!jobRow) return err(404, "ADMIN_V4_JOB_NOT_FOUND", "Job not found");
    if (jobRow.contractorUserId != null) {
      return err(409, "ADMIN_V4_EDIT_JOB_ASSIGNED", "Job cannot be edited once a contractor has been assigned.");
    }

    const now = new Date();
    await db
      .update(jobs)
      .set({
        title: reqRow.requestedTitle,
        scope: reqRow.requestedDescription,
        updated_at: now,
      } as any)
      .where(eq(jobs.id, reqRow.jobId));

    await db
      .update(jobEditRequests)
      .set({
        status: "approved",
        reviewedAt: now,
        reviewedByAdminId: authed.adminId,
      })
      .where(eq(jobEditRequests.id, id));

    await adminAuditLog(
      req,
      { userId: authed.adminId, role: authed.role, authSource: "admin_session" as const },
      {
        action: "JOB_EDIT_REQUEST_APPROVED",
        entityType: "JobEditRequest",
        entityId: id,
        metadata: {
          jobId: reqRow.jobId,
          requestedTitle: reqRow.requestedTitle,
          requestedDescription: reqRow.requestedDescription,
        },
      },
    );

    return ok({ approved: true });
  } catch (e) {
    console.error("[ADMIN_V4_EDIT_APPROVE_ERROR]", { message: e instanceof Error ? e.message : String(e) });
    return err(500, "ADMIN_V4_EDIT_APPROVE_FAILED", "Failed to approve edit request");
  }
}
