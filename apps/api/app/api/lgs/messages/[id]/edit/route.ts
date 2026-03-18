/**
 * LGS: Edit an outreach message subject and/or body.
 * PATCH /api/lgs/messages/[id]/edit
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { outreachMessages } from "@/db/schema/directoryEngine";
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
      .from(outreachMessages)
      .where(eq(outreachMessages.id, messageId))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ ok: false, error: "message_not_found" }, { status: 404 });
    }

    const newSubject = subject ?? (existing.subject ?? "");
    const newBody = msgBody ?? (existing.body ?? "");
    const hash = computeBodyHash(newBody);

    const [updated] = await db
      .update(outreachMessages)
      .set({
        subject: newSubject,
        body: newBody,
        messageHash: hash,
      })
      .where(eq(outreachMessages.id, messageId))
      .returning();

    return NextResponse.json({
      ok: true,
      data: {
        id: updated.id,
        subject: updated.subject,
        body: updated.body,
        status: updated.status,
      },
    });
  } catch (err) {
    console.error("LGS message edit error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "edit_failed" },
      { status: 500 }
    );
  }
}
