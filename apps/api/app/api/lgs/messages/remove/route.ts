/**
 * LGS: Remove outreach messages for given lead(s).
 *
 * POST /api/lgs/messages/remove
 * Body: { lead_ids: string[] }
 *
 * Deletes from outreach_queue then outreach_messages so the lead reverts
 * to message_status = "none" and can be regenerated cleanly.
 */
import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { outreachMessages, lgsOutreachQueue } from "@/db/schema/directoryEngine";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { lead_ids?: string[] };
    const leadIds = (body.lead_ids ?? []).filter(Boolean);

    if (leadIds.length === 0) {
      return NextResponse.json({ ok: false, error: "lead_ids_required" }, { status: 400 });
    }

    // Find message IDs for these leads first (needed for queue cascade)
    const messages = await db
      .select({ id: outreachMessages.id })
      .from(outreachMessages)
      .where(inArray(outreachMessages.leadId, leadIds));

    const messageIds = messages.map((m) => m.id);

    // Delete queue entries (FK → outreach_messages)
    if (messageIds.length > 0) {
      await db.delete(lgsOutreachQueue).where(inArray(lgsOutreachQueue.outreachMessageId, messageIds));
    }

    // Delete messages — lead reverts to message_status "none" automatically
    // (message_status is derived from outreach_messages, not stored on contractor_leads)
    const deleted = messageIds.length > 0
      ? await db.delete(outreachMessages).where(inArray(outreachMessages.id, messageIds)).returning({ id: outreachMessages.id })
      : [];

    return NextResponse.json({
      ok: true,
      data: {
        leads_processed: leadIds.length,
        messages_removed: deleted.length,
      },
    });
  } catch (err) {
    console.error("LGS messages remove error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "remove_failed" },
      { status: 500 }
    );
  }
}
