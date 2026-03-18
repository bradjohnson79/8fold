/**
 * LGS Outreach: Reject message (delete). Removes from queue first if queued.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { emailMessages, emailQueue } from "@/db/schema/directoryEngine";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: messageId } = await params;
    if (!messageId) {
      return NextResponse.json({ ok: false, error: "message_id_required" }, { status: 400 });
    }

    await db.delete(emailQueue).where(eq(emailQueue.messageId, messageId));
    const deleted = await db
      .delete(emailMessages)
      .where(eq(emailMessages.id, messageId))
      .returning({ id: emailMessages.id });

    return NextResponse.json({ ok: true, deleted: deleted.length > 0 });
  } catch (err) {
    console.error("LGS outreach reject error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "reject_failed" },
      { status: 500 }
    );
  }
}
