import { z } from "zod";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { requireAdminTier, userLifecycleRepo } from "@/src/adminBus";
import { adminAuditLog } from "@/src/audit/adminAudit";

export const dynamic = "force-dynamic";

const VALID_ACTIONS = [
  "suspend_1w",
  "suspend_1m",
  "suspend_3m",
  "suspend_6m",
  "archive",
  "delete",
] as const;

const BodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
  action: z.enum(VALID_ACTIONS),
  reason: z.string().trim().min(1).optional(),
});

const DESTRUCTIVE_ACTIONS = new Set(["delete"]);

const ACTION_MONTHS: Record<string, number> = {
  suspend_1m: 1,
  suspend_3m: 3,
  suspend_6m: 6,
};

const ACTION_LABELS: Record<string, string> = {
  suspend_1w: "USER_BULK_SUSPENDED",
  suspend_1m: "USER_BULK_SUSPENDED",
  suspend_3m: "USER_BULK_SUSPENDED",
  suspend_6m: "USER_BULK_SUSPENDED",
  archive: "USER_BULK_ARCHIVED",
  delete: "USER_BULK_DELETED",
};

export async function POST(req: Request) {
  const authed = await requireAdminTier(req, "ADMIN_OPERATOR");
  if (authed instanceof Response) return authed;

  try {
    const payload = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(payload);
    if (!parsed.success) {
      return err(400, "ADMIN_V4_BULK_ACTION_INVALID", "Invalid body: ids (1-50) and action are required");
    }

    const { ids, action, reason: rawReason } = parsed.data;
    const reason = rawReason || "Admin panel";

    if (DESTRUCTIVE_ACTIONS.has(action) && authed.tier !== "ADMIN_SUPER") {
      return err(403, "ADMIN_V4_FORBIDDEN", "Delete action requires ADMIN_SUPER tier");
    }

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const userId of ids) {
      try {
        let result: { ok: boolean; status?: number; code?: string; message?: string; data?: any };

        if (action === "suspend_1w") {
          result = await userLifecycleRepo.suspendManagedUserByDays({
            userId,
            adminId: authed.adminId,
            days: 7,
            reason,
          });
        } else if (action in ACTION_MONTHS) {
          result = await userLifecycleRepo.suspendManagedUser({
            userId,
            adminId: authed.adminId,
            months: ACTION_MONTHS[action],
            reason,
          });
        } else if (action === "archive") {
          result = await userLifecycleRepo.archiveManagedUser({
            userId,
            adminId: authed.adminId,
            reason,
          });
        } else {
          result = await userLifecycleRepo.softDeleteManagedUser({
            userId,
            adminId: authed.adminId,
            reason,
          });
        }

        if (result.ok) {
          results.push({ id: userId, ok: true });
          await adminAuditLog(req, authed as any, {
            action: ACTION_LABELS[action] ?? "USER_BULK_ACTION",
            entityType: "User",
            entityId: userId,
            metadata: { bulkAction: action, reason, affectedIds: ids },
          });
        } else {
          results.push({
            id: userId,
            ok: false,
            error: (result as any).message ?? "Unknown error",
          });
        }
      } catch (e) {
        results.push({
          id: userId,
          ok: false,
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    const success = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    return ok({ success, failed, results });
  } catch (error) {
    console.error("[ADMIN_V4_BULK_ACTION_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_BULK_ACTION_FAILED", "Failed to execute bulk action");
  }
}
