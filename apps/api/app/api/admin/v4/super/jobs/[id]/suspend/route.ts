import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { jobs } from "@/db/schema";
import { enforceTier, requireAdminIdentityWithTier } from "../../../../../_lib/adminTier";
import { adminAuditLog } from "@/src/audit/adminAudit";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { getSuspensionEnd, type SuspensionDuration } from "@/src/utils/suspensionDuration";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  duration: z.enum(["1w", "1m", "3m", "6m"]),
  reason: z.string().trim().min(1),
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
    const bodyRaw = await req.json().catch(() => null);
    const body = BodySchema.safeParse(bodyRaw);
    if (!body.success) return err(400, "ADMIN_SUPER_JOB_SUSPEND_INVALID", "duration and reason required");

    const suspendedUntil = getSuspensionEnd(body.data.duration as SuspensionDuration);
    const now = new Date();

    const [updated] = await db
      .update(jobs)
      .set({
        suspended_until: suspendedUntil,
        suspension_reason: body.data.reason,
        updated_at: now,
      } as any)
      .where(eq(jobs.id, id))
      .returning({ id: jobs.id, suspended_until: jobs.suspended_until });

    if (!updated) return err(404, "ADMIN_SUPER_JOB_NOT_FOUND", "Job not found");

    await adminAuditLog(req, { userId: identity.userId, role: "ADMIN", authSource: identity.authSource }, {
      action: "JOB_SUSPENDED",
      entityType: "Job",
      entityId: id,
      metadata: {
        duration: body.data.duration,
        reason: body.data.reason,
        suspended_until: suspendedUntil.toISOString(),
      },
    });

    return ok({ suspendedUntil: suspendedUntil.toISOString() });
  } catch (e) {
    console.error("[ADMIN_SUPER_JOB_SUSPEND_ERROR]", { message: e instanceof Error ? e.message : String(e) });
    return err(500, "ADMIN_SUPER_JOB_SUSPEND_FAILED", "Failed to suspend job");
  }
}
