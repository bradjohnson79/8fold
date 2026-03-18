/**
 * LGS Outreach: Edit message subject/body, recompute hash.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { emailMessages } from "@/db/schema/directoryEngine";
import { computeBodyHash } from "@/src/services/lgs/outreachHashService";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: messageId } = await params;
    if (!messageId) {
      return NextResponse.json({ ok: false, error: "message_id_required" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as { subject?: string; body?: string };
    const subject = typeof body.subject === "string" ? body.subject.trim() : undefined;
    const msgBody = typeof body.body === "string" ? body.body.trim() : undefined;

    if (!subject && !msgBody) {
      return NextResponse.json({ ok: false, error: "subject_or_body_required" }, { status: 400 });
    }

    const [existing] = await db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.id, messageId))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ ok: false, error: "message_not_found" }, { status: 404 });
    }

    const newSubject = subject ?? existing.subject;
    const newBody = msgBody ?? existing.body;
    const hash = computeBodyHash(newBody);

    const [updated] = await db
      .update(emailMessages)
      .set({
        subject: newSubject,
        body: newBody,
        hash,
      })
      .where(eq(emailMessages.id, messageId))
      .returning();

    return NextResponse.json({ ok: true, data: updated });
  } catch (err) {
    console.error("LGS outreach edit error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "edit_failed" },
      { status: 500 }
    );
  }
}
