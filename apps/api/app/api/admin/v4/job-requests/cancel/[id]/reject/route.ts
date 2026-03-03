import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobs, jobCancelRequests } from "@/db/schema";
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
      .from(jobCancelRequests)
      .where(eq(jobCancelRequests.id, id))
      .limit(1);
    if (!reqRow || reqRow.status !== "pending") {
      return err(404, "ADMIN_V4_CANCEL_REQUEST_NOT_FOUND", "Cancel request not found or already processed");
    }

    const now = new Date();
    await db
      .update(jobs)
      .set({ cancel_request_pending: false, updated_at: now } as any)
      .where(eq(jobs.id, reqRow.jobId));

    await db
      .update(jobCancelRequests)
      .set({
        status: "rejected",
        reviewedAt: now,
        reviewedByAdminId: authed.adminId,
      })
      .where(eq(jobCancelRequests.id, id));

    await adminAuditLog(
      req,
      { userId: authed.adminId, role: authed.role, authSource: "admin_session" as const },
      {
        action: "JOB_CANCEL_REQUEST_REJECTED",
        entityType: "JobCancelRequest",
        entityId: id,
        metadata: { jobId: reqRow.jobId },
      },
    );

    return ok({ rejected: true });
  } catch (e) {
    console.error("[ADMIN_V4_CANCEL_REJECT_ERROR]", { message: e instanceof Error ? e.message : String(e) });
    return err(500, "ADMIN_V4_CANCEL_REJECT_FAILED", "Failed to reject cancel request");
  }
}
