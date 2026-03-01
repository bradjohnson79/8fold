import { requireAdminTier } from "@/src/adminBus";
import { err, ok } from "@/src/lib/api/adminV4Response";
import {
  listFinancialIntegrityAlerts,
  runFinancialIntegrityCheck,
} from "@/src/services/financialIntegrity/alertEngine";

export const dynamic = "force-dynamic";

function normalize(value: string | null): string | null {
  const text = String(value ?? "").trim().toUpperCase();
  return text || null;
}

export async function GET(req: Request) {
  const authed = await requireAdminTier(req, "ADMIN_OPERATOR");
  if (authed instanceof Response) return authed;

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.max(1, Math.min(100, Number(searchParams.get("pageSize") ?? "25") || 25));
    const status = normalize(searchParams.get("status"));
    const severity = normalize(searchParams.get("severity"));
    const alertType = normalize(searchParams.get("alertType"));
    const jobId = String(searchParams.get("jobId") ?? "").trim() || null;

    const data = await listFinancialIntegrityAlerts({
      page,
      pageSize,
      status: status as any,
      severity: severity as any,
      alertType: alertType as any,
      jobId,
    });
    return ok(data);
  } catch (error) {
    return err(500, "ADMIN_V4_FINANCIAL_INTEGRITY_LIST_FAILED", error instanceof Error ? error.message : "Failed to load alerts");
  }
}

export async function POST(req: Request) {
  const authed = await requireAdminTier(req, "ADMIN_SUPER");
  if (authed instanceof Response) return authed;

  try {
    const body = await req.json().catch(() => ({}));
    const maxJobs = Math.max(1, Math.min(100, Number(body?.maxJobs ?? 100) || 100));
    const data = await runFinancialIntegrityCheck({
      maxJobs,
      windowHours: 72,
      timeoutMs: 10_000,
      triggeredBy: authed.email,
    });
    return ok(data);
  } catch (error) {
    return err(500, "ADMIN_V4_FINANCIAL_INTEGRITY_RUN_FAILED", error instanceof Error ? error.message : "Failed to run integrity");
  }
}
