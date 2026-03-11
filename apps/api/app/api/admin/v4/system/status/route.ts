import { requireAdminV4 } from "@/src/auth/requireAdminV4";
import { ok, err } from "@/src/lib/api/adminV4Response";
import { getSystemHealth } from "@/src/services/systemHealthService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authed = await requireAdminV4(req);
  if (authed instanceof Response) return authed;

  try {
    const data = await getSystemHealth();
    return ok(data);
  } catch (e) {
    console.error("[SYSTEM_STATUS]", e);
    return err(500, "ADMIN_V4_STATUS_FAILED", "Failed to retrieve system status");
  }
}
