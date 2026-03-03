import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobEditRequests } from "@/db/schema";
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

    const now = new Date();
    await db
      .update(jobEditRequests)
      .set({
        status: "rejected",
        reviewedAt: now,
        reviewedByAdminId: authed.adminId,
      })
      .where(eq(jobEditRequests.id, id));

    await adminAuditLog(
      req,
      { userId: authed.adminId, role: "ADMIN", authSource: "admin_session" as const },
      {
        action: "JOB_EDIT_REQUEST_REJECTED",
        entityType: "JobEditRequest",
        entityId: id,
        metadata: { jobId: reqRow.jobId },
      },
    );

    return ok({ rejected: true });
  } catch (e) {
    console.error("[ADMIN_V4_EDIT_REJECT_ERROR]", { message: e instanceof Error ? e.message : String(e) });
    return err(500, "ADMIN_V4_EDIT_REJECT_FAILED", "Failed to reject edit request");
  }
}
