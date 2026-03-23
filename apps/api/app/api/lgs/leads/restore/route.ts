/**
 * LGS: Restore archived leads by ID.
 * POST /api/lgs/leads/restore
 * Body: { lead_ids: string[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads } from "@/db/schema/directoryEngine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { lead_ids?: string[] };
    const leadIds = Array.isArray(body.lead_ids) ? body.lead_ids.filter(Boolean) : [];

    if (leadIds.length === 0) {
      return NextResponse.json({ ok: false, error: "lead_ids required" }, { status: 400 });
    }

    await db
      .update(contractorLeads)
      .set({ archived: false, archivedAt: null, status: "active" })
      .where(inArray(contractorLeads.id, leadIds));

    return NextResponse.json({ ok: true, data: { restored: leadIds.length } });
  } catch (err) {
    console.error("LGS restore leads error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
