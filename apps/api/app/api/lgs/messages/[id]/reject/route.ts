/**
 * LGS: Reject outreach message.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { outreachMessages } from "@/db/schema/directoryEngine";

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
      .from(outreachMessages)
      .where(eq(outreachMessages.id, messageId))
      .limit(1);

    if (!msg) {
      return NextResponse.json({ ok: false, error: "message_not_found" }, { status: 404 });
    }

    await db
      .update(outreachMessages)
      .set({
        status: "rejected",
        reviewedAt: new Date(),
      })
      .where(eq(outreachMessages.id, messageId));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("LGS messages reject error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "reject_failed" },
      { status: 500 }
    );
  }
}
