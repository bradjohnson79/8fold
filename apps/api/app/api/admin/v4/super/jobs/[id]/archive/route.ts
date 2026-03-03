import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobs } from "@/db/schema";
import { enforceTier, requireAdminIdentityWithTier } from "../../../../../_lib/adminTier";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  reason: z.string().trim().min(1).optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const identity = await requireAdminIdentityWithTier(req);
  if (identity instanceof Response) return identity;
  const forbidden = enforceTier(identity, "ADMIN_SUPER");
  if (forbidden) return forbidden;

  try {
    const { id } = await ctx.params;
    const bodyRaw = await req.json().catch(() => ({}));
    const body = BodySchema.safeParse(bodyRaw);

    const now = new Date();
    const [updated] = await db
      .update(jobs)
      .set({
        archived: true,
        archived_at: now,
        archived_by_admin_id: identity.userId,
        updated_at: now,
      } as any)
      .where(eq(jobs.id, id))
      .returning({ id: jobs.id, archived: jobs.archived, archived_at: jobs.archived_at });

    if (!updated) return err(404, "ADMIN_SUPER_JOB_NOT_FOUND", "Job not found");

    await adminAuditLog(req, { userId: identity.userId, role: "ADMIN", authSource: identity.authSource }, {
      action: "JOB_ARCHIVED",
      entityType: "Job",
      entityId: id,
      metadata: {
        archived_by_admin_id: identity.userId,
        reason: body.success ? body.data.reason : null,
      },
    });

    return ok({ archived: true });
  } catch (e) {
    console.error("[ADMIN_SUPER_JOB_ARCHIVE_ERROR]", { message: e instanceof Error ? e.message : String(e) });
    return err(500, "ADMIN_SUPER_JOB_ARCHIVE_FAILED", "Failed to archive job");
  }
}
