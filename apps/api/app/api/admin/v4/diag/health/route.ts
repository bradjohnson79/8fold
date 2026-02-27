import { getCoreTableCounts, getDbIdentity, requireAdmin } from "@/src/adminBus";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authed = await requireAdmin(req);
  if (authed instanceof Response) return authed;

  try {
    const [dbIdentity, coreTables] = await Promise.all([getDbIdentity(), getCoreTableCounts()]);
    return ok({ dbIdentity, coreTables, healthy: true });
  } catch (error) {
    console.error("[ADMIN_V4_DIAG_HEALTH_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_DIAG_HEALTH_FAILED", "Failed to load health diagnostics");
  }
}
