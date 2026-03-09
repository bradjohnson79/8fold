import { eq, isNull } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { admins } from "@/db/schema/admin";
import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

function isSuperAdmin(role: string) {
  return String(role).toUpperCase() === "SUPER_ADMIN";
}

/** PATCH: suspend or activate an admin */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  if (!isSuperAdmin(authed.role)) {
    return err(403, "FORBIDDEN", "Only SUPER_ADMIN can modify admin users");
  }

  const { id } = await ctx.params;

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    return err(400, "INVALID_JSON", "Invalid request body");
  }

  const action = String(body.action ?? "").toUpperCase();
  if (!["SUSPEND", "ACTIVATE"].includes(action)) {
    return err(400, "INVALID_ACTION", "action must be SUSPEND or ACTIVATE");
  }

  if (action === "SUSPEND" && id === authed.adminId) {
    return err(400, "SELF_SUSPEND", "You cannot suspend your own account");
  }

  const rows = await db
    .select({ id: admins.id, role: admins.role, disabledAt: admins.disabledAt })
    .from(admins)
    .where(eq(admins.id, id))
    .limit(1);

  const target = rows[0];
  if (!target) return err(404, "NOT_FOUND", "Admin user not found");

  try {
    await db
      .update(admins)
      .set({ disabledAt: action === "SUSPEND" ? new Date() : null } as any)
      .where(eq(admins.id, id));

    return ok({ id, status: action === "SUSPEND" ? "SUSPENDED" : "ACTIVE" });
  } catch (e) {
    console.error("[ADMIN_USERS_UPDATE_ERROR]", { id, action, err: String(e) });
    return err(500, "ADMIN_USERS_UPDATE_FAILED", "Failed to update admin user");
  }
}

/** DELETE: remove an admin account (SUPER_ADMIN only) */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  if (!isSuperAdmin(authed.role)) {
    return err(403, "FORBIDDEN", "Only SUPER_ADMIN can delete admin users");
  }

  const { id } = await ctx.params;

  if (id === authed.adminId) {
    return err(400, "SELF_DELETE", "You cannot delete your own account");
  }

  const rows = await db
    .select({ id: admins.id, role: admins.role })
    .from(admins)
    .where(eq(admins.id, id))
    .limit(1);

  const target = rows[0];
  if (!target) return err(404, "NOT_FOUND", "Admin user not found");

  // Guard: cannot remove the last SUPER_ADMIN
  if (isSuperAdmin(target.role)) {
    const superAdmins = await db
      .select({ id: admins.id })
      .from(admins)
      .where(isNull(admins.disabledAt));
    const superCount = superAdmins.filter((r) => isSuperAdmin("SUPER_ADMIN")).length;
    if (superCount <= 1) {
      return err(400, "LAST_SUPER_ADMIN", "Cannot delete the last SUPER_ADMIN");
    }
  }

  try {
    await db.delete(admins).where(eq(admins.id, id));
    return ok({ id, deleted: true });
  } catch (e) {
    console.error("[ADMIN_USERS_DELETE_ERROR]", { id, err: String(e) });
    return err(500, "ADMIN_USERS_DELETE_FAILED", "Failed to delete admin user");
  }
}
