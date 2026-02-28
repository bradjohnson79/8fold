import { requireAdminTier } from "@/src/adminBus";
import { err, ok } from "@/src/lib/api/adminV4Response";
import { getStripeGatewayHealth } from "@/src/services/stripeGateway/stripeSyncService";
import { listReconciliation } from "@/src/services/stripeGateway/reconciliationService";

export const dynamic = "force-dynamic";

function parseDate(raw: string | null): Date | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request) {
  const authed = await requireAdminTier(req, "ADMIN_SUPER");
  if (authed instanceof Response) return authed;

  try {
    const { searchParams } = new URL(req.url);
    const from = parseDate(searchParams.get("from"));
    const to = parseDate(searchParams.get("to"));
    const status = String(searchParams.get("status") ?? "").trim().toUpperCase() || null;
    const jobId = String(searchParams.get("jobId") ?? "").trim() || null;
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.max(1, Math.min(100, Number(searchParams.get("pageSize") ?? "25") || 25));

    const [report, health] = await Promise.all([
      listReconciliation({
        from,
        to,
        status: status as any,
        jobId,
        page,
        pageSize,
      }),
      getStripeGatewayHealth(),
    ]);

    const mismatchCount = report.rows.filter((r) => r.status !== "MATCHED").length;
    return ok({
      rows: report.rows,
      totalCount: report.totalCount,
      page: report.page,
      pageSize: report.pageSize,
      mismatchCount,
      health,
    });
  } catch (error) {
    return err(500, "ADMIN_V4_STRIPE_RECON_LIST_FAILED", error instanceof Error ? error.message : "Failed to load report");
  }
}
