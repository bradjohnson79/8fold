/**
 * LGS: Deduplicate contractor leads by email (case-insensitive).
 *
 * POST /api/lgs/leads/deduplicate
 * Body: { lead_ids?: string[], preview?: boolean }
 *
 * When preview=true returns counts without deleting.
 * When preview=false (default) performs deletion and returns results.
 *
 * Priority: keeps the "best" record per email:
 *   1. contact_status = converted (signed_up = true)
 *   2. contact_status = replied   (response_received = true)
 *   3. contact_status = sent      (contact_attempts > 0)
 *   4. message_status = approved  (has an approved outreach message)
 *   5. highest verification_score
 *   6. earliest lead_number (first inserted)
 */
import { NextResponse } from "next/server";
import { sql, inArray } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { contractorLeads, outreachMessages } from "@/db/schema/directoryEngine";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      lead_ids?: string[];
      preview?: boolean;
    };

    const leadIds = Array.isArray(body.lead_ids) && body.lead_ids.length > 0 ? body.lead_ids : null;
    const preview = body.preview === true;

    // ──────────────────────────────────────────────────────────────
    // Step 1: find which IDs are duplicates (rank > 1)
    // We rank within each LOWER(email) group by priority rules.
    // ──────────────────────────────────────────────────────────────

    // Build optional scope filter
    const scopeClause = leadIds
      ? sql`AND cl.id = ANY(ARRAY[${sql.raw(leadIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(","))}]::uuid[])`
      : sql``;

    const duplicateRows = await db.execute<{ id: string; email: string; lead_number: number | null; rank: number }>(sql`
      WITH approved_leads AS (
        SELECT DISTINCT lead_id
        FROM directory_engine.outreach_messages
        WHERE status = 'approved'
      ),
      ranked AS (
        SELECT
          cl.id,
          cl.email,
          cl.lead_number,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(cl.email)
            ORDER BY
              -- 1. converted
              CASE WHEN cl.signed_up = true THEN 1 ELSE 5 END ASC,
              -- 2. replied
              CASE WHEN cl.response_received = true THEN 2 ELSE 5 END ASC,
              -- 3. sent
              CASE WHEN cl.contact_attempts > 0 THEN 3 ELSE 5 END ASC,
              -- 4. has approved message
              CASE WHEN al.lead_id IS NOT NULL THEN 4 ELSE 5 END ASC,
              -- 5. highest verification score
              COALESCE(cl.verification_score, 0) DESC,
              -- 6. earliest lead_number
              COALESCE(cl.lead_number, 2147483647) ASC,
              -- 7. earliest created_at as final tiebreaker
              cl.created_at ASC
          ) AS rank
        FROM directory_engine.contractor_leads cl
        LEFT JOIN approved_leads al ON al.lead_id = cl.id
        WHERE 1=1 ${scopeClause}
      )
      SELECT id, email, lead_number, rank FROM ranked
    `);

    const allRows = duplicateRows.rows ?? (duplicateRows as unknown as { id: string; email: string; lead_number: number | null; rank: number }[]);
    const toDelete = allRows.filter((r) => Number(r.rank) > 1);
    const toKeep = allRows.filter((r) => Number(r.rank) === 1);

    // Count unique emails that have at least one duplicate
    const emailsWithDuplicates = new Set(toDelete.map((r) => r.email.toLowerCase())).size;

    if (preview) {
      return NextResponse.json({
        ok: true,
        data: {
          duplicates_found: emailsWithDuplicates,
          records_to_remove: toDelete.length,
          records_to_keep: toKeep.length,
          preview: true,
        },
      });
    }

    // ──────────────────────────────────────────────────────────────
    // Step 2: Delete duplicates (if any)
    // ──────────────────────────────────────────────────────────────
    let recordsRemoved = 0;

    if (toDelete.length > 0) {
      const idsToDelete = toDelete.map((r) => r.id);

      // Delete outreach messages for these leads first (FK constraint)
      await db.delete(outreachMessages).where(inArray(outreachMessages.leadId, idsToDelete));

      // Delete duplicate lead records
      await db.delete(contractorLeads).where(inArray(contractorLeads.id, idsToDelete));

      recordsRemoved = idsToDelete.length;
    }

    // Count remaining leads
    const [countResult] = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text AS count FROM directory_engine.contractor_leads
    `);
    const recordsRemaining = parseInt((countResult as { count: string }).count ?? "0", 10);

    return NextResponse.json({
      ok: true,
      data: {
        duplicates_found: emailsWithDuplicates,
        records_removed: recordsRemoved,
        records_remaining: recordsRemaining,
      },
    });
  } catch (err) {
    console.error("LGS deduplicate error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "deduplicate_failed" },
      { status: 500 }
    );
  }
}
