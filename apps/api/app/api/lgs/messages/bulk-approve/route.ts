/**
 * LGS: Bulk approve outreach messages.
 * Accepts { lead_ids: string[] } — approves the latest pending_review message per lead.
 * Accepts { message_ids: string[] } — approves messages directly by id.
 */
import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { outreachMessages } from "@/db/schema/directoryEngine";
import { approveContractorMessage } from "@/src/services/lgs/outreachAutomationService";

async function approveMessage(messageId: string): Promise<{ ok: boolean; error?: string }> {
  const result = await approveContractorMessage(messageId);
  return result.ok ? { ok: true } : { ok: false, error: result.error === "message_not_found" ? "not_found" : result.error };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      message_ids?: string[];
      lead_ids?: string[];
    };

    let messageIds: string[] = [];

    if (Array.isArray(body.message_ids) && body.message_ids.length > 0) {
      messageIds = body.message_ids.filter(Boolean);
    } else if (Array.isArray(body.lead_ids) && body.lead_ids.length > 0) {
      // Resolve latest pending_review message per lead using DISTINCT ON
      const leadIds = body.lead_ids.filter(Boolean);
      const rows = await db
        .select({
          id: outreachMessages.id,
          leadId: outreachMessages.leadId,
        })
        .from(outreachMessages)
        .where(
          and(
            inArray(outreachMessages.leadId, leadIds),
            eq(outreachMessages.status, "pending_review")
          )
        )
        .orderBy(desc(outreachMessages.createdAt));

      // Keep only the latest per lead
      const seenLeads = new Set<string>();
      for (const row of rows) {
        if (!seenLeads.has(row.leadId)) {
          seenLeads.add(row.leadId);
          messageIds.push(row.id);
        }
      }
    }

    if (messageIds.length === 0) {
      return NextResponse.json({ ok: false, error: "no_messages_to_approve" }, { status: 400 });
    }

    let approved = 0;
    let failed = 0;
    const results: Array<{ message_id: string; ok: boolean; error?: string }> = [];

    for (const messageId of messageIds) {
      const r = await approveMessage(messageId);
      results.push({ message_id: messageId, ...r });
      if (r.ok) approved++;
      else failed++;
    }

    return NextResponse.json({ ok: true, data: { approved, failed, results } });
  } catch (err) {
    console.error("LGS messages bulk-approve error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "bulk_approve_failed" },
      { status: 500 }
    );
  }
}
