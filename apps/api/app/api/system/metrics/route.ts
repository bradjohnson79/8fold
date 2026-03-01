import { NextResponse } from "next/server";
import { snapshotCounters } from "../../../../src/server/observability/metrics";
import { getFinancialIntegrityMetricsSnapshot } from "@/src/services/financialIntegrity/alertEngine";

export async function GET() {
  // Dev-first endpoint. In production, wire this behind an internal auth boundary.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }
  const financialIntegrity = await getFinancialIntegrityMetricsSnapshot();
  return NextResponse.json(
    {
      ok: true,
      counters: snapshotCounters(),
      metrics: {
        "financialIntegrity.open": financialIntegrity.open,
        "financialIntegrity.critical": financialIntegrity.critical,
        "financialIntegrity.lastRunMs": financialIntegrity.lastRunMs,
        "financialIntegrity.totalAlertsCreated": financialIntegrity.totalAlertsCreated,
      },
      financialIntegrity,
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}
