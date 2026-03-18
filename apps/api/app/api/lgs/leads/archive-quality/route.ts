/**
 * LGS: Archive all leads with verification_score < 85.
 * POST /api/lgs/leads/archive-quality
 *
 * One-click bulk archive for the quality-control pipeline.
 */
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/drizzle";

export async function POST() {
  try {
    const result = await db.execute(sql`
      UPDATE directory_engine.contractor_leads
      SET archived = true, archived_at = NOW()
      WHERE (verification_score < 85 OR verification_score IS NULL)
        AND archived = false
      RETURNING id
    `);

    const count = (result.rows ?? result as unknown as unknown[]).length;

    return NextResponse.json({ ok: true, data: { archived: count } });
  } catch (err) {
    console.error("LGS archive-quality error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
