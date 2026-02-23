import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/lib/auth/requireAdmin";
import { handleApiError } from "@/src/lib/errorHandler";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "../../../../../../db/drizzle";
import { users } from "../../../../../../db/schema/user";
import { jobs } from "../../../../../../db/schema/job";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { readJsonBody } from "@/src/lib/api/readJsonBody";
import { logEvent } from "@/src/server/observability/log";

const ACTIVE_JOB_STATUSES = [
  "PUBLISHED",
  "ASSIGNED",
  "IN_PROGRESS",
  "CONTRACTOR_COMPLETED",
  "CUSTOMER_APPROVED",
  "CUSTOMER_REJECTED",
  "COMPLETION_FLAGGED",
  "OPEN_FOR_ROUTING",
] as const;

const BodySchema = z.object({
  reason: z.string().trim().min(1),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;
    const j = await readJsonBody(req);
    if (!j.ok) return j.resp;
    const body = BodySchema.safeParse(j.json);
    if (!body.success) {
      return NextResponse.json({ ok: false, error: "Invalid body: reason required" }, { status: 400 });
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (!existing[0]) {
      return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
    }

    const activeJobs = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          inArray(jobs.status, ACTIVE_JOB_STATUSES as any),
          or(eq(jobs.job_poster_user_id, id), eq(jobs.contractor_user_id, id))
        )
      )
      .limit(1);

    if (activeJobs.length > 0) {
      return NextResponse.json({ ok: false, error: "user_has_active_jobs" }, { status: 400 });
    }

    const now = new Date();
    await db
      .update(users)
      .set({
        status: "ARCHIVED",
        archivedAt: now,
        archivedReason: body.data.reason,
        suspendedUntil: null,
        suspensionReason: null,
        updatedByAdminId: auth.userId,
        updatedAt: now,
      })
      .where(eq(users.id, id));

    await adminAuditLog(req, auth, {
      action: "ADMIN_USER_ARCHIVE",
      entityType: "User",
      entityId: id,
      metadata: { reason: body.data.reason },
    });

    logEvent({
      level: "info",
      event: "admin.user_action",
      route: "/api/admin/users/[id]/archive",
      method: "POST",
      status: 200,
      userId: auth.userId,
      code: "ADMIN_USER_ARCHIVE",
      context: { targetUserId: id },
    });

    return NextResponse.json({ ok: true, data: {} });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/users/[id]/archive", { userId: auth.userId });
  }
}
