import { getRoleDistribution, requireAdmin } from "@/src/adminBus";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authed = await requireAdmin(req);
  if (authed instanceof Response) return authed;

  try {
    const roles = await getRoleDistribution();
    return ok({ roles });
  } catch (error) {
    console.error("[ADMIN_V4_DIAG_ROLES_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_DIAG_ROLES_FAILED", "Failed to load role diagnostics");
  }
}
