/**
 * LGS Outreach: Approve message → insert into email_queue with scheduled_time = NULL.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import {
  contractorContacts,
  emailMessages,
  emailQueue,
} from "@/db/schema/directoryEngine";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: messageId } = await params;
    if (!messageId) {
      return NextResponse.json({ ok: false, error: "message_id_required" }, { status: 400 });
    }

    const [msg] = await db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.id, messageId))
      .limit(1);

    if (!msg) {
      return NextResponse.json({ ok: false, error: "message_not_found" }, { status: 404 });
    }

    const [contact] = await db
      .select()
      .from(contractorContacts)
      .where(eq(contractorContacts.id, msg.contactId))
      .limit(1);

    if (!contact || contact.status === "invalid_email") {
      return NextResponse.json({ ok: false, error: "contact_invalid" }, { status: 400 });
    }

    const existing = await db
      .select({ id: emailQueue.id })
      .from(emailQueue)
      .where(eq(emailQueue.messageId, messageId))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ ok: false, error: "already_queued" }, { status: 400 });
    }

    const [queued] = await db
      .insert(emailQueue)
      .values({
        messageId,
        contactId: msg.contactId,
        senderAccount: null,
        scheduledTime: null,
        sendStatus: "pending",
        attempts: 0,
      })
      .returning();

    await db
      .update(emailMessages)
      .set({ approved: true })
      .where(eq(emailMessages.id, messageId));

    return NextResponse.json({ ok: true, data: queued });
  } catch (err) {
    console.error("LGS outreach approve error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "approve_failed" },
      { status: 500 }
    );
  }
}
