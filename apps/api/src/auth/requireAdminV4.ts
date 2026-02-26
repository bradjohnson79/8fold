import { and, eq, gt } from "drizzle-orm";
import { db } from "@/server/db/drizzle";
import { adminSessions } from "@/db/schema/adminSession";
import { v4AdminUsers } from "@/db/schema/v4AdminUser";
import { adminV4SessionTokenFromRequest, sessionTokenHash } from "./adminV4Session";
import { err } from "@/src/lib/api/adminV4Response";

export type RequireAdminV4Ok = {
  adminId: string;
  email: string;
  role: string;
  sessionId: string;
};

function isAdminRole(role: string | null | undefined): boolean {
  return String(role ?? "").trim().toUpperCase().startsWith("ADMIN");
}

export async function requireAdminV4(req: Request): Promise<RequireAdminV4Ok | Response> {
  try {
    const token = adminV4SessionTokenFromRequest(req);
    if (!token) return err(401, "ADMIN_V4_UNAUTHORIZED", "Missing admin session");

    const hash = sessionTokenHash(token);
    const now = new Date();

    const rows = await db
      .select({
        sessionId: adminSessions.id,
        adminId: v4AdminUsers.id,
        email: v4AdminUsers.email,
        role: v4AdminUsers.role,
        status: v4AdminUsers.status,
      })
      .from(adminSessions)
      .innerJoin(v4AdminUsers, eq(v4AdminUsers.authSubjectId, adminSessions.adminUserId))
      .where(and(eq(adminSessions.sessionTokenHash, hash), gt(adminSessions.expiresAt, now)))
      .limit(1);

    const row = rows[0] ?? null;
    if (!row?.adminId) return err(401, "ADMIN_V4_UNAUTHORIZED", "Invalid admin session");
    if (String(row.status ?? "ACTIVE").toUpperCase() !== "ACTIVE") return err(403, "ADMIN_V4_FORBIDDEN", "Admin account is not active");
    if (!isAdminRole(row.role)) return err(403, "ADMIN_V4_FORBIDDEN", "Admin role required");

    return {
      adminId: String(row.adminId),
      email: String(row.email),
      role: String(row.role),
      sessionId: String(row.sessionId),
    };
  } catch (e) {
    console.error("[ADMIN_V4_REQUIRE_GUARD_ERROR]", { message: e instanceof Error ? e.message : String(e) });
    return err(401, "ADMIN_V4_UNAUTHORIZED", "Unable to validate admin session");
  }
}
