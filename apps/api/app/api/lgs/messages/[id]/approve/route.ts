/**
 * LGS: Approve outreach message → insert into lgs_outreach_queue.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { lgsOutreachQueue, outreachMessages } from "@/db/schema/directoryEngine";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: messageId } = await params;
    if (!messageId) {
      return NextResponse.json({ ok: false, error: "message_id_required" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as { priority?: number };
    const priority = typeof body.priority === "number" ? body.priority : 5;

    const [msg] = await db
      .select()
      .from(outreachMessages)
      .where(eq(outreachMessages.id, messageId))
      .limit(1);

    if (!msg) {
      return NextResponse.json({ ok: false, error: "message_not_found" }, { status: 404 });
    }

    if (msg.status !== "pending_review") {
      return NextResponse.json({ ok: false, error: "message_not_pending_review" }, { status: 400 });
    }

    const existing = await db
      .select({ id: lgsOutreachQueue.id })
      .from(lgsOutreachQueue)
      .where(eq(lgsOutreachQueue.outreachMessageId, messageId))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ ok: false, error: "already_queued" }, { status: 400 });
    }

    const [queued] = await db
      .insert(lgsOutreachQueue)
      .values({
        outreachMessageId: messageId,
        leadId: msg.leadId,
        priority,
        sendStatus: "pending",
        attempts: 0,
      })
      .returning();

    await db
      .update(outreachMessages)
      .set({
        status: "approved",
        reviewedAt: new Date(),
      })
      .where(eq(outreachMessages.id, messageId));

    return NextResponse.json({ ok: true, data: queued });
  } catch (err) {
    console.error("LGS messages approve error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "approve_failed" },
      { status: 500 }
    );
  }
}
