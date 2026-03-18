/**
 * LGS: Trigger lead rescoring.
 *
 * POST body: { mode?: 'dirty' | 'all' }
 *   - dirty (default): only rescores leads with score_dirty = true (safe for cron)
 *   - all: brute-force rescore all leads (admin-only, expensive)
 *
 * Returns: { ok: true, updated: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { rescoreDirtyLeads, rescoreAllLeads } from "@/src/services/lgs/lgsLeadScoringService";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { mode?: string };
    const mode = body.mode === "all" ? "all" : "dirty";

    const updated = mode === "all"
      ? await rescoreAllLeads()
      : await rescoreDirtyLeads(500);

    return NextResponse.json({ ok: true, mode, updated });
  } catch (err) {
    console.error("LGS rescore error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
