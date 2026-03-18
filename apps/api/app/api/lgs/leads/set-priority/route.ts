/**
 * LGS Brain: Bulk set lead priority (marks as manual).
 * POST body: { lead_ids: string[], priority: 'high' | 'medium' | 'low' }
 */
import { NextRequest, NextResponse } from "next/server";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads } from "@/db/schema/directoryEngine";

const VALID_PRIORITIES = ["high", "medium", "low"];

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { lead_ids?: string[]; priority?: string };
    const { lead_ids, priority } = body;

    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return NextResponse.json({ ok: false, error: "lead_ids_required" }, { status: 400 });
    }
    if (!priority || !VALID_PRIORITIES.includes(priority)) {
      return NextResponse.json({ ok: false, error: "invalid_priority" }, { status: 400 });
    }

    const updated = await db
      .update(contractorLeads)
      .set({
        leadPriority: priority,
        prioritySource: "manual",
        updatedAt: new Date(),
      })
      .where(inArray(contractorLeads.id, lead_ids));

    return NextResponse.json({ ok: true, data: { updated: lead_ids.length } });
  } catch (err) {
    console.error("LGS set-priority error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
