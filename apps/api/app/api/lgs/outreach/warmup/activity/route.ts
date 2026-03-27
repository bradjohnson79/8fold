import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { lgsWarmupActivity } from "@/db/schema/directoryEngine";
import { getWarmupEnabled } from "@/src/services/lgs/warmupConfigService";

export async function GET() {
  try {
    const warmupEnabled = await getWarmupEnabled();
    if (!warmupEnabled) {
      return NextResponse.json({ ok: true, data: [] });
    }

    const rows = await db
      .select()
      .from(lgsWarmupActivity)
      .orderBy(desc(lgsWarmupActivity.sentAt))
      .limit(50);

    const data = rows.map((r) => ({
      id: r.id,
      sender_email: r.senderEmail,
      recipient_email: r.recipientEmail,
      subject: r.subject,
      message_type: r.messageType,
      sent_at: r.sentAt?.toISOString() ?? null,
      status: r.status,
      error_message: r.errorMessage,
    }));

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("LGS warmup activity error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
