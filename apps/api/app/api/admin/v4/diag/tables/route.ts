import { listSafeTablesWithCounts, requireAdmin } from "@/src/adminBus";
import { err, ok } from "@/src/lib/api/adminV4Response";

export const dynamic = "force-dynamic";

const SAFE_TABLES = [
  "User",
  "jobs",
  "job_posters",
  "contractor_accounts",
  "routers",
  "v4_contractor_job_invites",
  "Contractor",
  "PayoutMethod",
] as const;

export async function GET(req: Request) {
  const authed = await requireAdmin(req);
  if (authed instanceof Response) return authed;

  try {
    const tables = await listSafeTablesWithCounts([...SAFE_TABLES]);
    return ok({ tables });
  } catch (error) {
    console.error("[ADMIN_V4_DIAG_TABLES_ERROR]", {
      message: error instanceof Error ? error.message : String(error),
    });
    return err(500, "ADMIN_V4_DIAG_TABLES_FAILED", "Failed to load table diagnostics");
  }
}
