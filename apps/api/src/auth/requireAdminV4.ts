import { ilike } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { v4AdminUsers } from "@/db/schema/v4AdminUser";
import { requireAuth } from "@/src/auth/requireAuth";
import { getClerkIdentity } from "@/src/auth/getClerkIdentity";
import { err } from "@/src/lib/api/adminV4Response";

export type RequireAdminV4Ok = {
  adminId: string;
  email: string;
  role: string;
  sessionId: string;
};

function isAdminRole(role: string | null | undefined): boolean {
  return String(role ?? "")
    .trim()
    .toUpperCase()
    .startsWith("ADMIN");
}

export async function requireAdminV4(req: Request): Promise<RequireAdminV4Ok | Response> {
  try {
    const authed = await requireAuth(req);
    if (authed instanceof Response) return authed;

    const identity = await getClerkIdentity(authed.clerkUserId).catch(() => null);
    const email = String(identity?.email ?? "")
      .trim()
      .toLowerCase();
    if (!email) return err(401, "ADMIN_V4_UNAUTHORIZED", "Authenticated user has no primary email");

    const rows = await db
      .select({
        adminId: v4AdminUsers.id,
        email: v4AdminUsers.email,
        role: v4AdminUsers.role,
        status: v4AdminUsers.status,
      })
      .from(v4AdminUsers)
      .where(ilike(v4AdminUsers.email, email))
      .limit(1);

    const row = rows[0] ?? null;
    if (!row?.adminId) return err(403, "ADMIN_V4_FORBIDDEN", "Admin access is not provisioned for this account");
    if (String(row.status ?? "ACTIVE").toUpperCase() !== "ACTIVE") return err(403, "ADMIN_V4_FORBIDDEN", "Admin account is not active");
    if (!isAdminRole(row.role)) return err(403, "ADMIN_V4_FORBIDDEN", "Admin role required");

    return {
      adminId: String(row.adminId),
      email: String(row.email),
      role: String(row.role),
      sessionId: authed.clerkUserId,
    };
  } catch (e) {
    console.error("[ADMIN_V4_REQUIRE_GUARD_ERROR]", { message: e instanceof Error ? e.message : String(e) });
    return err(401, "ADMIN_V4_UNAUTHORIZED", "Unable to validate admin identity");
  }
}
