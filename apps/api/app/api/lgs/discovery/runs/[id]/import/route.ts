/**
 * LGS: Import discovery leads into contractor_leads.
 * POST body: { leadIds?: string[] }
 *   - If leadIds is provided and non-empty: import only those specific leads.
 *   - If leadIds is omitted or empty: import ALL pending (not yet imported) leads for this run.
 *     This acts as a recovery path when auto-import failed or the run pre-dates the threshold fix.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { discoveryRunLeads } from "@/db/schema/directoryEngine";
import { importDiscoveryLeads } from "@/src/services/lgs/domainDiscoveryService";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: runId } = await params;
    if (!runId) {
      return NextResponse.json({ ok: false, error: "run_id_required" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as { leadIds?: string[] };
    let leadIds = body.leadIds;

    // If no leadIds supplied, fetch all pending (not yet imported) leads for this run
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      const pending = await db
        .select({ id: discoveryRunLeads.id })
        .from(discoveryRunLeads)
        .where(eq(discoveryRunLeads.runId, runId));

      leadIds = pending.map((r) => r.id);

      if (leadIds.length === 0) {
        return NextResponse.json({
          ok: true,
          data: { imported: 0, duplicates: 0, message: "No pending leads found for this run." },
        });
      }
    }

    const { imported, duplicates } = await importDiscoveryLeads(runId, leadIds);

    return NextResponse.json({ ok: true, data: { imported, duplicates } });
  } catch (err) {
    console.error("LGS discovery import error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "import_failed" },
      { status: 500 }
    );
  }
}
