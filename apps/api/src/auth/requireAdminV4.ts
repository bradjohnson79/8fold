import { err } from "@/src/lib/api/adminV4Response";
import { authenticateAdminRequest } from "@/src/lib/auth/adminSessionAuth";

export type RequireAdminV4Ok = {
  adminId: string;
  email: string;
  role: string;
  sessionId: string;
};

export async function requireAdminV4(req: Request): Promise<RequireAdminV4Ok | Response> {
  try {
    const admin = await authenticateAdminRequest(req);
    if (admin instanceof Response) return admin;

    return {
      adminId: admin.adminId,
      email: admin.email,
      role: admin.role,
      sessionId: admin.adminId,
    };
  } catch (e) {
    console.error("[ADMIN_V4_REQUIRE_GUARD_ERROR]", { message: e instanceof Error ? e.message : String(e) });
    return err(401, "ADMIN_V4_UNAUTHORIZED", "Unable to validate admin identity");
  }
}
