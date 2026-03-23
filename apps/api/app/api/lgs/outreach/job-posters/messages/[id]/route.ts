import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { jobPosterEmailMessages } from "@/db/schema/directoryEngine";
import { computeBodyHash } from "@/src/services/lgs/outreachHashService";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { subject?: string; body?: string };
    const subject = typeof body.subject === "string" ? body.subject.trim() : undefined;
    const messageBody = typeof body.body === "string" ? body.body.trim() : undefined;

    if (!subject && !messageBody) {
      return NextResponse.json({ ok: false, error: "subject_or_body_required" }, { status: 400 });
    }

    const [existing] = await db
      .select()
      .from(jobPosterEmailMessages)
      .where(eq(jobPosterEmailMessages.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ ok: false, error: "message_not_found" }, { status: 404 });
    }
    if (existing.status === "sent") {
      return NextResponse.json({ ok: false, error: "message_already_sent" }, { status: 409 });
    }

    const newBody = messageBody ?? (existing.body ?? "");
    const [updated] = await db
      .update(jobPosterEmailMessages)
      .set({
        subject: subject ?? (existing.subject ?? ""),
        body: newBody,
        messageHash: computeBodyHash(newBody),
        updatedAt: new Date(),
      })
      .where(eq(jobPosterEmailMessages.id, id))
      .returning();

    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    console.error("[Job Poster] Edit message error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
